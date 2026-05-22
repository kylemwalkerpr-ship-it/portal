import { getClerkUserId } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase'

// Public list of ratings for an attorney.
export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id: attorneyId } = await context.params
  const db = createSupabaseAdminClient()
  const { data: ratings, error } = await db
    .from('attorney_ratings')
    .select('id, stars, comment, created_at')
    .eq('attorney_id', attorneyId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ratings: ratings ?? [] })
}

// Submit / update a rating for an attorney. One rating per (rater, attorney);
// re-rating overwrites the previous value.
//
// TODO once the attorney engagement / order flow exists: gate this on the rater
// having a completed engagement with this attorney. For now any active client
// can rate, which is the minimum needed to exercise the aggregate display.
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const userId = await getClerkUserId()
  if (!userId) return Response.json({ error: 'Unauthenticated.' }, { status: 401 })

  const { id: attorneyId } = await context.params
  if (!attorneyId) return Response.json({ error: 'Missing attorney id.' }, { status: 400 })

  let body: { stars?: number; comment?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON.' }, { status: 400 })
  }

  const stars = Number(body.stars)
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
    return Response.json({ error: 'stars must be an integer 1-5.' }, { status: 400 })
  }
  const comment = typeof body.comment === 'string' ? body.comment.trim().slice(0, 2000) : null

  const db = createSupabaseAdminClient()

  const { data: rater } = await db
    .from('profiles')
    .select('id, role, status')
    .eq('clerk_user_id', userId)
    .single()
  if (!rater) return Response.json({ error: 'Profile not found.' }, { status: 404 })
  if (rater.role !== 'client' || rater.status !== 'active') {
    return Response.json({ error: 'Only active clients can rate attorneys.' }, { status: 403 })
  }

  const { data: attorney } = await db.from('attorneys').select('id, profile_id').eq('id', attorneyId).single()
  if (!attorney) return Response.json({ error: 'Attorney not found.' }, { status: 404 })
  if (attorney.profile_id === rater.id) {
    return Response.json({ error: 'You cannot rate yourself.' }, { status: 400 })
  }

  const { error } = await db.from('attorney_ratings').upsert(
    {
      attorney_id: attorneyId,
      rater_profile_id: rater.id,
      stars,
      comment,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'attorney_id,rater_profile_id' },
  )
  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ ok: true })
}
