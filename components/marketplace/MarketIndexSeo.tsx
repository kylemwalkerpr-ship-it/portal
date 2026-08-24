import type { CSSProperties } from 'react'
import Link from 'next/link'
import { CATEGORIES } from '@/lib/categories'
import { T } from './tokens'

const wrap: CSSProperties = {
  maxWidth: 960,
  margin: '0 auto',
  padding: '32px 20px 24px',
  fontFamily: 'var(--font-inter), system-ui, sans-serif',
  color: T.ink,
}

/**
 * Server-rendered editorial + link graph for marketplace index routes that
 * otherwise hydrate as client-only shells (categories / providers indexes).
 */
export function CategoriesIndexSeo() {
  return (
    <main style={wrap}>
      <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.inkSoft, margin: '0 0 8px' }}>
        Marketplace
      </p>
      <h1 style={{ fontSize: 30, fontWeight: 700, margin: '0 0 12px', lineHeight: 1.2 }}>
        All service categories
      </h1>
      <p style={{ fontSize: 16, lineHeight: 1.65, margin: '0 0 14px', maxWidth: '42rem' }}>
        Browse fixed-price immigration, education, legal, settlement, and career services on YouSafe
        Marketplace. Each category groups briefs from consultants and licensed attorneys so you can
        compare scope and delivery before you request work.
      </p>
      <p style={{ fontSize: 15, lineHeight: 1.65, margin: '0 0 20px', maxWidth: '42rem' }}>
        Prefer free procedure first? Read document checklists and refusal guides on{' '}
        <a href="https://legal.yousafeconsultancy.com/" style={{ color: T.indigo }}>
          MyCaseworks
        </a>
        . Prefer self-serve worksheets? Open{' '}
        <Link href="/templates" style={{ color: T.indigo }}>
          visa template packs
        </Link>
        {' '}or the{' '}
        <Link href="/shop" style={{ color: T.indigo }}>
          file shop
        </Link>
        . Marketplace orders are preparation and consulting engagements unless your contract states
        attorney representation.
      </p>
      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 12px' }}>Categories</h2>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 14 }}>
        {CATEGORIES.map((cat) => (
          <li
            key={cat.id}
            style={{
              border: `1px solid ${T.rule}`,
              borderRadius: 12,
              padding: '14px 16px',
              background: T.vellum,
            }}
          >
            <Link href={`/categories/${cat.id}`} style={{ fontWeight: 700, fontSize: 16, color: T.ink, textDecoration: 'none' }}>
              {cat.name}
            </Link>
            <p style={{ fontSize: 14, lineHeight: 1.55, margin: '6px 0 10px', color: T.inkMid }}>
              {cat.description}
            </p>
            {cat.subcategories?.length > 0 && (
              <p style={{ fontSize: 13, margin: 0, lineHeight: 1.6 }}>
                {cat.subcategories.slice(0, 8).map((s, i) => (
                  <span key={s.id}>
                    {i > 0 ? ' · ' : ''}
                    <Link href={`/categories/${s.id}`} style={{ color: T.indigo }}>
                      {s.name}
                    </Link>
                  </span>
                ))}
              </p>
            )}
          </li>
        ))}
      </ul>
    </main>
  )
}

export function ProvidersIndexSeo() {
  return (
    <main style={wrap}>
      <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.inkSoft, margin: '0 0 8px' }}>
        Marketplace
      </p>
      <h1 style={{ fontSize: 30, fontWeight: 700, margin: '0 0 12px', lineHeight: 1.2 }}>
        Verified providers
      </h1>
      <p style={{ fontSize: 16, lineHeight: 1.65, margin: '0 0 14px', maxWidth: '42rem' }}>
        YouSafe Marketplace lists consultants and licensed attorneys who publish fixed-price briefs.
        Compare credentials, jurisdictions, languages, and active services before you message or order.
      </p>
      <p style={{ fontSize: 15, lineHeight: 1.65, margin: '0 0 14px', maxWidth: '42rem' }}>
        Profiles are marketplace listings, not a law-firm directory endorsement. Confirm licensure and
        engagement terms on the provider page and in the order contract. For free procedural reading
        without hiring anyone, use{' '}
        <a href="https://legal.yousafeconsultancy.com/" style={{ color: T.indigo }}>
          MyCaseworks
        </a>
        .
      </p>
      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 10px' }}>How to shortlist</h2>
      <ul style={{ margin: '0 0 16px', paddingLeft: '1.2rem', lineHeight: 1.65, fontSize: 15, maxWidth: '42rem' }}>
        <li>Match jurisdiction tags to the country of your filing.</li>
        <li>Prefer clear package scope over the lowest headline price.</li>
        <li>Read active gig descriptions for what is in vs out of the fixed fee.</li>
        <li>Use template packs first if you only need worksheets, not a human review.</li>
      </ul>
      <p style={{ fontSize: 14, color: T.inkSoft, margin: 0 }}>
        Browse the interactive directory below for filters, ratings, and profiles.
      </p>
    </main>
  )
}

export function MarketplaceHomeSeo() {
  const chips = [
    { href: '/categories/immigration', label: 'Immigration' },
    { href: '/categories/education', label: 'Education' },
    { href: '/categories/legal', label: 'Legal' },
    { href: '/templates', label: 'Visa kits' },
    { href: '/shop', label: 'File shop' },
    { href: '/providers', label: 'Providers' },
  ]
  return (
    <nav
      aria-label="Marketplace topics"
      style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}
    >
      <p>Fixed-price briefs. Pay when the work lands. Compare scoped immigration, education, legal, settlement, and career help across the US, UK, Canada, and Australia. Checkout is escrowed. Instant downloads live in the file shop.</p>
      <ul>
        {chips.map((c) => (
          <li key={c.href}><Link href={c.href}>{c.label}</Link></li>
        ))}
      </ul>
    </nav>
  )
}
