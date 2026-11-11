'use client';
import { useQueryClient } from '@tanstack/react-query';
import { stockAdjustSchema } from '@nexbill/validation';
import { ArrowLeftRight, Boxes, ClipboardCheck, SlidersHorizontal, Trash2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { toast } from 'sonner';
import { FormDialog } from '@/components/form-dialog';
import { PageHeader, SearchBox } from '@/components/page';
import { Badge, Button, Card, DataTable, Dialog, EmptyState, Field, Input, Pagination, Select, StatusBadge, Tabs } from '@/components/ui';
import { VariantPicker } from '@/components/variant-picker';
import { api, errorMessage } from '@/lib/api';
import { useCan, useDebounced, useGet, useList } from '@/lib/hooks';
import { cn, fmtDate, fmtDateTime, inr, qty } from '@/lib/utils';

type Tab = 'stock' | 'movements' | 'transfers' | 'batches';
const TYPES = [{ value: 'ADJUSTMENT', label: 'Correction (+/−)' }, { value: 'DAMAGE', label: 'Damaged goods (−)' }, { value: 'WASTAGE', label: 'Wastage (−)' }, { value: 'OPENING', label: 'Opening stock (+)' }];

function Inner() {
  const can = useCan(), qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('stock'), [q, setQ] = useState(''), [warehouseId, setWarehouseId] = useState(''), [low, setLow] = useState(useSearchParams().get('low') === 'true'), [page, setPage] = useState(1);
  const [adjust, setAdjust] = useState<any | null>(null), [transfer, setTransfer] = useState(false), [count, setCount] = useState(false);
  const warehouses = useGet<any[]>('/warehouses');
  const stock = useList('/inventory/stock', { q: useDebounced(q), warehouseId, low: low || undefined, page, pageSize: 25 }, tab === 'stock');
  const moves = useList('/inventory/movements', { warehouseId, page, pageSize: 25 }, tab === 'movements');
  const transfers = useList('/inventory/transfers', { page, pageSize: 25 }, tab === 'transfers');
  const batches = useGet<any[]>(tab === 'batches' ? '/inventory/batches' : null, { warehouseId, expiringInDays: 3650 });
  const refresh = () => qc.invalidateQueries({ queryKey: ['/inventory/stock'] }).then(() => qc.invalidateQueries({ queryKey: ['/inventory/movements'] })).then(() => qc.invalidateQueries({ queryKey: ['/inventory/transfers'] }));
  const whName = (id: string) => warehouses.data?.find((w) => w.id === id)?.name ?? '—';
  const decide = async (id: string, d: 'approve' | 'reject') => { try { await api(`/inventory/transfers/${id}/${d}`, { method: 'POST' }); toast.success(d === 'approve' ? 'Transfer completed' : 'Transfer rejected'); await refresh(); } catch (e) { toast.error(errorMessage(e)); } };
  const manage = can('inventory.manage');
  return (
    <>
      <PageHeader title="Inventory" description="Every change is recorded in the stock ledger with its source document, user and time" actions={manage && <>
        <Button variant="outline" onClick={() => setCount(true)}><ClipboardCheck className="h-4 w-4" />Stock count</Button>
        <Button variant="outline" onClick={() => setTransfer(true)}><ArrowLeftRight className="h-4 w-4" />Transfer</Button></>} />
      <Card>
        <div className="px-3 pt-1"><Tabs value={tab} onChange={(t) => { setTab(t); setPage(1); }} tabs={[{ id: 'stock', label: 'Stock on hand' }, { id: 'movements', label: 'Movement history' }, { id: 'transfers', label: 'Transfers' }, { id: 'batches', label: 'Batches & expiry' }]} /></div>
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          {tab === 'stock' && <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Product or SKU…" />}
          {tab !== 'transfers' && <Select aria-label="Warehouse" value={warehouseId} onChange={(e) => { setWarehouseId(e.target.value); setPage(1); }} className="w-48"><option value="">All warehouses</option>{warehouses.data?.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</Select>}
          {tab === 'stock' && <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" checked={low} onChange={(e) => { setLow(e.target.checked); setPage(1); }} />Low stock only</label>}
        </div>
        {tab === 'stock' && <><DataTable rows={stock.data?.data} rowKey="variantId" loading={stock.isLoading} error={stock.error ? errorMessage(stock.error) : null}
          empty={<EmptyState icon={Boxes} title={low ? 'Nothing is low on stock' : 'No stock-tracked products'} />}
          columns={[
            { key: 'name', header: 'Product', render: (r) => <div><span className="font-medium">{r.name}{r.variantName ? ` – ${r.variantName}` : ''}</span><p className="text-xs text-muted">{r.sku}</p></div> },
            { key: 'quantity', header: 'On hand', align: 'right', render: (r) => { const lowNow = Math.max(+r.minStock, +r.reorderLevel) > 0 && +r.quantity <= Math.max(+r.minStock, +r.reorderLevel); return <span className={cn(lowNow && 'font-semibold text-warn', +r.quantity < 0 && 'text-bad')}>{qty(r.quantity)} {r.unit}</span>; } },
            { key: 'reserved', header: 'Reserved', align: 'right', render: (r) => (+r.reserved ? qty(r.reserved) : '—') }, { key: 'minStock', header: 'Min / reorder', align: 'right', render: (r) => `${qty(r.minStock)} / ${qty(r.reorderLevel)}` },
            { key: 'avgCost', header: 'Avg cost', align: 'right', render: (r) => (r.avgCost === null ? '—' : inr(r.avgCost)) }, { key: 'value', header: 'Value', align: 'right', render: (r) => (r.value === null ? '—' : inr(r.value)) },
            ...(manage ? [{ key: '_a', header: '', align: 'right' as const, render: (r: any) => <Button variant="ghost" size="sm" onClick={() => setAdjust(r)}><SlidersHorizontal className="h-3.5 w-3.5" />Adjust</Button> }] : []),
          ]} />{stock.data && <Pagination page={page} pageSize={25} total={stock.data.total} onPage={setPage} />}</>}
        {tab === 'movements' && <><DataTable rows={moves.data?.data} loading={moves.isLoading} error={moves.error ? errorMessage(moves.error) : null} empty={<EmptyState title="No stock movements yet" />}
          columns={[
            { key: 'createdAt', header: 'When', render: (r) => <span className="whitespace-nowrap text-xs">{fmtDateTime(r.createdAt)}</span> }, { key: 'productName', header: 'Product', render: (r) => <div>{r.productName}<p className="text-xs text-muted">{r.sku} · {r.warehouseName}</p></div> },
            { key: 'type', header: 'Type', render: (r) => <Badge tone={+r.quantity > 0 ? 'ok' : 'warn'}>{r.type.replace(/_/g, ' ')}</Badge> },
            { key: 'quantity', header: 'Change', align: 'right', render: (r) => <span className={+r.quantity > 0 ? 'text-ok' : 'text-bad'}>{+r.quantity > 0 ? '+' : ''}{qty(r.quantity)}</span> }, { key: 'balanceAfter', header: 'Balance', align: 'right', render: (r) => qty(r.balanceAfter) },
            { key: 'ref', header: 'Source', render: (r) => <span className="text-xs">{r.refNumber ?? r.refType.replace(/_/g, ' ').toLowerCase()}{r.note ? <span className="block text-faint">{r.note}</span> : null}</span> }, { key: 'userName', header: 'By' },
          ]} />{moves.data && <Pagination page={page} pageSize={25} total={moves.data.total} onPage={setPage} />}</>}
        {tab === 'transfers' && <><DataTable rows={transfers.data?.data} loading={transfers.isLoading} error={transfers.error ? errorMessage(transfers.error) : null} empty={<EmptyState icon={ArrowLeftRight} title="No transfers yet" description="Move stock between warehouses or branches. Stock is reserved until the transfer is approved." />}
          columns={[
            { key: 'number', header: 'Transfer', render: (r) => <span className="font-medium">{r.number}</span> }, { key: 'createdAt', header: 'Requested', render: (r) => fmtDate(r.createdAt) },
            { key: 'route', header: 'Route', render: (r) => `${whName(r.fromWarehouseId)} → ${whName(r.toWarehouseId)}` }, { key: 'items', header: 'Items', align: 'right', render: (r) => r.items.length }, { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            { key: '_a', header: '', align: 'right', render: (r) => (r.status === 'PENDING' && can('inventory.approve_transfer') ? <span className="flex justify-end gap-1"><Button size="sm" onClick={() => decide(r.id, 'approve')}>Approve</Button><Button size="sm" variant="outline" onClick={() => decide(r.id, 'reject')}>Reject</Button></span> : null) },
          ]} />{transfers.data && <Pagination page={page} pageSize={25} total={transfers.data.total} onPage={setPage} />}</>}
        {tab === 'batches' && <DataTable rows={batches.data} loading={batches.isLoading} error={batches.error ? errorMessage(batches.error) : null} empty={<EmptyState title="No batches in stock" description="Turn on batch tracking for a product to record batch numbers and expiry dates on purchase." />}
          columns={[
            { key: 'productName', header: 'Product', render: (r) => <div>{r.productName}<p className="text-xs text-muted">{r.sku} · {whName(r.warehouseId)}</p></div> }, { key: 'batchNo', header: 'Batch' },
            { key: 'expiryDate', header: 'Expiry', render: (r) => { const days = r.expiryDate ? Math.ceil((new Date(r.expiryDate).getTime() - Date.now()) / 86400000) : null; return r.expiryDate ? <span className={cn(r.expired ? 'font-semibold text-bad' : days! <= 30 ? 'text-warn' : '')}>{fmtDate(r.expiryDate)}{r.expired ? ' · expired' : days! <= 30 ? ` · ${days}d left` : ''}</span> : '—'; } },
            { key: 'quantity', header: 'Quantity', align: 'right', render: (r) => qty(r.quantity) },
          ]} />}
      </Card>

      <FormDialog open={!!adjust} onClose={() => setAdjust(null)} title={`Adjust stock – ${adjust?.name ?? ''}`} description={`Currently ${qty(adjust?.quantity)} ${adjust?.unit ?? ''} across selected warehouses`} schema={stockAdjustSchema} submitLabel="Post adjustment"
        defaults={{ type: 'ADJUSTMENT', warehouseId: warehouseId || warehouses.data?.find((w) => w.isDefault)?.id, variantId: adjust?.variantId }}
        fields={[{ name: 'warehouseId', label: 'Warehouse', type: 'select', required: true, options: (warehouses.data ?? []).map((w) => ({ value: w.id, label: w.name })) }, { name: 'type', label: 'Type', type: 'select', options: TYPES, required: true },
          { name: 'quantity', label: 'Quantity change', type: 'number', required: true, hint: 'Use a minus sign to reduce a correction' }, { name: 'note', label: 'Reason', required: true, wide: true }]}
        onSubmit={async (v) => { await api('/inventory/adjust', { body: { ...v, variantId: adjust.variantId } }); toast.success('Stock adjusted'); await refresh(); }} />
      {transfer && <LinesDialog title="Transfer stock" description="Stock is reserved at the source until an approver completes the transfer." qtyLabel="Quantity" submitLabel="Request transfer" warehouses={warehouses.data ?? []} twoWarehouses onClose={() => setTransfer(false)}
        onSubmit={async (b) => { await api('/inventory/transfers', { body: { fromWarehouseId: b.from, toWarehouseId: b.to, note: b.note, items: b.lines.map((l) => ({ variantId: l.variantId, quantity: l.value })) } }); toast.success('Transfer requested'); await refresh(); }} />}
      {count && <LinesDialog title="Physical stock count" description="Enter what you actually counted. Differences are posted to the ledger as stock-count entries." qtyLabel="Counted" submitLabel="Post count" warehouses={warehouses.data ?? []} onClose={() => setCount(false)}
        onSubmit={async (b) => { const r = await api<{ results: any[] }>('/inventory/stock-count', { body: { warehouseId: b.from, note: b.note, items: b.lines.map((l) => ({ variantId: l.variantId, countedQty: l.value })) } }); toast.success(`${r.results.filter((x) => x.difference !== '0').length} of ${r.results.length} items adjusted`); await refresh(); }} />}
    </>
  );
}

function LinesDialog({ title, description, qtyLabel, submitLabel, warehouses, twoWarehouses, onClose, onSubmit }: { title: string; description: string; qtyLabel: string; submitLabel: string; warehouses: any[]; twoWarehouses?: boolean; onClose: () => void;
  onSubmit: (b: { from: string; to: string; note: string; lines: Array<{ variantId: string; value: string }> }) => Promise<void> }) {
  const [from, setFrom] = useState(warehouses.find((w) => w.isDefault)?.id ?? warehouses[0]?.id ?? ''), [to, setTo] = useState(''), [note, setNote] = useState(''), [busy, setBusy] = useState(false);
  const [lines, setLines] = useState<Array<{ variantId: string; name: string; stock: string; unit: string; value: string }>>([]);
  const submit = async () => { setBusy(true); try { await onSubmit({ from, to, note, lines: lines.filter((l) => l.value !== '') }); onClose(); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); } };
  return (
    <Dialog open onClose={onClose} title={title} description={description} size="lg" footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button loading={busy} disabled={!lines.some((l) => l.value !== '') || !from || (twoWarehouses && !to)} onClick={submit}>{submitLabel}</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label={twoWarehouses ? 'From warehouse' : 'Warehouse'}><Select value={from} onChange={(e) => setFrom(e.target.value)}>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</Select></Field>
        {twoWarehouses ? <Field label="To warehouse"><Select value={to} onChange={(e) => setTo(e.target.value)}><option value="">Select…</option>{warehouses.filter((w) => w.id !== from).map((w) => <option key={w.id} value={w.id}>{w.name} ({w.branch?.name})</option>)}</Select></Field>
          : <Field label="Note"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Month-end count" /></Field>}
        <div className="col-span-2"><VariantPicker onPick={(v) => !lines.some((l) => l.variantId === v.variantId) && setLines([...lines, { variantId: v.variantId, name: v.name, stock: v.stock, unit: v.baseUnit.code, value: '' }])} /></div>
      </div>
      {lines.length > 0 && <table className="mt-3 w-full text-sm"><thead><tr className="border-b text-left text-2xs uppercase tracking-wider text-faint"><th className="py-1.5">Product</th><th className="py-1.5 text-right">Book stock</th><th className="py-1.5 text-right">{qtyLabel}</th><th /></tr></thead>
        <tbody>{lines.map((l, i) => <tr key={l.variantId} className="border-b last:border-0"><td className="py-1.5">{l.name}</td><td className="num py-1.5 text-right">{qty(l.stock)} {l.unit}</td>
          <td className="py-1.5 text-right"><Input aria-label={`${qtyLabel} for ${l.name}`} inputMode="decimal" className="num ml-auto h-8 w-24 text-right" value={l.value} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, value: e.target.value.replace(/[^\d.]/g, '') } : x)))} /></td>
          <td className="w-8 text-right"><Button variant="ghost" size="icon" aria-label="Remove line" onClick={() => setLines(lines.filter((_, j) => j !== i))}><Trash2 className="h-3.5 w-3.5" /></Button></td></tr>)}</tbody></table>}
    </Dialog>
  );
}
export default function InventoryPage() { return <Suspense><Inner /></Suspense>; }
