import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'

const PORTAL_HOST = 'portal.yousafeconsultancy.com'
const MARKET_HOST = 'market.yousafeconsultancy.com'

/**
 * Portal is the authenticated members area. Everything except /api/ is
 * already `noindex` via per-page or layout-level metadata, so Googlebot
 * is welcome to crawl — the noindex meta directives keep pages out of
 * the index without blocking discovery.
 *
 * Important: do NOT add `/sign-in`, `/sign-up`, `/dashboard`, or any
 * other portal route here. Blocking those in robots.txt prevents
 * Googlebot from seeing their noindex meta tag, AND it kills the link
 * signal flowing in from the marketing tier.
 *
 * Host-aware: the same app serves market.yousafeconsultancy.com. Never
 * emit a non-standard `host:` field (Bing can misread it; Google ignores
 * it). Sitemap must match the request host. Portal emits an empty
 * sitemap; only market lists commercial URLs (2026-08-27 crawl).
 *
 * /api/ stays disallowed — JSON endpoints with no SEO value.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  let host = PORTAL_HOST
  try {
    const h = await headers()
    const raw = h.get('host')?.split(':')[0]?.toLowerCase()
    if (raw === MARKET_HOST || raw === PORTAL_HOST) host = raw
  } catch {
    // Build-time / static generation fallback — portal is the default app host.
  }

  const base = `https://${host}`

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/_next/static/'],
    },
    sitemap: `${base}/sitemap.xml`,
  }
}
