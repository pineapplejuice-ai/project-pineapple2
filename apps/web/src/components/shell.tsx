'use client';
import { useQueryClient } from '@tanstack/react-query';
import type { Permission } from '@nexbill/shared';
import {
  BarChart3, Bell, Boxes, Building2, ChevronsLeft, ChevronsUpDown, CreditCard, FileSpreadsheet, FolderTree, LayoutDashboard, LogOut, Menu, Moon, Package, Plug,
  ReceiptText, RotateCcw, Search, Settings, ShoppingCart, Store, Sun, Truck, Undo2, Users, UserCog, Wallet, Warehouse, WifiOff, Banknote, ScanLine,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { api, refreshAccessToken } from '@/lib/api';
import { useCan, useDebounced, useGet, useLocation, useMe, useOnline } from '@/lib/hooks';
import { useSession } from '@/lib/store';
import { cn, fmtDateTime, inr } from '@/lib/utils';
import { Badge, Button, Dialog, Kbd, Select, Spinner } from './ui';

interface NavItem { href: string; label: string; icon: React.ComponentType<{ className?: string }>; perm: Permission }
const NAV: Array<{ group: string; items: NavItem[] }> = [
  { group: 'Sell', items: [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, perm: 'dashboard.view' }, { href: '/pos', label: 'POS / New Bill', icon: ScanLine, perm: 'sales.create' },
    { href: '/sales', label: 'Sales', icon: ReceiptText, perm: 'sales.view' }, { href: '/sales-returns', label: 'Sales Returns', icon: Undo2, perm: 'sales.view' } ] },
  { group: 'Stock', items: [
    { href: '/products', label: 'Products', icon: Package, perm: 'products.view' }, { href: '/categories', label: 'Categories', icon: FolderTree, perm: 'products.view' },
    { href: '/inventory', label: 'Inventory', icon: Boxes, perm: 'inventory.view' }, { href: '/warehouses', label: 'Warehouses', icon: Warehouse, perm: 'inventory.view' } ] },
  { group: 'Buy', items: [
    { href: '/purchases', label: 'Purchases', icon: ShoppingCart, perm: 'purchases.view' }, { href: '/purchase-returns', label: 'Purchase Returns', icon: RotateCcw, perm: 'purchases.view' } ] },
  { group: 'People & money', items: [
    { href: '/customers', label: 'Customers', icon: Users, perm: 'customers.view' }, { href: '/suppliers', label: 'Suppliers', icon: Truck, perm: 'suppliers.view' },
    { href: '/expenses', label: 'Expenses', icon: Wallet, perm: 'expenses.view' }, { href: '/payments', label: 'Payments', icon: Banknote, perm: 'payments.view' } ] },
  { group: 'Insights', items: [
    { href: '/reports', label: 'Reports', icon: BarChart3, perm: 'reports.view' }, { href: '/gst', label: 'GST Centre', icon: FileSpreadsheet, perm: 'gst.view' } ] },
  { group: 'Admin', items: [
    { href: '/staff', label: 'Staff & Permissions', icon: UserCog, perm: 'staff.manage' }, { href: '/branches', label: 'Branch Management', icon: Store, perm: 'branches.manage' },
    { href: '/integrations', label: 'Integrations', icon: Plug, perm: 'settings.manage' }, { href: '/subscription', label: 'Subscription', icon: CreditCard, perm: 'subscription.manage' },
    { href: '/settings', label: 'Settings', icon: Settings, perm: 'settings.manage' } ] },
];

function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter(), can = useCan();
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 180), on = open && dq.length >= 2;
  const products = useGet<{ data: any[] }>(on && can('products.view') ? '/products' : null, { q: dq, pageSize: 5 });
  const customers = useGet<{ data: any[] }>(on && can('customers.view') ? '/customers' : null, { q: dq, pageSize: 5 });
  const invoices = useGet<{ data: any[] }>(on && can('sales.view') ? '/sales/invoices' : null, { q: dq, pageSize: 5 });
  const pages = NAV.flatMap((g) => g.items).filter((i) => can(i.perm) && dq && i.label.toLowerCase().includes(dq.toLowerCase()));
  const go = (href: string) => { onClose(); setQ(''); router.push(href); };
  const Section = ({ title, rows }: { title: string; rows: Array<{ key: string; label: string; sub?: string; href: string }> }) => rows.length ? (
    <div className="py-1"><p className="px-3 py-1 text-2xs font-semibold uppercase tracking-wider text-faint">{title}</p>
      {rows.map((r) => <button key={r.key} onClick={() => go(r.href)} className="flex w-full items-center justify-between rounded px-3 py-1.5 text-left text-sm hover:bg-ink/5 focus:bg-ink/5"><span>{r.label}</span><span className="text-xs text-faint">{r.sub}</span></button>)}</div>
  ) : null;
  return (
    <Dialog open={open} onClose={onClose} title="Search" description="Products, customers, invoices and pages" size="lg">
      <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-faint" />
        <input data-autofocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type at least 2 characters…" className="h-9 w-full rounded-md border bg-surface pl-9 pr-3 text-sm" /></div>
      <div className="mt-2 max-h-[50vh] overflow-y-auto">
        <Section title="Pages" rows={pages.map((p) => ({ key: p.href, label: p.label, href: p.href }))} />
        <Section title="Products" rows={(products.data?.data ?? []).map((p) => ({ key: p.id, label: p.name, sub: p.variants?.[0]?.sku, href: `/products/${p.id}` }))} />
        <Section title="Customers" rows={(customers.data?.data ?? []).map((c) => ({ key: c.id, label: c.name, sub: c.phone ?? '', href: `/customers/${c.id}` }))} />
        <Section title="Invoices" rows={(invoices.data?.data ?? []).map((i) => ({ key: i.id, label: `${i.number ?? 'Draft'} · ${i.customerName}`, sub: inr(i.grandTotal), href: `/sales/${i.id}` }))} />
        {on && (products.isFetching || customers.isFetching || invoices.isFetching) && <div className="flex justify-center py-3"><Spinner /></div>}
      </div>
    </Dialog>
  );
}

