import type { MetadataRoute } from 'next'

/**
 * Portal sitemap — intentionally empty.
 *
 * The portal is the authenticated members area. Every page is noindex
 * via layout metadata; the marketing surface lives on the other
 * subdomains (yousafeconsultancy.com, usa, ca, checkout, legal).
 *
 * We used to ship the homepage as a discovery anchor, but Ahrefs and GSC
 * correctly flag that as "noindex page in sitemap" — sitemaps should
 * only list URLs you want indexed. Returning an empty sitemap is valid
 * XML and produces no warnings.
 */

export default function sitemap(): MetadataRoute.Sitemap {
  return []
}
