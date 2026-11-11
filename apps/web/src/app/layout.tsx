import type { Metadata, Viewport } from 'next';
import { Providers } from '@/components/providers';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'NEXBILL', template: '%s · NEXBILL' },
  description: 'Billing, POS, inventory and GST for Indian businesses',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg', apple: '/icon.svg' },
};
export const viewport: Viewport = { themeColor: '#0d6e62', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" suppressHydrationWarning>
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
