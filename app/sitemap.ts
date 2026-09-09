import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'
import { TEMPLATE_PACKS } from '@/lib/template-packs'
import { CATEGORIES } from '@/lib/categories'
import { createSupabaseAdminClient } from '@/lib/supabase'

const MARKET_HOST = 'market.yousafeconsultancy.com'
const PORTAL_HOST = 'portal.yousafeconsultancy.com'

// Host-aware: the same worker serves portal + market. A static market sitemap
// on portal.yousafeconsultancy.com (noindex) was being listed in the estate
// index and cloning market's URLs. Portal must emit an empty map.
export const dynamic = 'force-dynamic'

function firstHost(value: string | null): string {
  if (!value) return ''
  return value.split(',')[0].trim().split(':')[0].toLowerCase()
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Default-deny: empty map unless we positively identify the market host
  // AND never see the portal host. OpenNext/CF often bakes `host` as the
  // first custom domain (market) at prerender. Middleware also intercepts.
  let host = PORTAL_HOST
  try {
    const h = await headers()
    const candidates = [
      firstHost(h.get('x-forwarded-host')),
      firstHost(h.get('x-original-host')),
      firstHost(h.get('host')),
    ].filter(Boolean)
    if (candidates.some((c) => c === PORTAL_HOST || c.startsWith('portal.'))) {
      return []
    }
    if (candidates.some((c) => c === MARKET_HOST)) host = MARKET_HOST
  } catch {
    // Build-time fallback — portal is the default app host (empty sitemap).
    return []
  }

  if (host !== MARKET_HOST) return []

  const base = `https://${MARKET_HOST}`

  // Strip /marketplace and trailing slashes because the market host rewrites
  // clean paths internally and redirects /marketplace-prefixed URLs.
  const mp = (path: string) => {
    const stripped = path.replace(/^\/marketplace/, '') || '/'
    if (stripped === '' || stripped === '/') return '/'
    return stripped.replace(/\/$/, '')
  }

  // Do not synthesize lastModified with "now". Search engines should only get
  // freshness dates we actually know; otherwise every crawl looks like every
  // static hub changed, which weakens the signal from real service updates.
  const entries: MetadataRoute.Sitemap = [
    { url: `${base}${mp('/marketplace/')}`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${base}/shop`, changeFrequency: 'weekly', priority: 0.75 },
    { url: `${base}${mp('/marketplace/templates/')}`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${base}${mp('/marketplace/providers/')}`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${base}${mp('/marketplace/categories/')}`, changeFrequency: 'weekly', priority: 0.6 },
  ]

  // Subcategory shelves are included only when active supply is positively
  // confirmed. Fail closed on a DB outage: an empty/noindex shelf should never
  // leak into the sitemap merely because supply verification failed.
  let categoriesWithSupply = new Set<string>()
  try {
    const db = createSupabaseAdminClient()
    const { data: gigRows, error } = await db
      .from('gigs')
      .select('category, subcategory')
      .eq('status', 'active')
      .not('provider_id', 'is', null)
      .limit(5000)
    if (!error) {
      const supply = new Set<string>()
      for (const row of gigRows ?? []) {
        if (row.category) supply.add(String(row.category))
        if (row.subcategory) supply.add(String(row.subcategory))
      }
      categoriesWithSupply = supply
    }
  } catch {
    categoriesWithSupply = new Set<string>()
  }

  for (const cat of CATEGORIES) {
    // Top-level hubs have substantive editorial content and remain useful
    // navigational landing pages even while a particular shelf is thin.
    entries.push({
      url: `${base}${mp(`/marketplace/categories/${cat.id}/`)}`,
      changeFrequency: 'weekly',
      priority: 0.6,
    })
    for (const sub of cat.subcategories) {
      if (!categoriesWithSupply.has(sub.id)) continue
      entries.push({
        url: `${base}${mp(`/marketplace/categories/${sub.id}/`)}`,
        changeFrequency: 'weekly',
        priority: 0.55,
      })
    }
  }

  for (const pack of TEMPLATE_PACKS) {
    entries.push({
      url: `${base}${mp(`/marketplace/templates/${pack.slug}`)}`,
      changeFrequency: 'monthly',
      priority: 0.6,
    })
  }

  try {
    const db = createSupabaseAdminClient()

    const { data: gigs } = await db
      .from('gigs')
      .select('slug, updated_at, provider_id')
      .eq('status', 'active')
      .not('provider_id', 'is', null)
      .limit(5000)

    for (const gig of gigs ?? []) {
      // Never re-slug sitemap values at read time. Existing live URLs remain
      // byte-for-byte stable; only newly created/draft-edited slugs are cleaned.
      if (!gig.slug || !gig.provider_id) continue
      entries.push({
        url: `${base}${mp(`/marketplace/gigs/${gig.slug}`)}`,
        lastModified: gig.updated_at ? new Date(gig.updated_at) : undefined,
        changeFrequency: 'weekly',
        priority: 0.6,
      })
    }

    const { data: attorneys } = await db
      .from('attorneys')
      .select('id, profiles!attorneys_profile_id_fkey(username)')
      .limit(5000)

    for (const a of attorneys ?? []) {
      const profile = Array.isArray((a as any).profiles) ? (a as any).profiles[0] : (a as any).profiles
      const token = profile?.username || a.id
      entries.push({
        url: `${base}${mp(`/marketplace/providers/${token}`)}`,
        changeFrequency: 'weekly',
        priority: 0.5,
      })
    }

    const { data: consultants } = await db
      .from('consultants')
      .select('id, profiles!consultants_profile_id_fkey(username)')
      .limit(5000)

    for (const c of consultants ?? []) {
      const profile = Array.isArray((c as any).profiles) ? (c as any).profiles[0] : (c as any).profiles
      const token = profile?.username || c.id
      entries.push({
        url: `${base}${mp(`/marketplace/providers/${token}`)}`,
        changeFrequency: 'weekly',
        priority: 0.5,
      })
    }
  } catch {
    // Build-time DB unavailable — verified static hubs above remain valid.
  }

  return entries
}
