'use client';
import { useQueryClient } from '@tanstack/react-query';
import { Download, Package, Plus, Upload } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader, SearchBox } from '@/components/page';
import { Badge, Button, Card, DataTable, Dialog, EmptyState, Pagination, Select } from '@/components/ui';
import { api, download, errorMessage } from '@/lib/api';
import { useCan, useDebounced, useGet, useList } from '@/lib/hooks';
import { inr, qty } from '@/lib/utils';

/** Minimal RFC-4180 CSV parser (quoted fields, embedded commas and newlines). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c; }
    else if (c === '"') quoted = true; else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some((x) => x.trim())) rows.push(row); row = []; }
    else cell += c;
  }
  row.push(cell); if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}
const TEMPLATE = 'name,sku,barcode,category,unit,hsnCode,gstRate,purchasePrice,sellingPrice,mrp,openingStock\nCement 50kg,,8901234567890,Building material,BAG,2523,28,360,420,450,40\n';

export default function ProductsPage() {
  const router = useRouter(), can = useCan(), qc = useQueryClient();
  const [q, setQ] = useState(''), [categoryId, setCategoryId] = useState(''), [status, setStatus] = useState(''), [page, setPage] = useState(1), [importing, setImporting] = useState(false), [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const categories = useGet<any[]>('/categories');
  const list = useList('/products', { q: useDebounced(q), categoryId, status, page, pageSize: 25 });
  const runImport = async (f: File) => {
    setBusy(true);
    try {
      const [header, ...lines] = parseCsv(await f.text());
      if (!header?.includes('name') || !header.includes('sellingPrice')) throw new Error('The file needs at least the columns "name" and "sellingPrice"');
      const rows = lines.map((l) => Object.fromEntries(header.map((h, i) => [h.trim(), l[i]?.trim() || undefined])));
      const r = await api<{ created: number; skipped: number }>('/products/import', { body: { rows } });
      toast.success(`${r.created} products imported${r.skipped ? `, ${r.skipped} skipped as duplicates` : ''}`);
      setImporting(false); await qc.invalidateQueries({ queryKey: ['/products'] });
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); if (file.current) file.current.value = ''; }
  };
  return (
    <>
      <PageHeader title="Products" description="Your catalogue: prices, tax, barcodes and stock" actions={<>
        {can('reports.export') && <Button variant="outline" onClick={() => download('/products/export', {}, 'products.csv').catch((e) => toast.error(errorMessage(e)))}><Download className="h-4 w-4" />Export</Button>}
        {can('products.manage') && <><Button variant="outline" onClick={() => setImporting(true)}><Upload className="h-4 w-4" />Import</Button><Link href="/products/new"><Button><Plus className="h-4 w-4" />New product</Button></Link></>}</>} />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Name, SKU, barcode, brand or HSN…" />
          <Select aria-label="Category" value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(1); }} className="w-44"><option value="">All categories</option>{categories.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
          <Select aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="w-32"><option value="">Active</option><option value="inactive">Inactive</option><option value="all">All</option></Select>
        </div>
        <DataTable rows={list.data?.data} loading={list.isLoading} error={list.error ? errorMessage(list.error) : null} onRetry={() => list.refetch()} onRowClick={can('products.manage') ? (r) => router.push(`/products/${r.id}`) : undefined}
          empty={<EmptyState icon={Package} title={q ? 'No products match' : 'No products yet'} description="Add products one by one or import a CSV file." action={can('products.manage') ? <Link href="/products/new"><Button size="sm"><Plus className="h-4 w-4" />New product</Button></Link> : undefined} />}
          columns={[
            { key: 'name', header: 'Product', render: (r) => <div><span className="font-medium">{r.name}</span>{!r.isActive && <Badge className="ml-2">Inactive</Badge>}<p className="text-xs text-muted">{r.variants.length > 1 ? `${r.variants.length} variants` : r.variants[0]?.sku}{r.brand ? ` · ${r.brand}` : ''}</p></div> },
            { key: 'category', header: 'Category', render: (r) => r.category?.name ?? '—' }, { key: 'hsnCode', header: 'HSN' }, { key: 'gstRate', header: 'GST', align: 'right', render: (r) => `${Number(r.gstRate)}%` },
            { key: 'price', header: 'Price', align: 'right', render: (r) => { const p = r.variants.map((v: any) => Number(v.sellingPrice)); const lo = Math.min(...p), hi = Math.max(...p); return lo === hi ? inr(lo) : `${inr(lo)} – ${inr(hi)}`; } },
            { key: 'stock', header: 'Stock', align: 'right', render: (r) => { if (!r.trackInventory || r.type !== 'GOODS') return <span className="text-faint">Not tracked</span>; const s = r.variants.reduce((a: number, v: any) => a + Number(v.stock), 0); const low = r.variants.some((v: any) => Number(v.minStock) > 0 && Number(v.stock) <= Number(v.minStock)); return <span className={low ? 'font-medium text-warn' : ''}>{qty(s)} {r.baseUnit.code}</span>; } },
          ]} />
        {list.data && <Pagination page={page} pageSize={25} total={list.data.total} onPage={setPage} />}
      </Card>
      <Dialog open={importing} onClose={() => setImporting(false)} title="Import products" description="Upload a CSV file. Excel users: Save As → CSV. The whole file is rejected if any row is invalid, so nothing is half-imported."
        footer={<><Button variant="outline" onClick={() => { const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([TEMPLATE], { type: 'text/csv' })), download: 'nexbill-products-template.csv' }); a.click(); }}>Download template</Button><Button loading={busy} onClick={() => file.current?.click()}><Upload className="h-4 w-4" />Choose CSV file</Button></>}>
        <input ref={file} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && runImport(e.target.files[0])} />
        <p className="text-sm text-muted">Columns: <code className="text-xs">name, sku, barcode, category, unit, hsnCode, gstRate, purchasePrice, sellingPrice, mrp, openingStock</code>. Only <b>name</b> and <b>sellingPrice</b> are required. Products whose name already exists are skipped; new categories are created automatically. Up to 2,000 rows per file.</p>
      </Dialog>
    </>
  );
}
