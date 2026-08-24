import type { Metadata } from 'next'
import { EstateFooter } from '@/components/EstateFooter'
import { headers } from 'next/headers'
import { translateBatch } from '@/lib/serverTranslate'
import SignInClient from './SignInClient'

const SUPPORTED_LANGS = new Set(['en', 'es', 'fr', 'ar', 'zh', 'hi', 'pt'])
const VALID_LANES = new Set(['student', 'consultant', 'attorney', 'admin'])

async function activeLang(): Promise<string> {
  try {
    const h = await headers()
    const v = h.get('x-lang')
    if (v && SUPPORTED_LANGS.has(v)) return v
  } catch { /* default */ }
  return 'en'
}

/** Pull the first path segment after /sign-in/ as the lane name. */
async function activeLane(): Promise<string> {
  try {
    const h = await headers()
    const pathname = h.get('x-pathname') || ''
    const segs = pathname.split('?')[0].split('/').filter(Boolean)
    // ['sign-in', 'student', ...]
    if (segs[0] === 'sign-in' && segs[1] && VALID_LANES.has(segs[1])) return segs[1]
  } catch { /* fall through */ }
  return 'student'
}

export async function generateMetadata(): Promise<Metadata> {
  const lang = await activeLang()
  const lane = await activeLane()
  const titleEn = 'Sign in to YouSafe Portal'
  const descEn  = 'Sign in to your YouSafe Consultancy account — clients, attorneys, consultants, and admins.'
  const [title, description] = await translateBatch([titleEn, descEn], lang)
  return {
    title,
    description,
    // No canonical on noindex pages. Google ignores canonical on noindex
    // pages anyway, and emitting one (whether self or root) makes Screaming
    // Frog flag the page as either "Canonicalised" or "Non-Indexable
    // Canonical." Setting null explicitly removes the inherited root-layout
    // canonical so no <link rel="canonical"> is rendered at all.
    alternates: { canonical: null },
    openGraph: { title, description, type: 'website' },
    twitter:   { title, description, card: 'summary' },
    robots:    { index: false, follow: true },
  }
}

export default function SignInPage() {
  return (
    <>
      <SignInClient />
      <EstateFooter />
    </>
  )
}
