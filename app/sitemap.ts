import type { MetadataRoute } from 'next'
import { createSupabaseAdminClient } from '@/lib/supabase'

/**
 * Public sitemap with hreflang alternates for every URL.
 *
 * Two sources combined into one sitemap:
 *   1. STATIC_ROUTES — hard-coded public routes (landing, sign-in, sign-up,
 *      marketplace index, categories index, providers index, sellers index).
 *   2. DYNAMIC — pulled from Supabase: active gigs, attorney/consultant
 *      seller profiles, top-level categories. Caps are in place so the
 *      sitemap stays under Cloudflare Workers' CPU budget even if the
 *      catalog grows large.
 *
 * Every URL ships full hreflang alternates (?lang=<code>) for the 7
 * supported languages. The HreflangTags component in layout.tsx mirrors
 * these tags inline on every page — sitemap + inline is what Google
 * recommends for redundancy.
 */

const SITE_URL = 'https://portal.yousafeconsultancy.com'
const LANGS = ['en', 'es', 'fr', 'ar', 'zh', 'hi', 'pt'] as const

// Hard cap on dynamic entries per type to keep the sitemap under Google's
// 50k-URL limit AND under the Worker CPU budget. Bump cautiously.
const MAX_GIGS      = 5000
const MAX_SELLERS   = 2000
const MAX_CATEGORIES = 500

type Frequency = 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never'

interface RouteSpec {
  path: string
  priority: number
  frequency: Frequency
  lastModified?: Date
}

const STATIC_ROUTES: readonly RouteSpec[] = [
  // Landing + brand
  { path: '',                          priority: 1.0, frequency: 'weekly' },

  // Marketplace public surface — every crawlable index page
  { path: '/marketplace',              priority: 0.9, frequency: 'daily' },
  { path: '/marketplace/categories',   priority: 0.8, frequency: 'weekly' },
  { path: '/marketplace/providers',    priority: 0.8, frequency: 'daily' },
  { path: '/sellers',                  priority: 0.7, frequency: 'daily' },

  // Auth entry points (kept low priority — login pages have no real content
  // to index, but they should still surface in alternate languages so users
  // landing on hreflang-translated search results don't hit a dead end).
  { path: '/sign-in/student',          priority: 0.4, frequency: 'monthly' },
  { path: '/sign-in/consultant',       priority: 0.4, frequency: 'monthly' },
  { path: '/sign-in/attorney',         priority: 0.4, frequency: 'monthly' },
  { path: '/sign-in/admin',            priority: 0.2, frequency: 'monthly' },
  { path: '/sign-up/student',          priority: 0.4, frequency: 'monthly' },
  { path: '/sign-up/consultant',       priority: 0.4, frequency: 'monthly' },
  { path: '/sign-up/attorney',         priority: 0.4, frequency: 'monthly' },
] as const

function buildAlternates(path: string) {
  const base = `${SITE_URL}${path || '/'}`
  return {
    languages: Object.fromEntries(
      LANGS.map(code => {
        const sep = base.includes('?') ? '&' : '?'
        return [code, `${base}${sep}lang=${code}`]
      })
    ),
  }
}

function entry(route: RouteSpec, fallbackNow: Date): MetadataRoute.Sitemap[number] {
  return {
    url: `${SITE_URL}${route.path || '/'}`,
    lastModified: route.lastModified ?? fallbackNow,
    changeFrequency: route.frequency,
    priority: route.priority,
    alternates: buildAlternates(route.path),
  }
}

async function loadDynamicRoutes(): Promise<RouteSpec[]> {
  const routes: RouteSpec[] = []
  // Each lookup is wrapped — sitemap MUST keep working even if the DB is
  // briefly unreachable. Errors are swallowed; we just emit static routes.
  let db: ReturnType<typeof createSupabaseAdminClient>
  try {
    db = createSupabaseAdminClient()
  } catch {
    return routes
  }

  // Gigs (active only). Order by recent activity so the most relevant
  // pages get crawled first.
  try {
    const { data } = await db
      .from('gigs')
      .select('slug, updated_at, status')
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(MAX_GIGS)
    for (const row of data ?? []) {
      if (!(row as any).slug) continue
      routes.push({
        path: `/marketplace/gigs/${(row as any).slug}`,
        priority: 0.7,
        frequency: 'weekly',
        lastModified: (row as any).updated_at ? new Date((row as any).updated_at) : undefined,
      })
    }
  } catch { /* skip gigs on failure */ }

  // Seller profiles — attorneys + consultants (both crawlable at /sellers/[id]).
  try {
    const { data: attorneys } = await db
      .from('attorneys')
      .select('id, updated_at, status')
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(MAX_SELLERS)
    for (const row of attorneys ?? []) {
      routes.push({
        path: `/sellers/${(row as any).id}`,
        priority: 0.6,
        frequency: 'weekly',
        lastModified: (row as any).updated_at ? new Date((row as any).updated_at) : undefined,
      })
    }
  } catch { /* skip */ }

  try {
    const { data: consultants } = await db
      .from('consultants')
      .select('id, updated_at, status')
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(MAX_SELLERS)
    for (const row of consultants ?? []) {
      routes.push({
        path: `/sellers/${(row as any).id}`,
        priority: 0.6,
        frequency: 'weekly',
        lastModified: (row as any).updated_at ? new Date((row as any).updated_at) : undefined,
      })
    }
  } catch { /* skip */ }

  // Categories — top-level browse pages.
  try {
    const { data } = await db
      .from('gig_categories')
      .select('slug, updated_at')
      .limit(MAX_CATEGORIES)
    for (const row of data ?? []) {
      const slug = (row as any).slug
      if (!slug) continue
      routes.push({
        path: `/marketplace/categories/${slug}`,
        priority: 0.6,
        frequency: 'weekly',
        lastModified: (row as any).updated_at ? new Date((row as any).updated_at) : undefined,
      })
    }
  } catch { /* skip */ }

  return routes
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()
  const dynamicRoutes = await loadDynamicRoutes()
  return [
    ...STATIC_ROUTES.map(r => entry(r, now)),
    ...dynamicRoutes.map(r => entry(r, now)),
  ]
}
