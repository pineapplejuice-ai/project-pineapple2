'use client';
import { use } from 'react';
import { ProductForm } from '@/components/product-form';
import { ErrorState, Spinner } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { useGet } from '@/lib/hooks';

export default function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error, isLoading } = useGet<any>(`/products/${id}`);
  if (error) return <ErrorState message={errorMessage(error)} />;
  if (isLoading || !data) return <div className="flex justify-center py-20"><Spinner /></div>;
  return <ProductForm key={data.updatedAt} product={data} />;
}
