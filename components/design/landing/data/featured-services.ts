import { unstable_cache } from 'next/cache'
import { createSupabaseAdminClient } from '@/lib/supabase'

export interface FeaturedGig {
  slug: string
  title: string
  category: string
  providerName: string
  providerRole: string
  providerAvatarUrl: string | null
  avgRating: number
  reviewCount: number
  deliveryDays: number | null
  startingPrice: number | null
  coverUrl: string | null
  tag: string
}

export const FALLBACK_GIGS: FeaturedGig[] = [
  {
    slug: 'uk-masters-application-shortlist-to-offer',
    title: 'UK Masters Application — Shortlist to Offer',
    category: 'Education',
    providerName: 'YouSafe Admissions',
    providerRole: 'consultant',
    avgRating: 4.9,
    reviewCount: 127,
    deliveryDays: 14,
    startingPrice: 44900,
    providerAvatarUrl: null,
    coverUrl: null,
    tag: 'Top rated',
  },
  {
    slug: 'h1b-amendment-attorney-review',
    title: 'H-1B Amendment — Attorney Review',
    category: 'Legal',
    providerName: 'LexVisa Partners',
    providerRole: 'attorney',
    avgRating: 4.8,
    reviewCount: 84,
    deliveryDays: 7,
    startingPrice: 29900,
    providerAvatarUrl: null,
    coverUrl: null,
    tag: 'Verified attorney',
  },
  {
    slug: 'canada-express-entry-crs-package',
    title: 'Canada Express Entry — CRS Boost Package',
    category: 'Immigration',
    providerName: 'NorthPath Immigration',
    providerRole: 'consultant',
    avgRating: 4.7,
    reviewCount: 62,
    deliveryDays: 10,
    startingPrice: 34900,
    providerAvatarUrl: null,
    coverUrl: null,
    tag: 'Rising talent',
  },
  {
    slug: 'personal-statement-top-30-us-programmes',
    title: 'Personal Statement — Top 30 US Programmes',
    category: 'Education',
    providerName: 'IvyDraft Editors',
    providerRole: 'consultant',
    avgRating: 4.9,
    reviewCount: 215,
    deliveryDays: 5,
    startingPrice: 19900,
    providerAvatarUrl: null,
    coverUrl: null,
    tag: 'Top rated',
  },
]

export const getFeaturedGigs = unstable_cache(async (): Promise<FeaturedGig[]> => {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return FALLBACK_GIGS
    const db = createSupabaseAdminClient()
    // Join tiers so price + delivery come from the source of truth, not
    // invented constants. Pattern matches app/marketplace/PublicMarketplaceLanding.tsx.
    const { data: gigs } = await db
      .from('gigs')
      .select('slug, title, category, avg_rating, review_count, order_count, gallery_images, provider_id, provider_type, tiers:gig_tiers(price, delivery_days, is_active)')
      .eq('status', 'active')
      .order('rank_score', { ascending: false })
      .limit(10)

    if (!gigs || gigs.length === 0) return FALLBACK_GIGS

    const providerIds = [...new Set(gigs.map((g: any) => g.provider_id).filter(Boolean))]
    const { data: profiles } = providerIds.length > 0
      ? await db.from('profiles').select('id, full_name').in('id', providerIds)
      : { data: [] }

    // Provider headshot lives on attorneys/consultants tables, joined via
    // profile_id. Used as fallback avatar when the gig has no gallery image.
    const [{ data: attorneys }, { data: consultants }] = await Promise.all([
      providerIds.length > 0
        ? db.from('attorneys').select('profile_id, headshot_url').in('profile_id', providerIds)
        : Promise.resolve({ data: [] }),
      providerIds.length > 0
        ? db.from('consultants').select('profile_id, headshot_url').in('profile_id', providerIds)
        : Promise.resolve({ data: [] }),
    ])

    const profileById = new Map((profiles ?? []).map((p: any) => [p.id, p.full_name]))
    const avatarByProfile = new Map<string, string>()
    for (const row of (attorneys ?? []) as any[]) {
      if (row.headshot_url) avatarByProfile.set(row.profile_id, row.headshot_url)
    }
    for (const row of (consultants ?? []) as any[]) {
      if (row.headshot_url) avatarByProfile.set(row.profile_id, row.headshot_url)
    }

    const mapped: FeaturedGig[] = gigs.map((g: any) => {
      // Cheapest active tier — source of truth for "From ..." price + delivery.
      const activeTiers = Array.isArray(g.tiers)
        ? g.tiers
            .filter((t: any) => t.is_active !== false && t.price != null)
            .map((t: any) => ({
              price: Number(t.price),
              delivery_days: t.delivery_days != null ? Number(t.delivery_days) : null,
            }))
        : []
      const cheapest = activeTiers.length
        ? activeTiers.reduce((a: any, b: any) => (a.price <= b.price ? a : b))
        : null

      const reviews = Number(g.review_count ?? 0)
      const rating = Number(g.avg_rating ?? 0)
      const orders = Number(g.order_count ?? 0)
      const tag =
        rating >= 4.8 && reviews >= 20 ? 'Top rated'
        : orders < 5 ? 'Rising talent'
        : g.provider_type === 'attorney' ? 'Verified attorney'
        : 'Verified consultant'

      const coverUrl = Array.isArray(g.gallery_images) && g.gallery_images[0]?.url
        ? g.gallery_images[0].url
        : null

      return {
        slug: g.slug,
        title: g.title,
        category: g.category,
        providerName: profileById.get(g.provider_id) || 'YouSafe Provider',
        providerRole: g.provider_type || 'consultant',
        providerAvatarUrl: avatarByProfile.get(g.provider_id) ?? null,
        avgRating: rating,
        reviewCount: reviews,
        deliveryDays: cheapest?.delivery_days ?? null,
        startingPrice: cheapest?.price ?? null,
        coverUrl,
        tag,
      }
    })

    // Until enough live gigs exist to fill 4 cards, cycle the real ones so
    // every card links to a real, resolvable gig page. FALLBACK_GIGS only
    // ships when there are zero live gigs in the DB.
    const result: FeaturedGig[] = []
    while (result.length < 4) {
      result.push(mapped[result.length % mapped.length])
    }
    return result
  } catch {
    return FALLBACK_GIGS
  }
}, ['landing-featured-gigs'], { revalidate: 600 })
