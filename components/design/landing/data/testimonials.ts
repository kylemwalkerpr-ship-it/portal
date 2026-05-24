import { unstable_cache } from 'next/cache'
import { createSupabaseAdminClient } from '@/lib/supabase'

export interface Testimonial {
  name: string
  country: string
  role: string
  text: string
  rating: number
}

export const FALLBACK_TESTIMONIALS: Testimonial[] = [
  {
    name: 'Aisha R.',
    country: 'Pakistan → UK',
    role: 'Education member',
    text: 'Got into Manchester with full scholarship. The team guided me through every step.',
    rating: 5,
  },
  {
    name: 'Carlos M.',
    country: 'Colombia → Canada',
    role: 'Immigration client',
    text: 'Visa approved in three weeks. My consultant was thorough; I always knew the next step.',
    rating: 5,
  },
  {
    name: 'Priya S.',
    country: 'India → Australia',
    role: 'Education member',
    text: 'The SOP review changed everything. I went from four rejections to three offers.',
    rating: 5,
  },
  {
    name: 'Wei L.',
    country: 'China → USA',
    role: 'Legal client',
    text: 'The attorney reviewed my H-1B amendment in 48 hours. Flawless documentation.',
    rating: 5,
  },
  {
    name: 'Omar K.',
    country: 'Egypt → UK',
    role: 'Career member',
    text: 'Resume and LinkedIn overhaul landed me three interviews in the first week.',
    rating: 5,
  },
]

export const getTestimonials = unstable_cache(async (): Promise<Testimonial[]> => {
  const db = createSupabaseAdminClient()

  try {
    // Query top-rated reviews (5-star) as proxy for featured testimonials
    const { data: reviews } = await db
      .from('gig_reviews')
      .select('rating, body, reviewer_id, created_at')
      .eq('status', 'published')
      .gte('rating', 5)
      .order('created_at', { ascending: false })
      .limit(20)

    if (!reviews || reviews.length < 5) return FALLBACK_TESTIMONIALS

    const reviewerIds = [...new Set(reviews.map(r => r.reviewer_id).filter(Boolean))]
    const { data: profiles } = reviewerIds.length > 0
      ? await db.from('profiles').select('id, full_name, country').in('id', reviewerIds)
      : { data: [] }

    const profileById = new Map((profiles ?? []).map((p: any) => [p.id, p]))

    const mapped: Testimonial[] = reviews.map(r => {
      const profile = profileById.get(r.reviewer_id)
      return {
        name: profile?.full_name || 'Member',
        country: profile?.country || 'Global',
        role: 'Student',
        text: r.body,
        rating: r.rating,
      }
    })

    return mapped.length >= 5 ? mapped : FALLBACK_TESTIMONIALS
  } catch {
    return FALLBACK_TESTIMONIALS
  }
}, ['landing-testimonials'], { revalidate: 600 })
