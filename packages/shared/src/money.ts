import Decimal from 'decimal.js';

/** All monetary maths in NEXBILL goes through Decimal. Never use JS floats for money. */
export type Numeric = Decimal.Value;

export const D = (v: Numeric | null | undefined): Decimal => new Decimal(v ?? 0);
export const ZERO = new Decimal(0);

/** Round half-up (commercial rounding) to the given number of places. */
export const round = (v: Numeric, places = 2): Decimal =>
  D(v).toDecimalPlaces(places, Decimal.ROUND_HALF_UP);

export const sum = (values: Numeric[]): Decimal => values.reduce<Decimal>((a, b) => a.plus(D(b)), ZERO);

export const money = (v: Numeric): string => round(v, 2).toFixed(2);

/** Formats using the Indian digit grouping (lakh / crore). */
export function formatINR(v: Numeric, withSymbol = true): string {
  const d = round(v, 2);
  const neg = d.isNegative();
  const [int = '0', frac = '00'] = d.abs().toFixed(2).split('.');
  let grouped = int;
  if (int.length > 3) {
    const last3 = int.slice(-3);
    const rest = int.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    grouped = `${rest},${last3}`;
  }
  return `${neg ? '-' : ''}${withSymbol ? '₹' : ''}${grouped}.${frac}`;
}
