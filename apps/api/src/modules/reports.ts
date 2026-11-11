import { BadRequestException, Controller, ForbiddenException, Get, Injectable, Param, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@nexbill/database';
import { D, stateName } from '@nexbill/shared';
import type { Response } from 'express';
import { z } from 'zod';
import { config } from '../config';
import { Can, Ctx, CurrentCtx } from '../common/context';
import { toCsv } from '../common/http';
import { PrismaService, Tx } from '../common/prisma.service';
import { ZQuery } from '../common/zod';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const reportQuery = z.object({
  from: day.optional(), to: day.optional(), branchId: z.string().uuid().optional(),
  group: z.enum(['day', 'week', 'month', 'year']).default('day'), format: z.enum(['json', 'csv']).default('json'),
});
type ReportQuery = z.infer<typeof reportQuery>;
type Row = Record<string, unknown>;

/** Business dates are Indian dates: timestamps are stored in UTC and bucketed in IST. */
const IST = (col: string): Prisma.Sql => Prisma.raw(`((${col} AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata')::date`);
const todayIST = (): string => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
const num = (v: unknown): string => (v == null ? '0' : String(v));
/** Postgres numerics/bigints become plain strings so JSON never carries floats for money. */
const plain = (rows: Row[]): Row[] => rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) =>
  [k, typeof v === 'bigint' ? Number(v) : v instanceof Prisma.Decimal ? v.toString() : v instanceof Date ? v.toISOString().slice(0, 10) : v])));

interface Scope { b: string; from: string; to: string; branches: string[] | null }

@Injectable()
export class ReportService {
  scope(ctx: Ctx, q: ReportQuery): Scope {
    const to = q.to ?? todayIST();
    const from = q.from ?? new Date(new Date(to).getTime() - 29 * 86400000).toISOString().slice(0, 10);
    if (from > to) throw new BadRequestException('The start date is after the end date');
    if (q.branchId && ctx.branchIds.length && !ctx.branchIds.includes(q.branchId)) throw new ForbiddenException('You do not have access to this branch');
    return { b: ctx.businessId, from, to, branches: q.branchId ? [q.branchId] : ctx.branchIds.length ? ctx.branchIds : null };
  }
  private br(s: Scope, col: string): Prisma.Sql {
    return s.branches ? Prisma.sql`AND ${Prisma.raw(col)} = ANY(${s.branches}::uuid[])` : Prisma.empty;
  }
  private inv(s: Scope, alias = 'i'): Prisma.Sql {
    return Prisma.sql`${Prisma.raw(alias)}."businessId" = ${s.b}::uuid AND ${Prisma.raw(alias)}."status" = 'ISSUED'
      AND ${IST(`${alias}."invoiceDate"`)} BETWEEN ${s.from}::date AND ${s.to}::date ${this.br(s, `${alias}."branchId"`)}`;
  }

  async salesSummary(tx: Tx, s: Scope, group: string): Promise<Row[]> {
    const g = Prisma.raw(`'${group}'`);
    return plain(await tx.$queryRaw<Row[]>`
      SELECT date_trunc(${g}, ${IST('i."invoiceDate"')})::date AS "period", COUNT(*) AS "invoices",
             SUM(i."taxableTotal") AS "taxable", SUM(i."taxTotal") AS "tax", SUM(i."grandTotal") AS "total",
             SUM(i."returnedAmount") AS "returns", SUM(i."grandTotal" - i."returnedAmount") AS "netSales"
      FROM "SalesInvoice" i WHERE ${this.inv(s)} GROUP BY 1 ORDER BY 1`);
  }

