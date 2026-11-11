'use client';
import { IndianRupee, Printer } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { ZodTypeAny } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { useCan, useGet, useLocation } from '@/lib/hooks';
import { fmtDate, inr } from '@/lib/utils';
import { FormDialog } from './form-dialog';
import { PageHeader } from './page';
import { Button, Card, CardHeader, DataTable, EmptyState, ErrorState, Spinner } from './ui';

const MODES = [{ value: 'CASH', label: 'Cash' }, { value: 'UPI', label: 'UPI' }, { value: 'CARD', label: 'Card' }, { value: 'BANK_TRANSFER', label: 'Bank transfer' }, { value: 'CHEQUE', label: 'Cheque' }];

/** Party statement (customer receivable or supplier payable) with a running balance and a payment action. */
export function PartyLedger({ kind, id, schema }: { kind: 'customer' | 'supplier'; id: string; schema: ZodTypeAny }) {
  const base = kind === 'customer' ? '/customers' : '/suppliers';
  const { data, isLoading, error } = useGet<any>(`${base}/${id}/ledger`);
  const can = useCan(), qc = useQueryClient(), loc = useLocation();
  const [paying, setPaying] = useState(false);
  if (error) return <ErrorState message={errorMessage(error)} />;
  if (isLoading || !data) return <div className="flex justify-center py-20"><Spinner /></div>;
  const party = data[kind], closing = Number(data.closing), customer = kind === 'customer';
  return (
    <>
      <PageHeader title={party.name} crumbs={[{ label: customer ? 'Customers' : 'Suppliers', href: base }]} description={[party.phone, party.gstin, party.address].filter(Boolean).join(' · ') || undefined}
        actions={<><Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" />Print statement</Button>
          {can('payments.record') && <Button onClick={() => setPaying(true)}><IndianRupee className="h-4 w-4" />{customer ? 'Receive payment' : 'Pay supplier'}</Button>}</>} />
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <Card className="p-4"><p className="text-xs text-muted">{closing >= 0 ? (customer ? 'Customer owes you' : 'You owe supplier') : (customer ? 'Advance held' : 'Advance paid')}</p><p className={`num mt-1 text-2xl font-semibold ${closing > 0 ? (customer ? 'text-warn' : 'text-bad') : ''}`}>{inr(Math.abs(closing))}</p></Card>
        {customer && <Card className="p-4"><p className="text-xs text-muted">Credit limit</p><p className="num mt-1 text-2xl font-semibold">{party.creditLimit ? inr(party.creditLimit) : 'No limit'}</p><p className="text-xs text-faint">{party.creditDays} day credit period</p></Card>}
        <Card className="p-4"><p className="text-xs text-muted">Opening balance</p><p className="num mt-1 text-2xl font-semibold">{inr(data.opening)}</p></Card>
      </div>
      <Card className="print-sheet"><CardHeader title="Statement of account" description={`${party.name} · as on ${fmtDate(new Date())}`} />
        <DataTable rowKey="_i" rows={data.rows.map((r: any, i: number) => ({ ...r, _i: i }))} empty={<EmptyState title="No transactions yet" />}
          columns={[{ key: 'date', header: 'Date', render: (r) => fmtDate(r.date) }, { key: 'type', header: 'Particulars' }, { key: 'number', header: 'Ref no.' },
            { key: 'debit', header: customer ? 'Billed' : 'Purchased', align: 'right', render: (r) => (+r.debit ? inr(r.debit) : '') }, { key: 'credit', header: customer ? 'Received' : 'Paid', align: 'right', render: (r) => (+r.credit ? inr(r.credit) : '') },
            { key: 'balance', header: 'Balance', align: 'right', render: (r) => <span className="font-medium">{inr(r.balance)}</span> }]} />
      </Card>
      <FormDialog open={paying} onClose={() => setPaying(false)} title={customer ? `Receive payment from ${party.name}` : `Pay ${party.name}`} description={customer ? 'Settles the oldest dues first; any extra is kept as advance.' : 'Settles the oldest bills first.'} schema={schema} submitLabel="Record"
        defaults={{ amount: closing > 0 ? closing.toFixed(2) : '', mode: 'CASH', branchId: loc.branch?.id, [customer ? 'customerId' : 'supplierId']: id }} fields={[{ name: 'amount', label: 'Amount (₹)', type: 'number', required: true }, { name: 'mode', label: 'Mode', type: 'select', options: MODES, required: true }, { name: 'reference', label: 'Reference' }, { name: 'paymentDate', label: 'Date', type: 'date' }, { name: 'note', label: 'Note', wide: true }]}
        onSubmit={async (v) => { await api(customer ? '/payments/receive' : '/payments/pay-supplier', { body: { ...v, branchId: loc.branch?.id, [customer ? 'customerId' : 'supplierId']: id } }); toast.success('Payment recorded'); await qc.invalidateQueries({ queryKey: [`${base}/${id}/ledger`] }); }} />
    </>
  );
}
