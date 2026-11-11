'use client';
import { resetPasswordSchema } from '@nexbill/validation';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { AuthForm } from '@/components/auth-form';

function Inner() {
  const token = useSearchParams().get('token') ?? '';
  return <AuthForm title="Choose a new password" subtitle="You will be signed out everywhere else." schema={resetPasswordSchema.transform((v) => v)} endpoint="/auth/reset-password" submitLabel="Update password"
    defaults={{ token }} fields={[{ name: 'password', label: 'New password', type: 'password', hint: 'At least 8 characters with letters and numbers' }]}
    onDone={(_, router) => router.replace('/login')} />;
}
export default function ResetPage() { return <Suspense><Inner /></Suspense>; }