  /**
   * Profit figures, kept deliberately separate:
   *  revenue        – taxable value of sales net of returns (GST collected is never revenue)
   *  grossProfit    – revenue − cost of goods sold (cost captured on each line when it was sold)
   *  estNetProfit   – grossProfit − recorded expenses (an estimate: no depreciation, interest or tax)
   *  cash movement  – reported separately; it is neither revenue nor profit
   */
  async profit(tx: Tx, s: Scope): Promise<Row> {
    const [sales] = await tx.$queryRaw<Row[]>`
      SELECT COALESCE(SUM(it."taxableValue"), 0) AS revenue, COALESCE(SUM(it."baseQuantity" * it."costPrice"), 0) AS cogs
      FROM "SalesInvoiceItem" it JOIN "SalesInvoice" i ON i."id" = it."invoiceId" WHERE ${this.inv(s)}`;
    const [returns] = await tx.$queryRaw<Row[]>`
      SELECT COALESCE(SUM(ri."taxableValue"), 0) AS revenue,
             COALESCE(SUM(CASE WHEN ri."condition" = 'GOOD' THEN ri."baseQuantity" * ri."costPrice" ELSE 0 END), 0) AS cogs
      FROM "SalesReturnItem" ri JOIN "SalesReturn" r ON r."id" = ri."returnId"
      WHERE r."businessId" = ${s.b}::uuid AND ${IST('r."returnDate"')} BETWEEN ${s.from}::date AND ${s.to}::date ${this.br(s, 'r."branchId"')}`;
    const [exp] = await tx.$queryRaw<Row[]>`
      SELECT COALESCE(SUM(e."amount"), 0) AS total FROM "Expense" e
      WHERE e."businessId" = ${s.b}::uuid AND e."voidedAt" IS NULL AND ${IST('e."expenseDate"')} BETWEEN ${s.from}::date AND ${s.to}::date ${this.br(s, 'e."branchId"')}`;
    const [pur] = await tx.$queryRaw<Row[]>`
      SELECT COALESCE(SUM(p."grandTotal" - p."returnedAmount"), 0) AS total FROM "PurchaseInvoice" p
      WHERE p."businessId" = ${s.b}::uuid AND p."status" = 'ISSUED' AND ${IST('p."invoiceDate"')} BETWEEN ${s.from}::date AND ${s.to}::date ${this.br(s, 'p."branchId"')}`;
    const [cash] = await tx.$queryRaw<Row[]>`
      SELECT COALESCE(SUM(CASE WHEN p."direction" = 'IN' THEN p."amount" ELSE 0 END), 0) AS inflow,
             COALESCE(SUM(CASE WHEN p."direction" = 'OUT' THEN p."amount" ELSE 0 END), 0) AS outflow
      FROM "Payment" p WHERE p."businessId" = ${s.b}::uuid AND ${IST('p."paymentDate"')} BETWEEN ${s.from}::date AND ${s.to}::date ${this.br(s, 'p."branchId"')}`;
    const revenue = D(num(sales!.revenue)).minus(D(num(returns!.revenue)));
    const cogs = D(num(sales!.cogs)).minus(D(num(returns!.cogs)));
    const gross = revenue.minus(cogs), expenses = D(num(exp!.total));
    const inflow = D(num(cash!.inflow)), outflow = D(num(cash!.outflow)).plus(expenses);
    return {
      revenue: revenue.toFixed(2), costOfGoodsSold: cogs.toFixed(2), grossProfit: gross.toFixed(2),
      grossMarginPct: revenue.isZero() ? '0.00' : gross.div(revenue).mul(100).toFixed(2),
      expenses: expenses.toFixed(2), estimatedNetProfit: gross.minus(expenses).toFixed(2), purchases: D(num(pur!.total)).toFixed(2),
      moneyIn: inflow.toFixed(2), moneyOut: outflow.toFixed(2), netCashMovement: inflow.minus(outflow).toFixed(2),
    };
  }

