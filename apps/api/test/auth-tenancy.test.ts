import { PrismaClient } from '@nexbill/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Api, bill, createProduct, createShop, Shop, startApi, TestProduct } from './helpers';

let api: Api;
beforeAll(async () => { api = await startApi(); });
afterAll(async () => { await api.app.close(); });

describe('authentication', () => {
  it('registers, rejects duplicates and weak passwords, and logs in', async () => {
    const shop = await createShop(api);
    expect((await api.call('post', '/auth/register', undefined, { name: 'X Y', email: shop.email, password: 'Str0ngPass123', businessName: 'Dup' })).status).toBe(409);
    expect((await api.call('post', '/auth/register', undefined, { name: 'X Y', email: 'weak@example.com', password: 'short', businessName: 'Weak' })).status).toBe(400);
    expect((await api.call('post', '/auth/login', undefined, { email: shop.email, password: 'wrong-password1' })).status).toBe(401);
    const ok = await api.call('post', '/auth/login', undefined, { email: shop.email, password: shop.password });
    expect(ok.status).toBe(200);
    expect(ok.headers['set-cookie']?.[0]).toMatch(/nb_rt=.*HttpOnly/);
    const me = await api.call('get', '/auth/me', ok.body.accessToken);
    expect(me.body.user.email).toBe(shop.email);
    expect(me.body.permissions).toContain('sales.create');
    expect(me.body.subscription.status).toBe('TRIALING');
  });

  it('requires authentication and rejects forged tokens', async () => {
    expect((await api.call('get', '/products')).status).toBe(401);
    expect((await api.call('get', '/products', 'not.a.token')).status).toBe(401);
  });

  it('rotates refresh tokens and revokes the session when an old one is replayed', async () => {
    const shop = await createShop(api);
    const login = await api.call('post', '/auth/login', undefined, { email: shop.email, password: shop.password });
    const first = login.body.refreshToken as string;
    const r1 = await api.call('post', '/auth/refresh', undefined, { refreshToken: first });
    expect(r1.status).toBe(200);
    expect(r1.body.refreshToken).not.toBe(first);
    // replaying the rotated-out token is treated as theft: the whole session dies
    expect((await api.call('post', '/auth/refresh', undefined, { refreshToken: first })).status).toBe(401);
    expect((await api.call('post', '/auth/refresh', undefined, { refreshToken: r1.body.refreshToken })).status).toBe(401);
    expect((await api.call('get', '/auth/me', r1.body.accessToken)).status).toBe(401);
  });

  it('needs the CSRF header when the refresh token arrives as a cookie', async () => {
    const shop = await createShop(api);
    const login = await api.call('post', '/auth/login', undefined, { email: shop.email, password: shop.password });
    const cookie = String(login.headers['set-cookie']?.[0]).split(';')[0]!;
    expect((await api.call('post', '/auth/refresh', undefined, {}, { cookie })).status).toBe(403);
    expect((await api.call('post', '/auth/refresh', undefined, {}, { cookie, 'x-nexbill-csrf': '1' })).status).toBe(200);
  });

  it('resets a password with a single-use token and signs out other sessions', async () => {
    const shop = await createShop(api);
    const forgot = await api.call('post', '/auth/forgot-password', undefined, { email: shop.email });
    const unknown = await api.call('post', '/auth/forgot-password', undefined, { email: 'nobody@example.com' });
    expect(unknown.body.message).toBe(forgot.body.message); // no account enumeration
    const token = forgot.body.devResetToken as string;
    expect((await api.call('post', '/auth/reset-password', undefined, { token, password: 'NewPassw0rd99' })).status).toBe(200);
    expect((await api.call('post', '/auth/reset-password', undefined, { token, password: 'Another0ne99' })).status).toBe(400);
    expect((await api.call('get', '/auth/me', shop.token)).status).toBe(401);
    expect((await api.call('post', '/auth/login', undefined, { email: shop.email, password: 'NewPassw0rd99' })).status).toBe(200);
  });

  it('locks the account after repeated failures', async () => {
    const shop = await createShop(api);
    for (let i = 0; i < 5; i++) await api.call('post', '/auth/login', undefined, { email: shop.email, password: 'bad-password1' });
    expect((await api.call('post', '/auth/login', undefined, { email: shop.email, password: shop.password })).status).toBe(403);
  });
});

