'use client';
import { useQueryClient } from '@tanstack/react-query';
import { goodsReceiptSchema, purchaseInvoiceSchema, purchaseOrderSchema, purchaseReturnSchema } from '@nexbill/validation';
import { PackageCheck, Plus, ShoppingCart, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { PageHeader, SearchBox } from '@/components/page';
import { Button, Card, DataTable, Dialog, EmptyState, Field, Input, Pagination, Select, StatusBadge, Tabs } from '@/components/ui';
import { VariantPicker } from '@/components/variant-picker';
import { api, errorMessage } from '@/lib/api';
import { useCan, useDebounced, useGet, useList, useLocation } from '@/lib/hooks';
import { fmtDate, inr, qty } from '@/lib/utils';

type Tab = 'invoices' | 'orders' | 'receipts';
interface Line { variantId: string; name: string; unit: string; quantity: string; unitCost: string; gstRate: string; batchNo: string; expiryDate: string; trackBatches?: boolean }
const MODES = ['CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE', 'CARD'];

export default function PurchasesPage() {
  const can = useCan(), qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('invoices'), [q, setQ] = useState(''), [page, setPage] = useState(1);
  const [doc, setDoc] = useState<null | { kind: 'order' | 'invoice'; grn?: any }>(null), [receiving, setReceiving] = useState<any | null>(null), [returning, setReturning] = useState<any | null>(null);
  const list = useList(`/purchases/${tab}`, { q: useDebounced(q), page, pageSize: 25 });
  const refresh = async () => { for (const t of ['invoices', 'orders', 'receipts', 'returns']) await qc.invalidateQueries({ queryKey: [`/purchases/${t}`] }); };
  const manage = can('purchases.manage');
  return (
    <>
      <PageHeader title="Purchases" description="Order → receive goods (GRN) → book the supplier's bill. Stock moves in when goods are received." actions={manage && <>
        <Button variant="outline" onClick={() => setDoc({ kind: 'order' })}><Plus className="h-4 w-4" />Purchase order</Button><Button onClick={() => setDoc({ kind: 'invoice' })}><Plus className="h-4 w-4" />Purchase bill</Button></>} />
      <Card>
        <div className="px-3 pt-1"><Tabs value={tab} onChange={(t) => { setTab(t); setPage(1); setQ(''); }} tabs={[{ id: 'invoices', label: 'Bills' }, { id: 'orders', label: 'Purchase orders' }, { id: 'receipts', label: 'Goods received' }]} /></div>
        {tab !== 'receipts' && <div className="border-b p-3"><SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Document number…" /></div>}
        {tab === 'invoices' && <DataTable rows={list.data?.data} loading={list.isLoading} error={list.error ? errorMessage(list.error) : null} empty={<EmptyState icon={ShoppingCart} title="No purchase bills yet" description="Enter a supplier bill to add stock and track what you owe." />}
          columns={[{ key: 'number', header: 'Bill', render: (r) => <div><span className="font-medium">{r.number}</span><p className="text-xs text-muted">{r.supplierInvoiceNo ? `Supplier no. ${r.supplierInvoiceNo}` : ''}</p></div> }, { key: 'invoiceDate', header: 'Date', render: (r) => fmtDate(r.invoiceDate) }, { key: 'supplierName', header: 'Supplier' },
            { key: 'paymentStatus', header: 'Payment', render: (r) => <StatusBadge status={r.paymentStatus} /> }, { key: 'taxableTotal', header: 'Taxable', align: 'right', render: (r) => inr(r.taxableTotal) }, { key: 'grandTotal', header: 'Total', align: 'right', render: (r) => inr(r.grandTotal) },
            { key: 'due', header: 'Unpaid', align: 'right', render: (r) => inr(Math.max(0, r.grandTotal - r.returnedAmount - r.paidAmount)) },
            { key: '_a', header: '', align: 'right', render: (r) => (manage ? <Button size="sm" variant="ghost" onClick={() => setReturning(r)}>Return</Button> : null) }]} />}
        {tab === 'orders' && <DataTable rows={list.data?.data} loading={list.isLoading} error={list.error ? errorMessage(list.error) : null} empty={<EmptyState icon={ShoppingCart} title="No purchase orders yet" />}
          columns={[{ key: 'number', header: 'Order', render: (r) => <span className="font-medium">{r.number}</span> }, { key: 'orderDate', header: 'Date', render: (r) => fmtDate(r.orderDate) }, { key: 'supplierName', header: 'Supplier' }, { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            { key: 'progress', header: 'Received', align: 'right', render: (r) => `${qty(r.items.reduce((a: number, i: any) => a + +i.receivedQty, 0))} / ${qty(r.items.reduce((a: number, i: any) => a + +i.quantity, 0))}` }, { key: 'total', header: 'Value', align: 'right', render: (r) => inr(r.total) },
            { key: '_a', header: '', align: 'right', render: (r) => (manage && (r.status === 'ORDERED' || r.status === 'PARTIALLY_RECEIVED') ? <span className="flex justify-end gap-1"><Button size="sm" onClick={() => setReceiving(r)}><PackageCheck className="h-3.5 w-3.5" />Receive</Button>
              {r.status === 'ORDERED' && <Button size="sm" variant="ghost" onClick={async () => { try { await api(`/purchases/orders/${r.id}/cancel`, { method: 'POST' }); toast.success('Order cancelled'); await refresh(); } catch (e) { toast.error(errorMessage(e)); } }}>Cancel</Button>}</span> : null) }]} />}
        {tab === 'receipts' && <DataTable rows={list.data?.data} loading={list.isLoading} error={list.error ? errorMessage(list.error) : null} empty={<EmptyState icon={PackageCheck} title="No goods received yet" description="Receive against a purchase order to create a GRN." />}
          columns={[{ key: 'number', header: 'GRN', render: (r) => <span className="font-medium">{r.number}</span> }, { key: 'receivedDate', header: 'Received', render: (r) => fmtDate(r.receivedDate) }, { key: 'supplierName', header: 'Supplier' }, { key: 'items', header: 'Lines', align: 'right', render: (r) => r.items.length },
            { key: 'billed', header: 'Billing', render: (r) => <StatusBadge status={r.purchaseInvoiceId ? 'PAID' : 'PENDING'} /> }, { key: '_a', header: '', align: 'right', render: (r) => (manage && !r.purchaseInvoiceId ? <Button size="sm" onClick={() => setDoc({ kind: 'invoice', grn: r })}>Book bill</Button> : null) }]} />}
        {list.data && <Pagination page={page} pageSize={25} total={list.data.total} onPage={setPage} />}
      </Card>
      {doc && <PurchaseDocDialog kind={doc.kind} grn={doc.grn} onClose={() => setDoc(null)} onDone={refresh} />}
      {receiving && <ReceiveDialog order={receiving} onClose={() => setReceiving(null)} onDone={refresh} />}
      {returning && <PurchaseReturnDialog invoice={returning} onClose={() => setReturning(null)} onDone={refresh} />}
    </>
  );
}

function PurchaseDocDialog({ kind, grn, onClose, onDone }: { kind: 'order' | 'invoice'; grn?: any; onClose: () => void; onDone: () => Promise<void> }) {
  const loc = useLocation();
  const suppliers = useGet<{ data: any[] }>('/suppliers', { pageSize: 200 });
  const [supplierId, setSupplierId] = useState(grn?.supplierId ?? ''), [supplierInvoiceNo, setNo] = useState(''), [date, setDate] = useState(''), [busy, setBusy] = useState(false);
  const [payMode, setPayMode] = useState('BANK_TRANSFER'), [payAmount, setPayAmount] = useState('');
  const [lines, setLines] = useState<Line[]>(() => (grn?.items ?? []).map((i: any) => ({ variantId: i.variantId, name: `Item ${i.variantId.slice(0, 8)}`, unit: '', quantity: String(Number(i.quantity)), unitCost: String(Number(i.unitCost)), gstRate: '', batchNo: i.batchNo ?? '', expiryDate: '' })));
  const supplier = suppliers.data?.data.find((s) => s.id === supplierId);
  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const taxable = lines.reduce((a, l) => a + (+l.quantity || 0) * (+l.unitCost || 0), 0);
  const tax = supplier?.gstin ? lines.reduce((a, l) => a + (+l.quantity || 0) * (+l.unitCost || 0) * (+l.gstRate || 0) / 100, 0) : 0;
  const submit = async () => {
    const items = lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity, unitCost: l.unitCost, gstRate: l.gstRate === '' ? undefined : l.gstRate, batchNo: l.batchNo, expiryDate: l.expiryDate || null }));
    const body = kind === 'order' ? { supplierId, branchId: loc.branch?.id, items: items.map(({ batchNo: _b, expiryDate: _e, ...i }) => i) }
      : { supplierId, branchId: loc.branch?.id, warehouseId: grn?.warehouseId ?? loc.warehouse?.id, supplierInvoiceNo, invoiceDate: date || undefined, goodsReceiptId: grn?.id ?? null, items, payment: +payAmount > 0 ? { mode: payMode, amount: payAmount } : null };
    const parsed = (kind === 'order' ? purchaseOrderSchema : purchaseInvoiceSchema).safeParse(body);
    if (!parsed.success) return toast.error(`${parsed.error.issues[0]?.path.join(' › ')}: ${parsed.error.issues[0]?.message}`);
    setBusy(true);
    try { const r = await api<{ number: string }>(kind === 'order' ? '/purchases/orders' : '/purchases/invoices', { body: parsed.data }); toast.success(`${r.number} saved`); await onDone(); onClose(); }
    catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} size="xl" title={kind === 'order' ? 'New purchase order' : grn ? `Book bill for ${grn.number}` : 'New purchase bill'}
      description={kind === 'order' ? 'An order does not change stock. Receive goods against it when they arrive.' : grn ? 'Stock was already received on the GRN, so this bill only records the amount payable.' : `Stock is received into ${loc.warehouse?.name ?? 'the selected warehouse'} when you save.`}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button loading={busy} disabled={!supplierId || !lines.length} onClick={submit}>Save {kind === 'order' ? 'order' : 'bill'}</Button></>}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Supplier" required><Select value={supplierId} disabled={!!grn} onChange={(e) => setSupplierId(e.target.value)}><option value="">Select supplier…</option>{suppliers.data?.data.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        {kind === 'invoice' && <><Field label="Supplier's bill no."><Input value={supplierInvoiceNo} onChange={(e) => setNo(e.target.value)} /></Field><Field label="Bill date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field></>}
        {!grn && <div className="sm:col-span-3"><VariantPicker onPick={(v) => setLines((ls) => [...ls, { variantId: v.variantId, name: v.name, unit: v.baseUnit.code, quantity: '1', unitCost: v.purchasePrice ? String(Number(v.purchasePrice)) : '', gstRate: String(Number(v.gstRate)), batchNo: '', expiryDate: '', trackBatches: (v as any).trackBatches }])} /></div>}
      </div>
      {supplier && !supplier.gstin && <p className="mt-2 rounded bg-warn/10 px-3 py-1.5 text-xs text-warn">This supplier has no GSTIN, so no GST (input tax credit) is recorded on this document.</p>}
      {lines.length > 0 && (
        <div className="mt-3 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-2xs uppercase tracking-wider text-faint"><th className="py-1.5">Product</th><th className="py-1.5 text-right">Qty</th><th className="py-1.5 text-right">Cost / unit</th><th className="py-1.5 text-right">GST %</th>{kind === 'invoice' && !grn && <><th className="py-1.5 pl-2">Batch</th><th className="py-1.5 pl-2">Expiry</th></>}<th className="py-1.5 text-right">Amount</th><th /></tr></thead>
          <tbody>{lines.map((l, i) => (
            <tr key={i} className="border-b last:border-0"><td className="py-1.5">{l.name} <span className="text-xs text-faint">{l.unit}</span></td>
              <td className="py-1.5 text-right"><Input aria-label="Quantity" inputMode="decimal" disabled={!!grn} className="num ml-auto h-8 w-20 text-right" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} /></td>
              <td className="py-1.5 text-right"><Input aria-label="Unit cost" inputMode="decimal" className="num ml-auto h-8 w-24 text-right" value={l.unitCost} onChange={(e) => setLine(i, { unitCost: e.target.value })} /></td>
              <td className="py-1.5 text-right"><Input aria-label="GST rate" inputMode="decimal" className="num ml-auto h-8 w-16 text-right" placeholder="auto" value={l.gstRate} onChange={(e) => setLine(i, { gstRate: e.target.value })} /></td>
              {kind === 'invoice' && !grn && <><td className="py-1.5 pl-2"><Input aria-label="Batch number" className="h-8 w-24" disabled={!l.trackBatches} value={l.batchNo} onChange={(e) => setLine(i, { batchNo: e.target.value })} /></td><td className="py-1.5 pl-2"><Input aria-label="Expiry date" type="date" className="h-8 w-36" disabled={!l.trackBatches} value={l.expiryDate} onChange={(e) => setLine(i, { expiryDate: e.target.value })} /></td></>}
              <td className="num py-1.5 text-right">{inr((+l.quantity || 0) * (+l.unitCost || 0))}</td>
              <td className="w-8 text-right">{!grn && <Button variant="ghost" size="icon" aria-label="Remove line" onClick={() => setLines(lines.filter((_, j) => j !== i))}><Trash2 className="h-3.5 w-3.5" /></Button>}</td></tr>))}</tbody></table></div>
      )}
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        {kind === 'invoice' ? <div className="flex items-end gap-2"><Field label="Paid now (₹)"><Input inputMode="decimal" className="num w-32 text-right" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder="0" /></Field><Field label="Mode"><Select value={payMode} onChange={(e) => setPayMode(e.target.value)} className="w-40">{MODES.map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}</Select></Field></div> : <span />}
        <dl className="w-56 space-y-0.5 text-sm"><div className="flex justify-between"><dt className="text-muted">Taxable</dt><dd className="num">{inr(taxable)}</dd></div><div className="flex justify-between"><dt className="text-muted">GST (estimate)</dt><dd className="num">{inr(tax)}</dd></div><div className="flex justify-between border-t pt-1 font-semibold"><dt>Total</dt><dd className="num">{inr(Math.round(taxable + tax))}</dd></div></dl>
      </div>
    </Dialog>
  );
}

