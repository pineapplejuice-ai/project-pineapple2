'use client';
import { FileCheck2, Mail, MessageCircle, MessageSquareText, Printer, Scale, ScanBarcode, Truck, Wallet } from 'lucide-react';
import { PageHeader } from '@/components/page';
import { Badge, Card } from '@/components/ui';

const ITEMS = [
  { icon: ScanBarcode, name: 'Barcode scanners', status: 'Works now', tone: 'ok', text: 'USB and Bluetooth scanners that type like a keyboard work on the POS screen without any setup: scan, and the item is added.' },
  { icon: Printer, name: 'Receipt and A4 printing', status: 'Works now', tone: 'ok', text: '58 mm, 80 mm and A4 layouts print through the browser print dialog using any printer installed on this computer. Choose the paper size once in the print dialog.' },
  { icon: Printer, name: 'Direct thermal printing, cash drawer, label printers', status: 'Needs print bridge', tone: 'warn', text: 'Browsers cannot send raw ESC/POS commands to USB or network printers or open a cash drawer. The API is ready for a small local connector app (print bridge) on the counter PC; that connector is not part of this release.' },
  { icon: Scale, name: 'Weighing scales', status: 'Needs print bridge', tone: 'warn', text: 'Serial/USB scales need the same local connector. Until then, type the weight as the quantity (for example 0.250 for 250 g).' },
  { icon: MessageCircle, name: 'WhatsApp sharing', status: 'Works now', tone: 'ok', text: 'Invoices are shared with a secure link through WhatsApp\'s official click-to-chat. Automated sending needs a WhatsApp Business API provider; unofficial automation is never used.' },
  { icon: Mail, name: 'Email', status: 'Provider not connected', tone: 'neutral', text: 'Verification, password reset and invoice emails go through a pluggable adapter. Until an email provider is configured on the server they are only written to the server log.' },
  { icon: MessageSquareText, name: 'SMS', status: 'Provider not connected', tone: 'neutral', text: 'Payment reminders and alerts by SMS use the same adapter design and need a DLT-registered SMS provider.' },
  { icon: FileCheck2, name: 'GST e-invoicing (IRN & QR code)', status: 'Not connected', tone: 'neutral', text: 'IRNs can only be generated through the government IRP via an authorised GSP. NEXBILL keeps the data an IRP needs but does not generate or imitate IRNs.' },
  { icon: Truck, name: 'E-way bills', status: 'Not connected', tone: 'neutral', text: 'Requires an authorised e-way bill API provider. Not available yet.' },
  { icon: Wallet, name: 'Subscription payments', status: 'Test gateway', tone: 'warn', text: 'Plan changes currently use a built-in test gateway that always succeeds. A real provider plugs into the same adapter; card details are never stored by NEXBILL.' },
] as const;

export default function IntegrationsPage() {
  return (
    <>
      <PageHeader title="Integrations" description="What is connected today, and what needs a provider or a local connector" />
      <div className="grid gap-4 md:grid-cols-2">{ITEMS.map((i) => (
        <Card key={i.name} className="flex gap-3 p-4"><div className="h-fit rounded-md bg-ink/5 p-2"><i.icon className="h-4 w-4 text-muted" /></div>
          <div><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold">{i.name}</h3><Badge tone={i.tone}>{i.status}</Badge></div><p className="mt-1 text-xs leading-relaxed text-muted">{i.text}</p></div></Card>))}</div>
    </>
  );
}
