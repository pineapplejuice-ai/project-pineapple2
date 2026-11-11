'use client';
import { RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/page';
import { Card, DataTable, EmptyState, Pagination } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { useList } from '@/lib/hooks';
import { fmtDate, inr } from '@/lib/utils';

export default function PurchaseReturnsPage() {
  const [page, setPage] = useState(1);
  const list = useList('/purchases/returns', { page, pageSize: 25 });
  return (
    <>
      <PageHeader title="Purchase Returns" description="Debit notes for goods sent back to suppliers. Start a return from the bill under Purchases → Bills." />
      <Card>
        <DataTable rows={list.data?.data} loading={list.isLoading} error={list.error ? errorMessage(list.error) : null} empty={<EmptyState icon={RotateCcw} title="No purchase returns yet" />}
          columns={[{ key: 'number', header: 'Debit note', render: (r) => <span className="font-medium">{r.number}</span> }, { key: 'returnDate', header: 'Date', render: (r) => fmtDate(r.returnDate) }, { key: 'supplierName', header: 'Supplier' }, { key: 'invoiceNumber', header: 'Against bill' }, { key: 'reason', header: 'Reason' },
            { key: 'taxableTotal', header: 'Taxable', align: 'right', render: (r) => inr(r.taxableTotal) }, { key: 'total', header: 'Total', align: 'right', render: (r) => inr(r.total) }]} />
        {list.data && <Pagination page={page} pageSize={25} total={list.data.total} onPage={setPage} />}
      </Card>
    </>
  );
}
