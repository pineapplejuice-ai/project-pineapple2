'use client';
import { useState } from 'react';
import { useDebounced, useGet, useLocation } from '@/lib/hooks';
import type { Sellable } from '@/lib/pos-store';
import { cn, inr, qty } from '@/lib/utils';
import { Input } from './ui';

/** Type-ahead product search used wherever a document needs line items. */
export function VariantPicker({ onPick, placeholder = 'Search product by name, SKU or barcode…', autoFocus }: { onPick: (v: Sellable & { purchasePrice?: string | null }) => void; placeholder?: string; autoFocus?: boolean }) {
  const [q, setQ] = useState(''), [active, setActive] = useState(0);
  const dq = useDebounced(q.trim(), 150), loc = useLocation();
  const { data } = useGet<Array<Sellable & { purchasePrice?: string | null }>>(dq ? '/catalog/sellable' : null, { q: dq, warehouseId: loc.warehouse?.id, limit: 8 });
  const pick = (v: Sellable) => { onPick(v); setQ(''); setActive(0); };
  return (
    <div className="relative">
      <Input autoFocus={autoFocus} value={q} onChange={(e) => { setQ(e.target.value); setActive(0); }} placeholder={placeholder} aria-label="Add product"
        onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, (data?.length ?? 1) - 1)); } else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); } else if (e.key === 'Enter' && data?.[active]) { e.preventDefault(); pick(data[active]!); } else if (e.key === 'Escape') setQ(''); }} />
      {dq && data && (
        <ul className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border bg-raised shadow-pop">
          {data.map((v, i) => <li key={v.variantId} onMouseDown={(e) => { e.preventDefault(); pick(v); }} onMouseEnter={() => setActive(i)} className={cn('flex cursor-pointer items-center justify-between px-3 py-1.5 text-sm', i === active && 'bg-brand-soft')}>
            <span>{v.name} <span className="text-xs text-faint">{v.sku}</span></span><span className="num text-xs text-muted">{qty(v.stock)} {v.baseUnit.code} · {inr(v.sellingPrice)}</span></li>)}
          {!data.length && <li className="px-3 py-3 text-center text-sm text-muted">No matching product</li>}
        </ul>
      )}
    </div>
  );
}
