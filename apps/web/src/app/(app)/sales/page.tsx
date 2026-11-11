'use client';
import { Download, Plus, ReceiptText } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { PageHeader, SearchBox } from '@/components/page';
import { Button, Card, DataTable, EmptyState, Input, Pagination, Select, StatusBadge } from '@/components/ui';
import { download, errorMessage } from '@/lib/api';
import { useCan, useDebounced, useList } from '@/lib/hooks';
import { daysAgo, fmtDate, inr, today } from '@/lib/utils';

export default function SalesPage() {
  const router = useRouter(), can = useCan();
  const [q, setQ] = useState(''), [status, setStatus] = useState(''), [pay, setPay] = useState(''), [from, setFrom] = useState(daysAgo(29)), [to, setTo] = useState(today()), [page, setPage] = useState(1);
  const list = useList('/sales/invoices', { q: useDebounced(q), status, paymentStatus: pay, from, to, page, pageSize: 25 });
  return (
    <>
      <PageHeader title="Sales" description="Invoices, drafts and cancellations" actions={<>
        {can('reports.export') && can('gst.view') && <Button variant="outline" onClick={() => download('/reports/sales-register', { from, to, format: 'csv' }, `sales_${from}_${to}.csv`).catch((e) => toast.error(errorMessage(e)))}><Download className="h-4 w-4" />Export</Button>}
        {can('sales.create') && <Link href="/pos"><Button><Plus className="h-4 w-4" />New bill</Button></Link>}</>} />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Invoice no., customer or mobile…" />
          <Select aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="w-36"><option value="">All statuses</option><option value="ISSUED">Issued</option><option value="DRAFT">Drafts</option><option value="CANCELLED">Cancelled</option></Select>
          <Select aria-label="Payment" value={pay} onChange={(e) => { setPay(e.target.value); setPage(1); }} className="w-36"><option value="">Any payment</option><option value="PAID">Paid</option><option value="PARTIAL">Partial</option><option value="UNPAID">Unpaid</option></Select>
          <Input aria-label="From date" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-36" /><Input aria-label="To date" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-36" />
        </div>
        <DataTable rows={list.data?.data} loading={list.isLoading} error={list.error ? errorMessage(list.error) : null} onRetry={() => list.refetch()} onRowClick={(r) => router.push(`/sales/${r.id}`)}
          empty={<EmptyState icon={ReceiptText} title="No invoices match" description="Change the filters or create a new bill." />}
          columns={[
            { key: 'number', header: 'Invoice', render: (r) => <span className="font-medium">{r.number ?? 'Draft'}</span> },
            { key: 'invoiceDate', header: 'Date', render: (r) => fmtDate(r.invoiceDate) },
            { key: 'customerName', header: 'Customer', render: (r) => <span>{r.customerName}{r.customerGstin && <span className="ml-1.5 text-xs text-faint">B2B</span>}</span> },
            { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            { key: 'paymentStatus', header: 'Payment', render: (r) => (r.status === 'ISSUED' ? <StatusBadge status={r.paymentStatus} /> : '—') },
            { key: 'grandTotal', header: 'Total', align: 'right', render: (r) => inr(r.grandTotal) },
            { key: 'due', header: 'Due', align: 'right', render: (r) => (r.status === 'ISSUED' ? inr(Math.max(0, r.grandTotal - r.returnedAmount - r.paidAmount)) : '—') },
          ]} />
        {list.data && <Pagination page={page} pageSize={25} total={list.data.total} onPage={setPage} />}
      </Card>
    </>
  );
}
