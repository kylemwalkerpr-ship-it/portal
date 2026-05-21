import type { Metadata } from 'next'
import { EstateFooter } from '@/components/EstateFooter'
import { headers } from 'next/headers'
import { translateBatch } from '@/lib/serverTranslate'
import SignUpClient from './SignUpClient'

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

async function activeLane(): Promise<string> {
  try {
    const h = await headers()
    const pathname = h.get('x-pathname') || ''
    const segs = pathname.split('?')[0].split('/').filter(Boolean)
    if (segs[0] === 'sign-up' && segs[1] && VALID_LANES.has(segs[1])) return segs[1]
  } catch { /* fall through */ }
  return 'student'
}

export async function generateMetadata(): Promise<Metadata> {
  const lang = await activeLang()
  const lane = await activeLane()
  const titleEn = 'Create your YouSafe account'
  const descEn  = 'Sign up for YouSafe Consultancy — students, attorneys, and consultants. Free to start, secure by design.'
  const [title, description] = await translateBatch([titleEn, descEn], lang)
  return {
    title,
    description,
    // No canonical on noindex pages — see /sign-in for rationale.
    alternates: { canonical: null },
    openGraph: { title, description, type: 'website' },
    twitter:   { title, description, card: 'summary' },
    robots:    { index: false, follow: true },
  }
}

export default function SignUpPage() {
  return (
    <>
      <SignUpClient />
      <EstateFooter />
    </>
  )
}
