import Decimal from 'decimal.js';
import { D, ZERO, round, sum, type Numeric } from './money';
import type { SupplyType } from './gst';

export type DiscountType = 'PERCENT' | 'AMOUNT';
export interface Discount { type: DiscountType; value: Numeric }

export interface TaxLineInput {
  /** Caller reference (e.g. variant id); echoed back. */
  ref?: string;
  quantity: Numeric;
  unitPrice: Numeric;
  /** true when unitPrice already contains GST (MRP-style pricing). */
  priceIncludesTax: boolean;
  discount?: Discount | null;
  gstRate: Numeric;
  cessRate?: Numeric;
  /** Exempt / nil-rated / non-GST goods: no tax regardless of rate. */
  exempt?: boolean;
  hsnCode?: string | null;
}

export interface TaxInvoiceInput {
  lines: TaxLineInput[];
  invoiceDiscount?: Discount | null;
  supplyType: SupplyType;
  /** false for unregistered / composition sellers issuing a bill of supply: no tax is charged. */
  chargeTax?: boolean;
  /** Round the grand total to the nearest rupee and report the difference. */
  roundOff?: boolean;
}

export interface TaxLineResult {
  ref?: string;
  quantity: Decimal;
  unitPrice: Decimal;
  grossAmount: Decimal;
  lineDiscount: Decimal;
  invoiceDiscountShare: Decimal;
  taxableValue: Decimal;
  gstRate: Decimal;
  cessRate: Decimal;
  cgst: Decimal;
  sgst: Decimal;
  igst: Decimal;
  cess: Decimal;
  taxTotal: Decimal;
  lineTotal: Decimal;
  hsnCode: string | null;
}

export interface TaxBucket {
  key: string; gstRate: Decimal; taxableValue: Decimal;
  cgst: Decimal; sgst: Decimal; igst: Decimal; cess: Decimal; quantity: Decimal;
}

export interface TaxInvoiceResult {
  lines: TaxLineResult[];
  subTotal: Decimal;
  lineDiscountTotal: Decimal;
  invoiceDiscountTotal: Decimal;
  taxableTotal: Decimal;
  cgstTotal: Decimal;
  sgstTotal: Decimal;
  igstTotal: Decimal;
  cessTotal: Decimal;
  taxTotal: Decimal;
  roundOff: Decimal;
  grandTotal: Decimal;
  rateSummary: TaxBucket[];
  hsnSummary: TaxBucket[];
}

const HUNDRED = new Decimal(100);

function discountAmount(base: Decimal, d?: Discount | null): Decimal {
  if (!d) return ZERO;
  const v = D(d.value);
  if (v.isNegative()) throw new Error('Discount cannot be negative');
  if (d.type === 'PERCENT') {
    if (v.gt(100)) throw new Error('Percentage discount cannot exceed 100');
    return round(base.mul(v).div(HUNDRED));
  }
  if (v.gt(base)) throw new Error('Discount cannot exceed the amount it applies to');
  return round(v);
}

/**
 * Pure GST invoice calculator.
 *
 * Rules:
 *  - line discount applies to quantity x unit price; invoice discount is spread pro-rata over lines
 *    (largest-remainder so the shares always add up exactly);
 *  - for tax-inclusive prices the taxable value is back-computed from the discounted price;
 *  - intra-state supplies split GST equally into CGST + SGST, inter-state charge IGST;
 *  - every component is rounded to paise per line (as printed on the invoice), totals are sums of lines.
 */
