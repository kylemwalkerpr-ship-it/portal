/**
 * POST /api/admin/escrow/run-auto-releases
 * Manually trigger the auto-release sweep. Wraps process_escrow_auto_releases()
 * RPC and then releases earnings for each freshly-released order.
 */
import { ok, fail } from '@/lib/apiEnvelope'
import { requireAdminUser } from '@/lib/portalAuth'
import { releaseEarningsForOrder } from '@/lib/earnings'

export async function POST(_req: Request) {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  const { db, profileId } = auth

  const warnings: string[] = []
  const sweepStart = new Date()

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

  const releaseResults = await Promise.all(
    releasedOrderIds.map(async orderId => {
      try {
        const result = await releaseEarningsForOrder(orderId)
        return {
          order_id: orderId,
          status: result.length ? 'released' : 'none',
          detail: `${result.length} earning(s) released`,
        }
      } catch (err: any) {
        return { order_id: orderId, status: 'error', detail: err.message || 'unknown error' }
      }
    })
  )

  try {
    await db.from('admin_audit_log').insert({
      admin_id: profileId,
      action_type: 'escrow_run_auto_releases',
      target_table: 'orders',
      target_id: releasedOrderIds[0] || null,
      payload_snapshot: { rpc_result: rpcResult, release_results: releaseResults },
      reason: 'Manual auto-release sweep',
    })
  } catch (err: any) {
    warnings.push(`audit_log_failed: ${err.message}`)
  }

  return ok({
    released_count: releasedCount,
    released_total: releasedTotal,
    release_results: releaseResults,
    rpc_result: rpcResult,
  }, {}, warnings.length ? { data_warnings: warnings } : {})
}
