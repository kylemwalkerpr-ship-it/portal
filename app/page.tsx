import type { Metadata } from 'next'
import { EstateFooter } from '@/components/EstateFooter'
import { SeoIntroBlock } from '@/components/SeoIntroBlock'
import HomeClient from './HomeClient'
import { getFeaturedGigs } from '@/components/design/landing/data/featured-services'

// Portal is noindex sitewide (see layout.tsx robots config), so translated
// metadata has zero SEO value. We keep static English metadata here to avoid
// the SSR CPU cost of activeLang() + translateBatch() + Supabase cache
// lookup + potential MyMemory API call on every cold start.
export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'YouSafe Portal — Study Abroad & Legal Services',
    description:
      'Members portal for YouSafe Consultancy. Study-abroad consulting and US, UK and Canada legal document review — students, attorneys, consultants, and admins in one secure portal.',
    openGraph: { title: 'YouSafe Portal — Study Abroad & Legal Services', description: 'Members portal for YouSafe Consultancy. Study-abroad consulting and US, UK and Canada legal document review — students, attorneys, consultants, and admins in one secure portal.', type: 'website' },
    twitter:   { title: 'YouSafe Portal — Study Abroad & Legal Services', description: 'Members portal for YouSafe Consultancy. Study-abroad consulting and US, UK and Canada legal document review — students, attorneys, consultants, and admins in one secure portal.', card: 'summary_large_image' },
  }
}

const PORTAL_URL = 'https://portal.yousafeconsultancy.com'
const BRAND_URL = 'https://yousafeconsultancy.com'

// WebSite + Organization JSON-LD, server-rendered so crawlers see it on the
// initial HTML response. SearchAction targets /marketplace?q= which is the
// portal's gig search endpoint (params consumed by GigDiscoveryPage).
const HOMEPAGE_JSONLD = [
  {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'YouSafe Portal',
    url: PORTAL_URL,
    publisher: { '@id': `${BRAND_URL}#org` },
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${PORTAL_URL}/marketplace?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  },
  {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${BRAND_URL}#org`,
    name: 'YouSafe Consultancy',
    url: BRAND_URL,
    logo: `${BRAND_URL}/logo.png`,
    sameAs: [BRAND_URL],
  },
]

export default async function Page() {
  const gigs = await getFeaturedGigs()

  return (
    <>
      <link
        rel="preload"
        as="image"
        href="https://media.yousafeconsultancy.com/hero/student-working.poster.jpg?v=20260524"
        fetchPriority="high"
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(HOMEPAGE_JSONLD) }}
      />
      <SeoIntroBlock
        eyebrow="YouSafe Consultancy"
        title="Study abroad consulting and legal document review in one secure portal."
        description="Trusted by students, attorneys, and consultants across the US, UK, and Canada. Submit your study-abroad application, review legal documents, and message verified providers — all in your preferred language."
      />
      <HomeClient gigs={gigs} />
      <EstateFooter />
    </>
  )
}
