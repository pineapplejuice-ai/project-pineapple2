'use client';
import { useQueryClient } from '@tanstack/react-query';
import { businessUpdateSchema } from '@nexbill/validation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api, errorMessage } from './api';
import { useBusiness } from './hooks';

const KEYS = ['name', 'ownerName', 'phone', 'email', 'addressLine1', 'city', 'pincode', 'stateCode', 'pan', 'industry', 'gstRegistered', 'gstin', 'pricesIncludeTax', 'invoicePrefix', 'fyStartMonth', 'invoiceTemplate', 'logoUrl', 'invoiceTerms', 'roundOffInvoices', 'allowNegativeStock'];

export function useBusinessForm() {
  const business = useBusiness(), qc = useQueryClient();
  const [v, setV] = useState<Record<string, any>>({}), [errors, setErrors] = useState<Record<string, string>>({}), [busy, setBusy] = useState(false);
  useEffect(() => { if (business) setV(Object.fromEntries(KEYS.map((k) => [k, business[k] ?? '']))); }, [business?.id, business?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: string, val: unknown) => setV((s) => ({ ...s, [k]: val }));
  /** Saves the given keys (or everything). Returns true on success. */
  const save = async (keys: string[] = KEYS, extra: Record<string, unknown> = {}): Promise<boolean> => {
    const parsed = businessUpdateSchema.safeParse({ ...Object.fromEntries(keys.map((k) => [k, v[k]])), ...extra });
    if (!parsed.success) { setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message]))); toast.error(parsed.error.issues[0]?.message ?? 'Check the form'); return false; }
    setErrors({}); setBusy(true);
    try { await api('/business', { method: 'PATCH', body: parsed.data }); await qc.invalidateQueries({ queryKey: ['me'] }); return true; }
    catch (e) { toast.error(errorMessage(e)); return false; } finally { setBusy(false); }
  };
  return { ready: !!business && !!v.name, business, v, set, errors, busy, save };
}
