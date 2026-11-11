import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Api, bill, createProduct, createShop, gstinFor, Shop, startApi, stockOf } from './helpers';

let api: Api, shop: Shop;
beforeAll(async () => { api = await startApi(); shop = await createShop(api, { name: 'Sri Lakshmi Hardware' }); });
afterAll(async () => { await api.app.close(); });
const post = (path: string, body: unknown, token = shop.token) => api.call('post', path, token, body);

describe('invoice creation', () => {
  it('computes totals on the server, numbers sequentially and moves stock through the ledger', async () => {
    const pipe = await createProduct(api, shop, { name: 'MS Round Pipe 1 inch', price: 1000, gstRate: 18, stock: 100, cost: 700 });
    const cement = await createProduct(api, shop, { name: 'Cement 50kg', price: 420, gstRate: 28, stock: 40, inclusive: true, hsn: '2523', unit: 'BAG' });
    const res = await post('/sales/invoices', bill(shop, [{ variantId: pipe.variantId, quantity: 2 }, { variantId: cement.variantId, quantity: 3 }],
      { payments: [{ mode: 'CASH', amount: 2000 }, { mode: 'UPI', amount: 1620 }], grandTotal: 1, taxTotal: 0 })); // client totals are ignored
    expect(res.status).toBe(201);
    const inv = res.body;
    // pipe: 2000 + 18% = 2360; cement inclusive: 1260 => taxable 984.38, cgst/sgst 137.81 each = 1260.00
    expect(inv.taxableTotal).toBe('2984.38');
    expect(inv.cgstTotal).toBe('317.81');
    expect(inv.sgstTotal).toBe('317.81');
    expect(inv.igstTotal).toBe('0');
    expect(inv.grandTotal).toBe('3620');
    expect(inv.paymentStatus).toBe('PAID');
    expect(inv.docType).toBe('TAX_INVOICE');
    expect(inv.number).toMatch(/^INV\/\d{2}-\d{2}\/0001$/);
    expect(inv.payments).toHaveLength(2);
    expect(await stockOf(api, shop, pipe.variantId)).toBe(98);
    expect(await stockOf(api, shop, cement.variantId)).toBe(37);

    const next = await post('/sales/invoices', bill(shop, [{ variantId: pipe.variantId, quantity: 1 }], { payments: [{ mode: 'CARD', amount: 1180 }] }));
    expect(next.body.number).toMatch(/\/0002$/);

    const moves = (await api.call('get', `/inventory/movements?variantId=${pipe.variantId}`, shop.token)).body.data;
    expect(moves.map((m: { type: string }) => m.type)).toEqual(['SALE', 'SALE', 'OPENING']);
    expect(moves[0]).toMatchObject({ quantity: '-1', balanceAfter: '97', refType: 'SALES_INVOICE', refNumber: next.body.number });
    expect(moves[0].userName).toBe('Test Owner');
  });

  it('charges IGST for an inter-state B2B customer', async () => {
    const p = await createProduct(api, shop, { name: 'Angle 40x40', price: 1000, stock: 10 });
    const customer = (await post('/customers', { name: 'Mumbai Builders', gstin: gstinFor('27'), creditLimit: 100000, creditDays: 30 })).body;
    expect(customer.stateCode).toBe('27');
    const inv = (await post('/sales/invoices', bill(shop, [{ variantId: p.variantId, quantity: 1 }], { customerId: customer.id }))).body;
    expect(inv.supplyType).toBe('INTER_STATE');
    expect(inv.igstTotal).toBe('180');
    expect(inv.cgstTotal).toBe('0');
    expect(inv.paymentStatus).toBe('UNPAID');
    expect(inv.dueDate).toBeTruthy();
  });

  it('issues a bill of supply without tax for an unregistered business', async () => {
    const small = await createShop(api, { gstRegistered: false });
    const p = await createProduct(api, small, { name: 'Ice cream cup', price: 50, stock: 10, gstRate: 18, inclusive: true });
    const inv = (await api.call('post', '/sales/invoices', small.token, bill(small, [{ variantId: p.variantId, quantity: 2 }], { payments: [{ mode: 'CASH', amount: 100 }] }))).body;
    expect(inv.docType).toBe('BILL_OF_SUPPLY');
    expect(inv.taxTotal).toBe('0');
    expect(inv.grandTotal).toBe('100');
  });

  it('rejects invalid bills', async () => {
    const p = await createProduct(api, shop, { name: 'Paint 1L', price: 300, stock: 2 });
    const line = { variantId: p.variantId, quantity: 1 };
    expect((await post('/sales/invoices', bill(shop, []))).status).toBe(400);
    expect((await post('/sales/invoices', bill(shop, [{ ...line, quantity: -1 }]))).status).toBe(400);
    expect((await post('/sales/invoices', bill(shop, [line], { payments: [{ mode: 'CASH', amount: 100 }] }))).body.message).toMatch(/Walk-in/);
    expect((await post('/sales/invoices', bill(shop, [line], { payments: [{ mode: 'CASH', amount: 9999 }] }))).status).toBe(400);
    const oversell = await post('/sales/invoices', bill(shop, [{ ...line, quantity: 3 }], { payments: [{ mode: 'CASH', amount: 1062 }] }));
    expect(oversell.status).toBe(409);
    expect(oversell.body.code).toBe('INSUFFICIENT_STOCK');
    expect(await stockOf(api, shop, p.variantId)).toBe(2); // nothing leaked from the failed transaction
  });

  it('applies item and invoice discounts, alternate units and drafts', async () => {
    const wire = await createProduct(api, shop, { name: 'Copper wire 1.5 sqmm', price: 20, stock: 900, unit: 'MTR', extra: { units: [{ unitId: shop.units.BOX, factorToBase: 90 }] } });
    const draft = await post('/sales/invoices', bill(shop, [{ variantId: wire.variantId, quantity: 2, unitId: shop.units.BOX, discount: { type: 'PERCENT', value: 10 } }], { status: 'DRAFT', invoiceDiscount: { type: 'AMOUNT', value: 240 } }));
    expect(draft.status).toBe(201);
    expect(draft.body.number).toBeNull();
    expect(await stockOf(api, shop, wire.variantId)).toBe(900); // drafts never move stock
    // 2 boxes x 1800 = 3600, -10% = 3240, -240 = 3000 taxable, +18% = 3540
    expect(draft.body.taxableTotal).toBe('3000');
    const issued = await api.call('post', `/sales/invoices?draftId=${draft.body.id}`, shop.token,
      bill(shop, [{ variantId: wire.variantId, quantity: 2, unitId: shop.units.BOX, discount: { type: 'PERCENT', value: 10 } }], { invoiceDiscount: { type: 'AMOUNT', value: 240 }, payments: [{ mode: 'UPI', amount: 3540 }] }));
    expect(issued.status).toBe(201);
    expect(issued.body.grandTotal).toBe('3540');
    expect(issued.body.items[0]).toMatchObject({ unitCode: 'BOX', baseQuantity: '180' });
    expect(await stockOf(api, shop, wire.variantId)).toBe(720);
    expect((await api.call('get', `/sales/invoices/${draft.body.id}`, shop.token)).status).toBe(404);
  });

  it('sells batch-tracked stock first-expiry-first-out', async () => {
    const res = await post('/products', { name: 'Vanilla tub 1L', gstRate: 18, hsnCode: '2105', baseUnitId: shop.units.PCS, trackBatches: true, priceIncludesTax: true,
      variants: [{ sellingPrice: 250, purchasePrice: 150, openingStock: 5, openingBatchNo: 'B-LATE', openingExpiry: '2027-06-30' }] });
    const variantId = res.body.variants[0].id as string;
    const supplier = (await post('/suppliers', { name: 'Dairy Fresh' })).body;
    await post('/purchases/invoices', { supplierId: supplier.id, branchId: shop.branchId, warehouseId: shop.warehouseId, items: [{ variantId, quantity: 4, unitCost: 160, batchNo: 'B-EARLY', expiryDate: '2026-12-31' }] });
    await post('/sales/invoices', bill(shop, [{ variantId, quantity: 6 }], { payments: [{ mode: 'CASH', amount: 1500 }] }));
    const batches = (await api.call('get', `/inventory/batches?variantId=${variantId}`, shop.token)).body as Array<{ batchNo: string; quantity: string }>;
    expect(batches).toHaveLength(1);
    expect(batches[0]).toMatchObject({ batchNo: 'B-LATE', quantity: '3' }); // early batch (4) consumed first, then 2 of the late one
  });
});

