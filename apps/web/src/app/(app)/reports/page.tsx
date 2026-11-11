'use client';
import { useState } from 'react';
import { PageHeader } from '@/components/page';
import { ReportTable } from '@/components/report-view';
import { Card, Input, Select, Skeleton } from '@/components/ui';
import { useCan, useGet, useMe } from '@/lib/hooks';
import { cn, daysAgo, inr, today } from '@/lib/utils';

const REPORTS = [
  { id: 'sales-summary', label: 'Sales', group: 'Sales', desc: 'Invoices, tax, returns and net sales per period' },
  { id: 'top-products', label: 'Fast-moving products', group: 'Sales', desc: 'Best sellers by revenue' },
  { id: 'payment-modes', label: 'Payment modes', group: 'Sales', desc: 'Money received by cash, UPI, card and bank' },
  { id: 'branch-comparison', label: 'Branch comparison', group: 'Sales', desc: 'Sales, average bill and expenses by branch' },
  { id: 'profit', label: 'Profit & cash summary', group: 'Money', desc: 'Gross profit, estimated net profit and cash movement', perm: 'reports.profit' },
  { id: 'expenses', label: 'Expenses', group: 'Money', desc: 'Spend by category' },
  { id: 'receivables', label: 'Customer outstanding', group: 'Money', desc: 'Who owes you and since when' },
  { id: 'payables', label: 'Supplier balances', group: 'Money', desc: 'What you owe suppliers' },
  { id: 'purchases', label: 'Purchases by supplier', group: 'Stock', desc: 'Bills and unpaid amounts per supplier' },
  { id: 'stock-valuation', label: 'Stock valuation', group: 'Stock', desc: 'Quantity on hand at average cost and at selling price', perm: 'reports.profit' },
  { id: 'slow-moving', label: 'Slow-moving products', group: 'Stock', desc: 'Stocked items that sold least in the period' },
  { id: 'dead-stock', label: 'Dead stock', group: 'Stock', desc: 'Stocked items with no sale in the period' },
] as const;

function ProfitSummary({ query }: { query: Record<string, unknown> }) {
  const { data, isLoading } = useGet<{ data: Record<string, string> }>('/reports/profit', query);
  if (isLoading || !data) return <div className="p-4"><Skeleton className="h-48" /></div>;
  const p = data.data;
  const Line = ({ l, v, strong, sub, tone }: { l: string; v: string; strong?: boolean; sub?: string; tone?: string }) => <div className={cn('flex items-baseline justify-between py-1.5', strong && 'border-t font-semibold')}><span>{l}{sub && <span className="ml-2 text-xs font-normal text-faint">{sub}</span>}</span><span className={cn('num', tone)}>{inr(v)}</span></div>;
  return (
    <div className="grid gap-6 p-5 text-sm md:grid-cols-2">
      <div><h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">Profit</h3>
        <Line l="Revenue" sub="sales excluding GST, net of returns" v={p.revenue!} /><Line l="Cost of goods sold" v={`-${p.costOfGoodsSold}`} />
        <Line l="Gross profit" sub={`${p.grossMarginPct}% margin`} v={p.grossProfit!} strong tone={Number(p.grossProfit) >= 0 ? 'text-ok' : 'text-bad'} />
        <Line l="Recorded expenses" v={`-${p.expenses}`} /><Line l="Estimated net profit" v={p.estimatedNetProfit!} strong tone={Number(p.estimatedNetProfit) >= 0 ? 'text-ok' : 'text-bad'} />
        <p className="mt-2 text-xs text-faint">An estimate for running the shop: it does not include depreciation, interest, owner drawings or income tax.</p></div>
      <div><h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">Cash movement (not profit)</h3>
        <Line l="Money received" sub="all modes" v={p.moneyIn!} /><Line l="Money paid out" sub="suppliers, refunds, expenses" v={`-${p.moneyOut}`} /><Line l="Net cash movement" v={p.netCashMovement!} strong />
        <Line l="Purchases booked" sub="bills in period, incl. GST" v={p.purchases!} />
        <p className="mt-2 text-xs text-faint">Cash differs from profit because of credit sales, unpaid supplier bills, GST collected and stock you have bought but not yet sold.</p></div>
    </div>
  );
}

export default function ReportsPage() {
  const can = useCan(), me = useMe();
  const [id, setId] = useState<string>('sales-summary'), [from, setFrom] = useState(daysAgo(29)), [to, setTo] = useState(today()), [group, setGroup] = useState('day'), [branchId, setBranchId] = useState('');
  const visible = REPORTS.filter((r) => !('perm' in r) || can(r.perm));
  const current = visible.find((r) => r.id === id) ?? visible[0]!;
  const query = { from, to, branchId: branchId || undefined, ...(current.id === 'sales-summary' ? { group } : {}) };
  return (
    <>
      <PageHeader title="Reports" description="Calculated live from your records for the dates you choose" />
      <div className="grid gap-4 lg:grid-cols-[230px_1fr]">
        <Card className="h-fit p-2">{['Sales', 'Money', 'Stock'].map((g) => (
          <div key={g} className="mb-2"><p className="px-2 py-1 text-2xs font-semibold uppercase tracking-wider text-faint">{g}</p>
            {visible.filter((r) => r.group === g).map((r) => <button key={r.id} onClick={() => setId(r.id)} aria-current={current.id === r.id} className={cn('block w-full rounded-md px-2 py-1.5 text-left text-[13px] font-medium', current.id === r.id ? 'bg-brand-soft text-brand' : 'text-muted hover:bg-ink/5 hover:text-ink')}>{r.label}</button>)}</div>))}</Card>
        <Card>
          <div className="flex flex-wrap items-center gap-2 border-b p-3">
            <div className="mr-auto"><h2 className="text-sm font-semibold">{current.label}</h2><p className="text-xs text-muted">{current.desc}</p></div>
            {current.id === 'sales-summary' && <Select aria-label="Group by" value={group} onChange={(e) => setGroup(e.target.value)} className="w-28"><option value="day">Daily</option><option value="week">Weekly</option><option value="month">Monthly</option><option value="year">Annual</option></Select>}
            {(me.data?.branches.length ?? 0) > 1 && <Select aria-label="Branch" value={branchId} onChange={(e) => setBranchId(e.target.value)} className="w-40"><option value="">All branches</option>{me.data!.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select>}
            <Input aria-label="From date" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-36" /><Input aria-label="To date" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-36" />
          </div>
          {current.id === 'profit' ? <ProfitSummary query={query} /> : <ReportTable key={current.id} name={current.id} query={query} />}
        </Card>
      </div>
    </>
  );
}
