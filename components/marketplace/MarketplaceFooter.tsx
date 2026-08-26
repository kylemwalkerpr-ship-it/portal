/**
 * Compact marketplace footer — two thin rows, no tagline, no flag stripe.
 * Action links only: shop, sell, help. Legal lives on one line.
 */

import { T, F } from './tokens'

interface FooterLink {
  label: string
  href: string
}

const NAV_LINKS: FooterLink[] = [
  { label: 'Marketplace', href: '/marketplace' },
  { label: 'File shop', href: '/shop' },
  { label: 'Categories', href: '/marketplace/categories' },
  { label: 'Become a seller', href: 'https://portal.yousafeconsultancy.com/sign-up/attorney' },
  { label: 'Help', href: '/marketplace#faq' },
]

const LEGAL_LINKS: FooterLink[] = [
  { label: 'Privacy', href: 'https://usa.yousafeconsultancy.com/privacy-policy/' },
  { label: 'Terms', href: 'https://usa.yousafeconsultancy.com/terms-of-service/' },
  { label: 'Refunds', href: 'https://usa.yousafeconsultancy.com/refund-policy/' },
]

export function MarketplaceFooter() {
  const year = new Date().getFullYear()

  return (
    <footer className="cw-mkt-footer">
      <style>{`
        .cw-mkt-footer {
          background: ${T.footer};
          color: ${T.cream};
          font-family: ${F.ui};
          font-size: 13px;
          border-top: 1px solid rgba(224,180,90,0.28);
          box-shadow: inset 0 1px 0 rgba(255,236,200,0.12);
        }
        .cw-mkt-footer-inner {
          width: min(1280px, calc(100vw - 32px));
          margin: 0 auto;
          padding: 16px 0 14px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px 24px;
          flex-wrap: wrap;
        }
        .cw-mkt-footer-brand {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          color: #FFFBF4;
          text-decoration: none;
          font-weight: 800;
          font-size: 16px;
          letter-spacing: -0.02em;
        }
        .cw-mkt-footer-brand img { width: 26px; height: 26px; object-fit: contain; }
        .cw-mkt-footer-nav {
          display: flex;
          flex-wrap: wrap;
          gap: 4px 18px;
          justify-content: flex-end;
        }
        .cw-mkt-footer-nav a {
          color: rgba(255,251,244,0.82);
          text-decoration: none;
          font-weight: 600;
          padding: 4px 0;
          transition: color .15s cubic-bezier(0.22,1,0.36,1);
        }
        .cw-mkt-footer-nav a:hover { color: #EDE3C8; }
        .cw-mkt-footer-legal {
          border-top: 1px solid rgba(255,251,244,0.10);
        }
        .cw-mkt-footer-legal-inner {
          width: min(1280px, calc(100vw - 32px));
          margin: 0 auto;
          padding: 10px 0 12px;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px 14px;
          font-size: 12px;
          color: rgba(255,251,244,0.55);
        }
        .cw-mkt-footer-legal-inner a {
          color: rgba(255,251,244,0.62);
          text-decoration: none;
        }
        .cw-mkt-footer-legal-inner a:hover { color: #FFFBF4; }
        .cw-mkt-footer-legal-inner .dot {
          width: 3px; height: 3px; border-radius: 50%;
          background: rgba(255,251,244,0.28);
        }
        @media (max-width: 720px) {
          .cw-mkt-footer-inner { padding: 14px 0 12px; }
          .cw-mkt-footer-nav { justify-content: flex-start; }
        }
      `}</style>
      <div className="cw-mkt-footer-inner">
        <a className="cw-mkt-footer-brand" href="/marketplace">
          <img src="/logo.png" alt="" width="26" height="26" />
          YouSafe
        </a>
        <nav className="cw-mkt-footer-nav" aria-label="Footer">
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href}>{l.label}</a>
          ))}
        </nav>
      </div>
      <div className="cw-mkt-footer-legal">
        <div className="cw-mkt-footer-legal-inner">
          <span>© {year} YouSafe Consultancy</span>
          {LEGAL_LINKS.map((l) => (
            <span key={l.href} style={{ display: 'inline-flex', alignItems: 'center', gap: 14 }}>
              <span className="dot" aria-hidden="true" />
              <a href={l.href}>{l.label}</a>
            </span>
          ))}
          <span className="dot" aria-hidden="true" />
          <span>Not a law firm · escrowed briefs only</span>
        </div>
      </div>
    </footer>
  )
}
