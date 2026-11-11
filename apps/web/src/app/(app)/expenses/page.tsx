'use client';
import { useQueryClient } from '@tanstack/react-query';
import { cashCloseSchema, cashOpenSchema, expenseCategorySchema, expenseSchema } from '@nexbill/validation';
import { Landmark, Plus, Wallet } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { FormDialog } from '@/components/form-dialog';
import { PageHeader, SearchBox } from '@/components/page';
import { Badge, Button, Card, CardHeader, ConfirmDialog, DataTable, EmptyState, Input, Pagination } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useCan, useDebounced, useGet, useList, useLocation } from '@/lib/hooks';
import { daysAgo, fmtDate, fmtDateTime, inr, today } from '@/lib/utils';

const MODES = [{ value: 'CASH', label: 'Cash' }, { value: 'UPI', label: 'UPI' }, { value: 'BANK_TRANSFER', label: 'Bank transfer' }, { value: 'CARD', label: 'Card' }, { value: 'CHEQUE', label: 'Cheque' }];

export default function ExpensesPage() {
  const can = useCan(), qc = useQueryClient(), loc = useLocation();
  const [q, setQ] = useState(''), [from, setFrom] = useState(daysAgo(29)), [to, setTo] = useState(today()), [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<null | 'expense' | 'category' | 'open' | 'close'>(null), [voiding, setVoiding] = useState<any | null>(null);
  const cats = useGet<any[]>('/expense-categories');
  const list = useList('/expenses', { q: useDebounced(q), from, to, page, pageSize: 25 });
  const cash = useGet<any>(can('cash.manage') && loc.branch ? '/cash/current' : null, { branchId: loc.branch?.id });
  const refresh = async () => { await qc.invalidateQueries({ queryKey: ['/expenses'] }); await qc.invalidateQueries({ queryKey: ['/cash/current'] }); };
  const manage = can('expenses.manage');
  return (
    <>
      <PageHeader title="Expenses" description="Day-to-day running costs and the daily cash register" actions={manage && <><Button variant="outline" onClick={() => setDialog('category')}>New category</Button><Button onClick={() => setDialog('expense')}><Plus className="h-4 w-4" />Add expense</Button></>} />
      {can('cash.manage') && (
        <Card className="mb-4"><CardHeader title={`Cash register · ${loc.branch?.name ?? ''}`} description={cash.data?.session ? `Opened ${fmtDateTime(cash.data.session.openedAt)}` : 'Open the register at the start of the day to reconcile cash at closing'}
          action={cash.data?.session ? <Button size="sm" onClick={() => setDialog('close')}>Close register</Button> : <Button size="sm" variant="outline" onClick={() => setDialog('open')}><Landmark className="h-3.5 w-3.5" />Open register</Button>} />
          {cash.data?.summary ? (
            <div className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-5">{[['Opening cash', cash.data.summary.opening], ['Cash received', cash.data.summary.cashIn], ['Cash paid / refunded', cash.data.summary.cashOut], ['Cash expenses', cash.data.summary.cashExpenses], ['Expected in drawer', cash.data.summary.expected]].map(([l, v], i) =>
              <div key={l}><p className="text-xs text-muted">{l}</p><p className={`num mt-0.5 text-lg font-semibold ${i === 4 ? 'text-brand' : ''}`}>{inr(v)}</p></div>)}</div>
          ) : cash.data?.history?.length ? (
            <ul className="divide-y text-sm">{cash.data.history.slice(0, 3).map((h: any) => <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2"><span className="text-muted">{fmtDateTime(h.closedAt)}</span><span>Expected <b className="num">{inr(h.expectedCash)}</b> · Counted <b className="num">{inr(h.countedCash)}</b></span>
              <Badge tone={+h.difference === 0 ? 'ok' : 'warn'}>{+h.difference === 0 ? 'Tallied' : `${+h.difference > 0 ? 'Excess' : 'Short'} ${inr(Math.abs(h.difference))}`}</Badge></li>)}</ul>
          ) : null}
        </Card>
      )}
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Payee or note…" />
          <Input aria-label="From date" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-36" /><Input aria-label="To date" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-36" />
          <span className="ml-auto text-sm text-muted">Total <b className="num text-ink">{inr(list.data?.totalAmount)}</b></span>
        </div>
        <DataTable rows={list.data?.data} loading={list.isLoading} error={list.error ? errorMessage(list.error) : null} empty={<EmptyState icon={Wallet} title="No expenses in this period" />}
          columns={[{ key: 'expenseDate', header: 'Date', render: (r) => fmtDate(r.expenseDate) }, { key: 'category', header: 'Category', render: (r) => r.category.name }, { key: 'payee', header: 'Paid to' }, { key: 'note', header: 'Note' }, { key: 'mode', header: 'Mode', render: (r) => r.mode.replace('_', ' ') },
            { key: 'amount', header: 'Amount', align: 'right', render: (r) => <span className={r.voidedAt ? 'text-faint line-through' : ''}>{inr(r.amount)}</span> },
            { key: '_a', header: '', align: 'right', render: (r) => (r.voidedAt ? <Badge tone="bad">Void</Badge> : manage ? <Button size="sm" variant="ghost" onClick={() => setVoiding(r)}>Void</Button> : null) }]} />
        {list.data && <Pagination page={page} pageSize={25} total={list.data.total} onPage={setPage} />}
      </Card>
      <FormDialog open={dialog === 'expense'} onClose={() => setDialog(null)} title="Add expense" schema={expenseSchema} defaults={{ mode: 'CASH', expenseDate: today(), branchId: loc.branch?.id }}
        fields={[{ name: 'categoryId', label: 'Category', type: 'select', required: true, options: (cats.data ?? []).map((c) => ({ value: c.id, label: c.name })) }, { name: 'amount', label: 'Amount (₹)', type: 'number', required: true }, { name: 'expenseDate', label: 'Date', type: 'date' }, { name: 'mode', label: 'Paid by', type: 'select', options: MODES }, { name: 'payee', label: 'Paid to' }, { name: 'note', label: 'Note' }]}
        onSubmit={async (v) => { await api('/expenses', { body: v }); toast.success('Expense added'); await refresh(); }} />
      <FormDialog open={dialog === 'category'} onClose={() => setDialog(null)} title="New expense category" schema={expenseCategorySchema} fields={[{ name: 'name', label: 'Name', required: true, wide: true }]}
        onSubmit={async (v) => { await api('/expense-categories', { body: v }); toast.success('Category added'); await qc.invalidateQueries({ queryKey: ['/expense-categories'] }); }} />
      <FormDialog open={dialog === 'open'} onClose={() => setDialog(null)} title="Open cash register" description="Count the cash in the drawer before the first sale." schema={cashOpenSchema} defaults={{ branchId: loc.branch?.id }} submitLabel="Open register"
        fields={[{ name: 'openingCash', label: 'Opening cash (₹)', type: 'number', required: true, wide: true }]} onSubmit={async (v) => { await api('/cash/open', { body: v }); toast.success('Register opened'); await refresh(); }} />
      <FormDialog open={dialog === 'close'} onClose={() => setDialog(null)} title="Close cash register" description={`Expected in drawer: ${inr(cash.data?.summary?.expected)}. Count the cash and enter the actual amount.`} schema={cashCloseSchema} submitLabel="Close register"
        fields={[{ name: 'countedCash', label: 'Counted cash (₹)', type: 'number', required: true }, { name: 'note', label: 'Note' }]}
        onSubmit={async (v) => { const r = await api<any>(`/cash/${cash.data.session.id}/close`, { body: v }); (+r.difference === 0 ? toast.success : toast.warning)(+r.difference === 0 ? 'Cash tallied' : `Closed with a difference of ${inr(r.difference)}`); await refresh(); }} />
      <ConfirmDialog open={!!voiding} onClose={() => setVoiding(null)} danger title="Void this expense?" message={<>The expense of <b>{inr(voiding?.amount)}</b> stays on record as void and is excluded from totals.</>} confirmLabel="Void expense"
        onConfirm={async () => { try { await api(`/expenses/${voiding.id}/void`, { method: 'POST' }); toast.success('Expense voided'); setVoiding(null); await refresh(); } catch (e) { toast.error(errorMessage(e)); } }} />
    </>
  );
}
