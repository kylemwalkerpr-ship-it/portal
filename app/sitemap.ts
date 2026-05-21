import type { MetadataRoute } from 'next'

/**
 * Portal is members-area noindex sitewide via layout metadata.
 * Per-page generateMetadata opts public routes back in.
 * The marketplace landing is the only indexable URL today.
 */

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: 'https://portal.yousafeconsultancy.com/marketplace/',
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
  ]
}
