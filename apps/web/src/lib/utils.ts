import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { formatINR } from '@nexbill/shared';

export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs));
export const inr = (v: unknown): string => formatINR(v == null || v === '' ? 0 : (v as string));
export const qty = (v: unknown): string => { const n = Number(v ?? 0); return Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/0+$/, '').replace(/\.$/, ''); };
export const fmtDate = (v: unknown): string => (v ? new Date(v as string).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
export const fmtDateTime = (v: unknown): string => (v ? new Date(v as string).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
export const today = (): string => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
export const daysAgo = (n: number): string => new Date(Date.now() + 5.5 * 3600000 - n * 86400000).toISOString().slice(0, 10);
export const uid = (): string => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