  async paymentModes(tx: Tx, s: Scope): Promise<Row[]> {
    return plain(await tx.$queryRaw<Row[]>`
      SELECT p."mode", COUNT(*) AS "count", SUM(p."amount") AS "amount" FROM "Payment" p
      WHERE p."businessId" = ${s.b}::uuid AND p."direction" = 'IN' AND ${IST('p."paymentDate"')} BETWEEN ${s.from}::date AND ${s.to}::date ${this.br(s, 'p."branchId"')}
      GROUP BY 1 ORDER BY 3 DESC`);
  }
  async topProducts(tx: Tx, s: Scope, limit = 20): Promise<Row[]> {
    return plain(await tx.$queryRaw<Row[]>`
      SELECT it."variantId", MAX(it."description") AS "name", SUM(it."baseQuantity") AS "quantity", SUM(it."taxableValue") AS "revenue",
             SUM(it."taxableValue" - it."baseQuantity" * it."costPrice") AS "grossProfit"
      FROM "SalesInvoiceItem" it JOIN "SalesInvoice" i ON i."id" = it."invoiceId" WHERE ${this.inv(s)}
      GROUP BY 1 ORDER BY "revenue" DESC LIMIT ${limit}`);
  }
  /** Stocked items ranked by how little they sold in the period; "dead" = no sale at all. */
  async slowMoving(tx: Tx, s: Scope, deadOnly: boolean): Promise<Row[]> {
    const dead = deadOnly ? Prisma.sql`AND COALESCE(MAX(sold.qty), 0) = 0` : Prisma.empty;
    return plain(await tx.$queryRaw<Row[]>`
      SELECT v."id" AS "variantId", p."name" || CASE WHEN v."name" <> '' THEN ' – ' || v."name" ELSE '' END AS "name", v."sku",
             SUM(b."quantity") AS "stock", SUM(b."quantity") * v."avgCost" AS "stockValue", COALESCE(MAX(sold.qty), 0) AS "soldInPeriod", MAX(sold.last) AS "lastSold"
      FROM "ProductVariant" v JOIN "Product" p ON p."id" = v."productId" JOIN "InventoryBalance" b ON b."variantId" = v."id"
      LEFT JOIN (SELECT it."variantId", SUM(it."baseQuantity") AS qty, MAX(${IST('i."invoiceDate"')}) AS last
                 FROM "SalesInvoiceItem" it JOIN "SalesInvoice" i ON i."id" = it."invoiceId" WHERE ${this.inv(s)} GROUP BY 1) sold ON sold."variantId" = v."id"
      WHERE v."businessId" = ${s.b}::uuid GROUP BY v."id", p."name"
      HAVING SUM(b."quantity") > 0 ${dead}
      ORDER BY "soldInPeriod" ASC, "stockValue" DESC LIMIT 200`);
  }
  async stockValuation(tx: Tx, s: Scope): Promise<Row[]> {
    return plain(await tx.$queryRaw<Row[]>`
      SELECT p."name" || CASE WHEN v."name" <> '' THEN ' – ' || v."name" ELSE '' END AS "name", v."sku", c."name" AS "category", w."name" AS "warehouse",
             b."quantity", v."avgCost", b."quantity" * v."avgCost" AS "costValue", b."quantity" * v."sellingPrice" AS "retailValue"
      FROM "InventoryBalance" b JOIN "ProductVariant" v ON v."id" = b."variantId" JOIN "Product" p ON p."id" = v."productId"
      JOIN "Warehouse" w ON w."id" = b."warehouseId" LEFT JOIN "Category" c ON c."id" = p."categoryId"
      WHERE b."businessId" = ${s.b}::uuid AND b."quantity" <> 0 ${this.br(s, 'w."branchId"')} ORDER BY "costValue" DESC LIMIT 5000`);
  }
  async receivables(tx: Tx, s: Scope): Promise<Row[]> {
    return plain(await tx.$queryRaw<Row[]>`
      SELECT c."id", c."name", c."phone", c."balance", c."creditLimit",
             (SELECT MIN(${IST('i."invoiceDate"')}) FROM "SalesInvoice" i WHERE i."customerId" = c."id" AND i."status" = 'ISSUED' AND i."paymentStatus" <> 'PAID') AS "oldestDue",
             (SELECT COUNT(*) FROM "SalesInvoice" i WHERE i."customerId" = c."id" AND i."status" = 'ISSUED' AND i."paymentStatus" <> 'PAID' AND i."dueDate" < now()) AS "overdueInvoices"
      FROM "Customer" c WHERE c."businessId" = ${s.b}::uuid AND c."balance" > 0 ORDER BY c."balance" DESC LIMIT 2000`);
  }
  async payables(tx: Tx, s: Scope): Promise<Row[]> {
    return plain(await tx.$queryRaw<Row[]>`SELECT "id", "name", "phone", "balance" FROM "Supplier" WHERE "businessId" = ${s.b}::uuid AND "balance" > 0 ORDER BY "balance" DESC LIMIT 2000`);
  }
  async expensesByCategory(tx: Tx, s: Scope): Promise<Row[]> {
    return plain(await tx.$queryRaw<Row[]>`
      SELECT c."name" AS "category", COUNT(*) AS "count", SUM(e."amount") AS "amount" FROM "Expense" e JOIN "ExpenseCategory" c ON c."id" = e."categoryId"
      WHERE e."businessId" = ${s.b}::uuid AND e."voidedAt" IS NULL AND ${IST('e."expenseDate"')} BETWEEN ${s.from}::date AND ${s.to}::date ${this.br(s, 'e."branchId"')}
      GROUP BY 1 ORDER BY 3 DESC`);
  }
  async purchasesBySupplier(tx: Tx, s: Scope): Promise<Row[]> {
    return plain(await tx.$queryRaw<Row[]>`
      SELECT sp."name" AS "supplier", COUNT(*) AS "bills", SUM(p."taxableTotal") AS "taxable", SUM(p."grandTotal") AS "total", SUM(p."grandTotal" - p."returnedAmount" - p."paidAmount") AS "unpaid"
      FROM "PurchaseInvoice" p JOIN "Supplier" sp ON sp."id" = p."supplierId"
      WHERE p."businessId" = ${s.b}::uuid AND p."status" = 'ISSUED' AND ${IST('p."invoiceDate"')} BETWEEN ${s.from}::date AND ${s.to}::date ${this.br(s, 'p."branchId"')}
      GROUP BY 1 ORDER BY 4 DESC`);
  }
  async branchComparison(tx: Tx, s: Scope): Promise<Row[]> {
    return plain(await tx.$queryRaw<Row[]>`
      SELECT br."name" AS "branch", COUNT(i."id") AS "invoices", COALESCE(SUM(i."grandTotal" - i."returnedAmount"), 0) AS "netSales",
             COALESCE(AVG(i."grandTotal"), 0)::numeric(14,2) AS "averageBill",
             (SELECT COALESCE(SUM(e."amount"), 0) FROM "Expense" e WHERE e."branchId" = br."id" AND e."voidedAt" IS NULL AND ${IST('e."expenseDate"')} BETWEEN ${s.from}::date AND ${s.to}::date) AS "expenses"
      FROM "Branch" br LEFT JOIN "SalesInvoice" i ON i."branchId" = br."id" AND i."status" = 'ISSUED' AND ${IST('i."invoiceDate"')} BETWEEN ${s.from}::date AND ${s.to}::date
      WHERE br."businessId" = ${s.b}::uuid ${this.br(s, 'br."id"')} GROUP BY br."id" ORDER BY "netSales" DESC`);
  }

