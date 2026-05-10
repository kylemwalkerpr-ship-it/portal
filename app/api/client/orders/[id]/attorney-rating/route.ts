import { requireClient } from '@/lib/clientAuth'

// Resolves an order to the attorney that fulfilled it (if any) and surfaces
// the client's existing rating. Used by the order detail UI to render an
// inline "rate the attorney" prompt for completed attorney-originated orders.
export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { ctx, error, status } = await requireClient()
  if (!ctx) return Response.json({ error }, { status })

  const { id: orderId } = await context.params

  const { data: order } = await ctx.db
    .from('orders')
    .select('id, client_id, consultant_id, status, escrow_status, source_offer_id')
    .eq('id', orderId)
    .single()
  if (!order) return Response.json({ error: 'Order not found.' }, { status: 404 })
  if (order.client_id !== ctx.profileId) return Response.json({ error: 'Forbidden.' }, { status: 403 })
  if (!order.source_offer_id || !order.consultant_id) {
    return Response.json({ is_attorney_order: false })
  }

  // Find the attorneys row for the fulfilling profile.
  const { data: attorney } = await ctx.db
    .from('attorneys')
    .select('id, profile_id')
    .eq('profile_id', order.consultant_id)
    .single()

  if (!attorney) {
    // Order was fulfilled by a profile that isn't (or no longer is) an attorney.
    return Response.json({ is_attorney_order: false })
  }

  const [{ data: attorneyProfile }, { data: existing }] = await Promise.all([
    ctx.db.from('profiles').select('full_name, email').eq('id', attorney.profile_id).single(),
    ctx.db
      .from('attorney_ratings')
      .select('stars, comment')
      .eq('attorney_id', attorney.id)
      .eq('rater_profile_id', ctx.profileId)
      .maybeSingle(),
  ])

  const orderComplete =
    order.status === 'completed' ||
    ['released', 'paid', 'completed'].includes(String(order.escrow_status || '').toLowerCase())

  return Response.json({
    is_attorney_order: true,
    attorney_id: attorney.id,
    attorney_name: attorneyProfile?.full_name || attorneyProfile?.email?.split('@')[0] || 'Attorney',
    can_rate: orderComplete,
    my_rating: existing ?? null,
  })
}
