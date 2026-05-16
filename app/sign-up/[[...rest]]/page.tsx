import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { translateBatch } from '@/lib/serverTranslate'
import SignUpClient from './SignUpClient'

const SUPPORTED_LANGS = new Set(['en', 'es', 'fr', 'ar', 'zh', 'hi', 'pt'])

async function activeLang(): Promise<string> {
  try {
    const h = await headers()
    const v = h.get('x-lang')
    if (v && SUPPORTED_LANGS.has(v)) return v
  } catch { /* default */ }
  return 'en'
}

export async function generateMetadata(): Promise<Metadata> {
  const lang = await activeLang()
  const titleEn = 'Create your YouSafe account'
  const descEn  = 'Sign up for YouSafe Consultancy — students, attorneys, and consultants. Free to start, secure by design.'
  const [title, description] = await translateBatch([titleEn, descEn], lang)
  return {
    title,
    description,
    openGraph: { title, description, type: 'website' },
    twitter:   { title, description, card: 'summary' },
    robots:    { index: true, follow: true },
  }
}

export default function SignUpPage() {
  return <SignUpClient />
}
