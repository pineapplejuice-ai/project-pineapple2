'use client';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { download, errorMessage } from '@/lib/api';
import { useCan, useGet } from '@/lib/hooks';
import { inr, qty } from '@/lib/utils';
import { Button, DataTable, EmptyState, type Column } from './ui';

const MONEY = /taxable|tax$|total|sales|amount|revenue|profit|value|cgst|sgst|igst|cess|balance|unpaid|returns|expenses|avgcost|averagebill|creditlimit|roundoff/i;
const QTY = /quantity|stock|sold|invoices|count|bills/i;
const label = (k: string): string => k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
export function autoColumns(rows: Array<Record<string, any>>, hide: string[] = []): Column<Record<string, any>>[] {
  const first = rows[0];
  if (!first) return [];
  return Object.keys(first).filter((k) => !/Id$|^id$/.test(k) && !hide.includes(k)).map((k) => {
    const money = MONEY.test(k) && !/rate|pct|name/i.test(k), q = !money && QTY.test(k) && typeof first[k] !== 'object';
    return { key: k, header: label(k), align: money || q || /rate/i.test(k) ? 'right' : 'left', render: (r) => (r[k] == null || r[k] === '' ? '—' : money ? inr(r[k]) : q ? qty(r[k]) : /rate/i.test(k) ? `${Number(r[k])}%` : String(r[k])) } as Column<Record<string, any>>;
  });
}

/** Generic tabular report: fetches /reports/:name and offers CSV export when permitted. */
export function ReportTable({ name, query, hide, emptyText = 'No data for this period' }: { name: string; query: Record<string, unknown>; hide?: string[]; emptyText?: string }) {
  const can = useCan();
  const { data, isLoading, error, refetch } = useGet<{ data: any }>(`/reports/${name}`, query);
  const rows: Array<Record<string, any>> = Array.isArray(data?.data) ? data!.data : [];
  return (
    <div>
      {can('reports.export') && rows.length > 0 && <div className="flex justify-end border-b px-3 py-2"><Button size="sm" variant="outline" onClick={() => download(`/reports/${name}`, { ...query, format: 'csv' }, `${name}_${query.from}_${query.to}.csv`).catch((e) => toast.error(errorMessage(e)))}><Download className="h-3.5 w-3.5" />Export CSV</Button></div>}
      <DataTable rowKey="__none" rows={rows} loading={isLoading} error={error ? errorMessage(error) : null} onRetry={() => refetch()} columns={autoColumns(rows, hide)} empty={<EmptyState title={emptyText} />} />
    </div>
  );
}
