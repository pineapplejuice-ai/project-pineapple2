import { BadRequestException, ConflictException, Controller, Get, HttpCode, Injectable, NotFoundException, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@nexbill/database';
import { computeInvoice, D, paymentStatus, round, supplyType } from '@nexbill/shared';
import { goodsReceiptSchema, listQuery, purchaseInvoiceSchema, purchaseOrderSchema, purchaseReturnSchema, type ListQuery } from '@nexbill/validation';
import type { z } from 'zod';
import { AuditService, SequenceService } from '../common/core.services';
import { assertBranchAccess, Can, Ctx, CurrentCtx } from '../common/context';
import { dateRange, page, skipTake } from '../common/http';
import { PrismaService, Tx } from '../common/prisma.service';
import { ApiZod, ZBody, ZQuery } from '../common/zod';
import { SubscriptionService } from './business';
import { StockService } from './inventory';

@Injectable()
export class PurchaseService {
  constructor(private readonly stock: StockService, private readonly seq: SequenceService, private readonly audit: AuditService) {}

  async variants(tx: Tx, ctx: Ctx, ids: string[]) {
    const rows = await tx.productVariant.findMany({ where: { id: { in: ids }, businessId: ctx.businessId }, include: { product: true } });
    if (rows.length !== new Set(ids).size) throw new BadRequestException('Unknown product on the document');
    return new Map(rows.map((v) => [v.id, v]));
  }

  /** Books stock inward for one purchase line: average cost first, then the ledger movement. */
  async receive(tx: Tx, ctx: Ctx, line: { warehouseId: string; variantId: string; quantity: string; unitCost: string; batchNo?: string | null; expiryDate?: string | null },
    ref: { refType: string; refId: string; refNumber: string }, product: { trackInventory: boolean; trackBatches: boolean; type: string }): Promise<void> {
    if (!product.trackInventory || product.type !== 'GOODS') return;
    await this.stock.updateAvgCost(tx, line.variantId, line.quantity, line.unitCost);
    const batchId = product.trackBatches && line.batchNo ? await this.stock.ensureBatch(tx, ctx, { ...line, batchNo: line.batchNo, costPrice: line.unitCost }) : null;
    await this.stock.move(tx, ctx, { warehouseId: line.warehouseId, variantId: line.variantId, quantity: line.quantity, type: 'PURCHASE', unitCost: line.unitCost, batchId, ...ref });
  }

  async createOrder(tx: Tx, ctx: Ctx, input: z.infer<typeof purchaseOrderSchema>) {
    assertBranchAccess(ctx, input.branchId);
    if (!(await tx.branch.findFirst({ where: { id: input.branchId, businessId: ctx.businessId } }))) throw new NotFoundException('Branch not found');
    const supplier = await tx.supplier.findFirst({ where: { id: input.supplierId, businessId: ctx.businessId } });
    if (!supplier) throw new NotFoundException('Supplier not found');
    const vm = await this.variants(tx, ctx, input.items.map((i) => i.variantId));
    const biz = await tx.business.findUniqueOrThrow({ where: { id: ctx.businessId } });
    const { number } = await this.seq.next(tx, ctx, 'PURCHASE_ORDER', 'PO', new Date(), biz.fyStartMonth);
    const items = input.items.map((i) => {
      const v = vm.get(i.variantId)!;
      return { tenantId: ctx.tenantId, variantId: i.variantId, description: v.name ? `${v.product.name} – ${v.name}` : v.product.name, quantity: i.quantity, unitCost: i.unitCost, gstRate: i.gstRate ?? v.product.gstRate.toString() };
    });
    const total = items.reduce((a, i) => a.plus(D(i.quantity).mul(D(i.unitCost)).mul(D(100).plus(D(supplier.gstin ? i.gstRate : 0))).div(100)), D(0));
    const po = await tx.purchaseOrder.create({
      data: { tenantId: ctx.tenantId, businessId: ctx.businessId, branchId: input.branchId, number, supplierId: supplier.id, expectedDate: input.expectedDate ? new Date(input.expectedDate) : null,
        notes: input.notes, total: round(total).toString(), createdById: ctx.userId, items: { create: items } }, include: { items: true },
    });
    await this.audit.log(tx, ctx, 'purchase_order.create', 'PurchaseOrder', po.id, { summary: `${number} · ${supplier.name}` });
    return po;
  }

  /** Goods received note against a purchase order; supports partial deliveries. */
  async createReceipt(tx: Tx, ctx: Ctx, input: z.infer<typeof goodsReceiptSchema>) {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "PurchaseOrder" WHERE "id" = ${input.purchaseOrderId}::uuid AND "businessId" = ${ctx.businessId}::uuid FOR UPDATE`;
    if (!locked.length) throw new NotFoundException('Purchase order not found');
    const po = await tx.purchaseOrder.findUniqueOrThrow({ where: { id: input.purchaseOrderId }, include: { items: true } });
    if (po.status === 'CANCELLED' || po.status === 'RECEIVED' || po.status === 'DRAFT') throw new ConflictException(`Purchase order is ${po.status.toLowerCase().replace('_', ' ')}`);
    await this.stock.warehouse(tx, ctx, input.warehouseId);
    if (new Set(input.items.map((i) => i.poItemId)).size !== input.items.length) throw new BadRequestException('Each order line can appear only once');
    const biz = await tx.business.findUniqueOrThrow({ where: { id: ctx.businessId } });
    const { number } = await this.seq.next(tx, ctx, 'GOODS_RECEIPT', 'GRN', new Date(), biz.fyStartMonth);
    const vm = await this.variants(tx, ctx, po.items.map((i) => i.variantId));
    const lines = input.items.map((ri) => {
      const item = po.items.find((i) => i.id === ri.poItemId);
      if (!item) throw new BadRequestException('Line is not on this purchase order');
      const pending = D(item.quantity.toString()).minus(D(item.receivedQty.toString()));
      if (D(ri.quantity).gt(pending)) throw new ConflictException(`Only ${pending.toString()} of ${item.description} is pending`);
      return { ri, item };
    });
    const grn = await tx.goodsReceipt.create({
      data: { tenantId: ctx.tenantId, businessId: ctx.businessId, number, purchaseOrderId: po.id, supplierId: po.supplierId, warehouseId: input.warehouseId, notes: input.notes, createdById: ctx.userId,
        items: { create: lines.map(({ ri, item }) => ({ tenantId: ctx.tenantId, poItemId: item.id, variantId: item.variantId, quantity: ri.quantity, unitCost: item.unitCost, batchNo: ri.batchNo, expiryDate: ri.expiryDate ? new Date(ri.expiryDate) : null })) } },
      include: { items: true },
    });
    for (const { ri, item } of [...lines].sort((a, b) => a.item.variantId.localeCompare(b.item.variantId))) {
      await tx.purchaseOrderItem.update({ where: { id: item.id }, data: { receivedQty: { increment: ri.quantity } } });
      await this.receive(tx, ctx, { warehouseId: input.warehouseId, variantId: item.variantId, quantity: ri.quantity, unitCost: item.unitCost.toString(), batchNo: ri.batchNo, expiryDate: ri.expiryDate },
        { refType: 'GOODS_RECEIPT', refId: grn.id, refNumber: number }, vm.get(item.variantId)!.product);
    }
    const after = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId: po.id } });
    const done = after.every((i) => D(i.receivedQty.toString()).gte(D(i.quantity.toString())));
    await tx.purchaseOrder.update({ where: { id: po.id }, data: { status: done ? 'RECEIVED' : 'PARTIALLY_RECEIVED' } });
    await this.audit.log(tx, ctx, 'goods_receipt.create', 'GoodsReceipt', grn.id, { summary: `${number} against ${po.number}` });
    return grn;
  }

  async createInvoice(tx: Tx, ctx: Ctx, input: z.infer<typeof purchaseInvoiceSchema>) {
    const business = await tx.business.findUniqueOrThrow({ where: { id: ctx.businessId } });
    const warehouse = await this.stock.warehouse(tx, ctx, input.warehouseId);
    if (warehouse.branchId !== input.branchId) throw new BadRequestException('Warehouse does not belong to the selected branch');
    const supplier = await tx.supplier.findFirst({ where: { id: input.supplierId, businessId: ctx.businessId } });
    if (!supplier) throw new NotFoundException('Supplier not found');
    const vm = await this.variants(tx, ctx, input.items.map((i) => i.variantId));
    if (input.supplierInvoiceNo && (await tx.purchaseInvoice.findFirst({ where: { businessId: ctx.businessId, supplierId: supplier.id, supplierInvoiceNo: input.supplierInvoiceNo, status: 'ISSUED' } })))
      throw new ConflictException(`Bill ${input.supplierInvoiceNo} from ${supplier.name} is already entered`);

    let grn = null;
    if (input.goodsReceiptId) {
      // claim the GRN so the same receipt cannot be billed (and paid) twice
      grn = await tx.goodsReceipt.findFirst({ where: { id: input.goodsReceiptId, businessId: ctx.businessId, supplierId: supplier.id }, include: { items: true } });
      if (!grn) throw new NotFoundException('Goods receipt not found for this supplier');
      for (const line of input.items) {
        const received = grn.items.filter((g) => g.variantId === line.variantId).reduce((a, g) => a.plus(D(g.quantity.toString())), D(0));
        if (D(line.quantity).gt(received)) throw new BadRequestException('The bill has more quantity than was received on the GRN');
      }
    }
    // only a GST-registered supplier can charge tax (input tax credit)
    const supply = supplyType(business.stateCode, supplier.stateCode ?? supplier.gstin?.slice(0, 2));
    const calc = computeInvoice({ supplyType: supply, chargeTax: !!supplier.gstin, roundOff: true,
      lines: input.items.map((i) => ({ quantity: i.quantity, unitPrice: i.unitCost, priceIncludesTax: false, gstRate: i.gstRate ?? vm.get(i.variantId)!.product.gstRate.toString(), cessRate: vm.get(i.variantId)!.product.cessRate.toString(), exempt: vm.get(i.variantId)!.product.taxExempt })) });
    const paid = D(input.payment?.amount ?? 0);
    if (paid.gt(calc.grandTotal)) throw new BadRequestException('Payment is more than the bill total');
    const date = input.invoiceDate ? new Date(input.invoiceDate) : new Date();
    const { number } = await this.seq.next(tx, ctx, 'PURCHASE_INVOICE', 'PI', date, business.fyStartMonth);
    const inv = await tx.purchaseInvoice.create({
      data: {
        tenantId: ctx.tenantId, businessId: ctx.businessId, branchId: input.branchId, warehouseId: input.warehouseId, number, supplierInvoiceNo: input.supplierInvoiceNo, supplierId: supplier.id,
        purchaseOrderId: input.purchaseOrderId ?? grn?.purchaseOrderId ?? null, goodsReceiptId: grn?.id ?? null, invoiceDate: date, supplyType: supply,
        taxableTotal: calc.taxableTotal.toString(), cgstTotal: calc.cgstTotal.toString(), sgstTotal: calc.sgstTotal.toString(), igstTotal: calc.igstTotal.toString(), cessTotal: calc.cessTotal.toString(),
        roundOff: calc.roundOff.toString(), grandTotal: calc.grandTotal.toString(), paidAmount: paid.toString(), paymentStatus: paymentStatus(calc.grandTotal, paid), notes: input.notes, createdById: ctx.userId,
        items: { create: input.items.map((i, idx) => { const l = calc.lines[idx]!, v = vm.get(i.variantId)!; return {
          tenantId: ctx.tenantId, variantId: i.variantId, description: v.name ? `${v.product.name} – ${v.name}` : v.product.name, hsnCode: v.product.hsnCode, quantity: i.quantity, unitCost: i.unitCost,
          taxableValue: l.taxableValue.toString(), gstRate: l.gstRate.toString(), cessRate: l.cessRate.toString(), cgst: l.cgst.toString(), sgst: l.sgst.toString(), igst: l.igst.toString(), cess: l.cess.toString(),
          lineTotal: l.lineTotal.toString(), batchNo: i.batchNo, expiryDate: i.expiryDate ? new Date(i.expiryDate) : null }; }) },
      },
      include: { items: true },
    });
    if (grn) {
      const claimed = await tx.goodsReceipt.updateMany({ where: { id: grn.id, purchaseInvoiceId: null }, data: { purchaseInvoiceId: inv.id } });
      if (claimed.count !== 1) throw new ConflictException('This goods receipt has already been billed');
    } else {
      // no GRN: the bill itself is the stock-inward document
      for (const i of [...input.items].sort((a, b) => a.variantId.localeCompare(b.variantId)))
        await this.receive(tx, ctx, { warehouseId: input.warehouseId, variantId: i.variantId, quantity: i.quantity, unitCost: i.unitCost, batchNo: i.batchNo, expiryDate: i.expiryDate },
          { refType: 'PURCHASE_INVOICE', refId: inv.id, refNumber: number }, vm.get(i.variantId)!.product);
    }
    if (input.payment) {
      const { number: payNo } = await this.seq.next(tx, ctx, 'PAYMENT_OUT', 'PAY', date, business.fyStartMonth);
      await tx.payment.create({ data: { tenantId: ctx.tenantId, businessId: ctx.businessId, branchId: input.branchId, number: payNo, direction: 'OUT', kind: 'SUPPLIER_PAYMENT', mode: input.payment.mode, amount: input.payment.amount,
        paymentDate: date, supplierId: supplier.id, reference: input.payment.reference, createdById: ctx.userId, allocations: { create: [{ tenantId: ctx.tenantId, purchaseInvoiceId: inv.id, amount: input.payment.amount }] } } });
    }
    await tx.supplier.update({ where: { id: supplier.id }, data: { balance: { increment: calc.grandTotal.minus(paid).toString() } } });
    await this.audit.log(tx, ctx, 'purchase_invoice.create', 'PurchaseInvoice', inv.id, { summary: `${number} · ${supplier.name} · ₹${calc.grandTotal.toFixed(2)}` });
    return inv;
  }

  async createReturn(tx: Tx, ctx: Ctx, input: z.infer<typeof purchaseReturnSchema>) {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "PurchaseInvoice" WHERE "id" = ${input.invoiceId}::uuid AND "businessId" = ${ctx.businessId}::uuid FOR UPDATE`;
    if (!locked.length) throw new NotFoundException('Purchase bill not found');
    const inv = await tx.purchaseInvoice.findUniqueOrThrow({ where: { id: input.invoiceId }, include: { items: true } });
    if (inv.status !== 'ISSUED') throw new BadRequestException('This bill is not active');
    assertBranchAccess(ctx, inv.branchId);
    if (new Set(input.items.map((i) => i.invoiceItemId)).size !== input.items.length) throw new BadRequestException('Each bill line can appear only once');
    const vm = await this.variants(tx, ctx, inv.items.map((i) => i.variantId));
    const biz = await tx.business.findUniqueOrThrow({ where: { id: ctx.businessId } });
    const lines = input.items.map((ri) => {
      const item = inv.items.find((i) => i.id === ri.invoiceItemId);
      if (!item) throw new BadRequestException('Item is not on this bill');
      const qty = D(ri.quantity), bought = D(item.quantity.toString()), remaining = bought.minus(D(item.returnedQty.toString()));
      if (qty.gt(remaining)) throw new ConflictException(`Only ${remaining.toString()} of ${item.description} can still be returned`);
      const taxable = round(D(item.taxableValue.toString()).mul(qty).div(bought));
      const lineTotal = round(D(item.lineTotal.toString()).mul(qty).div(bought));
      return { item, qty, taxable, tax: lineTotal.minus(taxable), lineTotal };
    });
    const total = lines.reduce((a, l) => a.plus(l.lineTotal), D(0));
    const { number } = await this.seq.next(tx, ctx, 'DEBIT_NOTE', 'DN', new Date(), biz.fyStartMonth);
    const ret = await tx.purchaseReturn.create({
      data: { tenantId: ctx.tenantId, businessId: ctx.businessId, warehouseId: inv.warehouseId, number, invoiceId: inv.id, supplierId: inv.supplierId, reason: input.reason,
        taxableTotal: lines.reduce((a, l) => a.plus(l.taxable), D(0)).toString(), taxTotal: lines.reduce((a, l) => a.plus(l.tax), D(0)).toString(), total: total.toString(), createdById: ctx.userId,
        items: { create: lines.map((l) => ({ tenantId: ctx.tenantId, invoiceItemId: l.item.id, variantId: l.item.variantId, quantity: l.qty.toString(), taxableValue: l.taxable.toString(), taxAmount: l.tax.toString(), lineTotal: l.lineTotal.toString() })) } },
      include: { items: true },
    });
    for (const l of [...lines].sort((a, b) => a.item.variantId.localeCompare(b.item.variantId))) {
      await tx.purchaseInvoiceItem.update({ where: { id: l.item.id }, data: { returnedQty: { increment: l.qty.toString() } } });
      const p = vm.get(l.item.variantId)!.product;
      if (p.trackInventory && p.type === 'GOODS')
        await this.stock.moveOut(tx, ctx, { warehouseId: inv.warehouseId, variantId: l.item.variantId, quantity: l.qty, type: 'PURCHASE_RETURN', refType: 'PURCHASE_RETURN', refId: ret.id, refNumber: number, unitCost: l.item.unitCost.toString(), trackBatches: p.trackBatches });
    }
    await tx.purchaseInvoice.update({ where: { id: inv.id }, data: { returnedAmount: { increment: total.toString() } } });
    await tx.supplier.update({ where: { id: inv.supplierId }, data: { balance: { decrement: total.toString() } } });
    await this.audit.log(tx, ctx, 'purchase_return.create', 'PurchaseReturn', ret.id, { summary: `${number} against ${inv.number} · ₹${total.toFixed(2)}` });
    return ret;
  }
}

@ApiTags('purchases') @ApiBearerAuth()
@Controller('purchases')
export class PurchasesController {
  constructor(private readonly prisma: PrismaService, private readonly purchases: PurchaseService, private readonly subs: SubscriptionService, private readonly audit: AuditService) {}

  private async supplierNames(tx: Tx, ids: string[]) {
    return new Map((await tx.supplier.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, name: true } })).map((s) => [s.id, s.name]));
  }

  @Get('orders') @Can('purchases.view')
  orders(@CurrentCtx() ctx: Ctx, @ZQuery(listQuery) q: ListQuery) {
    return this.prisma.tenantTx(ctx.tenantId, async (tx) => {
      const where: Prisma.PurchaseOrderWhereInput = { businessId: ctx.businessId, orderDate: dateRange(q.from, q.to), ...(q.q ? { number: { contains: q.q, mode: 'insensitive' } } : {}) };
      const [rows, total] = await Promise.all([tx.purchaseOrder.findMany({ where, include: { items: true }, orderBy: { createdAt: 'desc' }, ...skipTake(q) }), tx.purchaseOrder.count({ where })]);
      const names = await this.supplierNames(tx, rows.map((r) => r.supplierId));
      return page(rows.map((r) => ({ ...r, supplierName: names.get(r.supplierId) })), total, q);
    });
  }
  @Post('orders') @Can('purchases.manage') @ApiZod(purchaseOrderSchema)
  async createOrder(@CurrentCtx() ctx: Ctx, @ZBody(purchaseOrderSchema) body: z.infer<typeof purchaseOrderSchema>) {
    await this.subs.assertFeature(ctx.tenantId, 'purchases');
    return this.prisma.tenantTx(ctx.tenantId, (tx) => this.purchases.createOrder(tx, ctx, body));
  }
  @Post('orders/:id/cancel') @HttpCode(200) @Can('purchases.manage')
  cancelOrder(@CurrentCtx() ctx: Ctx, @Param('id', ParseUUIDPipe) id: string) {
    return this.prisma.tenantTx(ctx.tenantId, async (tx) => {
      const r = await tx.purchaseOrder.updateMany({ where: { id, businessId: ctx.businessId, status: 'ORDERED' }, data: { status: 'CANCELLED' } });
      if (r.count !== 1) throw new ConflictException('Only orders with nothing received can be cancelled');
      await this.audit.log(tx, ctx, 'purchase_order.cancel', 'PurchaseOrder', id);
      return { ok: true };
    });
  }
  @Get('receipts') @Can('purchases.view')
  receipts(@CurrentCtx() ctx: Ctx, @ZQuery(listQuery) q: ListQuery) {
    return this.prisma.tenantTx(ctx.tenantId, async (tx) => {
      const where = { businessId: ctx.businessId, ...(q.status === 'unbilled' ? { purchaseInvoiceId: null } : {}) };
      const [rows, total] = await Promise.all([tx.goodsReceipt.findMany({ where, include: { items: true }, orderBy: { createdAt: 'desc' }, ...skipTake(q) }), tx.goodsReceipt.count({ where })]);
      const names = await this.supplierNames(tx, rows.map((r) => r.supplierId));
      return page(rows.map((r) => ({ ...r, supplierName: names.get(r.supplierId) })), total, q);
    });
  }
  @Post('receipts') @Can('purchases.manage') @ApiZod(goodsReceiptSchema)
  createReceipt(@CurrentCtx() ctx: Ctx, @ZBody(goodsReceiptSchema) body: z.infer<typeof goodsReceiptSchema>) {
    return this.prisma.tenantTx(ctx.tenantId, (tx) => this.purchases.createReceipt(tx, ctx, body));
  }
  @Get('invoices') @Can('purchases.view')
  invoices(@CurrentCtx() ctx: Ctx, @ZQuery(listQuery) q: ListQuery) {
    return this.prisma.tenantTx(ctx.tenantId, async (tx) => {
      const where: Prisma.PurchaseInvoiceWhereInput = { businessId: ctx.businessId, invoiceDate: dateRange(q.from, q.to), ...(q.q ? { OR: [{ number: { contains: q.q, mode: 'insensitive' } }, { supplierInvoiceNo: { contains: q.q, mode: 'insensitive' } }] } : {}) };
      const [rows, total] = await Promise.all([tx.purchaseInvoice.findMany({ where, include: { items: true }, orderBy: [{ invoiceDate: 'desc' }, { createdAt: 'desc' }], ...skipTake(q) }), tx.purchaseInvoice.count({ where })]);
      const names = await this.supplierNames(tx, rows.map((r) => r.supplierId));
      return page(rows.map((r) => ({ ...r, supplierName: names.get(r.supplierId) })), total, q);
    });
  }
  @Post('invoices') @Can('purchases.manage') @ApiZod(purchaseInvoiceSchema)
  createInvoice(@CurrentCtx() ctx: Ctx, @ZBody(purchaseInvoiceSchema) body: z.infer<typeof purchaseInvoiceSchema>) {
    return this.prisma.tenantTx(ctx.tenantId, (tx) => this.purchases.createInvoice(tx, ctx, body));
  }
  @Get('returns') @Can('purchases.view')
  returns(@CurrentCtx() ctx: Ctx, @ZQuery(listQuery) q: ListQuery) {
    return this.prisma.tenantTx(ctx.tenantId, async (tx) => {
      const where = { businessId: ctx.businessId };
      const [rows, total] = await Promise.all([tx.purchaseReturn.findMany({ where, include: { items: true }, orderBy: { createdAt: 'desc' }, ...skipTake(q) }), tx.purchaseReturn.count({ where })]);
      const names = await this.supplierNames(tx, rows.map((r) => r.supplierId));
      const invs = new Map((await tx.purchaseInvoice.findMany({ where: { id: { in: rows.map((r) => r.invoiceId) } }, select: { id: true, number: true } })).map((i) => [i.id, i.number]));
      return page(rows.map((r) => ({ ...r, supplierName: names.get(r.supplierId), invoiceNumber: invs.get(r.invoiceId) })), total, q);
    });
  }
  @Post('returns') @Can('purchases.manage') @ApiZod(purchaseReturnSchema)
  createReturn(@CurrentCtx() ctx: Ctx, @ZBody(purchaseReturnSchema) body: z.infer<typeof purchaseReturnSchema>) {
    return this.prisma.tenantTx(ctx.tenantId, (tx) => this.purchases.createReturn(tx, ctx, body));
  }
}
