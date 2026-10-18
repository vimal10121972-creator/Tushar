import Link from 'next/link';
export function Brand({ compact = false }: { compact?: boolean }) {
  return <Link href="/" className="brand" aria-label="Tushar Jain Research home"><span className="brand-mark" aria-hidden="true"><i/><i/><i/></span><span><strong>TUSHAR JAIN</strong><small>{compact ? 'RESEARCH' : 'RESEARCH · INDIA'}</small></span></Link>;
}
export function Footer() { return <footer className="footer"><span>© {new Date().getFullYear()} · Created by Tushar Jain</span><div><Link href="/methodology">Methodology</Link><Link href="/disclaimer">Disclaimer</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></div><small>Independent analysis. Not investment advice.</small></footer>; }
