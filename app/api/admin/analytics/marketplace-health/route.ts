/**
 * GET /api/admin/analytics/marketplace-health
 *
 * Operator-level marketplace metrics — distinct from the existing
 * marketplace funnel route which is impression-focused.
 *
 * Returns:
 *   active_gigs            count of gigs with status='active' and not deleted
 *   total_providers        count of distinct providers with any gig
 *   gigs_per_provider      mean active gigs per provider (active providers only)
 *   median_time_to_fill_hours
 *                          median hours from inquiry creation to first
 *                          attorney claim (claimed_at - created_at); only
 *                          claimed inquiries in last 90 days
 *   search_to_order_pct    coming-soon if no search/session tracking table
 *                          exists; otherwise (orders / search_sessions) %
 *   inquiry_fill_rate_pct  share of inquiries created in last 90 days that
 *                          ever got claimed
 *   gigs_zero_views_30d    active gigs with zero impressions in last 30 days
 *                          (uses gig_metrics — best-effort)
 */
import { ok, fail } from '@/lib/apiEnvelope'
import { requireAdminUser } from '@/lib/portalAuth'

function median(nums: number[]): number {
  if (!nums.length) return 0
  const s = [...nums].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m]
}

export async function GET() {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  const { db } = auth

  const data_warnings: string[] = []
  const now = Date.now()
  const ago30 = new Date(now - 30 * 86400_000).toISOString()
  const ago90 = new Date(now - 90 * 86400_000).toISOString()

  // ── Active gigs ─────────────────────────────────────────────────────────────
  let gigs: any[] = []
  try {
    const { data, error } = await db
      .from('gigs')
      .select('id, status, provider_id')
      .is('deleted_at', null)
    if (error) throw error
    gigs = data ?? []
  } catch (e: any) {
    data_warnings.push(`gigs: ${e?.message || 'unavailable'}`)
  }
  const activeGigs = gigs.filter(g => g.status === 'active')
  const providers = new Set(activeGigs.map(g => g.provider_id).filter(Boolean))
  const active_gigs = activeGigs.length
  const total_providers = providers.size
  const gigs_per_provider = providers.size ? activeGigs.length / providers.size : 0

  // ── Inquiry fill rate + median time to fill ─────────────────────────────────
  let median_time_to_fill_hours = 0
  let inquiry_fill_rate_pct = 0
  try {
    const { data, error } = await db
      .from('inquiries')
      .select('id, created_at, claimed_at, status')
      .gte('created_at', ago90)
    if (error) throw error
    const all = data ?? []
    const claimed = all.filter((r: any) => r.claimed_at)
    inquiry_fill_rate_pct = all.length ? (claimed.length / all.length) * 100 : 0
    const lags = claimed
      .map((r: any) => (new Date(r.claimed_at).getTime() - new Date(r.created_at).getTime()) / 3_600_000)
      .filter((h: number) => h >= 0)
    median_time_to_fill_hours = median(lags)
  } catch (e: any) {
    data_warnings.push(`inquiries: ${e?.message || 'unavailable'}`)
  }

  // ── Search → order: no search session table in current schema ───────────────
  const search_to_order_pct: number | null = null
  data_warnings.push('search_to_order_pct: not_implemented — no search session table')

  // ── Active gigs with zero views in last 30d ─────────────────────────────────
  let gigs_zero_views_30d = 0
  try {
    const { data, error } = await db
      .from('gig_metrics')
      .select('gig_id, impressions, updated_at')
    if (error) throw error
    const metrics = data ?? []
    const activeIds = new Set(activeGigs.map(g => g.id))
    const seenWithViews = new Set<string>()
    for (const m of metrics) {
      if (!activeIds.has(m.gig_id)) continue
      const updated = (m as any).updated_at
      if (Number(m.impressions) > 0 && (!updated || updated >= ago30)) seenWithViews.add(m.gig_id)
    }
    gigs_zero_views_30d = activeGigs.filter(g => !seenWithViews.has(g.id)).length
  } catch (e: any) {
    data_warnings.push(`gig_metrics: ${e?.message || 'unavailable'}`)
  }

  // ── Top gigs by orders (last 90d) for the drilldown table ───────────────────
  let top_gigs_by_orders: Array<{ gig_id: string; title: string | null; orders: number; gross: number }> = []
  try {
    const { data, error } = await db
      .from('orders')
      .select('gig_id, total_amount, status, created_at')
      .gte('created_at', ago90)
      .not('status', 'in', '(cancelled,refunded)')
    if (error) throw error
    const buckets: Record<string, { orders: number; gross: number }> = {}
    for (const o of data ?? []) {
      if (!o.gig_id) continue
      buckets[o.gig_id] = buckets[o.gig_id] || { orders: 0, gross: 0 }
      buckets[o.gig_id].orders++
      buckets[o.gig_id].gross += Number(o.total_amount) || 0
    }
    const ranked = Object.entries(buckets)
      .sort((a, b) => b[1].orders - a[1].orders)
      .slice(0, 10)
    const ids = ranked.map(([id]) => id)
    const titleMap: Record<string, string> = {}
    if (ids.length) {
      const { data: gigsData } = await db.from('gigs').select('id, title').in('id', ids)
      for (const g of gigsData ?? []) titleMap[g.id] = g.title
    }
    top_gigs_by_orders = ranked.map(([gig_id, v]) => ({
      gig_id,
      title: titleMap[gig_id] || null,
      orders: v.orders,
      gross: v.gross,
    }))
  } catch (e: any) {
    data_warnings.push(`top_gigs_by_orders: ${e?.message || 'unavailable'}`)
  }

  return ok({
    active_gigs,
    total_providers,
    gigs_per_provider,
    median_time_to_fill_hours,
    inquiry_fill_rate_pct,
    search_to_order_pct,
    gigs_zero_views_30d,
    top_gigs_by_orders,
    data_warnings,
  })
}
