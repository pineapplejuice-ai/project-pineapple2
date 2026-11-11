import { BadRequestException, ConflictException, Controller, ForbiddenException, Get, HttpCode, Injectable, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Prisma } from '@nexbill/database';
import { computeInvoice, D, exceedsCreditLimit, paymentStatus, round, supplyType, toBaseQty, type Discount } from '@nexbill/shared';
import { emailInvoiceSchema, invoiceCancelSchema, invoiceCreateSchema, listQuery, salesReturnSchema, type InvoiceCreateInput, type ListQuery } from '@nexbill/validation';
import Decimal from 'decimal.js';
import { randomBytes } from 'node:crypto';
import type { z } from 'zod';
import { config } from '../config';
import { AuditService, MessagingService, SequenceService } from '../common/core.services';
import { assertBranchAccess, assertCan, Can, Ctx, CurrentCtx, Public } from '../common/context';
import { dateRange, page, skipTake } from '../common/http';
import { PrismaService, Tx } from '../common/prisma.service';
import { ApiZod, ZBody, ZQuery } from '../common/zod';
import { SubscriptionService } from './business';
import { StockService } from './inventory';

const isUniqueViolation = (e: unknown): boolean => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

@Injectable()
export class SalesService {
  constructor(private readonly prisma: PrismaService, private readonly stock: StockService, private readonly seq: SequenceService,
    private readonly audit: AuditService, private readonly subs: SubscriptionService) {}

