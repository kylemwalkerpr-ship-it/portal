import type { Metadata } from 'next'
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
  const descEn  = 'Sign in to your YouSafe Consultancy account — students, attorneys, consultants, and admins.'
  const [title, description] = await translateBatch([titleEn, descEn], lang)
  return {
    title,
    description,
    // Self-canonical per lane so Screaming Frog stops reporting each
    // /sign-in/{lane} as Canonicalised to the portal root. The pages stay
    // noindex either way; this is purely cosmetic for the crawl report.
    alternates: { canonical: `https://portal.yousafeconsultancy.com/sign-in/${lane}` },
    openGraph: { title, description, type: 'website' },
    twitter:   { title, description, card: 'summary' },
    robots:    { index: false, follow: true },
  }
}

export default function SignInPage() {
  return <SignInClient />
}
