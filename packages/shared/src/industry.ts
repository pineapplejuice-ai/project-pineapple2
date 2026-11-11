/** Industry profiles are configuration, not code paths: they only pre-select attributes, units and modules. */
export type IndustryCode = 'HARDWARE' | 'ICE_CREAM' | 'GROCERY' | 'ELECTRICAL' | 'SANITARY' | 'WHOLESALE' | 'GENERAL';
export interface AttributeTemplate {
  key: string; label: string; type: 'TEXT' | 'NUMBER' | 'SELECT' | 'BOOLEAN'; unit?: string; options?: string[];
}
export interface IndustryProfile {
  code: IndustryCode; name: string; description: string;
  trackBatches: boolean; trackExpiry: boolean; defaultUnits: string[];
  attributes: AttributeTemplate[]; suggestedCategories: string[];
}
const STEEL_SHAPES = ['SHS', 'RHS', 'ROUND_PIPE', 'ANGLE', 'FLAT', 'CHANNEL', 'SHEET', 'ROUND_BAR'];
export const INDUSTRY_PROFILES: Record<IndustryCode, IndustryProfile> = {
  HARDWARE: {
    code: 'HARDWARE', name: 'Hardware & building materials', description: 'Steel sections, pipes, cut-length and weight based sales',
    trackBatches: false, trackExpiry: false, defaultUnits: ['PCS', 'MTR', 'KGS', 'FT', 'BAG', 'LTR'],
    attributes: [
      { key: 'steelShape', label: 'Section type', type: 'SELECT', options: STEEL_SHAPES },
      { key: 'width', label: 'Width / side', type: 'NUMBER', unit: 'mm' },
      { key: 'height', label: 'Height', type: 'NUMBER', unit: 'mm' },
      { key: 'outerDiameter', label: 'Outer diameter', type: 'NUMBER', unit: 'mm' },
      { key: 'thickness', label: 'Thickness', type: 'NUMBER', unit: 'mm' },
      { key: 'standardLength', label: 'Standard length', type: 'NUMBER', unit: 'm' },
      { key: 'weightPerMetre', label: 'Weight per metre', type: 'NUMBER', unit: 'kg/m' },
      { key: 'material', label: 'Material', type: 'SELECT', options: ['MS', 'GI', 'SS', 'CPVC', 'UPVC', 'PVC', 'Copper', 'Brass'] },
    ],
    suggestedCategories: ['MS Pipes', 'SHS / RHS', 'Angles & Flats', 'Channels', 'Sheets', 'CPVC', 'PVC', 'Electrical', 'Sanitary', 'Plumbing', 'Paints', 'Tools'],
  },
  ICE_CREAM: {
    code: 'ICE_CREAM', name: 'Ice cream & food retail', description: 'Flavours, packs, batches, expiry and wastage',
    trackBatches: true, trackExpiry: true, defaultUnits: ['PCS', 'PAC', 'LTR', 'MLT', 'KGS', 'BOX'],
    attributes: [
      { key: 'flavour', label: 'Flavour', type: 'TEXT' },
      { key: 'size', label: 'Size', type: 'TEXT' },
      { key: 'storageTemp', label: 'Storage temperature', type: 'NUMBER', unit: '°C' },
    ],
    suggestedCategories: ['Cups', 'Cones', 'Family packs', 'Bars', 'Tubs', 'Toppings'],
  },
  GROCERY: {
    code: 'GROCERY', name: 'Supermarket & grocery', description: 'Barcode billing, loose weight items, batches and expiry',
    trackBatches: true, trackExpiry: true, defaultUnits: ['PCS', 'KGS', 'GMS', 'LTR', 'MLT', 'PAC', 'DOZ'],
    attributes: [{ key: 'looseItem', label: 'Sold loose by weight', type: 'BOOLEAN' }, { key: 'brandPack', label: 'Pack size', type: 'TEXT' }],
    suggestedCategories: ['Staples', 'Dairy', 'Snacks', 'Beverages', 'Personal care', 'Household'],
  },
  ELECTRICAL: {
    code: 'ELECTRICAL', name: 'Electrical & plumbing', description: 'Wires by length, fittings and brands',
    trackBatches: false, trackExpiry: false, defaultUnits: ['PCS', 'MTR', 'BOX', 'PAC'],
    attributes: [{ key: 'rating', label: 'Rating', type: 'TEXT' }, { key: 'gauge', label: 'Gauge / sq mm', type: 'TEXT' }],
    suggestedCategories: ['Wires & cables', 'Switches', 'Lighting', 'Pipes & fittings', 'Pumps'],
  },
  SANITARY: {
    code: 'SANITARY', name: 'Sanitaryware', description: 'Sanitaryware, taps and bathroom fittings',
    trackBatches: false, trackExpiry: false, defaultUnits: ['PCS', 'BOX', 'SQF'],
    attributes: [{ key: 'colour', label: 'Colour', type: 'TEXT' }, { key: 'series', label: 'Series', type: 'TEXT' }],
    suggestedCategories: ['Closets', 'Basins', 'Faucets', 'Showers', 'Tiles', 'Accessories'],
  },
  WHOLESALE: {
    code: 'WHOLESALE', name: 'Wholesale distribution', description: 'Case/box units, wholesale price lists and credit',
    trackBatches: true, trackExpiry: false, defaultUnits: ['PCS', 'BOX', 'PAC', 'KGS', 'DOZ'],
    attributes: [], suggestedCategories: ['General'],
  },
  GENERAL: {
    code: 'GENERAL', name: 'General retail', description: 'Standard retail billing and inventory',
    trackBatches: false, trackExpiry: false, defaultUnits: ['PCS', 'BOX', 'PAC', 'KGS', 'LTR'],
    attributes: [], suggestedCategories: ['General'],
  },
};
