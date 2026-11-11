'use client';
import { Banknote } from 'lucide-react';
import { useState } from 'react';
import { PageHeader, SearchBox } from '@/components/page';
import { Badge, Card, DataTable, EmptyState, Input, Pagination, Select } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { useDebounced, useList } from '@/lib/hooks';
import { daysAgo, fmtDateTime, inr, today } from '@/lib/utils';

export default function PaymentsPage() {
  const [q, setQ] = useState(''), [direction, setDirection] = useState(''), [from, setFrom] = useState(daysAgo(29)), [to, setTo] = useState(today()), [page, setPage] = useState(1);
  const list = useList('/payments', { q: useDebounced(q), direction, from, to, page, pageSize: 25 });
  return (
    <>
      <PageHeader title="Payments" description="Every receipt, refund and supplier payment. Record payments from an invoice, a customer or a supplier." />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Payment no. or reference…" />
          <Select aria-label="Direction" value={direction} onChange={(e) => { setDirection(e.target.value); setPage(1); }} className="w-40"><option value="">Money in & out</option><option value="IN">Money in</option><option value="OUT">Money out</option></Select>
          <Input aria-label="From date" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-36" /><Input aria-label="To date" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-36" />
        </div>
        <DataTable rows={list.data?.data} loading={list.isLoading} error={list.error ? errorMessage(list.error) : null} empty={<EmptyState icon={Banknote} title="No payments in this period" />}
          columns={[{ key: 'number', header: 'Payment', render: (r) => <span className="font-medium">{r.number}</span> }, { key: 'paymentDate', header: 'Date', render: (r) => fmtDateTime(r.paymentDate) },
            { key: 'kind', header: 'Type', render: (r) => <Badge tone={r.direction === 'IN' ? 'ok' : 'warn'}>{r.kind.replace(/_/g, ' ')}</Badge> }, { key: 'partyName', header: 'Party' }, { key: 'mode', header: 'Mode', render: (r) => r.mode.replace('_', ' ') }, { key: 'reference', header: 'Reference' },
            { key: 'amount', header: 'Amount', align: 'right', render: (r) => <span className={r.direction === 'IN' ? 'text-ok' : 'text-bad'}>{r.direction === 'IN' ? '+' : '−'} {inr(r.amount)}</span> }]} />
        {list.data && <Pagination page={page} pageSize={25} total={list.data.total} onPage={setPage} />}
      </Card>
    </>
  );
}
