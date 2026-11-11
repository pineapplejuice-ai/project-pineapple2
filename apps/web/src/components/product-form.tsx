'use client';
import { useQueryClient } from '@tanstack/react-query';
import { INDUSTRY_PROFILES, STANDARD_GST_RATES, steelWeightPerMetre, type IndustryCode, type SteelShape } from '@nexbill/shared';
import { productSchema } from '@nexbill/validation';
import { Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { api, ApiError, errorMessage } from '@/lib/api';
import { useBusiness, useCan, useGet } from '@/lib/hooks';
import { clean } from './form-dialog';
import { PageHeader } from './page';
import { Button, Card, CardHeader, ConfirmDialog, Field, Input, Select, Textarea } from './ui';

interface VariantRow { id?: string; name: string; sku: string; purchasePrice: string; sellingPrice: string; mrp: string; wholesalePrice: string; minStock: string; reorderLevel: string; barcodes: string; openingStock: string; openingBatchNo: string; openingExpiry: string; isActive: boolean }
const blankVariant = (): VariantRow => ({ name: '', sku: '', purchasePrice: '', sellingPrice: '', mrp: '', wholesalePrice: '', minStock: '', reorderLevel: '', barcodes: '', openingStock: '', openingBatchNo: '', openingExpiry: '', isActive: true });

export function ProductForm({ product }: { product?: any }) {
  const router = useRouter(), qc = useQueryClient(), can = useCan(), business = useBusiness();
  const units = useGet<any[]>('/units'), categories = useGet<any[]>('/categories'), suppliers = useGet<{ data: any[] }>(can('suppliers.view') ? '/suppliers' : null, { pageSize: 200 });
  const attrDefs = useGet<any[]>('/attributes');
  const profile = INDUSTRY_PROFILES[(business?.industry ?? 'GENERAL') as IndustryCode];
  const [f, setF] = useState<Record<string, any>>(() => ({
    name: product?.name ?? '', description: product?.description ?? '', type: product?.type ?? 'GOODS', categoryId: product?.categoryId ?? '', brand: product?.brand ?? '', manufacturer: product?.manufacturer ?? '',
    hsnCode: product?.hsnCode ?? '', gstRate: product ? String(Number(product.gstRate)) : '18', cessRate: product ? String(Number(product.cessRate)) : '0', taxExempt: product?.taxExempt ?? false,
    priceIncludesTax: product?.priceIncludesTax ?? business?.pricesIncludeTax ?? true, baseUnitId: product?.baseUnitId ?? '', trackInventory: product?.trackInventory ?? true,
    trackBatches: product?.trackBatches ?? profile.trackBatches, supplierId: product?.supplierId ?? '', imageUrl: product?.imageUrl ?? '', isActive: product?.isActive ?? true,
  }));
  const [attributes, setAttributes] = useState<Record<string, any>>(product?.attributes ?? {});
  const [variants, setVariants] = useState<VariantRow[]>(() => product?.variants?.length
    ? product.variants.map((v: any) => ({ id: v.id, name: v.name, sku: v.sku, purchasePrice: v.purchasePrice ?? '', sellingPrice: v.sellingPrice, mrp: v.mrp ?? '', wholesalePrice: v.wholesalePrice ?? '', minStock: v.minStock, reorderLevel: v.reorderLevel, barcodes: v.barcodes.map((b: any) => b.code).join(', '), openingStock: '', openingBatchNo: '', openingExpiry: '', isActive: v.isActive }))
    : [blankVariant()]);
  const [altUnits, setAltUnits] = useState<Array<{ unitId: string; factorToBase: string }>>(() => product?.units?.map((u: any) => ({ unitId: u.unitId, factorToBase: String(Number(u.factorToBase)) })) ?? []);
  const [errors, setErrors] = useState<Record<string, string>>({}), [busy, setBusy] = useState(false), [dup, setDup] = useState(false);
  const set = (k: string, v: unknown) => setF((s) => ({ ...s, [k]: v }));
  const setVariant = (i: number, patch: Partial<VariantRow>) => setVariants((vs) => vs.map((v, j) => (j === i ? { ...v, ...patch } : v)));
  const baseUnit = units.data?.find((u) => u.id === f.baseUnitId);
  const showCost = can('products.view_cost');

  const theoretical = useMemo(() => {
    if (!attributes.steelShape) return null;
    try { return steelWeightPerMetre({ shape: attributes.steelShape as SteelShape, width: attributes.width, height: attributes.height, outerDiameter: attributes.outerDiameter, thickness: attributes.thickness }).toString(); } catch { return null; }
  }, [attributes]);

  const save = async (allowDuplicate = false) => {
    const body = {
      ...clean(f), baseUnitId: f.baseUnitId || units.data?.find((u) => u.code === 'PCS')?.id, attributes: Object.fromEntries(Object.entries(attributes).filter(([, v]) => v !== '' && v != null)),
      units: altUnits.filter((u) => u.unitId && u.factorToBase),
      variants: variants.map((v) => ({ ...clean({ ...v }), barcodes: v.barcodes.split(',').map((b) => b.trim()).filter(Boolean), ...(showCost ? {} : { purchasePrice: product?.variants?.find((x: any) => x.id === v.id) ? undefined : 0 }) })),
    };
    const parsed = productSchema.safeParse(body);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [i.path.join('.'), i.message])));
      return toast.error(`Check the form: ${parsed.error.issues[0]?.path.join(' › ')} – ${parsed.error.issues[0]?.message}`);
    }
    setErrors({}); setBusy(true);
    try {
      const saved = product ? await api<any>(`/products/${product.id}`, { method: 'PUT', body: parsed.data }) : await api<any>('/products', { body: parsed.data, query: { allowDuplicate } });
      toast.success('Product saved');
      await qc.invalidateQueries({ queryKey: ['/products'] }); await qc.invalidateQueries({ queryKey: [`/products/${saved.id}`] });
      router.push('/products');
    } catch (e) { if (e instanceof ApiError && e.code === 'DUPLICATE_PRODUCT') setDup(true); else toast.error(errorMessage(e)); }
    finally { setBusy(false); }
  };
  const text = (k: string, label: string, props: Record<string, unknown> = {}) => <Field label={label} error={errors[k]} {...(props.fieldProps as object)}><Input value={f[k]} onChange={(e) => set(k, e.target.value)} {...props} /></Field>;
  const check = (k: string, label: string) => <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[rgb(var(--brand))]" checked={!!f[k]} onChange={(e) => set(k, e.target.checked)} />{label}</label>;

  return (
    <>
      <PageHeader title={product ? product.name : 'New product'} crumbs={[{ label: 'Products', href: '/products' }]} actions={<><Button variant="outline" onClick={() => router.push('/products')}>Cancel</Button><Button loading={busy} onClick={() => save()}>Save product</Button></>} />
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card><CardHeader title="Basics" />
            <div className="grid gap-4 p-4 sm:grid-cols-2">
              <div className="sm:col-span-2">{text('name', 'Product name', { autoFocus: !product, placeholder: 'e.g. MS Square Pipe 40x40x2mm' })}</div>
              <Field label="Category"><Select value={f.categoryId} onChange={(e) => set('categoryId', e.target.value)}><option value="">Uncategorised</option>{categories.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
              <Field label="Type"><Select value={f.type} onChange={(e) => set('type', e.target.value)} disabled={!!product}><option value="GOODS">Goods</option><option value="SERVICE">Service (no stock)</option></Select></Field>
              {text('brand', 'Brand')}{text('manufacturer', 'Manufacturer')}
              <Field label="Base unit" error={errors.baseUnitId} hint="Stock is counted in this unit"><Select value={f.baseUnitId} onChange={(e) => set('baseUnitId', e.target.value)}><option value="">Pieces (PCS)</option>{units.data?.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.code})</option>)}</Select></Field>
              {suppliers.data && <Field label="Preferred supplier"><Select value={f.supplierId} onChange={(e) => set('supplierId', e.target.value)}><option value="">None</option>{suppliers.data.data.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>}
              <div className="sm:col-span-2"><Field label="Description"><Textarea value={f.description} onChange={(e) => set('description', e.target.value)} /></Field></div>
            </div>
          </Card>

          <Card><CardHeader title={variants.length > 1 ? 'Variants & pricing' : 'Pricing & stock'} description="Add variants for sizes, flavours or packs. Each has its own SKU, barcode, price and stock."
            action={<Button size="sm" variant="outline" onClick={() => setVariants([...variants, blankVariant()])}><Plus className="h-3.5 w-3.5" />Add variant</Button>} />
            <div className="divide-y">
              {variants.map((v, i) => (
                <div key={v.id ?? i} className="grid gap-3 p-4 sm:grid-cols-4">
                  {variants.length > 1 && <Field label="Variant name" className="sm:col-span-2" error={errors[`variants.${i}.name`]}><Input value={v.name} onChange={(e) => setVariant(i, { name: e.target.value })} placeholder="e.g. Vanilla / 500 ml" /></Field>}
                  <Field label="SKU" hint={v.id ? undefined : 'Auto if empty'}><Input value={v.sku} onChange={(e) => setVariant(i, { sku: e.target.value })} /></Field>
                  <Field label="Barcodes" hint="Comma separated" className={variants.length > 1 ? '' : 'sm:col-span-3'} error={errors[`variants.${i}.barcodes`]}><Input value={v.barcodes} onChange={(e) => setVariant(i, { barcodes: e.target.value })} /></Field>
                  <Field label={`Selling price${f.priceIncludesTax ? ' (incl. GST)' : ' (excl. GST)'}`} required error={errors[`variants.${i}.sellingPrice`]}><Input inputMode="decimal" className="num" value={v.sellingPrice} onChange={(e) => setVariant(i, { sellingPrice: e.target.value })} /></Field>
                  {showCost && <Field label="Purchase price"><Input inputMode="decimal" className="num" value={v.purchasePrice} onChange={(e) => setVariant(i, { purchasePrice: e.target.value })} /></Field>}
                  <Field label="MRP"><Input inputMode="decimal" className="num" value={v.mrp} onChange={(e) => setVariant(i, { mrp: e.target.value })} /></Field>
                  <Field label="Wholesale price"><Input inputMode="decimal" className="num" value={v.wholesalePrice} onChange={(e) => setVariant(i, { wholesalePrice: e.target.value })} /></Field>
                  <Field label={`Minimum stock${baseUnit ? ` (${baseUnit.code})` : ''}`} hint="Alert at or below"><Input inputMode="decimal" className="num" value={v.minStock} onChange={(e) => setVariant(i, { minStock: e.target.value })} /></Field>
                  <Field label="Reorder level"><Input inputMode="decimal" className="num" value={v.reorderLevel} onChange={(e) => setVariant(i, { reorderLevel: e.target.value })} /></Field>
                  {!v.id && f.trackInventory && f.type === 'GOODS' && <Field label="Opening stock"><Input inputMode="decimal" className="num" value={v.openingStock} onChange={(e) => setVariant(i, { openingStock: e.target.value })} /></Field>}
                  {!v.id && f.trackBatches && <><Field label="Opening batch no."><Input value={v.openingBatchNo} onChange={(e) => setVariant(i, { openingBatchNo: e.target.value })} /></Field><Field label="Expiry date"><Input type="date" value={v.openingExpiry} onChange={(e) => setVariant(i, { openingExpiry: e.target.value })} /></Field></>}
                  {variants.length > 1 && <div className="flex items-end justify-end sm:col-span-4">{v.id ? <label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={v.isActive} onChange={(e) => setVariant(i, { isActive: e.target.checked })} />Active</label>
                    : <Button variant="ghost" size="sm" className="text-bad" onClick={() => setVariants(variants.filter((_, j) => j !== i))}><Trash2 className="h-3.5 w-3.5" />Remove</Button>}</div>}
                </div>
              ))}
            </div>
          </Card>

          <Card><CardHeader title="Alternate units" description={`Sell or buy in another unit, e.g. 1 BOX = 12 ${baseUnit?.code ?? 'PCS'}, or 1 piece of pipe = 6 MTR.`} action={<Button size="sm" variant="outline" onClick={() => setAltUnits([...altUnits, { unitId: '', factorToBase: '' }])}><Plus className="h-3.5 w-3.5" />Add unit</Button>} />
            {altUnits.length ? <div className="space-y-2 p-4">{altUnits.map((u, i) => (
              <div key={i} className="flex items-center gap-2 text-sm"><span>1</span>
                <Select aria-label="Alternate unit" className="w-40" value={u.unitId} onChange={(e) => setAltUnits(altUnits.map((x, j) => (j === i ? { ...x, unitId: e.target.value } : x)))}><option value="">Unit…</option>{units.data?.filter((x) => x.id !== f.baseUnitId).map((x) => <option key={x.id} value={x.id}>{x.name} ({x.code})</option>)}</Select>
                <span>=</span><Input aria-label="Conversion factor" inputMode="decimal" className="num w-28" value={u.factorToBase} onChange={(e) => setAltUnits(altUnits.map((x, j) => (j === i ? { ...x, factorToBase: e.target.value } : x)))} /><span className="text-muted">{baseUnit?.code ?? 'PCS'}</span>
                <Button variant="ghost" size="icon" aria-label="Remove unit" onClick={() => setAltUnits(altUnits.filter((_, j) => j !== i))}><Trash2 className="h-3.5 w-3.5" /></Button></div>))}</div>
              : <p className="px-4 py-5 text-center text-xs text-faint">Sold only in the base unit</p>}
          </Card>
        </div>

        <div className="space-y-4">
          <Card><CardHeader title="Tax" />
            <div className="space-y-4 p-4">
              <Field label="HSN / SAC code" error={errors.hsnCode}><Input value={f.hsnCode} onChange={(e) => set('hsnCode', e.target.value)} inputMode="numeric" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="GST rate %"><Select value={f.gstRate} onChange={(e) => set('gstRate', e.target.value)}>{[...new Set([...STANDARD_GST_RATES.map(String), f.gstRate])].map((r) => <option key={r} value={r}>{r}%</option>)}</Select></Field>
                <Field label="Cess %"><Input inputMode="decimal" className="num" value={f.cessRate} onChange={(e) => set('cessRate', e.target.value)} /></Field>
              </div>
              {check('priceIncludesTax', 'Selling price includes GST')}{check('taxExempt', 'Exempt / nil-rated (no GST)')}
            </div>
          </Card>
          <Card><CardHeader title="Inventory" /><div className="space-y-3 p-4">{check('trackInventory', 'Track stock for this product')}{check('trackBatches', 'Track batches and expiry dates')}{check('isActive', 'Active (available for billing)')}</div></Card>
          {!!attrDefs.data?.length && (
            <Card><CardHeader title={`${profile.name} details`} description="Optional attributes for this industry" />
              <div className="grid grid-cols-2 gap-3 p-4">
                {attrDefs.data.map((a) => (
                  <Field key={a.key} label={`${a.label}${a.unit ? ` (${a.unit})` : ''}`}>
                    {a.type === 'SELECT' ? <Select value={attributes[a.key] ?? ''} onChange={(e) => setAttributes({ ...attributes, [a.key]: e.target.value })}><option value="">—</option>{a.options.map((o: string) => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}</Select>
                      : a.type === 'BOOLEAN' ? <input type="checkbox" className="h-4 w-4" checked={!!attributes[a.key]} onChange={(e) => setAttributes({ ...attributes, [a.key]: e.target.checked })} />
                      : <Input inputMode={a.type === 'NUMBER' ? 'decimal' : undefined} value={attributes[a.key] ?? ''} onChange={(e) => setAttributes({ ...attributes, [a.key]: a.type === 'NUMBER' && e.target.value !== '' && !Number.isNaN(Number(e.target.value)) ? Number(e.target.value) : e.target.value })} />}
                  </Field>
                ))}
                {theoretical && <div className="col-span-2 flex items-center justify-between rounded-md bg-brand-soft px-3 py-2 text-xs text-brand"><span>Theoretical weight: <b className="num">{theoretical} kg/m</b>{attributes.standardLength ? <> · <b className="num">{(Number(theoretical) * Number(attributes.standardLength)).toFixed(2)} kg</b> per {attributes.standardLength} m length</> : null}</span>
                  <button className="font-medium underline" onClick={() => setAttributes({ ...attributes, weightPerMetre: Number(theoretical) })}>Use</button></div>}
              </div>
            </Card>
          )}
        </div>
      </div>
      <ConfirmDialog open={dup} onClose={() => setDup(false)} title="Possible duplicate" message={<>A product named <b>{f.name}</b> already exists. Create another one with the same name?</>} confirmLabel="Create anyway" onConfirm={() => { setDup(false); void save(true); }} />
    </>
  );
}
