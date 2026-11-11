'use client';
import { useQueryClient } from '@tanstack/react-query';
import { computeInvoice, D, supplyType, type TaxInvoiceResult } from '@nexbill/shared';
import { customerSchema } from '@nexbill/validation';
import { CloudOff, CloudUpload, Minus, PauseCircle, Plus, Printer, ScanLine, Trash2, UserPlus, UserRound, X } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { FormDialog } from '@/components/form-dialog';
import { Badge, Button, Dialog, EmptyState, Input, Kbd, Select } from '@/components/ui';
import { api, ApiError, errorMessage, NetworkError } from '@/lib/api';
import { useBusiness, useCan, useDebounced, useGet, useLocation, useOnline } from '@/lib/hooks';
import { factorOf, unitCodeOf, usePos, type CartCustomer, type CartLine, type Sellable } from '@/lib/pos-store';
import { cn, inr, qty as fmtQty, uid } from '@/lib/utils';

const MODES = [{ id: 'CASH', label: 'Cash', key: 'F9' }, { id: 'UPI', label: 'UPI', key: 'F10' }, { id: 'CARD', label: 'Card', key: 'F7' }] as const;
type Mode = 'CASH' | 'UPI' | 'CARD' | 'BANK_TRANSFER';

export default function PosPage() {
  const pos = usePos(), can = useCan(), business = useBusiness(), loc = useLocation(), online = useOnline(), qc = useQueryClient();
  const { cart } = pos;
  const [term, setTerm] = useState(''), [active, setActive] = useState(0), [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<null | 'customer' | 'newCustomer' | 'split' | 'held' | 'queue'>(null);
  const [done, setDone] = useState<null | { id?: string; number?: string; total: string; offline?: boolean }>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const focusSearch = useCallback(() => setTimeout(() => searchRef.current?.focus(), 0), []);

  // "3*parle" or "3*<barcode>" adds three at once
  const parsed = useMemo(() => { const m = /^(\d+(?:\.\d+)?)\*(.*)$/.exec(term); return m ? { qty: m[1]!, q: m[2]!.trim() } : { qty: '1', q: term.trim() }; }, [term]);
  const dq = useDebounced(parsed.q, 120);
  const remote = useGet<Sellable[]>(dq && online && loc.warehouse ? '/catalog/sellable' : null, { q: dq, warehouseId: loc.warehouse?.id, branchId: loc.branch?.id, limit: 12 });
  const results = useMemo<Sellable[]>(() => {
    if (!dq) return [];
    if (remote.data) return remote.data;
    const t = dq.toLowerCase(); // offline (or still loading): fall back to the cached catalogue
    return pos.catalog.filter((c) => c.barcodes.includes(dq) || c.sku.toLowerCase() === t || c.name.toLowerCase().includes(t)).slice(0, 12);
  }, [dq, remote.data, pos.catalog]);
  useEffect(() => { setActive(0); }, [dq]);

  // Keep an offline copy of the catalogue for this counter.
  useEffect(() => {
    if (!online || !loc.warehouse) return;
    api<Sellable[]>('/catalog/sellable', { query: { warehouseId: loc.warehouse.id, branchId: loc.branch?.id, limit: 3000 } }).then(pos.setCatalog).catch(() => undefined);
  }, [online, loc.warehouse?.id, loc.branch?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const addItem = useCallback((item: Sellable, q = parsed.qty) => {
    pos.add(item, q); setTerm(''); focusSearch();
    if (item.trackInventory && item.type === 'GOODS' && Number(item.stock) <= 0 && !business?.allowNegativeStock) toast.warning(`${item.name} shows no stock here`);
  }, [parsed.qty, pos, focusSearch, business?.allowNegativeStock]);

  // A scanner types the code and presses Enter before the debounce fires: resolve that case directly.
  const onSearchKey = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Escape') setTerm('');
    else if (e.key === 'Enter' && parsed.q) {
      e.preventDefault();
      if (dq === parsed.q && results.length) return addItem(results[active] ?? results[0]!);
      const cached = pos.catalog.find((c) => c.barcodes.includes(parsed.q) || c.sku.toLowerCase() === parsed.q.toLowerCase());
      if (cached) return addItem(cached);
      try {
        const hits = await api<Sellable[]>('/catalog/sellable', { query: { q: parsed.q, warehouseId: loc.warehouse?.id, branchId: loc.branch?.id, limit: 5 } });
        if (hits.length === 1 || hits[0]?.exactMatch) addItem(hits[0]!); else if (!hits.length) toast.error(`No product found for "${parsed.q}"`);
      } catch (err) { toast.error(errorMessage(err)); }
    }
  };

  const chargeTax = !!business?.gstRegistered;
  const totals = useMemo<{ calc: TaxInvoiceResult | null; error: string | null }>(() => {
    if (!cart.lines.length || !business) return { calc: null, error: null };
    try {
      return { error: null, calc: computeInvoice({
        supplyType: supplyType(business.stateCode, cart.customer?.stateCode ?? cart.customer?.gstin?.slice(0, 2) ?? business.stateCode), chargeTax, roundOff: business.roundOffInvoices,
        invoiceDiscount: Number(cart.invoiceDiscount) > 0 ? { type: 'AMOUNT', value: cart.invoiceDiscount } : null,
        lines: cart.lines.map((l) => ({ quantity: l.quantity || '0', unitPrice: l.unitPrice || '0', priceIncludesTax: l.item.priceIncludesTax, gstRate: l.item.gstRate, cessRate: l.item.cessRate, exempt: l.item.taxExempt,
          discount: Number(l.discountPct) > 0 ? { type: 'PERCENT', value: l.discountPct } : null })),
      }) };
    } catch (e) { return { calc: null, error: e instanceof Error ? e.message : 'Check the bill' }; }
  }, [cart, business, chargeTax]);
  const grand = totals.calc?.grandTotal.toFixed(2) ?? '0.00';

  const payload = (payments: Array<{ mode: Mode; amount: string; reference?: string }>, status: 'ISSUED' | 'DRAFT' = 'ISSUED') => ({
    idempotencyKey: `pos-${uid()}`, status, branchId: loc.branch!.id, warehouseId: loc.warehouse!.id, customerId: cart.customer?.id ?? null, notes: cart.notes || null,
    invoiceDiscount: Number(cart.invoiceDiscount) > 0 ? { type: 'AMOUNT', value: cart.invoiceDiscount } : null,
    items: cart.lines.map((l) => ({ variantId: l.item.variantId, quantity: l.quantity, unitId: l.unitId, ...(l.priceEdited ? { unitPrice: l.unitPrice } : {}), ...(Number(l.discountPct) > 0 ? { discount: { type: 'PERCENT', value: l.discountPct } } : {}) })),
    payments,
  });

  const submit = async (payments: Array<{ mode: Mode; amount: string; reference?: string }>, status: 'ISSUED' | 'DRAFT' = 'ISSUED') => {
    if (busy || !totals.calc || !loc.branch || !loc.warehouse) return;
    const body = payload(payments, status);
    setBusy(true);
    try {
      const inv = await api<{ id: string; number: string | null; grandTotal: string }>('/sales/invoices', { body });
      pos.clear(); setDialog(null);
      if (status === 'DRAFT') toast.success('Draft saved'); else setDone({ id: inv.id, number: inv.number ?? '', total: inv.grandTotal });
      qc.invalidateQueries({ queryKey: ['/catalog/sellable'] });
    } catch (e) {
      if (e instanceof NetworkError && status === 'ISSUED') {
        // No connection: keep the bill locally. It is sent exactly once when the network returns.
        pos.enqueue({ idempotencyKey: body.idempotencyKey, payload: body, total: grand, label: cart.customer?.name ?? 'Walk-in customer', queuedAt: new Date().toISOString() });
        pos.clear(); setDialog(null); setDone({ total: grand, offline: true });
      } else toast.error(errorMessage(e));
    } finally { setBusy(false); }
  };
  const payFull = (mode: Mode) => { if (totals.calc && Number(grand) >= 0) void submit(Number(grand) > 0 ? [{ mode, amount: grand }] : []); };

  // Background sync of bills captured offline; conflicts (e.g. stock sold elsewhere) are kept for review.
  const syncing = useRef(false);
  const sync = useCallback(async () => {
    if (syncing.current) return; syncing.current = true;
    try {
      for (const b of usePos.getState().queue) {
        try { await api('/sales/invoices', { body: b.payload }); usePos.getState().dequeue(b.idempotencyKey); toast.success(`Offline bill synced (${inr(b.total)})`); }
        catch (e) { if (e instanceof NetworkError) break; usePos.getState().markFailed(b.idempotencyKey, e instanceof ApiError ? e.message : 'Sync failed'); }
      }
    } finally { syncing.current = false; }
  }, []);
  useEffect(() => { if (online && pos.queue.some((q) => !q.error)) void sync(); }, [online, pos.queue.length, sync]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (dialog || done) { if (done && e.key === 'Enter') { e.preventDefault(); setDone(null); focusSearch(); } return; }
      const map: Record<string, () => void> = { F2: focusSearch, F4: () => setDialog('customer'), F8: () => { pos.hold(); focusSearch(); }, F9: () => payFull('CASH'), F10: () => payFull('UPI'), F7: () => payFull('CARD'), F6: () => cart.lines.length && setDialog('split') };
      const fn = map[e.key]; if (fn) { e.preventDefault(); fn(); }
    };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  });
  useEffect(() => { focusSearch(); }, [focusSearch]);

  if (!loc.branch || !loc.warehouse) return <EmptyState title="No branch available" description="Ask an administrator to give you access to a branch." />;
  const canPrice = can('sales.price_override'), canDiscount = can('sales.discount');

  return (
    <div className="grid h-full grid-rows-[1fr_auto] lg:grid-cols-[1fr_360px] lg:grid-rows-1">
      <section className="flex min-h-0 flex-col">
        <div className="relative border-b bg-surface p-3">
          <ScanLine className="pointer-events-none absolute left-6 top-[22px] h-5 w-5 text-faint" />
          <input ref={searchRef} value={term} onChange={(e) => setTerm(e.target.value)} onKeyDown={onSearchKey} aria-label="Search or scan product" autoComplete="off" spellCheck={false}
            placeholder="Scan barcode or type product name / SKU   (qty shortcut: 3*name)" className="h-11 w-full rounded-lg border bg-bg pl-11 pr-24 text-base placeholder:text-faint focus-visible:border-brand" />
          <span className="absolute right-6 top-[22px] flex items-center gap-1.5 text-xs text-faint"><Kbd>F2</Kbd></span>
          {parsed.q && (
            <ul role="listbox" className="absolute left-3 right-3 top-[60px] z-30 max-h-[60vh] overflow-y-auto rounded-lg border bg-raised shadow-pop">
              {results.map((r, i) => (
                <li key={r.variantId} role="option" aria-selected={i === active} onMouseEnter={() => setActive(i)} onMouseDown={(e) => { e.preventDefault(); addItem(r); }}
                  className={cn('flex cursor-pointer items-center justify-between gap-3 border-b px-3 py-2 last:border-0', i === active && 'bg-brand-soft')}>
                  <div className="min-w-0"><p className="truncate text-sm font-medium">{r.name}</p><p className="text-xs text-muted">{r.sku}{r.hsnCode ? ` · HSN ${r.hsnCode}` : ''} · GST {Number(r.gstRate)}%</p></div>
                  <div className="shrink-0 text-right"><p className="num text-sm font-semibold">{inr(r.sellingPrice)}</p>
                    {r.trackInventory && r.type === 'GOODS' && <p className={cn('num text-xs', Number(r.stock) <= 0 ? 'text-bad' : 'text-muted')}>{fmtQty(r.stock)} {r.baseUnit.code} in stock</p>}</div>
                </li>
              ))}
              {!results.length && <li className="px-3 py-4 text-center text-sm text-muted">{remote.isFetching ? 'Searching…' : 'No matching product'}</li>}
            </ul>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-surface">
          {cart.lines.length === 0 ? (
            <EmptyState icon={ScanLine} title="Start a new bill" description="Scan a barcode or search for a product. Everything on this screen works from the keyboard." />
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-surface"><tr className="border-b text-left text-2xs uppercase tracking-wider text-faint">
                <th className="px-3 py-2 font-semibold">#</th><th className="px-2 py-2 font-semibold">Item</th><th className="px-2 py-2 text-center font-semibold">Qty</th><th className="px-2 py-2 font-semibold">Unit</th>
                <th className="px-2 py-2 text-right font-semibold">Rate</th><th className="px-2 py-2 text-right font-semibold">Disc %</th><th className="px-2 py-2 text-right font-semibold">Amount</th><th className="w-8" />
              </tr></thead>
              <tbody>{cart.lines.map((l, i) => <CartRow key={l.key} line={l} index={i} amount={totals.calc?.lines[i]?.lineTotal.toFixed(2)} canPrice={canPrice} canDiscount={canDiscount} />)}</tbody>
            </table>
          )}
        </div>
        <div className="no-print hidden items-center gap-4 border-t bg-surface px-3 py-1.5 text-xs text-faint lg:flex">
          <span><Kbd>F2</Kbd> Search</span><span><Kbd>F4</Kbd> Customer</span><span><Kbd>F6</Kbd> Split / credit</span><span><Kbd>F8</Kbd> Hold</span><span><Kbd>F9</Kbd> Cash</span><span><Kbd>F10</Kbd> UPI</span><span><Kbd>F7</Kbd> Card</span>
          <span className="ml-auto">{loc.branch.name} · {loc.warehouse.name}</span>
        </div>
      </section>

      <aside className="flex flex-col border-t bg-surface lg:border-l lg:border-t-0">
        <div className="flex items-center gap-2 border-b p-3">
          <button onClick={() => setDialog('customer')} className="flex min-w-0 flex-1 items-center gap-2 rounded-md border px-2.5 py-1.5 text-left hover:bg-ink/5">
            <UserRound className="h-4 w-4 shrink-0 text-faint" />
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{cart.customer?.name ?? 'Walk-in customer'}</span>
              {cart.customer && <span className="block truncate text-xs text-muted">{cart.customer.phone ?? cart.customer.gstin ?? ''}{Number(cart.customer.balance) > 0 ? ` · Due ${inr(cart.customer.balance)}` : ''}</span>}</span>
            <Kbd>F4</Kbd>
          </button>
          {cart.customer && <Button variant="ghost" size="icon" aria-label="Remove customer" onClick={() => pos.setCart({ customer: null })}><X className="h-4 w-4" /></Button>}
        </div>
        <div className="flex gap-2 border-b px-3 py-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={() => setDialog('held')}><PauseCircle className="h-3.5 w-3.5" />Held{pos.held.length ? ` (${pos.held.length})` : ''}</Button>
          <Button variant="outline" size="sm" className="flex-1" disabled={!cart.lines.length} onClick={() => { pos.hold(); focusSearch(); }}>Hold bill</Button>
          {pos.queue.length > 0 && <Button variant="outline" size="sm" onClick={() => setDialog('queue')} aria-label="Offline bills"><CloudOff className="h-3.5 w-3.5 text-warn" />{pos.queue.length}</Button>}
        </div>
        <div className="flex-1 space-y-1.5 overflow-y-auto p-3 text-sm">
          <Row label={`Items (${cart.lines.length})`} value={inr(totals.calc?.subTotal ?? 0)} />
          {totals.calc && !totals.calc.lineDiscountTotal.isZero() && <Row label="Item discounts" value={`− ${inr(totals.calc.lineDiscountTotal)}`} />}
          <div className="flex items-center justify-between gap-2"><span className="text-muted">Bill discount (₹)</span>
            <Input aria-label="Bill discount" disabled={!canDiscount} inputMode="decimal" value={cart.invoiceDiscount} onChange={(e) => pos.setCart({ invoiceDiscount: e.target.value.replace(/[^\d.]/g, '') })} className="num h-7 w-24 text-right" placeholder="0" /></div>
          <Row label="Taxable value" value={inr(totals.calc?.taxableTotal ?? 0)} />
          {chargeTax ? (totals.calc && !totals.calc.igstTotal.isZero()
            ? <Row label="IGST" value={inr(totals.calc.igstTotal)} />
            : <><Row label="CGST" value={inr(totals.calc?.cgstTotal ?? 0)} /><Row label="SGST" value={inr(totals.calc?.sgstTotal ?? 0)} /></>) : <p className="text-xs text-faint">Bill of supply – GST not charged</p>}
          {totals.calc && !totals.calc.cessTotal.isZero() && <Row label="Cess" value={inr(totals.calc.cessTotal)} />}
          {totals.calc && !totals.calc.roundOff.isZero() && <Row label="Round off" value={inr(totals.calc.roundOff)} />}
          {totals.error && <p role="alert" className="rounded bg-bad/10 px-2 py-1 text-xs text-bad">{totals.error}</p>}
        </div>
        <div className="border-t p-3">
          <div className="mb-3 flex items-end justify-between"><span className="text-sm text-muted">Total payable</span><span data-testid="pos-total" className="num text-3xl font-semibold tracking-tight">{inr(grand)}</span></div>
          <div className="grid grid-cols-3 gap-2">
            {MODES.map((m) => <Button key={m.id} size="lg" variant={m.id === 'CASH' ? 'primary' : 'secondary'} disabled={!totals.calc || busy} loading={busy && m.id === 'CASH'} onClick={() => payFull(m.id)} className="flex-col gap-0 py-1.5 leading-tight"><span>{m.label}</span><span className="text-2xs font-normal opacity-70">{m.key}</span></Button>)}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button variant="outline" disabled={!totals.calc || busy} onClick={() => setDialog('split')}>Split / credit</Button>
            <Button variant="outline" disabled={!totals.calc || busy} onClick={() => submit([], 'DRAFT')}>Save draft</Button>
          </div>
          {cart.lines.length > 0 && <button onClick={() => { pos.clear(); focusSearch(); }} className="mt-2 w-full text-center text-xs text-faint hover:text-bad">Clear bill</button>}
        </div>
      </aside>

      <CustomerPicker open={dialog === 'customer'} onClose={() => { setDialog(null); focusSearch(); }} onPick={(c) => { pos.setCart({ customer: c }); setDialog(null); focusSearch(); }} onNew={() => setDialog('newCustomer')} canCreate={can('customers.manage')} />
      <FormDialog open={dialog === 'newCustomer'} onClose={() => setDialog(null)} title="New customer" schema={customerSchema}
        fields={[{ name: 'name', label: 'Name', required: true }, { name: 'phone', label: 'Mobile' }, { name: 'gstin', label: 'GSTIN', uppercase: true, wide: true }]}
        onSubmit={async (v) => { const c = await api<CartCustomer>('/customers', { body: v }); pos.setCart({ customer: c }); toast.success('Customer added'); }} />
      <SplitDialog open={dialog === 'split'} onClose={() => setDialog(null)} total={grand} customer={cart.customer} busy={busy} onSubmit={(p) => submit(p)} />

      <Dialog open={dialog === 'held'} onClose={() => setDialog(null)} title="Held bills" description="Bills parked on this device">
        {pos.held.length ? <ul className="divide-y">{pos.held.map((h) => (
          <li key={h.id} className="flex items-center justify-between gap-3 py-2"><div><p className="text-sm font-medium">{h.label}</p><p className="text-xs text-muted">{h.lines.length} item(s) · {new Date(h.heldAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</p></div>
            <div className="flex gap-1"><Button size="sm" onClick={() => { pos.resume(h.id); setDialog(null); focusSearch(); }}>Resume</Button><Button size="icon" variant="ghost" aria-label="Discard held bill" onClick={() => pos.dropHeld(h.id)}><Trash2 className="h-4 w-4" /></Button></div></li>))}</ul>
          : <p className="py-6 text-center text-sm text-muted">No held bills. Press F8 to park the current bill.</p>}
      </Dialog>

      <Dialog open={dialog === 'queue'} onClose={() => setDialog(null)} title="Bills waiting to sync" description="Captured while offline. Each is sent to the server exactly once."
        footer={<Button onClick={() => { usePos.setState((s) => ({ queue: s.queue.map(({ error: _e, ...q }) => q) })); void sync(); }} disabled={!online}><CloudUpload className="h-4 w-4" />Sync now</Button>}>
        <ul className="divide-y">{pos.queue.map((b) => (
          <li key={b.idempotencyKey} className="flex items-start justify-between gap-3 py-2"><div><p className="text-sm font-medium">{b.label} · <span className="num">{inr(b.total)}</span></p><p className="text-xs text-muted">{new Date(b.queuedAt).toLocaleString('en-IN')}</p>
            {b.error && <p className="mt-1 rounded bg-bad/10 px-2 py-1 text-xs text-bad">Needs attention: {b.error}</p>}</div>
            {b.error && <Button size="sm" variant="outline" onClick={() => pos.dequeue(b.idempotencyKey)}>Discard</Button>}</li>))}</ul>
      </Dialog>

      <Dialog open={!!done} onClose={() => { setDone(null); focusSearch(); }} title={done?.offline ? 'Saved offline' : 'Bill complete'} size="sm"
        footer={<>{done?.id && <Link href={`/sales/${done.id}?print=1`}><Button variant="outline"><Printer className="h-4 w-4" />Print</Button></Link>}<Button data-autofocus onClick={() => { setDone(null); focusSearch(); }}>New bill <Kbd>Enter</Kbd></Button></>}>
        <div className="text-center"><p className="num text-3xl font-semibold">{inr(done?.total)}</p>
          {done?.offline ? <p className="mt-2 text-sm text-muted">You are offline. This bill is stored on this device and will be sent automatically when the connection returns. Its invoice number is assigned by the server at that point.</p>
            : <p className="mt-1 text-sm text-muted">Invoice <span data-testid="invoice-number" className="font-medium text-ink">{done?.number}</span></p>}</div>
      </Dialog>
    </div>
  );
}

const Row = ({ label, value }: { label: string; value: string }) => <div className="flex items-center justify-between"><span className="text-muted">{label}</span><span className="num">{value}</span></div>;

function CartRow({ line, index, amount, canPrice, canDiscount }: { line: CartLine; index: number; amount?: string; canPrice: boolean; canDiscount: boolean }) {
  const { update, remove } = usePos();
  const num = (v: string) => v.replace(/[^\d.]/g, '');
  const setUnit = (unitId: string | null) => {
    const f = line.item.units.find((u) => u.id === unitId)?.factorToBase ?? '1';
    update(line.key, { unitId, unitPrice: D(line.item.sellingPrice).mul(D(f)).toDecimalPlaces(4).toString(), priceEdited: false });
  };
  const bump = (d: number) => update(line.key, { quantity: String(Math.max(0, +(Number(line.quantity) + d).toFixed(3))) });
  const short = line.item.trackInventory && line.item.type === 'GOODS' && Number(line.quantity) * Number(factorOf(line)) > Number(line.item.stock);
  return (
    <tr className="border-b align-middle">
      <td className="px-3 py-1.5 text-xs text-faint">{index + 1}</td>
      <td className="px-2 py-1.5"><p className="font-medium leading-tight">{line.item.name}</p><p className="text-xs text-muted">{line.item.sku} · GST {Number(line.item.gstRate)}%{short && <Badge tone="warn" className="ml-1.5">Low stock</Badge>}</p></td>
      <td className="px-2 py-1.5"><div className="flex items-center justify-center gap-1">
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Decrease quantity" onClick={() => bump(-1)}><Minus className="h-3 w-3" /></Button>
        <Input aria-label={`Quantity for ${line.item.name}`} inputMode="decimal" value={line.quantity} onChange={(e) => update(line.key, { quantity: num(e.target.value) })} onFocus={(e) => e.target.select()} className="num h-8 w-16 px-1 text-center" />
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Increase quantity" onClick={() => bump(1)}><Plus className="h-3 w-3" /></Button></div></td>
      <td className="px-2 py-1.5">{line.item.units.length ? <Select aria-label="Unit" value={line.unitId ?? ''} onChange={(e) => setUnit(e.target.value || null)} className="h-8 w-20 px-1.5 text-xs"><option value="">{line.item.baseUnit.code}</option>{line.item.units.map((u) => <option key={u.id} value={u.id}>{u.code}</option>)}</Select> : <span className="text-xs text-muted">{unitCodeOf(line)}</span>}</td>
      <td className="px-2 py-1.5 text-right">{canPrice ? <Input aria-label="Rate" inputMode="decimal" value={line.unitPrice} onChange={(e) => update(line.key, { unitPrice: num(e.target.value), priceEdited: true })} onFocus={(e) => e.target.select()} className="num ml-auto h-8 w-24 px-1.5 text-right" /> : <span className="num">{inr(line.unitPrice)}</span>}</td>
      <td className="px-2 py-1.5 text-right"><Input aria-label="Discount percent" disabled={!canDiscount} inputMode="decimal" value={line.discountPct} onChange={(e) => update(line.key, { discountPct: num(e.target.value) })} placeholder="0" className="num ml-auto h-8 w-14 px-1.5 text-right" /></td>
      <td className="num px-2 py-1.5 text-right font-medium">{amount ? inr(amount) : '—'}</td>
      <td className="pr-2"><Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Remove ${line.item.name}`} onClick={() => remove(line.key)}><Trash2 className="h-3.5 w-3.5" /></Button></td>
    </tr>
  );
}

function CustomerPicker({ open, onClose, onPick, onNew, canCreate }: { open: boolean; onClose: () => void; onPick: (c: CartCustomer) => void; onNew: () => void; canCreate: boolean }) {
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const list = useGet<{ data: CartCustomer[] }>(open ? '/customers' : null, { q: dq, pageSize: 8 });
  return (
    <Dialog open={open} onClose={onClose} title="Select customer" footer={canCreate ? <Button variant="outline" onClick={onNew}><UserPlus className="h-4 w-4" />New customer</Button> : undefined}>
      <Input data-autofocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, mobile or GSTIN" onKeyDown={(e) => { if (e.key === 'Enter' && list.data?.data[0]) onPick(list.data.data[0]); }} />
      <ul className="mt-2 max-h-72 divide-y overflow-y-auto">{list.data?.data.map((c) => (
        <li key={c.id}><button onClick={() => onPick(c)} className="flex w-full items-center justify-between px-1 py-2 text-left hover:bg-ink/5"><span><span className="block text-sm font-medium">{c.name}</span><span className="text-xs text-muted">{c.phone ?? ''} {c.gstin ?? ''}</span></span>
          {Number(c.balance) > 0 && <span className="num text-xs text-warn">Due {inr(c.balance)}</span>}</button></li>))}
        {list.data?.data.length === 0 && <li className="py-6 text-center text-sm text-muted">No customers found</li>}</ul>
    </Dialog>
  );
}

function SplitDialog({ open, onClose, total, customer, busy, onSubmit }: { open: boolean; onClose: () => void; total: string; customer: CartCustomer | null; busy: boolean; onSubmit: (p: Array<{ mode: Mode; amount: string; reference?: string }>) => void }) {
  const [amounts, setAmounts] = useState<Record<Mode, string>>({ CASH: '', UPI: '', CARD: '', BANK_TRANSFER: '' });
  const [ref, setRef] = useState('');
  useEffect(() => { if (open) { setAmounts({ CASH: '', UPI: '', CARD: '', BANK_TRANSFER: '' }); setRef(''); } }, [open]);
  const paid = Object.values(amounts).reduce((a, v) => a.plus(D(v || 0)), D(0));
  const balance = D(total).minus(paid);
  const invalid = balance.lt(0) || (balance.gt(0) && !customer);
  return (
    <Dialog open={open} onClose={onClose} title="Split payment / credit sale" description={`Bill total ${inr(total)}`}
      footer={<><Button variant="outline" onClick={onClose}>Back</Button><Button loading={busy} disabled={invalid} onClick={() => onSubmit((Object.entries(amounts) as Array<[Mode, string]>).filter(([, v]) => Number(v) > 0).map(([mode, amount]) => ({ mode, amount, ...(mode !== 'CASH' && ref ? { reference: ref } : {}) })))}>Complete bill</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        {(['CASH', 'UPI', 'CARD', 'BANK_TRANSFER'] as Mode[]).map((m, i) => (
          <label key={m} className="block space-y-1"><span className="text-xs font-medium text-muted">{m.replace('_', ' ')}</span>
            <div className="flex gap-1"><Input data-autofocus={i === 0 ? true : undefined} inputMode="decimal" className="num text-right" value={amounts[m]} onChange={(e) => setAmounts({ ...amounts, [m]: e.target.value.replace(/[^\d.]/g, '') })} placeholder="0.00" />
              <Button variant="outline" size="sm" className="h-9" onClick={() => setAmounts({ ...amounts, [m]: D(amounts[m] || 0).plus(Decimal_max(balance)).toFixed(2) })}>Rest</Button></div></label>))}
        <label className="col-span-2 block space-y-1"><span className="text-xs font-medium text-muted">Reference (UPI / card / bank)</span><Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Optional" /></label>
      </div>
      <div className={cn('mt-4 flex items-center justify-between rounded-md px-3 py-2 text-sm', balance.gt(0) ? 'bg-warn/10 text-warn' : balance.lt(0) ? 'bg-bad/10 text-bad' : 'bg-ok/10 text-ok')}>
        <span>{balance.gt(0) ? (customer ? `On credit to ${customer.name}` : 'Balance – select a customer to sell on credit') : balance.lt(0) ? 'Payment is more than the bill' : 'Fully paid'}</span>
        <span className="num font-semibold">{inr(balance.abs())}</span>
      </div>
    </Dialog>
  );
}
const Decimal_max = (v: ReturnType<typeof D>) => (v.lt(0) ? D(0) : v);
