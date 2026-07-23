import type { Metadata } from 'next'
import Link from 'next/link'
import { TEMPLATE_PACKS } from '@/lib/template-packs'
import { getMarketplaceCanonicalUrl } from '@/lib/marketplaceSeo'

// ISR: revalidate at most once per hour
export const revalidate = 3600

export async function generateMetadata(): Promise<Metadata> {
  const title = 'Document Template Packs — Immigration & Study'
  const description =
    'Self-serve digital template packs for US and Canada student visas, work permits, visitor visas, and refusal recovery. Instant download after purchase.'
  const canonicalUrl = getMarketplaceCanonicalUrl('/marketplace/templates/')
  return {
    title,
    description,
    alternates: { canonical: canonicalUrl },
    robots: { index: true, follow: true },
    openGraph: {
      url: canonicalUrl,
      title,
      description,
      type: 'website',
    },
  }
}

const C = {
  bg: '#F7F8FA',
  surface: '#FFFFFF',
  surface2: '#F4F2EE',
  border: 'rgba(0,0,0,0.08)',
  cyan: '#3C3B6E',
  text: '#1F2937',
  textMuted: '#6B7280',
  textDim: '#9CA3AF',
}

const SERIF = "'Cormorant Garamond', 'Garamond', Georgia, 'Times New Roman', serif"
const SANS = "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif"

export default function TemplatesIndexPage() {
  return (
    <main style={{ maxWidth: '1120px', margin: '0 auto', padding: '48px 24px 80px', fontFamily: SANS, color: C.text }}>
      <div style={{ marginBottom: '8px', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.textMuted }}>
        Self-Serve Templates
      </div>
      <h1 style={{ fontFamily: SERIF, fontSize: '36px', fontWeight: 500, margin: '0 0 12px', letterSpacing: '-0.015em', lineHeight: 1.15 }}>
        Document Template Packs
      </h1>
      <p style={{ fontSize: '16px', color: C.textMuted, maxWidth: '640px', lineHeight: 1.6, margin: '0 0 16px' }}>
        Digital preparation kits you can use immediately. Each pack includes editable worksheets, checklists, and letter templates organised by visa type and country.
      </p>
      <p style={{ fontSize: '15px', color: C.text, maxWidth: '640px', lineHeight: 1.65, margin: '0 0 12px' }}>
        Template packs are for organization and preparation — not completed filings and not legal advice.
        Use them to inventory evidence, draft sponsor letters, and prepare interview answers before you
        open official portals or hire a marketplace provider for a fixed-scope review.
      </p>
      <p style={{ fontSize: '15px', color: C.text, maxWidth: '640px', lineHeight: 1.65, margin: '0 0 12px' }}>
        Choose by destination and product: US F-1 and OPT kits, Canada study permit and PGWP kits,
        visitor and refusal-recovery packs, and multi-country bundles. After purchase you get instant
        digital delivery; always re-check current USCIS/IRCC instructions because fees and forms change.
      </p>
      <p style={{ fontSize: '14px', color: C.textMuted, maxWidth: '640px', lineHeight: 1.6, margin: '0 0 40px' }}>
        Need a human on the packet? Browse{' '}
        <Link href="/categories/immigration" style={{ color: C.cyan }}>immigration services</Link>
        {' '}or{' '}
        <Link href="/providers" style={{ color: C.cyan }}>providers</Link>
        {' '}after you finish the worksheets.
      </p>

      <div style={{ display: 'grid', gap: '20px', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
        {TEMPLATE_PACKS.map((pack) => (
          <Link
            key={pack.slug}
            href={`/marketplace/templates/${pack.slug}/`}
            style={{
              display: 'flex',
              flexDirection: 'column',
              background: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: '12px',
              padding: '24px',
              textDecoration: 'none',
              color: 'inherit',
              transition: 'box-shadow 0.15s, border-color 0.15s',
            }}
            className="template-card"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  padding: '3px 10px',
                  borderRadius: '4px',
                  background: C.surface2,
                  color: C.cyan,
                }}
              >
                {pack.category}
              </span>
              {pack.badge && (
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    padding: '3px 10px',
                    borderRadius: '4px',
                    background: '#F5EDD6',
                    color: '#7A6030',
                  }}
                >
                  {pack.badge}
                </span>
              )}
            </div>
            <h2 style={{ fontFamily: SERIF, fontSize: '20px', fontWeight: 600, margin: '0 0 8px', lineHeight: 1.25, color: C.text }}>
              {pack.name}
            </h2>
            <p style={{ fontSize: '14px', color: C.textMuted, lineHeight: 1.55, margin: '0 0 16px', flex: 1 }}>
              {pack.short_description}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
              <span style={{ fontSize: '22px', fontWeight: 700, color: C.cyan, fontFamily: SERIF }}>
                ${pack.price_usd}
              </span>
              <span
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  padding: '8px 16px',
                  borderRadius: '6px',
                  background: C.cyan,
                  color: '#fff',
                }}
              >
                View Details
              </span>
            </div>
          </Link>
        ))}
      </div>

      <style>{`
        .template-card:hover {
          box-shadow: 0 4px 20px rgba(27,45,79,0.08);
          border-color: rgba(60,59,110,0.18) !important;
        }
      `}</style>
    </main>
  )
}
