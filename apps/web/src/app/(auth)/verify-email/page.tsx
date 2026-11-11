'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { Spinner } from '@/components/ui';

function Inner() {
  const token = useSearchParams().get('token');
  const [state, setState] = useState<{ ok?: boolean; message?: string }>({});
  useEffect(() => {
    if (!token) return setState({ ok: false, message: 'This link is missing its token.' });
    api('/auth/verify-email', { body: { token } }).then(() => setState({ ok: true, message: 'Your email is verified.' })).catch((e) => setState({ ok: false, message: errorMessage(e) }));
  }, [token]);
  return (
    <div className="text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Email verification</h1>
      <div className="mt-4 flex justify-center text-sm text-muted">{state.message ?? <Spinner />}</div>
      <Link href="/dashboard" className="mt-6 inline-block text-sm font-medium text-brand hover:underline">Continue to NEXBILL</Link>
    </div>
  );
}
export default function VerifyPage() { return <Suspense><Inner /></Suspense>; }
