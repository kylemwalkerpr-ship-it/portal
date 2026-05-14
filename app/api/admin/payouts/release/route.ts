/**
 * POST /api/admin/payouts/release
 * Release payout for a single order — wraps triggerConsultantPayout.
 * Body: { order_id: string }
 *
 * POST /api/admin/payouts/release?batch=true
 * Batch release — Body: { order_ids: string[] }
 */
import { ok, fail } from '@/lib/apiEnvelope'
import { requireAdminUser } from '@/lib/portalAuth'
import { triggerConsultantPayout } from '@/lib/payouts'

export async function POST(req: Request) {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  const body = await req.json().catch(() => ({}))
  const batch = new URL(req.url).searchParams.get('batch') === 'true'

  if (batch) {
    // Batch release
    const ids: string[] = Array.isArray(body.order_ids) ? body.order_ids.slice(0, 50) : []
    if (!ids.length) return fail('order_ids array is required.', 400)

    const results = await Promise.allSettled(ids.map(id => triggerConsultantPayout(id)))
    const summary = results.map((r, i) => ({
      order_id: ids[i],
      status:   r.status === 'fulfilled' ? (r.value.skipped ? 'skipped' : r.value.failed ? 'failed' : 'transferred') : 'error',
      detail:   r.status === 'fulfilled' ? (r.value.reason || r.value.transferId || r.value.error || 'ok') : (r.reason?.message || 'error'),
    }))

    // Log batch action
    await auth.db.from('admin_audit_log').insert({
      admin_id: auth.profileId,
      action_type: 'batch_payout_release',
      target_table: 'orders',
      target_id: ids[0],
      payload_snapshot: { order_ids: ids, summary },
      reason: body.reason || 'Admin batch payout release',
    })

    return ok({ results: summary, transferred: summary.filter(r => r.status === 'transferred').length, failed: summary.filter(r => r.status === 'failed').length })
  }

  // Single release
  const orderId: string = body.order_id
  if (!orderId) return fail('order_id is required.', 400)

  // Validate order exists and is releasable
  const { data: order, error: loadErr } = await auth.db
    .from('orders')
    .select('id, status, escrow_status, payout_status, consultant_id, total_amount')
    .eq('id', orderId)
    .single()

  if (loadErr || !order) return fail('Order not found.', 404)
  if (order.payout_status === 'transferred') return fail('Payout already transferred for this order.', 409)

  try {
    const result = await triggerConsultantPayout(orderId)

    await auth.db.from('admin_audit_log').insert({
      admin_id: auth.profileId,
      action_type: 'payout_release',
      target_table: 'orders',
      target_id: orderId,
      payload_snapshot: { result, order_amount: order.total_amount },
      reason: body.reason || 'Admin manual payout release',
    })

    if (result.skipped) return ok({ skipped: true, reason: result.reason })
    if (result.failed)  return ok({ failed: true, error: result.error })
    return ok({ transferred: true, transfer_id: result.transferId })
  } catch (err: any) {
    return fail(err.message || 'Payout failed.', 500)
  }
}
