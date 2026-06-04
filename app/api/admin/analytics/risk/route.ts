/**
 * GET /api/admin/analytics/risk
 *
 * Risk-tab KPIs:
 *   disputed_count            orders with escrow_status='disputed' or 'frozen'
 *   disputed_dollar_cents     sum of disputed/frozen escrow_amount (or total)
 *   refund_rate_trend         [{ month, refund_rate_pct }] last 6 months
 *   high_refund_providers     top 5 providers (>=5 orders, sorted by refund %)
 *   past_auto_release_overdue  held orders whose auto_release_eligible_at
 *                              was more than 7 days ago
 *
 * Money is cents.
 */
import { ok, fail } from '@/lib/apiEnvelope'
import { requireAdminUser } from '@/lib/portalAuth'

const DAY = 86400_000

export async function GET() {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  const { db } = auth

  const data_warnings: string[] = []
  const now = Date.now()
  const toCents = (n: any) => Math.round((Number(n) || 0) * 100)

  // ── Disputed / frozen ───────────────────────────────────────────────────────
  let disputed_count = 0
  let disputed_dollar_cents = 0
  let disputed_orders: any[] = []
  try {
    const { data, error } = await db
      .from('orders')
      .select('id, order_number, status, escrow_status, escrow_amount, total_amount, client_id, consultant_id, escrow_disputed_at, escrow_frozen_at, escrow_dispute_reason, escrow_frozen_reason, created_at')
      .in('escrow_status', ['disputed', 'frozen'])
    if (error) throw error
    disputed_orders = data ?? []
    disputed_count = disputed_orders.length
    disputed_dollar_cents = disputed_orders.reduce((s, o) => s + toCents(o.escrow_amount || o.total_amount), 0)
  } catch (e: any) {
    data_warnings.push(`disputed_orders: ${e?.message || 'unavailable'}`)
  }

  // ── Refund rate trend last 6 months ─────────────────────────────────────────
  const refund_rate_trend: Array<{ month: string; refund_rate_pct: number; total_orders: number; refunded: number }> = []
  try {
    const since = new Date(now - 6 * 30 * DAY).toISOString()
    const { data, error } = await db
      .from('orders')
      .select('status, created_at')
      .gte('created_at', since)
    if (error) throw error
    const buckets: Record<string, { total: number; refunded: number }> = {}
    for (const o of data ?? []) {
      const d = new Date(o.created_at)
      const k = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
      buckets[k] = buckets[k] || { total: 0, refunded: 0 }
      buckets[k].total++
      if (['refunded', 'cancelled'].includes(o.status)) buckets[k].refunded++
    }
    for (const [month, v] of Object.entries(buckets).sort()) {
      refund_rate_trend.push({
        month,
        refund_rate_pct: v.total ? (v.refunded / v.total) * 100 : 0,
        total_orders: v.total,
        refunded: v.refunded,
      })
    }
  } catch (e: any) {
    data_warnings.push(`refund_rate_trend: ${e?.message || 'unavailable'}`)
  }

  // ── Providers with high refund rate (min 5 orders, top 5) ───────────────────
  let high_refund_providers: Array<{ provider_id: string; name: string | null; orders: number; refunded: number; refund_rate_pct: number }> = []
  try {
    const since = new Date(now - 180 * DAY).toISOString()
    const { data, error } = await db
      .from('orders')
      .select('consultant_id, status')
      .gte('created_at', since)
    if (error) throw error
    const buckets: Record<string, { total: number; refunded: number }> = {}
    for (const o of data ?? []) {
      if (!o.consultant_id) continue
      buckets[o.consultant_id] = buckets[o.consultant_id] || { total: 0, refunded: 0 }
      buckets[o.consultant_id].total++
      if (['refunded', 'cancelled'].includes(o.status)) buckets[o.consultant_id].refunded++
    }
    const ranked = Object.entries(buckets)
      .filter(([, v]) => v.total >= 5)
      .map(([id, v]) => ({ id, ...v, refund_rate_pct: (v.refunded / v.total) * 100 }))
      .sort((a, b) => b.refund_rate_pct - a.refund_rate_pct)
      .slice(0, 5)
    const ids = ranked.map(r => r.id)
    const nameMap: Record<string, string> = {}
    if (ids.length) {
      const { data: profs } = await db.from('profiles').select('id, full_name, email').in('id', ids)
      for (const p of profs ?? []) nameMap[p.id] = p.full_name || p.email || ''
    }
    high_refund_providers = ranked.map(r => ({
      provider_id: r.id,
      name: nameMap[r.id] || null,
      orders: r.total,
      refunded: r.refunded,
      refund_rate_pct: r.refund_rate_pct,
    }))
  } catch (e: any) {
    data_warnings.push(`high_refund_providers: ${e?.message || 'unavailable'}`)
  }

  // ── Past-auto-release-overdue (>7 days past eligible) ───────────────────────
  let past_auto_release_overdue: any[] = []
  try {
    const cutoff = new Date(now - 7 * DAY).toISOString()
    const { data, error } = await db
      .from('orders')
      .select('id, order_number, status, escrow_status, escrow_amount, total_amount, client_id, consultant_id, auto_release_eligible_at, created_at')
      .eq('escrow_status', 'held')
      .lt('auto_release_eligible_at', cutoff)
      .order('auto_release_eligible_at', { ascending: true })
      .limit(25)
    if (error) throw error
    const rows = data ?? []
    const ids = [...new Set([...rows.map(r => r.client_id), ...rows.map(r => r.consultant_id)].filter(Boolean))]
    const nameMap: Record<string, string> = {}
    if (ids.length) {
      const { data: profs } = await db.from('profiles').select('id, full_name, email').in('id', ids)
      for (const p of profs ?? []) nameMap[p.id] = p.full_name || p.email || ''
    }
    past_auto_release_overdue = rows.map((o: any) => ({
      id: o.id,
      order_number: o.order_number,
      amount_cents: toCents(o.escrow_amount || o.total_amount),
      client_name: nameMap[o.client_id] || null,
      consultant_name: nameMap[o.consultant_id] || null,
      auto_release_eligible_at: o.auto_release_eligible_at,
      days_overdue: o.auto_release_eligible_at
        ? Math.floor((now - new Date(o.auto_release_eligible_at).getTime()) / DAY)
        : null,
    }))
  } catch (e: any) {
    data_warnings.push(`past_auto_release: ${e?.message || 'unavailable'}`)
  }

  // ── Disputed-orders detail list ─────────────────────────────────────────────
  let nameMap2: Record<string, string> = {}
  try {
    const ids = [...new Set([...disputed_orders.map(o => o.client_id), ...disputed_orders.map(o => o.consultant_id)].filter(Boolean))]
    if (ids.length) {
      const { data: profs } = await db.from('profiles').select('id, full_name, email').in('id', ids)
      for (const p of profs ?? []) nameMap2[p.id] = p.full_name || p.email || ''
    }
  } catch { /* ignored */ }

  const disputed_orders_out = disputed_orders.map((o: any) => ({
    id: o.id,
    order_number: o.order_number,
    status: o.status,
    escrow_status: o.escrow_status,
    amount_cents: toCents(o.escrow_amount || o.total_amount),
    client_name: nameMap2[o.client_id] || null,
    consultant_name: nameMap2[o.consultant_id] || null,
    reason: o.escrow_dispute_reason || o.escrow_frozen_reason || null,
    flagged_at: o.escrow_disputed_at || o.escrow_frozen_at || null,
  }))

  return ok({
    disputed_count,
    disputed_dollar_cents,
    disputed_orders: disputed_orders_out,
    refund_rate_trend,
    high_refund_providers,
    past_auto_release_overdue,
    data_warnings,
  })
}
