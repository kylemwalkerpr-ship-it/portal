/**
 * HreflangTags — server component
 *
 * Emits one <link rel="alternate" hreflang> per supported language plus
 * x-default on every page (mounted from app/layout.tsx). Designed to be
 * dirt-cheap on the request path so it can't contribute to Cloudflare
 * Workers 1102 (CPU/wall-time) errors:
 *
 *   - Pure synchronous string concat after a single headers() read.
 *   - All exceptions swallowed; falls back to static portal-root URLs.
 *   - No external I/O, no DB, no fetch.
 */
import { headers } from 'next/headers'

const SITE_FALLBACK = 'https://portal.yousafeconsultancy.com'

const LANGUAGES = ['en', 'es', 'fr', 'ar', 'zh', 'hi', 'pt'] as const

export async function HreflangTags() {
  let host = ''
  let proto = 'https'
  let pathname = '/'

  try {
    const h = await headers()
    host  = h.get('x-forwarded-host') || h.get('host') || ''
    proto = h.get('x-forwarded-proto') || 'https'
    pathname = h.get('x-pathname') || '/'
  } catch {
    /* headers() can fail in some edge runtime contexts — fall through */
  }

  const origin = host ? `${proto}://${host}` : SITE_FALLBACK

  // Split path / query without instantiating URLSearchParams (saves CPU
  // on the hot path).
  const qIdx = pathname.indexOf('?')
  const path = qIdx >= 0 ? pathname.slice(0, qIdx) : pathname
  const rawQuery = qIdx >= 0 ? pathname.slice(qIdx + 1) : ''

  // Strip an existing lang= so we don't double-stack.
  const baseQuery = rawQuery
    .split('&')
    .filter(p => p && !p.startsWith('lang='))
    .join('&')

  const buildHref = (langCode: string | null) => {
    let q = baseQuery
    if (langCode) q = q ? `${q}&lang=${langCode}` : `lang=${langCode}`
    return `${origin}${path}${q ? `?${q}` : ''}`
  }

  return (
    <>
      {LANGUAGES.map(code => (
        <link key={code} rel="alternate" hrefLang={code} href={buildHref(code)} />
      ))}
      <link rel="alternate" hrefLang="x-default" href={buildHref(null)} />
    </>
  )
}
