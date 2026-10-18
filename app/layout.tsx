import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Tushar Jain Research | Evidence-led Indian Equity Analysis', template: '%s | Tushar Jain Research' },
  description: 'Independent Indian equity research with traceable sources, transparent valuation and reproducible financial calculations.',
  robots: { index: true, follow: true },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
