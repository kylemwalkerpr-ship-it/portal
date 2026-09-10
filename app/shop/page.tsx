import type { Metadata } from 'next'
import FilesShop from './FilesShop'
import { FILE_SHOP_PRODUCTS } from '@/lib/files-shop-catalog'
import { IMMIGRATION_SHOP_PRODUCTS } from '@/lib/immigration-shop-products'

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
  const legacyItems = FILE_SHOP_PRODUCTS.filter((product) => product.published).map((product, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    url: product.href,
    name: product.title,
  }))
  const immigrationItems = IMMIGRATION_SHOP_PRODUCTS.filter((product) => product.payhip_published).map((product, index) => ({
    '@type': 'ListItem',
    position: legacyItems.length + index + 1,
    url: `${CANONICAL}/${product.slug}`,
    name: product.name,
  }))

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: TITLE,
    url: CANONICAL,
    description: DESCRIPTION,
    isPartOf: { '@type': 'WebSite', name: 'YouSafe Marketplace', url: 'https://market.yousafeconsultancy.com/' },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: legacyItems.length + immigrationItems.length,
      itemListElement: [...legacyItems, ...immigrationItems],
    },
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <FilesShop />
    </>
  )
}
