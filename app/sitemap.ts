import type { MetadataRoute } from 'next'

/**
 * Public sitemap with hreflang alternates for every URL.
 *
 * Google's policy: hreflang alternates should be declared either inline
 * via <link rel="alternate" hreflang="…"> (we do this in app/layout.tsx)
 * OR in the sitemap. Doing both is supported and recommended — the
 * sitemap is the easier path for Search Console to consume programmatically.
 *
 * Add new public-crawlable paths to ROUTES below.
 */

const SITE_URL = 'https://portal.yousafeconsultancy.com'
const LANGS = ['en', 'es', 'fr', 'ar', 'zh', 'hi', 'pt'] as const

const ROUTES = [
  { path: '',                   priority: 1.0, frequency: 'weekly' },
  { path: '/sign-in/student',   priority: 0.4, frequency: 'monthly' },
  { path: '/sign-in/consultant', priority: 0.4, frequency: 'monthly' },
  { path: '/sign-in/attorney',  priority: 0.4, frequency: 'monthly' },
  { path: '/sign-in/admin',     priority: 0.2, frequency: 'monthly' },
  { path: '/sign-up/student',   priority: 0.4, frequency: 'monthly' },
  { path: '/sign-up/consultant', priority: 0.4, frequency: 'monthly' },
  { path: '/sign-up/attorney',  priority: 0.4, frequency: 'monthly' },
] as const

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()

  return ROUTES.map((route) => {
    const url = `${SITE_URL}${route.path || '/'}`
    return {
      url,
      lastModified: now,
      changeFrequency: route.frequency,
      priority: route.priority,
      // Per-URL alternates: one entry per supported language. The query
      // form (?lang=es) matches our hreflang <link> tags and the
      // language-context that reads ?lang= on first load. Subpath routing
      // (/es/…) would only require changing this builder.
      alternates: {
        languages: Object.fromEntries(
          LANGS.map(code => {
            const base = `${SITE_URL}${route.path || '/'}`
            const sep = base.includes('?') ? '&' : '?'
            return [code, `${base}${sep}lang=${code}`]
          })
        ),
      },
    }
  })
}
