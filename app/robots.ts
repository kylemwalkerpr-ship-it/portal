import type { MetadataRoute } from 'next'

const SITE_URL = 'https://portal.yousafeconsultancy.com'

/**
 * Portal is the authenticated members area. We keep it OUT of indexes —
 * the marketing surfaces (yousafeconsultancy.com, usa.*, ca.*, checkout.*,
 * legal.yousafeconsultancy.com) carry SEO. Googlebot is still allowed to
 * crawl so internal-link signals from the marketing tier reach the portal,
 * but every page returns `noindex` via the layout metadata.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/dashboard',
        '/sign-in',
        '/sign-up',
        '/marketplace',
        '/sellers',
        '/user',
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
