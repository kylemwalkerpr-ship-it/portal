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

export default async function Page() {
  return (
    <>
      <SeoIntroBlock
        eyebrow="YouSafe Consultancy"
        title="Study abroad consulting and legal document review in one secure portal."
        description="Trusted by students, attorneys, and consultants across the US, UK, and Canada. Submit your study-abroad application, review legal documents, and message verified providers — all in your preferred language."
      />
      <HomeClient />
    </>
  )
}
