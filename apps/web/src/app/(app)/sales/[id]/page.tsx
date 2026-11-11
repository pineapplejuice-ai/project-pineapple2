'use client';
import { useQueryClient } from '@tanstack/react-query';
import { emailInvoiceSchema, invoiceCancelSchema, receiptSchema, salesReturnSchema } from '@nexbill/validation';
import { Ban, IndianRupee, Mail, MessageCircle, Printer, Undo2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, use, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { FormDialog } from '@/components/form-dialog';
import { InvoiceDocument, type InvoiceTemplate } from '@/components/invoice-document';
import { PageHeader } from '@/components/page';
import { Button, Card, CardHeader, Dialog, ErrorState, Input, Select, Spinner, StatusBadge } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useCan, useGet } from '@/lib/hooks';
import { fmtDateTime, inr, qty, uid } from '@/lib/utils';

const MODES = [{ value: 'CASH', label: 'Cash' }, { value: 'UPI', label: 'UPI' }, { value: 'CARD', label: 'Card' }, { value: 'BANK_TRANSFER', label: 'Bank transfer' }, { value: 'CHEQUE', label: 'Cheque' }];

function Inner({ id }: { id: string }) {
  const can = useCan(), qc = useQueryClient(), router = useRouter(), autoPrint = useSearchParams().get('print') === '1';
  const { data: inv, isLoading, error } = useGet<any>(`/sales/invoices/${id}`);
  const [template, setTemplate] = useState<InvoiceTemplate | null>(null);
  const [dialog, setDialog] = useState<null | 'pay' | 'cancel' | 'return' | 'email'>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: [`/sales/invoices/${id}`] });
  useEffect(() => { if (inv && autoPrint) { const t = setTimeout(() => window.print(), 400); return () => clearTimeout(t); } }, [inv, autoPrint]);
  if (error) return <ErrorState message={errorMessage(error)} />;
  if (isLoading || !inv) return <div className="flex justify-center py-20"><Spinner /></div>;
  const tpl = template ?? (inv.business.invoiceTemplate as InvoiceTemplate);
  const issued = inv.status === 'ISSUED', due = Number(inv.balanceDue);
  const share = async () => { try { const r = await api<{ whatsappUrl: string }>(`/sales/invoices/${id}/share`, { method: 'POST' }); window.open(r.whatsappUrl, '_blank', 'noopener'); } catch (e) { toast.error(errorMessage(e)); } };
  return (
    <>
      <PageHeader title={inv.number ?? 'Draft bill'} crumbs={[{ label: 'Sales', href: '/sales' }]} description={`${inv.customerName} · ${fmtDateTime(inv.invoiceDate)}`}
        actions={<>
          <StatusBadge status={inv.status} />{issued && <StatusBadge status={inv.paymentStatus} />}
          <Select aria-label="Print format" value={tpl} onChange={(e) => setTemplate(e.target.value as InvoiceTemplate)} className="w-32"><option value="A4">A4</option><option value="THERMAL_80">80 mm roll</option><option value="THERMAL_58">58 mm roll</option></Select>
          <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" />Print / PDF</Button>
          {inv.status !== 'DRAFT' && <Button variant="outline" onClick={share}><MessageCircle className="h-4 w-4" />WhatsApp</Button>}
          {inv.status !== 'DRAFT' && <Button variant="outline" onClick={() => setDialog('email')}><Mail className="h-4 w-4" />Email</Button>}
          {issued && due > 0 && can('payments.record') && <Button onClick={() => setDialog('pay')}><IndianRupee className="h-4 w-4" />Record payment</Button>}
          {issued && can('sales.return') && <Button variant="outline" onClick={() => setDialog('return')}><Undo2 className="h-4 w-4" />Return</Button>}
          {issued && can('sales.cancel') && Number(inv.returnedAmount) === 0 && <Button variant="outline" className="text-bad" onClick={() => setDialog('cancel')}><Ban className="h-4 w-4" />Cancel</Button>}
          {inv.status === 'DRAFT' && can('sales.edit') && <Button variant="outline" className="text-bad" onClick={async () => { await api(`/sales/invoices/${id}/discard-draft`, { method: 'POST' }); toast.success('Draft discarded'); router.replace('/sales'); }}>Discard draft</Button>}
        </>} />
      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <div className="overflow-x-auto"><InvoiceDocument invoice={inv} template={tpl} /></div>
        <div className="no-print space-y-4">
          {inv.cancelReason && <Card className="border-bad/40 p-4 text-sm"><p className="font-medium text-bad">Cancelled</p><p className="mt-1 text-muted">{inv.cancelReason}</p><p className="mt-1 text-xs text-faint">{fmtDateTime(inv.cancelledAt)}</p></Card>}
          <Card><CardHeader title="Payments" description={due > 0 ? `${inr(due)} outstanding` : 'Nothing outstanding'} />
            {inv.payments.length ? <ul className="divide-y text-sm">{inv.payments.map((p: any) => <li key={p.id + p.amount} className="flex justify-between px-4 py-2"><span>{p.kind === 'REFUND' ? 'Refund' : 'Receipt'} · {p.mode.replace('_', ' ')}<span className="block text-xs text-faint">{p.number} · {fmtDateTime(p.date)}</span></span><span className={`num ${p.direction === 'OUT' ? 'text-bad' : ''}`}>{p.direction === 'OUT' ? '− ' : ''}{inr(p.amount)}</span></li>)}</ul> : <p className="px-4 py-6 text-center text-xs text-faint">No payments recorded</p>}
          </Card>
          {inv.returns.length > 0 && <Card><CardHeader title="Returns / credit notes" /><ul className="divide-y text-sm">{inv.returns.map((r: any) => <li key={r.id} className="px-4 py-2"><div className="flex justify-between"><span className="font-medium">{r.number}</span><span className="num">{inr(r.total)}</span></div><p className="text-xs text-muted">{r.items.map((i: any) => `${qty(i.quantity)} × ${i.description}${i.condition === 'DAMAGED' ? ' (damaged)' : ''}`).join(', ')}</p>{Number(r.refundAmount) > 0 && <p className="text-xs text-faint">Refunded {inr(r.refundAmount)} by {r.refundMode}</p>}</li>)}</ul></Card>}
        </div>
      </div>

      <FormDialog open={dialog === 'pay'} onClose={() => setDialog(null)} title="Record payment" description={`${inr(due)} due on ${inv.number}`} schema={receiptSchema} submitLabel="Record payment"
        defaults={{ amount: inv.balanceDue, mode: 'CASH', branchId: inv.branchId, invoiceId: id }} fields={[{ name: 'amount', label: 'Amount (₹)', type: 'number', required: true }, { name: 'mode', label: 'Mode', type: 'select', options: MODES, required: true }, { name: 'reference', label: 'Reference', wide: true }]}
        onSubmit={async (v) => { await api('/payments/receive', { body: { ...v, branchId: inv.branchId, invoiceId: id } }); toast.success('Payment recorded'); await refresh(); }} />
      <FormDialog open={dialog === 'cancel'} onClose={() => setDialog(null)} title={`Cancel ${inv.number}?`} description="The invoice stays on record as cancelled and its stock is restored. This cannot be undone." schema={invoiceCancelSchema} submitLabel="Cancel invoice"
        fields={[{ name: 'reason', label: 'Reason', type: 'textarea', required: true }, ...(Number(inv.paidAmount) > 0 ? [{ name: 'refundMode', label: `Refund ${inr(inv.paidAmount)} by`, type: 'select' as const, options: MODES, hint: inv.customerId ? 'Leave empty to keep it as customer advance' : 'Required for walk-in bills', wide: true }] : [])]}
        onSubmit={async (v) => { await api(`/sales/invoices/${id}/cancel`, { body: v }); toast.success('Invoice cancelled'); await refresh(); }} />
      <FormDialog open={dialog === 'email'} onClose={() => setDialog(null)} title="Email invoice" schema={emailInvoiceSchema} submitLabel="Send"
        fields={[{ name: 'to', label: 'Email address', type: 'email', wide: true, required: true }]}
        onSubmit={async (v) => { const r = await api<{ note: string; delivered: boolean }>(`/sales/invoices/${id}/email`, { body: v }); (r.delivered ? toast.success : toast.info)(r.delivered ? 'Email sent' : r.note); }} />
      {dialog === 'return' && <ReturnDialog invoice={inv} onClose={() => setDialog(null)} onDone={refresh} />}
    </>
  );
}

