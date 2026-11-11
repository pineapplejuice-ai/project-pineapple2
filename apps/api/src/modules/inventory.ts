import { BadRequestException, ConflictException, Controller, Get, Injectable, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Prisma, type StockMovementType } from '@nexbill/database';
import { D } from '@nexbill/shared';
import { listQuery, stockAdjustSchema, stockCountSchema, stockTransferSchema, type ListQuery } from '@nexbill/validation';
import Decimal from 'decimal.js';
import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import { AuditService, NotificationService, SequenceService } from '../common/core.services';
import { assertBranchAccess, Can, Ctx, CurrentCtx } from '../common/context';
import { dateRange, page, skipTake } from '../common/http';
import { PrismaService, Tx } from '../common/prisma.service';
import { ApiZod, ZBody, ZQuery } from '../common/zod';

export interface MoveInput {
  warehouseId: string; variantId: string;
  /** signed quantity in base units: positive = inward */
  quantity: Decimal.Value;
  type: StockMovementType; refType: string; refId?: string | null; refNumber?: string | null;
  unitCost?: Decimal.Value; batchId?: string | null; note?: string | null;
  allowNegative?: boolean;
}

/**
 * The only code path that changes stock. Each change is one atomic `UPDATE ... RETURNING` on the
 * balance row (so concurrent bills serialise on the row lock and can never oversell) plus one
 * immutable ledger row that records the source document, the user and the resulting balance.
 */
@Injectable()
export class StockService {
  constructor(private readonly notifications: NotificationService) {}

  async move(tx: Tx, ctx: Ctx, m: MoveInput): Promise<Decimal> {
    const qty = D(m.quantity);
    if (qty.isZero()) throw new BadRequestException('Stock movement quantity cannot be zero');
    const rows = await tx.$queryRaw<Array<{ quantity: Prisma.Decimal; reserved: Prisma.Decimal }>>`
      INSERT INTO "InventoryBalance" ("id", "tenantId", "businessId", "warehouseId", "variantId", "quantity", "reserved", "updatedAt")
      VALUES (${randomUUID()}::uuid, ${ctx.tenantId}::uuid, ${ctx.businessId}::uuid, ${m.warehouseId}::uuid, ${m.variantId}::uuid, ${qty.toString()}::numeric, 0, now())
      ON CONFLICT ("warehouseId", "variantId")
      DO UPDATE SET "quantity" = "InventoryBalance"."quantity" + EXCLUDED."quantity", "updatedAt" = now()
      RETURNING "quantity", "reserved"`;
    const balance = D(rows[0]!.quantity.toString());
    const available = balance.minus(D(rows[0]!.reserved.toString()));
    if (qty.isNegative() && !m.allowNegative && available.isNegative()) {
      const v = await tx.productVariant.findUnique({ where: { id: m.variantId }, select: { sku: true, product: { select: { name: true } } } });
      throw new ConflictException({
        message: `Not enough stock for ${v?.product.name ?? 'item'} (${v?.sku ?? ''}). Available: ${available.minus(qty).toString()}`,
        code: 'INSUFFICIENT_STOCK', variantId: m.variantId,
      });
    }
    if (m.batchId) {
      const updated = await tx.$executeRaw`UPDATE "Batch" SET "quantity" = "quantity" + ${qty.toString()}::numeric
        WHERE "id" = ${m.batchId}::uuid AND "warehouseId" = ${m.warehouseId}::uuid AND "variantId" = ${m.variantId}::uuid AND "quantity" + ${qty.toString()}::numeric >= 0`;
      if (updated !== 1) throw new ConflictException({ message: 'Not enough stock in the selected batch', code: 'INSUFFICIENT_BATCH_STOCK' });
    }
    await tx.stockMovement.create({
      data: {
        tenantId: ctx.tenantId, businessId: ctx.businessId, warehouseId: m.warehouseId, variantId: m.variantId, batchId: m.batchId ?? null,
        type: m.type, quantity: qty.toString(), balanceAfter: balance.toString(), unitCost: D(m.unitCost ?? 0).toString(),
        refType: m.refType, refId: m.refId ?? null, refNumber: m.refNumber ?? null, note: m.note ?? null, userId: ctx.userId,
      },
    });
    return balance;
  }