describe('concurrency and idempotency', () => {
  it('never oversells and never duplicates or skips invoice numbers under concurrent billing', async () => {
    const s = await createShop(api);
    const p = await createProduct(api, s, { name: 'Last ten taps', price: 100, stock: 10 });
    const results = await Promise.all(Array.from({ length: 25 }, () =>
      api.call('post', '/sales/invoices', s.token, bill(s, [{ variantId: p.variantId, quantity: 1 }], { payments: [{ mode: 'CASH', amount: 118 }] }))));
    const ok = results.filter((r) => r.status === 201), rejected = results.filter((r) => r.status === 409);
    expect(ok).toHaveLength(10);
    expect(rejected).toHaveLength(15);
    expect(await stockOf(api, s, p.variantId)).toBe(0);
    const numbers = ok.map((r) => Number(String(r.body.number).split('/').pop())).sort((x, y) => x - y);
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]); // unique and gapless despite 15 rollbacks
    const ledger = await api.prisma.tenantTx(s.tenantId, (tx) => tx.stockMovement.aggregate({ where: { variantId: p.variantId }, _sum: { quantity: true } }));
    expect(Number(ledger._sum.quantity)).toBe(0); // ledger sum always equals the balance
  });

  it('creates exactly one invoice for a retried or concurrently duplicated idempotency key', async () => {
    const p = await createProduct(api, shop, { name: 'Offline synced item', price: 100, stock: 50 });
    const body = bill(shop, [{ variantId: p.variantId, quantity: 2 }], { idempotencyKey: `offline-${Date.now()}-abc`, payments: [{ mode: 'CASH', amount: 236 }] });
    const results = await Promise.all(Array.from({ length: 6 }, () => post('/sales/invoices', body)));
    expect(results.map((r) => `${r.status} ${r.body.message ?? ""}`).filter((x) => !x.startsWith("201"))).toEqual([]);
    expect(new Set(results.map((r) => r.body.id)).size).toBe(1);
    const retry = await post('/sales/invoices', body);
    expect(retry.body.replayed).toBe(true);
    expect(retry.body.id).toBe(results[0]!.body.id);
    expect(await stockOf(api, shop, p.variantId)).toBe(48);
    const payments = await api.prisma.tenantTx(shop.tenantId, (tx) => tx.paymentAllocation.count({ where: { salesInvoiceId: retry.body.id } }));
    expect(payments).toBe(1);
  });
});

