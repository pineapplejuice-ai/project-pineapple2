#!/usr/bin/env node
/**
 * Creates a demo hardware shop with realistic data by calling the running API, so every record
 * goes through the same validation, tax, stock and audit logic as real use.
 *   node scripts/seed-demo.mjs            (API at http://localhost:4000)
 *   API_URL=https://api.example.com DEMO_EMAIL=me@shop.in DEMO_PASSWORD=... node scripts/seed-demo.mjs
 */
const API = (process.env.API_URL ?? 'http://localhost:4000') + '/api/v1';
const email = process.env.DEMO_EMAIL ?? `demo${Date.now()}@nexbill.test`;
const password = process.env.DEMO_PASSWORD ?? 'Demo12345';
let token = '';

async function call(method, path, body) {
  const res = await fetch(API + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json)}`);
  return json;
}
const post = (p, b) => call('POST', p, b);
const gstin = (state, pan) => { // GSTIN with a valid check character
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', base = `${state}${pan}1Z`;
  let total = 0;
  for (let i = 0; i < 14; i++) { const p = chars.indexOf(base[i]) * (i % 2 === 0 ? 1 : 2); total += Math.floor(p / 36) + (p % 36); }
  return base + chars[(36 - (total % 36)) % 36];
};

token = (await post('/auth/register', { name: 'Ravi Kumar', email, password, businessName: 'Sri Lakshmi Hardware & Paints', stateCode: '29', phone: '9876543210' })).accessToken;
await call('PATCH', '/business', { ownerName: 'Ravi Kumar', industry: 'HARDWARE', addressLine1: '12, Market Road, Chickpet', city: 'Bengaluru', pincode: '560053', gstRegistered: true, gstin: gstin('29', 'AAPFS1234K'),
  pricesIncludeTax: false, invoiceTerms: 'Goods once sold will not be taken back without the bill.\nSubject to Bengaluru jurisdiction.', onboardingComplete: true });
const me = await call('GET', '/auth/me');
const branchId = me.branches[0].id, warehouseId = me.warehouses[0].id;
const units = Object.fromEntries((await call('GET', '/units')).map((u) => [u.code, u.id]));
const cat = {};
for (const name of ['MS Pipes & Sections', 'Plumbing', 'Electrical', 'Paints', 'Tools', 'Cement & Building']) cat[name] = (await post('/categories', { name })).id;

const supplier = await post('/suppliers', { name: 'Balaji Steel Traders', contactPerson: 'Suresh', phone: '9900112233', gstin: gstin('29', 'AABCB4321M') });
const supplier2 = await post('/suppliers', { name: 'Mumbai Paint Distributors', phone: '9820011223', gstin: gstin('27', 'AACCM9876P') });

const defs = [
  ['MS Square Pipe 40x40x2mm (6m)', 'MS Pipes & Sections', '7306', 18, 1150, 1420, 60, 'PCS', { steelShape: 'SHS', width: 40, thickness: 2, standardLength: 6, material: 'MS' }],
  ['MS Rectangular Pipe 50x25x2mm (6m)', 'MS Pipes & Sections', '7306', 18, 1080, 1340, 45, 'PCS', { steelShape: 'RHS', width: 50, height: 25, thickness: 2, standardLength: 6, material: 'MS' }],
  ['MS Angle 40x40x5mm', 'MS Pipes & Sections', '7216', 18, 62, 78, 800, 'KGS', { steelShape: 'ANGLE', width: 40, thickness: 5, material: 'MS' }],
  ['CPVC Pipe 1 inch (3m)', 'Plumbing', '3917', 18, 310, 395, 120, 'PCS', { material: 'CPVC' }],
  ['PVC Elbow 4 inch', 'Plumbing', '3917', 18, 42, 65, 300, 'PCS', { material: 'PVC' }],
  ['Brass Bib Cock 15mm', 'Plumbing', '8481', 18, 185, 260, 4, 'PCS', {}],
  ['Copper Wire 1.5 sq mm', 'Electrical', '8544', 18, 14, 19.5, 2700, 'MTR', {}],
  ['LED Bulb 9W', 'Electrical', '8539', 12, 58, 95, 150, 'PCS', {}],
  ['6A Modular Switch', 'Electrical', '8536', 18, 32, 55, 400, 'PCS', {}],
  ['Exterior Emulsion 20L', 'Paints', '3209', 18, 3900, 4850, 14, 'PCS', {}],
  ['Wood Primer 1L', 'Paints', '3208', 18, 180, 250, 3, 'PCS', {}],
  ['Claw Hammer 500g', 'Tools', '8205', 18, 210, 320, 25, 'PCS', {}],
  ['Cement OPC 53 Grade 50kg', 'Cement & Building', '2523', 28, 345, 410, 200, 'BAG', {}],
];
const products = [];
for (const [i, [name, category, hsnCode, gstRate, cost, price, stock, unit, attributes]] of defs.entries()) {
  const p = await post('/products', { name, categoryId: cat[category], hsnCode, gstRate, priceIncludesTax: false, baseUnitId: units[unit], attributes, supplierId: i < 3 ? supplier.id : null,
    units: name.startsWith('Copper Wire') ? [{ unitId: units.BOX, factorToBase: 90 }] : [],
    variants: [{ sellingPrice: price, purchasePrice: cost, openingStock: stock, minStock: unit === 'PCS' ? 5 : 0, reorderLevel: unit === 'PCS' ? 10 : 0, barcodes: [`89010${String(i).padStart(8, '0')}`] }] });
  products.push({ id: p.variants[0].id, price, name });
}

const customers = [];
for (const c of [{ name: 'Ramesh Constructions', phone: '9845012345', gstin: gstin('29', 'AAGCR5055K'), type: 'WHOLESALE', creditLimit: 200000, creditDays: 30 }, { name: 'Lakshmi Interiors', phone: '9741098765', creditLimit: 50000, creditDays: 15 },
  { name: 'Hyderabad Infra Projects', phone: '9000011122', gstin: gstin('36', 'AABCH7788L'), type: 'WHOLESALE', creditLimit: 500000, creditDays: 45 }, { name: 'Venkatesh (Plumber)', phone: '9632587410' }]) customers.push(await post('/customers', c));

// a purchase bill, then three weeks of sales
await post('/purchases/invoices', { supplierId: supplier.id, branchId, warehouseId, supplierInvoiceNo: 'BST/2291', items: [{ variantId: products[0].id, quantity: 40, unitCost: 1140 }, { variantId: products[2].id, quantity: 500, unitCost: 61 }], payment: { mode: 'BANK_TRANSFER', amount: 50000 } });
await post('/purchases/invoices', { supplierId: supplier2.id, branchId, warehouseId, supplierInvoiceNo: 'MPD-778', items: [{ variantId: products[9].id, quantity: 10, unitCost: 3850 }] });
await post('/purchases/orders', { supplierId: supplier.id, branchId, items: [{ variantId: products[1].id, quantity: 30, unitCost: 1075 }] });

let seed = 7;
const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
const modes = ['CASH', 'CASH', 'UPI', 'UPI', 'CARD'];
let count = 0;
for (let day = 20; day >= 0; day--) {
  const date = new Date(Date.now() - day * 86400000);
  for (let n = 0; n < 2 + rnd(4); n++) {
    const picks = [...new Set(Array.from({ length: 1 + rnd(3) }, () => rnd(products.length)))];
    const items = picks.map((i) => ({ variantId: products[i].id, quantity: [2, 6].includes(i) ? 5 + rnd(40) : 1 + rnd(4) }));
    const customer = rnd(3) === 0 ? customers[rnd(customers.length)] : null;
    const draft = await post('/sales/invoices', { status: 'DRAFT', branchId, warehouseId, customerId: customer?.id ?? null, items });
    const total = Number(draft.grandTotal);
    await post(`/sales/invoices/${draft.id}/discard-draft`);
    const credit = customer?.creditLimit && rnd(2) === 0;
    const payments = credit ? (rnd(2) ? [{ mode: 'UPI', amount: Math.floor(total / 2) }] : []) : [{ mode: modes[rnd(modes.length)], amount: total }];
    try { await post('/sales/invoices', { branchId, warehouseId, customerId: customer?.id ?? null, invoiceDate: date.toISOString(), items, payments: payments.filter((p) => p.amount > 0) }); count++; }
    catch (e) { if (!/INSUFFICIENT_STOCK|CREDIT_LIMIT/.test(e.message)) throw e; }
  }
}
const rent = (await call('GET', '/expense-categories')).find((c) => c.name === 'Rent');
await post('/expenses', { branchId, categoryId: rent.id, amount: 18000, mode: 'BANK_TRANSFER', payee: 'Building owner', note: 'Shop rent' });
const transport = (await call('GET', '/expense-categories')).find((c) => c.name === 'Transport');
await post('/expenses', { branchId, categoryId: transport.id, amount: 1250, mode: 'CASH', payee: 'Tempo', note: 'Steel delivery' });

console.log(`Demo shop ready with ${count} invoices.\n  Sign in at the web app with:\n  email:    ${email}\n  password: ${password}`);
