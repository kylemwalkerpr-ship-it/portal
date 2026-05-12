import type { MetadataRoute } from 'next'

const SITE_URL = 'https://portal.yousafeconsultancy.com'

const routes = [
  { path: '', priority: 0.8, frequency: 'weekly' },
  { path: '/sign-in/student', priority: 0.4, frequency: 'monthly' },
  { path: '/sign-in/consultant', priority: 0.4, frequency: 'monthly' },
  { path: '/sign-in/attorney', priority: 0.4, frequency: 'monthly' },
  { path: '/sign-in/admin', priority: 0.2, frequency: 'monthly' },
  { path: '/sign-up/student', priority: 0.4, frequency: 'monthly' },
  { path: '/sign-up/consultant', priority: 0.4, frequency: 'monthly' },
  { path: '/sign-up/attorney', priority: 0.4, frequency: 'monthly' },
] as const

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()

  return routes.map((route) => ({
    url: `${SITE_URL}${route.path}`,
    lastModified: now,
    changeFrequency: route.frequency,
    priority: route.priority,
  }))
}
