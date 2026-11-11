import { ReceiptText } from 'lucide-react';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-[#0b3b36] p-10 text-white lg:flex">
        <div className="flex items-center gap-2 text-lg font-semibold tracking-tight"><ReceiptText className="h-6 w-6" />NEXBILL</div>
        <div className="max-w-md">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">Bill faster. Know your stock. Stay GST-ready.</h2>
          <p className="mt-4 text-sm leading-relaxed text-white/70">One system for the counter, the godown and the accountant — built for hardware stores, supermarkets, ice cream shops and distributors across India.</p>
          <ul className="mt-8 space-y-2.5 text-sm text-white/85">
            {['Keyboard-first POS with barcode scanning', 'GST invoices, credit notes and GSTR-1 / 3B preparation', 'Stock ledger across branches and warehouses', 'Customer credit, supplier dues and daily cash tally'].map((t) => <li key={t} className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-300" />{t}</li>)}
          </ul>
        </div>
        <p className="text-xs text-white/40">Made for Indian retail</p>
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-emerald-400/10 blur-3xl" />
      </div>
      <div className="flex items-center justify-center p-6"><div className="w-full max-w-sm">{children}</div></div>
    </div>
  );
}