describe('tenant isolation', () => {
  let a: Shop, b: Shop, productA: TestProduct, customerA: string, invoiceA: string;
  beforeAll(async () => {
    a = await createShop(api, { name: 'Alpha Hardware' });
    b = await createShop(api, { name: 'Beta Traders' });
    productA = await createProduct(api, a, { name: 'Alpha secret pipe', price: 500, stock: 50 });
    customerA = (await api.call('post', '/customers', a.token, { name: 'Alpha customer', phone: '9876543210' })).body.id;
    invoiceA = (await api.call('post', '/sales/invoices', a.token, bill(a, [{ variantId: productA.variantId, quantity: 1 }], { payments: [{ mode: 'CASH', amount: 590 }] }))).body.id;
    expect(invoiceA).toBeTruthy();
  });

  it('never lists another tenant\'s records', async () => {
    for (const path of ['/products', '/customers', '/sales/invoices', '/inventory/stock', '/inventory/movements', '/payments', '/audit-logs']) {
      const res = await api.call('get', path, b.token);
      expect(res.status, path).toBe(200);
      expect(JSON.stringify(res.body), path).not.toContain('Alpha');
      if (path !== '/audit-logs') expect(res.body.total, path).toBe(0); // B has its own audit rows
    }
    expect((await api.call('get', '/catalog/sellable?q=Alpha', b.token)).body).toEqual([]);
    expect((await api.call('get', '/dashboard', b.token)).body.period.sales).toBe('0');
  });

  it('returns 404 for direct access to another tenant\'s ids', async () => {
    expect((await api.call('get', `/products/${productA.productId}`, b.token)).status).toBe(404);
    expect((await api.call('get', `/sales/invoices/${invoiceA}`, b.token)).status).toBe(404);
    expect((await api.call('get', `/customers/${customerA}/ledger`, b.token)).status).toBe(404);
    expect((await api.call('put', `/customers/${customerA}`, b.token, { name: 'Hijacked' })).status).toBe(404);
    expect((await api.call('post', `/sales/invoices/${invoiceA}/cancel`, b.token, { reason: 'malicious' })).status).toBe(404);
  });

  it('ignores a client-supplied business id from another tenant', async () => {
    const res = await api.call('get', '/products', b.token, undefined, { 'x-business-id': a.businessId });
    expect(res.status).toBe(403);
  });

  it('refuses to bill, stock or pay against another tenant\'s ids', async () => {
    expect((await api.call('post', '/sales/invoices', b.token, bill(b, [{ variantId: productA.variantId, quantity: 1 }], { payments: [{ mode: 'CASH', amount: 590 }] }))).status).toBe(400);
    expect((await api.call('post', '/sales/invoices', b.token, { ...bill(b, [{ variantId: productA.variantId, quantity: 1 }]), warehouseId: a.warehouseId, branchId: a.branchId })).status).toBe(404);
    expect((await api.call('post', '/inventory/adjust', b.token, { warehouseId: b.warehouseId, variantId: productA.variantId, quantity: 5, type: 'ADJUSTMENT', note: 'cross tenant' })).status).toBe(404);
    expect((await api.call('post', '/payments/receive', b.token, { branchId: b.branchId, invoiceId: invoiceA, amount: 1, mode: 'CASH' })).status).toBe(404);
    expect((await api.call('post', '/sales/returns', b.token, { invoiceId: invoiceA, items: [{ invoiceItemId: invoiceA, quantity: 1 }] })).status).toBe(404);
  });

  it('is enforced by PostgreSQL row-level security even if application filters are forgotten', async () => {
    // no tenant context at all: the app role sees nothing
    expect(await api.prisma.product.count()).toBe(0);
    expect(await api.prisma.salesInvoice.count()).toBe(0);
    // inside tenant B's context an unfiltered query still cannot see tenant A
    const seen = await api.prisma.tenantTx(b.tenantId, (tx) => tx.product.findMany());
    expect(seen.every((p) => p.tenantId === b.tenantId)).toBe(true);
    expect(await api.prisma.tenantTx(b.tenantId, (tx) => tx.product.findUnique({ where: { id: productA.productId } }))).toBeNull();
    // and cannot write rows into, or modify rows of, tenant A
    await expect(api.prisma.tenantTx(b.tenantId, (tx) => tx.customer.create({ data: { tenantId: a.tenantId, businessId: a.businessId, name: 'planted' } }))).rejects.toThrow();
    const updated = await api.prisma.tenantTx(b.tenantId, (tx) => tx.product.updateMany({ where: { id: productA.productId }, data: { name: 'hijacked' } }));
    expect(updated.count).toBe(0);
  });

  it('keeps the stock ledger and audit log append-only, and issued invoices undeletable', async () => {
    const owner = new PrismaClient({ datasources: { db: { url: (process.env.DATABASE_URL ?? '').replace('nexbill_app:nexbill_app', 'nexbill_owner:nexbill') } } });
    try {
      await expect(owner.$executeRaw`UPDATE "StockMovement" SET "quantity" = 999`).rejects.toThrow(/append-only/);
      await expect(owner.$executeRaw`DELETE FROM "AuditLog"`).rejects.toThrow(/append-only/);
      await expect(owner.$executeRaw`DELETE FROM "SalesInvoice" WHERE "id" = ${invoiceA}::uuid`).rejects.toThrow(/cannot be deleted/);
    } finally { await owner.$disconnect(); }
  });
});

