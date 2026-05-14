/**
 * PATCH /api/admin/escrow/[id]/freeze
 * Freeze or unfreeze an escrow (admin lock to prevent any release).
 *
 * Body: { action: 'freeze'|'unfreeze', reason: string }
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

  if (!['freeze', 'unfreeze'].includes(action)) return fail('action must be freeze or unfreeze.', 422)
  if (!reason) return fail('A reason is required.', 422)

  const warnings: string[] = []

  let order: any
  try {
    const { data, error } = await db
      .from('orders')
      .select('id, status, escrow_status, escrow_amount, escrow_frozen_at')
      .eq('id', orderId)
      .single() as any
    if (error || !data) return fail('Order not found.', 404)
    order = data
  } catch (err: any) {
    return fail(err.message || 'Order load failed.', 500)
  }

  const nowIso = new Date().toISOString()
  const update: Record<string, any> = { updated_at: nowIso }
  let eventType: 'frozen' | 'unfrozen'

  if (action === 'freeze') {
    if (order.escrow_status === 'frozen') return fail('Escrow is already frozen.', 409)
    update.escrow_status = 'frozen'
    update.escrow_frozen_at = nowIso
    update.escrow_frozen_by = profileId
    update.escrow_frozen_reason = reason
    eventType = 'frozen'
  } else {
    if (order.escrow_status !== 'frozen') return fail('Escrow is not frozen.', 409)
    update.escrow_status = 'held'
    update.escrow_frozen_at = null
    update.escrow_frozen_by = null
    update.escrow_frozen_reason = null
    eventType = 'unfrozen'
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
      amount: null,
      balance_after: Number(order.escrow_amount || 0),
      actor_id: profileId,
      actor_role: 'admin',
      reason,
      metadata: { action },
    })
  } catch (err: any) {
    warnings.push(`escrow_event_failed: ${err.message}`)
  }

  try {
    await db.from('admin_audit_log').insert({
      admin_id: profileId,
      action_type: `escrow_${action}`,
      target_table: 'orders',
      target_id: orderId,
      payload_snapshot: { action, previous_status: order.escrow_status },
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

  return ok({ order: updated, action }, {}, warnings.length ? { data_warnings: warnings } : {})
}
