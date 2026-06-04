/**
 * GET /api/admin/analytics/engagement
 *
 * Engagement health — DAU/WAU/MAU split by role, repeat-order rate,
 * messages-per-order.
 *
 * Activity proxy = "user appeared as client_id, consultant_id, or sender_id
 * on an order, inquiry, or message in the window". We don't have a dedicated
 * session table, but these are the closest meaningful actions.
 *
 * Returns:
 *   dau_wau_mau           { dau, wau, mau, dau_wau_ratio_pct, wau_mau_ratio_pct }
 *   active_by_role        { student:{dau,wau,mau}, consultant:{...}, attorney:{...} }
 *   repeat_order_rate_pct  of clients with >=1 order in last 90d, % who placed
 *                          more than one
 *   messages_per_order     mean messages on conversations linked to an order
 *                          in last 30d
 *   top_engaged_students   top 10 students by orders+inquiries in last 90d
 */
import { ok, fail } from '@/lib/apiEnvelope'
import { requireAdminUser } from '@/lib/portalAuth'

export async function GET() {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  const { db } = auth

  const data_warnings: string[] = []
  const now = Date.now()
  const ago1  = new Date(now -  1 * 86400_000).toISOString()
  const ago7  = new Date(now -  7 * 86400_000).toISOString()
  const ago30 = new Date(now - 30 * 86400_000).toISOString()
  const ago90 = new Date(now - 90 * 86400_000).toISOString()

  // ── Pull profile role map ───────────────────────────────────────────────────
  const roleMap: Record<string, string> = {}
  try {
    const { data, error } = await db.from('profiles').select('id, role')
    if (error) throw error
    for (const p of data ?? []) roleMap[p.id] = p.role
  } catch (e: any) {
    data_warnings.push(`profiles: ${e?.message || 'unavailable'}`)
  }

  // ── Pull recent orders/inquiries to derive activity ─────────────────────────
  type Activity = { user_id: string; at: string }
  const activity: Activity[] = []

  try {
    const { data, error } = await db
      .from('orders')
      .select('client_id, consultant_id, created_at, updated_at')
      .gte('updated_at', ago30)
    if (error) throw error
    for (const r of data ?? []) {
      if (r.client_id) activity.push({ user_id: r.client_id, at: r.updated_at || r.created_at })
      if (r.consultant_id) activity.push({ user_id: r.consultant_id, at: r.updated_at || r.created_at })
    }
  } catch (e: any) {
    data_warnings.push(`orders: ${e?.message || 'unavailable'}`)
  }

  try {
    const { data, error } = await db
      .from('inquiries')
      .select('client_id, claimed_by_attorney_id, created_at, updated_at')
      .gte('updated_at', ago30)
    if (error) throw error
    for (const r of data ?? []) {
      if (r.client_id) activity.push({ user_id: r.client_id, at: r.updated_at || r.created_at })
      if (r.claimed_by_attorney_id) activity.push({ user_id: r.claimed_by_attorney_id, at: r.updated_at || r.created_at })
    }
  } catch (e: any) {
    data_warnings.push(`inquiries: ${e?.message || 'unavailable'}`)
  }

  // ── DAU/WAU/MAU buckets ─────────────────────────────────────────────────────
  const lastSeenByUser: Record<string, string> = {}
  for (const a of activity) {
    if (!lastSeenByUser[a.user_id] || a.at > lastSeenByUser[a.user_id]) lastSeenByUser[a.user_id] = a.at
  }

  const isAfter = (ts: string, threshold: string) => ts >= threshold

  const counts = { dau: 0, wau: 0, mau: 0 }
  const roleCounts: Record<string, { dau: number; wau: number; mau: number }> = {
    student:    { dau: 0, wau: 0, mau: 0 },
    consultant: { dau: 0, wau: 0, mau: 0 },
    attorney:   { dau: 0, wau: 0, mau: 0 },
  }
  for (const [uid, at] of Object.entries(lastSeenByUser)) {
    const role = roleMap[uid]
    if (isAfter(at, ago1)) { counts.dau++; if (role && roleCounts[role]) roleCounts[role].dau++ }
    if (isAfter(at, ago7)) { counts.wau++; if (role && roleCounts[role]) roleCounts[role].wau++ }
    if (isAfter(at, ago30)){ counts.mau++; if (role && roleCounts[role]) roleCounts[role].mau++ }
  }

  const dau_wau_ratio_pct = counts.wau ? (counts.dau / counts.wau) * 100 : 0
  const wau_mau_ratio_pct = counts.mau ? (counts.wau / counts.mau) * 100 : 0

  // ── Repeat order rate ───────────────────────────────────────────────────────
  let repeat_order_rate_pct = 0
  try {
    const { data, error } = await db
      .from('orders')
      .select('client_id, created_at')
      .gte('created_at', ago90)
    if (error) throw error
    const cnt: Record<string, number> = {}
    for (const r of data ?? []) if (r.client_id) cnt[r.client_id] = (cnt[r.client_id] ?? 0) + 1
    const clients = Object.values(cnt)
    const repeat = clients.filter(c => c > 1).length
    repeat_order_rate_pct = clients.length ? (repeat / clients.length) * 100 : 0
  } catch (e: any) {
    data_warnings.push(`repeat_orders: ${e?.message || 'unavailable'}`)
  }

  // ── Messages per order (last 30d) ───────────────────────────────────────────
  let messages_per_order: number | null = null
  try {
    // conversations linked to orders in the last 30 days
    const { data: convs, error: cErr } = await db
      .from('conversations')
      .select('id, ref_order_id')
      .not('ref_order_id', 'is', null)
      .gte('updated_at', ago30)
    if (cErr) throw cErr
    const convIds = (convs ?? []).map((c: any) => c.id).filter(Boolean)
    if (convIds.length) {
      // Total message rows on those conversations
      // Try messages table
      const { count, error: mErr } = await db
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .in('conversation_id', convIds)
      if (mErr) throw mErr
      const orderCount = new Set((convs ?? []).map((c: any) => c.ref_order_id)).size
      messages_per_order = orderCount ? (count ?? 0) / orderCount : 0
    } else {
      messages_per_order = 0
    }
  } catch (e: any) {
    data_warnings.push(`messages_per_order: ${e?.message || 'unavailable'}`)
  }

  // ── Top engaged students (orders + inquiries last 90d) ──────────────────────
  let top_engaged_students: Array<{ profile_id: string; name: string | null; orders: number; inquiries: number; total: number }> = []
  try {
    const { data: ords } = await db
      .from('orders')
      .select('client_id')
      .gte('created_at', ago90)
    const { data: inqs } = await db
      .from('inquiries')
      .select('client_id')
      .gte('created_at', ago90)
    const buckets: Record<string, { orders: number; inquiries: number }> = {}
    for (const r of ords ?? []) {
      if (!r.client_id) continue
      buckets[r.client_id] = buckets[r.client_id] || { orders: 0, inquiries: 0 }
      buckets[r.client_id].orders++
    }
    for (const r of inqs ?? []) {
      if (!r.client_id) continue
      buckets[r.client_id] = buckets[r.client_id] || { orders: 0, inquiries: 0 }
      buckets[r.client_id].inquiries++
    }
    const ranked = Object.entries(buckets)
      .map(([id, b]) => ({ id, ...b, total: b.orders + b.inquiries }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)
    const topIds = ranked.map(r => r.id)
    const nameMap: Record<string, string> = {}
    if (topIds.length) {
      const { data: profs } = await db.from('profiles').select('id, full_name, email').in('id', topIds)
      for (const p of profs ?? []) nameMap[p.id] = p.full_name || p.email || ''
    }
    top_engaged_students = ranked.map(r => ({
      profile_id: r.id,
      name: nameMap[r.id] || null,
      orders: r.orders,
      inquiries: r.inquiries,
      total: r.total,
    }))
  } catch (e: any) {
    data_warnings.push(`top_engaged_students: ${e?.message || 'unavailable'}`)
  }

  return ok({
    dau_wau_mau: { ...counts, dau_wau_ratio_pct, wau_mau_ratio_pct },
    active_by_role: roleCounts,
    repeat_order_rate_pct,
    messages_per_order,
    top_engaged_students,
    data_warnings,
  })
}
