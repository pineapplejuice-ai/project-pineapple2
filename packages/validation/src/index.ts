import { z } from 'zod';
import { validateGstin, isValidPan, STATE_CODES, ALL_PERMISSIONS } from '@nexbill/shared';

/* ───────── primitives ───────── */
/** Decimal carried as a string end-to-end; numbers are accepted from forms and normalised. */
export const dec = z
  .union([z.number().finite(), z.string().trim().regex(/^-?\d+(\.\d{1,6})?$/, 'Enter a valid number')])
  .transform((v) => String(v));
export const decPositive = dec.refine((v) => Number(v) > 0, 'Must be greater than zero');
export const decNonNeg = dec.refine((v) => Number(v) >= 0, 'Cannot be negative');
export const uuid = z.string().uuid();
const optionalText = (max = 255) =>
  z.string().trim().max(max).optional().nullable().transform((v) => (v === '' || v == null ? null : v));
export const stateCode = z.string().refine((v) => STATE_CODES.has(v), 'Select a state');
export const gstin = z.string().trim().toUpperCase().refine((v) => validateGstin(v).valid, 'GSTIN is not valid');
const optionalGstin = z.union([z.literal(''), z.null(), z.undefined(), gstin]).transform((v) => v || null);
const phone = z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a 10 digit mobile number');
const optionalPhone = z.union([z.literal(''), z.null(), z.undefined(), phone]).transform((v) => v || null);
const optionalEmail = z.union([z.literal(''), z.null(), z.undefined(), z.string().trim().toLowerCase().email()]).transform((v) => v || null);
const isoDate = z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid date');
export const paymentMode = z.enum(['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CHEQUE']);
export const discount = z.object({ type: z.enum(['PERCENT', 'AMOUNT']), value: decNonNeg });

export const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  q: z.string().trim().max(100).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  branchId: uuid.optional(),
  status: z.string().max(30).optional(),
});
export type ListQuery = z.infer<typeof listQuery>;

/* ───────── auth ───────── */
const password = z.string().min(8, 'Use at least 8 characters').max(128)
  .refine((v) => /[a-zA-Z]/.test(v) && /\d/.test(v), 'Use letters and numbers');
export const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email(),
  password,
  businessName: z.string().trim().min(2).max(150),
  stateCode: stateCode.default('29'),
  phone: optionalPhone,
});
export const loginSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(128) });
export const forgotPasswordSchema = z.object({ email: z.string().trim().toLowerCase().email() });
export const resetPasswordSchema = z.object({ token: z.string().min(20), password });
export const verifyEmailSchema = z.object({ token: z.string().min(20) });
export const switchTenantSchema = z.object({ tenantId: uuid });

/* ───────── business ───────── */
export const businessSchema = z.object({
  name: z.string().trim().min(2).max(150),
  legalName: optionalText(), ownerName: optionalText(),
  industry: z.enum(['HARDWARE', 'ICE_CREAM', 'GROCERY', 'ELECTRICAL', 'SANITARY', 'WHOLESALE', 'GENERAL']),
  phone: optionalPhone, email: optionalEmail,
  addressLine1: optionalText(), addressLine2: optionalText(), city: optionalText(100),
  stateCode,
  pincode: z.union([z.literal(''), z.null(), z.undefined(), z.string().regex(/^[1-9]\d{5}$/, 'Enter a 6 digit PIN code')]).transform((v) => v || null),
  gstRegistered: z.boolean(),
  gstin: optionalGstin,
  pan: z.union([z.literal(''), z.null(), z.undefined(), z.string().trim().toUpperCase().refine(isValidPan, 'PAN is not valid')]).transform((v) => v || null),
  fyStartMonth: z.number().int().min(1).max(12),
  pricesIncludeTax: z.boolean(), roundOffInvoices: z.boolean(), allowNegativeStock: z.boolean(),
  invoicePrefix: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,5}$/, '1-5 letters or digits'),
  invoiceTemplate: z.enum(['A4', 'THERMAL_80', 'THERMAL_58']),
  invoiceTerms: optionalText(1000),
  logoUrl: optionalText(500),
  onboardingComplete: z.boolean(),
});
export const businessUpdateSchema = businessSchema.partial().superRefine((v, ctx) => {
  if (v.gstRegistered && v.gstin === null) ctx.addIssue({ code: 'custom', path: ['gstin'], message: 'GSTIN is required for registered businesses' });
  if (v.gstin && v.stateCode && v.gstin.slice(0, 2) !== v.stateCode)
    ctx.addIssue({ code: 'custom', path: ['gstin'], message: 'GSTIN state code does not match the business state' });
});
export const businessCreateSchema = z.object({ name: z.string().trim().min(2).max(150), stateCode, industry: businessSchema.shape.industry.default('GENERAL') });
export const branchSchema = z.object({
  name: z.string().trim().min(2).max(100), code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,6}$/),
  address: optionalText(500), stateCode: stateCode.optional().nullable(), phone: optionalPhone, isActive: z.boolean().default(true),
});
export const warehouseSchema = z.object({ branchId: uuid, name: z.string().trim().min(2).max(100), isActive: z.boolean().default(true) });

