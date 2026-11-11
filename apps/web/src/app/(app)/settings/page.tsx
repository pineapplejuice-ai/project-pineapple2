'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { BusinessInfoFields, GstFields, IndustryFields, InvoiceFields } from '@/components/business-fields';
import { PageHeader } from '@/components/page';
import { Button, Card, CardHeader, DataTable, Spinner, Tabs } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useGet } from '@/lib/hooks';
import { useBusinessForm } from '@/lib/use-business-form';
import { fmtDateTime } from '@/lib/utils';

export default function SettingsPage() {
  const f = useBusinessForm();
  const [tab, setTab] = useState<'business' | 'tax' | 'invoice' | 'industry' | 'security'>('business');
  const sessions = useGet<any[]>(tab === 'security' ? '/auth/sessions' : null);
  if (!f.ready) return <div className="flex justify-center py-20"><Spinner /></div>;
  const p = { v: f.v, set: f.set, errors: f.errors };
  const save = async () => { if (await f.save()) toast.success('Settings saved'); };
  return (
    <>
      <PageHeader title="Settings" description="Business profile, tax, invoice format and security" actions={tab !== 'security' && <Button loading={f.busy} onClick={save}>Save changes</Button>} />
      <Card>
        <div className="px-3 pt-1"><Tabs value={tab} onChange={setTab} tabs={[{ id: 'business', label: 'Business profile' }, { id: 'tax', label: 'GST & tax' }, { id: 'invoice', label: 'Invoices & printing' }, { id: 'industry', label: 'Industry profile' }, { id: 'security', label: 'Security' }]} /></div>
        <div className="max-w-3xl p-5">
          {tab === 'business' && <BusinessInfoFields {...p} />}
          {tab === 'tax' && <GstFields {...p} />}
          {tab === 'invoice' && <InvoiceFields {...p} />}
          {tab === 'industry' && <><p className="mb-3 text-sm text-muted">The industry profile adds optional product attributes (for example steel dimensions or flavours). Billing works the same for every industry, and you can switch at any time.</p><IndustryFields {...p} /></>}
          {tab === 'security' && (
            <div className="-m-5"><CardHeader title="Signed-in devices" description="Sign out a device you no longer use. Changing your password signs out every device." />
              <DataTable rows={sessions.data} loading={sessions.isLoading} columns={[{ key: 'userAgent', header: 'Device', render: (r) => <span className="text-xs">{r.userAgent?.slice(0, 70) ?? 'Unknown'}{r.current && <b className="ml-2 text-brand">This device</b>}</span> }, { key: 'ip', header: 'IP' }, { key: 'lastUsedAt', header: 'Last active', render: (r) => fmtDateTime(r.lastUsedAt) },
                { key: '_a', header: '', align: 'right', render: (r) => (r.current ? null : <Button size="sm" variant="ghost" onClick={async () => { try { await api(`/auth/sessions/${r.id}`, { method: 'DELETE' }); toast.success('Device signed out'); sessions.refetch(); } catch (e) { toast.error(errorMessage(e)); } }}>Sign out</Button>) }]} /></div>
          )}
        </div>
      </Card>
    </>
  );
}
