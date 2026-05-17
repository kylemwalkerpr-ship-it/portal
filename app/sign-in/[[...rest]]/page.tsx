import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { translateBatch } from '@/lib/serverTranslate'
import SignInClient from './SignInClient'

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
  const titleEn = 'Sign in to YouSafe Portal'
  const descEn  = 'Sign in to your YouSafe Consultancy account — students, attorneys, consultants, and admins.'
  const [title, description] = await translateBatch([titleEn, descEn], lang)
  return {
    title,
    description,
    openGraph: { title, description, type: 'website' },
    twitter:   { title, description, card: 'summary' },
    robots:    { index: false, follow: true },
  }
}

export default function SignInPage() {
  return <SignInClient />
}