/* ───────── staff ───────── */
export const roleSchema = z.object({
  name: z.string().trim().min(2).max(60),
  permissions: z.array(z.enum(ALL_PERMISSIONS as [string, ...string[]])).min(1),
});
export const staffCreateSchema = z.object({
  name: z.string().trim().min(2).max(100), email: z.string().trim().toLowerCase().email(),
  password, roleId: uuid, branchIds: z.array(uuid).default([]),
});
export const staffUpdateSchema = z.object({ roleId: uuid.optional(), branchIds: z.array(uuid).optional(), isActive: z.boolean().optional() });

/* ───────── catalogue ───────── */
export const categorySchema = z.object({ name: z.string().trim().min(1).max(100), parentId: uuid.optional().nullable() });
export const unitSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,8}$/), name: z.string().trim().min(1).max(50), decimals: z.number().int().min(0).max(4).default(0),
});
export const variantSchema = z.object({
  id: uuid.optional(),
  name: z.string().trim().max(100).default(''),
  sku: z.string().trim().max(50).optional(),
  productCode: optionalText(50),
  purchasePrice: decNonNeg.default(0), sellingPrice: decNonNeg,
  mrp: decNonNeg.optional().nullable(), wholesalePrice: decNonNeg.optional().nullable(),
  minStock: decNonNeg.default(0), reorderLevel: decNonNeg.default(0),
  barcodes: z.array(z.string().trim().min(3).max(50)).max(10).default([]),
  attributes: z.record(z.union([z.string(), z.number(), z.boolean()])).default({}),
  openingStock: decNonNeg.optional(),
  openingBatchNo: optionalText(50), openingExpiry: isoDate.optional().nullable(),
  isActive: z.boolean().default(true),
});
export const productSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: optionalText(2000),
  type: z.enum(['GOODS', 'SERVICE', 'BUNDLE']).default('GOODS'),
  categoryId: uuid.optional().nullable(),
  brand: optionalText(100), manufacturer: optionalText(100),
  hsnCode: z.union([z.literal(''), z.null(), z.undefined(), z.string().regex(/^\d{4,8}$/, 'HSN/SAC is 4 to 8 digits')]).transform((v) => v || null),
  gstRate: decNonNeg.refine((v) => Number(v) <= 100).default(0),
  cessRate: decNonNeg.refine((v) => Number(v) <= 500).default(0),
  taxExempt: z.boolean().default(false),
  priceIncludesTax: z.boolean().default(true),
  baseUnitId: uuid,
  trackInventory: z.boolean().default(true),
  trackBatches: z.boolean().default(false),
  supplierId: uuid.optional().nullable(),
  imageUrl: optionalText(500),
  attributes: z.record(z.union([z.string(), z.number(), z.boolean()])).default({}),
  isActive: z.boolean().default(true),
  variants: z.array(variantSchema).min(1).max(100),
  units: z.array(z.object({ unitId: uuid, factorToBase: decPositive })).max(10).default([]),
  bundleItems: z.array(z.object({ componentVariantId: uuid, quantity: decPositive })).max(50).default([]),
  /** warehouse receiving opening stock; defaults to the business default warehouse */
  warehouseId: uuid.optional(),
});
export type ProductInput = z.infer<typeof productSchema>;
export const productImportSchema = z.object({
  warehouseId: uuid.optional(),
  rows: z.array(z.object({
    name: z.string().trim().min(1).max(200), sku: z.string().trim().max(50).optional(), barcode: z.string().trim().max(50).optional(),
    category: z.string().trim().max(100).optional(), unit: z.string().trim().toUpperCase().default('PCS'),
    hsnCode: z.string().trim().optional(), gstRate: decNonNeg.default(0),
    purchasePrice: decNonNeg.default(0), sellingPrice: decNonNeg, mrp: decNonNeg.optional(), openingStock: decNonNeg.optional(),
  })).min(1).max(2000),
});
export const branchPriceSchema = z.object({ branchId: uuid, variantId: uuid, sellingPrice: decNonNeg.nullable() });

