import { ok, fail } from '@/lib/apiEnvelope'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { auth } from '@clerk/nextjs/server'

export async function GET(req: Request) {
  // ── abort guard: client disconnect → fast 499 ──
  if (req.signal.aborted) {
    return Response.json({ error: 'Request cancelled by client' }, { status: 499 })
  }
  const abortHandler = () => { /* no-op */ }
  req.signal.addEventListener('abort', abortHandler)

  try {
  const { searchParams } = new URL(req.url)
  const gigId = searchParams.get('gig_id')
  const sellerId = searchParams.get('seller_id')
  const sellerType = searchParams.get('seller_type') // 'attorney' or 'consultant'
  const limit = parseInt(searchParams.get('limit') || '20')
  const offset = parseInt(searchParams.get('offset') || '0')
  const sort = searchParams.get('sort') || 'newest' // newest, oldest, highest, lowest
  const minRating = searchParams.get('min_rating')
  const hasReply = searchParams.get('has_reply')

  const db = createSupabaseAdminClient()

  // NB: the real column is `reviewer_id` (FK constraint
  // gig_reviews_reviewer_id_fkey). We keep the JSON key as `client` and
  // alias the DB column `body` → `comment` so the existing ReviewsSection
  // consumer continues to read review.client / review.comment unchanged.
  let query = db.from('gig_reviews').select(`
    *,
    comment:body,
    client:profiles!gig_reviews_reviewer_id_fkey(
      id,
      full_name,
      email,
      avatar_url
    ),
    gig:gigs(
      id,
      title,
      slug,
      provider_id
    )
  `)

  // Filter by gig
  if (gigId) {
    query = query.eq('gig_id', gigId)
  }

  // Filter by seller
  if (sellerId && sellerType) {
    const gigIds = await db
      .from('gigs')
      .select('id')
      .eq('provider_id', sellerId)
      .eq('provider_type', sellerType)
      .eq('status', 'active')

    if (gigIds.data) {
      query = query.in('gig_id', gigIds.data.map((g: any) => g.id))
    }
  }

  // Filter by minimum rating
  if (minRating) {
    query = query.gte('rating', parseInt(minRating))
  }

  // Reply-status filter intentionally no-op: the gig_reviews table does
  // not have a `seller_reply` column today (replies live in a sibling
  // table). The query param is accepted for forward-compat but ignored.
  void hasReply

  // Sort
  switch (sort) {
    case 'oldest':
      query = query.order('created_at', { ascending: true })
      break
    case 'highest':
      query = query.order('rating', { ascending: false })
      break
    case 'lowest':
      query = query.order('rating', { ascending: true })
      break
    case 'newest':
    default:
      query = query.order('created_at', { ascending: false })
      break
  }

  // Pagination
  query = query.range(offset, offset + limit - 1)

  const { data: reviews, error } = await query

  if (error) {
    return fail('Failed to load reviews', 500)
  }

  // Get rating breakdown
  let ratingQuery = db.from('gig_reviews').select('rating')

  if (gigId) {
    ratingQuery = ratingQuery.eq('gig_id', gigId)
  } else if (sellerId && sellerType) {
    const gigIds = await db
      .from('gigs')
      .select('id')
      .eq('provider_id', sellerId)
      .eq('provider_type', sellerType)
      .eq('status', 'active')

    if (gigIds.data) {
      ratingQuery = ratingQuery.in('gig_id', gigIds.data.map((g: any) => g.id))
    }
  }

  const { data: allRatings } = await ratingQuery

  const ratingBreakdown = {
    5: 0,
    4: 0,
    3: 0,
    2: 0,
    1: 0,
  }

  let totalRating = 0
  for (const r of allRatings || []) {
    ratingBreakdown[r.rating as keyof typeof ratingBreakdown]++
    totalRating += r.rating
  }

  const totalReviews = allRatings?.length || 0
  const averageRating = totalReviews > 0 ? Number((totalRating / totalReviews).toFixed(2)) : 0

  return ok({
    reviews: reviews || [],
    total: reviews?.length || 0,
    rating_breakdown: ratingBreakdown,
    average_rating: averageRating,
    total_reviews: totalReviews,
  })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const isCpuTimeout = /CPU|timeout|abort|budget|exceeded|terminated/i.test(message)
    return fail(message, isCpuTimeout ? 503 : 500)
  } finally {
    req.signal.removeEventListener('abort', abortHandler)
  }
}

