'use client';
import { useQueryClient } from '@tanstack/react-query';
import { PERMISSIONS } from '@nexbill/shared';
import { roleSchema, staffCreateSchema, staffUpdateSchema } from '@nexbill/validation';
import { Plus, ShieldCheck, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { FormDialog } from '@/components/form-dialog';
import { PageHeader } from '@/components/page';
import { Badge, Button, Card, CardHeader, DataTable, Dialog, Field, Input, StatusBadge, Tabs } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useGet, useList, useMe } from '@/lib/hooks';
import { fmtDateTime } from '@/lib/utils';

const GROUPS = [...new Set(Object.keys(PERMISSIONS).map((p) => p.split('.')[0]!))];

export default function StaffPage() {
  const qc = useQueryClient(), me = useMe();
  const [tab, setTab] = useState<'team' | 'roles' | 'audit'>('team'), [adding, setAdding] = useState(false), [editing, setEditing] = useState<any | null>(null), [role, setRole] = useState<any | null | 'new'>(null), [page] = useState(1);
  const staff = useList('/staff', { pageSize: 100 }), roles = useGet<any[]>('/roles'), branches = useGet<any[]>('/branches');
  const audit = useList('/audit-logs', { page, pageSize: 50 }, tab === 'audit' && !!me.data?.permissions.includes('audit.view'));
  const roleOpts = (roles.data ?? []).filter((r) => r.systemKey !== 'OWNER').map((r) => ({ value: r.id, label: r.name }));
  const branchOpts = (branches.data ?? []).map((b) => ({ value: b.id, label: b.name }));
  const refresh = async () => { await qc.invalidateQueries({ queryKey: ['/staff'] }); await qc.invalidateQueries({ queryKey: ['/roles'] }); };
  return (
    <>
      <PageHeader title="Staff & Permissions" description="Who can sign in and exactly what each role is allowed to do. Permissions are enforced on the server for every request."
        actions={tab === 'roles' ? <Button onClick={() => setRole('new')}><Plus className="h-4 w-4" />Custom role</Button> : <Button onClick={() => setAdding(true)}><UserPlus className="h-4 w-4" />Add team member</Button>} />
      <Card>
        <div className="px-3 pt-1"><Tabs value={tab} onChange={setTab} tabs={[{ id: 'team', label: 'Team' }, { id: 'roles', label: 'Roles' }, ...(me.data?.permissions.includes('audit.view') ? [{ id: 'audit' as const, label: 'Audit log' }] : [])]} /></div>
        {tab === 'team' && <DataTable rows={staff.data?.data} loading={staff.isLoading} error={staff.error ? errorMessage(staff.error) : null}
          columns={[{ key: 'name', header: 'Name', render: (r) => <div><span className="font-medium">{r.user.name}</span>{r.user.id === me.data?.user.id && <Badge tone="brand" className="ml-2">You</Badge>}<p className="text-xs text-muted">{r.user.email}</p></div> }, { key: 'role', header: 'Role', render: (r) => r.role.name },
            { key: 'branches', header: 'Branches', render: (r) => (r.branchIds.length ? r.branchIds.map((id: string) => branches.data?.find((b) => b.id === id)?.name ?? '?').join(', ') : 'All branches') },
            { key: 'isActive', header: 'Access', render: (r) => <StatusBadge status={r.isActive ? 'ACTIVE' : 'INACTIVE'} /> },
            { key: '_a', header: '', align: 'right', render: (r) => (r.role.systemKey !== 'OWNER' && r.user.id !== me.data?.user.id ? <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>Change</Button> : null) }]} />}
        {tab === 'roles' && <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">{roles.data?.map((r) => (
          <button key={r.id} onClick={() => setRole(r)} className="rounded-lg border p-4 text-left transition-colors hover:border-brand">
            <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-brand" />{r.name}</span><Badge>{r.systemKey ? 'Built-in' : 'Custom'}</Badge></div>
            <p className="mt-2 text-xs text-muted">{r.permissions.length} of {Object.keys(PERMISSIONS).length} permissions</p>
            <p className="mt-1 line-clamp-2 text-xs text-faint">{r.permissions.slice(0, 6).map((p: string) => PERMISSIONS[p as keyof typeof PERMISSIONS]).join(' · ')}{r.permissions.length > 6 ? ' …' : ''}</p></button>))}</div>}
        {tab === 'audit' && <DataTable rows={audit.data?.data} loading={audit.isLoading} error={audit.error ? errorMessage(audit.error) : null}
          columns={[{ key: 'createdAt', header: 'When', render: (r) => <span className="whitespace-nowrap text-xs">{fmtDateTime(r.createdAt)}</span> }, { key: 'userName', header: 'Who' }, { key: 'action', header: 'Action', render: (r) => <code className="text-xs">{r.action}</code> }, { key: 'summary', header: 'Details', render: (r) => <span className="text-xs text-muted">{r.summary ?? `${r.entity} ${r.entityId?.slice(0, 8) ?? ''}`}</span> }]} />}
      </Card>
      <FormDialog open={adding} onClose={() => setAdding(false)} title="Add team member" description="They sign in with this email and password. Share the password with them securely and ask them to change it." schema={staffCreateSchema} defaults={{ branchIds: [] }}
        fields={[{ name: 'name', label: 'Name', required: true }, { name: 'email', label: 'Email', type: 'email', required: true }, { name: 'password', label: 'Temporary password', type: 'password', required: true, hint: 'At least 8 characters with letters and numbers' }, { name: 'roleId', label: 'Role', type: 'select', options: roleOpts, required: true },
          { name: 'branchIds', label: 'Limit to branches (none selected = all branches)', type: 'multiselect', options: branchOpts }]}
        onSubmit={async (v) => { await api('/staff', { body: v }); toast.success('Team member added'); await refresh(); }} />
      <FormDialog open={!!editing} onClose={() => setEditing(null)} title={`Change access – ${editing?.user.name ?? ''}`} schema={staffUpdateSchema} defaults={{ roleId: editing?.roleId, branchIds: editing?.branchIds ?? [], isActive: editing?.isActive }}
        fields={[{ name: 'roleId', label: 'Role', type: 'select', options: roleOpts, wide: true }, { name: 'branchIds', label: 'Limit to branches (none = all)', type: 'multiselect', options: branchOpts }, { name: 'isActive', label: 'Can sign in', type: 'checkbox' }]}
        onSubmit={async (v) => { await api(`/staff/${editing.id}`, { method: 'PATCH', body: v }); toast.success('Access updated'); await refresh(); }} />
      {role && <RoleDialog role={role === 'new' ? null : role} onClose={() => setRole(null)} onDone={refresh} />}
    </>
  );
}

