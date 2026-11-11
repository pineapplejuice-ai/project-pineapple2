import { describe, expect, it } from 'vitest';
import {
  computeInvoice, paymentStatus, exceedsCreditLimit, validateGstin, gstinCheckDigit, financialYear, supplyType,
  toBaseQty, fromBaseQty, steelWeightPerMetre, steelWeight, cutPlan, formatINR, SYSTEM_ROLES, hasPermission,
} from './index';

const line = (o: Partial<Parameters<typeof computeInvoice>[0]['lines'][number]> = {}) => ({
  quantity: 1, unitPrice: 100, priceIncludesTax: false, gstRate: 18, ...o,
});

describe('GST calculation', () => {
  it('splits intra-state GST equally into CGST and SGST', () => {
    const r = computeInvoice({ lines: [line({ quantity: 2, unitPrice: 500 })], supplyType: 'INTRA_STATE' });
    expect(r.taxableTotal.toFixed(2)).toBe('1000.00');
    expect(r.cgstTotal.toFixed(2)).toBe('90.00');
    expect(r.sgstTotal.toFixed(2)).toBe('90.00');
    expect(r.igstTotal.toFixed(2)).toBe('0.00');
    expect(r.grandTotal.toFixed(2)).toBe('1180.00');
  });

  it('charges IGST on inter-state supplies', () => {
    const r = computeInvoice({ lines: [line({ quantity: 2, unitPrice: 500 })], supplyType: 'INTER_STATE' });
    expect(r.igstTotal.toFixed(2)).toBe('180.00');
    expect(r.cgstTotal.isZero() && r.sgstTotal.isZero()).toBe(true);
  });

  it('back-computes taxable value for tax-inclusive prices', () => {
    const r = computeInvoice({ lines: [line({ unitPrice: 118, priceIncludesTax: true })], supplyType: 'INTRA_STATE' });
    expect(r.taxableTotal.toFixed(2)).toBe('100.00');
    expect(r.taxTotal.toFixed(2)).toBe('18.00');
    expect(r.grandTotal.toFixed(2)).toBe('118.00');
  });

  it('absorbs paise drift from inclusive prices into round-off, never into tax', () => {
    const r = computeInvoice({ lines: [line({ unitPrice: 100, priceIncludesTax: true })], supplyType: 'INTRA_STATE' });
    expect(r.taxableTotal.toFixed(2)).toBe('84.75');
    expect(r.cgstTotal.toFixed(2)).toBe('7.63');
    expect(r.sgstTotal.toFixed(2)).toBe('7.63');
    expect(r.roundOff.toFixed(2)).toBe('-0.01');
    expect(r.grandTotal.toFixed(2)).toBe('100.00');
  });

  it('handles multiple GST rates, exempt items and cess in one invoice', () => {
    const r = computeInvoice({
      supplyType: 'INTRA_STATE',
      lines: [
        line({ unitPrice: 1000, gstRate: 5, hsnCode: '1006' }),
        line({ unitPrice: 1000, gstRate: 28, cessRate: 12, hsnCode: '2202' }),
        line({ unitPrice: 200, gstRate: 18, exempt: true, hsnCode: '0401' }),
      ],
    });
    expect(r.cgstTotal.toFixed(2)).toBe('165.00'); // 25 + 140
    expect(r.cessTotal.toFixed(2)).toBe('120.00');
    expect(r.lines[2]!.taxTotal.isZero()).toBe(true);
    expect(r.rateSummary.map((b) => b.key).sort()).toEqual(['0', '28', '5']);
    expect(r.hsnSummary).toHaveLength(3);
    expect(r.grandTotal.toFixed(2)).toBe('2650.00');
  });

  it('charges no tax on a bill of supply', () => {
    const r = computeInvoice({ lines: [line()], supplyType: 'INTRA_STATE', chargeTax: false });
    expect(r.taxTotal.isZero()).toBe(true);
    expect(r.grandTotal.toFixed(2)).toBe('100.00');
  });

  it('does not suffer float drift (0.1 + 0.2)', () => {
    const r = computeInvoice({
      lines: [line({ quantity: 3, unitPrice: '0.1', gstRate: 0 }), line({ quantity: 3, unitPrice: '0.2', gstRate: 0 })],
      supplyType: 'INTRA_STATE', roundOff: false,
    });
    expect(r.grandTotal.toFixed(2)).toBe('0.90');
  });
});

