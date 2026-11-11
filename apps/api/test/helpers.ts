import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { json } from 'express';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { PrismaService } from '../src/common/prisma.service';

export interface Api {
  app: INestApplication; prisma: PrismaService;
  call(method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string, token?: string, body?: unknown, headers?: Record<string, string>): Promise<request.Response>;
}

export async function startApi(): Promise<Api> {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = mod.createNestApplication({ bodyParser: false });
  app.use(json({ limit: '2mb' }));
  configureApp(app);
  await app.init();
  const server = app.getHttpServer();
  return {
    app, prisma: app.get(PrismaService),
    call: (method, path, token, body, headers = {}) => {
      let r = request(server)[method](`/api/v1${path}`).set(headers);
      if (token) r = r.set('authorization', `Bearer ${token}`);
      return body === undefined ? r : r.send(body as object);
    },
  };
}

let n = 0;
export interface Shop {
  token: string; email: string; password: string; tenantId: string; businessId: string; branchId: string; warehouseId: string; units: Record<string, string>;
}

/** Registers a fresh tenant (GST-registered in Karnataka unless told otherwise) and returns handles to its defaults. */
export async function createShop(api: Api, opts: { gstRegistered?: boolean; name?: string } = {}): Promise<Shop> {
  const email = `owner${++n}_${Date.now()}@example.com`, password = 'Str0ngPass123';
  const reg = await api.call('post', '/auth/register', undefined, { name: 'Test Owner', email, password, businessName: opts.name ?? `Shop ${n}`, stateCode: '29' });
  if (reg.status !== 201) throw new Error(`register failed: ${JSON.stringify(reg.body)}`);
  const token = reg.body.accessToken as string;
  if (opts.gstRegistered !== false) {
    const upd = await api.call('patch', '/business', token, { gstRegistered: true, gstin: '29AAPFU0939F1ZW'.slice(0, 14) + check('29AAPFU0939F1Z'), stateCode: '29', pricesIncludeTax: false });
    if (upd.status !== 200) throw new Error(`business update failed: ${JSON.stringify(upd.body)}`);
  }
  const me = (await api.call('get', '/auth/me', token)).body;
  const units = (await api.call('get', '/units', token)).body as Array<{ id: string; code: string }>;
  return { token, email, password, tenantId: me.tenantId, businessId: me.businessId, branchId: me.branches[0].id, warehouseId: me.warehouses[0].id, units: Object.fromEntries(units.map((u) => [u.code, u.id])) };
}

import { gstinCheckDigit } from '@nexbill/shared';
const check = (first14: string): string => gstinCheckDigit(first14);
export const gstinFor = (state: string, pan = 'ABCDE1234F'): string => { const b = `${state}${pan}1Z`; return b + gstinCheckDigit(b); };

export interface TestProduct { productId: string; variantId: string; sku: string }
export async function createProduct(api: Api, shop: Shop, p: { name: string; price: number; cost?: number; gstRate?: number; stock?: number; inclusive?: boolean; hsn?: string; minStock?: number; unit?: string; extra?: Record<string, unknown>; variantExtra?: Record<string, unknown> }): Promise<TestProduct> {
  const res = await api.call('post', '/products', shop.token, {
    name: p.name, gstRate: p.gstRate ?? 18, hsnCode: p.hsn ?? '7306', priceIncludesTax: p.inclusive ?? false, baseUnitId: shop.units[p.unit ?? 'PCS'], ...p.extra,
    variants: [{ sellingPrice: p.price, purchasePrice: p.cost ?? p.price * 0.7, openingStock: p.stock ?? 0, minStock: p.minStock ?? 0, ...p.variantExtra }],
  });
  if (res.status !== 201) throw new Error(`product create failed: ${JSON.stringify(res.body)}`);
  return { productId: res.body.id, variantId: res.body.variants[0].id, sku: res.body.variants[0].sku };
}

export async function stockOf(api: Api, shop: Shop, variantId: string): Promise<number> {
  const rows = await api.prisma.tenantTx(shop.tenantId, (tx) => tx.inventoryBalance.findMany({ where: { variantId } }));
  return rows.reduce((a, r) => a + Number(r.quantity), 0);
}

export const bill = (shop: Shop, items: Array<Record<string, unknown>>, extra: Record<string, unknown> = {}) =>
  ({ branchId: shop.branchId, warehouseId: shop.warehouseId, items, ...extra });
