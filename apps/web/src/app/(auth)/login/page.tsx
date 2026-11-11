'use client';
import { loginSchema } from '@nexbill/validation';
import Link from 'next/link';
import { AuthForm } from '@/components/auth-form';

export default function LoginPage() {
  return <AuthForm title="Welcome back" subtitle="Sign in to your NEXBILL account" schema={loginSchema} endpoint="/auth/login" submitLabel="Sign in"
    fields={[{ name: 'email', label: 'Email', type: 'email', placeholder: 'you@shop.in' }, { name: 'password', label: 'Password', type: 'password' }]}
    onDone={(_, router) => router.replace('/dashboard')}
    footer={<><Link href="/forgot-password" className="text-brand hover:underline">Forgot password?</Link><span className="mx-2 text-faint">·</span>New here? <Link href="/register" className="font-medium text-brand hover:underline">Create an account</Link></>} />;
}