  /** Outward movement for batch-tracked items: explicit batch, else first-expiry-first-out. Returns the first batch used. */
  async moveOut(tx: Tx, ctx: Ctx, m: MoveInput & { trackBatches: boolean }): Promise<{ balance: Decimal; batchId: string | null }> {
    const qty = D(m.quantity).abs();
    if (!m.trackBatches || m.batchId) return { balance: await this.move(tx, ctx, { ...m, quantity: qty.neg() }), batchId: m.batchId ?? null };
    const batches = await tx.$queryRaw<Array<{ id: string; quantity: Prisma.Decimal }>>`
      SELECT "id", "quantity" FROM "Batch" WHERE "warehouseId" = ${m.warehouseId}::uuid AND "variantId" = ${m.variantId}::uuid AND "quantity" > 0
      ORDER BY "expiryDate" ASC NULLS LAST, "createdAt" ASC FOR UPDATE`;
    let remaining = qty, balance = D(0), first: string | null = null;
    for (const b of batches) {
      if (remaining.lte(0)) break;
      const take = Decimal.min(remaining, D(b.quantity.toString()));
      balance = await this.move(tx, ctx, { ...m, quantity: take.neg(), batchId: b.id });
      first ??= b.id; remaining = remaining.minus(take);
    }
    if (remaining.gt(0)) balance = await this.move(tx, ctx, { ...m, quantity: remaining.neg(), batchId: null });
    return { balance, batchId: first };
  }

  /** Finds or creates the batch that an inward movement should be booked against. */
  async ensureBatch(tx: Tx, ctx: Ctx, b: { warehouseId: string; variantId: string; batchNo: string; expiryDate?: string | Date | null; costPrice?: Decimal.Value }): Promise<string> {
    const key = { warehouseId_variantId_batchNo: { warehouseId: b.warehouseId, variantId: b.variantId, batchNo: b.batchNo } };
    const batch = await tx.batch.upsert({
      where: key, update: {},
      create: { tenantId: ctx.tenantId, businessId: ctx.businessId, warehouseId: b.warehouseId, variantId: b.variantId, batchNo: b.batchNo,
        expiryDate: b.expiryDate ? new Date(b.expiryDate) : null, costPrice: D(b.costPrice ?? 0).toString() },
    });
    return batch.id;
  }

  /** Moving-average cost: called before stock is added, with the incoming quantity and unit cost. */
  async updateAvgCost(tx: Tx, variantId: string, inQty: Decimal.Value, unitCost: Decimal.Value): Promise<void> {
    const [agg, v] = await Promise.all([
      tx.inventoryBalance.aggregate({ where: { variantId }, _sum: { quantity: true } }),
      tx.productVariant.findUniqueOrThrow({ where: { id: variantId }, select: { avgCost: true } }),
    ]);
    const onHand = Decimal.max(D(agg._sum.quantity?.toString() ?? 0), 0);
    const total = onHand.plus(D(inQty));
    const avg = total.isZero() ? D(unitCost) : onHand.mul(D(v.avgCost.toString())).plus(D(inQty).mul(D(unitCost))).div(total);
    await tx.productVariant.update({ where: { id: variantId }, data: { avgCost: avg.toDecimalPlaces(4).toString(), purchasePrice: D(unitCost).toString() } });
  }

  async alertIfLow(tx: Tx, ctx: Ctx, variantId: string, balance: Decimal): Promise<void> {
    const v = await tx.productVariant.findUnique({ where: { id: variantId }, select: { minStock: true, sku: true, product: { select: { name: true } } } });
    if (!v || D(v.minStock.toString()).isZero() || balance.gt(D(v.minStock.toString()))) return;
    await this.notifications.raise(tx, ctx, {
      type: 'LOW_STOCK', title: 'Low stock', body: `${v.product.name} (${v.sku}) is down to ${balance.toString()}`,
      entity: 'ProductVariant', entityId: variantId, dedupeKey: `low:${variantId}:${new Date().toISOString().slice(0, 10)}`,
    });
  }

  async warehouse(tx: Tx, ctx: Ctx, id: string) {
    const w = await tx.warehouse.findFirst({ where: { id, businessId: ctx.businessId, isActive: true } });
    if (!w) throw new NotFoundException('Warehouse not found');
    assertBranchAccess(ctx, w.branchId);
    return w;
  }
}

@ApiTags('inventory') @ApiBearerAuth()
@Controller('inventory')
export class InventoryController {
  constructor(private readonly prisma: PrismaService, private readonly stock: StockService, private readonly audit: AuditService, private readonly seq: SequenceService) {}