describe('customer credit and payments', () => {
  it('tracks dues, partial payments, advances and the credit limit', async () => {
    const p = await createProduct(api, shop, { name: 'PVC pipe 4 inch', price: 1000, stock: 100 });
    const customer = (await post('/customers', { name: 'Ramesh Constructions', phone: '9845012345', creditLimit: 3000, creditDays: 15 })).body;
    const sale = (qty: number, paid = 0) => post('/sales/invoices', bill(shop, [{ variantId: p.variantId, quantity: qty }], { customerId: customer.id, payments: paid ? [{ mode: 'CASH', amount: paid }] : [] }));
    const balance = async () => (await api.call('get', `/customers/${customer.id}/ledger`, shop.token)).body.customer.balance;

    const inv1 = (await sale(2, 360)).body; // 2360 total, 360 paid
    expect(inv1.paymentStatus).toBe('PARTIAL');
    expect(await balance()).toBe('2000');
    const blocked = await sale(1); // would take the due to 3180 > 3000
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('CREDIT_LIMIT');

    expect((await post('/payments/receive', { branchId: shop.branchId, invoiceId: inv1.id, amount: 5000, mode: 'UPI' })).status).toBe(400);
    const part = await post('/payments/receive', { branchId: shop.branchId, invoiceId: inv1.id, amount: 1500, mode: 'UPI', reference: 'UTR123' });
    expect(part.status).toBe(201);
    expect((await api.call('get', `/sales/invoices/${inv1.id}`, shop.token)).body).toMatchObject({ paymentStatus: 'PARTIAL', paidAmount: '1860', balanceDue: '500.00' });

    // on-account receipt: settles the oldest due and keeps the remainder as an advance
    const onAccount = await post('/payments/receive', { branchId: shop.branchId, customerId: customer.id, amount: 800, mode: 'BANK_TRANSFER' });
    expect(onAccount.body.advance).toBe('300');
    expect((await api.call('get', `/sales/invoices/${inv1.id}`, shop.token)).body.paymentStatus).toBe('PAID');
    expect(await balance()).toBe('-300');

    const ledger = (await api.call('get', `/customers/${customer.id}/ledger`, shop.token)).body;
    expect(ledger.rows.map((r: { type: string }) => r.type)).toEqual(['Invoice', 'Receipt (CASH)', 'Receipt (UPI)', 'Receipt (BANK_TRANSFER)']);
    expect(ledger.closing).toBe('-300.00');
  });
});