export async function POST(request: Request) {
  // ── abort guard: client disconnect → fast 499 ──
  if (request.signal.aborted) {
    return Response.json({ error: 'Request cancelled by client' }, { status: 499 })
  }
  const postAbortHandler = () => { /* no-op */ }
  request.signal.addEventListener('abort', postAbortHandler)

  try {
  const { userId } = await auth()
  if (!userId) {
    return fail('Authentication required', 401)
  }

  const body = await request.json()
  const { gig_id, order_id, rating, title, comment, is_verified_purchase } = body

  // Validation
  if (!gig_id || !rating || !comment) {
    return fail('Missing required fields', 400)
  }

  if (rating < 1 || rating > 5) {
    return fail('Rating must be between 1 and 5', 400)
  }

  if (comment.length < 10) {
    return fail('Comment must be at least 10 characters', 400)
  }

  if (comment.length > 1000) {
    return fail('Comment must be less than 1000 characters', 400)
  }

  const db = createSupabaseAdminClient()

  // Get user's profile
  const { data: profile } = await db
    .from('profiles')
    .select('id')
    .eq('clerk_id', userId)
    .single()

  if (!profile) {
    return fail('Profile not found', 404)
  }

  // Check if gig exists
  const { data: gig } = await db
    .from('gigs')
    .select('id, provider_id, provider_type, status')
    .eq('id', gig_id)
    .single()

  if (!gig) {
    return fail('Gig not found', 404)
  }

  if (gig.status !== 'active') {
    return fail('Cannot review inactive gig', 400)
  }

  // Check if user already reviewed this gig
  const { data: existingReview } = await db
    .from('gig_reviews')
    .select('id')
    .eq('gig_id', gig_id)
    .eq('reviewer_id', profile.id)
    .single()

  if (existingReview) {
    return fail('You have already reviewed this gig', 400)
  }

  // If order_id is provided, verify the order
  if (order_id) {
    const { data: order } = await db
      .from('orders')
      .select('id, client_id, gig_id, status')
      .eq('id', order_id)
      .single()

    if (!order) {
      return fail('Order not found', 404)
    }

    if (order.client_id !== profile.id) {
      return fail('You can only review your own orders', 403)
    }

    if (order.gig_id !== gig_id) {
      return fail('Order does not match this gig', 400)
    }

    if (order.status !== 'completed') {
      return fail('You can only review completed orders', 400)
    }
  }

  // Create review. The real schema has reviewer_id + body; title and
  // is_verified_purchase don't exist on the table and are accepted on the
  // input for forward-compat but dropped here.
  void title
  const { data: review, error } = await db
    .from('gig_reviews')
    .insert({
      gig_id,
      order_id: order_id || null,
      reviewer_id: profile.id,
      rating,
      body: comment,
      status: 'published',
    })
    .select()
    .single()

  if (error) {
    return fail('Failed to create review', 500)
  }

  // Update gig rating stats
  await updateGigRatingStats(db, gig_id)

  // Update seller rating stats
  if (gig.provider_type === 'attorney') {
    await updateAttorneyRatingStats(db, gig.provider_id)
  } else if (gig.provider_type === 'consultant') {
    await updateConsultantRatingStats(db, gig.provider_id)
  }

  return ok({ review })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const isCpuTimeout = /CPU|timeout|abort|budget|exceeded|terminated/i.test(message)
    return fail(message, isCpuTimeout ? 503 : 500)
  } finally {
    request.signal.removeEventListener('abort', postAbortHandler)
  }
}

async function updateGigRatingStats(db: any, gigId: string) {
  const { data: reviews } = await db
    .from('gig_reviews')
    .select('rating')
    .eq('gig_id', gigId)
    .eq('status', 'published')

  if (!reviews || reviews.length === 0) return

  const totalRating = reviews.reduce((sum: number, r: any) => sum + r.rating, 0)
  const avgRating = Number((totalRating / reviews.length).toFixed(2))

  await db
    .from('gigs')
    .update({
      avg_rating: avgRating,
      review_count: reviews.length,
    })
    .eq('id', gigId)
}

async function updateAttorneyRatingStats(db: any, attorneyId: string) {
  const { data: ratings } = await db
    .from('attorney_ratings')
    .select('stars')
    .eq('attorney_id', attorneyId)

  if (!ratings || ratings.length === 0) return

  const totalStars = ratings.reduce((sum: number, r: any) => sum + r.stars, 0)
  const avgRating = Number((totalStars / ratings.length).toFixed(2))

  await db
    .from('attorneys')
    .update({
      avg_rating: avgRating,
      review_count: ratings.length,
    })
    .eq('id', attorneyId)
}

async function updateConsultantRatingStats(db: any, consultantId: string) {
  const { data: ratings } = await db
    .from('consultant_ratings')
    .select('stars')
    .eq('consultant_id', consultantId)

  if (!ratings || ratings.length === 0) return

  const totalStars = ratings.reduce((sum: number, r: any) => sum + r.stars, 0)
  const avgRating = Number((totalStars / ratings.length).toFixed(2))

  await db
    .from('consultants')
    .update({
      avg_rating: avgRating,
      review_count: ratings.length,
    })
    .eq('id', consultantId)
}
