'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm, type FieldValues } from 'react-hook-form';
import { toast } from 'sonner';
import type { ZodTypeAny } from 'zod';
import { ApiError, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button, Dialog, Field, Input, Select, Textarea } from './ui';

export interface FieldDef {
  name: string; label: string; type?: 'text' | 'number' | 'int' | 'select' | 'checkbox' | 'textarea' | 'date' | 'password' | 'email' | 'multiselect';
  options?: Array<{ value: string; label: string }>; placeholder?: string; hint?: string; required?: boolean; wide?: boolean; uppercase?: boolean;
}
/** Empty strings from untouched inputs mean "not provided"; the shared Zod schemas then apply their defaults. */
export const clean = (v: FieldValues): FieldValues => Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x === '' || (typeof x === 'number' && Number.isNaN(x)) ? undefined : x]));

/** Schema-driven dialog form: the same Zod schema validates here and on the server. */
export function FormDialog({ open, onClose, title, description, schema, fields, defaults, onSubmit, submitLabel = 'Save', size = 'md' }: {
  open: boolean; onClose: () => void; title: string; description?: string; schema: ZodTypeAny; fields: FieldDef[]; defaults?: FieldValues;
  onSubmit: (values: any) => Promise<unknown>; submitLabel?: string; size?: 'md' | 'lg';
}) {
  const resolver = zodResolver(schema);
  const form = useForm<FieldValues>({ resolver: (v, c, o) => resolver(clean(v), c, o), defaultValues: defaults });
  const { register, handleSubmit, reset, setError, formState: { errors, isSubmitting } } = form;
  useEffect(() => { if (open) reset(defaults ?? {}); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const submit = handleSubmit(async (values) => {
    try { await onSubmit(values); onClose(); }
    catch (e) {
      if (e instanceof ApiError && e.errors?.length) e.errors.forEach((x) => setError(x.path.split('.')[0] ?? 'root', { message: x.message }));
      toast.error(errorMessage(e));
    }
  });
  const rootError = (errors as Record<string, { message?: string }>)['']?.message ?? errors.root?.message;
  return (
    <Dialog open={open} onClose={onClose} title={title} description={description} size={size}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button loading={isSubmitting} onClick={submit}>{submitLabel}</Button></>}>
      <form onSubmit={submit} className="grid grid-cols-2 gap-x-4 gap-y-3.5" noValidate>
        {fields.map((f) => {
          const err = (errors[f.name] as { message?: string } | undefined)?.message;
          const wide = f.wide || f.type === 'textarea' || f.type === 'multiselect';
          if (f.type === 'checkbox') return (
            <label key={f.name} className={cn('flex items-center gap-2 text-sm', wide ? 'col-span-2' : 'col-span-2 sm:col-span-1')}>
              <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--brand))]" {...register(f.name)} />{f.label}
            </label>
          );
          return (
            <Field key={f.name} label={f.label} error={err} hint={f.hint} required={f.required} className={wide ? 'col-span-2' : 'col-span-2 sm:col-span-1'}>
              {f.type === 'select' ? <Select {...register(f.name)}><option value="">Select…</option>{f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>
                : f.type === 'multiselect' ? <select multiple className="min-h-[96px] w-full rounded-md border bg-surface p-1 text-sm" {...register(f.name)}>{f.options?.map((o) => <option key={o.value} value={o.value} className="rounded px-2 py-1">{o.label}</option>)}</select>
                : f.type === 'textarea' ? <Textarea placeholder={f.placeholder} {...register(f.name)} />
                : <Input type={f.type === 'int' || f.type === 'number' ? 'number' : f.type ?? 'text'} step={f.type === 'number' ? 'any' : undefined} inputMode={f.type === 'number' ? 'decimal' : undefined}
                    placeholder={f.placeholder} className={f.uppercase ? 'uppercase' : undefined} {...register(f.name, f.type === 'int' ? { valueAsNumber: true } : {})} />}
            </Field>
          );
        })}
        {rootError && <p role="alert" className="col-span-2 text-xs text-bad">{rootError}</p>}
        <button type="submit" className="hidden" />
      </form>
    </Dialog>
  );
}
