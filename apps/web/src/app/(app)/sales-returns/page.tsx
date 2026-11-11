'use client';
import { Undo2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PageHeader, SearchBox } from '@/components/page';
import { Card, DataTable, EmptyState, Pagination } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { useDebounced, useList } from '@/lib/hooks';
import { fmtDate, inr, qty } from '@/lib/utils';

export default function SalesReturnsPage() {
  const router = useRouter();
  const [q, setQ] = useState(''), [page, setPage] = useState(1);
  const list = useList('/sales/returns', { q: useDebounced(q), page, pageSize: 25 });
  return (
    <>
      <PageHeader title="Sales Returns" description="Credit notes issued against invoices. Start a return from the invoice it belongs to." />
      <Card>
        <div className="border-b p-3"><SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Credit note number…" /></div>
        <DataTable rows={list.data?.data} loading={list.isLoading} error={list.error ? errorMessage(list.error) : null} onRowClick={(r) => router.push(`/sales/${r.invoiceId}`)}
          empty={<EmptyState icon={Undo2} title="No returns yet" description="Open an invoice from Sales and choose Return to create a credit note." />}
          columns={[
            { key: 'number', header: 'Credit note', render: (r) => <span className="font-medium">{r.number}</span> }, { key: 'returnDate', header: 'Date', render: (r) => fmtDate(r.returnDate) },
            { key: 'invoiceNumber', header: 'Against invoice' }, { key: 'customerName', header: 'Customer' },
            { key: 'items', header: 'Items', render: (r) => <span className="text-xs text-muted">{r.items.map((i: any) => `${qty(i.quantity)} × ${i.description}`).join(', ')}</span> },
            { key: 'total', header: 'Credit', align: 'right', render: (r) => inr(r.total) }, { key: 'refundAmount', header: 'Refunded', align: 'right', render: (r) => (Number(r.refundAmount) ? `${inr(r.refundAmount)} ${r.refundMode}` : '—') },
          ]} />
        {list.data && <Pagination page={page} pageSize={25} total={list.data.total} onPage={setPage} />}
      </Card>
    </>
  );
}
