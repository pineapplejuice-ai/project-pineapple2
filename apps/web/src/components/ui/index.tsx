'use client';
import { ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';

/* Small, dependency-free primitives in the shadcn/ui style (variants via class maps, forwardRef, composable). */

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'; size?: 'sm' | 'md' | 'lg' | 'icon'; loading?: boolean };
const variants = {
  primary: 'bg-brand text-brand-fg hover:opacity-90 shadow-sm', secondary: 'bg-ink/5 text-ink hover:bg-ink/10',
  outline: 'border bg-surface text-ink hover:bg-ink/5', ghost: 'text-muted hover:bg-ink/5 hover:text-ink', danger: 'bg-bad text-white hover:opacity-90',
};
const sizes = { sm: 'h-8 px-2.5 text-xs gap-1.5', md: 'h-9 px-3.5 text-sm gap-2', lg: 'h-11 px-5 text-base gap-2', icon: 'h-9 w-9' };
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant = 'primary', size = 'md', loading, disabled, children, type = 'button', ...p }, ref) => (
  <button ref={ref} type={type} disabled={disabled || loading} className={cn('inline-flex items-center justify-center rounded-md font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap', variants[variant], sizes[size], className)} {...p}>
    {loading && <Loader2 className="h-4 w-4 animate-spin" />}{children}
  </button>
));
Button.displayName = 'Button';

const field = 'h-9 w-full rounded-md border bg-surface px-3 text-sm text-ink placeholder:text-faint transition-colors focus-visible:border-brand disabled:opacity-60';
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => <input ref={ref} className={cn(field, className)} {...p} />);
Input.displayName = 'Input';
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...p }, ref) => <select ref={ref} className={cn(field, 'pr-8', className)} {...p}>{children}</select>);
Select.displayName = 'Select';
export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => <textarea ref={ref} className={cn(field, 'h-auto min-h-[72px] py-2', className)} {...p} />);
Textarea.displayName = 'Textarea';

export function Field({ label, error, hint, children, className, required }: { label?: string; error?: string; hint?: string; children: React.ReactNode; className?: string; required?: boolean }) {
  return (
    <label className={cn('block space-y-1.5', className)}>
      {label && <span className="text-xs font-medium text-muted">{label}{required && <span className="text-bad"> *</span>}</span>}
      {children}
      {error ? <span role="alert" className="block text-xs text-bad">{error}</span> : hint ? <span className="block text-xs text-faint">{hint}</span> : null}
    </label>
  );
}

export const Card = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn('rounded-lg border bg-surface shadow-card', className)} {...p} />;
export const CardHeader = ({ title, description, action, className }: { title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; className?: string }) => (
  <div className={cn('flex items-start justify-between gap-3 border-b px-4 py-3', className)}>
    <div><h3 className="text-sm font-semibold">{title}</h3>{description && <p className="mt-0.5 text-xs text-muted">{description}</p>}</div>{action}
  </div>
);

const tones = { neutral: 'bg-ink/5 text-muted', ok: 'bg-ok/10 text-ok', warn: 'bg-warn/10 text-warn', bad: 'bg-bad/10 text-bad', brand: 'bg-brand-soft text-brand' };
export type Tone = keyof typeof tones;
export const Badge = ({ tone = 'neutral', className, ...p }: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) =>
  <span className={cn('inline-flex items-center rounded px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wide', tones[tone], className)} {...p} />;
const statusTone: Record<string, Tone> = { PAID: 'ok', ISSUED: 'ok', COMPLETED: 'ok', RECEIVED: 'ok', ACTIVE: 'ok', PARTIAL: 'warn', PARTIALLY_RECEIVED: 'warn', PENDING: 'warn', TRIALING: 'brand', ORDERED: 'brand', DRAFT: 'neutral', UNPAID: 'bad', CANCELLED: 'bad', REJECTED: 'bad', EXPIRED: 'bad', PAST_DUE: 'bad' };
export const StatusBadge = ({ status }: { status?: string | null }) => <Badge tone={statusTone[status ?? ''] ?? 'neutral'}>{(status ?? '—').replace(/_/g, ' ')}</Badge>;

export const Spinner = ({ className }: { className?: string }) => <Loader2 className={cn('h-5 w-5 animate-spin text-faint', className)} />;
export const Skeleton = ({ className }: { className?: string }) => <div className={cn('animate-pulse rounded bg-ink/10', className)} />;

