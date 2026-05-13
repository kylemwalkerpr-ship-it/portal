import { ok, fail } from '@/lib/apiEnvelope'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { auth } from '@clerk/nextjs/server'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const db = createSupabaseAdminClient()

  const { data: review, error } = await db
    .from('gig_reviews')
    .select(`
      *,
      client:profiles!gig_reviews_client_id_fkey(
        id,
        full_name,
        email,
        avatar_url
      ),
      gig:gigs(
        id,
        title,
        slug,
        provider_id,
        provider_type
      )
    `)
    .eq('id', params.id)
    .single()

  if (error || !review) {
    return fail('Review not found', 404)
  }

  return ok({ review })
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth()
  if (!userId) {
    return fail('Authentication required', 401)
  }

  const body = await request.json()
  const { rating, title, comment } = body

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

  // Get the review
  const { data: review } = await db
    .from('gig_reviews')
    .select('id, client_id, gig_id, status')
    .eq('id', params.id)
    .single()

  if (!review) {
    return fail('Review not found', 404)
  }

  // Check if user owns the review
  if (review.client_id !== profile.id) {
    return fail('You can only edit your own reviews', 403)
  }

  // Validation
  if (rating !== undefined && (rating < 1 || rating > 5)) {
    return fail('Rating must be between 1 and 5', 400)
  }

  if (comment !== undefined) {
    if (comment.length < 10) {
      return fail('Comment must be at least 10 characters', 400)
    }
    if (comment.length > 1000) {
      return fail('Comment must be less than 1000 characters', 400)
    }
  }

  // Update review
  const updateData: any = {}
  if (rating !== undefined) updateData.rating = rating
  if (title !== undefined) updateData.title = title
  if (comment !== undefined) updateData.comment = comment
  updateData.updated_at = new Date().toISOString()

  const { data: updatedReview, error } = await db
    .from('gig_reviews')
    .update(updateData)
    .eq('id', params.id)
    .select()
    .single()

  if (error) {
    return fail('Failed to update review', 500)
  }

  // Update gig rating stats
  await updateGigRatingStats(db, review.gig_id)

  return ok({ review: updatedReview })
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth()
  if (!userId) {
    return fail('Authentication required', 401)
  }

  const db = createSupabaseAdminClient()

  // Get user's profile
  const { data: profile } = await db
    .from('profiles')
    .select('id, role')
    .eq('clerk_id', userId)
    .single()

  if (!profile) {
    return fail('Profile not found', 404)
  }

  // Get the review
  const { data: review } = await db
    .from('gig_reviews')
    .select('id, client_id, gig_id')
    .eq('id', params.id)
    .single()

  if (!review) {
    return fail('Review not found', 404)
  }

  // Check if user owns the review or is admin
  if (review.client_id !== profile.id && profile.role !== 'admin') {
    return fail('You can only delete your own reviews', 403)
  }

  // Delete review
  const { error } = await db
    .from('gig_reviews')
    .delete()
    .eq('id', params.id)

  if (error) {
    return fail('Failed to delete review', 500)
  }

  // Update gig rating stats
  await updateGigRatingStats(db, review.gig_id)

  return ok({ success: true })
}

async function updateGigRatingStats(db: any, gigId: string) {
  const { data: reviews } = await db
    .from('gig_reviews')
    .select('rating')
    .eq('gig_id', gigId)
    .eq('status', 'published')

  if (!reviews || reviews.length === 0) {
    await db
      .from('gigs')
      .update({
        avg_rating: null,
        review_count: 0,
      })
      .eq('id', gigId)
    return
  }

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
