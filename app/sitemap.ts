import type { MetadataRoute } from 'next'
import { TEMPLATE_PACKS } from '@/lib/template-packs'
import { createSupabaseAdminClient } from '@/lib/supabase'

const MARKET_HOST = 'market.yousafeconsultancy.com'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = `https://${MARKET_HOST}`

  // Strip /marketplace and trailing slashes because the market host rewrites
  // clean paths internally and redirects /marketplace-prefixed URLs.
  const mp = (path: string) => {
    const stripped = path.replace(/^\/marketplace/, '') || '/'
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
      // Per SEO master plan v2.0 §R5: graduate to a sharded sitemap-index
      // (sitemap-gigs-N.xml) once active row counts cross ~4,000. Bumped
      // from 500 to 5,000 on 2026-05-29 to remove the silent cap risk
      // while gig + provider volume is still well below the limit.
      .limit(5000)

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
      .select('id, created_at, profiles!attorneys_profile_id_fkey(username)')
      // Per SEO master plan v2.0 §R5: graduate to a sharded sitemap-index
      // (sitemap-gigs-N.xml) once active row counts cross ~4,000. Bumped
      // from 500 to 5,000 on 2026-05-29 to remove the silent cap risk
      // while gig + provider volume is still well below the limit.
      .limit(5000)

    for (const a of attorneys ?? []) {
      const profile = Array.isArray((a as any).profiles) ? (a as any).profiles[0] : (a as any).profiles
      const token = profile?.username || a.id
      entries.push({
        url: `${base}${mp(`/marketplace/providers/${token}`)}`,
        lastModified: a.created_at ? new Date(a.created_at) : new Date(),
        changeFrequency: 'weekly',
        priority: 0.5,
      })
    }

    const { data: consultants } = await db
      .from('consultants')
      .select('id, created_at, profiles!consultants_profile_id_fkey(username)')
      // Per SEO master plan v2.0 §R5: graduate to a sharded sitemap-index
      // (sitemap-gigs-N.xml) once active row counts cross ~4,000. Bumped
      // from 500 to 5,000 on 2026-05-29 to remove the silent cap risk
      // while gig + provider volume is still well below the limit.
      .limit(5000)

    for (const c of consultants ?? []) {
      const profile = Array.isArray((c as any).profiles) ? (c as any).profiles[0] : (c as any).profiles
      const token = profile?.username || c.id
      entries.push({
        url: `${base}${mp(`/marketplace/providers/${token}`)}`,
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
