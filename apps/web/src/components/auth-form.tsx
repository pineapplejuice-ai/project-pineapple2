'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useForm, type FieldValues } from 'react-hook-form';
import { toast } from 'sonner';
import type { ZodTypeAny } from 'zod';
import { api, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/store';
import { clean, type FieldDef } from './form-dialog';
import { Button, Field, Input, Select } from './ui';

export function AuthForm({ title, subtitle, schema, fields, endpoint, submitLabel, footer, defaults, onDone }: {
  title: string; subtitle: string; schema: ZodTypeAny; fields: FieldDef[]; endpoint: string; submitLabel: string; footer?: React.ReactNode; defaults?: FieldValues;
  onDone?: (res: any, router: ReturnType<typeof useRouter>) => void;
}) {
  const router = useRouter();
  const resolver = zodResolver(schema);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FieldValues>({ resolver: (v, c, o) => resolver(clean(v), c, o), defaultValues: defaults });
  const submit = handleSubmit(async (values) => {
    try {
      const res = await api<{ accessToken?: string; message?: string }>(endpoint, { body: values });
      if (res.accessToken) useSession.getState().set({ token: res.accessToken, businessId: null, branchId: null, warehouseId: null });
      if (res.message) toast.success(res.message);
      onDone?.(res, router);
    } catch (e) { toast.error(errorMessage(e)); }
  });
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-1 text-sm text-muted">{subtitle}</p>
      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        {fields.map((f) => (
          <Field key={f.name} label={f.label} hint={f.hint} error={(errors[f.name] as { message?: string } | undefined)?.message}>
            {f.type === 'select' ? <Select {...register(f.name)}>{f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>
              : <Input type={f.type ?? 'text'} placeholder={f.placeholder} autoComplete={f.type === 'password' ? (endpoint.includes('login') ? 'current-password' : 'new-password') : f.type === 'email' ? 'email' : undefined} {...register(f.name)} />}
          </Field>
        ))}
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>{submitLabel}</Button>
      </form>
      {footer && <div className="mt-5 text-center text-sm text-muted">{footer}</div>}
    </div>
  );
}
