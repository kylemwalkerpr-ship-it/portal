import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'

const PORTAL_HOST = 'portal.yousafeconsultancy.com'
const MARKET_HOST = 'market.yousafeconsultancy.com'

function firstHost(value: string | null): string {
  if (!value) return ''
  return value.split(',')[0].trim().split(':')[0].toLowerCase()
}

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
 * emit a non-standard `host:` field. Only the public marketplace owns
 * commercial sitemap URLs; portal intentionally advertises no sitemap.
 *
 * /api/ stays disallowed — JSON endpoints with no SEO value.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  let host = PORTAL_HOST
  try {
    const h = await headers()
    const candidates = [
      firstHost(h.get('x-forwarded-host')),
      firstHost(h.get('x-original-host')),
      firstHost(h.get('host')),
    ].filter(Boolean)

    // Cloudflare/OpenNext may preserve the public host in a forwarded header
    // while `host` points at the Worker. Prefer any explicit Marketplace host
    // signal so robots.txt reliably advertises the gig sitemap to crawlers.
    if (candidates.some((candidate) => candidate === MARKET_HOST)) {
      host = MARKET_HOST
    } else if (candidates.some((candidate) => candidate === PORTAL_HOST || candidate.startsWith('portal.'))) {
      host = PORTAL_HOST
    }
  } catch {
    // Build-time / static generation fallback — portal is the default app host.
  }

  const result: MetadataRoute.Robots = {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/_next/static/'],
    },
  }

  if (host === MARKET_HOST) {
    result.sitemap = `https://${MARKET_HOST}/sitemap.xml`
  }

  return result
}