function ReceiveDialog({ order, onClose, onDone }: { order: any; onClose: () => void; onDone: () => Promise<void> }) {
  const loc = useLocation();
  const [rows, setRows] = useState<Record<string, { quantity: string; batchNo: string; expiryDate: string }>>(() => Object.fromEntries(order.items.map((i: any) => [i.id, { quantity: String(+i.quantity - +i.receivedQty), batchNo: '', expiryDate: '' }])));
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const parsed = goodsReceiptSchema.safeParse({ purchaseOrderId: order.id, warehouseId: loc.warehouse?.id, items: Object.entries(rows).filter(([, r]) => +r.quantity > 0).map(([poItemId, r]) => ({ poItemId, quantity: r.quantity, batchNo: r.batchNo, expiryDate: r.expiryDate || null })) });
    if (!parsed.success) return toast.error(parsed.error.issues[0]?.message ?? 'Check the quantities');
    setBusy(true);
    try { const r = await api<{ number: string }>('/purchases/receipts', { body: parsed.data }); toast.success(`${r.number} created – stock updated`); await onDone(); onClose(); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} size="lg" title={`Receive goods – ${order.number}`} description={`Into ${loc.warehouse?.name}. Enter only what actually arrived; the rest stays pending.`} footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={submit}>Create GRN</Button></>}>
      <table className="w-full text-sm"><thead><tr className="border-b text-left text-2xs uppercase tracking-wider text-faint"><th className="py-1.5">Item</th><th className="py-1.5 text-right">Ordered</th><th className="py-1.5 text-right">Pending</th><th className="py-1.5 text-right">Receive now</th><th className="py-1.5 pl-2">Batch</th><th className="py-1.5 pl-2">Expiry</th></tr></thead>
        <tbody>{order.items.map((i: any) => { const pending = +i.quantity - +i.receivedQty; const r = rows[i.id]!; const set = (p: object) => setRows({ ...rows, [i.id]: { ...r, ...p } }); return (
          <tr key={i.id} className="border-b last:border-0"><td className="py-1.5">{i.description}</td><td className="num py-1.5 text-right">{qty(i.quantity)}</td><td className="num py-1.5 text-right">{qty(pending)}</td>
            <td className="py-1.5 text-right"><Input aria-label={`Receive quantity for ${i.description}`} disabled={pending <= 0} inputMode="decimal" className="num ml-auto h-8 w-20 text-right" value={r.quantity} onChange={(e) => set({ quantity: e.target.value })} /></td>
            <td className="py-1.5 pl-2"><Input aria-label="Batch" className="h-8 w-24" value={r.batchNo} onChange={(e) => set({ batchNo: e.target.value })} /></td><td className="py-1.5 pl-2"><Input aria-label="Expiry" type="date" className="h-8 w-36" value={r.expiryDate} onChange={(e) => set({ expiryDate: e.target.value })} /></td></tr>); })}</tbody></table>
    </Dialog>
  );
}

