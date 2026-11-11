'use client';
import { forgotPasswordSchema } from '@nexbill/validation';
import Link from 'next/link';
import { AuthForm } from '@/components/auth-form';

export default function ForgotPage() {
  return <AuthForm title="Reset your password" subtitle="We will email you a link to choose a new password." schema={forgotPasswordSchema} endpoint="/auth/forgot-password" submitLabel="Send reset link"
    fields={[{ name: 'email', label: 'Email', type: 'email' }]}
    onDone={(res, router) => { if (res.devResetToken) router.push(`/reset-password?token=${res.devResetToken}`); }}
    footer={<Link href="/login" className="text-brand hover:underline">Back to sign in</Link>} />;
}