  async detail(tx: Tx, ctx: Ctx, id: string) {
    const invoice = await tx.salesInvoice.findFirst({ where: { id, businessId: ctx.businessId }, include: { items: { orderBy: { position: 'asc' } } } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    const [business, branch, allocations, returns] = await Promise.all([
      tx.business.findUniqueOrThrow({ where: { id: invoice.businessId } }),
      tx.branch.findUniqueOrThrow({ where: { id: invoice.branchId } }),
      tx.paymentAllocation.findMany({ where: { salesInvoiceId: id }, include: { payment: true }, orderBy: { payment: { paymentDate: 'asc' } } }),
      tx.salesReturn.findMany({ where: { invoiceId: id }, include: { items: true }, orderBy: { createdAt: 'asc' } }),
    ]);
    const showCost = ctx.permissions?.includes('products.view_cost');
    return {
      ...invoice, items: invoice.items.map((i) => (showCost ? i : { ...i, costPrice: null })), business, branch, returns,
      payments: allocations.map((a) => ({ id: a.payment.id, number: a.payment.number, direction: a.payment.direction, kind: a.payment.kind, mode: a.payment.mode, amount: a.amount, date: a.payment.paymentDate, reference: a.payment.reference })),
      balanceDue: Decimal.max(D(invoice.grandTotal.toString()).minus(D(invoice.returnedAmount.toString())).minus(D(invoice.paidAmount.toString())), 0).toFixed(2),
    };
  }

  /**
   * Creates a draft or issues an invoice. Totals are always recomputed on the server from catalogue
   * prices; the client only sends what was sold. Everything (number, lines, stock ledger, payments,
   * customer balance, audit) commits in one transaction or not at all.
   */
  async create(ctx: Ctx, input: InvoiceCreateInput, replaceDraftId?: string) {
    if (input.idempotencyKey) {
      const existing = await this.prisma.tenantTx(ctx.tenantId, (tx) => tx.salesInvoice.findUnique({ where: { tenantId_idempotencyKey: { tenantId: ctx.tenantId, idempotencyKey: input.idempotencyKey! } }, select: { id: true } }));
      if (existing) return { ...(await this.prisma.tenantTx(ctx.tenantId, (tx) => this.detail(tx, ctx, existing.id))), replayed: true };
    }
    try {
      return await this.prisma.tenantTx(ctx.tenantId, (tx) => this.createInTx(tx, ctx, input, replaceDraftId));
    } catch (e) {
      if (input.idempotencyKey && isUniqueViolation(e)) {
        // a concurrent request with the same key may have won the race: return its invoice instead of a duplicate
        const won = await this.prisma.tenantTx(ctx.tenantId, async (tx) => {
          const inv = await tx.salesInvoice.findUnique({ where: { tenantId_idempotencyKey: { tenantId: ctx.tenantId, idempotencyKey: input.idempotencyKey! } }, select: { id: true } });
          return inv ? { ...(await this.detail(tx, ctx, inv.id)), replayed: true } : null;
        });
        if (won) return won;
      }
      throw e;
    }
  }

  private async createInTx(tx: Tx, ctx: Ctx, input: InvoiceCreateInput, replaceDraftId?: string) {
    const issuing = input.status === 'ISSUED';
    const business = await tx.business.findUniqueOrThrow({ where: { id: ctx.businessId } });
    const warehouse = await this.stock.warehouse(tx, ctx, input.warehouseId);
    if (warehouse.branchId !== input.branchId) throw new BadRequestException('Warehouse does not belong to the selected branch');
    assertBranchAccess(ctx, input.branchId);
    if (replaceDraftId) {
      const removed = await tx.salesInvoice.deleteMany({ where: { id: replaceDraftId, businessId: ctx.businessId, status: 'DRAFT' } });
      if (removed.count !== 1) throw new ConflictException('This draft has already been billed or removed');
    }
    const customer = input.customerId ? await tx.customer.findFirst({ where: { id: input.customerId, businessId: ctx.businessId, isActive: true } }) : null;
    if (input.customerId && !customer) throw new NotFoundException('Customer not found');

    const variantIds = [...new Set(input.items.map((i) => i.variantId))];
    const variants = await tx.productVariant.findMany({
      where: { id: { in: variantIds }, businessId: ctx.businessId, isActive: true, product: { isActive: true } },
      include: { product: { include: { baseUnit: true, units: { include: { unit: true } } } }, bundleItems: true, branchPrices: { where: { branchId: input.branchId } } },
    });
    const vmap = new Map(variants.map((v) => [v.id, v]));
    if (vmap.size !== variantIds.length) throw new BadRequestException('One or more products are no longer available');

    const hasDiscount = (d?: Discount | null): boolean => !!d && D(d.value).gt(0);
    if ((hasDiscount(input.invoiceDiscount) || input.items.some((i) => hasDiscount(i.discount)))) assertCan(ctx, 'sales.discount');

    const prepared = input.items.map((item) => {
      const v = vmap.get(item.variantId)!;
      const alt = item.unitId && item.unitId !== v.product.baseUnitId ? v.product.units.find((u) => u.unitId === item.unitId) : null;
      if (item.unitId && item.unitId !== v.product.baseUnitId && !alt) throw new BadRequestException(`${v.product.name} is not sold in that unit`);
      const factor = alt ? D(alt.factorToBase.toString()) : D(1);
      const listPrice = D((v.branchPrices[0]?.sellingPrice ?? v.sellingPrice).toString()).mul(factor).toDecimalPlaces(4);
      const unitPrice = item.unitPrice !== undefined ? D(item.unitPrice) : listPrice;
      if (!unitPrice.eq(listPrice)) assertCan(ctx, 'sales.price_override');
      return { item, v, factor, unitPrice, unitCode: alt ? alt.unit.code : v.product.baseUnit.code, baseQty: toBaseQty(item.quantity, factor) };
    });

    const customerGstin = input.customerGstin ?? customer?.gstin ?? null;
    const placeOfSupply = input.placeOfSupply ?? customer?.stateCode ?? customerGstin?.slice(0, 2) ?? business.stateCode;
    const supply = supplyType(business.stateCode, placeOfSupply);
    let calc;
    try {
      calc = computeInvoice({
        supplyType: supply, chargeTax: business.gstRegistered, roundOff: business.roundOffInvoices, invoiceDiscount: input.invoiceDiscount,
        lines: prepared.map((p) => ({ quantity: p.item.quantity, unitPrice: p.unitPrice, priceIncludesTax: p.v.product.priceIncludesTax, discount: p.item.discount,
          gstRate: p.v.product.gstRate.toString(), cessRate: p.v.product.cessRate.toString(), exempt: p.v.product.taxExempt, hsnCode: p.v.product.hsnCode })),
      });
    } catch (e) { throw new BadRequestException(e instanceof Error ? e.message : 'Invalid invoice'); }

    const paid = input.payments.reduce((a, p) => a.plus(D(p.amount)), D(0));
    if (!issuing && input.payments.length) throw new BadRequestException('Payments can only be recorded when the invoice is issued');
    if (paid.gt(calc.grandTotal)) throw new BadRequestException('Payment is more than the invoice total');
    const due = calc.grandTotal.minus(paid);
    const invoiceDate = input.invoiceDate ? new Date(input.invoiceDate) : new Date();

    let number: string | null = null, fy: string | null = null;
    if (issuing) {
      if (due.gt(0) && !customer) throw new BadRequestException('Select a customer to sell on credit. Walk-in bills must be paid in full.');
      await this.subs.assertLimit(tx, ctx, 'invoicesPerMonth');
      if (due.gt(0) && customer) {
        const locked = await tx.$queryRaw<Array<{ balance: Prisma.Decimal }>>`SELECT "balance" FROM "Customer" WHERE "id" = ${customer.id}::uuid FOR UPDATE`;
        if (exceedsCreditLimit(locked[0]!.balance.toString(), due, customer.creditLimit?.toString() ?? null))
          throw new ConflictException({ message: `Credit limit exceeded for ${customer.name}. Outstanding ₹${locked[0]!.balance.toString()}, limit ₹${customer.creditLimit?.toString()}.`, code: 'CREDIT_LIMIT' });
      }
      ({ number, fy } = await this.seq.next(tx, ctx, 'SALES_INVOICE', business.invoicePrefix, invoiceDate, business.fyStartMonth));
    }

    const invoice = await tx.salesInvoice.create({
      data: {
        tenantId: ctx.tenantId, businessId: ctx.businessId, branchId: input.branchId, warehouseId: input.warehouseId, number, fy,
        docType: business.gstRegistered ? 'TAX_INVOICE' : 'BILL_OF_SUPPLY', status: input.status, invoiceDate,
        dueDate: due.gt(0) && customer ? new Date(invoiceDate.getTime() + customer.creditDays * 86400000) : null,
        customerId: customer?.id ?? null, customerName: input.customerName ?? customer?.name ?? 'Walk-in customer',
        customerPhone: input.customerPhone ?? customer?.phone ?? null, customerGstin, customerAddress: customer?.address ?? null,
        placeOfSupply, supplyType: supply,
        subTotal: calc.subTotal.toString(), lineDiscountTotal: calc.lineDiscountTotal.toString(),
        invoiceDiscountType: input.invoiceDiscount?.type ?? null, invoiceDiscountValue: input.invoiceDiscount?.value ?? null,
        invoiceDiscountTotal: calc.invoiceDiscountTotal.toString(), taxableTotal: calc.taxableTotal.toString(),
        cgstTotal: calc.cgstTotal.toString(), sgstTotal: calc.sgstTotal.toString(), igstTotal: calc.igstTotal.toString(), cessTotal: calc.cessTotal.toString(),
        taxTotal: calc.taxTotal.toString(), roundOff: calc.roundOff.toString(), grandTotal: calc.grandTotal.toString(),
        paidAmount: issuing ? paid.toString() : '0', paymentStatus: issuing ? paymentStatus(calc.grandTotal, paid) : 'UNPAID',
        notes: input.notes, idempotencyKey: input.idempotencyKey ?? null, createdById: ctx.userId,
      },
    });

    // Stock leaves through the ledger, in a stable order so concurrent bills cannot deadlock.
    const batchByLine = new Map<number, string | null>();
    const costByLine = new Map<number, Decimal>();
    if (issuing) {
      const order = prepared.map((p, idx) => ({ p, idx })).sort((a, b) => a.p.v.id.localeCompare(b.p.v.id));
      for (const { p, idx } of order) {
        const ref = { warehouseId: input.warehouseId, type: 'SALE' as const, refType: 'SALES_INVOICE', refId: invoice.id, refNumber: number, allowNegative: business.allowNegativeStock };
        if (p.v.product.type === 'BUNDLE') {
          const comps = await tx.productVariant.findMany({ where: { id: { in: p.v.bundleItems.map((b) => b.componentVariantId) } }, include: { product: { select: { trackBatches: true, trackInventory: true } } } });
          let cost = D(0);
          for (const b of [...p.v.bundleItems].sort((x, y) => x.componentVariantId.localeCompare(y.componentVariantId))) {
            const c = comps.find((x) => x.id === b.componentVariantId)!;
            cost = cost.plus(D(c.avgCost.toString()).mul(D(b.quantity.toString())));
            if (!c.product.trackInventory) continue;
            const r = await this.stock.moveOut(tx, ctx, { ...ref, variantId: c.id, quantity: p.baseQty.mul(D(b.quantity.toString())), unitCost: c.avgCost.toString(), trackBatches: c.product.trackBatches });
            await this.stock.alertIfLow(tx, ctx, c.id, r.balance);
          }
          costByLine.set(idx, cost);
        } else {
          costByLine.set(idx, D(p.v.avgCost.toString()));
          if (p.v.product.type === 'GOODS' && p.v.product.trackInventory) {
            const r = await this.stock.moveOut(tx, ctx, { ...ref, variantId: p.v.id, quantity: p.baseQty, unitCost: p.v.avgCost.toString(), batchId: p.item.batchId, trackBatches: p.v.product.trackBatches });
            batchByLine.set(idx, r.batchId);
            await this.stock.alertIfLow(tx, ctx, p.v.id, r.balance);
          }
        }
      }
    }

    await tx.salesInvoiceItem.createMany({
      data: prepared.map((p, idx) => {
        const l = calc.lines[idx]!;
        return {
          tenantId: ctx.tenantId, invoiceId: invoice.id, position: idx + 1, variantId: p.v.id,
          description: p.v.name ? `${p.v.product.name} – ${p.v.name}` : p.v.product.name, hsnCode: p.v.product.hsnCode, unitCode: p.unitCode,
          unitFactor: p.factor.toString(), quantity: l.quantity.toString(), baseQuantity: p.baseQty.toString(), unitPrice: p.unitPrice.toString(),
          priceIncludesTax: p.v.product.priceIncludesTax, discountType: p.item.discount?.type ?? null, discountValue: p.item.discount?.value ?? null,
          lineDiscount: l.lineDiscount.toString(), invoiceDiscountShare: l.invoiceDiscountShare.toString(), taxableValue: l.taxableValue.toString(),
          gstRate: l.gstRate.toString(), cessRate: l.cessRate.toString(), cgst: l.cgst.toString(), sgst: l.sgst.toString(), igst: l.igst.toString(), cess: l.cess.toString(),
          lineTotal: l.lineTotal.toString(), costPrice: (costByLine.get(idx) ?? D(p.v.avgCost.toString())).toString(), batchId: batchByLine.get(idx) ?? p.item.batchId ?? null,
        };
      }),
    });

    if (issuing) {
      for (const p of input.payments) {
        const { number: payNo } = await this.seq.next(tx, ctx, 'RECEIPT', 'RCP', invoiceDate, business.fyStartMonth);
        await tx.payment.create({
          data: { tenantId: ctx.tenantId, businessId: ctx.businessId, branchId: input.branchId, number: payNo, direction: 'IN', kind: 'RECEIPT', mode: p.mode, amount: p.amount,
            paymentDate: invoiceDate, customerId: customer?.id ?? null, reference: p.reference, createdById: ctx.userId,
            allocations: { create: [{ tenantId: ctx.tenantId, salesInvoiceId: invoice.id, amount: p.amount }] } },
        });
      }
      if (customer && due.gt(0)) await tx.customer.update({ where: { id: customer.id }, data: { balance: { increment: due.toString() } } });
      await this.audit.log(tx, ctx, 'invoice.create', 'SalesInvoice', invoice.id, { summary: `${number} · ₹${calc.grandTotal.toFixed(2)} · ${invoice.customerName}`, after: { number, grandTotal: calc.grandTotal.toString(), paid: paid.toString() } });
    }
    return this.detail(tx, ctx, invoice.id);
  }

  /** Controlled cancellation: the invoice stays on record, stock is restored through reversing ledger entries. */
  cancel(ctx: Ctx, id: string, body: z.infer<typeof invoiceCancelSchema>) {
    return this.prisma.tenantTx(ctx.tenantId, async (tx) => {
      const claimed = await tx.salesInvoice.updateMany({ where: { id, businessId: ctx.businessId, status: 'ISSUED', returnedAmount: 0 }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: body.reason, cancelledById: ctx.userId } });
      if (claimed.count !== 1) {
        const inv = await tx.salesInvoice.findFirst({ where: { id, businessId: ctx.businessId } });
        if (!inv) throw new NotFoundException('Invoice not found');
        throw new ConflictException(inv.status === 'ISSUED' ? 'This invoice has returns against it and cannot be cancelled' : `Invoice is already ${inv.status.toLowerCase()}`);
      }
      const inv = await tx.salesInvoice.findUniqueOrThrow({ where: { id } });
      assertBranchAccess(ctx, inv.branchId);
      const moves = await tx.stockMovement.findMany({ where: { refType: 'SALES_INVOICE', refId: id, type: 'SALE' }, orderBy: { variantId: 'asc' } });
      for (const m of moves)
        await this.stock.move(tx, ctx, { warehouseId: m.warehouseId, variantId: m.variantId, batchId: m.batchId, quantity: D(m.quantity.toString()).neg(), type: 'SALE_CANCEL', refType: 'SALES_INVOICE', refId: id, refNumber: inv.number, unitCost: m.unitCost.toString(), note: `Cancelled: ${body.reason}` });
      const paid = D(inv.paidAmount.toString()), total = D(inv.grandTotal.toString());
      let refunded = D(0);
      if (paid.gt(0)) {
        if (!body.refundMode && !inv.customerId) throw new BadRequestException('Choose how the amount already paid is being refunded');
        if (body.refundMode) {
          const biz = await tx.business.findUniqueOrThrow({ where: { id: ctx.businessId } });
          const { number } = await this.seq.next(tx, ctx, 'REFUND', 'RFD', new Date(), biz.fyStartMonth);
          await tx.payment.create({ data: { tenantId: ctx.tenantId, businessId: ctx.businessId, branchId: inv.branchId, number, direction: 'OUT', kind: 'REFUND', mode: body.refundMode, amount: paid.toString(), customerId: inv.customerId, note: `Refund for cancelled ${inv.number}`, createdById: ctx.userId,
            allocations: { create: [{ tenantId: ctx.tenantId, salesInvoiceId: id, amount: paid.toString() }] } } });
          await tx.salesInvoice.update({ where: { id }, data: { paidAmount: 0, paymentStatus: 'UNPAID' } });
          refunded = paid;
        }
      }
      // remove the invoice from the receivable; anything paid and not refunded stays as customer advance
      if (inv.customerId) await tx.customer.update({ where: { id: inv.customerId }, data: { balance: { decrement: total.minus(refunded).toString() } } });
      await this.audit.log(tx, ctx, 'invoice.cancel', 'SalesInvoice', id, { summary: `${inv.number} cancelled: ${body.reason}`, before: { status: 'ISSUED' }, after: { status: 'CANCELLED', refunded: refunded.toString() } });
      return this.detail(tx, ctx, id);
    });
  }

  async createReturn(ctx: Ctx, input: z.infer<typeof salesReturnSchema>) {
    const findExisting = (tx: Tx) => tx.salesReturn.findUnique({ where: { tenantId_idempotencyKey: { tenantId: ctx.tenantId, idempotencyKey: input.idempotencyKey! } }, include: { items: true } });
    if (input.idempotencyKey) {
      const existing = await this.prisma.tenantTx(ctx.tenantId, findExisting);
      if (existing) return existing;
    }
    try {
      return await this.prisma.tenantTx(ctx.tenantId, (tx) => this.returnInTx(tx, ctx, input));
    } catch (e) {
      const won = input.idempotencyKey && isUniqueViolation(e) ? await this.prisma.tenantTx(ctx.tenantId, findExisting) : null;
      if (won) return won;
      throw e;
    }
  }

  private async returnInTx(tx: Tx, ctx: Ctx, input: z.infer<typeof salesReturnSchema>) {
    // Row lock: concurrent returns against the same invoice queue here, so quantities cannot be returned twice.
    const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "SalesInvoice" WHERE "id" = ${input.invoiceId}::uuid AND "businessId" = ${ctx.businessId}::uuid FOR UPDATE`;
    if (!locked.length) throw new NotFoundException('Invoice not found');
    const inv = await tx.salesInvoice.findUniqueOrThrow({ where: { id: input.invoiceId }, include: { items: true } });
    if (inv.status !== 'ISSUED') throw new BadRequestException('Only issued invoices can be returned');
    assertBranchAccess(ctx, inv.branchId);
    if (new Set(input.items.map((i) => i.invoiceItemId)).size !== input.items.length) throw new BadRequestException('Each invoice line can appear only once in a return');
    const business = await tx.business.findUniqueOrThrow({ where: { id: ctx.businessId } });

    const lines = input.items.map((ri) => {
      const item = inv.items.find((i) => i.id === ri.invoiceItemId);
      if (!item) throw new BadRequestException('Item is not on this invoice');
      const qty = D(ri.quantity), sold = D(item.quantity.toString()), remaining = sold.minus(D(item.returnedQty.toString()));
      if (qty.gt(remaining)) throw new ConflictException({ message: `Only ${remaining.toString()} of ${item.description} can still be returned`, code: 'RETURN_EXCEEDS_SOLD' });
      const part = (v: Prisma.Decimal): Decimal => round(D(v.toString()).mul(qty).div(sold));
      const taxableValue = part(item.taxableValue), cgst = part(item.cgst), sgst = part(item.sgst), igst = part(item.igst), cess = part(item.cess);
      return { ri, item, qty, baseQty: qty.mul(D(item.unitFactor.toString())).toDecimalPlaces(4), taxableValue, cgst, sgst, igst, cess,
        lineTotal: taxableValue.plus(cgst).plus(sgst).plus(igst).plus(cess), fully: qty.eq(remaining) };
    });

    const grand = D(inv.grandTotal.toString()), prevReturned = D(inv.returnedAmount.toString());
    const touched = new Set(lines.filter((l) => l.fully).map((l) => l.item.id));
    const everythingReturned = inv.items.every((i) => touched.has(i.id) || D(i.returnedQty.toString()).eq(D(i.quantity.toString())));
    const sumLines = lines.reduce((a, l) => a.plus(l.lineTotal), D(0));
    // a full return credits exactly what is left of the invoice (absorbing its round-off)
    const total = everythingReturned ? grand.minus(prevReturned) : Decimal.min(sumLines, grand.minus(prevReturned));
    const paid = D(inv.paidAmount.toString());
    const refundable = Decimal.max(paid.plus(prevReturned).plus(total).minus(grand), 0);
    const refund = D(input.refundAmount);
    if (refund.gt(refundable)) throw new BadRequestException(`At most ₹${refundable.toFixed(2)} can be refunded on this return`);
    if (!inv.customerId && !refund.eq(refundable)) throw new BadRequestException(`Walk-in returns must be refunded in full (₹${refundable.toFixed(2)})`);
    if (refund.gt(0) && !input.refundMode) throw new BadRequestException('Choose a refund mode');

    const { number, fy } = await this.seq.next(tx, ctx, 'CREDIT_NOTE', 'CN', new Date(), business.fyStartMonth);
    const sum = (k: 'taxableValue' | 'cgst' | 'sgst' | 'igst' | 'cess'): string => lines.reduce((a, l) => a.plus(l[k]), D(0)).toString();
    const ret = await tx.salesReturn.create({
      data: {
        tenantId: ctx.tenantId, businessId: ctx.businessId, branchId: inv.branchId, warehouseId: inv.warehouseId, number, fy, invoiceId: inv.id, customerId: inv.customerId,
        reason: input.reason, taxableTotal: sum('taxableValue'), cgstTotal: sum('cgst'), sgstTotal: sum('sgst'), igstTotal: sum('igst'), cessTotal: sum('cess'),
        total: total.toString(), refundAmount: refund.toString(), refundMode: refund.gt(0) ? input.refundMode : null, idempotencyKey: input.idempotencyKey ?? null, createdById: ctx.userId,
        items: { create: lines.map((l) => ({ tenantId: ctx.tenantId, invoiceItemId: l.item.id, variantId: l.item.variantId, description: l.item.description, hsnCode: l.item.hsnCode,
          quantity: l.qty.toString(), baseQuantity: l.baseQty.toString(), condition: l.ri.condition, taxableValue: l.taxableValue.toString(), gstRate: l.item.gstRate,
          cgst: l.cgst.toString(), sgst: l.sgst.toString(), igst: l.igst.toString(), cess: l.cess.toString(), lineTotal: l.lineTotal.toString(), costPrice: l.item.costPrice })) },
      },
      include: { items: true },
    });

    for (const l of [...lines].sort((a, b) => a.item.variantId.localeCompare(b.item.variantId))) {
      await tx.salesInvoiceItem.update({ where: { id: l.item.id }, data: { returnedQty: { increment: l.qty.toString() } } });
      const variant = await tx.productVariant.findUniqueOrThrow({ where: { id: l.item.variantId }, include: { product: true, bundleItems: true } });
      const targets = variant.product.type === 'BUNDLE'
        ? variant.bundleItems.map((b) => ({ variantId: b.componentVariantId, qty: l.baseQty.mul(D(b.quantity.toString())), batchId: null as string | null }))
        : variant.product.type === 'GOODS' && variant.product.trackInventory ? [{ variantId: variant.id, qty: l.baseQty, batchId: l.item.batchId }] : [];
      for (const t of targets) {
        const ref = { warehouseId: inv.warehouseId, variantId: t.variantId, refType: 'SALES_RETURN', refId: ret.id, refNumber: number, unitCost: l.item.costPrice.toString() };
        await this.stock.move(tx, ctx, { ...ref, quantity: t.qty, type: 'SALE_RETURN', batchId: t.batchId });
        // damaged goods come back on the books and are written off immediately, so both facts are on the ledger
        if (l.ri.condition === 'DAMAGED') await this.stock.move(tx, ctx, { ...ref, quantity: t.qty.neg(), type: 'DAMAGE', batchId: t.batchId, note: 'Returned damaged', allowNegative: true });
      }
    }

    if (refund.gt(0)) {
      const { number: payNo } = await this.seq.next(tx, ctx, 'REFUND', 'RFD', new Date(), business.fyStartMonth);
      await tx.payment.create({ data: { tenantId: ctx.tenantId, businessId: ctx.businessId, branchId: inv.branchId, number: payNo, direction: 'OUT', kind: 'REFUND', mode: input.refundMode!, amount: refund.toString(), customerId: inv.customerId, note: `Refund against ${number}`, createdById: ctx.userId,
        allocations: { create: [{ tenantId: ctx.tenantId, salesInvoiceId: inv.id, salesReturnId: ret.id, amount: refund.toString() }] } } });
    }
    const newPaid = paid.minus(refund), newReturned = prevReturned.plus(total);
    await tx.salesInvoice.update({ where: { id: inv.id }, data: { returnedAmount: newReturned.toString(), paidAmount: newPaid.toString(), paymentStatus: paymentStatus(grand.minus(newReturned), newPaid) } });
    if (inv.customerId) await tx.customer.update({ where: { id: inv.customerId }, data: { balance: { decrement: total.minus(refund).toString() } } });
    await this.audit.log(tx, ctx, 'sales_return.create', 'SalesReturn', ret.id, { summary: `${number} against ${inv.number} · ₹${total.toFixed(2)} · refund ₹${refund.toFixed(2)}`, after: { total: total.toString(), refund: refund.toString() } });
    return ret;
  }
}

@ApiTags('sales') @ApiBearerAuth()
@Controller('sales')
export class SalesController {
  constructor(private readonly prisma: PrismaService, private readonly sales: SalesService, private readonly messaging: MessagingService, private readonly audit: AuditService) {}

  @Get('invoices') @Can('sales.view')
  list(@CurrentCtx() ctx: Ctx, @ZQuery(listQuery) q: ListQuery, @Query('paymentStatus') payStatus?: string, @Query('customerId') customerId?: string) {
    return this.prisma.tenantTx(ctx.tenantId, async (tx) => {
      const where: Prisma.SalesInvoiceWhereInput = {
        businessId: ctx.businessId, invoiceDate: dateRange(q.from, q.to), customerId: customerId || undefined,
        branchId: q.branchId ?? (ctx.branchIds.length ? { in: ctx.branchIds } : undefined),
        status: (['DRAFT', 'ISSUED', 'CANCELLED'].includes(q.status ?? '') ? q.status : undefined) as 'ISSUED' | undefined,
        paymentStatus: (['UNPAID', 'PARTIAL', 'PAID'].includes(payStatus ?? '') ? payStatus : undefined) as 'PAID' | undefined,
        ...(q.q ? { OR: [{ number: { contains: q.q, mode: 'insensitive' } }, { customerName: { contains: q.q, mode: 'insensitive' } }, { customerPhone: { contains: q.q } }] } : {}),
      };
      const [rows, total] = await Promise.all([tx.salesInvoice.findMany({ where, orderBy: [{ invoiceDate: 'desc' }, { createdAt: 'desc' }], ...skipTake(q) }), tx.salesInvoice.count({ where })]);
      return page(rows, total, q);
    });
  }
  @Get('invoices/:id') @Can('sales.view')
  get(@CurrentCtx() ctx: Ctx, @Param('id', ParseUUIDPipe) id: string) { return this.prisma.tenantTx(ctx.tenantId, (tx) => this.sales.detail(tx, ctx, id)); }

  @Post('invoices') @Can('sales.create') @ApiZod(invoiceCreateSchema)
  create(@CurrentCtx() ctx: Ctx, @ZBody(invoiceCreateSchema) body: InvoiceCreateInput, @Query('draftId') draftId?: string) {
    if (draftId && !/^[0-9a-f-]{36}$/i.test(draftId)) throw new BadRequestException('Invalid draft');
    if (draftId && !ctx.permissions.includes('sales.edit')) throw new ForbiddenException('Missing permission: sales.edit');
    return this.sales.create(ctx, body, draftId);
  }
  @Post('invoices/:id/cancel') @HttpCode(200) @Can('sales.cancel') @ApiZod(invoiceCancelSchema)
  cancel(@CurrentCtx() ctx: Ctx, @Param('id', ParseUUIDPipe) id: string, @ZBody(invoiceCancelSchema) body: z.infer<typeof invoiceCancelSchema>) { return this.sales.cancel(ctx, id, body); }

  @Post('invoices/:id/discard-draft') @HttpCode(200) @Can('sales.edit')
  discard(@CurrentCtx() ctx: Ctx, @Param('id', ParseUUIDPipe) id: string) {
    return this.prisma.tenantTx(ctx.tenantId, async (tx) => {
      const r = await tx.salesInvoice.deleteMany({ where: { id, businessId: ctx.businessId, status: 'DRAFT' } });
      if (r.count !== 1) throw new ConflictException('Only drafts can be discarded');
      return { ok: true };
    });
  }

  /** Creates (once) an unguessable public link; WhatsApp sharing uses the official click-to-chat URL, no automation. */
  @Post('invoices/:id/share') @HttpCode(200) @Can('sales.view')
  share(@CurrentCtx() ctx: Ctx, @Param('id', ParseUUIDPipe) id: string) {
    return this.prisma.tenantTx(ctx.tenantId, async (tx) => {
      const inv = await tx.salesInvoice.findFirst({ where: { id, businessId: ctx.businessId, status: { not: 'DRAFT' } } });
      if (!inv) throw new NotFoundException('Invoice not found');
      const token = inv.shareToken ?? randomBytes(24).toString('base64url');
      if (!inv.shareToken) await tx.salesInvoice.update({ where: { id }, data: { shareToken: token } });
      const url = `${config.publicWebUrl}/i/${token}`;
      const text = encodeURIComponent(`Invoice ${inv.number} for ₹${inv.grandTotal.toString()}: ${url}`);
      return { url, whatsappUrl: `https://wa.me/${inv.customerPhone ? `91${inv.customerPhone}` : ''}?text=${text}` };
    });
  }
  @Post('invoices/:id/email') @HttpCode(200) @Can('sales.view') @ApiZod(emailInvoiceSchema)
  async email(@CurrentCtx() ctx: Ctx, @Param('id', ParseUUIDPipe) id: string, @ZBody(emailInvoiceSchema) body: z.infer<typeof emailInvoiceSchema>) {
    const { url } = await this.share(ctx, id);
    await this.messaging.email.send(body.to, 'Your invoice', url);
    return { accepted: true, delivered: false, note: 'No email provider is configured; the message was handed to the logging adapter.' };
  }

  @Get('returns') @Can('sales.view')
  returns(@CurrentCtx() ctx: Ctx, @ZQuery(listQuery) q: ListQuery) {
    return this.prisma.tenantTx(ctx.tenantId, async (tx) => {
      const where = { businessId: ctx.businessId, returnDate: dateRange(q.from, q.to), ...(q.q ? { number: { contains: q.q, mode: 'insensitive' as const } } : {}) };
      const [rows, total] = await Promise.all([tx.salesReturn.findMany({ where, include: { items: true }, orderBy: { createdAt: 'desc' }, ...skipTake(q) }), tx.salesReturn.count({ where })]);
      const invs = await tx.salesInvoice.findMany({ where: { id: { in: rows.map((r) => r.invoiceId) } }, select: { id: true, number: true, customerName: true } });
      const m = new Map(invs.map((i) => [i.id, i]));
      return page(rows.map((r) => ({ ...r, invoiceNumber: m.get(r.invoiceId)?.number, customerName: m.get(r.invoiceId)?.customerName })), total, q);
    });
  }
  @Post('returns') @Can('sales.return') @ApiZod(salesReturnSchema)
  createReturn(@CurrentCtx() ctx: Ctx, @ZBody(salesReturnSchema) body: z.infer<typeof salesReturnSchema>) { return this.sales.createReturn(ctx, body); }
}

/** Public, read-only invoice view behind an unguessable token. Returns only what is printed on the invoice. */
@ApiTags('public')
@Controller('public')
export class PublicInvoiceController {
  constructor(private readonly prisma: PrismaService, private readonly sales: SalesService) {}
  @Public() @Throttle({ default: { limit: 30, ttl: 60000 } }) @Get('invoices/:token')
  async view(@Param('token') token: string) {
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) throw new NotFoundException('Invoice not found');
    const rows = await this.prisma.$queryRaw<Array<{ tenant_id: string; invoice_id: string }>>`SELECT * FROM resolve_share_token(${token})`;
    const hit = rows[0];
    if (!hit) throw new NotFoundException('Invoice not found');
    return this.prisma.tenantTx(hit.tenant_id, async (tx) => {
      const inv = await tx.salesInvoice.findUniqueOrThrow({ where: { id: hit.invoice_id } });
      const ctx = { tenantId: hit.tenant_id, businessId: inv.businessId } as Ctx;
      const d = await this.sales.detail(tx, ctx, inv.id);
      const { idempotencyKey: _k, createdById: _c, cancelledById: _x, items, ...rest } = d;
      return { ...rest, items };
    });
  }
}
