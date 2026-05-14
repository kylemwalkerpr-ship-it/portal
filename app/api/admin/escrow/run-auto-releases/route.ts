/**
 * POST /api/admin/escrow/run-auto-releases
 * Manually trigger the auto-release sweep. Wraps process_escrow_auto_releases()
 * RPC and then triggers Stripe transfers for each freshly-released order.
 */
import { ok, fail } from '@/lib/apiEnvelope'
import { requireAdminUser } from '@/lib/portalAuth'
import { triggerConsultantPayout } from '@/lib/payouts'

export async function POST(_req: Request) {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  const { db, profileId } = auth

  const warnings: string[] = []
  const sweepStart = new Date()

  // 1. Run the RPC
  let rpcResult: any
  try {
    const { data, error } = await db.rpc('process_escrow_auto_releases') as any
    if (error) return fail(`Auto-release RPC failed: ${error.message}`, 500)
    rpcResult = data || {}
  } catch (err: any) {
    return fail(err.message || 'Auto-release RPC failed.', 500)
  }

  const releasedCount = Number(rpcResult.released_count || 0)
  const releasedTotal = Number(rpcResult.released_total || 0)

  // 2. Find orders that were just released — look at escrow_events from the last 90 seconds
  // for system full_release events.
  const sinceIso = new Date(sweepStart.getTime() - 90 * 1000).toISOString()
  let releasedOrderIds: string[] = []
  try {
    const { data, error } = await db
      .from('escrow_events')
      .select('order_id, created_at, actor_role, event_type')
      .eq('event_type', 'full_release')
      .eq('actor_role', 'system')
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(500) as any
    if (error) {
      warnings.push(`event_lookup_failed: ${error.message}`)
    } else {
      releasedOrderIds = [...new Set(((data ?? []) as any[]).map(e => e.order_id))]
    }
  } catch (err: any) {
    warnings.push(`event_lookup_failed: ${err.message}`)
  }

  // 3. Trigger Stripe payouts for each, in parallel with per-order error capture
  const transferResults = await Promise.all(
    releasedOrderIds.map(async orderId => {
      try {
        const result = await triggerConsultantPayout(orderId)
        return {
          order_id: orderId,
          status: result.skipped ? 'skipped' : result.failed ? 'failed' : 'transferred',
          detail: result.reason || result.transferId || result.error || 'ok',
        }
      } catch (err: any) {
        return { order_id: orderId, status: 'error', detail: err.message || 'unknown error' }
      }
    })
  )

  // 4. Audit log
  try {
    await db.from('admin_audit_log').insert({
      admin_id: profileId,
      action_type: 'escrow_run_auto_releases',
      target_table: 'orders',
      target_id: releasedOrderIds[0] || null,
      payload_snapshot: { rpc_result: rpcResult, transfer_results: transferResults },
      reason: 'Manual auto-release sweep',
    })
  } catch (err: any) {
    warnings.push(`audit_log_failed: ${err.message}`)
  }

  return ok({
    released_count: releasedCount,
    released_total: releasedTotal,
    transfer_results: transferResults,
    rpc_result: rpcResult,
  }, {}, warnings.length ? { data_warnings: warnings } : {})
}
