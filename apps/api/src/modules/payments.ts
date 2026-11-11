import { BadRequestException, ConflictException, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@nexbill/database';
import { D, paymentStatus } from '@nexbill/shared';
import { cashCloseSchema, cashOpenSchema, expenseCategorySchema, expenseSchema, listQuery, receiptSchema, supplierPaymentSchema, type ListQuery } from '@nexbill/validation';
import Decimal from 'decimal.js';
import type { z } from 'zod';
import { AuditService, NotificationService, SequenceService } from '../common/core.services';
import { assertBranchAccess, branchScope, Can, Ctx, CurrentCtx } from '../common/context';
import { dateRange, page, skipTake } from '../common/http';
import { PrismaService, Tx } from '../common/prisma.service';
import { ApiZod, ZBody, ZQuery } from '../common/zod';

@ApiTags('payments') @ApiBearerAuth()
@Controller()
export class PaymentsController {
  constructor(private readonly prisma: PrismaService, private readonly seq: SequenceService, private readonly audit: AuditService, private readonly notifications: NotificationService) {}

  private async branch(tx: Tx, ctx: Ctx, id: string) {
    assertBranchAccess(ctx, id);
    const b = await tx.branch.findFirst({ where: { id, businessId: ctx.businessId, isActive: true } });
    if (!b) throw new NotFoundException('Branch not found');
    return b;
  }

  @Get('payments') @Can('payments.view')
  list(@CurrentCtx() ctx: Ctx, @ZQuery(listQuery) q: ListQuery, @Query('direction') direction?: string) {
    return this.prisma.tenantTx(ctx.tenantId, async (tx) => {
      const where: Prisma.PaymentWhereInput = { businessId: ctx.businessId, paymentDate: dateRange(q.from, q.to), direction: direction === 'IN' || direction === 'OUT' ? direction : undefined,
        branchId: branchScope(ctx, q.branchId), ...(q.q ? { OR: [{ number: { contains: q.q, mode: 'insensitive' } }, { reference: { contains: q.q, mode: 'insensitive' } }] } : {}) };
      const [rows, total] = await Promise.all([tx.payment.findMany({ where, orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }], ...skipTake(q) }), tx.payment.count({ where })]);
      const [cs, ss] = await Promise.all([
        tx.customer.findMany({ where: { id: { in: rows.flatMap((r) => (r.customerId ? [r.customerId] : [])) } }, select: { id: true, name: true } }),
        tx.supplier.findMany({ where: { id: { in: rows.flatMap((r) => (r.supplierId ? [r.supplierId] : [])) } }, select: { id: true, name: true } }),
      ]);
      const names = new Map([...cs, ...ss].map((x) => [x.id, x.name]));
      return page(rows.map((r) => ({ ...r, partyName: names.get(r.customerId ?? r.supplierId ?? '') ?? (r.kind === 'RECEIPT' ? 'Walk-in customer' : '') })), total, q);
    });
  }

  /**
   * Customer receipt. Against one invoice it cannot exceed that invoice's due; against a customer
   * it settles the oldest dues first and keeps any remainder as an advance on the account.
   */
  @Post('payments/receive') @Can('payments.record') @ApiZod(receiptSchema)
  receive(@CurrentCtx() ctx: Ctx, @ZBody(receiptSchema) body: z.infer<typeof receiptSchema>) {
    return this.prisma.tenantTx(ctx.tenantId, async (tx) => {
      await this.branch(tx, ctx, body.branchId);
      const amount = D(body.amount);
      const dueOf = (i: { grandTotal: Prisma.Decimal; returnedAmount: Prisma.Decimal; paidAmount: Prisma.Decimal }): Decimal =>
        Decimal.max(D(i.grandTotal.toString()).minus(D(i.returnedAmount.toString())).minus(D(i.paidAmount.toString())), 0);
      type Row = { id: string; number: string | null; customerId: string | null; grandTotal: Prisma.Decimal; returnedAmount: Prisma.Decimal; paidAmount: Prisma.Decimal };
      let invoices: Row[];
      let customerId = body.customerId ?? null;
      if (body.invoiceId) {
        invoices = await tx.$queryRaw<Row[]>`SELECT "id", "number", "customerId", "grandTotal", "returnedAmount", "paidAmount" FROM "SalesInvoice" WHERE "id" = ${body.invoiceId}::uuid AND "businessId" = ${ctx.businessId}::uuid AND "status" = 'ISSUED' FOR UPDATE`;
        if (!invoices.length) throw new NotFoundException('Invoice not found');
        if (amount.gt(dueOf(invoices[0]!))) throw new BadRequestException(`Only ₹${dueOf(invoices[0]!).toFixed(2)} is due on this invoice`);
        customerId = invoices[0]!.customerId;
      } else {
        if (!(await tx.customer.findFirst({ where: { id: customerId!, businessId: ctx.businessId } }))) throw new NotFoundException('Customer not found');
        invoices = await tx.$queryRaw<Row[]>`SELECT "id", "number", "customerId", "grandTotal", "returnedAmount", "paidAmount" FROM "SalesInvoice"
          WHERE "customerId" = ${customerId}::uuid AND "businessId" = ${ctx.businessId}::uuid AND "status" = 'ISSUED' AND "paymentStatus" <> 'PAID' ORDER BY "invoiceDate", "createdAt" FOR UPDATE`;
      }
      let left = amount;
      const allocations: Array<{ tenantId: string; salesInvoiceId: string; amount: string }> = [];
      for (const inv of invoices) {
        if (left.lte(0)) break;
        const take = Decimal.min(left, dueOf(inv));
        if (take.lte(0)) continue;
        const paid = D(inv.paidAmount.toString()).plus(take);
        await tx.salesInvoice.update({ where: { id: inv.id }, data: { paidAmount: paid.toString(), paymentStatus: paymentStatus(D(inv.grandTotal.toString()).minus(D(inv.returnedAmount.toString())), paid) } });
        allocations.push({ tenantId: ctx.tenantId, salesInvoiceId: inv.id, amount: take.toString() });
        left = left.minus(take);
      }
      const biz = await tx.business.findUniqueOrThrow({ where: { id: ctx.businessId } });
      const date = body.paymentDate ? new Date(body.paymentDate) : new Date();
      const { number } = await this.seq.next(tx, ctx, 'RECEIPT', 'RCP', date, biz.fyStartMonth);
      const payment = await tx.payment.create({ data: { tenantId: ctx.tenantId, businessId: ctx.businessId, branchId: body.branchId, number, direction: 'IN', kind: 'RECEIPT', mode: body.mode, amount: amount.toString(), paymentDate: date,
        customerId, reference: body.reference, note: body.note, createdById: ctx.userId, allocations: { create: allocations } }, include: { allocations: true } });
      if (customerId) await tx.customer.update({ where: { id: customerId }, data: { balance: { decrement: amount.toString() } } });
      await this.audit.log(tx, ctx, 'payment.receive', 'Payment', payment.id, { summary: `${number} · ₹${amount.toFixed(2)} ${body.mode}`, after: { allocated: amount.minus(left).toString(), advance: left.toString() } });
      await this.notifications.raise(tx, ctx, { type: 'PAYMENT_RECEIVED', title: 'Payment received', body: `₹${amount.toFixed(2)} received by ${body.mode} (${number})`, entity: 'Payment', entityId: payment.id });
      return { ...payment, advance: left.toString() };
    });
  }

  @Post('payments/pay-supplier') @Can('payments.record') @ApiZod(supplierPaymentSchema)
  paySupplier(@CurrentCtx() ctx: Ctx, @ZBody(supplierPaymentSchema) body: z.infer<typeof supplierPaymentSchema>) {
    return this.prisma.tenantTx(ctx.tenantId, async (tx) => {
      await this.branch(tx, ctx, body.branchId);
      if (!(await tx.supplier.findFirst({ where: { id: body.supplierId, businessId: ctx.businessId } }))) throw new NotFoundException('Supplier not found');
      const amount = D(body.amount);
      type Row = { id: string; grandTotal: Prisma.Decimal; returnedAmount: Prisma.Decimal; paidAmount: Prisma.Decimal };
      const only = body.purchaseInvoiceId ? Prisma.sql`AND "id" = ${body.purchaseInvoiceId}::uuid` : Prisma.sql`AND "paymentStatus" <> 'PAID'`;
      const invoices = await tx.$queryRaw<Row[]>`SELECT "id", "grandTotal", "returnedAmount", "paidAmount" FROM "PurchaseInvoice"
        WHERE "supplierId" = ${body.supplierId}::uuid AND "businessId" = ${ctx.businessId}::uuid AND "status" = 'ISSUED' ${only} ORDER BY "invoiceDate", "createdAt" FOR UPDATE`;
      if (body.purchaseInvoiceId && !invoices.length) throw new NotFoundException('Purchase bill not found');
      const dueOf = (i: Row): Decimal => Decimal.max(D(i.grandTotal.toString()).minus(D(i.returnedAmount.toString())).minus(D(i.paidAmount.toString())), 0);
      if (body.purchaseInvoiceId && amount.gt(dueOf(invoices[0]!))) throw new BadRequestException(`Only ₹${dueOf(invoices[0]!).toFixed(2)} is due on this bill`);
      let left = amount;
      const allocations: Array<{ tenantId: string; purchaseInvoiceId: string; amount: string }> = [];
      for (const inv of invoices) {
        if (left.lte(0)) break;
        const take = Decimal.min(left, dueOf(inv));
        if (take.lte(0)) continue;
        const paid = D(inv.paidAmount.toString()).plus(take);
        await tx.purchaseInvoice.update({ where: { id: inv.id }, data: { paidAmount: paid.toString(), paymentStatus: paymentStatus(D(inv.grandTotal.toString()).minus(D(inv.returnedAmount.toString())), paid) } });
        allocations.push({ tenantId: ctx.tenantId, purchaseInvoiceId: inv.id, amount: take.toString() });
        left = left.minus(take);
      }
      const biz = await tx.business.findUniqueOrThrow({ where: { id: ctx.businessId } });
      const date = body.paymentDate ? new Date(body.paymentDate) : new Date();
      const { number } = await this.seq.next(tx, ctx, 'PAYMENT_OUT', 'PAY', date, biz.fyStartMonth);
      const payment = await tx.payment.create({ data: { tenantId: ctx.tenantId, businessId: ctx.businessId, branchId: body.branchId, number, direction: 'OUT', kind: 'SUPPLIER_PAYMENT', mode: body.mode, amount: amount.toString(), paymentDate: date,
        supplierId: body.supplierId, reference: body.reference, note: body.note, createdById: ctx.userId, allocations: { create: allocations } }, include: { allocations: true } });
      await tx.supplier.update({ where: { id: body.supplierId }, data: { balance: { decrement: amount.toString() } } });
      await this.audit.log(tx, ctx, 'payment.pay_supplier', 'Payment', payment.id, { summary: `${number} · ₹${amount.toFixed(2)} ${body.mode}` });
      return { ...payment, advance: left.toString() };
    });
  }

  /* ── expenses ── */
  @Get('expense-categories') @Can('expenses.view')
  expenseCategories(@CurrentCtx() ctx: Ctx) { return this.prisma.tenantTx(ctx.tenantId, (tx) => tx.expenseCategory.findMany({ where: { businessId: ctx.businessId }, orderBy: { name: 'asc' } })); }
  @Post('expense-categories') @Can('expenses.manage') @ApiZod(expenseCategorySchema)
  createExpenseCategory(@CurrentCtx() ctx: Ctx, @ZBody(expenseCategorySchema) body: z.infer<typeof expenseCategorySchema>) {
    return this.prisma.tenantTx(ctx.tenantId, (tx) => tx.expenseCategory.create({ data: { tenantId: ctx.tenantId, businessId: ctx.businessId, name: body.name } }));
  }
  @Get('expenses') @Can('expenses.view')
  expenses(@CurrentCtx() ctx: Ctx, @ZQuery(listQuery) q: ListQuery) {
    return this.prisma.tenantTx(ctx.tenantId, async (tx) => {
      const where: Prisma.ExpenseWhereInput = { businessId: ctx.businessId, expenseDate: dateRange(q.from, q.to), branchId: branchScope(ctx, q.branchId),
        ...(q.q ? { OR: [{ payee: { contains: q.q, mode: 'insensitive' } }, { note: { contains: q.q, mode: 'insensitive' } }] } : {}) };
      const [rows, total, sum] = await Promise.all([
        tx.expense.findMany({ where, include: { category: { select: { name: true } } }, orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }], ...skipTake(q) }),
        tx.expense.count({ where }), tx.expense.aggregate({ where: { ...where, voidedAt: null }, _sum: { amount: true } }),
      ]);
      return { ...page(rows, total, q), totalAmount: sum._sum.amount?.toString() ?? '0' };
    });
  }
  @Post('expenses') @Can('expenses.manage') @ApiZod(expenseSchema)
  createExpense(@CurrentCtx() ctx: Ctx, @ZBody(expenseSchema) body: z.infer<typeof expenseSchema>) {
    return this.prisma.tenantTx(ctx.tenantId, async (tx) => {
      await this.branch(tx, ctx, body.branchId);
      if (!(await tx.expenseCategory.findFirst({ where: { id: body.categoryId, businessId: ctx.businessId } }))) throw new NotFoundException('Expense category not found');
      const e = await tx.expense.create({ data: { tenantId: ctx.tenantId, businessId: ctx.businessId, ...body, expenseDate: body.expenseDate ? new Date(body.expenseDate) : new Date(), createdById: ctx.userId } });
      await this.audit.log(tx, ctx, 'expense.create', 'Expense', e.id, { summary: `₹${e.amount.toString()} ${body.mode}` });
      return e;
    });
  }
  @Post('expenses/:id/void') @HttpCode(200) @Can('expenses.manage')
  voidExpense(@CurrentCtx() ctx: Ctx, @Param('id', ParseUUIDPipe) id: string) {
    return this.prisma.tenantTx(ctx.tenantId, async (tx) => {
      const r = await tx.expense.updateMany({ where: { id, businessId: ctx.businessId, voidedAt: null }, data: { voidedAt: new Date() } });
      if (r.count !== 1) throw new ConflictException('Expense not found or already voided');
      await this.audit.log(tx, ctx, 'expense.void', 'Expense', id);
      return { ok: true };
    });
  }

  /* ── cash register ── */
  /** Expected drawer cash = opening + cash receipts − cash refunds/supplier payments − cash expenses since opening. */
  private async expectedCash(tx: Tx, session: { branchId: string; openedAt: Date; openingCash: Prisma.Decimal }) {
    const since = { gte: session.openedAt };
    const [cashIn, cashOut, exp] = await Promise.all([
      tx.payment.aggregate({ where: { branchId: session.branchId, mode: 'CASH', direction: 'IN', createdAt: since }, _sum: { amount: true } }),
      tx.payment.aggregate({ where: { branchId: session.branchId, mode: 'CASH', direction: 'OUT', createdAt: since }, _sum: { amount: true } }),
      tx.expense.aggregate({ where: { branchId: session.branchId, mode: 'CASH', voidedAt: null, createdAt: since }, _sum: { amount: true } }),
    ]);
    const n = (v: Prisma.Decimal | null): Decimal => D(v?.toString() ?? 0);
    const inflow = n(cashIn._sum.amount), outflow = n(cashOut._sum.amount), expenses = n(exp._sum.amount);
    return { opening: session.openingCash.toString(), cashIn: inflow.toFixed(2), cashOut: outflow.toFixed(2), cashExpenses: expenses.toFixed(2),
      expected: D(session.openingCash.toString()).plus(inflow).minus(outflow).minus(expenses).toFixed(2) };
  }
  @Get('cash/current') @Can('cash.manage')
  cashCurrent(@CurrentCtx() ctx: Ctx, @Query('branchId', ParseUUIDPipe) branchId: string) {
    return this.prisma.tenantTx(ctx.tenantId, async (tx) => {
      await this.branch(tx, ctx, branchId);
      const session = await tx.cashSession.findFirst({ where: { branchId, status: 'OPEN' } });
      const history = await tx.cashSession.findMany({ where: { branchId, status: 'CLOSED' }, orderBy: { closedAt: 'desc' }, take: 15 });
      return { session, summary: session ? await this.expectedCash(tx, session) : null, history };
    });
  }
  @Post('cash/open') @Can('cash.manage') @ApiZod(cashOpenSchema)
  cashOpen(@CurrentCtx() ctx: Ctx, @ZBody(cashOpenSchema) body: z.infer<typeof cashOpenSchema>) {
    return this.prisma.tenantTx(ctx.tenantId, async (tx) => {
      await this.branch(tx, ctx, body.branchId);
      await tx.$queryRaw`SELECT "id" FROM "Branch" WHERE "id" = ${body.branchId}::uuid FOR UPDATE`;
      if (await tx.cashSession.findFirst({ where: { branchId: body.branchId, status: 'OPEN' } })) throw new ConflictException('The cash register is already open for this branch');
      const s = await tx.cashSession.create({ data: { tenantId: ctx.tenantId, businessId: ctx.businessId, branchId: body.branchId, openingCash: body.openingCash, openedById: ctx.userId } });
      await this.audit.log(tx, ctx, 'cash.open', 'CashSession', s.id, { summary: `Opening cash ₹${body.openingCash}` });
      return s;
    });
  }
  @Post('cash/:id/close') @HttpCode(200) @Can('cash.manage') @ApiZod(cashCloseSchema)
  cashClose(@CurrentCtx() ctx: Ctx, @Param('id', ParseUUIDPipe) id: string, @ZBody(cashCloseSchema) body: z.infer<typeof cashCloseSchema>) {
    return this.prisma.tenantTx(ctx.tenantId, async (tx) => {
      const session = await tx.cashSession.findFirst({ where: { id, businessId: ctx.businessId, status: 'OPEN' } });
      if (!session) throw new ConflictException('This register session is not open');
      assertBranchAccess(ctx, session.branchId);
      const summary = await this.expectedCash(tx, session);
      const difference = D(body.countedCash).minus(D(summary.expected));
      const closed = await tx.cashSession.update({ where: { id }, data: { status: 'CLOSED', closedAt: new Date(), closedById: ctx.userId, expectedCash: summary.expected, countedCash: body.countedCash, difference: difference.toString(), note: body.note } });
      await this.audit.log(tx, ctx, 'cash.close', 'CashSession', id, { summary: `Expected ₹${summary.expected}, counted ₹${body.countedCash}, difference ₹${difference.toFixed(2)}` });
      return { ...closed, summary };
    });
  }
}
