import {
  ESTATE_FOOTER_COLUMNS,
  ESTATE_FOOTER_LEGAL,
  ESTATE_FOOTER_SOCIAL,
} from './estate-footer-config'

/**
 * EstateFooter — the standard footer for every YouSafe site.
 *
 * Styled entirely with inline styles + a self-contained palette + one
 * component-owned <style> block for hover. Zero CSS-framework dependency,
 * so this file is byte-identical and renders the same in every repo whether
 * it uses Tailwind, another version, or none. Never add Tailwind/utility
 * classNames or edit a repo's globals.css to support this component.
 */

const C = {
  bg: '#FAFAF8',
  text: '#1F2937',
  muted: '#6B7280',
  border: '#E5E7EB',
  accent: '#0E7C66',
  serif: "Georgia, 'Times New Roman', serif",
  sans: "'Inter', system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
}

export function EstateFooter() {
  const year = new Date().getFullYear()
  return (
    <footer
      className="ysf-estate-footer"
      style={{ background: C.bg, borderTop: `1px solid ${C.border}`, fontFamily: C.sans }}
    >
      <style>{`
        .ysf-estate-footer a { transition: color 0.15s ease; }
        .ysf-estate-footer a:hover { color: ${C.text}; text-decoration: underline; }
      `}</style>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '48px 24px' }}>
        {/* Brand */}
        <div style={{ marginBottom: '36px' }}>
          <div style={{ fontFamily: C.serif, fontSize: '19px', fontWeight: 600, color: C.text }}>
            YouSafe Consultancy
          </div>
          <p style={{ marginTop: '8px', maxWidth: '36rem', fontSize: '14px', lineHeight: 1.65, color: C.muted }}>
            Study, work, and settle abroad — visa document preparation and a vetted legal marketplace across the US, UK, Canada, and Australia.
          </p>
        </div>

        {/* Link columns */}
        <div style={{ display: 'grid', gap: '32px', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          {ESTATE_FOOTER_COLUMNS.map((col) => (
            <div key={col.heading}>
              <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted }}>
                {col.heading}
              </div>
              <ul style={{ listStyle: 'none', margin: '14px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {col.links.map((link) => (
                  <li key={link.href}>
                    <a href={link.href} style={{ fontSize: '14px', color: C.muted, textDecoration: 'none' }}>
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Social */}
        <div style={{ marginTop: '36px', display: 'flex', flexWrap: 'wrap', gap: '20px' }}>
          {ESTATE_FOOTER_SOCIAL.map((link) => (
            <a key={link.href} href={link.href} rel="noopener" style={{ fontSize: '13px', color: C.muted, textDecoration: 'none' }}>
              {link.label}
            </a>
          ))}
        </div>

        {/* Legal strip + honest disclaimer */}
        <div style={{ marginTop: '36px', borderTop: `1px solid ${C.border}`, paddingTop: '24px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12px', color: C.muted }}>© {year} YouSafe Consultancy</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
              {ESTATE_FOOTER_LEGAL.map((link) => (
                <a key={link.href} href={link.href} style={{ fontSize: '12px', color: C.muted, textDecoration: 'none' }}>
                  {link.label}
                </a>
              ))}
            </div>
          </div>
          <p style={{ marginTop: '16px', maxWidth: '52rem', fontSize: '12px', lineHeight: 1.65, color: C.muted }}>
            YouSafe Consultancy provides document preparation and education services and operates a marketplace of vetted consultants and licensed attorneys. It is not a law firm and does not guarantee any visa, permit, or application outcome.
          </p>
        </div>
      </div>
    </footer>
  )
}