/* ───────── parties ───────── */
export const customerSchema = z.object({
  name: z.string().trim().min(1).max(150), phone: optionalPhone, email: optionalEmail, gstin: optionalGstin,
  stateCode: stateCode.optional().nullable(), address: optionalText(500),
  type: z.enum(['RETAIL', 'WHOLESALE']).default('RETAIL'), groupName: optionalText(60),
  creditLimit: decNonNeg.optional().nullable(), creditDays: z.number().int().min(0).max(365).default(0),
  openingBalance: dec.default(0), isActive: z.boolean().default(true),
});
export const supplierSchema = z.object({
  name: z.string().trim().min(1).max(150), contactPerson: optionalText(100), phone: optionalPhone, email: optionalEmail,
  gstin: optionalGstin, stateCode: stateCode.optional().nullable(), address: optionalText(500),
  openingBalance: dec.default(0), isActive: z.boolean().default(true),
});

/* ───────── sales ───────── */
export const invoiceItemSchema = z.object({
  variantId: uuid, quantity: decPositive,
  /** alternate unit; omitted = base unit */
  unitId: uuid.optional().nullable(),
  /** only honoured with the sales.price_override permission */
  unitPrice: decNonNeg.optional(),
  discount: discount.optional().nullable(),
  batchId: uuid.optional().nullable(),
});
export const invoicePaymentSchema = z.object({ mode: paymentMode, amount: decPositive, reference: optionalText(100) });
export const invoiceCreateSchema = z.object({
  idempotencyKey: z.string().min(8).max(100).optional(),
  status: z.enum(['DRAFT', 'ISSUED']).default('ISSUED'),
  branchId: uuid, warehouseId: uuid,
  customerId: uuid.optional().nullable(),
  customerName: optionalText(150), customerPhone: optionalPhone, customerGstin: optionalGstin,
  placeOfSupply: stateCode.optional().nullable(),
  invoiceDate: isoDate.optional(), notes: optionalText(1000),
  invoiceDiscount: discount.optional().nullable(),
  items: z.array(invoiceItemSchema).min(1).max(500),
  payments: z.array(invoicePaymentSchema).max(5).default([]),
});
export type InvoiceCreateInput = z.infer<typeof invoiceCreateSchema>;
export const invoiceCancelSchema = z.object({ reason: z.string().trim().min(3).max(500), refundMode: paymentMode.optional() });
export const salesReturnSchema = z.object({
  idempotencyKey: z.string().min(8).max(100).optional(),
  invoiceId: uuid, reason: optionalText(500),
  items: z.array(z.object({ invoiceItemId: uuid, quantity: decPositive, condition: z.enum(['GOOD', 'DAMAGED']).default('GOOD') })).min(1),
  refundAmount: decNonNeg.default(0), refundMode: paymentMode.optional(),
});
export const emailInvoiceSchema = z.object({ to: z.string().trim().toLowerCase().email() });

