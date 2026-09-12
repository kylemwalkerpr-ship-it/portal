import { getCurrentConsultant } from '@/lib/consultant'
import { releaseEarningsForOrder } from '@/lib/earnings'
import { recordOrderActivity } from '@/lib/orderActivityAudit'

// Completion is only legitimate once an order is actually in progress. This is
// both a workflow guard and a terminal-resurrection guard: a client-cancelled
// (or not-yet-started) order can never be flip-straight to 'completed' +
// 'released' by a stale or concurrent request.
const COMPLETABLE = ['in_progress', 'under_review', 'revision_requested', 'active', 'review', 'delivered']

export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getCurrentConsultant()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const { id } = await context.params
  const { data: order } = await auth.db
    .from('orders')
    .select('*')
    .eq('id', id)
    .eq('consultant_id', auth.profile.id)
    .single()

  if (!order) return Response.json({ error: 'Order not found' }, { status: 404 })
  if (!COMPLETABLE.includes(order.status)) {
    return Response.json({ error: `Order cannot be completed from status ${order.status}.` }, { status: 409 })
  }

  let { data, error } = await auth.db
    .from('orders')
    .update({ status: 'completed', escrow_status: 'released', completed_at: new Date().toISOString() })
    .eq('id', id)
    .eq('consultant_id', auth.profile.id)
    .eq('status', order.status)
    .select('*')
    .maybeSingle()

  if (error && /completed_at/i.test(error.message)) {
    const retry = await auth.db
      .from('orders')
      .update({ status: 'completed', escrow_status: 'released' })
      .eq('id', id)
      .eq('consultant_id', auth.profile.id)
      .eq('status', order.status)
      .select('*')
      .maybeSingle()
    data = retry.data
    error = retry.error
  }

  if (error) return Response.json({ error: error.message }, { status: 500 })
  if (!data) return Response.json({ error: 'Order status changed by another request — refresh and try again.' }, { status: 409 })

  let earningsReleased: any[] = []
  try {
    earningsReleased = await releaseEarningsForOrder(id)
  } catch (e) { console.error('[consultant/orders/complete] releaseEarningsForOrder failed:', e) }

  await recordOrderActivity(auth.db, {
    orderId: id,
    actorId: auth.profile.id,
    actorRole: 'consultant',
    fromStatus: order.status,
    toStatus: 'completed',
    note: 'Order marked complete by the consultant and provider earnings released.',
  })

  return Response.json({ order: data, earningsReleased })
}