function ReturnDialog({ invoice: inv, onClose, onDone }: { invoice: any; onClose: () => void; onDone: () => void }) {
  const [rows, setRows] = useState<Record<string, { quantity: string; condition: 'GOOD' | 'DAMAGED' }>>({});
  const [reason, setReason] = useState(''), [refundMode, setRefundMode] = useState('CASH'), [refund, setRefund] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const [key] = useState(() => `ret-${uid()}`);
  const credit = inv.items.reduce((a: number, it: any) => a + (Number(rows[it.id]?.quantity) || 0) * (Number(it.lineTotal) / Number(it.quantity)), 0);
  const refundable = Math.max(0, Math.min(credit, Number(inv.paidAmount) + Number(inv.returnedAmount) + credit - Number(inv.grandTotal)));
  const refundAmount = refund ?? refundable.toFixed(2);
  const submit = async () => {
    const items = Object.entries(rows).filter(([, r]) => Number(r.quantity) > 0).map(([invoiceItemId, r]) => ({ invoiceItemId, ...r }));
    const parsed = salesReturnSchema.safeParse({ idempotencyKey: key, invoiceId: inv.id, reason, items, refundAmount, refundMode: Number(refundAmount) > 0 ? refundMode : undefined });
    if (!parsed.success) return toast.error(parsed.error.issues[0]?.message ?? 'Check the return');
    setBusy(true);
    try { const r = await api<{ number: string }>('/sales/returns', { body: parsed.data }); toast.success(`Credit note ${r.number} created`); onDone(); onClose(); }
    catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} title={`Return against ${inv.number}`} description="Returned goods go back into stock; damaged goods are written off." size="lg"
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button loading={busy} disabled={credit <= 0} onClick={submit}>Create credit note</Button></>}>
      <table className="w-full text-sm"><thead><tr className="border-b text-left text-2xs uppercase tracking-wider text-faint"><th className="py-1.5">Item</th><th className="py-1.5 text-right">Sold</th><th className="py-1.5 text-right">Returned</th><th className="py-1.5 text-right">Return now</th><th className="py-1.5 pl-3">Condition</th></tr></thead>
        <tbody>{inv.items.map((it: any) => { const left = Number(it.quantity) - Number(it.returnedQty); return (
          <tr key={it.id} className="border-b last:border-0"><td className="py-2">{it.description}</td><td className="num py-2 text-right">{qty(it.quantity)}</td><td className="num py-2 text-right">{qty(it.returnedQty)}</td>
            <td className="py-2 text-right"><Input aria-label={`Return quantity for ${it.description}`} disabled={left <= 0} inputMode="decimal" className="num ml-auto h-8 w-20 text-right" placeholder={`max ${qty(left)}`} value={rows[it.id]?.quantity ?? ''}
              onChange={(e) => { const v = e.target.value.replace(/[^\d.]/g, ''); setRows({ ...rows, [it.id]: { quantity: Number(v) > left ? String(left) : v, condition: rows[it.id]?.condition ?? 'GOOD' } }); setRefund(null); }} /></td>
            <td className="py-2 pl-3"><Select aria-label="Condition" className="h-8 w-28" value={rows[it.id]?.condition ?? 'GOOD'} onChange={(e) => setRows({ ...rows, [it.id]: { quantity: rows[it.id]?.quantity ?? '', condition: e.target.value as 'GOOD' } })}><option value="GOOD">Sellable</option><option value="DAMAGED">Damaged</option></Select></td></tr>); })}</tbody></table>
      <div className="mt-4 grid grid-cols-3 gap-3">
        <label className="col-span-3 block space-y-1"><span className="text-xs font-medium text-muted">Reason</span><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is it being returned?" /></label>
        <div><p className="text-xs font-medium text-muted">Credit value</p><p className="num mt-1 text-lg font-semibold">{inr(credit)}</p></div>
        <label className="block space-y-1"><span className="text-xs font-medium text-muted">Refund now (max {inr(refundable)})</span><Input inputMode="decimal" className="num text-right" value={refundAmount} onChange={(e) => setRefund(e.target.value.replace(/[^\d.]/g, ''))} /></label>
        <label className="block space-y-1"><span className="text-xs font-medium text-muted">Refund mode</span><Select value={refundMode} onChange={(e) => setRefundMode(e.target.value)}>{MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</Select></label>
      </div>
      <p className="mt-2 text-xs text-faint">{inv.customerId ? 'Anything not refunded reduces what the customer owes or stays as advance on their account.' : 'Walk-in bills must be refunded in full.'} The exact credit is calculated by the server.</p>
    </Dialog>
  );
}

export default function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <Suspense><Inner id={id} /></Suspense>;
}
