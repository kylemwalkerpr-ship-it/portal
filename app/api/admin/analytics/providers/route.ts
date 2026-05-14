import { ok, fail } from '@/lib/apiEnvelope'
import { requireAdminUser } from '@/lib/portalAuth'

export async function GET() {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  const { db } = auth

  const data_warnings: string[] = []

  // All completed orders for leaderboard
  let completedOrders: any[] = []
  try {
    const { data, error } = await db
      .from('orders')
      .select('id, consultant_id, total_amount, status')
      .eq('status', 'completed')
    if (error) throw error
    completedOrders = data ?? []
  } catch (e: any) {
    data_warnings.push(`orders: ${e.message}`)
  }

  // Aggregate by consultant_id
  const providerStats: Record<string, { count: number; gross: number }> = {}
  for (const o of completedOrders) {
    if (!o.consultant_id) continue
    if (!providerStats[o.consultant_id]) providerStats[o.consultant_id] = { count: 0, gross: 0 }
    providerStats[o.consultant_id].count++
    providerStats[o.consultant_id].gross += Number(o.total_amount) || 0
  }

  // Top 10 by earnings
  const top10Ids = Object.entries(providerStats)
    .sort((a, b) => b[1].gross - a[1].gross)
    .slice(0, 10)
    .map(([id]) => id)

  // Fetch profiles for top 10
  let profileMap: Record<string, any> = {}
  try {
    if (top10Ids.length) {
      const { data, error } = await db
        .from('profiles')
        .select('id, full_name, email, role')
        .in('id', top10Ids)
      if (error) throw error
      for (const p of data ?? []) profileMap[p.id] = p
    }
  } catch (e: any) {
    data_warnings.push(`profiles (leaderboard): ${e.message}`)
  }

  // Avg rating per provider from gig_reviews via gigs
  let providerRatingMap: Record<string, { sum: number; count: number }> = {}
  try {
    const { data: gigsData, error: gigsErr } = await db
      .from('gigs')
      .select('id, provider_id')
      .in('provider_id', top10Ids)
    if (gigsErr) throw gigsErr

    const gigToProvider: Record<string, string> = {}
    for (const g of gigsData ?? []) gigToProvider[g.id] = g.provider_id

    const gigIds = Object.keys(gigToProvider)
    if (gigIds.length) {
      const { data: reviews, error: revErr } = await db
        .from('gig_reviews')
        .select('gig_id, rating')
        .eq('status', 'published')
        .in('gig_id', gigIds)
      if (revErr) throw revErr
      for (const r of reviews ?? []) {
        const pid = gigToProvider[r.gig_id]
        if (!pid) continue
        if (!providerRatingMap[pid]) providerRatingMap[pid] = { sum: 0, count: 0 }
        providerRatingMap[pid].sum += Number(r.rating)
        providerRatingMap[pid].count++
      }
    }
  } catch (e: any) {
    data_warnings.push(`gig_reviews (leaderboard): ${e.message}`)
  }

  const leaderboard = top10Ids.map(pid => {
    const prof  = profileMap[pid] || {}
    const stats = providerStats[pid] || { count: 0, gross: 0 }
    const rating = providerRatingMap[pid]
    return {
      provider_id:       pid,
      name:              prof.full_name || null,
      email:             prof.email     || null,
      role:              prof.role      || null,
      completed_orders:  stats.count,
      gross_earnings:    stats.gross,
      avg_rating:        rating ? rating.sum / rating.count : null,
      response_rate_pct: null, // not tracked in current schema
    }
  })

  // Seller level snapshots
  let by_level: Record<string, number> = {}
  try {
    const { data, error } = await db
      .from('seller_level_snapshots')
      .select('level')
    if (error) throw error
    for (const row of data ?? []) {
      const lv = String(row.level || 'unknown')
      by_level[lv] = (by_level[lv] ?? 0) + 1
    }
  } catch (e: any) {
    data_warnings.push(`seller_level_snapshots: ${e.message}`)
  }

  // Active providers (at least 1 active gig)
  let active_providers = 0
  try {
    const { data, error } = await db
      .from('gigs')
      .select('provider_id')
      .eq('status', 'active')
      .is('deleted_at', null)
    if (error) throw error
    active_providers = new Set((data ?? []).map((g: any) => g.provider_id)).size
  } catch (e: any) {
    data_warnings.push(`active_providers: ${e.message}`)
  }

  // Provider count by role
  let provider_count_by_role = { attorney: 0, consultant: 0 }
  try {
    const { data, error } = await db
      .from('profiles')
      .select('role')
      .in('role', ['attorney', 'consultant'])
    if (error) throw error
    for (const p of data ?? []) {
      if (p.role === 'attorney') provider_count_by_role.attorney++
      else provider_count_by_role.consultant++
    }
  } catch (e: any) {
    data_warnings.push(`provider_count_by_role: ${e.message}`)
  }

  // Top rated: min 2 reviews, top 5
  let top_rated: any[] = []
  try {
    const { data: allGigs, error: gigsErr } = await db
      .from('gigs')
      .select('id, provider_id')
    if (gigsErr) throw gigsErr

    const gig2prov: Record<string, string> = {}
    for (const g of allGigs ?? []) gig2prov[g.id] = g.provider_id

    const { data: reviews, error: revErr } = await db
      .from('gig_reviews')
      .select('gig_id, rating')
      .eq('status', 'published')
    if (revErr) throw revErr

    const ratingAccum: Record<string, { sum: number; count: number }> = {}
    for (const r of reviews ?? []) {
      const pid = gig2prov[r.gig_id]
      if (!pid) continue
      if (!ratingAccum[pid]) ratingAccum[pid] = { sum: 0, count: 0 }
      ratingAccum[pid].sum += Number(r.rating)
      ratingAccum[pid].count++
    }

    const eligible = Object.entries(ratingAccum)
      .filter(([, v]) => v.count >= 2)
      .sort((a, b) => (b[1].sum / b[1].count) - (a[1].sum / a[1].count))
      .slice(0, 5)

    const eligibleIds = eligible.map(([pid]) => pid)
    let eligibleProfileMap: Record<string, any> = {}
    if (eligibleIds.length) {
      const { data: profs } = await db
        .from('profiles')
        .select('id, full_name, email, role')
        .in('id', eligibleIds)
      for (const p of profs ?? []) eligibleProfileMap[p.id] = p
    }

    top_rated = eligible.map(([pid, v]) => ({
      provider_id: pid,
      name:        eligibleProfileMap[pid]?.full_name || null,
      email:       eligibleProfileMap[pid]?.email     || null,
      role:        eligibleProfileMap[pid]?.role      || null,
      avg_rating:  v.sum / v.count,
      review_count: v.count,
    }))
  } catch (e: any) {
    data_warnings.push(`top_rated: ${e.message}`)
  }

  return ok({
    leaderboard,
    by_level,
    active_providers,
    provider_count_by_role,
    top_rated,
    data_warnings,
  })
}
