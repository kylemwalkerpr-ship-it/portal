import type { Metadata } from 'next'
import { GigDiscoveryPage } from '@/components/marketplace/GigDiscoveryPage'
import { CaseworksReadMoreRail } from '@/components/marketplace/CaseworksReadMoreRail'
import { redirect } from 'next/navigation'
import { getCategoryById } from '@/lib/categories'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { getMarketplaceCanonicalUrl } from '@/lib/marketplaceSeo'
import { getCaseworksItemListJsonLd } from '@/lib/caseworksClusterMap'

interface CategoryPageProps {
  params: Promise<{ categoryId: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { categoryId } = await params
  const category = getCategoryById(categoryId)
  if (!category) return { title: 'Marketplace | YouSafe', robots: { index: false } }

  let count = 0
  try {
    const db = createSupabaseAdminClient()
    const { count: c } = await db
      .from('gigs')
      .select('id', { count: 'exact', head: true })
      .eq('category', categoryId)
      .eq('status', 'active')
    count = c || 0
  } catch { /* count is best-effort */ }

  const title = `${category.name}${count ? ` (${count} services)` : ''} | YouSafe Marketplace`
  const description = (category.description || `Browse ${category.name} services on YouSafe Consultancy.`).slice(0, 155)
  const canonicalUrl = await getMarketplaceCanonicalUrl(`/marketplace/categories/${categoryId}/`)

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
  const category = getCategoryById(categoryId)

  if (!category) {
    redirect('/marketplace')
  }

  // BreadcrumbList + ItemList JSON-LD — surfaces this page in rich results
  // and signals the editorial relationship between this category and the
  // caseworks cluster it draws from.
  const canonicalUrl = await getMarketplaceCanonicalUrl(`/marketplace/categories/${categoryId}/`)
  const host = new URL(canonicalUrl).origin
  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Marketplace', item: `${host}/marketplace/` },
      { '@type': 'ListItem', position: 2, name: 'Categories', item: `${host}/marketplace/categories/` },
      { '@type': 'ListItem', position: 3, name: category.name, item: canonicalUrl },
    ],
  }
  const caseworksItemList = getCaseworksItemListJsonLd(categoryId)

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
      <GigDiscoveryPage categoryId={categoryId} categoryName={category.name} />
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        <CaseworksReadMoreRail categoryId={categoryId} />
      </div>
    </>
  )
}
