'use client';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { Feature, Permission } from '@nexbill/shared';
import { useEffect, useState } from 'react';
import { api } from './api';
import { useSession } from './store';

export interface Me {
  user: { id: string; name: string; email: string; emailVerifiedAt: string | null; isPlatformAdmin: boolean };
  tenantId: string; businessId: string; permissions: string[]; roleKey: string | null;
  tenants: Array<{ id: string; name: string; role: string }>;
  subscription: { plan: string; status: string; trialEndsAt: string | null; currentPeriodEnd: string; features: Feature[] } | null;
  businesses: Array<Record<string, any>>; branches: Array<{ id: string; name: string; isDefault: boolean }>; warehouses: Array<{ id: string; name: string; branchId: string; isDefault: boolean }>;
}
export function useMe() {
  const token = useSession((s) => s.token), businessId = useSession((s) => s.businessId);
  return useQuery({ queryKey: ['me', businessId], queryFn: () => api<Me>('/auth/me'), enabled: !!token, staleTime: 60000 });
}
export function useCan(): (p: Permission) => boolean {
  const { data } = useMe();
  return (p) => !!data?.permissions.includes(p);
}
export function useBusiness() {
  const { data } = useMe();
  return data?.businesses.find((b) => b.id === data.businessId);
}
/** Active branch + warehouse for transactions, defaulting to the business defaults. */
export function useLocation() {
  const { data } = useMe();
  const { branchId, warehouseId, set } = useSession();
  const branch = data?.branches.find((b) => b.id === branchId) ?? data?.branches[0];
  const candidates = data?.warehouses.filter((w) => w.branchId === branch?.id) ?? [];
  const warehouse = candidates.find((w) => w.id === warehouseId) ?? candidates[0];
  useEffect(() => { if (branch && warehouse && (branch.id !== branchId || warehouse.id !== warehouseId)) set({ branchId: branch.id, warehouseId: warehouse.id }); }, [branch, warehouse, branchId, warehouseId, set]);
  return { branch, warehouse, branches: data?.branches ?? [], warehouses: candidates };
}
export interface Paged<T> { data: T[]; total: number; page: number; pageSize: number; [k: string]: unknown }
export function useList<T = Record<string, any>>(path: string, query: Record<string, unknown> = {}, enabled = true) {
  const businessId = useSession((s) => s.businessId);
  return useQuery({ queryKey: [path, businessId, query], queryFn: () => api<Paged<T>>(path, { query }), placeholderData: keepPreviousData, enabled });
}
export function useGet<T = any>(path: string | null, query: Record<string, unknown> = {}) {
  const businessId = useSession((s) => s.businessId);
  return useQuery({ queryKey: [path, businessId, query], queryFn: () => api<T>(path!, { query }), enabled: !!path });
}
export function useDebounced<T>(value: T, ms = 200): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update(); window.addEventListener('online', update); window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  return online;
}