export function computeInvoice(input: TaxInvoiceInput): TaxInvoiceResult {
  const chargeTax = input.chargeTax !== false;
  if (input.lines.length === 0) throw new Error('An invoice needs at least one line');

  const pre = input.lines.map((l) => {
    const quantity = D(l.quantity);
    const unitPrice = D(l.unitPrice);
    if (quantity.lte(0)) throw new Error('Quantity must be greater than zero');
    if (unitPrice.isNegative()) throw new Error('Unit price cannot be negative');
    const grossAmount = round(quantity.mul(unitPrice));
    const lineDiscount = discountAmount(grossAmount, l.discount);
    return { l, quantity, unitPrice, grossAmount, lineDiscount, net: grossAmount.minus(lineDiscount) };
  });

  const netTotal = sum(pre.map((p) => p.net));
  const invoiceDiscountTotal = discountAmount(netTotal, input.invoiceDiscount);

  // Pro-rata allocation with the rounding remainder pushed onto the largest line.
  const shares = pre.map((p) =>
    netTotal.isZero() ? ZERO : invoiceDiscountTotal.mul(p.net).div(netTotal).toDecimalPlaces(2, Decimal.ROUND_DOWN),
  );
  let remainder = invoiceDiscountTotal.minus(sum(shares));
  if (!remainder.isZero()) {
    const order = pre.map((p, i) => ({ i, net: p.net })).sort((a, b) => b.net.cmp(a.net));
    for (const { i } of order) {
      if (remainder.isZero()) break;
      const room = pre[i]!.net.minus(shares[i]!);
      const add = Decimal.min(room, remainder);
      shares[i] = shares[i]!.plus(add);
      remainder = remainder.minus(add);
    }
  }

  const lines: TaxLineResult[] = pre.map((p, i) => {
    const share = shares[i]!;
    const net = p.net.minus(share);
    const taxed = chargeTax && !p.l.exempt;
    const gstRate = taxed ? D(p.l.gstRate) : ZERO;
    const cessRate = taxed ? D(p.l.cessRate ?? 0) : ZERO;
    if (gstRate.isNegative() || cessRate.isNegative()) throw new Error('Tax rate cannot be negative');
    const totalRate = gstRate.plus(cessRate);
    const taxableValue = p.l.priceIncludesTax ? round(net.mul(HUNDRED).div(HUNDRED.plus(totalRate))) : net;

    let cgst = ZERO, sgst = ZERO, igst = ZERO;
    if (input.supplyType === 'INTRA_STATE') {
      cgst = round(taxableValue.mul(gstRate).div(200));
      sgst = cgst;
    } else {
      igst = round(taxableValue.mul(gstRate).div(HUNDRED));
    }
    const cess = round(taxableValue.mul(cessRate).div(HUNDRED));
    const taxTotal = cgst.plus(sgst).plus(igst).plus(cess);
    return {
      ref: p.l.ref, quantity: p.quantity, unitPrice: p.unitPrice, grossAmount: p.grossAmount,
      lineDiscount: p.lineDiscount, invoiceDiscountShare: share, taxableValue, gstRate, cessRate,
      cgst, sgst, igst, cess, taxTotal, lineTotal: taxableValue.plus(taxTotal), hsnCode: p.l.hsnCode ?? null,
    };
  });

  const taxableTotal = sum(lines.map((l) => l.taxableValue));
  const cgstTotal = sum(lines.map((l) => l.cgst));
  const sgstTotal = sum(lines.map((l) => l.sgst));
  const igstTotal = sum(lines.map((l) => l.igst));
  const cessTotal = sum(lines.map((l) => l.cess));
  const taxTotal = cgstTotal.plus(sgstTotal).plus(igstTotal).plus(cessTotal);
  const exact = taxableTotal.plus(taxTotal);
  const grandTotal = input.roundOff === false ? exact : exact.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);

  const bucket = (keyOf: (l: TaxLineResult) => string): TaxBucket[] => {
    const map = new Map<string, TaxBucket>();
    for (const l of lines) {
      const key = keyOf(l);
      const b = map.get(key) ?? {
        key, gstRate: l.gstRate, taxableValue: ZERO, cgst: ZERO, sgst: ZERO, igst: ZERO, cess: ZERO, quantity: ZERO,
      };
      b.taxableValue = b.taxableValue.plus(l.taxableValue);
      b.cgst = b.cgst.plus(l.cgst); b.sgst = b.sgst.plus(l.sgst); b.igst = b.igst.plus(l.igst);
      b.cess = b.cess.plus(l.cess); b.quantity = b.quantity.plus(l.quantity);
      map.set(key, b);
    }
    return [...map.values()];
  };

  return {
    lines,
    subTotal: sum(lines.map((l) => l.grossAmount)),
    lineDiscountTotal: sum(lines.map((l) => l.lineDiscount)),
    invoiceDiscountTotal,
    taxableTotal, cgstTotal, sgstTotal, igstTotal, cessTotal, taxTotal,
    roundOff: grandTotal.minus(exact),
    grandTotal,
    rateSummary: bucket((l) => l.gstRate.toString()),
    hsnSummary: bucket((l) => `${l.hsnCode ?? ''}|${l.gstRate.toString()}`),
  };
}

export type PaymentStatus = 'UNPAID' | 'PARTIAL' | 'PAID';
export const paymentStatus = (total: Numeric, paid: Numeric): PaymentStatus => {
  const t = D(total), p = D(paid);
  if (p.lte(0)) return t.lte(0) ? 'PAID' : 'UNPAID';
  return p.gte(t) ? 'PAID' : 'PARTIAL';
};

/** Credit check: would this new due amount push the customer beyond the limit? null limit = unlimited. */
export const exceedsCreditLimit = (outstanding: Numeric, newDue: Numeric, limit: Numeric | null | undefined): boolean =>
  limit !== null && limit !== undefined && D(outstanding).plus(D(newDue)).gt(D(limit));
