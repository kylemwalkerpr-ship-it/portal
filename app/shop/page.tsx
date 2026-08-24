import type { Metadata } from 'next'
import FilesShop from './FilesShop'
import { FILE_SHOP_PRODUCTS } from '@/lib/files-shop-catalog'

const CANONICAL = 'https://market.yousafeconsultancy.com/shop'
const TITLE = 'File shop — instant-download tools | YouSafe Consultancy'
const DESCRIPTION =
  'Workbooks, templates, and short guides for consultants, operators, and families. Pay once on Payhip, download instantly. No subscription.'

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
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: TITLE,
    url: CANONICAL,
    description: DESCRIPTION,
    isPartOf: { '@type': 'WebSite', name: 'YouSafe Marketplace', url: 'https://market.yousafeconsultancy.com/' },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: FILE_SHOP_PRODUCTS.length,
      itemListElement: FILE_SHOP_PRODUCTS.map((p, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: p.href,
        name: p.title,
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