/* ───────── payments / expenses / cash ───────── */
export const receiptSchema = z.object({
  branchId: uuid, customerId: uuid.optional().nullable(), invoiceId: uuid.optional().nullable(),
  amount: decPositive, mode: paymentMode, reference: optionalText(100), note: optionalText(500), paymentDate: isoDate.optional(),
}).refine((v) => v.customerId || v.invoiceId, 'Select a customer or an invoice');
export const supplierPaymentSchema = z.object({
  branchId: uuid, supplierId: uuid, purchaseInvoiceId: uuid.optional().nullable(),
  amount: decPositive, mode: paymentMode, reference: optionalText(100), note: optionalText(500), paymentDate: isoDate.optional(),
});
export const expenseCategorySchema = z.object({ name: z.string().trim().min(1).max(60) });
export const expenseSchema = z.object({
  branchId: uuid, categoryId: uuid, amount: decPositive, expenseDate: isoDate.optional(),
  mode: paymentMode.default('CASH'), payee: optionalText(100), note: optionalText(500),
});
export const cashOpenSchema = z.object({ branchId: uuid, openingCash: decNonNeg });
export const cashCloseSchema = z.object({ countedCash: decNonNeg, note: optionalText(500) });

/* ───────── inventory ───────── */
export const stockAdjustSchema = z.object({
  warehouseId: uuid, variantId: uuid,
  /** signed change in base units */
  quantity: dec.refine((v) => Number(v) !== 0, 'Quantity cannot be zero'),
  type: z.enum(['ADJUSTMENT', 'DAMAGE', 'WASTAGE', 'OPENING']),
  note: z.string().trim().min(3, 'Give a reason').max(500),
  batchId: uuid.optional().nullable(),
});
export const stockCountSchema = z.object({
  warehouseId: uuid, note: optionalText(500),
  items: z.array(z.object({ variantId: uuid, countedQty: decNonNeg })).min(1).max(1000),
});
export const stockTransferSchema = z.object({
  fromWarehouseId: uuid, toWarehouseId: uuid, note: optionalText(500),
  items: z.array(z.object({ variantId: uuid, quantity: decPositive })).min(1).max(500),
}).refine((v) => v.fromWarehouseId !== v.toWarehouseId, 'Choose two different warehouses');

/* ───────── purchasing ───────── */
const purchaseLine = z.object({
  variantId: uuid, quantity: decPositive, unitCost: decNonNeg, gstRate: decNonNeg.optional(),
  batchNo: optionalText(50), expiryDate: isoDate.optional().nullable(),
});
export const purchaseOrderSchema = z.object({
  supplierId: uuid, branchId: uuid, expectedDate: isoDate.optional().nullable(), notes: optionalText(1000),
  items: z.array(purchaseLine.pick({ variantId: true, quantity: true, unitCost: true, gstRate: true })).min(1).max(500),
});
export const goodsReceiptSchema = z.object({
  purchaseOrderId: uuid, warehouseId: uuid, notes: optionalText(1000),
  items: z.array(z.object({ poItemId: uuid, quantity: decPositive, batchNo: optionalText(50), expiryDate: isoDate.optional().nullable() })).min(1),
});
export const purchaseInvoiceSchema = z.object({
  supplierId: uuid, branchId: uuid, warehouseId: uuid,
  supplierInvoiceNo: optionalText(50), invoiceDate: isoDate.optional(),
  purchaseOrderId: uuid.optional().nullable(),
  /** when set, stock was already received through this GRN and is not moved again */
  goodsReceiptId: uuid.optional().nullable(),
  notes: optionalText(1000),
  items: z.array(purchaseLine).min(1).max(500),
  payment: z.object({ mode: paymentMode, amount: decPositive, reference: optionalText(100) }).optional().nullable(),
});
export const purchaseReturnSchema = z.object({
  invoiceId: uuid, reason: optionalText(500),
  items: z.array(z.object({ invoiceItemId: uuid, quantity: decPositive })).min(1),
});

/* ───────── subscription ───────── */
export const changePlanSchema = z.object({ plan: z.enum(['STARTER', 'GROWTH', 'PRO', 'ENTERPRISE']) });
