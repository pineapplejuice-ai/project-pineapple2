export const PERMISSIONS = {
  'dashboard.view': 'View dashboard',
  'sales.view': 'View sales', 'sales.create': 'Create invoices', 'sales.edit': 'Edit draft invoices',
  'sales.cancel': 'Cancel invoices', 'sales.discount': 'Apply discounts', 'sales.price_override': 'Change selling prices',
  'sales.return': 'Process sales returns and refunds',
  'products.view': 'View products', 'products.manage': 'Manage products and categories',
  'products.view_cost': 'View purchase prices',
  'inventory.view': 'View stock', 'inventory.manage': 'Adjust and transfer stock',
  'inventory.approve_transfer': 'Approve stock transfers',
  'purchases.view': 'View purchases', 'purchases.manage': 'Manage purchases',
  'customers.view': 'View customers', 'customers.manage': 'Manage customers',
  'suppliers.view': 'View suppliers', 'suppliers.manage': 'Manage suppliers',
  'payments.view': 'View payments', 'payments.record': 'Record payments',
  'expenses.view': 'View expenses', 'expenses.manage': 'Manage expenses',
  'cash.manage': 'Open and close cash register',
  'reports.view': 'View reports', 'reports.profit': 'View profits', 'reports.export': 'Export reports',
  'gst.view': 'View GST centre',
  'staff.manage': 'Manage users and roles',
  'branches.manage': 'Manage branches and warehouses',
  'settings.manage': 'Manage business settings',
  'subscription.manage': 'Manage subscription',
  'audit.view': 'View audit log',
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export type SystemRole =
  | 'OWNER' | 'ADMIN' | 'BRANCH_MANAGER' | 'ACCOUNTANT' | 'BILLING_OPERATOR'
  | 'INVENTORY_MANAGER' | 'PURCHASE_MANAGER' | 'READ_ONLY';

const except = (...deny: Permission[]): Permission[] => ALL_PERMISSIONS.filter((p) => !deny.includes(p));
const views = ALL_PERMISSIONS.filter((p) => p.endsWith('.view'));

export const SYSTEM_ROLES: Record<SystemRole, { name: string; permissions: Permission[] }> = {
  OWNER: { name: 'Business Owner', permissions: ALL_PERMISSIONS },
  ADMIN: { name: 'Business Administrator', permissions: except('subscription.manage') },
  BRANCH_MANAGER: {
    name: 'Branch Manager',
    permissions: except('subscription.manage', 'staff.manage', 'settings.manage', 'branches.manage', 'audit.view'),
  },
  ACCOUNTANT: {
    name: 'Accountant',
    permissions: [...views.filter((p) => p !== 'audit.view'), 'products.view_cost', 'payments.record', 'expenses.manage',
      'reports.profit', 'reports.export', 'cash.manage'],
  },
  BILLING_OPERATOR: {
    name: 'Billing Operator',
    permissions: ['sales.view', 'sales.create', 'sales.edit', 'products.view', 'inventory.view', 'customers.view',
      'customers.manage', 'payments.view', 'payments.record', 'cash.manage'],
  },
  INVENTORY_MANAGER: {
    name: 'Inventory Manager',
    permissions: ['dashboard.view', 'products.view', 'products.manage', 'products.view_cost', 'inventory.view',
      'inventory.manage', 'purchases.view', 'suppliers.view'],
  },
  PURCHASE_MANAGER: {
    name: 'Purchase Manager',
    permissions: ['dashboard.view', 'products.view', 'products.view_cost', 'inventory.view', 'purchases.view',
      'purchases.manage', 'suppliers.view', 'suppliers.manage', 'payments.view', 'payments.record'],
  },
  READ_ONLY: { name: 'Read-only User', permissions: views.filter((p) => p !== 'audit.view') },
};

export const hasPermission = (granted: readonly string[], needed: Permission | Permission[]): boolean =>
  (Array.isArray(needed) ? needed : [needed]).every((p) => granted.includes(p));
