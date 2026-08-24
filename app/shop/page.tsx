import type { Metadata } from 'next'
import FilesShop from './FilesShop'

const CANONICAL = 'https://market.yousafeconsultancy.com/shop'
const TITLE = 'File shop — instant-download tools | YouSafe Consultancy'
const DESCRIPTION =
  'Spreadsheets, templates, and short guides for solo operators. Pay once on Payhip, download instantly. No subscription.'

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
  return <FilesShop />
}
