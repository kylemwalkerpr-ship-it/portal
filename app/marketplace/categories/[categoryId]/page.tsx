import type { Metadata } from 'next'
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

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { categoryId } = await params
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

  const title = `${display.name}${count ? ` (${count} services)` : ''} | YouSafe Marketplace`
  const description = (display.description || `Browse ${display.name} services on YouSafe Consultancy.`).slice(0, 155)
  const canonicalUrl = getMarketplaceCanonicalUrl(`/marketplace/categories/${categoryId}/`)

  return {
    title,
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: { url: canonicalUrl, title, description, type: 'website' },
    robots: { index: true, follow: true },
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

  const canonicalUrl = getMarketplaceCanonicalUrl(`/marketplace/categories/${categoryId}/`)
  const host = new URL(canonicalUrl).origin
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
      <GigDiscoveryPage categoryId={filterId} categoryName={displayName} />
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        <CaseworksReadMoreRail categoryId={category.id} />
      </div>
    </>
  )
}