  /* ───────── GST ───────── */
  async taxSummary(tx: Tx, s: Scope): Promise<Row[]> {
    return plain(await tx.$queryRaw<Row[]>`
      SELECT it."gstRate", SUM(it."taxableValue") AS "taxable", SUM(it."cgst") AS "cgst", SUM(it."sgst") AS "sgst", SUM(it."igst") AS "igst", SUM(it."cess") AS "cess"
      FROM "SalesInvoiceItem" it JOIN "SalesInvoice" i ON i."id" = it."invoiceId" WHERE ${this.inv(s)} GROUP BY 1 ORDER BY 1`);
  }
  async salesRegister(tx: Tx, s: Scope): Promise<Row[]> {
    return plain(await tx.$queryRaw<Row[]>`
      SELECT i."number", ${IST('i."invoiceDate"')} AS "date", i."docType", i."customerName", i."customerGstin", i."placeOfSupply", i."supplyType",
             i."taxableTotal", i."cgstTotal", i."sgstTotal", i."igstTotal", i."cessTotal", i."roundOff", i."grandTotal", i."status"
      FROM "SalesInvoice" i WHERE i."businessId" = ${s.b}::uuid AND i."status" <> 'DRAFT'
        AND ${IST('i."invoiceDate"')} BETWEEN ${s.from}::date AND ${s.to}::date ${this.br(s, 'i."branchId"')} ORDER BY i."invoiceDate", i."number" LIMIT 50000`);
  }
  async purchaseRegister(tx: Tx, s: Scope): Promise<Row[]> {
    return plain(await tx.$queryRaw<Row[]>`
      SELECT p."number", p."supplierInvoiceNo", ${IST('p."invoiceDate"')} AS "date", sp."name" AS "supplier", sp."gstin" AS "supplierGstin", p."supplyType",
             p."taxableTotal", p."cgstTotal", p."sgstTotal", p."igstTotal", p."cessTotal", p."grandTotal"
      FROM "PurchaseInvoice" p JOIN "Supplier" sp ON sp."id" = p."supplierId"
      WHERE p."businessId" = ${s.b}::uuid AND p."status" = 'ISSUED' AND ${IST('p."invoiceDate"')} BETWEEN ${s.from}::date AND ${s.to}::date ${this.br(s, 'p."branchId"')}
      ORDER BY p."invoiceDate" LIMIT 50000`);
  }
  async hsnSummary(tx: Tx, s: Scope): Promise<Row[]> {
    return plain(await tx.$queryRaw<Row[]>`
      SELECT COALESCE(it."hsnCode", '') AS "hsnCode", MAX(it."description") AS "description", it."unitCode" AS "uqc", it."gstRate",
             SUM(it."quantity") AS "quantity", SUM(it."taxableValue") AS "taxable", SUM(it."cgst") AS "cgst", SUM(it."sgst") AS "sgst", SUM(it."igst") AS "igst", SUM(it."cess") AS "cess",
             SUM(it."lineTotal") AS "totalValue"
      FROM "SalesInvoiceItem" it JOIN "SalesInvoice" i ON i."id" = it."invoiceId" WHERE ${this.inv(s)} GROUP BY 1, 3, 4 ORDER BY 1, 4`);
  }