describe('sales returns, refunds and cancellation', () => {
  it('handles partial returns, restores stock once and blocks over-returns and duplicate refunds', async () => {
    const p = await createProduct(api, shop, { name: 'LED bulb 9W', price: 100, stock: 20 });
    const inv = (await post('/sales/invoices', bill(shop, [{ variantId: p.variantId, quantity: 5 }], { payments: [{ mode: 'CASH', amount: 590 }] }))).body;
    const itemId = inv.items[0].id as string;
    expect(await stockOf(api, shop, p.variantId)).toBe(15);

    expect((await post('/sales/returns', { invoiceId: inv.id, items: [{ invoiceItemId: itemId, quantity: 2 }], refundAmount: 100, refundMode: 'CASH' })).body.message).toMatch(/refunded in full/);
    const key = `ret-${Date.now()}-xyz`;
    const ret = await post('/sales/returns', { idempotencyKey: key, invoiceId: inv.id, reason: 'Wrong wattage', items: [{ invoiceItemId: itemId, quantity: 2 }], refundAmount: 236, refundMode: 'CASH' });
    expect(ret.status).toBe(201);
    expect(ret.body).toMatchObject({ total: '236', taxableTotal: '200', cgstTotal: '18', sgstTotal: '18', refundAmount: '236' });
    expect(ret.body.number).toMatch(/^CN\//);
    expect(await stockOf(api, shop, p.variantId)).toBe(17);

    // the same request retried must not refund or restock twice
    const again = await post('/sales/returns', { idempotencyKey: key, invoiceId: inv.id, items: [{ invoiceItemId: itemId, quantity: 2 }], refundAmount: 236, refundMode: 'CASH' });
    expect(again.body.id).toBe(ret.body.id);
    expect(await stockOf(api, shop, p.variantId)).toBe(17);

    const over = await post('/sales/returns', { invoiceId: inv.id, items: [{ invoiceItemId: itemId, quantity: 4 }], refundAmount: 472, refundMode: 'CASH' });
    expect(over.status).toBe(409);
    expect(over.body.code).toBe('RETURN_EXCEEDS_SOLD');

    // damaged item: comes back and is written off, so sellable stock does not change
    const damaged = await post('/sales/returns', { invoiceId: inv.id, items: [{ invoiceItemId: itemId, quantity: 1, condition: 'DAMAGED' }], refundAmount: 118, refundMode: 'UPI' });
    expect(damaged.status).toBe(201);
    expect(await stockOf(api, shop, p.variantId)).toBe(17);

    const after = (await api.call('get', `/sales/invoices/${inv.id}`, shop.token)).body;
    expect(after).toMatchObject({ returnedAmount: '354', paidAmount: '236', paymentStatus: 'PAID' });
    expect(after.items[0].returnedQty).toBe('3');
    expect((await post(`/sales/invoices/${inv.id}/cancel`, { reason: 'has returns', refundMode: 'CASH' })).status).toBe(409);

    // two concurrent returns for the last 2 units: only one can win
    const race = await Promise.all([1, 2].map(() => post('/sales/returns', { invoiceId: inv.id, items: [{ invoiceItemId: itemId, quantity: 2 }], refundAmount: 236, refundMode: 'CASH' })));
    expect(race.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await stockOf(api, shop, p.variantId)).toBe(19);
  });

  it('cancels an invoice by reversing stock, refunding and keeping the record', async () => {
    const p = await createProduct(api, shop, { name: 'Door hinge', price: 50, stock: 10 });
    const inv = (await post('/sales/invoices', bill(shop, [{ variantId: p.variantId, quantity: 4 }], { payments: [{ mode: 'CASH', amount: 236 }] }))).body;
    expect((await post(`/sales/invoices/${inv.id}/cancel`, { reason: 'Billed by mistake' })).status).toBe(400); // walk-in needs a refund mode
    const cancelled = await post(`/sales/invoices/${inv.id}/cancel`, { reason: 'Billed by mistake', refundMode: 'CASH' });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body).toMatchObject({ status: 'CANCELLED', number: inv.number, cancelReason: 'Billed by mistake', paidAmount: '0' });
    expect(await stockOf(api, shop, p.variantId)).toBe(10);
    expect((await post(`/sales/invoices/${inv.id}/cancel`, { reason: 'again', refundMode: 'CASH' })).status).toBe(409);
    const audit = (await api.call('get', '/audit-logs?q=invoice.cancel', shop.token)).body.data;
    expect(audit[0]).toMatchObject({ action: 'invoice.cancel', entityId: inv.id, userName: 'Test Owner' });
    // the cancelled number is not reused
    const next = (await post('/sales/invoices', bill(shop, [{ variantId: p.variantId, quantity: 1 }], { payments: [{ mode: 'CASH', amount: 59 }] }))).body;
    expect(next.number).not.toBe(inv.number);
  });
});

