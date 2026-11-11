'use client';
import { useQueryClient } from '@tanstack/react-query';
import { STANDARD_GST_RATES } from '@nexbill/shared';
import { productSchema, supplierSchema } from '@nexbill/validation';
import { Check } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { BusinessInfoFields, GstFields, IndustryFields, InvoiceFields } from '@/components/business-fields';
import { Button, Card, Field, Input, Select, Spinner } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useGet } from '@/lib/hooks';
import { useBusinessForm } from '@/lib/use-business-form';
import { cn } from '@/lib/utils';

const STEPS = ['Business details', 'Industry', 'GST', 'Invoices', 'First products', 'Supplier', 'Ready'];

export default function OnboardingPage() {
  const router = useRouter(), qc = useQueryClient(), f = useBusinessForm();
  const units = useGet<any[]>('/units');
  const [step, setStep] = useState(0), [busy, setBusy] = useState(false);
  const [product, setProduct] = useState({ name: '', sellingPrice: '', purchasePrice: '', gstRate: '18', hsnCode: '', unit: 'PCS', openingStock: '', barcode: '' }), [added, setAdded] = useState<string[]>([]);
  const [supplier, setSupplier] = useState({ name: '', phone: '', gstin: '' });
  if (!f.ready) return <div className="flex justify-center py-20"><Spinner /></div>;
  const p = { v: f.v, set: f.set, errors: f.errors };

  const addProduct = async (): Promise<boolean> => {
    if (!product.name && !product.sellingPrice) return true; // nothing typed: skipping is fine
    const parsed = productSchema.safeParse({ name: product.name, gstRate: product.gstRate, hsnCode: product.hsnCode, priceIncludesTax: f.v.pricesIncludeTax, baseUnitId: units.data?.find((u) => u.code === product.unit)?.id,
      variants: [{ sellingPrice: product.sellingPrice, purchasePrice: product.purchasePrice || 0, openingStock: product.openingStock || undefined, barcodes: product.barcode ? [product.barcode] : [] }] });
    if (!parsed.success) { toast.error(`${parsed.error.issues[0]?.path.slice(-1)[0]}: ${parsed.error.issues[0]?.message}`); return false; }
    setBusy(true);
    try { await api('/products', { body: parsed.data }); setAdded((a) => [...a, product.name]); setProduct({ ...product, name: '', sellingPrice: '', purchasePrice: '', openingStock: '', barcode: '', hsnCode: '' }); toast.success('Product added'); return true; }
    catch (e) { toast.error(errorMessage(e)); return false; } finally { setBusy(false); }
  };
  const addSupplier = async (): Promise<boolean> => {
    if (!supplier.name) return true;
    const parsed = supplierSchema.safeParse(supplier);
    if (!parsed.success) { toast.error(parsed.error.issues[0]?.message ?? 'Check the supplier'); return false; }
    setBusy(true);
    try { await api('/suppliers', { body: parsed.data }); return true; } catch (e) { toast.error(errorMessage(e)); return false; } finally { setBusy(false); }
  };
  const next = async () => {
    const ok = step === 0 ? await f.save(['name', 'ownerName', 'phone', 'email', 'addressLine1', 'city', 'pincode', 'stateCode', 'pan'])
      : step === 1 ? await f.save(['industry']) : step === 2 ? await f.save(['gstRegistered', 'gstin', 'pricesIncludeTax', 'stateCode'])
      : step === 3 ? await f.save(['invoicePrefix', 'fyStartMonth', 'invoiceTemplate', 'logoUrl', 'invoiceTerms', 'roundOffInvoices', 'allowNegativeStock'])
      : step === 4 ? await addProduct() : step === 5 ? (await addSupplier()) && (await f.save([], { onboardingComplete: true })) : true;
    if (ok) setStep((s) => s + 1);
  };
  const finish = async (to: string) => { await qc.invalidateQueries(); router.replace(to); };
  const pf = (k: keyof typeof product, label: string, props: Record<string, unknown> = {}) => <Field label={label}><Input value={product[k]} onChange={(e) => setProduct({ ...product, [k]: e.target.value })} {...props} /></Field>;

  return (
    <div className="mx-auto max-w-3xl py-2">
      <h1 className="text-2xl font-semibold tracking-tight">Let&apos;s set up {f.v.name}</h1>
      <p className="mt-1 text-sm text-muted">A few quick steps. You can change everything later in Settings.</p>
      <ol className="my-6 flex items-center gap-1">{STEPS.map((s, i) => (
        <li key={s} className="flex flex-1 flex-col gap-1.5"><span className={cn('h-1 rounded-full', i <= step ? 'bg-brand' : 'bg-ink/10')} /><span className={cn('hidden text-2xs font-medium sm:block', i === step ? 'text-ink' : 'text-faint')}>{i + 1}. {s}</span></li>))}</ol>
      <Card className="p-6">
        <h2 className="mb-4 text-base font-semibold">{['Tell us about your business', 'What do you sell?', 'GST registration', 'How should your invoices look?', 'Add your first products', 'Add a supplier (optional)', 'You are ready to bill'][step]}</h2>
        {step === 0 && <BusinessInfoFields {...p} />}
        {step === 1 && <IndustryFields {...p} />}
        {step === 2 && <GstFields {...p} />}
        {step === 3 && <InvoiceFields {...p} />}
        {step === 4 && (
          <div>
            {added.length > 0 && <ul className="mb-4 space-y-1 text-sm">{added.map((n, i) => <li key={i} className="flex items-center gap-2 text-ok"><Check className="h-4 w-4" />{n}</li>)}</ul>}
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="sm:col-span-2">{pf('name', 'Product name', { placeholder: 'e.g. Cement 50 kg bag' })}</div>
              <Field label="Unit"><Select value={product.unit} onChange={(e) => setProduct({ ...product, unit: e.target.value })}>{units.data?.map((u) => <option key={u.id} value={u.code}>{u.name}</option>)}</Select></Field>
              {pf('sellingPrice', `Selling price (₹${f.v.pricesIncludeTax ? ', incl. GST' : ''})`, { inputMode: 'decimal' })}{pf('purchasePrice', 'Purchase price (₹)', { inputMode: 'decimal' })}
              <Field label="GST rate"><Select value={product.gstRate} onChange={(e) => setProduct({ ...product, gstRate: e.target.value })}>{STANDARD_GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}</Select></Field>
              {pf('hsnCode', 'HSN code (optional)', { inputMode: 'numeric' })}{pf('openingStock', 'Stock in hand', { inputMode: 'decimal' })}{pf('barcode', 'Barcode (optional)')}
            </div>
            <Button variant="outline" className="mt-4" loading={busy} onClick={addProduct}>Add and enter another</Button>
            <p className="mt-3 text-xs text-faint">Have a long list? Skip this and use Products → Import to upload a CSV file.</p>
          </div>
        )}
        {step === 5 && (
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Supplier name"><Input value={supplier.name} onChange={(e) => setSupplier({ ...supplier, name: e.target.value })} /></Field>
            <Field label="Mobile"><Input value={supplier.phone} onChange={(e) => setSupplier({ ...supplier, phone: e.target.value })} inputMode="numeric" /></Field>
            <Field label="GSTIN"><Input value={supplier.gstin} onChange={(e) => setSupplier({ ...supplier, gstin: e.target.value })} className="uppercase" /></Field>
          </div>
        )}
        {step === 6 && (
          <div className="py-4 text-center"><div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft"><Check className="h-6 w-6 text-brand" /></div>
            <p className="text-sm text-muted">Your business is set up. Create your first invoice now, or look around the dashboard.</p>
            <div className="mt-5 flex justify-center gap-2"><Button variant="outline" onClick={() => finish('/dashboard')}>Go to dashboard</Button><Button size="lg" onClick={() => finish('/pos')}>Create first invoice</Button></div></div>
        )}
        {step < 6 && (
          <div className="mt-6 flex items-center justify-between border-t pt-4">
            <Button variant="ghost" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>Back</Button>
            <div className="flex gap-2">{step >= 4 && <Button variant="ghost" onClick={async () => { if (step === 5 && !(await f.save([], { onboardingComplete: true }))) return; setStep((s) => s + 1); }}>Skip</Button>}
              <Button loading={f.busy || busy} onClick={next}>{step === 5 ? 'Finish setup' : 'Continue'}</Button></div>
          </div>
        )}
      </Card>
    </div>
  );
}