  /** GSTR-1 preparation data (outward supplies). For review and upload through a GSP; nothing is filed from here. */
  async gstr1(tx: Tx, s: Scope) {
    const lines = Prisma.sql`
      FROM "SalesInvoiceItem" it JOIN "SalesInvoice" i ON i."id" = it."invoiceId" WHERE ${this.inv(s)}`;
    const b2b = await tx.$queryRaw<Row[]>`
      SELECT i."customerGstin" AS "gstin", i."customerName" AS "receiver", i."number", ${IST('i."invoiceDate"')} AS "date", i."grandTotal" AS "invoiceValue", i."placeOfSupply",
             it."gstRate" AS "rate", SUM(it."taxableValue") AS "taxable", SUM(it."cgst") AS "cgst", SUM(it."sgst") AS "sgst", SUM(it."igst") AS "igst", SUM(it."cess") AS "cess"
      ${lines} AND i."customerGstin" IS NOT NULL GROUP BY i."id", it."gstRate" ORDER BY i."invoiceDate", i."number"`;
    const b2cl = await tx.$queryRaw<Row[]>`
      SELECT i."number", ${IST('i."invoiceDate"')} AS "date", i."grandTotal" AS "invoiceValue", i."placeOfSupply", it."gstRate" AS "rate", SUM(it."taxableValue") AS "taxable", SUM(it."igst") AS "igst", SUM(it."cess") AS "cess"
      ${lines} AND i."customerGstin" IS NULL AND i."supplyType" = 'INTER_STATE' AND i."grandTotal" > ${config.b2cLargeThreshold}
      GROUP BY i."id", it."gstRate" ORDER BY i."invoiceDate", i."number"`;
    const b2cs = await tx.$queryRaw<Row[]>`
      SELECT i."placeOfSupply", i."supplyType", it."gstRate" AS "rate", SUM(it."taxableValue") AS "taxable", SUM(it."cgst") AS "cgst", SUM(it."sgst") AS "sgst", SUM(it."igst") AS "igst", SUM(it."cess") AS "cess"
      ${lines} AND i."customerGstin" IS NULL AND NOT (i."supplyType" = 'INTER_STATE' AND i."grandTotal" > ${config.b2cLargeThreshold})
      GROUP BY 1, 2, 3 ORDER BY 1, 3`;
    const creditNotes = await tx.$queryRaw<Row[]>`
      SELECT r."number" AS "noteNumber", ${IST('r."returnDate"')} AS "noteDate", i."number" AS "invoiceNumber", i."customerGstin" AS "gstin", i."customerName" AS "receiver", i."placeOfSupply",
             CASE WHEN i."customerGstin" IS NULL THEN 'CDNUR' ELSE 'CDNR' END AS "section",
             r."taxableTotal" AS "taxable", r."cgstTotal" AS "cgst", r."sgstTotal" AS "sgst", r."igstTotal" AS "igst", r."cessTotal" AS "cess", r."total" AS "noteValue"
      FROM "SalesReturn" r JOIN "SalesInvoice" i ON i."id" = r."invoiceId"
      WHERE r."businessId" = ${s.b}::uuid AND ${IST('r."returnDate"')} BETWEEN ${s.from}::date AND ${s.to}::date ${this.br(s, 'r."branchId"')} ORDER BY r."returnDate"`;
    const [docs] = await tx.$queryRaw<Row[]>`
      SELECT MIN(i."number") AS "from", MAX(i."number") AS "to", COUNT(*) AS "total", COUNT(*) FILTER (WHERE i."status" = 'CANCELLED') AS "cancelled"
      FROM "SalesInvoice" i WHERE i."businessId" = ${s.b}::uuid AND i."status" <> 'DRAFT' AND ${IST('i."invoiceDate"')} BETWEEN ${s.from}::date AND ${s.to}::date ${this.br(s, 'i."branchId"')}`;
    const pos = (rows: Row[]): Row[] => plain(rows).map((r) => ({ ...r, placeOfSupplyName: stateName(r.placeOfSupply as string) }));
    return { period: { from: s.from, to: s.to }, b2b: pos(b2b), b2cl: pos(b2cl), b2cs: pos(b2cs), creditNotes: pos(creditNotes), hsn: await this.hsnSummary(tx, s), documents: plain([docs!])[0],
      disclaimer: 'Preparation data only. NEXBILL does not file returns. Verify against current GST rules and file through the GST portal or an authorised GSP.' };
  }

