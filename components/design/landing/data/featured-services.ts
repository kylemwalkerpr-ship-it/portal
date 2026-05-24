import { unstable_cache } from 'next/cache'
import { createSupabaseAdminClient } from '@/lib/supabase'

export interface FeaturedGig {
  slug: string
  title: string
  category: string
  providerName: string
  providerRole: string
  avgRating: number
  reviewCount: number
  deliveryDays: number
  startingPrice: number
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
    coverUrl: null,
    tag: 'Top rated',
  },
]

export const getFeaturedGigs = unstable_cache(async (): Promise<FeaturedGig[]> => {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return FALLBACK_GIGS
    const db = createSupabaseAdminClient()
    const { data: gigs } = await db
      .from('gigs')
      .select('slug, title, category, avg_rating, review_count, order_count, gallery_images, provider_id, provider_type')
      .eq('status', 'active')
      .order('rank_score', { ascending: false })
      .limit(10)

    if (!gigs || gigs.length === 0) return FALLBACK_GIGS

    // Fetch provider names
    const providerIds = [...new Set(gigs.map(g => g.provider_id).filter(Boolean))]
    const { data: profiles } = providerIds.length > 0
      ? await db.from('profiles').select('id, full_name').in('id', providerIds)
      : { data: [] }

    const profileById = new Map((profiles ?? []).map(p => [p.id, p.full_name]))

    // Map to FeaturedGig shape
    const mapped: FeaturedGig[] = gigs.map(g => {
      const tag =
        (g.avg_rating ?? 0) >= 4.8 && (g.review_count ?? 0) >= 20
          ? 'Top rated'
          : (g.order_count ?? 0) < 5
            ? 'Rising talent'
            : g.provider_type === 'attorney'
              ? 'Verified attorney'
              : 'Verified consultant'

      return {
        slug: g.slug,
        title: g.title,
        category: g.category,
        providerName: profileById.get(g.provider_id) || 'YouSafe Provider',
        providerRole: g.provider_type || 'consultant',
        avgRating: g.avg_rating ?? 0,
        reviewCount: g.review_count ?? 0,
        deliveryDays: 14,
        startingPrice: 29900,
        coverUrl: Array.isArray(g.gallery_images) && g.gallery_images[0]?.url
          ? g.gallery_images[0].url
          : null,
        tag,
      }
    })

    // Mix-and-fill: live first, fallback tops up to 4
    const result = [...mapped]
    let fallbackIdx = 0
    while (result.length < 4 && fallbackIdx < FALLBACK_GIGS.length) {
      result.push(FALLBACK_GIGS[fallbackIdx])
      fallbackIdx++
    }
    return result.slice(0, 4)
  } catch {
    return FALLBACK_GIGS
  }
}, ['landing-featured-gigs'], { revalidate: 600 })
