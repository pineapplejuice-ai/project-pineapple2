'use client';
import { INDIAN_STATES } from '@nexbill/shared';
import { supplierSchema } from '@nexbill/validation';
import { useRouter } from 'next/navigation';
import { ResourcePage } from '@/components/page';
import { inr } from '@/lib/utils';

export default function SuppliersPage() {
  const router = useRouter();
  return <ResourcePage title="Suppliers" description="Vendors you buy from, with payables and purchase history" path="/suppliers" noun="Supplier" managePermission="suppliers.manage" schema={supplierSchema}
    onRowClick={(r) => router.push(`/suppliers/${r.id}`)} defaults={{ isActive: true }}
    toForm={(r) => ({ ...r, contactPerson: r.contactPerson ?? '', phone: r.phone ?? '', email: r.email ?? '', gstin: r.gstin ?? '', stateCode: r.stateCode ?? '', address: r.address ?? '' })}
    fields={[{ name: 'name', label: 'Supplier name', required: true }, { name: 'contactPerson', label: 'Contact person' }, { name: 'phone', label: 'Mobile' }, { name: 'email', label: 'Email', type: 'email' },
      { name: 'gstin', label: 'GSTIN', uppercase: true, hint: 'Needed to claim input tax credit' }, { name: 'stateCode', label: 'State', type: 'select', options: INDIAN_STATES.map((s) => ({ value: s.code, label: s.name })) },
      { name: 'openingBalance', label: 'Opening payable (₹)', type: 'number' }, { name: 'isActive', label: 'Active', type: 'checkbox' }, { name: 'address', label: 'Address', type: 'textarea' }]}
    columns={[{ key: 'name', header: 'Supplier', render: (r) => <div><span className="font-medium">{r.name}</span><p className="text-xs text-muted">{r.contactPerson}</p></div> }, { key: 'phone', header: 'Mobile' }, { key: 'gstin', header: 'GSTIN' },
      { key: 'balance', header: 'Payable', align: 'right', render: (r) => <span className={+r.balance > 0 ? 'font-medium text-bad' : ''}>{inr(r.balance)}</span> }]} />;
}