function RoleDialog({ role, onClose, onDone }: { role: any | null; onClose: () => void; onDone: () => Promise<void> }) {
  const readOnly = !!role?.systemKey;
  const [name, setName] = useState(role?.name ?? ''), [perms, setPerms] = useState<string[]>(role?.permissions ?? []), [busy, setBusy] = useState(false);
  const toggle = (p: string) => setPerms((s) => (s.includes(p) ? s.filter((x) => x !== p) : [...s, p]));
  const save = async () => {
    const parsed = roleSchema.safeParse({ name, permissions: perms });
    if (!parsed.success) return toast.error(parsed.error.issues[0]?.message ?? 'Check the role');
    setBusy(true);
    try { await api(role ? `/roles/${role.id}` : '/roles', { method: role ? 'PUT' : 'POST', body: parsed.data }); toast.success('Role saved'); await onDone(); onClose(); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} size="xl" title={role ? role.name : 'New custom role'} description={readOnly ? 'Built-in roles cannot be edited. Create a custom role to change permissions.' : 'Tick exactly what people with this role may do.'}
      footer={readOnly ? <Button variant="outline" onClick={onClose}>Close</Button> : <><Button variant="outline" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={save}>Save role</Button></>}>
      {!readOnly && <Field label="Role name" className="mb-4 max-w-xs"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Senior cashier" /></Field>}
      <div className="grid max-h-[55vh] gap-x-6 gap-y-4 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">{GROUPS.map((g) => (
        <fieldset key={g}><legend className="mb-1 text-2xs font-semibold uppercase tracking-wider text-faint">{g}</legend>
          {Object.entries(PERMISSIONS).filter(([k]) => k.startsWith(`${g}.`)).map(([k, label]) => <label key={k} className="flex items-center gap-2 py-0.5 text-sm"><input type="checkbox" disabled={readOnly} checked={perms.includes(k)} onChange={() => toggle(k)} />{label}</label>)}</fieldset>))}</div>
    </Dialog>
  );
}
