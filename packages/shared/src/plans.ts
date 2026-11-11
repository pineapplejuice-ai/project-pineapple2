export type PlanCode = 'STARTER' | 'GROWTH' | 'PRO' | 'ENTERPRISE';
export type Feature =
  | 'billing' | 'products' | 'basic_reports' | 'advanced_inventory' | 'gst_reports' | 'suppliers'
  | 'customer_credit' | 'purchases' | 'multi_branch' | 'advanced_analytics' | 'industry_modules'
  | 'custom_roles' | 'multi_warehouse' | 'integrations';

export interface PlanDefinition {
  code: PlanCode; name: string; monthlyPriceInr: number;
  /** null = unlimited */
  limits: { businesses: number | null; branches: number | null; warehouses: number | null; users: number | null; invoicesPerMonth: number | null };
  features: Feature[];
}

const STARTER: Feature[] = ['billing', 'products', 'basic_reports'];
const GROWTH: Feature[] = [...STARTER, 'advanced_inventory', 'gst_reports', 'suppliers', 'customer_credit'];
const PRO: Feature[] = [...GROWTH, 'purchases', 'multi_branch', 'advanced_analytics', 'industry_modules', 'custom_roles'];
const ENTERPRISE: Feature[] = [...PRO, 'multi_warehouse', 'integrations'];

/** Default catalogue; prices and limits are placeholders to be tuned commercially. */
export const PLANS: Record<PlanCode, PlanDefinition> = {
  STARTER: { code: 'STARTER', name: 'Starter', monthlyPriceInr: 299,
    limits: { businesses: 1, branches: 1, warehouses: 1, users: 1, invoicesPerMonth: 500 }, features: STARTER },
  GROWTH: { code: 'GROWTH', name: 'Growth', monthlyPriceInr: 799,
    limits: { businesses: 1, branches: 1, warehouses: 2, users: 5, invoicesPerMonth: 5000 }, features: GROWTH },
  PRO: { code: 'PRO', name: 'Pro', monthlyPriceInr: 1999,
    limits: { businesses: 3, branches: 5, warehouses: 10, users: 25, invoicesPerMonth: null }, features: PRO },
  ENTERPRISE: { code: 'ENTERPRISE', name: 'Enterprise', monthlyPriceInr: 4999,
    limits: { businesses: null, branches: null, warehouses: null, users: null, invoicesPerMonth: null }, features: ENTERPRISE },
};
export const TRIAL_DAYS = 14;
export const GRACE_DAYS = 7;
export const planHasFeature = (plan: PlanCode, feature: Feature): boolean => PLANS[plan].features.includes(feature);
