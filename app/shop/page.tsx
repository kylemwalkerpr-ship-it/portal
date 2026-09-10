import type { Metadata } from 'next'
import FilesShop from './FilesShop'
import { FILE_SHOP_PRODUCTS } from '@/lib/files-shop-catalog'

const CANONICAL = 'https://market.yousafeconsultancy.com/shop'
const TITLE = 'File shop — instant-download tools | YouSafe Consultancy'
const DESCRIPTION =
  'Immigration preparation packs, workbooks, templates, and short guides in one catalog. Pay once on Payhip, download instantly. No subscription.'

export const revalidate = 3600

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: CANONICAL },
  robots: { index: true, follow: true },
  openGraph: {
    url: CANONICAL,
    title: TITLE,
    description: DESCRIPTION,
    type: 'website',
    siteName: 'YouSafe Consultancy',
  },
}

export default function ShopPage() {
  const products = FILE_SHOP_PRODUCTS.filter((product) => product.published)
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: TITLE,
    url: CANONICAL,
    description: DESCRIPTION,
    isPartOf: { '@type': 'WebSite', name: 'YouSafe Marketplace', url: 'https://market.yousafeconsultancy.com/' },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: products.length,
      itemListElement: products.map((product, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: product.href.startsWith('/') ? `${CANONICAL.replace(/\/shop$/, '')}${product.href}` : product.href,
        name: product.title,
      })),
    },
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <FilesShop />
    </>
  )
}
