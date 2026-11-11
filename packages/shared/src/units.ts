import Decimal from 'decimal.js';
import { D, type Numeric } from './money';

/** Quantities are stored in the product's base unit; an alternate unit carries a factor to base. */
export const toBaseQty = (qty: Numeric, factorToBase: Numeric): Decimal => {
  const f = D(factorToBase);
  if (f.lte(0)) throw new Error('Unit conversion factor must be positive');
  return D(qty).mul(f).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
};
export const fromBaseQty = (baseQty: Numeric, factorToBase: Numeric): Decimal => {
  const f = D(factorToBase);
  if (f.lte(0)) throw new Error('Unit conversion factor must be positive');
  return D(baseQty).div(f).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
};

export const DEFAULT_UNITS: ReadonlyArray<{ code: string; name: string; decimals: number }> = [
  { code: 'PCS', name: 'Pieces', decimals: 0 }, { code: 'NOS', name: 'Numbers', decimals: 0 },
  { code: 'BOX', name: 'Box', decimals: 0 }, { code: 'PAC', name: 'Pack', decimals: 0 },
  { code: 'KGS', name: 'Kilograms', decimals: 3 }, { code: 'GMS', name: 'Grams', decimals: 0 },
  { code: 'MTR', name: 'Metres', decimals: 3 }, { code: 'FT', name: 'Feet', decimals: 2 },
  { code: 'LTR', name: 'Litres', decimals: 3 }, { code: 'MLT', name: 'Millilitres', decimals: 0 },
  { code: 'SQF', name: 'Square feet', decimals: 2 }, { code: 'BAG', name: 'Bags', decimals: 0 },
  { code: 'DOZ', name: 'Dozen', decimals: 0 }, { code: 'TON', name: 'Tonnes', decimals: 3 },
];

/* ---------------- Steel section theoretical weights (hardware module) ---------------- */
export type SteelShape = 'SHS' | 'RHS' | 'ROUND_PIPE' | 'ANGLE' | 'FLAT' | 'SHEET' | 'ROUND_BAR' | 'CHANNEL';
export interface SteelSpec {
  shape: SteelShape;
  /** all in millimetres */
  width?: Numeric; height?: Numeric; outerDiameter?: Numeric; thickness?: Numeric;
  /** kg/m^3; mild steel default */
  density?: Numeric;
}
const MS_DENSITY = 7850;

/** Theoretical weight in kg per metre (kg per m² for SHEET). Geometric approximation, sharp corners. */
export function steelWeightPerMetre(spec: SteelSpec): Decimal {
  const rho = D(spec.density ?? MS_DENSITY);
  const mm = (v: Numeric | undefined, name: string): Decimal => {
    if (v === undefined || D(v).lte(0)) throw new Error(`${name} is required for ${spec.shape}`);
    return D(v);
  };
  let areaMm2: Decimal;
  switch (spec.shape) {
    case 'SHS': { const a = mm(spec.width, 'width'), t = mm(spec.thickness, 'thickness');
      areaMm2 = a.pow(2).minus(a.minus(t.mul(2)).pow(2)); break; }
    case 'RHS': { const w = mm(spec.width, 'width'), h = mm(spec.height, 'height'), t = mm(spec.thickness, 'thickness');
      areaMm2 = w.mul(h).minus(w.minus(t.mul(2)).mul(h.minus(t.mul(2)))); break; }
    case 'ROUND_PIPE': { const od = mm(spec.outerDiameter, 'outerDiameter'), t = mm(spec.thickness, 'thickness');
      areaMm2 = Decimal.acos(-1).mul(od.minus(t)).mul(t); break; }
    case 'ROUND_BAR': { const od = mm(spec.outerDiameter, 'outerDiameter');
      areaMm2 = Decimal.acos(-1).mul(od.pow(2)).div(4); break; }
    case 'ANGLE': { const a = mm(spec.width, 'width'), b = mm(spec.height ?? spec.width, 'height'), t = mm(spec.thickness, 'thickness');
      areaMm2 = a.plus(b).minus(t).mul(t); break; }
    case 'CHANNEL': { const w = mm(spec.width, 'width'), h = mm(spec.height, 'height'), t = mm(spec.thickness, 'thickness');
      areaMm2 = h.plus(w.mul(2)).minus(t.mul(2)).mul(t); break; }
    case 'FLAT': { areaMm2 = mm(spec.width, 'width').mul(mm(spec.thickness, 'thickness')); break; }
    case 'SHEET': { areaMm2 = mm(spec.thickness, 'thickness').mul(1000); break; }
  }
  return areaMm2.div(1_000_000).mul(rho).toDecimalPlaces(3, Decimal.ROUND_HALF_UP);
}

export const steelWeight = (spec: SteelSpec, lengthMetres: Numeric, pieces: Numeric = 1): Decimal =>
  steelWeightPerMetre(spec).mul(D(lengthMetres)).mul(D(pieces)).toDecimalPlaces(3, Decimal.ROUND_HALF_UP);

/** Cutting plan for a length-based sale: how many full pieces are consumed and what offcut remains. */
export function cutPlan(requiredLength: Numeric, standardLength: Numeric): { piecesConsumed: number; offcut: Decimal } {
  const req = D(requiredLength), std = D(standardLength);
  if (req.lte(0) || std.lte(0)) throw new Error('Lengths must be positive');
  const pieces = req.div(std).ceil();
  return { piecesConsumed: pieces.toNumber(), offcut: pieces.mul(std).minus(req) };
}
