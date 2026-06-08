/**
 * GET /api/sellers/[id]/reviews
 *
 * Returns all published reviews for a seller's gigs. Resolves the seller
 * by any of attorneys.id, consultants.id, or profiles.id (same resolution
 * strategy as the other /api/sellers/[id] sub-routes).
 *
 * Response:
 *   {
 *     data: {
 *       reviews: Array<{
 *         id, rating, body, created_at, status,
 *         client: { id, full_name, email, avatar_url },
 *         gig: { id, title, slug }
 *       }>,
 *       total_reviews: number,
 *       average_rating: number,
 *       rating_breakdown: { 1..5: count }
 *     }
 *   }
 */
import { ok, fail } from '@/lib/apiEnvelope'
import { createSupabaseAdminClient } from '@/lib/supabase'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = createSupabaseAdminClient()

  // 1. Resolve seller to a profile_id (same pattern as other sellers routes)
  const [byAttId, byConId, byAttPid, byConPid] = await Promise.all([
    db.from('attorneys').select('profile_id').eq('id', id).maybeSingle(),
    db.from('consultants').select('profile_id').eq('id', id).maybeSingle(),
    db.from('attorneys').select('profile_id').eq('profile_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    db.from('consultants').select('profile_id').eq('profile_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ])

  const provider =
    byAttId.data || byConId.data || byAttPid.data || byConPid.data

  // If no attorney/consultant row, try resolving as a raw profile_id
  let profileId: string | null = provider?.profile_id || null
  if (!profileId) {
    const { data: profile } = await db
      .from('profiles')
      .select('id')
      .eq('id', id)
      .maybeSingle()
    if (!profile) return fail('Seller not found', 404)
    profileId = profile.id
  }

  // 2. Find all active gigs for this seller
  const { data: gigs } = await db
    .from('gigs')
    .select('id')
    .eq('provider_id', profileId)
    .eq('status', 'active')

  const gigIds = (gigs ?? []).map((g: any) => g.id)
  if (gigIds.length === 0) {
    return ok({
      reviews: [],
      total_reviews: 0,
      average_rating: 0,
      rating_breakdown: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
    })
  }

  // 3. Fetch published reviews for those gigs, joined with client profile + gig info
  const { data: reviews, error } = await db
    .from('gig_reviews')
    .select(`
      id,
      rating,
      comment:body,
      created_at,
      status,
      reviewer_id,
      gig_id,
      gig:gigs(id, title, slug)
    `)
    .in('gig_id', gigIds)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    // Handle missing column gracefully
    if (/column .*/i.test(error.message || '')) {
      return ok({
        reviews: [],
        total_reviews: 0,
        average_rating: 0,
        rating_breakdown: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
      })
    }
    return fail(error.message, 500)
  }

  // 4. Fetch reviewer profile info
  const reviewerIds = Array.from(new Set((reviews ?? []).map((r: any) => r.reviewer_id).filter(Boolean)))
  let profileMap = new Map<string, any>()
  if (reviewerIds.length > 0) {
    const { data: profiles } = await db
      .from('profiles')
      .select('id, full_name, email, avatar_url')
      .in('id', reviewerIds)
    for (const p of (profiles ?? [])) {
      profileMap.set(p.id, p)
    }
  }

  // 5. Compute rating stats
  const ratingBreakdown = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
  let totalRating = 0
  for (const r of (reviews ?? [])) {
    const star = r.rating as keyof typeof ratingBreakdown
    if (star >= 1 && star <= 5) {
      ratingBreakdown[star]++
      totalRating += star
    }
  }
  const totalReviews = (reviews ?? []).length
  const averageRating = totalReviews > 0
    ? Number((totalRating / totalReviews).toFixed(2))
    : 0

  // 6. Shape the response
  const shaped = (reviews ?? []).map((r: any) => {
    const clientProfile = profileMap.get(r.reviewer_id)
    return {
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      created_at: r.created_at,
      status: r.status,
      client: clientProfile
        ? {
            id: clientProfile.id,
            full_name: clientProfile.full_name,
            email: clientProfile.email,
            avatar_url: clientProfile.avatar_url,
          }
        : null,
      gig: r.gig
        ? {
            id: r.gig.id,
            title: r.gig.title,
            slug: r.gig.slug,
          }
        : null,
    }
  })

  return ok({
    reviews: shaped,
    total_reviews: totalReviews,
    average_rating: averageRating,
    rating_breakdown: ratingBreakdown,
  })
}
