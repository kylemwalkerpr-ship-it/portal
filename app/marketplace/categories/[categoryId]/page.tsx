import type { Metadata } from 'next'
import Link from 'next/link'
import { GigDiscoveryPage } from '@/components/marketplace/GigDiscoveryPage'
import { CaseworksReadMoreRail } from '@/components/marketplace/CaseworksReadMoreRail'
import { notFound } from 'next/navigation'
import { buildCategoryOrFilter, resolveCategoryOrSubcategory } from '@/lib/categories'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { getMarketplaceCanonicalUrl } from '@/lib/marketplaceSeo'
import { getCaseworksItemListJsonLd } from '@/lib/caseworksClusterMap'
import { getCategoryEditorial } from '@/lib/categoryEditorial'

interface CategoryPageProps {
  params: Promise<{ categoryId: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

async function countActiveGigsForCategory(filterId: string): Promise<number> {
  try {
    const db = createSupabaseAdminClient()
    let query = db
      .from('gigs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
    const categoryOr = buildCategoryOrFilter([filterId])
    if (categoryOr) query = query.or(categoryOr)
    const { count } = await query
    return count || 0
  } catch {
    return 0
  }
}

export async function generateMetadata({ params, searchParams }: CategoryPageProps): Promise<Metadata> {
  const { categoryId } = await params
  const sp = await searchParams
  const hasUtm = sp && Object.keys(sp).some(k => k.startsWith('utm_'))
  const resolved = resolveCategoryOrSubcategory(categoryId)
  if (!resolved) return { title: 'Marketplace | YouSafe', robots: { index: false } }

  const { category, subcategory } = resolved
  const display = subcategory ?? category
  const count = await countActiveGigsForCategory(subcategory?.id ?? category.id)
  const emptyShelf = count < 1
  const isTopLevelHub = !subcategory && Boolean((display.description || '').trim())
  const allowIndex = !hasUtm && (!emptyShelf || isTopLevelHub)
  const title = emptyShelf
    ? `${display.name} | YouSafe Marketplace`
    : `${display.name} (${count} services) | YouSafe Marketplace`
  const description = (
    display.description ||
    `Browse vetted ${display.name} services on YouSafe Marketplace. Compare fixed-price briefs from consultants and licensed attorneys.`
  ).slice(0, 155)
  const canonicalUrl = getMarketplaceCanonicalUrl(`/marketplace/categories/${categoryId}/`)

  return {
    title,
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: { url: canonicalUrl, title, description, type: 'website' },
    robots: allowIndex
      ? { index: true, follow: true }
      : { index: false, follow: true },
  }
}

const cardStyle = {
  background: 'var(--ys-vellum, #FFFFFF)',
  border: '1px solid var(--ys-rule, rgba(15,23,42,0.10))',
  borderRadius: '16px',
  boxShadow: '0 10px 30px rgba(15,23,42,0.055)',
} as const

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { categoryId } = await params
  const resolved = resolveCategoryOrSubcategory(categoryId)
  if (!resolved) notFound()

  const { category, subcategory } = resolved
  const displayName = subcategory?.name ?? category.name
  const filterId = subcategory?.id ?? category.id
  const activeCount = await countActiveGigsForCategory(filterId)

  const canonicalUrl = getMarketplaceCanonicalUrl(`/marketplace/categories/${categoryId}/`)
  const host = new URL(canonicalUrl).origin
  const displayDescription =
    (subcategory?.description || category.description || '').trim() ||
    `Fixed-price ${displayName} help from vetted consultants and licensed attorneys.`
  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Marketplace', item: `${host}/` },
      { '@type': 'ListItem', position: 2, name: 'Categories', item: `${host}/categories` },
      ...(subcategory
        ? [
            {
              '@type': 'ListItem' as const,
              position: 3,
              name: category.name,
              item: `${host}/categories/${category.id}`,
            },
            { '@type': 'ListItem' as const, position: 4, name: subcategory.name, item: canonicalUrl },
          ]
        : [{ '@type': 'ListItem' as const, position: 3, name: category.name, item: canonicalUrl }]),
    ],
  }
  const caseworksItemList = getCaseworksItemListJsonLd(filterId)
  const siblingSubcategories = subcategory
    ? category.subcategories.filter((s) => s.id !== subcategory.id)
    : category.subcategories
  const editorial =
    getCategoryEditorial(filterId) ||
    getCategoryEditorial(category.id) ||
    null

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />
      {caseworksItemList && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(caseworksItemList) }}
        />
      )}

      <nav
        aria-label="Breadcrumb"
        className="ys-category-breadcrumb mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 pt-4 text-sm"
      >
        <ol style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', listStyle: 'none', margin: 0, padding: 0, lineHeight: 1.45 }}>
          <li><Link href="/" style={{ color: 'inherit', textDecoration: 'none' }}>Marketplace</Link></li>
          <li aria-hidden>/</li>
          <li><Link href="/categories" style={{ color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 3 }}>Categories</Link></li>
          {subcategory && (
            <>
              <li aria-hidden>/</li>
              <li><Link href={`/categories/${category.id}`} style={{ color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 3 }}>{category.name}</Link></li>
            </>
          )}
          <li aria-hidden>/</li>
          <li aria-current="page" style={{ fontWeight: 700 }}>{displayName}</li>
        </ol>
      </nav>

      {/* Keep the first screen conversion-led: a compact category hero followed
          immediately by real services. The deeper SEO / buying guidance stays
          crawlable below the listings instead of becoming a wall of prose above
          the first result on a phone. */}
      <main className="ys-category-main mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 pt-5 pb-3">
        <section
          className="ys-category-hero"
          aria-labelledby="ys-category-title"
          style={{
            ...cardStyle,
            padding: 'clamp(20px, 4vw, 34px)',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ys-onPaperSoft, #526072)', marginBottom: 8 }}>
            YouSafe Marketplace
          </div>
          <h1 id="ys-category-title" style={{ fontSize: 'clamp(28px, 5vw, 42px)', lineHeight: 1.08, fontWeight: 650, letterSpacing: '-0.025em', margin: '0 0 12px', fontFamily: 'var(--font-display, Georgia, serif)' }}>
            {displayName}
          </h1>
          <p style={{ fontSize: 'clamp(15px, 2.5vw, 18px)', lineHeight: 1.6, maxWidth: '50rem', margin: 0, color: 'var(--ys-inkMid, #334155)' }}>
            {displayDescription}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 18 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', minHeight: 32, padding: '6px 10px', borderRadius: 999, background: 'var(--ys-indigoSoft, rgba(60,59,110,0.10))', fontSize: 12, fontWeight: 700 }}>
              {activeCount} active service{activeCount === 1 ? '' : 's'}
            </span>
            <span style={{ fontSize: 12, color: 'var(--ys-onPaperSoft, #64748B)' }}>
              Compare scope, turnaround and provider role before ordering.
            </span>
          </div>
        </section>
      </main>

      <GigDiscoveryPage categoryId={filterId} categoryName={displayName} />

      <section
        aria-label={`${displayName} buying guidance`}
        className="ys-category-guidance mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 mt-8"
      >
        <div style={{ ...cardStyle, padding: 'clamp(18px, 4vw, 30px)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 16 }}>
            <h2 style={{ fontSize: '22px', lineHeight: 1.2, fontWeight: 700, margin: 0 }}>Before you order</h2>
            <span style={{ fontSize: 12, color: 'var(--ys-onPaperSoft, #64748B)' }}>Practical scope guidance</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 12 }}>
            <div style={{ padding: '16px 17px', borderRadius: 12, background: 'var(--ys-paper2, #F8FAFC)', border: '1px solid var(--ys-rule, rgba(15,23,42,0.08))' }}>
              <h3 style={{ fontSize: 15, fontWeight: 750, margin: '0 0 7px' }}>Choose the right scope</h3>
              <p style={{ fontSize: 14, lineHeight: 1.65, margin: 0, color: 'var(--ys-inkMid, #334155)' }}>
                YouSafe Marketplace lists fixed-price briefs from consultants and licensed attorneys. Compare scope, delivery time, and provider role before you request work. Marketplace orders are document-preparation and consulting engagements unless your contract states attorney representation.
              </p>
            </div>
            <div style={{ padding: '16px 17px', borderRadius: 12, background: 'var(--ys-paper2, #F8FAFC)', border: '1px solid var(--ys-rule, rgba(15,23,42,0.08))' }}>
              <h3 style={{ fontSize: 15, fontWeight: 750, margin: '0 0 7px' }}>Self-serve or specialist?</h3>
              <p style={{ fontSize: 14, lineHeight: 1.65, margin: 0, color: 'var(--ys-inkMid, #334155)' }}>
                For free procedural reading — document order, refusal triggers and official-source links — use{' '}
                <a href="https://legal.yousafeconsultancy.com/" style={{ textDecoration: 'underline', textUnderlineOffset: 3 }}>MyCaseworks</a>.
                {' '}Prefer a worksheet first? Browse{' '}
                <Link href="/templates" style={{ textDecoration: 'underline', textUnderlineOffset: 3 }}>template packs</Link>.
              </p>
            </div>
          </div>

          {editorial?.body && editorial.body.length > 0 && (
            <div style={{ marginTop: 20, paddingTop: 18, borderTop: '1px solid var(--ys-rule, rgba(15,23,42,0.10))' }}>
              <h3 style={{ fontSize: 16, fontWeight: 750, margin: '0 0 8px' }}>{displayName} guidance</h3>
              {editorial.body.map((para) => (
                <p key={para.slice(0, 48)} style={{ fontSize: 14, lineHeight: 1.7, maxWidth: '52rem', margin: '8px 0 0', color: 'var(--ys-inkMid, #334155)' }}>
                  {para}
                </p>
              ))}
            </div>
          )}

          {editorial?.compare && editorial.compare.length > 0 && (
            <div style={{ marginTop: 20, paddingTop: 18, borderTop: '1px solid var(--ys-rule, rgba(15,23,42,0.10))' }}>
              <h3 style={{ fontSize: 16, fontWeight: 750, margin: '0 0 9px' }}>What to compare in {displayName}</h3>
              <ul style={{ margin: 0, paddingLeft: '1.15rem', lineHeight: 1.65, fontSize: 14, color: 'var(--ys-inkMid, #334155)' }}>
                {editorial.compare.map((c) => <li key={c} style={{ marginBottom: 5 }}>{c}</li>)}
              </ul>
            </div>
          )}

          {editorial?.nextSteps && (
            <div style={{ marginTop: 18, padding: '13px 15px', borderRadius: 11, background: 'var(--ys-indigoSoft, rgba(60,59,110,0.08))', fontSize: 14, lineHeight: 1.6 }}>
              <strong>Next step:</strong> {editorial.nextSteps}
            </div>
          )}

          {activeCount < 1 && (
            <p style={{ fontSize: 14, lineHeight: 1.6, margin: '18px 0 0', color: 'var(--ys-onPaperSoft, #64748B)' }}>
              No active services in this category right now. Browse{' '}
              <Link href="/categories" style={{ textDecoration: 'underline', textUnderlineOffset: 3 }}>all categories</Link>, read free guides on{' '}
              <a href="https://legal.yousafeconsultancy.com/" style={{ textDecoration: 'underline', textUnderlineOffset: 3 }}>MyCaseworks</a>, or check back soon.
            </p>
          )}
        </div>
      </section>

      {siblingSubcategories.length > 0 && (
        <section
          aria-label={subcategory ? `Related ${category.name} services` : `${category.name} subcategories`}
          className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 mt-8"
        >
          <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '12px' }}>
            {subcategory ? `Related ${category.name} services` : `Browse ${category.name} subcategories`}
          </h2>
          <ul
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: '10px',
              listStyle: 'none',
              padding: 0,
              margin: 0,
            }}
          >
            {siblingSubcategories.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/categories/${s.id}`}
                  style={{
                    display: 'block',
                    padding: '13px 14px',
                    borderRadius: '11px',
                    border: '1px solid var(--ys-rule, rgba(15,23,42,0.10))',
                    background: 'var(--ys-vellum, #FFFFFF)',
                    color: 'inherit',
                    textDecoration: 'none',
                    fontWeight: 650,
                    minHeight: 72,
                  }}
                >
                  {s.name}
                  {s.description && (
                    <span style={{ display: 'block', fontSize: '13px', fontWeight: 400, lineHeight: 1.45, color: 'var(--ys-onPaperSoft, #64748B)', marginTop: '3px' }}>
                      {s.description}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 pb-8">
        <CaseworksReadMoreRail categoryId={category.id} />
      </div>
    </>
  )
}