function Notifications() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const { data } = useGet<{ unread: number; items: any[] }>('/notifications');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, []);
  return (
    <div ref={ref} className="relative">
      <Button variant="ghost" size="icon" aria-label={`Notifications${data?.unread ? ` (${data.unread} unread)` : ''}`} onClick={() => setOpen((o) => !o)}>
        <Bell className="h-4 w-4" />{!!data?.unread && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-bad" />}
      </Button>
      {open && (
        <div className="absolute right-0 z-40 mt-1 w-80 rounded-lg border bg-raised shadow-pop">
          <div className="flex items-center justify-between border-b px-3 py-2"><span className="text-sm font-semibold">Notifications</span>
            {!!data?.unread && <button className="text-xs text-brand hover:underline" onClick={async () => { await api('/notifications/read-all', { method: 'POST' }); qc.invalidateQueries({ queryKey: ['/notifications'] }); }}>Mark all read</button>}</div>
          <div className="max-h-80 overflow-y-auto">
            {data?.items.length ? data.items.map((n) => (
              <div key={n.id} className={cn('border-b px-3 py-2 last:border-0', !n.readAt && 'bg-brand-soft/40')}>
                <p className="text-xs font-medium">{n.title}</p><p className="text-xs text-muted">{n.body}</p><p className="mt-0.5 text-2xs text-faint">{fmtDateTime(n.createdAt)}</p>
              </div>)) : <p className="px-3 py-8 text-center text-xs text-faint">You are all caught up</p>}
          </div>
        </div>
      )}
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter(), pathname = usePathname(), qc = useQueryClient();
  const { token, sidebarCollapsed, theme, businessId, set } = useSession();
  const [booting, setBooting] = useState(!token), [mobileNav, setMobileNav] = useState(false), [search, setSearch] = useState(false);
  const me = useMe(), can = useCan(), online = useOnline(), loc = useLocation();

  // Restore the session from the httpOnly refresh cookie; otherwise send the user to sign in.
  useEffect(() => {
    if (token) return setBooting(false);
    refreshAccessToken().then((t) => { if (!t) router.replace('/login'); else setBooting(false); });
  }, [token, router]);
  useEffect(() => { if (me.data && me.data.businessId !== businessId) set({ businessId: me.data.businessId }); }, [me.data, businessId, set]);
  useEffect(() => { setMobileNav(false); }, [pathname]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearch(true); } };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, []);

  if (booting || !me.data) return <div className="flex h-screen items-center justify-center"><Spinner className="h-6 w-6" /></div>;
  const business = me.data.businesses.find((b) => b.id === me.data!.businessId);
  const sub = me.data.subscription;
  const trialDays = sub?.status === 'TRIALING' && sub.trialEndsAt ? Math.max(0, Math.ceil((new Date(sub.trialEndsAt).getTime() - Date.now()) / 86400000)) : null;
  const logout = async () => { await api('/auth/logout', { method: 'POST', body: {} }).catch(() => undefined); set({ token: null }); qc.clear(); router.replace('/login'); };
  const switchBusiness = (id: string) => { set({ businessId: id, branchId: null, warehouseId: null }); qc.clear(); };
  const pos = pathname === '/pos';

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand text-brand-fg"><ReceiptText className="h-4 w-4" /></div>
        {!sidebarCollapsed && <span className="text-sm font-semibold tracking-tight">NEXBILL</span>}
      </div>
      <nav aria-label="Main" className="flex-1 space-y-4 overflow-y-auto p-2">
        {NAV.map((g) => {
          const items = g.items.filter((i) => can(i.perm));
          if (!items.length) return null;
          return (
            <div key={g.group}>
              {!sidebarCollapsed && <p className="px-2 pb-1 text-2xs font-semibold uppercase tracking-wider text-faint">{g.group}</p>}
              {items.map((i) => {
                const active = pathname === i.href || pathname.startsWith(i.href + '/');
                return (
                  <Link key={i.href} href={i.href} title={sidebarCollapsed ? i.label : undefined} aria-current={active ? 'page' : undefined}
                    className={cn('flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] font-medium transition-colors', active ? 'bg-brand-soft text-brand' : 'text-muted hover:bg-ink/5 hover:text-ink', sidebarCollapsed && 'justify-center')}>
                    <i.icon className="h-4 w-4 shrink-0" />{!sidebarCollapsed && i.label}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>
      <button onClick={() => set({ sidebarCollapsed: !sidebarCollapsed })} aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} className="hidden items-center gap-2 border-t px-4 py-2.5 text-xs text-faint hover:text-ink lg:flex">
        <ChevronsLeft className={cn('h-4 w-4 transition-transform', sidebarCollapsed && 'rotate-180')} />{!sidebarCollapsed && 'Collapse'}
      </button>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className={cn('no-print hidden shrink-0 border-r bg-surface transition-[width] lg:block', sidebarCollapsed ? 'w-14' : 'w-56')}>{sidebar}</aside>
      {mobileNav && <div className="fixed inset-0 z-40 lg:hidden"><div className="absolute inset-0 bg-black/40" onClick={() => setMobileNav(false)} /><aside className="relative h-full w-60 border-r bg-surface">{sidebar}</aside></div>}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print flex h-14 shrink-0 items-center gap-2 border-b bg-surface px-3 sm:px-4">
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu" onClick={() => setMobileNav(true)}><Menu className="h-4 w-4" /></Button>
          <div className="flex min-w-0 items-center gap-1.5">
            <Building2 className="hidden h-4 w-4 shrink-0 text-faint sm:block" />
            {me.data.businesses.length > 1
              ? <Select aria-label="Switch business" value={me.data.businessId} onChange={(e) => switchBusiness(e.target.value)} className="h-8 w-auto max-w-[180px] border-0 bg-transparent px-1 font-medium">{me.data.businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select>
              : <span className="truncate text-sm font-medium">{business?.name}</span>}
            {loc.branches.length > 1 && <><ChevronsUpDown className="h-3 w-3 text-faint" />
              <Select aria-label="Switch branch" value={loc.branch?.id} onChange={(e) => set({ branchId: e.target.value, warehouseId: null })} className="h-8 w-auto max-w-[150px] border-0 bg-transparent px-1 text-muted">{loc.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></>}
          </div>
          <button onClick={() => setSearch(true)} className="ml-auto hidden h-8 w-56 items-center gap-2 rounded-md border bg-bg px-2.5 text-xs text-faint hover:text-muted md:flex">
            <Search className="h-3.5 w-3.5" />Search…<span className="ml-auto"><Kbd>Ctrl K</Kbd></span>
          </button>
          <Button variant="ghost" size="icon" className="ml-auto md:hidden" aria-label="Search" onClick={() => setSearch(true)}><Search className="h-4 w-4" /></Button>
          {!online && <Badge tone="warn" className="gap-1"><WifiOff className="h-3 w-3" />Offline</Badge>}
          {trialDays !== null && <Link href="/subscription" className="hidden sm:block"><Badge tone="brand">Trial · {trialDays}d left</Badge></Link>}
          {can('sales.create') && !pos && <Link href="/pos"><Button size="sm"><ScanLine className="h-3.5 w-3.5" /><span className="hidden sm:inline">New bill</span></Button></Link>}
          <Notifications />
          <Button variant="ghost" size="icon" aria-label="Toggle dark mode" onClick={() => set({ theme: theme === 'dark' ? 'light' : 'dark' })}>{theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</Button>
          <div className="group relative">
            <button aria-label="Account menu" className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand">{me.data.user.name.slice(0, 1).toUpperCase()}</button>
            <div className="invisible absolute right-0 z-40 mt-1 w-56 rounded-lg border bg-raised p-1 opacity-0 shadow-pop transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
              <div className="border-b px-3 py-2"><p className="truncate text-sm font-medium">{me.data.user.name}</p><p className="truncate text-xs text-muted">{me.data.user.email}</p>
                <p className="mt-1 text-2xs uppercase tracking-wide text-faint">{me.data.tenants.find((t) => t.id === me.data!.tenantId)?.role}</p></div>
              <button onClick={logout} className="mt-1 flex w-full items-center gap-2 rounded px-3 py-1.5 text-left text-sm text-muted hover:bg-ink/5 hover:text-ink"><LogOut className="h-3.5 w-3.5" />Sign out</button>
            </div>
          </div>
        </header>
        <main className={cn('flex-1 overflow-y-auto', pos ? 'p-0' : 'p-4 sm:p-6')}><div className={pos ? 'h-full' : 'mx-auto max-w-[1400px]'}>{children}</div></main>
      </div>
      <GlobalSearch open={search} onClose={() => setSearch(false)} />
    </div>
  );
}
