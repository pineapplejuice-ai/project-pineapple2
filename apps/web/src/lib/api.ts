'use client';
import { useSession } from './store';

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string, public errors?: Array<{ path: string; message: string }>, public body?: Record<string, unknown>) { super(message); }
}
/** Thrown when the request never reached the server (offline / DNS / timeout). */
export class NetworkError extends Error {}

let refreshing: Promise<string | null> | null = null;
export function refreshAccessToken(): Promise<string | null> {
  refreshing ??= fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include', headers: { 'x-nexbill-csrf': '1', 'content-type': 'application/json' }, body: '{}' })
    .then(async (r) => (r.ok ? ((await r.json()) as { accessToken: string }).accessToken : null))
    .catch(() => null)
    .then((t) => { useSession.getState().set({ token: t }); return t; })
    .finally(() => { refreshing = null; });
  return refreshing;
}

export interface ApiOptions { method?: string; body?: unknown; query?: Record<string, unknown>; raw?: boolean }
export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const qs = opts.query ? '?' + new URLSearchParams(Object.entries(opts.query).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v)])).toString() : '';
  const send = async (token: string | null): Promise<Response> => {
    const { businessId } = useSession.getState();
    try {
      return await fetch(`/api/v1${path}${qs}`, {
        method: opts.method ?? (opts.body === undefined ? 'GET' : 'POST'), credentials: 'include',
        headers: { ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...(businessId ? { 'x-business-id': businessId } : {}), 'x-nexbill-csrf': '1' },
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      });
    } catch { throw new NetworkError('You appear to be offline'); }
  };
  let res = await send(useSession.getState().token);
  if (res.status === 401 && !path.startsWith('/auth/login')) {
    const token = await refreshAccessToken();
    if (token) res = await send(token);
  }
  if (res.status === 502 || res.status === 504) throw new NetworkError('The server is unreachable');
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    throw new ApiError(res.status, (body.message as string) ?? 'Request failed', body.code as string | undefined, body.errors as ApiError['errors'], body);
  }
  if (opts.raw) return (await res.text()) as T;
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export async function download(path: string, query: Record<string, unknown>, filename: string): Promise<void> {
  const text = await api<string>(path, { query, raw: true });
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click(); URL.revokeObjectURL(url);
}
export const errorMessage = (e: unknown): string => {
  if (e instanceof ApiError) return e.errors?.length ? `${e.message}: ${e.errors.map((x) => `${x.path} – ${x.message}`).join('; ')}` : e.message;
  return e instanceof Error ? e.message : 'Something went wrong';
};