describe('purchase workflow', () => {
  it('runs PO -> partial GRNs -> bill -> payment, moving stock exactly once and averaging cost', async () => {
    const p = await createProduct(api, shop, { name: 'Wall putty 20kg', price: 900, cost: 600, stock: 10, unit: 'BAG' });
    const supplier = (await post('/suppliers', { name: 'Birla Distributors', gstin: gstinFor('29', 'AAACB1234C') })).body;
    const po = (await post('/purchases/orders', { supplierId: supplier.id, branchId: shop.branchId, items: [{ variantId: p.variantId, quantity: 30, unitCost: 700 }] })).body;
    expect(po.number).toMatch(/^PO\//);
    const poItemId = po.items[0].id as string;

    const grn1 = await post('/purchases/receipts', { purchaseOrderId: po.id, warehouseId: shop.warehouseId, items: [{ poItemId, quantity: 10 }] });
    expect(grn1.status).toBe(201);
    expect(await stockOf(api, shop, p.variantId)).toBe(20);
    expect((await post('/purchases/receipts', { purchaseOrderId: po.id, warehouseId: shop.warehouseId, items: [{ poItemId, quantity: 25 }] })).status).toBe(409);
    const grn2 = await post('/purchases/receipts', { purchaseOrderId: po.id, warehouseId: shop.warehouseId, items: [{ poItemId, quantity: 20 }] });
    expect(await stockOf(api, shop, p.variantId)).toBe(40);
    const orders = (await api.call('get', '/purchases/orders', shop.token)).body.data;
    expect(orders.find((o: { id: string }) => o.id === po.id).status).toBe('RECEIVED');

    // moving average: (10 x 600 + 30 x 700) / 40 = 675
    const variant = (await api.call('get', `/products/${p.productId}`, shop.token)).body.variants[0];
    expect(variant.avgCost).toBe('675');

    const billBody = { supplierId: supplier.id, branchId: shop.branchId, warehouseId: shop.warehouseId, supplierInvoiceNo: 'BD/991', goodsReceiptId: grn2.body.id, items: [{ variantId: p.variantId, quantity: 20, unitCost: 700 }], payment: { mode: 'BANK_TRANSFER', amount: 6520 } };
    const pinv = await post('/purchases/invoices', billBody);
    expect(pinv.status).toBe(201);
    expect(pinv.body).toMatchObject({ taxableTotal: '14000', cgstTotal: '1260', sgstTotal: '1260', grandTotal: '16520', paymentStatus: 'PARTIAL' });
    expect(await stockOf(api, shop, p.variantId)).toBe(40); // billed against the GRN: stock not received twice
    expect((await post('/purchases/invoices', { ...billBody, supplierInvoiceNo: 'BD/992' })).status).toBe(409); // GRN already billed
    expect((await post('/purchases/invoices', billBody)).status).toBe(409); // duplicate supplier bill number

    const pay = await post('/payments/pay-supplier', { branchId: shop.branchId, supplierId: supplier.id, amount: 4000, mode: 'UPI' });
    expect(pay.status).toBe(201);
    const ledger = (await api.call('get', `/suppliers/${supplier.id}/ledger`, shop.token)).body;
    expect(ledger.closing).toBe('6000.00');

    const ret = await post('/purchases/returns', { invoiceId: pinv.body.id, reason: 'Damaged bags', items: [{ invoiceItemId: pinv.body.items[0].id, quantity: 5 }] });
    expect(ret.status).toBe(201);
    expect(ret.body).toMatchObject({ total: '4130', taxableTotal: '3500' });
    expect(ret.body.number).toMatch(/^DN\//);
    expect(await stockOf(api, shop, p.variantId)).toBe(35);
    expect((await api.call('get', `/suppliers/${supplier.id}/ledger`, shop.token)).body.closing).toBe('1870.00');
  });
});

describe('inventory operations', () => {
  it('adjusts, counts and transfers stock with reservations and approval', async () => {
    const p = await createProduct(api, shop, { name: 'Tile adhesive', price: 400, stock: 30, minStock: 5 });
    expect((await post('/inventory/adjust', { warehouseId: shop.warehouseId, variantId: p.variantId, quantity: 4, type: 'DAMAGE', note: 'Water damage' })).body.balance).toBe('26');
    expect((await post('/inventory/adjust', { warehouseId: shop.warehouseId, variantId: p.variantId, quantity: -100, type: 'ADJUSTMENT', note: 'too many' })).status).toBe(409);
    const count = await post('/inventory/stock-count', { warehouseId: shop.warehouseId, items: [{ variantId: p.variantId, countedQty: 24 }] });
    expect(count.body.results[0]).toMatchObject({ book: '26', counted: '24', difference: '-2' });

    const branch = await post('/branches', { name: 'Godown Branch', code: 'GDN' });
    expect(branch.status).toBe(201);
    const warehouses = (await api.call('get', '/warehouses', shop.token)).body as Array<{ id: string; branchId: string }>;
    const other = warehouses.find((w) => w.branchId === branch.body.id)!;
    const transfer = await post('/inventory/transfers', { fromWarehouseId: shop.warehouseId, toWarehouseId: other.id, items: [{ variantId: p.variantId, quantity: 20 }] });
    expect(transfer.status).toBe(201);
    // 20 of 24 are reserved: only 4 can be sold until the transfer is decided
    const tooMany = await post('/sales/invoices', bill(shop, [{ variantId: p.variantId, quantity: 5 }], { payments: [{ mode: 'CASH', amount: 2360 }] }));
    expect(tooMany.status).toBe(409);
    const decisions = await Promise.all([1, 2].map(() => post(`/inventory/transfers/${transfer.body.id}/approve`, {})));
    expect(decisions.map((d) => d.status).sort()).toEqual([201, 409]);
    const rows = await api.prisma.tenantTx(shop.tenantId, (tx) => tx.inventoryBalance.findMany({ where: { variantId: p.variantId } }));
    expect(Object.fromEntries(rows.map((r) => [r.warehouseId, `${r.quantity}/${r.reserved}`]))).toEqual({ [shop.warehouseId]: '4/0', [other.id]: '20/0' });
    const lowStock = (await api.call('get', '/notifications', shop.token)).body;
    expect(lowStock.items.some((n: { type: string }) => n.type === 'LOW_STOCK')).toBe(true);
  });
});

describe('reports are computed from records', () => {
  it('reconciles dashboard, profit and GST reports with the transactions of a fresh shop', async () => {
    const s = await createShop(api);
    const call = (path: string) => api.call('get', path, s.token);
    const p = await createProduct(api, s, { name: 'Report widget', price: 1000, cost: 600, stock: 10, hsn: '8481' });
    const b2b = (await api.call('post', '/customers', s.token, { name: 'Registered Buyer', gstin: gstinFor('29', 'AAACR5055K') })).body;
    await api.call('post', '/sales/invoices', s.token, bill(s, [{ variantId: p.variantId, quantity: 2 }], { payments: [{ mode: 'CASH', amount: 2360 }] }));
    const credit = (await api.call('post', '/sales/invoices', s.token, bill(s, [{ variantId: p.variantId, quantity: 1 }], { customerId: b2b.id }))).body;
    await api.call('post', '/sales/returns', s.token, { invoiceId: credit.id, items: [{ invoiceItemId: credit.items[0].id, quantity: 1 }] });
    const cats = (await call('/expense-categories')).body as Array<{ id: string; name: string }>;
    await api.call('post', '/expenses', s.token, { branchId: s.branchId, categoryId: cats.find((c) => c.name === 'Rent')!.id, amount: 300, mode: 'CASH' });

    const profit = (await call('/reports/profit')).body.data;
    // revenue = 3000 sold - 1000 returned; COGS = 3 x 600 - 600; gross = 800; net = 800 - 300
    expect(profit).toMatchObject({ revenue: '2000.00', costOfGoodsSold: '1200.00', grossProfit: '800.00', expenses: '300.00', estimatedNetProfit: '500.00', moneyIn: '2360.00', moneyOut: '300.00' });

    const dash = (await call('/dashboard')).body;
    expect(dash.today).toMatchObject({ invoices: 2, revenue: '2360' });
    expect(dash.period).toMatchObject({ grossProfit: '800.00', estimatedNetProfit: '500.00' });
    expect(dash.receivables).toBe('0');
    expect(dash.inventoryValue).toBe('4800'); // 8 units left at 600
    expect(dash.paymentBreakdown).toEqual([{ mode: 'CASH', count: 1, amount: '2360' }]);
    expect(dash.topProducts[0]).toMatchObject({ name: 'Report widget', quantity: '3' });

    const gstr1 = (await call('/reports/gstr1')).body.data;
    expect(gstr1.b2b).toHaveLength(1);
    expect(gstr1.b2b[0]).toMatchObject({ gstin: b2b.gstin, taxable: '1000', cgst: '90', sgst: '90' });
    expect(gstr1.b2cs[0]).toMatchObject({ placeOfSupply: '29', taxable: '2000' });
    expect(gstr1.creditNotes[0]).toMatchObject({ section: 'CDNR', taxable: '1000' });
    expect(gstr1.hsn[0]).toMatchObject({ hsnCode: '8481', quantity: '3', taxable: '3000' });
    expect(gstr1.documents).toMatchObject({ total: 2, cancelled: 0 });
    const g3b = (await call('/reports/gstr3b')).body.data;
    expect(g3b.outwardTaxable).toMatchObject({ taxable: '2000.00', cgst: '180.00', sgst: '180.00' });

    const csv = await call('/reports/sales-register?format=csv');
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.text.split('\n')).toHaveLength(3);
  });

  it('enforces plan limits and blocks writes when the subscription has lapsed', async () => {
    const s = await createShop(api);
    await api.prisma.subscription.update({ where: { tenantId: s.tenantId }, data: { plan: 'STARTER' } });
    const blocked = await api.call('post', '/branches', s.token, { name: 'Second', code: 'B2' });
    expect(blocked.status).toBe(402);
    expect(blocked.body.code).toBe('PLAN_FEATURE');
    await api.prisma.subscription.update({ where: { tenantId: s.tenantId }, data: { status: 'EXPIRED' } });
    expect((await api.call('post', '/customers', s.token, { name: 'Late' })).body.code).toBe('SUBSCRIPTION_INACTIVE');
    expect((await api.call('get', '/customers', s.token)).status).toBe(200); // data stays readable
    const upgraded = await api.call('post', '/subscription/change-plan', s.token, { plan: 'GROWTH' });
    expect(upgraded.body).toMatchObject({ plan: 'GROWTH', status: 'ACTIVE' });
    expect((await api.call('post', '/customers', s.token, { name: 'Back in business' })).status).toBe(201);
  });
});
