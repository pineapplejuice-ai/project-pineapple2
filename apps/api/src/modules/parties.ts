import { Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { D } from '@nexbill/shared';
import { customerSchema, listQuery, supplierSchema, type ListQuery } from '@nexbill/validation';
import type { z } from 'zod';
import { AuditService } from '../common/core.services';
import { Can, Ctx, CurrentCtx } from '../common/context';
import { page, skipTake } from '../common/http';
import { PrismaService } from '../common/prisma.service';
import { ApiZod, ZBody, ZQuery } from '../common/zod';

interface LedgerRow { date: Date; type: string; number: string | null; debit: string; credit: string; note?: string | null }
/** Running balance over chronologically sorted debit/credit rows. */
function withBalance(opening: string, rows: LedgerRow[]) {
  let bal = D(opening);
  const sorted = rows.sort((a, b) => a.date.getTime() - b.date.getTime());
  return { opening, rows: sorted.map((r) => { bal = bal.plus(D(r.debit)).minus(D(r.credit)); return { ...r, balance: bal.toFixed(2) }; }), closing: bal.toFixed(2) };
}

@ApiTags('parties') @ApiBearerAuth()
@Controller()
export class PartiesController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  @Get('customers') @Can('customers.view')
  customers(@CurrentCtx() ctx: Ctx, @ZQuery(listQuery) q: ListQuery) {
    return this.prisma.tenantTx(ctx.tenantId, async (tx) => {
      const where = { businessId: ctx.businessId, ...(q.status === 'due' ? { balance: { gt: 0 } } : {}),
        ...(q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' as const } }, { phone: { contains: q.q } }, { gstin: { contains: q.q.toUpperCase() } }] } : {}) };
      const [rows, total] = await Promise.all([tx.customer.findMany({ where, orderBy: { name: 'asc' }, ...skipTake(q) }), tx.customer.count({ where })]);
      return page(rows, total, q);
    });
  }
  @Post('customers') @Can('customers.manage') @ApiZod(customerSchema)
  createCustomer(@CurrentCtx() ctx: Ctx, @ZBody(customerSchema) body: z.infer<typeof customerSchema>) {
    return this.prisma.tenantTx(ctx.tenantId, async (tx) => {
      const c = await tx.customer.create({ data: { tenantId: ctx.tenantId, businessId: ctx.businessId, ...body, stateCode: body.stateCode ?? body.gstin?.slice(0, 2) ?? null, balance: body.openingBalance } });
      await this.audit.log(tx, ctx, 'customer.create', 'Customer', c.id, { summary: c.name });
      return c;
    });
  }
  @Put('customers/:id') @Can('customers.manage') @ApiZod(customerSchema)
  updateCustomer(@CurrentCtx() ctx: Ctx, @Param('id', ParseUUIDPipe) id: string, @ZBody(customerSchema) body: z.infer<typeof customerSchema>) {
    return this.prisma.tenantTx(ctx.tenantId, async (tx) => {
      const before = await tx.customer.findFirst({ where: { id, businessId: ctx.businessId } });
      if (!before) throw new NotFoundException('Customer not found');
      // changing the opening balance shifts the running balance by the same amount; it is never overwritten
      const delta = D(body.openingBalance).minus(D(before.openingBalance.toString()));
      const after = await tx.customer.update({ where: { id }, data: { ...body, balance: { increment: delta.toString() } } });
      const creditChanged = String(before.creditLimit) !== String(after.creditLimit) || !delta.isZero() || before.creditDays !== after.creditDays;
      await this.audit.log(tx, ctx, creditChanged ? 'customer.credit_adjust' : 'customer.update', 'Customer', id,
        { summary: after.name, before: { creditLimit: before.creditLimit, creditDays: before.creditDays, openingBalance: before.openingBalance }, after: { creditLimit: after.creditLimit, creditDays: after.creditDays, openingBalance: after.openingBalance } });
      return after;
    });
  }
  /** Statement: opening balance, invoices (debit), receipts and credit notes (credit), refunds (debit). */
  @Get('customers/:id/ledger') @Can('customers.view')
  customerLedger(@CurrentCtx() ctx: Ctx, @Param('id', ParseUUIDPipe) id: string) {
    return this.prisma.tenantTx(ctx.tenantId, async (tx) => {
      const customer = await tx.customer.findFirst({ where: { id, businessId: ctx.businessId } });
      if (!customer) throw new NotFoundException('Customer not found');
      const [invoices, payments, returns] = await Promise.all([
        tx.salesInvoice.findMany({ where: { customerId: id, status: 'ISSUED' }, select: { invoiceDate: true, number: true, grandTotal: true } }),
        tx.payment.findMany({ where: { customerId: id }, select: { paymentDate: true, number: true, amount: true, direction: true, mode: true } }),
        tx.salesReturn.findMany({ where: { customerId: id }, select: { returnDate: true, number: true, total: true } }),
      ]);
      const rows: LedgerRow[] = [
        ...invoices.map((i) => ({ date: i.invoiceDate, type: 'Invoice', number: i.number, debit: i.grandTotal.toString(), credit: '0' })),
        ...payments.map((p) => p.direction === 'IN'
          ? { date: p.paymentDate, type: `Receipt (${p.mode})`, number: p.number, debit: '0', credit: p.amount.toString() }
          : { date: p.paymentDate, type: `Refund (${p.mode})`, number: p.number, debit: p.amount.toString(), credit: '0' }),
        ...returns.map((r) => ({ date: r.returnDate, type: 'Credit note', number: r.number, debit: '0', credit: r.total.toString() })),
      ];
      return { customer, ...withBalance(customer.openingBalance.toString(), rows) };
    });
  }

  @Get('suppliers') @Can('suppliers.view')
  suppliers(@CurrentCtx() ctx: Ctx, @ZQuery(listQuery) q: ListQuery) {
    return this.prisma.tenantTx(ctx.tenantId, async (tx) => {
      const where = { businessId: ctx.businessId, ...(q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' as const } }, { phone: { contains: q.q } }] } : {}) };
      const [rows, total] = await Promise.all([tx.supplier.findMany({ where, orderBy: { name: 'asc' }, ...skipTake(q) }), tx.supplier.count({ where })]);
      return page(rows, total, q);
    });
  }
  @Post('suppliers') @Can('suppliers.manage') @ApiZod(supplierSchema)
  createSupplier(@CurrentCtx() ctx: Ctx, @ZBody(supplierSchema) body: z.infer<typeof supplierSchema>) {
    return this.prisma.tenantTx(ctx.tenantId, async (tx) => {
      const s = await tx.supplier.create({ data: { tenantId: ctx.tenantId, businessId: ctx.businessId, ...body, stateCode: body.stateCode ?? body.gstin?.slice(0, 2) ?? null, balance: body.openingBalance } });
      await this.audit.log(tx, ctx, 'supplier.create', 'Supplier', s.id, { summary: s.name });
      return s;
    });
  }
  @Put('suppliers/:id') @Can('suppliers.manage') @ApiZod(supplierSchema)
  updateSupplier(@CurrentCtx() ctx: Ctx, @Param('id', ParseUUIDPipe) id: string, @ZBody(supplierSchema) body: z.infer<typeof supplierSchema>) {
    return this.prisma.tenantTx(ctx.tenantId, async (tx) => {
      const before = await tx.supplier.findFirst({ where: { id, businessId: ctx.businessId } });
      if (!before) throw new NotFoundException('Supplier not found');
      const delta = D(body.openingBalance).minus(D(before.openingBalance.toString()));
      const after = await tx.supplier.update({ where: { id }, data: { ...body, balance: { increment: delta.toString() } } });
      await this.audit.log(tx, ctx, 'supplier.update', 'Supplier', id, { summary: after.name });
      return after;
    });
  }
  @Get('suppliers/:id/ledger') @Can('suppliers.view')
  supplierLedger(@CurrentCtx() ctx: Ctx, @Param('id', ParseUUIDPipe) id: string) {
    return this.prisma.tenantTx(ctx.tenantId, async (tx) => {
      const supplier = await tx.supplier.findFirst({ where: { id, businessId: ctx.businessId } });
      if (!supplier) throw new NotFoundException('Supplier not found');
      const [invoices, payments, returns] = await Promise.all([
        tx.purchaseInvoice.findMany({ where: { supplierId: id, status: 'ISSUED' }, select: { invoiceDate: true, number: true, supplierInvoiceNo: true, grandTotal: true } }),
        tx.payment.findMany({ where: { supplierId: id }, select: { paymentDate: true, number: true, amount: true, direction: true, mode: true } }),
        tx.purchaseReturn.findMany({ where: { supplierId: id }, select: { returnDate: true, number: true, total: true } }),
      ]);
      // payable ledger: purchases increase what we owe (debit column), payments and debit notes reduce it
      const rows: LedgerRow[] = [
        ...invoices.map((i) => ({ date: i.invoiceDate, type: 'Purchase', number: i.supplierInvoiceNo ?? i.number, debit: i.grandTotal.toString(), credit: '0' })),
        ...payments.map((p) => ({ date: p.paymentDate, type: `Payment (${p.mode})`, number: p.number, debit: p.direction === 'IN' ? p.amount.toString() : '0', credit: p.direction === 'OUT' ? p.amount.toString() : '0' })),
        ...returns.map((r) => ({ date: r.returnDate, type: 'Debit note', number: r.number, debit: '0', credit: r.total.toString() })),
      ];
      return { supplier, ...withBalance(supplier.openingBalance.toString(), rows) };
    });
  }
}
