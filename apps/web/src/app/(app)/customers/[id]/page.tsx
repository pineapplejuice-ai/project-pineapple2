'use client';
import { receiptSchema } from '@nexbill/validation';
import { use } from 'react';
import { PartyLedger } from '@/components/ledger';
export default function CustomerPage({ params }: { params: Promise<{ id: string }> }) { const { id } = use(params); return <PartyLedger kind="customer" id={id} schema={receiptSchema} />; }
