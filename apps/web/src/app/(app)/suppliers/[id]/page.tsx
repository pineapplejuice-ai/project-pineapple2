'use client';
import { supplierPaymentSchema } from '@nexbill/validation';
import { use } from 'react';
import { PartyLedger } from '@/components/ledger';
export default function SupplierPage({ params }: { params: Promise<{ id: string }> }) { const { id } = use(params); return <PartyLedger kind="supplier" id={id} schema={supplierPaymentSchema} />; }
