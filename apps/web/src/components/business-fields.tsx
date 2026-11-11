'use client';
import { INDIAN_STATES, INDUSTRY_PROFILES } from '@nexbill/shared';
import { cn } from '@/lib/utils';
import { Field, Input, Select, Textarea } from './ui';

export type Biz = Record<string, any>;
type P = { v: Biz; set: (k: string, val: unknown) => void; errors: Record<string, string> };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const Check = ({ v, set, k, label, hint }: P & { k: string; label: string; hint?: string }) => (
  <label className="flex items-start gap-2.5 text-sm"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-[rgb(var(--brand))]" checked={!!v[k]} onChange={(e) => set(k, e.target.checked)} /><span>{label}{hint && <span className="block text-xs text-faint">{hint}</span>}</span></label>
);
const T = ({ v, set, errors, k, label, ...rest }: P & { k: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) => <Field label={label} error={errors[k]}><Input value={v[k] ?? ''} onChange={(e) => set(k, e.target.value)} {...rest} /></Field>;

export function BusinessInfoFields(p: P) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <T {...p} k="name" label="Business name" /><T {...p} k="ownerName" label="Owner name" /><T {...p} k="phone" label="Mobile" inputMode="numeric" /><T {...p} k="email" label="Email" type="email" />
      <div className="sm:col-span-2"><T {...p} k="addressLine1" label="Address" /></div><T {...p} k="city" label="City / town" /><T {...p} k="pincode" label="PIN code" inputMode="numeric" />
      <Field label="State" error={p.errors.stateCode}><Select value={p.v.stateCode ?? ''} onChange={(e) => p.set('stateCode', e.target.value)}>{INDIAN_STATES.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}</Select></Field>
      <T {...p} k="pan" label="PAN (optional)" className="uppercase" />
    </div>
  );
}
export function IndustryFields({ v, set }: P) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">{Object.values(INDUSTRY_PROFILES).map((i) => (
      <button key={i.code} type="button" onClick={() => set('industry', i.code)} aria-pressed={v.industry === i.code} className={cn('rounded-lg border p-3.5 text-left transition-colors', v.industry === i.code ? 'border-brand bg-brand-soft/50 ring-1 ring-brand' : 'hover:border-faint')}>
        <p className="text-sm font-semibold">{i.name}</p><p className="mt-0.5 text-xs text-muted">{i.description}</p></button>))}</div>
  );
}
export function GstFields(p: P) {
  return (
    <div className="space-y-4">
      <Check {...p} k="gstRegistered" label="My business is registered under GST" hint="Registered businesses issue tax invoices with CGST/SGST/IGST. Unregistered businesses issue a bill of supply without GST." />
      {p.v.gstRegistered && <div className="max-w-sm"><T {...p} k="gstin" label="GSTIN" className="uppercase" placeholder="29ABCDE1234F1Z5" maxLength={15} /></div>}
      <Check {...p} k="pricesIncludeTax" label="My selling prices include GST (MRP-style)" hint="Default for new products. You can change it per product." />
    </div>
  );
}
export function InvoiceFields(p: P) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <T {...p} k="invoicePrefix" label="Invoice number prefix" className="uppercase" maxLength={5} />
      <Field label="Financial year starts in"><Select value={String(p.v.fyStartMonth ?? 4)} onChange={(e) => p.set('fyStartMonth', Number(e.target.value))}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</Select></Field>
      <p className="text-xs text-faint sm:col-span-2">Numbers look like <b>{(p.v.invoicePrefix || 'INV').toUpperCase()}/26-27/0001</b>: sequential within each financial year, never reused, and within the 16 characters GST allows.</p>
      <Field label="Default print format"><Select value={p.v.invoiceTemplate ?? 'A4'} onChange={(e) => p.set('invoiceTemplate', e.target.value)}><option value="A4">A4 sheet</option><option value="THERMAL_80">80 mm thermal roll</option><option value="THERMAL_58">58 mm thermal roll</option></Select></Field>
      <T {...p} k="logoUrl" label="Logo image URL (optional)" placeholder="https://…" />
      <div className="sm:col-span-2"><Field label="Terms printed on invoices"><Textarea value={p.v.invoiceTerms ?? ''} onChange={(e) => p.set('invoiceTerms', e.target.value)} placeholder="Goods once sold will not be taken back…" /></Field></div>
      <Check {...p} k="roundOffInvoices" label="Round invoice totals to the nearest rupee" /><Check {...p} k="allowNegativeStock" label="Allow billing when stock is zero" hint="Stock can go negative. Off is safer." />
    </div>
  );
}
