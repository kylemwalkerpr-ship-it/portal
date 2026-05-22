import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { TEMPLATE_PACKS, getTemplatePack } from '@/lib/template-packs'

const PORTAL_URL = 'https://portal.yousafeconsultancy.com'

export const dynamic = 'force-static'

export async function generateStaticParams() {
  return TEMPLATE_PACKS.map((p) => ({ slug: p.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const pack = getTemplatePack(slug)
  if (!pack) return {}
  const title = `${pack.name} — $${pack.price_usd}`.slice(0, 60)
  const description = pack.short_description.slice(0, 160)
  return {
    title,
    description,
    alternates: { canonical: `/marketplace/templates/${slug}/` },
    robots: { index: true, follow: true },
    openGraph: {
      url: `${PORTAL_URL}/marketplace/templates/${slug}/`,
      title,
      description,
      type: 'website',
    },
  }
}

const C = {
  bg: '#FBFAF7',
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

export default async function TemplateDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const pack = getTemplatePack(slug)
  if (!pack) notFound()

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: pack.name,
    description: pack.short_description,
    image: `${PORTAL_URL}/og-image.png`,
    offers: {
      '@type': 'Offer',
      price: pack.price_usd.toFixed(2),
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
      url: `${PORTAL_URL}/marketplace/templates/${slug}/`,
    },
  }

  return (
    <main style={{ maxWidth: '820px', margin: '0 auto', padding: '48px 24px 80px', fontFamily: SANS, color: C.text }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div style={{ marginBottom: '8px', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.textMuted }}>
        {pack.category}
      </div>
      <h1 style={{ fontFamily: SERIF, fontSize: '32px', fontWeight: 500, margin: '0 0 16px', letterSpacing: '-0.015em', lineHeight: 1.2 }}>
        {pack.name}
      </h1>
      <p style={{ fontSize: '16px', color: C.textMuted, lineHeight: 1.6, margin: '0 0 32px' }}>
        {pack.short_description}
      </p>

      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '32px' }}>
        <span style={{ fontSize: '32px', fontWeight: 700, color: C.cyan, fontFamily: SERIF }}>
          ${pack.price_usd}
        </span>
        <span style={{ fontSize: '13px', color: C.textDim, alignSelf: 'center' }}>
          USD · Instant digital delivery
        </span>
      </div>

      <div
        style={{
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: '12px',
          padding: '28px',
          marginBottom: '32px',
        }}
      >
        <h2 style={{ fontFamily: SERIF, fontSize: '22px', fontWeight: 500, margin: '0 0 16px' }}>
          What is included
        </h2>
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {pack.includes.map((item) => (
            <li key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '15px', color: C.textMuted, lineHeight: 1.5 }}>
              <span style={{ color: '#1A6B45', fontWeight: 700, flexShrink: 0 }}>✓</span>
              {item}
            </li>
          ))}
        </ul>
      </div>

      <div
        style={{
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: '12px',
          padding: '28px',
          marginBottom: '32px',
        }}
      >
        <h2 style={{ fontFamily: SERIF, fontSize: '22px', fontWeight: 500, margin: '0 0 16px' }}>
          Official sources
        </h2>
        <p style={{ fontSize: '14px', color: C.textMuted, lineHeight: 1.55, margin: '0 0 12px' }}>
          These templates are organised around the official forms and guidance from:
        </p>
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {pack.official_sources.map((src) => (
            <li key={src} style={{ fontSize: '14px', color: C.textMuted, fontFamily: 'monospace' }}>
              {src}
            </li>
          ))}
        </ul>
      </div>

      <div
        style={{
          background: '#F5F0E8',
          borderRadius: '12px',
          padding: '24px 28px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: C.cyan, fontFamily: SERIF }}>
            ${pack.price_usd}
          </div>
          <div style={{ fontSize: '13px', color: C.textMuted }}>One-time purchase · Instant access</div>
        </div>
        <Link
          href={`/marketplace/cart?add=${pack.slug}`}
          style={{
            padding: '12px 28px',
            borderRadius: '8px',
            background: C.cyan,
            color: '#fff',
            fontSize: '15px',
            fontWeight: 600,
            textDecoration: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          Add to Cart
        </Link>
      </div>

      <p style={{ marginTop: '20px', fontSize: '13px', color: C.textDim, lineHeight: 1.5 }}>
        This is a digital document preparation kit, not legal advice. Templates help you organise your own records; they do not guarantee any government outcome.
      </p>
    </main>
  )
}
