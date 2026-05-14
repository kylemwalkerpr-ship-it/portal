/**
 * POST /api/admin/escrow/[id]/refund
 * Admin refund of escrow funds. Records the intent — actual Stripe refund
 * is a TODO and would call getStripe().refunds.create with the order's payment intent.
 *
 * Body: { amount?: number (full if omitted), reason: string }
 */
import { ok, fail } from '@/lib/apiEnvelope'
import { requireAdminUser } from '@/lib/portalAuth'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  const { db, profileId } = auth

  const { id: orderId } = await params
  if (!orderId) return fail('Order id is required.', 400)

  const body = await req.json().catch(() => ({}))
  const reason: string = body.reason
  if (!reason) return fail('A reason is required.', 422)

  const warnings: string[] = []

  let order: any
  try {
    const { data, error } = await db
      .from('orders')
      .select('id, status, escrow_status, escrow_amount, escrow_refunded_amount, stripe_payment_intent_id')
      .eq('id', orderId)
      .single() as any
    if (error || !data) return fail('Order not found.', 404)
    order = data
  } catch (err: any) {
    return fail(err.message || 'Order load failed.', 500)
  }

  const currentEscrow = Number(order.escrow_amount || 0)
  const requestedAmount = body.amount !== undefined ? Number(body.amount) : currentEscrow

  if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
    return fail('Refund amount must be positive.', 422)
  }
  if (requestedAmount > currentEscrow) {
    return fail(`Refund amount exceeds escrow balance (${currentEscrow}).`, 422)
  }

  const remaining = currentEscrow - requestedAmount
  const isFullRefund = remaining <= 0
  const newEscrowStatus = isFullRefund ? 'refunded' : 'partial_released'

  // TODO: actual Stripe refund call would go here.
  // const stripe = getStripe()
  // const refund = await stripe.refunds.create({
  //   payment_intent: order.stripe_payment_intent_id,
  //   amount: Math.round(requestedAmount * 100),
  //   reason: 'requested_by_customer',
  //   metadata: { orderId, adminId: profileId },
  // })
  const stripeRefundIntent = { todo: 'stripe.refunds.create', amount: requestedAmount }

  try {
    const update: Record<string, any> = {
      escrow_amount: remaining,
      escrow_refunded_amount: Number(order.escrow_refunded_amount || 0) + requestedAmount,
      escrow_status: newEscrowStatus,
      updated_at: new Date().toISOString(),
    }
    if (isFullRefund) update.status = 'refunded'

    const { error: updErr } = await db.from('orders').update(update).eq('id', orderId)
    if (updErr) warnings.push(`order_update_failed: ${updErr.message}`)
  } catch (err: any) {
    warnings.push(`order_update_failed: ${err.message}`)
  }

  try {
    await db.from('escrow_events').insert({
      order_id: orderId,
      event_type: 'refund',
      amount: -1 * requestedAmount,
      balance_after: remaining,
      actor_id: profileId,
      actor_role: 'admin',
      reason,
      metadata: { full_refund: isFullRefund, stripe_refund_intent: stripeRefundIntent },
    })
  } catch (err: any) {
    warnings.push(`escrow_event_failed: ${err.message}`)
  }

  try {
    await db.from('admin_audit_log').insert({
      admin_id: profileId,
      action_type: 'escrow_refund',
      target_table: 'orders',
      target_id: orderId,
      payload_snapshot: {
        previous_escrow_amount: currentEscrow,
        refund_amount: requestedAmount,
        remaining,
        full_refund: isFullRefund,
        stripe_refund_intent: stripeRefundIntent,
      },
      reason,
    })
  } catch (err: any) {
    warnings.push(`audit_log_failed: ${err.message}`)
  }

  let updated: any = null
  try {
    const { data } = await db.from('orders').select('*').eq('id', orderId).single() as any
    updated = data
  } catch { warnings.push('order_refetch_failed') }

  return ok({ order: updated, refund_amount: requestedAmount, remaining, full_refund: isFullRefund }, {}, warnings.length ? { data_warnings: warnings } : {})
}
