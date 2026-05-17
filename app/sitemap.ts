import type { MetadataRoute } from 'next'

/**
 * Portal sitemap — intentionally minimal.
 *
 * The portal is the authenticated members area. Every catalog page
 * (`/marketplace/*`, `/sellers/*`) calls `requirePortalUser()` and
 * server-redirects unauthenticated visitors to `/sign-in/student`. Googlebot
 * follows the redirect, indexes nothing useful, and we waste crawl budget
 * on dead promises.
 *
 * The SEO surface lives on the marketing tier:
 *   - yousafeconsultancy.com         (landing-page repo)
 *   - usa.yousafeconsultancy.com     (usa repo)
 *   - ca.yousafeconsultancy.com      (ca repo)
 *   - checkout.yousafeconsultancy.com (checkout repo)
 *   - legal.yousafeconsultancy.com    (caseworks repo)
 *
 * This sitemap only lists the homepage so search engines have a discovery
 * anchor; everything else is noindex via layout metadata.
 */

const SITE_URL = 'https://portal.yousafeconsultancy.com'
const LANGS = ['en', 'es', 'fr', 'ar', 'zh', 'hi', 'pt'] as const

function alternates() {
  return {
    languages: Object.fromEntries(
      LANGS.map(code => [code, `${SITE_URL}/?lang=${code}`]),
    ),
  }
}

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  return [
    {
      url: `${SITE_URL}/`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1.0,
      alternates: alternates(),
    },
  ]
}
