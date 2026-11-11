'use client';
import { categorySchema } from '@nexbill/validation';
import { ResourcePage } from '@/components/page';
import { useGet } from '@/lib/hooks';

export default function CategoriesPage() {
  const all = useGet<any[]>('/categories');
  const name = (id?: string | null) => all.data?.find((c) => c.id === id)?.name;
  return <ResourcePage title="Categories" description="Group products for browsing and reports. A category can sit under a parent to form sub-categories." path="/categories" noun="Category" managePermission="products.manage" schema={categorySchema} paged={false} searchable={false}
    fields={[{ name: 'name', label: 'Name', required: true, wide: true }, { name: 'parentId', label: 'Parent category', type: 'select', wide: true, options: (all.data ?? []).filter((c) => !c.parentId).map((c) => ({ value: c.id, label: c.name })) }]}
    toForm={(r) => ({ name: r.name, parentId: r.parentId ?? '' })}
    columns={[{ key: 'name', header: 'Category', render: (r) => <span className="font-medium">{r.parentId ? <span className="text-faint">{name(r.parentId)} › </span> : null}{r.name}</span> }, { key: 'products', header: 'Products', align: 'right', render: (r) => r._count.products }]} />;
}
