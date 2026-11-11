'use client';
import { INDIAN_STATES } from '@nexbill/shared';
import { branchSchema } from '@nexbill/validation';
import { ResourcePage } from '@/components/page';
import { Badge, StatusBadge } from '@/components/ui';

export default function BranchesPage() {
  return <ResourcePage title="Branch Management" description="Each branch has its own warehouses, stock, staff access, pricing and reports. A default warehouse is created with every new branch." path="/branches" noun="Branch" managePermission="branches.manage" schema={branchSchema} paged={false} searchable={false}
    defaults={{ isActive: true }} toForm={(r) => ({ name: r.name, code: r.code, address: r.address ?? '', stateCode: r.stateCode ?? '', phone: r.phone ?? '', isActive: r.isActive })}
    fields={[{ name: 'name', label: 'Branch name', required: true }, { name: 'code', label: 'Short code', required: true, uppercase: true, hint: 'Up to 6 letters or digits' }, { name: 'phone', label: 'Mobile' }, { name: 'stateCode', label: 'State', type: 'select', options: INDIAN_STATES.map((s) => ({ value: s.code, label: s.name })) }, { name: 'address', label: 'Address', type: 'textarea' }, { name: 'isActive', label: 'Active', type: 'checkbox' }]}
    columns={[{ key: 'name', header: 'Branch', render: (r) => <span className="font-medium">{r.name}{r.isDefault && <Badge tone="brand" className="ml-2">Default</Badge>}</span> }, { key: 'code', header: 'Code' }, { key: 'warehouses', header: 'Warehouses', render: (r) => r.warehouses.map((w: any) => w.name).join(', ') }, { key: 'phone', header: 'Mobile' }, { key: 'isActive', header: 'Status', render: (r) => <StatusBadge status={r.isActive ? 'ACTIVE' : 'INACTIVE'} /> }]} />;
}
