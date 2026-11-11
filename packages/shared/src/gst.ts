/** Indian GST reference data + GSTIN validation. Review against current law before commercial use. */
export const INDIAN_STATES: ReadonlyArray<{ code: string; name: string }> = [
  { code: '01', name: 'Jammu and Kashmir' }, { code: '02', name: 'Himachal Pradesh' }, { code: '03', name: 'Punjab' },
  { code: '04', name: 'Chandigarh' }, { code: '05', name: 'Uttarakhand' }, { code: '06', name: 'Haryana' },
  { code: '07', name: 'Delhi' }, { code: '08', name: 'Rajasthan' }, { code: '09', name: 'Uttar Pradesh' },
  { code: '10', name: 'Bihar' }, { code: '11', name: 'Sikkim' }, { code: '12', name: 'Arunachal Pradesh' },
  { code: '13', name: 'Nagaland' }, { code: '14', name: 'Manipur' }, { code: '15', name: 'Mizoram' },
  { code: '16', name: 'Tripura' }, { code: '17', name: 'Meghalaya' }, { code: '18', name: 'Assam' },
  { code: '19', name: 'West Bengal' }, { code: '20', name: 'Jharkhand' }, { code: '21', name: 'Odisha' },
  { code: '22', name: 'Chhattisgarh' }, { code: '23', name: 'Madhya Pradesh' }, { code: '24', name: 'Gujarat' },
  { code: '26', name: 'Dadra and Nagar Haveli and Daman and Diu' }, { code: '27', name: 'Maharashtra' },
  { code: '29', name: 'Karnataka' }, { code: '30', name: 'Goa' }, { code: '31', name: 'Lakshadweep' },
  { code: '32', name: 'Kerala' }, { code: '33', name: 'Tamil Nadu' }, { code: '34', name: 'Puducherry' },
  { code: '35', name: 'Andaman and Nicobar Islands' }, { code: '36', name: 'Telangana' },
  { code: '37', name: 'Andhra Pradesh' }, { code: '38', name: 'Ladakh' }, { code: '97', name: 'Other Territory' },
];

export const STATE_CODES = new Set(INDIAN_STATES.map((s) => s.code));
export const stateName = (code?: string | null): string =>
  INDIAN_STATES.find((s) => s.code === code)?.name ?? '';

export const STANDARD_GST_RATES = [0, 0.1, 0.25, 1.5, 3, 5, 12, 18, 28, 40] as const;

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Computes the GSTIN check character (position 15) for the first 14 characters. */
export function gstinCheckDigit(first14: string): string {
  let total = 0;
  for (let i = 0; i < 14; i++) {
    const v = CHARS.indexOf(first14.charAt(i));
    const product = v * (i % 2 === 0 ? 1 : 2);
    total += Math.floor(product / 36) + (product % 36);
  }
  return CHARS.charAt((36 - (total % 36)) % 36);
}

export interface GstinCheck { valid: boolean; reason?: string; stateCode?: string; pan?: string }

export function validateGstin(input: string): GstinCheck {
  const gstin = (input ?? '').trim().toUpperCase();
  if (gstin.length !== 15) return { valid: false, reason: 'GSTIN must be 15 characters' };
  if (!GSTIN_RE.test(gstin)) return { valid: false, reason: 'GSTIN format is invalid' };
  const stateCode = gstin.slice(0, 2);
  if (!STATE_CODES.has(stateCode)) return { valid: false, reason: 'Unknown state code in GSTIN' };
  if (gstinCheckDigit(gstin.slice(0, 14)) !== gstin.charAt(14)) return { valid: false, reason: 'GSTIN checksum mismatch' };
  return { valid: true, stateCode, pan: gstin.slice(2, 12) };
}

export const isValidPan = (pan: string): boolean => /^[A-Z]{5}[0-9]{4}[A-Z]$/.test((pan ?? '').toUpperCase());

/** Financial-year label for a date, e.g. 2026-27 for a April-start year. */
export function financialYear(date: Date, startMonth = 4): string {
  const m = date.getMonth() + 1;
  const y = date.getFullYear();
  const start = m >= startMonth ? y : y - 1;
  if (startMonth === 1) return String(start);
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

export type SupplyType = 'INTRA_STATE' | 'INTER_STATE';

/** Place-of-supply rule for goods: same state => CGST+SGST, different => IGST. */
export const supplyType = (supplierState: string, placeOfSupply: string | null | undefined): SupplyType =>
  !placeOfSupply || placeOfSupply === supplierState ? 'INTRA_STATE' : 'INTER_STATE';
