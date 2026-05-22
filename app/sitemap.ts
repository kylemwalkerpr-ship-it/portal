import type { MetadataRoute } from 'next'
import { TEMPLATE_PACKS } from '@/lib/template-packs'

/**
 * Portal is members-area noindex sitewide via layout metadata.
 * Per-page generateMetadata opts public routes back in.
 * The marketplace landing and template packs are indexable.
 */

export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://portal.yousafeconsultancy.com'

  const entries: MetadataRoute.Sitemap = [
    {
      url: `${base}/marketplace/`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${base}/marketplace/templates/`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.7,
    },
  ]

  for (const pack of TEMPLATE_PACKS) {
    entries.push({
      url: `${base}/marketplace/templates/${pack.slug}/`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.6,
    })
  }

  return entries
}