function PurchaseReturnDialog({ invoice, onClose, onDone }: { invoice: any; onClose: () => void; onDone: () => Promise<void> }) {
  const [rows, setRows] = useState<Record<string, string>>({}), [reason, setReason] = useState(''), [busy, setBusy] = useState(false);
  const submit = async () => {
    const parsed = purchaseReturnSchema.safeParse({ invoiceId: invoice.id, reason, items: Object.entries(rows).filter(([, v]) => +v > 0).map(([invoiceItemId, quantity]) => ({ invoiceItemId, quantity })) });
    if (!parsed.success) return toast.error('Enter a quantity to return');
    setBusy(true);
    try { const r = await api<{ number: string }>('/purchases/returns', { body: parsed.data }); toast.success(`Debit note ${r.number} created`); await onDone(); onClose(); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} size="lg" title={`Return to supplier – ${invoice.number}`} description="Creates a debit note, takes the goods out of stock and reduces what you owe the supplier." footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={submit}>Create debit note</Button></>}>
      <table className="w-full text-sm"><thead><tr className="border-b text-left text-2xs uppercase tracking-wider text-faint"><th className="py-1.5">Item</th><th className="py-1.5 text-right">Bought</th><th className="py-1.5 text-right">Returned</th><th className="py-1.5 text-right">Return now</th></tr></thead>
        <tbody>{invoice.items.map((i: any) => <tr key={i.id} className="border-b last:border-0"><td className="py-1.5">{i.description}</td><td className="num py-1.5 text-right">{qty(i.quantity)}</td><td className="num py-1.5 text-right">{qty(i.returnedQty)}</td>
          <td className="py-1.5 text-right"><Input aria-label={`Return quantity for ${i.description}`} inputMode="decimal" className="num ml-auto h-8 w-20 text-right" value={rows[i.id] ?? ''} onChange={(e) => setRows({ ...rows, [i.id]: e.target.value })} placeholder={`max ${qty(+i.quantity - +i.returnedQty)}`} /></td></tr>)}</tbody></table>
      <Field label="Reason" className="mt-3"><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
    </Dialog>
  );
}