  @Get('stock') @Can('inventory.view')
  stockList(@CurrentCtx() ctx: Ctx, @ZQuery(listQuery) q: ListQuery, @Query('warehouseId') warehouseId?: string, @Query('low') low?: string) {
    return this.prisma.tenantTx(ctx.tenantId, async (tx) => {
      const wh = warehouseId && /^[0-9a-f-]{36}$/i.test(warehouseId) ? Prisma.sql`AND b."warehouseId" = ${warehouseId}::uuid` : Prisma.empty;
      const search = q.q ? Prisma.sql`AND (p."name" ILIKE ${'%' + q.q + '%'} OR v."sku" ILIKE ${'%' + q.q + '%'})` : Prisma.empty;
      const having = low === 'true' ? Prisma.sql`HAVING COALESCE(SUM(b."quantity"), 0) <= GREATEST(v."minStock", v."reorderLevel") AND GREATEST(v."minStock", v."reorderLevel") > 0` : Prisma.empty;
      const base = Prisma.sql`
        FROM "ProductVariant" v JOIN "Product" p ON p."id" = v."productId" JOIN "Unit" u ON u."id" = p."baseUnitId"
        LEFT JOIN "InventoryBalance" b ON b."variantId" = v."id" ${wh}
        WHERE v."businessId" = ${ctx.businessId}::uuid AND p."trackInventory" AND v."isActive" AND p."type" <> 'SERVICE' ${search}
        GROUP BY v."id", p."id", u."code" ${having}`;
      const rows = await tx.$queryRaw<Array<Record<string, unknown>>>`
        SELECT v."id" AS "variantId", p."id" AS "productId", p."name", v."name" AS "variantName", v."sku", u."code" AS "unit",
               v."minStock", v."reorderLevel", v."avgCost", v."sellingPrice",
               COALESCE(SUM(b."quantity"), 0) AS "quantity", COALESCE(SUM(b."reserved"), 0) AS "reserved",
               COALESCE(SUM(b."quantity"), 0) * v."avgCost" AS "value"
        ${base} ORDER BY p."name", v."name" LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`;
      const count = await tx.$queryRaw<Array<{ n: bigint }>>`SELECT COUNT(*) AS n FROM (SELECT 1 ${base}) t`;
      const showCost = ctx.permissions.includes('products.view_cost');
      return page(rows.map((r) => (showCost ? r : { ...r, avgCost: null, value: null })), Number(count[0]!.n), q);
    });
  }

