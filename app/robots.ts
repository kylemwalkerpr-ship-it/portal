import type { MetadataRoute } from 'next'

const SITE_URL = 'https://portal.yousafeconsultancy.com'

/**
 * Portal is the authenticated members area. Everything except /api/ is
 * already `noindex` via per-page or layout-level metadata, so Googlebot
 * is welcome to crawl — the noindex meta directives keep pages out of
 * the index without blocking discovery.
 *
 * Important: do NOT add `/sign-in`, `/sign-up`, `/dashboard`, or any
 * other portal route here. Blocking those in robots.txt prevents
 * Googlebot from seeing their noindex meta tag, AND it kills the link
 * signal flowing in from the marketing tier (yousafeconsultancy.com,
 * usa.*, ca.* — they collectively link to /sign-up/student 156 times,
 * /sign-in/student 111 times, etc.). Crawl-blocking those pages
 * stranded the link equity. The noindex meta does the actual work.
 *
 * /api/ stays disallowed — those are JSON endpoints with no SEO value
 * and we don't want crawlers exercising them.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
