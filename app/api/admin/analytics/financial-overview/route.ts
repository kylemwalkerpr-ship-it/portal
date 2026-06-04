/**
 * GET /api/admin/analytics/financial-overview
 *
 * Operator-level revenue intelligence for the Financials Overview tab.
 *
 * Returns:
 *   gross_30d              gross revenue collected in last 30d (cents)
 *   gross_30d_prev         same window shifted -30d (for delta calc)
 *   net_take_30d           platform cut of gross_30d
 *   payouts_30d            provider payouts on released-escrow orders in 30d
 *   outstanding_escrow_cents  total held escrow right now
 *   refund_rate_30d_pct    refunded orders / all orders in 30d
 *   chargeback_dollar_30d_cents   sum of refunded total_amount in 30d
 *   revenue_acquired_user  net_take_30d / signups_30d
 *   daily_series           [{ date, gross, net, payouts }]
 *   top_services           top 5 services by gross revenue in last 90d
 *   top_providers          top 5 providers by gross collected in last 90d
 *
 * Money is in cents end-to-end. Total_amount is stored in dollars in
 * `orders` (it's NUMERIC) so we convert with Math.round(*100) here for a
 * cents output, matching the wallet convention.
 */
import { ok, fail } from '@/lib/apiEnvelope'
import { requireAdminUser } from '@/lib/portalAuth'

const DEFAULT_FEE = 30

