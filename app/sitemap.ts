import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'
import { TEMPLATE_PACKS } from '@/lib/template-packs'
import { createSupabaseAdminClient } from '@/lib/supabase'

const MARKET_HOST = 'market.yousafeconsultancy.com'
const PORTAL_HOST = 'portal.yousafeconsultancy.com'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const h = await headers()
  const host = h.get('host')?.split(':')[0] || PORTAL_HOST
  const isMarket = host === MARKET_HOST
  const base = `https://${isMarket ? MARKET_HOST : PORTAL_HOST}`

  // Strip trailing slash because the host 308-redirects `/foo/` → `/foo`.
  // Sitemaps must contain the canonical (final-destination) URL only.
  const mp = (path: string) => {
    const stripped = isMarket ? path.replace(/^\/marketplace/, '') : path
    if (stripped === '' || stripped === '/') return '/'
    return stripped.replace(/\/$/, '')
  }

  const entries: MetadataRoute.Sitemap = [
    { url: `${base}${mp('/marketplace/')}`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
    { url: `${base}${mp('/marketplace/templates/')}`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.7 },
    { url: `${base}${mp('/marketplace/providers/')}`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.7 },
    { url: `${base}${mp('/marketplace/categories/')}`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.6 },
  ]

  for (const pack of TEMPLATE_PACKS) {
    entries.push({
      url: `${base}${mp(`/marketplace/templates/${pack.slug}`)}`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.6,
    })
  }

  // Best-effort DB query — if Supabase env vars are missing at build time,
  // skip dynamic entries rather than failing the build.
  try {
    const db = createSupabaseAdminClient()

    const { data: gigs } = await db
      .from('gigs')
      .select('slug, updated_at')
      .eq('status', 'active')
      .limit(500)

    for (const gig of gigs ?? []) {
      if (!gig.slug) continue
      entries.push({
        url: `${base}${mp(`/marketplace/gigs/${gig.slug}`)}`,
        lastModified: gig.updated_at ? new Date(gig.updated_at) : new Date(),
        changeFrequency: 'weekly',
        priority: 0.6,
      })
    }

    const { data: attorneys } = await db
      .from('attorneys')
      .select('id, created_at')
      .limit(500)

    for (const a of attorneys ?? []) {
      entries.push({
        url: `${base}${mp(`/marketplace/providers/${a.id}`)}`,
        lastModified: a.created_at ? new Date(a.created_at) : new Date(),
        changeFrequency: 'weekly',
        priority: 0.5,
      })
    }

    const { data: consultants } = await db
      .from('consultants')
      .select('id, created_at')
      .limit(500)

    for (const c of consultants ?? []) {
      entries.push({
        url: `${base}${mp(`/marketplace/providers/${c.id}`)}`,
        lastModified: c.created_at ? new Date(c.created_at) : new Date(),
        changeFrequency: 'weekly',
        priority: 0.5,
      })
    }
  } catch {
    // Build-time DB unavailable — static entries above are still valid.
  }

  return entries
}