describe('discounts', () => {
  it('applies item percentage and amount discounts before tax', () => {
    const r = computeInvoice({
      supplyType: 'INTRA_STATE',
      lines: [line({ unitPrice: 1000, discount: { type: 'PERCENT', value: 10 } }),
        line({ unitPrice: 500, discount: { type: 'AMOUNT', value: 50 } })],
    });
    expect(r.lineDiscountTotal.toFixed(2)).toBe('150.00');
    expect(r.taxableTotal.toFixed(2)).toBe('1350.00');
    expect(r.grandTotal.toFixed(2)).toBe('1593.00');
  });

  it('spreads invoice discount pro-rata and the shares always add up', () => {
    const r = computeInvoice({
      supplyType: 'INTRA_STATE', invoiceDiscount: { type: 'AMOUNT', value: 100 },
      lines: [line({ unitPrice: 333.33, gstRate: 5 }), line({ unitPrice: 333.33, gstRate: 12 }), line({ unitPrice: 333.34, gstRate: 18 })],
    });
    const shares = r.lines.reduce((a, l) => a.plus(l.invoiceDiscountShare), r.lines[0]!.cgst.minus(r.lines[0]!.cgst));
    expect(shares.toFixed(2)).toBe('100.00');
    expect(r.taxableTotal.toFixed(2)).toBe('900.00');
  });

  it('rejects invalid discounts', () => {
    expect(() => computeInvoice({ supplyType: 'INTRA_STATE', lines: [line({ discount: { type: 'PERCENT', value: 101 } })] })).toThrow();
    expect(() => computeInvoice({ supplyType: 'INTRA_STATE', lines: [line({ discount: { type: 'AMOUNT', value: 101 } })] })).toThrow();
    expect(() => computeInvoice({ supplyType: 'INTRA_STATE', lines: [line()], invoiceDiscount: { type: 'AMOUNT', value: -1 } })).toThrow();
  });
});

describe('round-off and totals', () => {
  it('rounds the grand total to the nearest rupee and reports the difference', () => {
    const up = computeInvoice({ supplyType: 'INTRA_STATE', lines: [line({ unitPrice: 99.6, gstRate: 0 })] });
    expect(up.grandTotal.toFixed(2)).toBe('100.00');
    expect(up.roundOff.toFixed(2)).toBe('0.40');
    const down = computeInvoice({ supplyType: 'INTRA_STATE', lines: [line({ unitPrice: 99.4, gstRate: 0 })] });
    expect(down.roundOff.toFixed(2)).toBe('-0.40');
    const half = computeInvoice({ supplyType: 'INTRA_STATE', lines: [line({ unitPrice: 99.5, gstRate: 0 })] });
    expect(half.grandTotal.toFixed(2)).toBe('100.00');
  });

  it('keeps the identity taxable + tax + roundOff = grandTotal', () => {
    const r = computeInvoice({
      supplyType: 'INTRA_STATE', invoiceDiscount: { type: 'PERCENT', value: 7.5 },
      lines: [line({ quantity: 2.375, unitPrice: 413.7, gstRate: 12 }), line({ quantity: 7, unitPrice: 19.99, gstRate: 5, priceIncludesTax: true })],
    });
    expect(r.taxableTotal.plus(r.taxTotal).plus(r.roundOff).eq(r.grandTotal)).toBe(true);
    for (const l of r.lines) expect(l.cgst.eq(l.sgst)).toBe(true);
  });

  it('rejects empty invoices and non-positive quantities', () => {
    expect(() => computeInvoice({ supplyType: 'INTRA_STATE', lines: [] })).toThrow();
    expect(() => computeInvoice({ supplyType: 'INTRA_STATE', lines: [line({ quantity: 0 })] })).toThrow();
  });
});

