'use client';
import { INDIAN_STATES } from '@nexbill/shared';
import { customerSchema } from '@nexbill/validation';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ResourcePage } from '@/components/page';
import { Badge } from '@/components/ui';
import { inr } from '@/lib/utils';

const states = INDIAN_STATES.map((s) => ({ value: s.code, label: s.name }));
export default function CustomersPage() {
  const router = useRouter();
  const [due, setDue] = useState(false);
  return <ResourcePage title="Customers" description="Profiles, credit limits and outstanding balances. Open a customer to see the statement." path="/customers" noun="Customer" managePermission="customers.manage" schema={customerSchema}
    extraQuery={{ status: due ? 'due' : undefined }} onRowClick={(r) => router.push(`/customers/${r.id}`)} defaults={{ type: 'RETAIL', creditDays: 0, isActive: true }}
    filters={<label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" checked={due} onChange={(e) => setDue(e.target.checked)} />With dues only</label>}
    toForm={(r) => ({ ...r, phone: r.phone ?? '', email: r.email ?? '', gstin: r.gstin ?? '', stateCode: r.stateCode ?? '', address: r.address ?? '', groupName: r.groupName ?? '', creditLimit: r.creditLimit ?? '' })}
    fields={[{ name: 'name', label: 'Name', required: true }, { name: 'phone', label: 'Mobile' }, { name: 'email', label: 'Email', type: 'email' }, { name: 'gstin', label: 'GSTIN', uppercase: true, hint: 'For B2B tax invoices' },
      { name: 'stateCode', label: 'State', type: 'select', options: states, hint: 'Decides CGST+SGST or IGST' }, { name: 'type', label: 'Type', type: 'select', options: [{ value: 'RETAIL', label: 'Retail' }, { value: 'WHOLESALE', label: 'Wholesale' }] },
      { name: 'groupName', label: 'Group' }, { name: 'creditLimit', label: 'Credit limit (₹)', type: 'number', hint: 'Empty = no limit' }, { name: 'creditDays', label: 'Credit period (days)', type: 'int' }, { name: 'openingBalance', label: 'Opening balance (₹)', type: 'number' },
      { name: 'address', label: 'Address', type: 'textarea' }, { name: 'isActive', label: 'Active', type: 'checkbox' }]}
    columns={[{ key: 'name', header: 'Customer', render: (r) => <div><span className="font-medium">{r.name}</span>{r.type === 'WHOLESALE' && <Badge className="ml-2">Wholesale</Badge>}<p className="text-xs text-muted">{r.groupName}</p></div> }, { key: 'phone', header: 'Mobile' }, { key: 'gstin', header: 'GSTIN' },
      { key: 'creditLimit', header: 'Credit limit', align: 'right', render: (r) => (r.creditLimit ? inr(r.creditLimit) : '—') },
      { key: 'balance', header: 'Outstanding', align: 'right', render: (r) => <span className={+r.balance > 0 ? 'font-medium text-warn' : +r.balance < 0 ? 'text-ok' : ''}>{+r.balance < 0 ? `Adv. ${inr(-r.balance)}` : inr(r.balance)}</span> }]} />;
}