  /** GSTR-3B style summary: outward tax liability and input tax credit from recorded purchases. */
  async gstr3b(tx: Tx, s: Scope) {
    const [out] = await tx.$queryRaw<Row[]>`
      SELECT COALESCE(SUM(it."taxableValue") FILTER (WHERE it."gstRate" > 0), 0) AS "taxable", COALESCE(SUM(it."taxableValue") FILTER (WHERE it."gstRate" = 0), 0) AS "nilExempt",
             COALESCE(SUM(it."cgst"), 0) AS "cgst", COALESCE(SUM(it."sgst"), 0) AS "sgst", COALESCE(SUM(it."igst"), 0) AS "igst", COALESCE(SUM(it."cess"), 0) AS "cess"
      FROM "SalesInvoiceItem" it JOIN "SalesInvoice" i ON i."id" = it."invoiceId" WHERE ${this.inv(s)}`;
    const [cn] = await tx.$queryRaw<Row[]>`
      SELECT COALESCE(SUM(r."taxableTotal"), 0) AS "taxable", COALESCE(SUM(r."cgstTotal"), 0) AS "cgst", COALESCE(SUM(r."sgstTotal"), 0) AS "sgst", COALESCE(SUM(r."igstTotal"), 0) AS "igst", COALESCE(SUM(r."cessTotal"), 0) AS "cess"
      FROM "SalesReturn" r WHERE r."businessId" = ${s.b}::uuid AND ${IST('r."returnDate"')} BETWEEN ${s.from}::date AND ${s.to}::date ${this.br(s, 'r."branchId"')}`;
    const [itc] = await tx.$queryRaw<Row[]>`
      SELECT COALESCE(SUM(p."taxableTotal"), 0) AS "taxable", COALESCE(SUM(p."cgstTotal"), 0) AS "cgst", COALESCE(SUM(p."sgstTotal"), 0) AS "sgst", COALESCE(SUM(p."igstTotal"), 0) AS "igst", COALESCE(SUM(p."cessTotal"), 0) AS "cess"
      FROM "PurchaseInvoice" p WHERE p."businessId" = ${s.b}::uuid AND p."status" = 'ISSUED' AND ${IST('p."invoiceDate"')} BETWEEN ${s.from}::date AND ${s.to}::date ${this.br(s, 'p."branchId"')}`;
    const [dn] = await tx.$queryRaw<Row[]>`
      SELECT COALESCE(SUM(r."taxTotal"), 0) AS "tax" FROM "PurchaseReturn" r WHERE r."businessId" = ${s.b}::uuid AND ${IST('r."returnDate"')} BETWEEN ${s.from}::date AND ${s.to}::date`;
    const [interUnreg] = await tx.$queryRaw<Row[]>`
      SELECT COALESCE(SUM(i."taxableTotal"), 0) AS "taxable", COALESCE(SUM(i."igstTotal"), 0) AS "igst" FROM "SalesInvoice" i WHERE ${this.inv(s)} AND i."supplyType" = 'INTER_STATE' AND i."customerGstin" IS NULL`;
    const net = (a: unknown, b: unknown): string => D(num(a)).minus(D(num(b))).toFixed(2);
    const outward = { taxable: net(out!.taxable, cn!.taxable), cgst: net(out!.cgst, cn!.cgst), sgst: net(out!.sgst, cn!.sgst), igst: net(out!.igst, cn!.igst), cess: net(out!.cess, cn!.cess) };
    const itcTax = D(num(itc!.cgst)).plus(D(num(itc!.sgst))).plus(D(num(itc!.igst))).plus(D(num(itc!.cess)));
    const outTax = D(outward.cgst).plus(D(outward.sgst)).plus(D(outward.igst)).plus(D(outward.cess));
    return {
      period: { from: s.from, to: s.to },
      outwardTaxable: outward, nilRatedExempt: num(out!.nilExempt), interStateToUnregistered: plain([interUnreg!])[0],
      inputTaxCredit: { ...plain([itc!])[0], purchaseReturnTaxReversed: num(dn!.tax), note: 'ITC shown is from recorded purchase bills; eligibility must be reconciled with GSTR-2B.' },
      estimatedNetTaxPayable: outTax.minus(itcTax).plus(D(num(dn!.tax))).toFixed(2),
      disclaimer: 'Summary for return preparation only. Not a filed return.',
    };
  }