describe('credit and payment status', () => {
  it('derives payment status', () => {
    expect(paymentStatus(100, 0)).toBe('UNPAID');
    expect(paymentStatus(100, 40)).toBe('PARTIAL');
    expect(paymentStatus(100, 100)).toBe('PAID');
  });
  it('checks credit limits', () => {
    expect(exceedsCreditLimit(900, 100, 1000)).toBe(false);
    expect(exceedsCreditLimit(900, 100.01, 1000)).toBe(true);
    expect(exceedsCreditLimit(900, 99999, null)).toBe(false);
  });
});

describe('GSTIN and place of supply', () => {
  it('validates the checksum', () => {
    const base = '29ABCDE1234F1Z';
    const good = base + gstinCheckDigit(base);
    expect(validateGstin(good)).toMatchObject({ valid: true, stateCode: '29', pan: 'ABCDE1234F' });
    const bad = base + (gstinCheckDigit(base) === 'A' ? 'B' : 'A');
    expect(validateGstin(bad).valid).toBe(false);
    expect(validateGstin('27AAPFU0939F1ZV').valid).toBe(true); // widely published sample GSTIN
    expect(validateGstin('99ABCDE1234F1Z5').valid).toBe(false);
    expect(validateGstin('short').valid).toBe(false);
  });
  it('determines supply type and financial year', () => {
    expect(supplyType('29', '29')).toBe('INTRA_STATE');
    expect(supplyType('29', '27')).toBe('INTER_STATE');
    expect(supplyType('29', null)).toBe('INTRA_STATE');
    expect(financialYear(new Date(2026, 2, 31))).toBe('2025-26');
    expect(financialYear(new Date(2026, 3, 1))).toBe('2026-27');
  });
});

describe('unit conversions and steel maths', () => {
  it('converts to and from base units', () => {
    expect(toBaseQty(3, 12).toString()).toBe('36');      // 3 boxes of 12
    expect(toBaseQty(250, '0.001').toString()).toBe('0.25'); // 250 g in kg
    expect(fromBaseQty(36, 12).toString()).toBe('3');
    expect(() => toBaseQty(1, 0)).toThrow();
  });
  it('computes theoretical steel weights', () => {
    // 40x40x2 SHS: (1600-1296) mm2 * 7850 = 2.386 kg/m
    expect(steelWeightPerMetre({ shape: 'SHS', width: 40, thickness: 2 }).toString()).toBe('2.386');
    expect(steelWeightPerMetre({ shape: 'RHS', width: 50, height: 25, thickness: 2 }).toString()).toBe('2.229');
    expect(steelWeightPerMetre({ shape: 'FLAT', width: 50, thickness: 6 }).toString()).toBe('2.355');
    expect(steelWeightPerMetre({ shape: 'SHEET', thickness: 1 }).toString()).toBe('7.85');
    expect(steelWeight({ shape: 'SHS', width: 40, thickness: 2 }, 6, 10).toString()).toBe('143.16');
    expect(() => steelWeightPerMetre({ shape: 'SHS', width: 40 })).toThrow();
  });
  it('plans cuts and offcuts', () => {
    expect(cutPlan(4.5, 6)).toMatchObject({ piecesConsumed: 1 });
    expect(cutPlan(4.5, 6).offcut.toString()).toBe('1.5');
    expect(cutPlan(13, 6).piecesConsumed).toBe(3);
  });
});

describe('permissions and formatting', () => {
  it('gives system roles sensible permissions', () => {
    expect(hasPermission(SYSTEM_ROLES.BILLING_OPERATOR.permissions, 'sales.create')).toBe(true);
    expect(hasPermission(SYSTEM_ROLES.BILLING_OPERATOR.permissions, 'sales.cancel')).toBe(false);
    expect(hasPermission(SYSTEM_ROLES.BILLING_OPERATOR.permissions, 'products.view_cost')).toBe(false);
    expect(hasPermission(SYSTEM_ROLES.READ_ONLY.permissions, 'sales.create')).toBe(false);
    expect(hasPermission(SYSTEM_ROLES.OWNER.permissions, ['staff.manage', 'subscription.manage'])).toBe(true);
  });
  it('formats INR with lakh grouping', () => {
    expect(formatINR(1234567.5)).toBe('₹12,34,567.50');
    expect(formatINR(-999)).toBe('-₹999.00');
  });
});
