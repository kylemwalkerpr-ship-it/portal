/**
 * <T> — server-rendered translation primitive
 *
 * Wraps a string so it is translated on the server before the HTML reaches
 * the browser. Required for SEO: crawlers index the initial HTML, not the
 * post-hydration text.
 *
 * Usage (in any SERVER component):
 *   <h1><T>Welcome to YouSafe</T></h1>
 *   <p><T>{description}</T></p>
 *
 * Or via the helper for attribute strings:
 *   <input placeholder={await t('Search services…')} />
 *
 * Active language is resolved from the `x-lang` header set by middleware
 * (which honours ?lang=…, then Accept-Language). Falls back to 'en' on
 * any failure — translation is never fatal.
 *
 * Client components can't await — for those, keep using the existing
 * TranslationBoundary client-side walker.
 */
import { headers } from 'next/headers'
import { translateString } from '@/lib/serverTranslate'

async function currentLang(): Promise<string> {
  try {
    const h = await headers()
    const fromHeader = h.get('x-lang')
    if (fromHeader && /^[a-z]{2}$/.test(fromHeader)) return fromHeader
  } catch { /* fall through */ }
  return 'en'
}

interface TProps {
  children: string
  /** Override the active language for this single string. */
  lang?: string
}

export async function T({ children, lang }: TProps) {
  const target = lang || (await currentLang())
  if (target === 'en' || !children) return <>{children}</>
  const translated = await translateString(children, target)
  return <>{translated}</>
}

/** Direct translate helper for attribute values (placeholders, alt, title). */
export async function t(text: string, lang?: string): Promise<string> {
  const target = lang || (await currentLang())
  if (target === 'en' || !text) return text
  return translateString(text, target)
}