  @Get('movements') @Can('inventory.view')
  movements(@CurrentCtx() ctx: Ctx, @ZQuery(listQuery) q: ListQuery, @Query('variantId') variantId?: string, @Query('warehouseId') warehouseId?: string) {
    return this.prisma.tenantTx(ctx.tenantId, async (tx) => {
      const where: Prisma.StockMovementWhereInput = { businessId: ctx.businessId, variantId: variantId || undefined, warehouseId: warehouseId || undefined, createdAt: dateRange(q.from, q.to) };
      const [rows, total] = await Promise.all([tx.stockMovement.findMany({ where, orderBy: { createdAt: 'desc' }, ...skipTake(q) }), tx.stockMovement.count({ where })]);
      const [variants, users, whs] = await Promise.all([
        tx.productVariant.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.variantId))] } }, select: { id: true, sku: true, name: true, product: { select: { name: true } } } }),
        tx.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.userId))] } }, select: { id: true, name: true } }),
        tx.warehouse.findMany({ where: { businessId: ctx.businessId }, select: { id: true, name: true } }),
      ]);
      const vm = new Map(variants.map((v) => [v.id, v])), um = new Map(users.map((u) => [u.id, u.name])), wm = new Map(whs.map((w) => [w.id, w.name]));
      return page(rows.map((r) => ({ ...r, productName: [vm.get(r.variantId)?.product.name, vm.get(r.variantId)?.name].filter(Boolean).join(' – '), sku: vm.get(r.variantId)?.sku, userName: um.get(r.userId), warehouseName: wm.get(r.warehouseId) })), total, q);
    });
  }

  @Post('adjust') @Can('inventory.manage') @ApiZod(stockAdjustSchema)
  adjust(@CurrentCtx() ctx: Ctx, @ZBody(stockAdjustSchema) body: z.infer<typeof stockAdjustSchema>) {
    return this.prisma.tenantTx(ctx.tenantId, async (tx) => {
      await this.stock.warehouse(tx, ctx, body.warehouseId);
      const variant = await tx.productVariant.findFirst({ where: { id: body.variantId, businessId: ctx.businessId }, include: { product: true } });
      if (!variant) throw new NotFoundException('Product not found');
      if (!variant.product.trackInventory) throw new BadRequestException('Stock is not tracked for this product');
      let qty = D(body.quantity);
      if ((body.type === 'DAMAGE' || body.type === 'WASTAGE') && qty.gt(0)) qty = qty.neg(); // write-offs always reduce stock
      if (body.type === 'OPENING' && qty.lt(0)) throw new BadRequestException('Opening stock cannot be negative');
      const balance = await this.stock.move(tx, ctx, { warehouseId: body.warehouseId, variantId: body.variantId, quantity: qty, type: body.type, refType: 'ADJUSTMENT', note: body.note, batchId: body.batchId, unitCost: variant.avgCost.toString() });
      await this.audit.log(tx, ctx, 'stock.adjust', 'ProductVariant', variant.id, { summary: `${body.type} ${qty.toString()} – ${body.note}`, after: { balance: balance.toString() } });
      if (qty.lt(0)) await this.stock.alertIfLow(tx, ctx, variant.id, balance);
      return { balance: balance.toString() };
    });
  }

  /** Physical stock verification: posts the difference between counted and book quantity through the ledger. */
  @Post('stock-count') @Can('inventory.manage') @ApiZod(stockCountSchema)
  stockCount(@CurrentCtx() ctx: Ctx, @ZBody(stockCountSchema) body: z.infer<typeof stockCountSchema>) {
    return this.prisma.tenantTx(ctx.tenantId, async (tx) => {
      await this.stock.warehouse(tx, ctx, body.warehouseId);
      const countId = randomUUID();
      const results: Array<{ variantId: string; book: string; counted: string; difference: string }> = [];
      for (const item of body.items) {
        const locked = await tx.$queryRaw<Array<{ quantity: Prisma.Decimal }>>`SELECT "quantity" FROM "InventoryBalance" WHERE "warehouseId" = ${body.warehouseId}::uuid AND "variantId" = ${item.variantId}::uuid FOR UPDATE`;
        if (!(await tx.productVariant.findFirst({ where: { id: item.variantId, businessId: ctx.businessId }, select: { id: true } }))) throw new NotFoundException('Product not found');
        const book = D(locked[0]?.quantity.toString() ?? 0), diff = D(item.countedQty).minus(book);
        if (!diff.isZero()) await this.stock.move(tx, ctx, { warehouseId: body.warehouseId, variantId: item.variantId, quantity: diff, type: 'STOCK_COUNT', refType: 'STOCK_COUNT', refId: countId, note: body.note ?? 'Physical stock verification', allowNegative: true });
        results.push({ variantId: item.variantId, book: book.toString(), counted: String(item.countedQty), difference: diff.toString() });
      }
      await this.audit.log(tx, ctx, 'stock.count', 'Warehouse', body.warehouseId, { summary: `${results.filter((r) => r.difference !== '0').length} of ${results.length} items differed`, after: results });
      return { id: countId, results };
    });
  }

  @Get('transfers') @Can('inventory.view')
  transfers(@CurrentCtx() ctx: Ctx, @ZQuery(listQuery) q: ListQuery) {
    return this.prisma.tenantTx(ctx.tenantId, async (tx) => {
      const where = { businessId: ctx.businessId, status: (q.status as 'PENDING') || undefined };
      const [rows, total] = await Promise.all([tx.stockTransfer.findMany({ where, include: { items: true }, orderBy: { createdAt: 'desc' }, ...skipTake(q) }), tx.stockTransfer.count({ where })]);
      return page(rows, total, q);
    });
  }

  /** Creating a transfer reserves the stock at the source so it cannot be sold while awaiting approval. */
  @Post('transfers') @Can('inventory.manage') @ApiZod(stockTransferSchema)
  createTransfer(@CurrentCtx() ctx: Ctx, @ZBody(stockTransferSchema) body: z.infer<typeof stockTransferSchema>) {
    return this.prisma.tenantTx(ctx.tenantId, async (tx) => {
      await this.stock.warehouse(tx, ctx, body.fromWarehouseId);
      if (!(await tx.warehouse.findFirst({ where: { id: body.toWarehouseId, businessId: ctx.businessId, isActive: true } }))) throw new NotFoundException('Destination warehouse not found');
      const biz = await tx.business.findUniqueOrThrow({ where: { id: ctx.businessId } });
      const { number } = await this.seq.next(tx, ctx, 'STOCK_TRANSFER', 'TRF', new Date(), biz.fyStartMonth);
      for (const i of body.items) {
        const ok = await tx.$executeRaw`UPDATE "InventoryBalance" SET "reserved" = "reserved" + ${i.quantity}::numeric, "updatedAt" = now()
          WHERE "warehouseId" = ${body.fromWarehouseId}::uuid AND "variantId" = ${i.variantId}::uuid AND "quantity" - "reserved" >= ${i.quantity}::numeric`;
        if (ok !== 1) throw new ConflictException({ message: 'Not enough free stock at the source warehouse for one of the items', code: 'INSUFFICIENT_STOCK', variantId: i.variantId });
      }
      const t = await tx.stockTransfer.create({
        data: { tenantId: ctx.tenantId, businessId: ctx.businessId, number, fromWarehouseId: body.fromWarehouseId, toWarehouseId: body.toWarehouseId, note: body.note, requestedById: ctx.userId,
          items: { create: body.items.map((i) => ({ tenantId: ctx.tenantId, variantId: i.variantId, quantity: i.quantity })) } },
        include: { items: true },
      });
      await this.audit.log(tx, ctx, 'transfer.create', 'StockTransfer', t.id, { summary: number });
      return t;
    });
  }

  @Post('transfers/:id/:decision(approve|reject)') @Can('inventory.approve_transfer')
  decideTransfer(@CurrentCtx() ctx: Ctx, @Param('id', ParseUUIDPipe) id: string, @Param('decision') decision: 'approve' | 'reject') {
    return this.prisma.tenantTx(ctx.tenantId, async (tx) => {
      // claim the transfer first: only one concurrent decision can flip PENDING
      const claimed = await tx.stockTransfer.updateMany({ where: { id, businessId: ctx.businessId, status: 'PENDING' }, data: { status: decision === 'approve' ? 'COMPLETED' : 'REJECTED', approvedById: ctx.userId, approvedAt: new Date() } });
      if (claimed.count !== 1) throw new ConflictException('This transfer has already been processed');
      const t = await tx.stockTransfer.findUniqueOrThrow({ where: { id }, include: { items: true } });
      for (const i of t.items) {
        await tx.$executeRaw`UPDATE "InventoryBalance" SET "reserved" = "reserved" - ${i.quantity.toString()}::numeric WHERE "warehouseId" = ${t.fromWarehouseId}::uuid AND "variantId" = ${i.variantId}::uuid`;
        if (decision === 'approve') {
          const ref = { refType: 'STOCK_TRANSFER', refId: t.id, refNumber: t.number, variantId: i.variantId };
          const left = await this.stock.move(tx, ctx, { ...ref, warehouseId: t.fromWarehouseId, quantity: D(i.quantity.toString()).neg(), type: 'TRANSFER_OUT' });
          await this.stock.alertIfLow(tx, ctx, i.variantId, left);
          await this.stock.move(tx, ctx, { ...ref, warehouseId: t.toWarehouseId, quantity: i.quantity.toString(), type: 'TRANSFER_IN' });
        }
      }
      await this.audit.log(tx, ctx, `transfer.${decision}`, 'StockTransfer', id, { summary: t.number });
      return tx.stockTransfer.findUniqueOrThrow({ where: { id }, include: { items: true } });
    });
  }

  @Get('batches') @Can('inventory.view')
  batches(@CurrentCtx() ctx: Ctx, @Query('expiringInDays') days?: string, @Query('variantId') variantId?: string, @Query('warehouseId') warehouseId?: string) {
    return this.prisma.tenantTx(ctx.tenantId, async (tx) => {
      const until = days ? new Date(Date.now() + Math.min(Number(days) || 30, 3650) * 86400000) : undefined;
      const rows = await tx.batch.findMany({
        where: { businessId: ctx.businessId, quantity: { gt: 0 }, variantId: variantId || undefined, warehouseId: warehouseId || undefined, ...(until ? { expiryDate: { lte: until } } : {}) },
        orderBy: [{ expiryDate: 'asc' }], take: 500,
      });
      const variants = await tx.productVariant.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.variantId))] } }, select: { id: true, sku: true, name: true, product: { select: { name: true } } } });
      const vm = new Map(variants.map((v) => [v.id, v]));
      return rows.map((r) => ({ ...r, productName: [vm.get(r.variantId)?.product.name, vm.get(r.variantId)?.name].filter(Boolean).join(' – '), sku: vm.get(r.variantId)?.sku, expired: !!r.expiryDate && r.expiryDate < new Date() }));
    });
  }
}
