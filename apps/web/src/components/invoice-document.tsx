'use client';
import { stateName } from '@nexbill/shared';
import { cn, fmtDate, fmtDateTime, inr, qty } from '@/lib/utils';

export type InvoiceTemplate = 'A4' | 'THERMAL_80' | 'THERMAL_58';
const PAGE: Record<InvoiceTemplate, string> = { A4: '@page { size: A4; margin: 12mm; }', THERMAL_80: '@page { size: 80mm auto; margin: 3mm; }', THERMAL_58: '@page { size: 58mm auto; margin: 2mm; }' };

/** One invoice rendering for screen, print (A4 or thermal roll via browser print) and the public share link. */
export function InvoiceDocument({ invoice: inv, template }: { invoice: any; template: InvoiceTemplate }) {
  const b = inv.business, thermal = template !== 'A4';
  const inter = inv.supplyType === 'INTER_STATE', taxed = inv.docType === 'TAX_INVOICE';
  const rates = new Map<string, { taxable: number; cgst: number; sgst: number; igst: number }>();
  for (const it of inv.items) { const r = rates.get(it.gstRate) ?? { taxable: 0, cgst: 0, sgst: 0, igst: 0 }; r.taxable += +it.taxableValue; r.cgst += +it.cgst; r.sgst += +it.sgst; r.igst += +it.igst; rates.set(it.gstRate, r); }
  const address = [b.addressLine1, b.addressLine2, b.city, stateName(b.stateCode), b.pincode].filter(Boolean).join(', ');
  const title = inv.status === 'DRAFT' ? 'Draft / Estimate' : taxed ? 'Tax Invoice' : 'Bill of Supply';
  const Totals = () => (
    <dl className={cn('space-y-0.5', !thermal && 'ml-auto w-64')}>
      {[['Taxable value', inv.taxableTotal], ...(taxed ? (inter ? [['IGST', inv.igstTotal]] : [['CGST', inv.cgstTotal], ['SGST', inv.sgstTotal]]) : []), ...(+inv.cessTotal ? [['Cess', inv.cessTotal]] : []), ...(+inv.roundOff ? [['Round off', inv.roundOff]] : [])]
        .map(([k, v]) => <div key={k} className="flex justify-between"><dt>{k}</dt><dd className="num">{inr(v)}</dd></div>)}
      <div className="flex justify-between border-t border-current pt-1 text-base font-bold"><dt>Total</dt><dd className="num">{inr(inv.grandTotal)}</dd></div>
      {+inv.paidAmount > 0 && <div className="flex justify-between"><dt>Paid</dt><dd className="num">{inr(inv.paidAmount)}</dd></div>}
      {+inv.returnedAmount > 0 && <div className="flex justify-between"><dt>Returned</dt><dd className="num">{inr(inv.returnedAmount)}</dd></div>}
      {+inv.balanceDue > 0 && <div className="flex justify-between font-semibold"><dt>Balance due</dt><dd className="num">{inr(inv.balanceDue)}</dd></div>}
    </dl>
  );
  return (
    <div className={cn('print-sheet relative mx-auto border bg-white text-black shadow-card', thermal ? 'p-3 font-mono text-[11px] leading-snug' : 'max-w-[210mm] p-8 text-[13px]', template === 'THERMAL_80' && 'w-[80mm]', template === 'THERMAL_58' && 'w-[58mm] text-[10px]')}>
      <style>{PAGE[template]}</style>
      {inv.status === 'CANCELLED' && <div className="pointer-events-none absolute inset-0 flex items-center justify-center"><span className="-rotate-12 border-4 border-red-600 px-4 py-1 text-4xl font-bold text-red-600 opacity-40">CANCELLED</span></div>}
      <header className={cn(thermal ? 'text-center' : 'flex items-start justify-between gap-6')}>
        <div>
          {b.logoUrl && !thermal && <img src={b.logoUrl} alt="" className="mb-2 h-12" />}
          <p className={cn('font-bold', thermal ? 'text-sm' : 'text-xl')}>{b.name}</p>
          {address && <p>{address}</p>}
          {b.phone && <p>Ph: {b.phone}</p>}
          {b.gstin && <p className="font-semibold">GSTIN: {b.gstin}</p>}
        </div>
        <div className={thermal ? 'mt-1 border-y border-dashed border-black py-1' : 'text-right'}>
          <p className={cn('font-bold uppercase tracking-wide', !thermal && 'text-lg')}>{title}</p>
          <p>No: <span className="font-semibold">{inv.number ?? '—'}</span></p>
          <p>{thermal ? fmtDateTime(inv.invoiceDate) : `Date: ${fmtDateTime(inv.invoiceDate)}`}</p>
          {inv.dueDate && +inv.balanceDue > 0 && <p>Due: {fmtDate(inv.dueDate)}</p>}
        </div>
      </header>
      <section className={cn('my-3', !thermal && 'grid grid-cols-2 gap-6 border-y py-3')}>
        <div><p className="font-semibold">{thermal ? 'Customer: ' : 'Billed to'}{thermal && inv.customerName}</p>{!thermal && <p>{inv.customerName}</p>}
          {inv.customerPhone && <p>Ph: {inv.customerPhone}</p>}{inv.customerAddress && !thermal && <p>{inv.customerAddress}</p>}{inv.customerGstin && <p>GSTIN: {inv.customerGstin}</p>}</div>
        {taxed && <div className={thermal ? '' : 'text-right'}><p>Place of supply: {stateName(inv.placeOfSupply)} ({inv.placeOfSupply})</p></div>}
      </section>
      {thermal ? (
        <div className="border-y border-dashed border-black py-1">
          {inv.items.map((it: any) => (
            <div key={it.id} className="mb-1"><p className="font-semibold">{it.description}</p>
              <div className="flex justify-between"><span>{qty(it.quantity)} {it.unitCode} x {(+it.unitPrice).toFixed(2)}{+it.lineDiscount ? ` -${(+it.lineDiscount).toFixed(2)}` : ''}{taxed ? ` @${+it.gstRate}%` : ''}</span><span className="num">{(+it.lineTotal).toFixed(2)}</span></div></div>))}
        </div>
      ) : (
        <table className="w-full border-collapse text-left">
          <thead><tr className="border-b-2 border-black text-xs uppercase"><th className="py-1.5 pr-2">#</th><th className="py-1.5 pr-2">Description</th><th className="py-1.5 pr-2">HSN</th><th className="py-1.5 pr-2 text-right">Qty</th><th className="py-1.5 pr-2 text-right">Rate</th><th className="py-1.5 pr-2 text-right">Disc.</th><th className="py-1.5 pr-2 text-right">Taxable</th>{taxed && <th className="py-1.5 pr-2 text-right">GST</th>}<th className="py-1.5 text-right">Amount</th></tr></thead>
          <tbody>{inv.items.map((it: any, i: number) => (
            <tr key={it.id} className="border-b border-neutral-300 align-top"><td className="py-1.5 pr-2">{i + 1}</td><td className="py-1.5 pr-2">{it.description}</td><td className="py-1.5 pr-2">{it.hsnCode ?? ''}</td>
              <td className="num py-1.5 pr-2 text-right">{qty(it.quantity)} {it.unitCode}</td><td className="num py-1.5 pr-2 text-right">{(+it.unitPrice).toFixed(2)}</td>
              <td className="num py-1.5 pr-2 text-right">{+it.lineDiscount + +it.invoiceDiscountShare ? (+it.lineDiscount + +it.invoiceDiscountShare).toFixed(2) : ''}</td>
              <td className="num py-1.5 pr-2 text-right">{(+it.taxableValue).toFixed(2)}</td>{taxed && <td className="num py-1.5 pr-2 text-right">{+it.gstRate}%</td>}<td className="num py-1.5 text-right">{(+it.lineTotal).toFixed(2)}</td></tr>))}</tbody>
        </table>
      )}
      <section className={cn('mt-3', !thermal && 'flex items-start justify-between gap-6')}>
        {!thermal && taxed && (
          <table className="text-xs"><thead><tr className="border-b border-black"><th className="pr-3 text-left">GST %</th><th className="pr-3 text-right">Taxable</th>{inter ? <th className="text-right">IGST</th> : <><th className="pr-3 text-right">CGST</th><th className="text-right">SGST</th></>}</tr></thead>
            <tbody>{[...rates].map(([rate, r]) => <tr key={rate}><td className="pr-3">{+rate}%</td><td className="num pr-3 text-right">{r.taxable.toFixed(2)}</td>{inter ? <td className="num text-right">{r.igst.toFixed(2)}</td> : <><td className="num pr-3 text-right">{r.cgst.toFixed(2)}</td><td className="num text-right">{r.sgst.toFixed(2)}</td></>}</tr>)}</tbody></table>
        )}
        <Totals />
      </section>
      {inv.payments?.length > 0 && <p className="mt-2 text-xs">Payments: {inv.payments.filter((p: any) => p.direction === 'IN').map((p: any) => `${p.mode.replace('_', ' ')} ${inr(p.amount)}`).join(', ')}</p>}
      {(b.invoiceTerms || inv.notes) && <footer className={cn('mt-3 border-t pt-2 text-xs', thermal && 'border-dashed border-black text-center')}>{inv.notes && <p>{inv.notes}</p>}{b.invoiceTerms && <p className="whitespace-pre-line">{b.invoiceTerms}</p>}</footer>}
      {!thermal && <p className="mt-8 text-right text-xs">For {b.name}<br /><br /><br />Authorised signatory</p>}
      {thermal && <p className="mt-2 text-center">Thank you! Visit again.</p>}
    </div>
  );
}