  /* ───────── dashboard ───────── */
  async dashboard(tx: Tx, ctx: Ctx, s: Scope) {
    const today: Scope = { ...s, from: todayIST(), to: todayIST() };
    const [t] = await tx.$queryRaw<Row[]>`SELECT COUNT(*) AS "invoices", COALESCE(SUM(i."grandTotal" - i."returnedAmount"), 0) AS "revenue" FROM "SalesInvoice" i WHERE ${this.inv(today)}`;
    const [r] = await tx.$queryRaw<Row[]>`SELECT COUNT(*) AS "invoices", COALESCE(SUM(i."grandTotal" - i."returnedAmount"), 0) AS "sales", COALESCE(AVG(i."grandTotal"), 0)::numeric(14,2) AS "avg" FROM "SalesInvoice" i WHERE ${this.inv(s)}`;
    const [recv] = await tx.$queryRaw<Row[]>`SELECT COALESCE(SUM("balance"), 0) AS v FROM "Customer" WHERE "businessId" = ${s.b}::uuid AND "balance" > 0`;
    const [pay] = await tx.$queryRaw<Row[]>`SELECT COALESCE(SUM("balance"), 0) AS v FROM "Supplier" WHERE "businessId" = ${s.b}::uuid AND "balance" > 0`;
    const [stock] = await tx.$queryRaw<Row[]>`
      SELECT COALESCE(SUM(b."quantity" * v."avgCost"), 0) AS v FROM "InventoryBalance" b JOIN "ProductVariant" v ON v."id" = b."variantId" JOIN "Warehouse" w ON w."id" = b."warehouseId"
      WHERE b."businessId" = ${s.b}::uuid AND b."quantity" > 0 ${this.br(s, 'w."branchId"')}`;
    const lowStock = plain(await tx.$queryRaw<Row[]>`
      SELECT v."id" AS "variantId", p."name" || CASE WHEN v."name" <> '' THEN ' – ' || v."name" ELSE '' END AS "name", v."sku", COALESCE(SUM(b."quantity"), 0) AS "quantity", GREATEST(v."minStock", v."reorderLevel") AS "threshold"
      FROM "ProductVariant" v JOIN "Product" p ON p."id" = v."productId" LEFT JOIN "InventoryBalance" b ON b."variantId" = v."id"
      WHERE v."businessId" = ${s.b}::uuid AND v."isActive" AND p."isActive" AND p."trackInventory" AND GREATEST(v."minStock", v."reorderLevel") > 0
      GROUP BY v."id", p."name" HAVING COALESCE(SUM(b."quantity"), 0) <= GREATEST(v."minStock", v."reorderLevel") ORDER BY 4 ASC LIMIT 8`);
    const [lowCount] = await tx.$queryRaw<Row[]>`
      SELECT COUNT(*) AS n FROM (SELECT 1 FROM "ProductVariant" v JOIN "Product" p ON p."id" = v."productId" LEFT JOIN "InventoryBalance" b ON b."variantId" = v."id"
      WHERE v."businessId" = ${s.b}::uuid AND v."isActive" AND p."isActive" AND p."trackInventory" AND GREATEST(v."minStock", v."reorderLevel") > 0
      GROUP BY v."id" HAVING COALESCE(SUM(b."quantity"), 0) <= GREATEST(v."minStock", v."reorderLevel")) x`;
    const recent = await tx.salesInvoice.findMany({
      where: { businessId: s.b, status: { not: 'DRAFT' }, ...(s.branches ? { branchId: { in: s.branches } } : {}) }, orderBy: { createdAt: 'desc' }, take: 8,
      select: { id: true, number: true, customerName: true, grandTotal: true, paymentStatus: true, status: true, invoiceDate: true },
    });
    const showProfit = ctx.permissions.includes('reports.profit');
    const profit = await this.profit(tx, s);
    const todayInvoices = Number(t!.invoices);
    return {
      range: { from: s.from, to: s.to },
      today: { revenue: num(t!.revenue), invoices: todayInvoices, averageBill: todayInvoices ? D(num(t!.revenue)).div(todayInvoices).toFixed(2) : '0.00' },
      period: { sales: num(r!.sales), invoices: Number(r!.invoices), averageBill: num(r!.avg), purchases: profit.purchases, expenses: profit.expenses,
        grossProfit: showProfit ? profit.grossProfit : null, estimatedNetProfit: showProfit ? profit.estimatedNetProfit : null, grossMarginPct: showProfit ? profit.grossMarginPct : null },
      receivables: num(recv!.v), payables: num(pay!.v), inventoryValue: ctx.permissions.includes('products.view_cost') ? num(stock!.v) : null,
      lowStockCount: Number(lowCount!.n), lowStock, topProducts: (await this.topProducts(tx, s, 6)).map((p) => (showProfit ? p : { ...p, grossProfit: null })),
      recentInvoices: recent, salesTrend: await this.salesSummary(tx, s, 'day'), paymentBreakdown: await this.paymentModes(tx, s),
    };
  }
}