export async function GET() {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  const { db } = auth

  const data_warnings: string[] = []
  const now = Date.now()
  const ago30 = new Date(now - 30 * 86400_000).toISOString()
  const ago60 = new Date(now - 60 * 86400_000).toISOString()
  const ago90 = new Date(now - 90 * 86400_000).toISOString()

  // ── Platform fee from settings ──────────────────────────────────────────────
  let platformFee = DEFAULT_FEE
  try {
    const { data } = await db.from('platform_settings').select('value').eq('key', 'default').single()
    if (data?.value?.platform_fee_percent) platformFee = Number(data.value.platform_fee_percent)
  } catch { data_warnings.push('platform_settings unavailable; using default fee') }

  const toCents = (n: any) => Math.round((Number(n) || 0) * 100)

  // ── Last 90d orders (we'll filter into windows from this single pull) ───────
  let orders: any[] = []
  try {
    const { data, error } = await db
      .from('orders')
      .select('id, status, total_amount, platform_fee_amount, consultant_payout_amount, escrow_status, escrow_amount, consultant_id, created_at, updated_at')
      .gte('created_at', ago90)
    if (error) throw error
    orders = data ?? []
  } catch (e: any) {
    data_warnings.push(`orders: ${e?.message || 'unavailable'}`)
  }

  // Last 60d also for prev window
  let prevOrders: any[] = []
  try {
    const { data, error } = await db
      .from('orders')
      .select('id, status, total_amount, created_at')
      .gte('created_at', ago60)
      .lt('created_at', ago30)
    if (error) throw error
    prevOrders = data ?? []
  } catch (e: any) {
    data_warnings.push(`prev_orders: ${e?.message || 'unavailable'}`)
  }

  const isActive = (o: any) => !['cancelled', 'refunded'].includes(o.status)
  const isReleased = (o: any) => o.escrow_status === 'released'
  const isRefund = (o: any) => ['refunded', 'cancelled'].includes(o.status)

  const in30 = orders.filter(o => o.created_at >= ago30)
  const active30 = in30.filter(isActive)
  const released30 = in30.filter(isReleased)
  const refund30 = in30.filter(isRefund)

  const gross_30d_cents = active30.reduce((s, o) => s + toCents(o.total_amount), 0)
  const gross_30d_prev_cents = prevOrders.filter(isActive).reduce((s, o) => s + toCents(o.total_amount), 0)
  const net_take_30d_cents = active30.reduce((s, o) => s + toCents(o.platform_fee_amount || (Number(o.total_amount) * platformFee / 100)), 0)
  const payouts_30d_cents = released30.reduce((s, o) => s + toCents(o.consultant_payout_amount || (Number(o.total_amount) * (100 - platformFee) / 100)), 0)
  const refund_rate_30d_pct = in30.length ? (refund30.length / in30.length) * 100 : 0
  const chargeback_dollar_30d_cents = refund30.reduce((s, o) => s + toCents(o.total_amount), 0)

  // ── Outstanding escrow ──────────────────────────────────────────────────────
  let outstanding_escrow_cents = 0
  try {
    const { data, error } = await db
      .from('orders')
      .select('escrow_status, escrow_amount, total_amount')
      .in('escrow_status', ['held', 'partial_released', 'disputed', 'frozen'])
    if (error) throw error
    for (const o of data ?? []) {
      outstanding_escrow_cents += toCents(o.escrow_amount || o.total_amount || 0)
    }
  } catch (e: any) {
    data_warnings.push(`escrow_outstanding: ${e?.message || 'unavailable'}`)
  }

  // ── Signups in last 30d for revenue-per-acquired-user ───────────────────────
  let signups_30d = 0
  try {
    const { count, error } = await db
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', ago30)
    if (error) throw error
    signups_30d = count ?? 0
  } catch (e: any) {
    data_warnings.push(`signups_30d: ${e?.message || 'unavailable'}`)
  }
  const revenue_per_acquired_user_cents = signups_30d ? Math.round(net_take_30d_cents / signups_30d) : 0

  // ── Daily series (last 30d) — gross / net / payouts ─────────────────────────
  const dayMap: Record<string, { gross: number; net: number; payouts: number }> = {}
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now - i * 86400_000).toISOString().slice(0, 10)
    dayMap[d] = { gross: 0, net: 0, payouts: 0 }
  }
  for (const o of in30) {
    const k = String(o.created_at).slice(0, 10)
    if (!dayMap[k]) continue
    if (isActive(o)) {
      dayMap[k].gross += toCents(o.total_amount)
      dayMap[k].net   += toCents(o.platform_fee_amount || (Number(o.total_amount) * platformFee / 100))
    }
    if (isReleased(o)) {
      dayMap[k].payouts += toCents(o.consultant_payout_amount || (Number(o.total_amount) * (100 - platformFee) / 100))
    }
  }
  const daily_series = Object.entries(dayMap).map(([date, v]) => ({ date, ...v }))

  // ── Top 5 services by gross 90d ─────────────────────────────────────────────
  // orders.gig_id does not exist on this schema; bucket via order_items.service_id
  // and resolve titles from the services table.
  let top_services: Array<{ gig_id: string; title: string | null; orders: number; gross_cents: number }> = []
  try {
    const activeOrders = orders.filter(isActive)
    const orderIds = activeOrders.map(o => o.id)
    const grossByOrder: Record<string, number> = {}
    for (const o of activeOrders) grossByOrder[o.id] = toCents(o.total_amount)

    let serviceByOrder: Record<string, string> = {}
    if (orderIds.length) {
      const { data: items } = await db
        .from('order_items')
        .select('order_id, service_id')
        .in('order_id', orderIds)
      for (const i of items ?? []) {
        if (!serviceByOrder[i.order_id] && i.service_id) serviceByOrder[i.order_id] = i.service_id
      }
    }

    const buckets: Record<string, { orders: number; gross_cents: number }> = {}
    for (const oid of orderIds) {
      const sid = serviceByOrder[oid]
      if (!sid) continue
      buckets[sid] = buckets[sid] || { orders: 0, gross_cents: 0 }
      buckets[sid].orders++
      buckets[sid].gross_cents += grossByOrder[oid] || 0
    }
    const ranked = Object.entries(buckets).sort((a, b) => b[1].gross_cents - a[1].gross_cents).slice(0, 5)
    const ids = ranked.map(([id]) => id)
    const titleMap: Record<string, string> = {}
    if (ids.length) {
      const { data: svcs } = await db.from('services').select('id, title').in('id', ids)
      for (const s of svcs ?? []) titleMap[s.id] = s.title
    }
    top_services = ranked.map(([gig_id, v]) => ({ gig_id, title: titleMap[gig_id] || null, ...v }))
  } catch (e: any) {
    data_warnings.push(`top_services: ${e?.message || 'unavailable'}`)
  }

  // ── Top 5 providers by gross 90d ────────────────────────────────────────────
  let top_providers: Array<{ provider_id: string; name: string | null; role: string | null; orders: number; gross_cents: number }> = []
  try {
    const buckets: Record<string, { orders: number; gross_cents: number }> = {}
    for (const o of orders.filter(isActive)) {
      if (!o.consultant_id) continue
      buckets[o.consultant_id] = buckets[o.consultant_id] || { orders: 0, gross_cents: 0 }
      buckets[o.consultant_id].orders++
      buckets[o.consultant_id].gross_cents += toCents(o.total_amount)
    }
    const ranked = Object.entries(buckets).sort((a, b) => b[1].gross_cents - a[1].gross_cents).slice(0, 5)
    const ids = ranked.map(([id]) => id)
    const profileMap: Record<string, any> = {}
    if (ids.length) {
      const { data: profs } = await db.from('profiles').select('id, full_name, email, role').in('id', ids)
      for (const p of profs ?? []) profileMap[p.id] = p
    }
    top_providers = ranked.map(([provider_id, v]) => ({
      provider_id,
      name: profileMap[provider_id]?.full_name || profileMap[provider_id]?.email || null,
      role: profileMap[provider_id]?.role || null,
      ...v,
    }))
  } catch (e: any) {
    data_warnings.push(`top_providers: ${e?.message || 'unavailable'}`)
  }

  return ok({
    platform_fee_percent: platformFee,
    gross_30d_cents,
    gross_30d_prev_cents,
    net_take_30d_cents,
    payouts_30d_cents,
    outstanding_escrow_cents,
    refund_rate_30d_pct,
    chargeback_dollar_30d_cents,
    revenue_per_acquired_user_cents,
    signups_30d,
    daily_series,
    top_services,
    top_providers,
    data_warnings,
  })
}