export function EmptyState({ icon: Icon, title, description, action }: { icon?: React.ComponentType<{ className?: string }>; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {Icon && <div className="mb-3 rounded-full bg-ink/5 p-3"><Icon className="h-5 w-5 text-faint" /></div>}
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
export const ErrorState = ({ message, onRetry }: { message: string; onRetry?: () => void }) => (
  <div role="alert" className="flex flex-col items-center px-6 py-12 text-center">
    <p className="text-sm font-medium text-bad">Could not load this</p><p className="mt-1 text-xs text-muted">{message}</p>
    {onRetry && <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>Try again</Button>}
  </div>
);

export function Dialog({ open, onClose, title, description, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title: string; description?: string; children: React.ReactNode; footer?: React.ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', onKey, true);
    const prev = document.activeElement as HTMLElement | null;
    setTimeout(() => (ref.current?.querySelector<HTMLElement>('[data-autofocus], input:not([type=hidden]), select, textarea') ?? ref.current)?.focus(), 0);
    return () => { document.removeEventListener('keydown', onKey, true); prev?.focus?.(); };
  }, [open, onClose]);
  if (!open) return null;
  const w = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }[size];
  return (
    <div className="no-print fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-[8vh] backdrop-blur-[1px]" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className={cn('w-full rounded-xl border bg-raised shadow-pop outline-none', w)}>
        <div className="flex items-start justify-between gap-4 border-b px-5 py-3.5">
          <div><h2 className="text-base font-semibold">{title}</h2>{description && <p className="mt-0.5 text-xs text-muted">{description}</p>}</div>
          <button aria-label="Close" onClick={onClose} className="rounded p-1 text-faint hover:bg-ink/5 hover:text-ink"><X className="h-4 w-4" /></button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirm', danger, loading }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; message: React.ReactNode; confirmLabel?: string; danger?: boolean; loading?: boolean }) {
  return (
    <Dialog open={open} onClose={onClose} title={title} size="sm" footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant={danger ? 'danger' : 'primary'} loading={loading} onClick={onConfirm} data-autofocus>{confirmLabel}</Button></>}>
      <div className="text-sm text-muted">{message}</div>
    </Dialog>
  );
}

export interface Column<T> { key: string; header: string; align?: 'left' | 'right' | 'center'; className?: string; render?: (row: T) => React.ReactNode }
export function DataTable<T extends Record<string, any>>({ columns, rows, loading, error, onRetry, empty, onRowClick, rowKey = 'id' }: { columns: Column<T>[]; rows?: T[]; loading?: boolean; error?: string | null; onRetry?: () => void; empty?: React.ReactNode; onRowClick?: (row: T) => void; rowKey?: string }) {
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="border-b bg-ink/[0.025] text-left">
          {columns.map((c) => <th key={c.key} scope="col" className={cn('whitespace-nowrap px-4 py-2.5 text-2xs font-semibold uppercase tracking-wider text-faint', c.align === 'right' && 'text-right', c.align === 'center' && 'text-center')}>{c.header}</th>)}
        </tr></thead>
        <tbody>
          {loading && !rows?.length ? Array.from({ length: 6 }, (_, i) => <tr key={i} className="border-b last:border-0">{columns.map((c) => <td key={c.key} className="px-4 py-3"><Skeleton className="h-4 w-full max-w-[140px]" /></td>)}</tr>)
            : rows?.map((row, i) => (
              <tr key={String(row[rowKey] ?? i)} onClick={onRowClick ? () => onRowClick(row) : undefined} className={cn('border-b last:border-0 transition-colors', onRowClick && 'cursor-pointer hover:bg-ink/[0.03]')}>
                {columns.map((c) => <td key={c.key} className={cn('px-4 py-2.5 align-middle', c.align === 'right' && 'text-right num', c.align === 'center' && 'text-center', c.className)}>{c.render ? c.render(row) : (row[c.key] as React.ReactNode) ?? '—'}</td>)}
              </tr>
            ))}
        </tbody>
      </table>
      {!loading && rows?.length === 0 && (empty ?? <EmptyState title="Nothing here yet" />)}
    </div>
  );
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return total ? <div className="border-t px-4 py-2.5 text-xs text-faint">{total} {total === 1 ? 'record' : 'records'}</div> : null;
  return (
    <div className="flex items-center justify-between border-t px-4 py-2 text-xs text-muted">
      <span>{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}</span>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
        <span className="num px-1">Page {page} / {pages}</span>
        <Button variant="ghost" size="icon" aria-label="Next page" disabled={page >= pages} onClick={() => onPage(page + 1)}><ChevronRight className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: Array<{ id: T; label: string }>; value: T; onChange: (v: T) => void }) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto border-b">
      {tabs.map((t) => <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)} className={cn('-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors', value === t.id ? 'border-brand text-ink' : 'border-transparent text-muted hover:text-ink')}>{t.label}</button>)}
    </div>
  );
}
export const Kbd = ({ children }: { children: React.ReactNode }) => <kbd className="rounded border bg-ink/5 px-1 py-0.5 font-mono text-2xs text-muted">{children}</kbd>;
