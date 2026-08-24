import type { CSSProperties } from 'react'
import Link from 'next/link'
import { CATEGORIES } from '@/lib/categories'

const wrap: CSSProperties = {
  maxWidth: 960,
  margin: '0 auto',
  padding: '32px 20px 24px',
  fontFamily: 'var(--font-inter), system-ui, sans-serif',
  color: '#0F172A',
}

/**
 * Server-rendered editorial + link graph for marketplace index routes that
 * otherwise hydrate as client-only shells (categories / providers indexes).
 */
export function CategoriesIndexSeo() {
  return (
    <main style={wrap}>
      <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#64748B', margin: '0 0 8px' }}>
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
        <a href="https://legal.yousafeconsultancy.com/" style={{ color: '#1E3A5F' }}>
          MyCaseworks
        </a>
        . Prefer self-serve worksheets? Open{' '}
        <Link href="/templates" style={{ color: '#1E3A5F' }}>
          visa template packs
        </Link>
        {' '}or the{' '}
        <Link href="/shop" style={{ color: '#1E3A5F' }}>
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
              border: '1px solid rgba(15,23,42,0.08)',
              borderRadius: 12,
              padding: '14px 16px',
              background: '#fff',
            }}
          >
            <Link href={`/categories/${cat.id}`} style={{ fontWeight: 700, fontSize: 16, color: '#0F172A', textDecoration: 'none' }}>
              {cat.name}
            </Link>
            <p style={{ fontSize: 14, lineHeight: 1.55, margin: '6px 0 10px', color: '#475569' }}>
              {cat.description}
            </p>
            {cat.subcategories?.length > 0 && (
              <p style={{ fontSize: 13, margin: 0, lineHeight: 1.6 }}>
                {cat.subcategories.slice(0, 8).map((s, i) => (
                  <span key={s.id}>
                    {i > 0 ? ' · ' : ''}
                    <Link href={`/categories/${s.id}`} style={{ color: '#1E3A5F' }}>
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
      <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#64748B', margin: '0 0 8px' }}>
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
        <a href="https://legal.yousafeconsultancy.com/" style={{ color: '#1E3A5F' }}>
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
      <p style={{ fontSize: 14, color: '#64748B', margin: 0 }}>
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
    <section aria-label="Marketplace overview" style={{ borderTop: '1px solid #E2E8F0', background: '#F8FAFC', padding: '28px 20px 36px' }}>
      <div style={{ maxWidth: 1120, margin: '0 auto' }}>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#64748B', margin: '0 0 8px' }}>
          How it works
        </p>
        <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 8px', letterSpacing: '-0.02em' }}>
          Fixed-price briefs. Pay when the work lands.
        </h2>
        <p style={{ fontSize: 15, lineHeight: 1.55, margin: '0 0 16px', maxWidth: '40rem', color: '#475569' }}>
          Compare scoped immigration, education, legal, settlement, and career help across the US, UK,
          Canada, and Australia. Checkout is escrowed. Instant downloads live in the file shop.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {chips.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '8px 14px',
                borderRadius: 999,
                background: '#0F172A',
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              {c.label}
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
