import type { MetadataRoute } from 'next'
import { CATEGORIES } from '@/lib/categories'
import { IMMIGRATION_SHOP_PRODUCTS } from '@/lib/immigration-shop-products'
import { PAYHIP_BATCHES_2_4_PRODUCTS } from '@/lib/payhipBatches24'
import { createSupabaseAdminClient } from '@/lib/supabase'

const MARKET_HOST = 'market.yousafeconsultancy.com'

// This route always builds the public Marketplace sitemap. Host separation is
// enforced in middleware: market.yousafeconsultancy.com passes /sitemap.xml
// through, while portal.yousafeconsultancy.com receives an explicit empty map.
// Keeping host detection out of this route avoids Cloudflare/OpenNext request-
// header ambiguity turning the real Marketplace sitemap into an empty document.
export const dynamic = 'force-dynamic'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = `https://${MARKET_HOST}`

  // Public Marketplace paths are already clean root-level slugs. The internal
  // app/marketplace route tree is an implementation detail and must never be
  // serialized into sitemap URLs.
  const clean = (path: string) => {
    if (path === '' || path === '/') return '/'
    const normalized = path.startsWith('/') ? path : `/${path}`
    if (normalized === '/marketplace' || normalized.startsWith('/marketplace/')) {
      throw new Error('Sitemap Marketplace URLs must not include /marketplace')
    }
    return normalized.replace(/\/$/, '')
  }

  // Do not synthesize lastModified with "now". Search engines should only get
  // freshness dates we actually know; otherwise every crawl looks like every
  // static hub changed, which weakens the signal from real service updates.
  const entries: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${base}/gigs`, changeFrequency: 'weekly', priority: 0.75 },
    { url: `${base}/shop`, changeFrequency: 'weekly', priority: 0.75 },
    { url: `${base}/providers`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${base}/categories`, changeFrequency: 'weekly', priority: 0.6 },
  ]

  // Products 10-36 are governed by the Phase-A audited commercial manifest.
  // Keep those slugs out of the legacy immigration loop so the seven remaining
  // immigration products are not emitted twice. Batch 1 continues unchanged.
  const auditedPayhipSlugs = new Set(PAYHIP_BATCHES_2_4_PRODUCTS.map((product) => product.slug))
  for (const product of IMMIGRATION_SHOP_PRODUCTS) {
    if (!product.payhip_published || auditedPayhipSlugs.has(product.slug)) continue
    entries.push({
      url: `${base}/shop/${product.slug}`,
      changeFrequency: 'monthly',
      priority: 0.65,
    })
  }

  for (const product of PAYHIP_BATCHES_2_4_PRODUCTS) {
    entries.push({
      url: `${base}/shop/${product.slug}`,
      changeFrequency: 'monthly',
      priority: 0.65,
    })
  }

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
      url: `${base}${clean(`/categories/${cat.id}`)}`,
      changeFrequency: 'weekly',
      priority: 0.6,
    })
    for (const sub of cat.subcategories) {
      if (!categoriesWithSupply.has(sub.id)) continue
      entries.push({
        url: `${base}${clean(`/categories/${sub.id}`)}`,
        changeFrequency: 'weekly',
        priority: 0.55,
      })
    }
  }

  try {
    const db = createSupabaseAdminClient()

    // Every active gig with a real provider and stored slug is eligible for
    // discovery. Do not gate this list on request-host headers: middleware has
    // already established that only the Marketplace host can expose the map.
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
        url: `${base}${clean(`/gigs/${gig.slug}`)}`,
        lastModified: gig.updated_at ? new Date(gig.updated_at) : undefined,
        changeFrequency: 'weekly',
        priority: 0.7,
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
        url: `${base}${clean(`/providers/${token}`)}`,
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
        url: `${base}${clean(`/providers/${token}`)}`,
        changeFrequency: 'weekly',
        priority: 0.5,
      })
    }
  } catch {
    // Runtime DB unavailable — verified static hubs above remain valid. The
    // next successful crawl rebuilds the dynamic sitemap and restores gig URLs.
  }

  return entries
}
