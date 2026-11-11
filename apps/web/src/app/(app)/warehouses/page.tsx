'use client';
import { warehouseSchema } from '@nexbill/validation';
import { ResourcePage } from '@/components/page';
import { Badge, StatusBadge } from '@/components/ui';
import { useGet } from '@/lib/hooks';

export default function WarehousesPage() {
  const branches = useGet<any[]>('/branches');
  return <ResourcePage title="Warehouses" description="Stock locations. Each warehouse belongs to a branch and keeps its own stock balance." path="/warehouses" noun="Warehouse" managePermission="branches.manage" schema={warehouseSchema} paged={false} searchable={false}
    fields={[{ name: 'name', label: 'Name', required: true }, { name: 'branchId', label: 'Branch', type: 'select', required: true, options: (branches.data ?? []).map((b) => ({ value: b.id, label: b.name })) }, { name: 'isActive', label: 'Active', type: 'checkbox' }]}
    defaults={{ isActive: true }} toForm={(r) => ({ name: r.name, branchId: r.branchId, isActive: r.isActive })}
    columns={[{ key: 'name', header: 'Warehouse', render: (r) => <span className="font-medium">{r.name}{r.isDefault && <Badge tone="brand" className="ml-2">Default</Badge>}</span> }, { key: 'branch', header: 'Branch', render: (r) => r.branch?.name }, { key: 'isActive', header: 'Status', render: (r) => <StatusBadge status={r.isActive ? 'ACTIVE' : 'INACTIVE'} /> }]} />;
}
