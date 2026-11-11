'use client';
import { INDIAN_STATES } from '@nexbill/shared';
import { registerSchema } from '@nexbill/validation';
import Link from 'next/link';
import { AuthForm } from '@/components/auth-form';

export default function RegisterPage() {
  return <AuthForm title="Create your account" subtitle="14-day free trial. No card needed." schema={registerSchema} endpoint="/auth/register" submitLabel="Create account" defaults={{ stateCode: '29' }}
    fields={[
      { name: 'name', label: 'Your name', placeholder: 'Ravi Kumar' }, { name: 'businessName', label: 'Business name', placeholder: 'Sri Lakshmi Hardware' },
      { name: 'stateCode', label: 'State', type: 'select', options: INDIAN_STATES.map((s) => ({ value: s.code, label: s.name })) },
      { name: 'phone', label: 'Mobile number (optional)', placeholder: '9876543210' },
      { name: 'email', label: 'Email', type: 'email' }, { name: 'password', label: 'Password', type: 'password', hint: 'At least 8 characters with letters and numbers' },
    ]}
    onDone={(_, router) => router.replace('/onboarding')}
    footer={<>Already have an account? <Link href="/login" className="font-medium text-brand hover:underline">Sign in</Link></>} />;
}
