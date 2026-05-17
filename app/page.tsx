import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { translateBatch } from '@/lib/serverTranslate'
import { SeoIntroBlock } from '@/components/SeoIntroBlock'
import HomeClient from './HomeClient'

const SUPPORTED_LANGS = new Set(['en', 'es', 'fr', 'ar', 'zh', 'hi', 'pt'])

async function activeLang(): Promise<string> {
  try {
    const h = await headers()
    const v = h.get('x-lang')
    if (v && SUPPORTED_LANGS.has(v)) return v
  } catch { /* default */ }
  return 'en'
}

/**
 * Per-language metadata. Google weights <title> and <meta description>
 * heavily; translating these is the single highest-value SEO move for
 * non-English search visibility. Cached in the translations table after
 * the first hit, so subsequent renders are free.
 */
export async function generateMetadata(): Promise<Metadata> {
  const lang = await activeLang()
  const titleEn = 'YouSafe Portal — Study Abroad & Legal Services'
  const descEn  =
    'Members portal for YouSafe Consultancy. Study-abroad consulting and US, UK and Canada legal document review — students, attorneys, consultants, and admins in one secure portal.'
  const [title, description] = await translateBatch([titleEn, descEn], lang)
  return {
    title,
    description,
    openGraph: { title, description, type: 'website' },
    twitter:   { title, description, card: 'summary_large_image' },
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
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(HOMEPAGE_JSONLD) }}
      />
      <SeoIntroBlock
        eyebrow="YouSafe Consultancy"
        title="Study abroad consulting and legal document review in one secure portal."
        description="Trusted by students, attorneys, and consultants across the US, UK, and Canada. Submit your study-abroad application, review legal documents, and message verified providers — all in your preferred language."
      />
      <HomeClient />
    </>
  )
}
