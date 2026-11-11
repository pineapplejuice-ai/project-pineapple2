'use client';
import { AlertTriangle, ArrowUpRight, IndianRupee, PackageSearch, ReceiptText, TrendingUp, Users, Truck, Boxes, ShoppingCart } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { PageHeader } from '@/components/page';
import { Button, Card, CardHeader, EmptyState, ErrorState, Skeleton, StatusBadge } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { useGet } from '@/lib/hooks';
import { cn, daysAgo, fmtDate, inr, qty, today } from '@/lib/utils';

const RANGES = [{ id: 'today', label: 'Today', from: () => today() }, { id: '7d', label: '7 days', from: () => daysAgo(6) }, { id: '30d', label: '30 days', from: () => daysAgo(29) }, { id: '90d', label: '90 days', from: () => daysAgo(89) }, { id: 'fy', label: 'This FY', from: () => { const t = today(); const y = Number(t.slice(0, 4)) - (Number(t.slice(5, 7)) < 4 ? 1 : 0); return `${y}-04-01`; } }];
const PIE = ['rgb(var(--brand))', '#6366f1', '#f59e0b', '#ec4899', '#64748b'];

function Stat({ label, value, sub, icon: Icon, tone, href }: { label: string; value: string | null; sub?: string; icon: React.ComponentType<{ className?: string }>; tone?: string; href?: string }) {
  const body = (
    <Card className={cn('p-4 transition-shadow', href && 'hover:shadow-md')}>
      <div className="flex items-center justify-between"><span className="text-xs font-medium text-muted">{label}</span><Icon className={cn('h-4 w-4', tone ?? 'text-faint')} /></div>
      <p className="num mt-2 text-2xl font-semibold tracking-tight">{value ?? <span className="text-sm font-normal text-faint">Restricted</span>}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default function DashboardPage() {
  const [range, setRange] = useState('30d');
  const from = RANGES.find((r) => r.id === range)!.from();
  const { data: d, isLoading, error, refetch } = useGet<any>('/dashboard', { from, to: today() });
  if (error) return <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />;
  const trend = (d?.salesTrend ?? []).map((r: any) => ({ day: String(r.period).slice(5), sales: Number(r.netSales) }));
  const pay = (d?.paymentBreakdown ?? []).map((p: any) => ({ name: p.mode.replace('_', ' '), value: Number(p.amount) }));
  return (
    <>
      <PageHeader title="Dashboard" description="Live figures from your invoices, purchases, payments and stock ledger"
        actions={<div className="flex rounded-md border bg-surface p-0.5">{RANGES.map((r) => <button key={r.id} onClick={() => setRange(r.id)} aria-pressed={range === r.id} className={cn('rounded px-2.5 py-1 text-xs font-medium', range === r.id ? 'bg-brand text-brand-fg' : 'text-muted hover:text-ink')}>{r.label}</button>)}</div>} />
      {isLoading || !d ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-24" />)}</div> : (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Today's revenue" value={inr(d.today.revenue)} sub={`${d.today.invoices} invoice${d.today.invoices === 1 ? '' : 's'} · avg ${inr(d.today.averageBill)}`} icon={IndianRupee} tone="text-brand" />
            <Stat label="Sales in period" value={inr(d.period.sales)} sub={`${d.period.invoices} invoices · avg bill ${inr(d.period.averageBill)}`} icon={ReceiptText} href="/sales" />
            <Stat label="Gross profit" value={d.period.grossProfit === null ? null : inr(d.period.grossProfit)} sub={d.period.grossMarginPct !== null ? `${d.period.grossMarginPct}% margin on sales before expenses` : undefined} icon={TrendingUp} tone="text-ok" />
            <Stat label="Estimated net profit" value={d.period.estimatedNetProfit === null ? null : inr(d.period.estimatedNetProfit)} sub={`After ${inr(d.period.expenses)} of recorded expenses`} icon={ArrowUpRight} />
            <Stat label="Receivables" value={inr(d.receivables)} sub="Customers owe you" icon={Users} href="/customers" />
            <Stat label="Supplier payables" value={inr(d.payables)} sub="You owe suppliers" icon={Truck} href="/suppliers" />
            <Stat label="Inventory value" value={d.inventoryValue === null ? null : inr(d.inventoryValue)} sub="At average cost" icon={Boxes} href="/inventory" />
            <Stat label="Purchases in period" value={inr(d.period.purchases)} sub={`${d.lowStockCount} item${d.lowStockCount === 1 ? '' : 's'} low on stock`} icon={ShoppingCart} href="/purchases" />
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2"><CardHeader title="Sales trend" description={`${fmtDate(d.range.from)} – ${fmtDate(d.range.to)}, net of returns`} />
              <div className="h-64 p-3">{trend.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trend} margin={{ left: 0, right: 8, top: 8 }}>
                    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="rgb(var(--brand))" stopOpacity={0.3} /><stop offset="100%" stopColor="rgb(var(--brand))" stopOpacity={0} /></linearGradient></defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--line))" vertical={false} />
                    <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'rgb(var(--faint))' }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: 'rgb(var(--faint))' }} tickLine={false} axisLine={false} width={56} tickFormatter={(v) => (v >= 100000 ? `${(v / 100000).toFixed(1)}L` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)} />
                    <Tooltip formatter={(v: number) => [inr(v), 'Net sales']} contentStyle={{ background: 'rgb(var(--raised))', border: '1px solid rgb(var(--line))', borderRadius: 8, fontSize: 12 }} />
                    <Area type="monotone" dataKey="sales" stroke="rgb(var(--brand))" strokeWidth={2} fill="url(#g)" />
                  </AreaChart>
                </ResponsiveContainer>) : <EmptyState icon={TrendingUp} title="No sales in this period" action={<Link href="/pos"><Button size="sm">Create a bill</Button></Link>} />}</div>
            </Card>
            <Card><CardHeader title="Payment breakdown" description="Money received by mode" />
              <div className="h-64 p-3">{pay.length ? (
                <div className="flex h-full flex-col"><div className="min-h-0 flex-1"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={pay} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={2} strokeWidth={0}>{pay.map((_: unknown, i: number) => <Cell key={i} fill={PIE[i % PIE.length]} />)}</Pie>
                  <Tooltip formatter={(v: number) => inr(v)} contentStyle={{ background: 'rgb(var(--raised))', border: '1px solid rgb(var(--line))', borderRadius: 8, fontSize: 12 }} /></PieChart></ResponsiveContainer></div>
                  <ul className="space-y-1 text-xs">{pay.map((p: any, i: number) => <li key={p.name} className="flex items-center justify-between"><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: PIE[i % PIE.length] }} />{p.name}</span><span className="num">{inr(p.value)}</span></li>)}</ul></div>
              ) : <EmptyState title="No payments yet" />}</div>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card><CardHeader title="Top-selling products" description="By revenue in the period" />
              {d.topProducts.length ? <ul className="divide-y">{d.topProducts.map((p: any) => <li key={p.variantId} className="flex items-center justify-between gap-3 px-4 py-2.5"><div className="min-w-0"><p className="truncate text-sm font-medium">{p.name}</p><p className="text-xs text-muted">{qty(p.quantity)} sold</p></div><span className="num text-sm">{inr(p.revenue)}</span></li>)}</ul> : <EmptyState icon={PackageSearch} title="Nothing sold yet" />}
            </Card>
            <Card><CardHeader title="Low stock" description="At or below minimum / reorder level" action={<Link href="/inventory?low=true" className="text-xs text-brand hover:underline">View all</Link>} />
              {d.lowStock.length ? <ul className="divide-y">{d.lowStock.map((p: any) => <li key={p.variantId} className="flex items-center justify-between gap-3 px-4 py-2.5"><div className="min-w-0"><p className="truncate text-sm font-medium">{p.name}</p><p className="text-xs text-muted">{p.sku} · reorder at {qty(p.threshold)}</p></div><span className="num flex items-center gap-1 text-sm font-medium text-warn"><AlertTriangle className="h-3.5 w-3.5" />{qty(p.quantity)}</span></li>)}</ul> : <EmptyState title="Stock levels look healthy" description="Set a minimum stock on products to get alerts." />}
            </Card>
            <Card><CardHeader title="Recent transactions" action={<Link href="/sales" className="text-xs text-brand hover:underline">All sales</Link>} />
              {d.recentInvoices.length ? <ul className="divide-y">{d.recentInvoices.map((i: any) => <li key={i.id}><Link href={`/sales/${i.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-ink/[0.03]"><div className="min-w-0"><p className="truncate text-sm font-medium">{i.number}</p><p className="truncate text-xs text-muted">{i.customerName} · {fmtDate(i.invoiceDate)}</p></div><div className="text-right"><p className="num text-sm">{inr(i.grandTotal)}</p><StatusBadge status={i.status === 'CANCELLED' ? 'CANCELLED' : i.paymentStatus} /></div></Link></li>)}</ul> : <EmptyState icon={ReceiptText} title="No invoices yet" />}
            </Card>
          </div>
          <p className="text-xs text-faint">Gross profit = sales (excluding GST) − cost of goods sold. Estimated net profit also subtracts recorded expenses; it is not a statutory figure. Neither is the same as cash in hand.</p>
        </div>
      )}
    </>
  );
}
