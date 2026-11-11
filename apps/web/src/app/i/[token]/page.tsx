'use client';
import { Printer } from 'lucide-react';
import { use, useEffect, useState } from 'react';
import { InvoiceDocument } from '@/components/invoice-document';
import { Button, Spinner } from '@/components/ui';

/** Public, read-only invoice behind an unguessable share link (used for WhatsApp / email sharing). */
export default function PublicInvoicePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [state, setState] = useState<{ invoice?: any; error?: boolean }>({});
  useEffect(() => { fetch(`/api/v1/public/invoices/${encodeURIComponent(token)}`).then(async (r) => setState(r.ok ? { invoice: await r.json() } : { error: true })).catch(() => setState({ error: true })); }, [token]);
  if (state.error) return <div className="flex min-h-screen items-center justify-center p-6 text-center text-sm text-muted">This invoice link is not valid.</div>;
  if (!state.invoice) return <div className="flex min-h-screen items-center justify-center"><Spinner /></div>;
  return (
    <div className="min-h-screen bg-bg p-4 sm:p-8">
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] justify-end"><Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" />Print / Save PDF</Button></div>
      <InvoiceDocument invoice={state.invoice} template="A4" />
    </div>
  );
}
