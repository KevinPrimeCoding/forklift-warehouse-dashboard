import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Warehouse Event Dashboard',
  description: 'Real-time warehouse operation monitoring dashboard'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
