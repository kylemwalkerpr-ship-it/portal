/**
 * MarketplaceFooter — compact editorial-commerce footer for the marketplace
 * landing. Replaces EstateFooter on this surface only.
 *
 * Visual language: warm vellum + indigo accent with a US/UK/CA/AU flag-stripe
 * rule at the top to thread back to the rest of the landing. One narrow row
 * of essential links + a one-line legal block. No wide-screen-only multi-col
 * grid, no marketing tagline duplication.
 */

const T = {
  paper: '#F7F8FA',
  paper2: '#EEF1F6',
  vellum: '#FFFFFF',
  ink: '#0F172A',
  inkMid: '#334155',
  inkSoft: '#64748B',
  rule: '#E2E8F0',
  ruleSoft: '#F1F5F9',
  indigo: '#3C3B6E',
  brick: '#B22234',
}

const F = {
  display: "var(--font-lora), 'Lora', Georgia, serif",
  ui: "var(--font-inter), -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  mono: "var(--font-plex-mono), 'IBM Plex Mono', ui-monospace, monospace",
}

interface FooterLink {
  label: string
  href: string
}

const NAV_LINKS: FooterLink[] = [
  { label: 'Browse', href: '/marketplace' },
  { label: 'Categories', href: '/marketplace/categories' },
  { label: 'For attorneys', href: 'https://portal.yousafeconsultancy.com/sign-up/attorney' },
  { label: 'For consultants', href: 'https://portal.yousafeconsultancy.com/sign-up/consultant' },
  { label: 'Open portal', href: 'https://portal.yousafeconsultancy.com/' },
  { label: 'Help', href: '#faq' },
]

const LEGAL_LINKS: FooterLink[] = [
  { label: 'Privacy', href: 'https://usa.yousafeconsultancy.com/privacy-policy/' },
  { label: 'Terms', href: 'https://usa.yousafeconsultancy.com/terms-of-service/' },
  { label: 'Refund policy', href: 'https://usa.yousafeconsultancy.com/refund-policy/' },
  { label: 'Disclaimer', href: 'https://legal.yousafeconsultancy.com/disclaimer/' },
]

export function MarketplaceFooter() {
  const year = new Date().getFullYear()

  return (
    <footer className="cw-mkt-footer">
      <style>{`
        .cw-mkt-footer {
          position: relative;
          background: ${T.paper2};
          border-top: 1px solid ${T.rule};
          color: ${T.inkMid};
          font-family: ${F.ui};
          font-size: 13px;
        }
        .cw-mkt-footer::before {
          content: ""; position: absolute; left: 0; right: 0; top: 0; height: 3px;
          background: linear-gradient(90deg, ${T.indigo} 0 42%, #fff 42% 58%, ${T.brick} 58% 100%);
        }
        .cw-mkt-footer-wrap {
          width: min(1280px, calc(100vw - 32px));
          margin: 0 auto;
          padding: 18px 0 16px;
          display: grid;
          grid-template-columns: 1fr minmax(0, auto);
          align-items: center;
          gap: 18px;
        }
        @media (max-width: 760px) {
          .cw-mkt-footer-wrap { grid-template-columns: 1fr; gap: 12px; padding: 18px 0 14px; }
          .cw-mkt-footer-legal-row { justify-content: flex-start !important; }
        }
        .cw-mkt-nav {
          display: flex; flex-wrap: wrap; gap: 4px 22px; justify-content: center;
          font-size: 14px; line-height: 1.6;
        }
        .cw-mkt-nav a {
          color: ${T.inkMid}; text-decoration: none; padding: 2px 0;
          transition: color .12s;
        }
        .cw-mkt-nav a:hover { color: ${T.ink}; }
        .cw-mkt-footer-legal-row {
          display: flex; align-items: center; gap: 12px; justify-content: flex-end;
          font-family: ${F.mono}; font-size: 10.5px; letter-spacing: 0.06em; color: ${T.inkSoft};
        }
        .cw-mkt-footer-legal-row a { color: ${T.inkMid}; text-decoration: none; }
        .cw-mkt-footer-legal-row a:hover { color: ${T.ink}; }
        .cw-mkt-footer-legal-row .sep { width: 3px; height: 3px; background: ${T.inkSoft}; border-radius: 50%; opacity: 0.5; }
        .cw-mkt-disc {
          width: min(1280px, calc(100vw - 32px));
          margin: 0 auto;
          padding: 0 0 16px;
          font-size: 11.5px; line-height: 1.55; color: ${T.inkSoft};
          max-width: 78ch;
        }
        .cw-mkt-footer-brand-row {
          width: min(1280px, calc(100vw - 32px));
          margin: 0 auto;
          padding: 28px 0 14px;
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .cw-mkt-footer-brand-row .mark {
          width: 32px; height: 32px;
          object-fit: contain;
        }
        .cw-mkt-footer-brand-row .wordmark {
          font-family: ${F.display}; font-weight: 600; font-size: 18px; color: ${T.ink};
        }
        .cw-mkt-footer-brand-row .tagline {
          font-family: ${F.ui}; font-size: 13px; color: ${T.inkSoft}; margin-left: 4px;
        }
      `}</style>
      <div className="cw-mkt-footer-brand-row">
        <img className="mark" src="/logo.png" alt="YouSafe Consultancy" width="32" height="32" />
        <span className="wordmark">YouSafe Marketplace</span>
        <span className="tagline">Your Safe Path to Success.</span>
      </div>
      <div className="cw-mkt-footer-wrap">
        <nav className="cw-mkt-nav">
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href}>{l.label}</a>
          ))}
        </nav>
        <div className="cw-mkt-footer-legal-row">
          <span>© {year}</span>
          {LEGAL_LINKS.map((l, i) => (
            <span key={l.href} style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
              <span className="sep" aria-hidden="true" />
              <a href={l.href}>{l.label}</a>
            </span>
          ))}
        </div>
      </div>
      <p className="cw-mkt-disc">
        YouSafe Consultancy operates a marketplace of vetted consultants and licensed attorneys. It is not a law firm and does not guarantee any visa, permit, or application outcome.
      </p>
    </footer>
  )
}
