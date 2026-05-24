/* eslint-disable react/prop-types */
// @ts-nocheck
const fT = window.YS_TOKENS;

// Mirrors yousafe-portal/components/EstateFooter.tsx +
// components/estate-footer-config.ts EXACTLY. Production should keep using the
// shared <EstateFooter /> import; this is here only because the prototype is
// a standalone HTML file.

const FOOTER_COLS = [
  {
    heading: 'Study & Migrate',
    links: [
      { label: 'USA — F-1 student visas',  href: 'https://usa.yousafeconsultancy.com/' },
      { label: 'Canada — study permits',   href: 'https://ca.yousafeconsultancy.com/' },
      { label: 'UK — Student Route',       href: 'https://uk.yousafeconsultancy.com/' },
      { label: 'Country guides',           href: 'https://usa.yousafeconsultancy.com/from/' },
      { label: 'University guides',        href: 'https://usa.yousafeconsultancy.com/universities/' },
    ],
  },
  {
    heading: 'Legal & Tenancy',
    links: [
      { label: 'Legal article library',    href: 'https://legal.yousafeconsultancy.com/' },
      { label: 'US immigration & status',  href: 'https://legal.yousafeconsultancy.com/us/' },
      { label: 'UK immigration & tenancy', href: 'https://legal.yousafeconsultancy.com/uk/' },
      { label: 'Canada study & PR',        href: 'https://legal.yousafeconsultancy.com/ca/' },
    ],
  },
  {
    heading: 'Marketplace',
    links: [
      { label: 'Browse the marketplace',   href: 'https://market.yousafeconsultancy.com/' },
      { label: 'Find a consultant',        href: 'https://market.yousafeconsultancy.com/providers' },
      { label: 'Find an attorney',         href: 'https://market.yousafeconsultancy.com/categories/legal' },
      { label: 'Open the portal',          href: 'https://portal.yousafeconsultancy.com/' },
      { label: 'For attorneys & consultants', href: 'https://legal.yousafeconsultancy.com/attorneys/' },
    ],
  },
  {
    heading: 'Company',
    links: [
      { label: 'About YouSafe', href: 'https://yousafeconsultancy.com/' },
      { label: 'Contact',       href: 'https://usa.yousafeconsultancy.com/contact/' },
      { label: 'Support centre', href: 'https://support.yousafeconsultancy.com/' },
      { label: 'Help & FAQ',    href: 'https://usa.yousafeconsultancy.com/faqs/' },
    ],
  },
];

const FOOTER_LEGAL = [
  { label: 'Privacy',       href: 'https://usa.yousafeconsultancy.com/privacy-policy/' },
  { label: 'Terms',         href: 'https://usa.yousafeconsultancy.com/terms-of-service/' },
  { label: 'Refund policy', href: 'https://usa.yousafeconsultancy.com/refund-policy/' },
  { label: 'Disclaimer',    href: 'https://legal.yousafeconsultancy.com/disclaimer/' },
];

const FOOTER_SOCIAL = [
  { label: 'LinkedIn',    href: 'https://linkedin.com/company/yousafe-consultancy' },
  { label: 'X / Twitter', href: 'https://x.com/yousafeconsult' },
  { label: 'Facebook',    href: 'https://facebook.com/yousafeconsultancy' },
  { label: 'Instagram',   href: 'https://instagram.com/yousafeconsultancy' },
];

function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer
      style={{
        background: fT.paper,
        borderTop: `1px solid ${fT.rule}`,
        color: fT.ink,
      }}
    >
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '64px 40px 48px' }}>
        <div
          className="ys-footer-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: '1.4fr 1fr 1fr 1fr 1fr',
            gap: 40,
            alignItems: 'flex-start',
          }}
        >
          {/* Brand block */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span
                style={{
                  width: 38, height: 38, borderRadius: 10,
                  background: fT.indigo, color: '#fff',
                  fontFamily: fT.serif, fontWeight: 600, fontSize: 20,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                Y
              </span>
              <span style={{ fontFamily: fT.serif, fontSize: 22, fontWeight: 500 }}>
                YouSafe Consultancy
              </span>
            </div>
            <p style={{ marginTop: 16, maxWidth: 360, fontSize: 14, lineHeight: 1.65, color: fT.inkSoft }}>
              Study, work, and settle abroad — visa document preparation and a vetted legal marketplace across the US, UK, and Canada.
            </p>

            {/* Country chips */}
            <div style={{ display: 'flex', gap: 8, marginTop: 22 }}>
              {[
                { code: 'US', href: 'https://usa.yousafeconsultancy.com/' },
                { code: 'UK', href: 'https://uk.yousafeconsultancy.com/' },
                { code: 'CA', href: 'https://ca.yousafeconsultancy.com/' },
              ].map((c) => (
                <a
                  key={c.code}
                  href={c.href}
                  style={{
                    padding: '5px 10px',
                    borderRadius: 6,
                    background: fT.ink,
                    color: '#fff',
                    fontFamily: fT.mono,
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    textDecoration: 'none',
                  }}
                >
                  {c.code}
                </a>
              ))}
            </div>
          </div>

          {FOOTER_COLS.map((col) => (
            <div key={col.heading}>
              <div className="ys-eyebrow" style={{ marginBottom: 16, color: fT.inkSoft }}>
                {col.heading}
              </div>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {col.links.map((link) => (
                  <li key={link.href + link.label}>
                    <a href={link.href} style={{ fontSize: 13.5, color: fT.inkMid, textDecoration: 'none' }}>
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Social */}
        <div style={{ marginTop: 40, display: 'flex', flexWrap: 'wrap', gap: 20 }}>
          {FOOTER_SOCIAL.map((link) => (
            <a key={link.label} href={link.href} rel="noopener" style={{ fontSize: 13, color: fT.inkSoft, textDecoration: 'none' }}>
              {link.label}
            </a>
          ))}
        </div>

        {/* Legal */}
        <div style={{ marginTop: 36, borderTop: `1px solid ${fT.rule}`, paddingTop: 22 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: fT.inkSoft }}>© {year} YouSafe Consultancy</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              {FOOTER_LEGAL.map((link) => (
                <a key={link.href} href={link.href} style={{ fontSize: 12, color: fT.inkSoft, textDecoration: 'none' }}>
                  {link.label}
                </a>
              ))}
            </div>
          </div>
          <p style={{ marginTop: 16, maxWidth: 720, fontSize: 12, lineHeight: 1.65, color: fT.inkSoft }}>
            YouSafe Consultancy provides document preparation and education services and operates a marketplace of vetted consultants and licensed attorneys. It is not a law firm and does not guarantee any visa, permit, or application outcome.
          </p>
        </div>
      </div>

      {/* Flag-bar at the very bottom — visual brand anchor */}
      <div
        aria-hidden="true"
        style={{
          height: 4,
          background: 'linear-gradient(90deg, #3c3b6e 0%, #3c3b6e 33%, #b22234 33%, #b22234 66%, #C4A45A 66%, #C4A45A 100%)',
        }}
      />
    </footer>
  );
}

window.Footer = Footer;
