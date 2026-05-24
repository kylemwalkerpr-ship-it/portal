import { unstable_cache } from 'next/cache'
import { createSupabaseAdminClient } from '@/lib/supabase'

export interface FeaturedProvider {
  id: string
  name: string
  role: string
  avatarUrl: string | null
  rating: number
  orderCount: number
  country: string
  badges: string[]
  credentials: string[]
}

export const FALLBACK_PROVIDERS: FeaturedProvider[] = [
  {
    id: 'p1', name: 'Dr. Sarah Chen', role: 'Attorney', avatarUrl: null,
    rating: 4.9, orderCount: 312, country: 'USA',
    badges: ['Bar verified', 'AILA member'], credentials: ['NY Bar', 'CA Bar'],
  },
  {
    id: 'p2', name: 'James O\'Brien', role: 'Consultant', avatarUrl: null,
    rating: 4.8, orderCount: 198, country: 'UK',
    badges: ['CICC reg.', 'Top rated'], credentials: ['RCIC', 'MSc'],
  },
  {
    id: 'p3', name: 'Priya Sharma', role: 'Consultant', avatarUrl: null,
    rating: 4.9, orderCount: 256, country: 'Canada',
    badges: ['CICC reg.', 'Top rated'], credentials: ['RCIC', 'MA Ed'],
  },
  {
    id: 'p4', name: 'Michael Torres', role: 'Attorney', avatarUrl: null,
    rating: 4.7, orderCount: 145, country: 'USA',
    badges: ['Bar verified', 'Rising talent'], credentials: ['TX Bar'],
  },
  {
    id: 'p5', name: 'Amara Okafor', role: 'Consultant', avatarUrl: null,
    rating: 4.8, orderCount: 178, country: 'UK',
    badges: ['Top rated'], credentials: ['OISC', 'PGDip'],
  },
  {
    id: 'p6', name: 'David Kim', role: 'Attorney', avatarUrl: null,
    rating: 4.9, orderCount: 289, country: 'USA',
    badges: ['Bar verified', 'AILA member'], credentials: ['IL Bar', 'MI Bar'],
  },
]

export const getFeaturedProviders = unstable_cache(async (): Promise<FeaturedProvider[]> => {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return FALLBACK_PROVIDERS
    const db = createSupabaseAdminClient()
    // Re-use the same query pattern as app/api/sellers/route.ts
    const [{ data: attorneys }, { data: consultants }] = await Promise.all([
      db.from('attorneys').select('id, profile_id, headshot_url, jurisdictions, years_experience'),
      db.from('consultants').select('id, profile_id, headshot_url, specialties, years_experience'),
    ])

    const allProfileIds = [
      ...(attorneys || []).map((a: any) => a.profile_id),
      ...(consultants || []).map((c: any) => c.profile_id),
    ].filter(Boolean)

    if (allProfileIds.length === 0) return FALLBACK_PROVIDERS

    const { data: profiles } = await db
      .from('profiles')
      .select('id, full_name, email, country')
      .in('id', allProfileIds)

    const { data: gigs } = await db
      .from('gigs')
      .select('provider_id, avg_rating, review_count, order_count')
      .eq('status', 'active')

    const profileById = new Map((profiles ?? []).map((p: any) => [p.id, p]))
    const gigStatsByProfile = new Map<string, { totalOrders: number; avgRating: number; reviewCount: number }>()

    for (const gig of gigs || []) {
      const cur = gigStatsByProfile.get(gig.provider_id) ?? { totalOrders: 0, avgRating: 0, reviewCount: 0 }
      cur.totalOrders += gig.order_count || 0
      cur.reviewCount += gig.review_count || 0
      cur.avgRating = Math.max(cur.avgRating, gig.avg_rating || 0)
      gigStatsByProfile.set(gig.provider_id, cur)
    }

    const mapped: FeaturedProvider[] = []

    for (const attorney of attorneys || []) {
      const profile = profileById.get(attorney.profile_id)
      if (!profile) continue
      const stats = gigStatsByProfile.get(attorney.profile_id)
      mapped.push({
        id: attorney.id,
        name: profile.full_name || profile.email?.split('@')[0] || 'Attorney',
        role: 'Attorney',
        avatarUrl: attorney.headshot_url,
        rating: stats?.avgRating ?? 0,
        orderCount: stats?.totalOrders ?? 0,
        country: profile.country || 'USA',
        badges: ['Bar verified'],
        credentials: Array.isArray(attorney.jurisdictions) ? attorney.jurisdictions.slice(0, 2) : ['Bar verified'],
      })
    }

    for (const consultant of consultants || []) {
      const profile = profileById.get(consultant.profile_id)
      if (!profile) continue
      const stats = gigStatsByProfile.get(consultant.profile_id)
      mapped.push({
        id: consultant.id,
        name: profile.full_name || profile.email?.split('@')[0] || 'Consultant',
        role: 'Consultant',
        avatarUrl: consultant.headshot_url,
        rating: stats?.avgRating ?? 0,
        orderCount: stats?.totalOrders ?? 0,
        country: profile.country || 'Canada',
        badges: ['CICC reg.'],
        credentials: Array.isArray(consultant.specialties) ? consultant.specialties.slice(0, 2) : ['CICC reg.'],
      })
    }

    // Sort by order count descending
    mapped.sort((a, b) => b.orderCount - a.orderCount)

    // Mix-and-fill: live first, fallback tops up to 6
    const result = [...mapped]
    let fallbackIdx = 0
    while (result.length < 6 && fallbackIdx < FALLBACK_PROVIDERS.length) {
      result.push(FALLBACK_PROVIDERS[fallbackIdx])
      fallbackIdx++
    }
    return result.slice(0, 6)
  } catch {
    return FALLBACK_PROVIDERS
  }
}, ['landing-featured-providers'], { revalidate: 600 })
