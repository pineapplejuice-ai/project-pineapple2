'use client';
import { useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/page';
import { Badge, Button, Card, CardHeader, ConfirmDialog, DataTable, ErrorState, Spinner, StatusBadge } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useGet } from '@/lib/hooks';
import { cn, fmtDate, inr } from '@/lib/utils';

const FEATURE: Record<string, string> = { billing: 'GST billing & POS', products: 'Product management', basic_reports: 'Basic reports', advanced_inventory: 'Batches, transfers & stock counts', gst_reports: 'GST reports', suppliers: 'Supplier management', customer_credit: 'Customer credit',
  purchases: 'Purchase orders & GRN', multi_branch: 'Multiple branches', advanced_analytics: 'Advanced analytics', industry_modules: 'Industry modules', custom_roles: 'Custom roles', multi_warehouse: 'Unlimited warehouses', integrations: 'Integrations' };
const USAGE: Array<[string, string]> = [['businesses', 'Businesses'], ['branches', 'Branches'], ['warehouses', 'Warehouses'], ['users', 'Users'], ['invoicesPerMonth', 'Invoices this month']];

export default function SubscriptionPage() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useGet<any>('/subscription');
  const [target, setTarget] = useState<any | null>(null), [busy, setBusy] = useState(false);
  if (error) return <ErrorState message={errorMessage(error)} />;
  if (isLoading || !data) return <div className="flex justify-center py-20"><Spinner /></div>;
  const sub = data.subscription, current = data.plans.find((p: any) => p.code === sub.plan);
  const change = async () => {
    setBusy(true);
    try { const r = await api<any>('/subscription/change-plan', { body: { plan: target.code } }); toast.success(r.pendingPlan ? `Your plan changes to ${target.name} at the next renewal` : `You are now on ${target.name}`); setTarget(null); await qc.invalidateQueries({ queryKey: ['/subscription'] }); await qc.invalidateQueries({ queryKey: ['me'] }); }
    catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <>
      <PageHeader title="Subscription" description="Your plan, usage and billing history" />
      <Card className="mb-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div><div className="flex items-center gap-2"><h2 className="text-lg font-semibold">{current.name}</h2><StatusBadge status={sub.status} />{sub.pendingPlan && <Badge tone="warn">Changes to {sub.pendingPlan} at renewal</Badge>}</div>
            <p className="mt-1 text-sm text-muted">{sub.status === 'TRIALING' ? `Free trial ends on ${fmtDate(sub.trialEndsAt)}. Choose a plan to keep billing after that.` : `${sub.cancelAtPeriodEnd ? 'Ends' : 'Renews'} on ${fmtDate(sub.currentPeriodEnd)}, with a ${data.graceDays}-day grace period. Your data stays readable even if the plan lapses.`}</p></div>
          <div className="grid grid-cols-5 gap-5">{USAGE.map(([k, l]) => { const lim = current.limits[k]; return <div key={k}><p className="text-xs text-muted">{l}</p><p className="num mt-0.5 text-sm font-semibold">{data.usage[k]}<span className="font-normal text-faint"> / {lim ?? '∞'}</span></p></div>; })}</div>
        </div>
      </Card>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{data.plans.map((p: any) => { const isCurrent = p.code === sub.plan && sub.status !== 'TRIALING'; return (
        <Card key={p.code} className={cn('flex flex-col p-5', p.code === sub.plan && 'border-brand ring-1 ring-brand')}>
          <h3 className="text-sm font-semibold">{p.name}</h3><p className="mt-2"><span className="num text-2xl font-semibold">{inr(p.monthlyPriceInr).replace('.00', '')}</span><span className="text-xs text-muted"> / month + GST</span></p>
          <p className="mt-1 text-xs text-muted">{p.limits.users ?? 'Unlimited'} user{p.limits.users === 1 ? '' : 's'} · {p.limits.branches ?? 'Unlimited'} branch{p.limits.branches === 1 ? '' : 'es'} · {p.limits.invoicesPerMonth ? `${p.limits.invoicesPerMonth} invoices/mo` : 'Unlimited invoices'}</p>
          <ul className="my-4 flex-1 space-y-1.5 text-xs">{p.features.map((f: string) => <li key={f} className="flex gap-1.5"><Check className="mt-0.5 h-3 w-3 shrink-0 text-brand" />{FEATURE[f] ?? f}</li>)}</ul>
          <Button variant={isCurrent ? 'outline' : 'primary'} disabled={isCurrent} onClick={() => setTarget(p)}>{isCurrent ? 'Current plan' : sub.status === 'TRIALING' ? `Choose ${p.name}` : p.monthlyPriceInr > current.monthlyPriceInr ? 'Upgrade' : 'Downgrade'}</Button>
        </Card>); })}</div>
      <Card className="mt-4"><CardHeader title="Subscription invoices" />
        <DataTable rows={sub.invoices} empty={<p className="px-4 py-6 text-center text-xs text-faint">No subscription invoices yet</p>}
          columns={[{ key: 'number', header: 'Invoice' }, { key: 'createdAt', header: 'Date', render: (r) => fmtDate(r.createdAt) }, { key: 'plan', header: 'Plan' }, { key: 'period', header: 'Period', render: (r) => `${fmtDate(r.periodStart)} – ${fmtDate(r.periodEnd)}` }, { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> }, { key: 'total', header: 'Amount', align: 'right', render: (r) => inr(r.total) }]} /></Card>
      {data.gateway === 'mock' && <p className="mt-3 text-xs text-faint">Payments run through a built-in test gateway in this build: no money is charged. A live payment provider must be connected before selling subscriptions.</p>}
      <ConfirmDialog open={!!target} onClose={() => setTarget(null)} onConfirm={change} loading={busy} title={`Switch to ${target?.name}?`} confirmLabel="Confirm"
        message={target && (sub.status === 'ACTIVE' && target.monthlyPriceInr < current.monthlyPriceInr ? <>Your plan will change to <b>{target.name}</b> at the next renewal on {fmtDate(sub.currentPeriodEnd)}. Features and limits not in that plan stop then.</> : <><b>{target.name}</b> starts now for {inr(target.monthlyPriceInr)} + 18% GST per month.</>)} />
    </>
  );
}
