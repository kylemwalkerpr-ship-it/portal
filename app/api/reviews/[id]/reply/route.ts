import { ok, fail } from '@/lib/apiEnvelope'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { auth } from '@clerk/nextjs/server'

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth()
  if (!userId) {
    return fail('Authentication required', 401)
  }

  const body = await request.json()
  const { reply } = body

  // Validation
  if (!reply || reply.length < 10) {
    return fail('Reply must be at least 10 characters', 400)
  }

  if (reply.length > 1000) {
    return fail('Reply must be less than 1000 characters', 400)
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
    .select(`
      id,
      gig_id,
      gig:gigs(
        id,
        provider_id,
        provider_type
      )
    `)
    .eq('id', params.id)
    .single()

  if (!review) {
    return fail('Review not found', 404)
  }

  // Check if user is the seller of this gig
  const gig = review.gig as any
  if (gig.provider_id !== profile.id && profile.role !== 'admin') {
    return fail('You can only reply to reviews of your own gigs', 403)
  }

  // Update review with reply
  const { data: updatedReview, error } = await db
    .from('gig_reviews')
    .update({
      seller_reply: reply,
      seller_reply_at: new Date().toISOString(),
      seller_reply_by: profile.id,
    })
    .eq('id', params.id)
    .select()
    .single()

  if (error) {
    return fail('Failed to add reply', 500)
  }

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
    .select(`
      id,
      gig_id,
      gig:gigs(
        id,
        provider_id,
        provider_type
      )
    `)
    .eq('id', params.id)
    .single()

  if (!review) {
    return fail('Review not found', 404)
  }

  // Check if user is the seller of this gig
  const gig = review.gig as any
  if (gig.provider_id !== profile.id && profile.role !== 'admin') {
    return fail('You can only delete replies to your own gigs', 403)
  }

  // Remove reply
  const { data: updatedReview, error } = await db
    .from('gig_reviews')
    .update({
      seller_reply: null,
      seller_reply_at: null,
      seller_reply_by: null,
    })
    .eq('id', params.id)
    .select()
    .single()

  if (error) {
    return fail('Failed to remove reply', 500)
  }

  return ok({ review: updatedReview })
}