const REPORTS = ['sales-summary', 'profit', 'payment-modes', 'top-products', 'slow-moving', 'dead-stock', 'stock-valuation', 'receivables', 'payables',
  'expenses', 'purchases', 'branch-comparison', 'tax-summary', 'sales-register', 'purchase-register', 'hsn-summary', 'gstr1', 'gstr3b'] as const;
type ReportName = (typeof REPORTS)[number];
const GST_REPORTS: ReportName[] = ['tax-summary', 'sales-register', 'purchase-register', 'hsn-summary', 'gstr1', 'gstr3b'];
const PROFIT_REPORTS: ReportName[] = ['profit', 'stock-valuation'];

@ApiTags('reports') @ApiBearerAuth()
@Controller()
export class ReportsController {
  constructor(private readonly prisma: PrismaService, private readonly reports: ReportService) {}

  @Get('dashboard') @Can('dashboard.view')
  dashboard(@CurrentCtx() ctx: Ctx, @ZQuery(reportQuery) q: ReportQuery) {
    return this.prisma.tenantTx(ctx.tenantId, (tx) => this.reports.dashboard(tx, ctx, this.reports.scope(ctx, q)));
  }

  @Get('reports/:name')
  async report(@CurrentCtx() ctx: Ctx, @Param('name') name: ReportName, @ZQuery(reportQuery) q: ReportQuery, @Res({ passthrough: true }) res: Response) {
    if (!REPORTS.includes(name)) throw new BadRequestException('Unknown report');
    const need = (p: string): void => { if (!ctx.permissions.includes(p)) throw new ForbiddenException(`Missing permission: ${p}`); };
    need(GST_REPORTS.includes(name) ? 'gst.view' : 'reports.view');
    if (PROFIT_REPORTS.includes(name)) need('reports.profit');
    if (q.format === 'csv') need('reports.export');
    const s = this.reports.scope(ctx, q);
    const data = await this.prisma.tenantTx(ctx.tenantId, async (tx): Promise<unknown> => {
      switch (name) {
        case 'sales-summary': return this.reports.salesSummary(tx, s, q.group);
        case 'profit': return this.reports.profit(tx, s);
        case 'payment-modes': return this.reports.paymentModes(tx, s);
        case 'top-products': return (await this.reports.topProducts(tx, s, 100)).map((p) => (ctx.permissions.includes('reports.profit') ? p : { ...p, grossProfit: null }));
        case 'slow-moving': return this.reports.slowMoving(tx, s, false);
        case 'dead-stock': return this.reports.slowMoving(tx, s, true);
        case 'stock-valuation': return this.reports.stockValuation(tx, s);
        case 'receivables': return this.reports.receivables(tx, s);
        case 'payables': return this.reports.payables(tx, s);
        case 'expenses': return this.reports.expensesByCategory(tx, s);
        case 'purchases': return this.reports.purchasesBySupplier(tx, s);
        case 'branch-comparison': return this.reports.branchComparison(tx, s);
        case 'tax-summary': return this.reports.taxSummary(tx, s);
        case 'sales-register': return this.reports.salesRegister(tx, s);
        case 'purchase-register': return this.reports.purchaseRegister(tx, s);
        case 'hsn-summary': return this.reports.hsnSummary(tx, s);
        case 'gstr1': return this.reports.gstr1(tx, s);
        case 'gstr3b': return this.reports.gstr3b(tx, s);
      }
    });
    if (q.format === 'csv') {
      const rows = Array.isArray(data) ? (data as Row[]) : name === 'gstr1' ? [...(data as { b2b: Row[] }).b2b.map((r) => ({ section: 'B2B', ...r }))] : [data as Row];
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${name}_${s.from}_${s.to}.csv"`);
      return toCsv(rows);
    }
    return { name, from: s.from, to: s.to, data };
  }
}
