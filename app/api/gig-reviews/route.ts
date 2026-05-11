import { ok, fail } from '@/lib/apiEnvelope'
import { requirePortalUser } from '@/lib/portalAuth'

export async function POST(req: Request) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  if (auth.role !== 'client') return fail('Only students can review gigs.', 403)
  const body = await req.json().catch(() => ({}))

  const { data: order } = await auth.db
    .from('orders')
    .select('id, client_id, status, gig_id')
    .eq('id', body.order_id)
    .single()
  if (!order) return fail('Order not found.', 404)
  if (order.client_id !== auth.profileId) return fail('Forbidden.', 403)
  if (!['completed', 'released'].includes(String(order.status))) return fail('Review unlocks after completion.', 409)
  if (!order.gig_id && !body.gig_id) return fail('Order is not linked to a gig.', 422)

  const rating = Number(body.rating)
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return fail('Rating must be 1-5.', 422)

  const { data: review, error } = await auth.db.from('gig_reviews').insert({
    gig_id: body.gig_id || order.gig_id,
    order_id: order.id,
    reviewer_id: auth.profileId,
    rating,
    body: typeof body.body === 'string' ? body.body.slice(0, 500) : null,
    comm_rating: body.comm_rating || null,
    expertise_rating: body.expertise_rating || null,
    value_rating: body.value_rating || null,
  }).select('*').single()
  if (error || !review) return fail(error?.message || 'Could not save review.', 500)
  return ok({ review }, { status: 201 })
}