describe('permissions are enforced on the server', () => {
  it('limits what a billing operator and a read-only user can do', async () => {
    const shop = await createShop(api);
    const product = await createProduct(api, shop, { name: 'Hammer', price: 200, stock: 20 });
    const roles = (await api.call('get', '/roles', shop.token)).body as Array<{ id: string; systemKey: string }>;
    const add = async (key: string, email: string) => {
      const r = await api.call('post', '/staff', shop.token, { name: 'Staff Member', email, password: 'Staffpass123', roleId: roles.find((x) => x.systemKey === key)!.id });
      expect(r.status).toBe(201);
      return (await api.call('post', '/auth/login', undefined, { email, password: 'Staffpass123' })).body.accessToken as string;
    };
    const cashier = await add('BILLING_OPERATOR', `cashier_${Date.now()}@example.com`);
    const viewer = await add('READ_ONLY', `viewer_${Date.now()}@example.com`);
    const line = { variantId: product.variantId, quantity: 1 };

    const sale = await api.call('post', '/sales/invoices', cashier, bill(shop, [line], { payments: [{ mode: 'CASH', amount: 236 }] }));
    expect(sale.status).toBe(201);
    expect(sale.body.items[0].costPrice).toBeNull(); // purchase cost hidden without products.view_cost
    expect((await api.call('post', '/sales/invoices', cashier, bill(shop, [{ ...line, unitPrice: 1 }], { payments: [{ mode: 'CASH', amount: 1 }] }))).status).toBe(403);
    expect((await api.call('post', '/sales/invoices', cashier, bill(shop, [{ ...line, discount: { type: 'PERCENT', value: 50 } }]))).status).toBe(403);
    expect((await api.call('post', `/sales/invoices/${sale.body.id}/cancel`, cashier, { reason: 'trying' })).status).toBe(403);
    expect((await api.call('get', '/reports/profit', cashier)).status).toBe(403);
    expect((await api.call('get', '/staff', cashier)).status).toBe(403);
    expect((await api.call('post', '/products', cashier, {})).status).toBe(403);

    expect((await api.call('get', '/sales/invoices', viewer)).status).toBe(200);
    expect((await api.call('post', '/sales/invoices', viewer, bill(shop, [line]))).status).toBe(403);
    expect((await api.call('post', '/inventory/adjust', viewer, { warehouseId: shop.warehouseId, variantId: product.variantId, quantity: 5, type: 'ADJUSTMENT', note: 'nope' })).status).toBe(403);

    // staff cannot escalate: a cashier cannot manage roles, the owner role cannot be assigned
    expect((await api.call('post', '/staff', shop.token, { name: 'Second Owner', email: 'o2@example.com', password: 'Staffpass123', roleId: roles.find((x) => x.systemKey === 'OWNER')!.id })).status).toBe(403);
  });
});
