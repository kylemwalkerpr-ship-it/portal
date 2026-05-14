/**
 * PATCH /api/admin/escrow/[id]/dispute
 * Open or resolve a dispute on an escrow.
 *
 * Body: { action: 'open'|'resolve', reason: string, resolution?: 'release'|'refund'|'split'|'none' }
 */
import { ok, fail } from '@/lib/apiEnvelope'
import { requireAdminUser } from '@/lib/portalAuth'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  const { db, profileId } = auth

  const { id: orderId } = await params
  if (!orderId) return fail('Order id is required.', 400)

  const body = await req.json().catch(() => ({}))
  const action: string = body.action
  const reason: string = body.reason
  const resolution: string | undefined = body.resolution

  if (!['open', 'resolve'].includes(action)) return fail('action must be open or resolve.', 422)
  if (!reason) return fail('A reason is required.', 422)
  if (action === 'resolve' && resolution && !['release', 'refund', 'split', 'none'].includes(resolution)) {
    return fail('Invalid resolution.', 422)
  }

  const warnings: string[] = []

  let order: any
  try {
    const { data, error } = await db
      .from('orders')
      .select('id, status, escrow_status, escrow_amount, escrow_refunded_amount')
      .eq('id', orderId)
      .single() as any
    if (error || !data) return fail('Order not found.', 404)
    order = data
  } catch (err: any) {
    return fail(err.message || 'Order load failed.', 500)
  }

  const nowIso = new Date().toISOString()
  let update: Record<string, any> = { updated_at: nowIso }
  let eventType = 'dispute_opened'
  let eventAmount: number | null = null
  let balanceAfter: number = Number(order.escrow_amount || 0)

  if (action === 'open') {
    if (order.escrow_status === 'disputed') return fail('Escrow is already disputed.', 409)
    update.escrow_status = 'disputed'
    update.escrow_disputed_at = nowIso
    update.escrow_dispute_reason = reason
    eventType = 'dispute_opened'
  } else {
    // resolve
    if (order.escrow_status !== 'disputed') return fail('Escrow is not in disputed state.', 409)
    eventType = 'dispute_resolved'

    if (resolution === 'refund') {
      const currentEscrow = Number(order.escrow_amount || 0)
      update.escrow_status = 'refunded'
      update.escrow_amount = 0
      update.escrow_refunded_amount = Number(order.escrow_refunded_amount || 0) + currentEscrow
      update.status = 'refunded'
      eventAmount = -1 * currentEscrow
      balanceAfter = 0
    } else if (resolution === 'release') {
      // Set back to held so a normal release call can proceed
      update.escrow_status = 'held'
      update.escrow_disputed_at = null
      update.escrow_dispute_reason = null
    } else {
      // split or none — clear disputed marker; admin handles separately
      update.escrow_status = 'held'
      update.escrow_disputed_at = null
      update.escrow_dispute_reason = null
    }
  }

  try {
    const { error: updErr } = await db.from('orders').update(update).eq('id', orderId)
    if (updErr) warnings.push(`order_update_failed: ${updErr.message}`)
  } catch (err: any) {
    warnings.push(`order_update_failed: ${err.message}`)
  }

  try {
    await db.from('escrow_events').insert({
      order_id: orderId,
      event_type: eventType,
      amount: eventAmount,
      balance_after: balanceAfter,
      actor_id: profileId,
      actor_role: 'admin',
      reason,
      metadata: { action, resolution: resolution || null },
    })
  } catch (err: any) {
    warnings.push(`escrow_event_failed: ${err.message}`)
  }

  try {
    await db.from('admin_audit_log').insert({
      admin_id: profileId,
      action_type: action === 'open' ? 'escrow_dispute_open' : 'escrow_dispute_resolve',
      target_table: 'orders',
      target_id: orderId,
      payload_snapshot: { action, resolution: resolution || null, previous_status: order.escrow_status },
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

  return ok({ order: updated, action, resolution: resolution || null }, {}, warnings.length ? { data_warnings: warnings } : {})
}
