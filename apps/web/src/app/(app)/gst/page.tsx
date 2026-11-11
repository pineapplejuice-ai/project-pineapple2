'use client';
import { Info } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/page';
import { autoColumns, ReportTable } from '@/components/report-view';
import { Card, CardHeader, DataTable, EmptyState, Input, Skeleton, Tabs } from '@/components/ui';
import { useBusiness, useGet } from '@/lib/hooks';
import { inr } from '@/lib/utils';

type Tab = 'gstr1' | 'gstr3b' | 'sales-register' | 'purchase-register' | 'hsn-summary' | 'tax-summary';
const monthStart = (): string => { const d = new Date(Date.now() + 5.5 * 3600000); return `${d.toISOString().slice(0, 8)}01`; };
const todayStr = (): string => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);

function Gstr1({ query }: { query: Record<string, unknown> }) {
  const { data, isLoading } = useGet<{ data: any }>('/reports/gstr1', query);
  if (isLoading || !data) return <div className="p-4"><Skeleton className="h-64" /></div>;
  const g = data.data;
  const Section = ({ title, hint, rows }: { title: string; hint: string; rows: any[] }) => (
    <div className="border-b last:border-0"><div className="px-4 pt-3"><h3 className="text-sm font-semibold">{title} <span className="font-normal text-faint">({rows.length})</span></h3><p className="text-xs text-muted">{hint}</p></div>
      <DataTable rowKey="__none" rows={rows} columns={autoColumns(rows, ['placeOfSupply'])} empty={<p className="px-4 py-4 text-xs text-faint">No records</p>} /></div>
  );
  return (
    <>
      <div className="grid grid-cols-2 gap-4 border-b p-4 text-sm sm:grid-cols-4">{[['Documents issued', g.documents.total], ['Cancelled', g.documents.cancelled], ['First number', g.documents.from ?? '—'], ['Last number', g.documents.to ?? '—']].map(([l, v]) => <div key={l}><p className="text-xs text-muted">{l}</p><p className="mt-0.5 font-semibold">{v}</p></div>)}</div>
      <Section title="B2B – supplies to registered persons" hint="Table 4A: invoice-wise, by rate" rows={g.b2b} />
      <Section title="B2C large" hint="Table 5: inter-state invoices to unregistered persons above the notified value" rows={g.b2cl} />
      <Section title="B2C others" hint="Table 7: consolidated by place of supply and rate" rows={g.b2cs} />
      <Section title="Credit notes" hint="Table 9B: CDNR (registered) and CDNUR (unregistered)" rows={g.creditNotes} />
      <Section title="HSN summary" hint="Table 12" rows={g.hsn} />
    </>
  );
}

function Gstr3b({ query }: { query: Record<string, unknown> }) {
  const { data, isLoading } = useGet<{ data: any }>('/reports/gstr3b', query);
  if (isLoading || !data) return <div className="p-4"><Skeleton className="h-64" /></div>;
  const g = data.data;
  const Tbl = ({ title, row, note }: { title: string; row: Record<string, string>; note?: string }) => (
    <div className="rounded-lg border"><div className="border-b bg-ink/[0.025] px-4 py-2 text-sm font-semibold">{title}</div>
      <div className="grid grid-cols-2 gap-3 p-4 text-sm sm:grid-cols-5">{(['taxable', 'cgst', 'sgst', 'igst', 'cess'] as const).map((k) => <div key={k}><p className="text-xs uppercase text-muted">{k === 'taxable' ? 'Taxable value' : k}</p><p className="num mt-0.5 font-medium">{inr(row[k])}</p></div>)}</div>
      {note && <p className="border-t px-4 py-2 text-xs text-faint">{note}</p>}</div>
  );
  return (
    <div className="space-y-4 p-4">
      <Tbl title="3.1(a) Outward taxable supplies (net of credit notes)" row={g.outwardTaxable} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border p-4 text-sm"><p className="text-xs text-muted">3.1(c) Nil rated / exempt outward supplies</p><p className="num mt-1 text-lg font-semibold">{inr(g.nilRatedExempt)}</p></div>
        <div className="rounded-lg border p-4 text-sm"><p className="text-xs text-muted">3.2 Inter-state supplies to unregistered persons</p><p className="num mt-1 text-lg font-semibold">{inr(g.interStateToUnregistered.taxable)} <span className="text-xs font-normal text-muted">IGST {inr(g.interStateToUnregistered.igst)}</span></p></div>
      </div>
      <Tbl title="4(A) Input tax credit from purchase bills" row={g.inputTaxCredit} note={`${g.inputTaxCredit.note} Tax reversed on purchase returns: ${inr(g.inputTaxCredit.purchaseReturnTaxReversed)}.`} />
      <div className="flex items-center justify-between rounded-lg bg-brand-soft px-4 py-3 text-sm text-brand"><span className="font-medium">Estimated net tax payable for the period</span><span className="num text-lg font-semibold">{inr(g.estimatedNetTaxPayable)}</span></div>
    </div>
  );
}

export default function GstPage() {
  const business = useBusiness();
  const [tab, setTab] = useState<Tab>('gstr1'), [from, setFrom] = useState(monthStart()), [to, setTo] = useState(todayStr());
  const query = { from, to };
  return (
    <>
      <PageHeader title="GST Centre" description={business?.gstin ? `GSTIN ${business.gstin}` : 'Your business is not marked as GST registered'}
        actions={<><Input aria-label="From date" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-36" /><Input aria-label="To date" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-36" /></>} />
      <div className="mb-4 flex gap-2 rounded-lg border border-warn/30 bg-warn/5 px-4 py-3 text-xs text-muted"><Info className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
        <p><b className="text-ink">Preparation reports only.</b> NEXBILL does not file returns, generate IRNs or e-way bills. Review these figures with your accountant against current GST rules, then file on the GST portal or through an authorised GSP. E-invoicing and e-way bill connections are available as integration points under Integrations.</p></div>
      {!business?.gstRegistered ? <Card><EmptyState title="GST is switched off for this business" description="Unregistered businesses issue a bill of supply and have no GST returns. Turn on GST registration in Settings to use these reports." /></Card> : (
        <Card>
          <div className="px-3 pt-1"><Tabs value={tab} onChange={setTab} tabs={[{ id: 'gstr1', label: 'GSTR-1 preparation' }, { id: 'gstr3b', label: 'GSTR-3B summary' }, { id: 'sales-register', label: 'Sales register' }, { id: 'purchase-register', label: 'Purchase register' }, { id: 'hsn-summary', label: 'HSN summary' }, { id: 'tax-summary', label: 'Tax by rate' }]} /></div>
          {tab === 'gstr1' ? <Gstr1 query={query} /> : tab === 'gstr3b' ? <Gstr3b query={query} /> : <ReportTable key={tab} name={tab} query={query} />}
        </Card>
      )}
      <Card className="mt-4"><CardHeader title="Document types in use" description="Tax invoice for GST-registered businesses; bill of supply otherwise. Sales returns create credit notes (CN/…), purchase returns create debit notes (DN/…)." /></Card>
    </>
  );
}
