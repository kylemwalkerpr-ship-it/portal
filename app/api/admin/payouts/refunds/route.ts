/**
 * GET /api/admin/payouts/refunds
 * Full refund ledger with order context.
 */
import { ok, fail } from '@/lib/apiEnvelope'
import { requireAdminUser } from '@/lib/portalAuth'

export async function GET() {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  const { data: refunds, error: refundErr } = await auth.db
    .from('refund_ledger')
    .select('id, order_id, amount, method, status, initiated_by, created_at')
    .order('created_at', { ascending: false })
    .limit(200)

  if (refundErr) return fail(refundErr.message, 500)

  const { data: cancelledOrders } = await auth.db
    .from('orders')
    .select('id, total_amount, status, cancelled_at, consultant_id, client_id, created_at')
    .in('status', ['cancelled', 'refunded'])
    .order('cancelled_at', { ascending: false })
    .limit(100)

  const orderIds = (refunds ?? []).map(r => r.order_id).filter(Boolean)
  let orderProviderMap: Record<string, string> = {}
  if (orderIds.length) {
    const { data: orders } = await auth.db.from('orders').select('id, consultant_id').in('id', orderIds)
    const providerIds = (orders ?? []).map(o => o.consultant_id).filter(Boolean)
    if (providerIds.length) {
      const { data: profiles } = await auth.db.from('profiles').select('id, full_name, email').in('id', providerIds)
      const pm: Record<string, string> = {}
      for (const p of profiles ?? []) pm[p.id] = p.full_name || p.email
      for (const o of orders ?? []) orderProviderMap[o.id] = pm[o.consultant_id] || '—'
    }
  }

  const summary = {
    total_refunds:  (refunds ?? []).length,
    total_amount:   (refunds ?? []).reduce((s, r) => s + Number(r.amount || 0), 0),
    pending:        (refunds ?? []).filter(r => r.status === 'pending').length,
    completed:      (refunds ?? []).filter(r => r.status === 'completed').length,
    cancelled_orders: (cancelledOrders ?? []).length,
  }

  return ok({
    refunds: (refunds ?? []).map(r => ({ ...r, provider_name: orderProviderMap[r.order_id] || '—' })),
    cancelled_orders: cancelledOrders ?? [],
    summary,
  })
}
