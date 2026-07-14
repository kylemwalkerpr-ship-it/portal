import type { Metadata } from 'next'
import Link from 'next/link'
import { GigDiscoveryPage } from '@/components/marketplace/GigDiscoveryPage'
import { CaseworksReadMoreRail } from '@/components/marketplace/CaseworksReadMoreRail'
import { notFound } from 'next/navigation'
import { resolveCategoryOrSubcategory } from '@/lib/categories'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { getMarketplaceCanonicalUrl } from '@/lib/marketplaceSeo'
import { getCaseworksItemListJsonLd } from '@/lib/caseworksClusterMap'

interface CategoryPageProps {
  params: Promise<{ categoryId: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export async function generateMetadata({ params, searchParams }: CategoryPageProps): Promise<Metadata> {
  const { categoryId } = await params
  const sp = await searchParams
  const hasUtm = sp && Object.keys(sp).some(k => k.startsWith('utm_'))
  const resolved = resolveCategoryOrSubcategory(categoryId)
  // notFound() in generateMetadata triggers Next's 404 boundary cleanly.
  // Returning a thin noindex Metadata + letting the page-level notFound()
  // handle the response is the canonical approach for app-router.
  if (!resolved) return { title: 'Marketplace | YouSafe', robots: { index: false } }

  const { category, subcategory } = resolved
  const display = subcategory ?? category

  let count = 0
  try {
    const db = createSupabaseAdminClient()
    let query = db
      .from('gigs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
    query = subcategory
      ? query.eq('subcategory', subcategory.id)
      : query.eq('category', category.id)
    const { count: c } = await query
    count = c || 0
  } catch { /* count is best-effort */ }

  // Empty shelves should not rank (2026-07-14 SEO deep strategy §5.2).
  // Keep crawlable with follow so inbound caseworks links still pass equity
  // once supply is listed; remove from sitemap when count is 0.
  const emptyShelf = count < 1
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
    robots: hasUtm || emptyShelf
      ? { index: false, follow: true }
      : { index: true, follow: true },
  }
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { categoryId } = await params
  const resolved = resolveCategoryOrSubcategory(categoryId)

  // Genuinely unknown id → 404. We previously redirected to /marketplace
  // which, under static export, degraded to a meta-refresh HTML page —
  // Ahrefs flagged every such URL for "missing H1", "non-canonical", and
  // "meta refresh redirect" (hundreds of rows from caseworks inbound
  // links). A proper notFound() returns 404 and lets the noindex page
  // template render with a real H1.
  if (!resolved) notFound()

  const { category, subcategory } = resolved
  const displayName = subcategory?.name ?? category.name
  // Filter discovery by subcategory when present so the page actually
  // shows the right gigs for caseworks-linked subcategory URLs.
  const filterId = subcategory?.id ?? category.id

  // Active-gig count for empty-shelf UI + indexing policy (matches generateMetadata).
  let activeCount = 0
  try {
    const db = createSupabaseAdminClient()
    let query = db
      .from('gigs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
    query = subcategory
      ? query.eq('subcategory', subcategory.id)
      : query.eq('category', category.id)
    const { count: c } = await query
    activeCount = c || 0
  } catch { /* best-effort */ }

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

  // Sibling subcategories for the "Browse related" rail. When the
  // current page is a top-level category, this lists all its
  // subcategories (so the category page hands inlinks to children).
  // When the current page IS a subcategory, this lists its siblings
  // under the same parent (so the subcategory pages stop being
  // orphans + start having real outlinks instead of just JSON-LD).
  //
  // 2026-06-02 audit caught 39 orphan + 32 no-outlinks rows because
  // subcategory pages emitted only JSON-LD breadcrumbs (script tags)
  // and a client-rendered GigDiscoveryPage that was empty for low-
  // gig subcategories. Ahrefs counts HTML anchors, not JSON-LD —
  // so an empty subcategory page emitted zero internal links.
  const siblingSubcategories = subcategory
    ? category.subcategories.filter((s) => s.id !== subcategory.id)
    : category.subcategories

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
      {/* HTML breadcrumb — Ahrefs counts these anchors as internal
          inlinks/outlinks. The JSON-LD breadcrumb above feeds the
          rich-snippet rail; this nav feeds the link graph. */}
      <nav
        aria-label="Breadcrumb"
        className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 pt-4 text-sm"
      >
        <ol style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', listStyle: 'none', margin: 0, padding: 0 }}>
          <li><Link href="/" style={{ color: 'inherit', textDecoration: 'none' }}>Marketplace</Link></li>
          <li aria-hidden>/</li>
          <li><Link href="/categories" style={{ color: 'inherit', textDecoration: 'underline' }}>Categories</Link></li>
          {subcategory && (
            <>
              <li aria-hidden>/</li>
              <li><Link href={`/categories/${category.id}`} style={{ color: 'inherit', textDecoration: 'underline' }}>{category.name}</Link></li>
            </>
          )}
          <li aria-hidden>/</li>
          <li aria-current="page" style={{ fontWeight: 600 }}>{displayName}</li>
        </ol>
      </nav>
      {/* Editorial intro — category pages were listing-only shells (~170w).
          Visible body copy + H1 context for indexable categories with supply. */}
      <header className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 pt-6 pb-2">
        <h1 style={{ fontSize: '28px', fontWeight: 700, margin: '0 0 10px' }}>{displayName}</h1>
        <p style={{ fontSize: '16px', lineHeight: 1.55, maxWidth: '48rem', margin: 0, opacity: 0.9 }}>
          {displayDescription}
        </p>
        {activeCount < 1 ? (
          <p style={{ fontSize: '14px', marginTop: '12px', opacity: 0.75 }}>
            No active services in this category right now. Browse{' '}
            <Link href="/categories" style={{ textDecoration: 'underline' }}>
              all categories
            </Link>
            , read free guides on{' '}
            <a href="https://legal.yousafeconsultancy.com/" style={{ textDecoration: 'underline' }}>
              MyCaseworks
            </a>
            , or check back soon as providers list new briefs.
          </p>
        ) : (
          <p style={{ fontSize: '14px', marginTop: '12px', opacity: 0.75 }}>
            {activeCount} active service{activeCount === 1 ? '' : 's'} — compare price, turnaround, and
            provider role before you order.
          </p>
        )}
      </header>
      <GigDiscoveryPage categoryId={filterId} categoryName={displayName} />
      {/* Sibling-subcategories rail — gives this page real outlinks
          (HTML anchors, not JSON-LD) AND gives every sibling page a
          fresh inlink from this page. Clears the orphan + no-
          outlinks flags from the 2026-06-02 audit in one shot. */}
      {siblingSubcategories.length > 0 && (
        <section
          aria-label={subcategory ? `Related ${category.name} services` : `${category.name} subcategories`}
          className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 mt-12"
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
                    padding: '12px 14px',
                    borderRadius: '8px',
                    border: '1px solid rgba(0,0,0,0.08)',
                    background: 'rgba(0,0,0,0.02)',
                    color: 'inherit',
                    textDecoration: 'none',
                    fontWeight: 500,
                  }}
                >
                  {s.name}
                  {s.description && (
                    <span style={{ display: 'block', fontSize: '13px', fontWeight: 400, opacity: 0.7, marginTop: '2px' }}>
                      {s.description}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        <CaseworksReadMoreRail categoryId={category.id} />
      </div>
    </>
  )
}
