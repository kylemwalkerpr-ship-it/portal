/**
 * POST /api/admin/payouts/release
 * Release payout for a single order — releases earnings for the order.
 * Body: { order_id: string }
 *
 * POST /api/admin/payouts/release?batch=true
 * Batch release — Body: { order_ids: string[] }
 */
import { ok, fail } from '@/lib/apiEnvelope'
import { requireAdminUser } from '@/lib/portalAuth'
import { releaseEarningsForOrder } from '@/lib/earnings'

export async function POST(req: Request) {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  const body = await req.json().catch(() => ({}))
  const batch = new URL(req.url).searchParams.get('batch') === 'true'

  if (batch) {
    const ids: string[] = Array.isArray(body.order_ids) ? body.order_ids.slice(0, 50) : []
    if (!ids.length) return fail('order_ids array is required.', 400)

    const results = await Promise.allSettled(ids.map(id => releaseEarningsForOrder(id)))
    const summary = results.map((r, i) => ({
      order_id: ids[i],
      status: r.status === 'fulfilled' ? (r.value.length ? 'released' : 'none') : 'error',
      detail: r.status === 'fulfilled' ? `${r.value.length} earning(s) released` : (r.reason?.message || 'error'),
    }))

    await auth.db.from('admin_audit_log').insert({
      admin_id: auth.profileId,
      action_type: 'batch_earnings_release',
      target_table: 'provider_earnings',
      target_id: ids[0],
      payload_snapshot: { order_ids: ids, summary },
      reason: body.reason || 'Admin batch earnings release',
    })

    return ok({ results: summary, released: summary.filter(r => r.status === 'released').length })
  }

  const orderId: string = body.order_id
  if (!orderId) return fail('order_id is required.', 400)

  try {
    const released = await releaseEarningsForOrder(orderId)

    await auth.db.from('admin_audit_log').insert({
      admin_id: auth.profileId,
      action_type: 'earnings_release',
      target_table: 'provider_earnings',
      target_id: orderId,
      payload_snapshot: { released_count: released.length },
      reason: body.reason || 'Admin manual earnings release',
    })

    return ok({ released: true, count: released.length })
  } catch (err: any) {
    return fail(err.message || 'Release failed.', 500)
  }
}
