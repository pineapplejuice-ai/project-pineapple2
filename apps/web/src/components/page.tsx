'use client';
import { useQueryClient } from '@tanstack/react-query';
import type { Permission } from '@nexbill/shared';
import { ChevronRight, Pencil, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import type { ZodTypeAny } from 'zod';
import { api, errorMessage } from '@/lib/api';
import { useCan, useDebounced, useList } from '@/lib/hooks';
import { FormDialog, type FieldDef } from './form-dialog';
import { Button, Card, DataTable, EmptyState, Input, Pagination, type Column } from './ui';

export function PageHeader({ title, description, crumbs = [], actions }: { title: string; description?: string; crumbs?: Array<{ label: string; href?: string }>; actions?: React.ReactNode }) {
  return (
    <div className="no-print mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <nav aria-label="Breadcrumb" className="mb-1 flex items-center gap-1 text-xs text-faint">
          <Link href="/dashboard" className="hover:text-ink">Home</Link>
          {[...crumbs, { label: title }].map((c, i) => <span key={i} className="flex items-center gap-1"><ChevronRight className="h-3 w-3" />{'href' in c && c.href ? <Link href={c.href} className="hover:text-ink">{c.label}</Link> : <span className="text-muted">{c.label}</span>}</span>)}
        </nav>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder = 'Search…' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative w-full max-w-xs">
      <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-faint" />
      <Input aria-label={placeholder} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="pl-8" />
    </div>
  );
}

/** List + create/edit dialog for simple master data, driven by a Zod schema and a field list. */
export function ResourcePage<T extends Record<string, any>>({ title, description, path, columns, schema, fields, managePermission, noun, toForm, defaults, crumbs, filters, extraQuery, searchable = true, canEdit = true, paged = true, onRowClick, headerActions, method = 'PUT' }: {
  title: string; description?: string; path: string; columns: Column<T>[]; schema: ZodTypeAny; fields: FieldDef[]; managePermission: Permission; noun: string;
  toForm?: (row: T) => Record<string, unknown>; defaults?: Record<string, unknown>; crumbs?: Array<{ label: string; href?: string }>; filters?: React.ReactNode;
  extraQuery?: Record<string, unknown>; searchable?: boolean; canEdit?: boolean; paged?: boolean; onRowClick?: (row: T) => void; headerActions?: React.ReactNode; method?: 'PUT' | 'PATCH';
}) {
  const can = useCan(), qc = useQueryClient();
  const [q, setQ] = useState(''), [page, setPage] = useState(1);
  const [editing, setEditing] = useState<T | null | 'new'>(null);
  const dq = useDebounced(q);
  const list = useList<T>(path, { q: dq, page, pageSize: 25, ...extraQuery });
  const rows = paged ? list.data?.data : (list.data as unknown as T[] | undefined);
  const manage = can(managePermission);
  const save = async (values: Record<string, unknown>) => {
    if (editing === 'new') await api(path, { body: values });
    else await api(`${path}/${(editing as T).id}`, { method, body: values });
    toast.success(`${noun} saved`);
    await qc.invalidateQueries({ queryKey: [path] });
  };
  const cols: Column<T>[] = manage && canEdit ? [...columns, { key: '_edit', header: '', align: 'right', render: (r) => <Button variant="ghost" size="icon" aria-label={`Edit ${noun}`} onClick={(e) => { e.stopPropagation(); setEditing(r); }}><Pencil className="h-3.5 w-3.5" /></Button> }] : columns;
  return (
    <>
      <PageHeader title={title} description={description} crumbs={crumbs} actions={<>{headerActions}{manage && <Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" />New {noun.toLowerCase()}</Button>}</>} />
      <Card>
        {(searchable || filters) && <div className="flex flex-wrap items-center gap-2 border-b p-3">{searchable && <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder={`Search ${title.toLowerCase()}…`} />}{filters}</div>}
        <DataTable columns={cols} rows={rows} loading={list.isLoading} error={list.error ? errorMessage(list.error) : null} onRetry={() => list.refetch()} onRowClick={onRowClick}
          empty={<EmptyState title={dq ? 'No matches' : `No ${title.toLowerCase()} yet`} description={dq ? 'Try a different search.' : manage ? `Add your first ${noun.toLowerCase()} to get started.` : undefined}
            action={!dq && manage ? <Button size="sm" onClick={() => setEditing('new')}><Plus className="h-4 w-4" />New {noun.toLowerCase()}</Button> : undefined} />} />
        {paged && list.data && <Pagination page={page} pageSize={25} total={list.data.total} onPage={setPage} />}
      </Card>
      <FormDialog open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? `New ${noun.toLowerCase()}` : `Edit ${noun.toLowerCase()}`} schema={schema} fields={fields}
        defaults={editing && editing !== 'new' ? (toForm ? toForm(editing) : editing) : defaults} onSubmit={save} />
    </>
  );
}
