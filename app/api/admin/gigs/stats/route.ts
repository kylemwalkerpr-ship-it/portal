import { ok, fail } from '@/lib/apiEnvelope'
import { requireAdminUser } from '@/lib/portalAuth'

export async function GET(_req: Request) {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  const warnings: string[] = []

  // ── Status distribution ──────────────────────────────────────────────────
  let byStatus: Record<string, number> = {}
  try {
    const { data, error } = await auth.db
      .from('gigs')
      .select('status')
    if (error) warnings.push(`by_status: ${error.message}`)
    else {
      for (const row of data ?? []) {
        const s = String(row.status || 'unknown')
        byStatus[s] = (byStatus[s] ?? 0) + 1
      }
    }
  } catch (e: any) {
    warnings.push(`by_status: ${e?.message}`)
  }

  // ── Category breakdown (top 15) ──────────────────────────────────────────
  let byCategory: { category: string; count: number; avg_rating: number }[] = []
  try {
    const { data, error } = await auth.db
      .from('gigs')
      .select('category, avg_rating')
      .not('status', 'eq', 'deleted')
    if (error) warnings.push(`by_category: ${error.message}`)
    else {
      const catMap: Record<string, { count: number; ratingSum: number }> = {}
      for (const row of data ?? []) {
        const cat = String(row.category || 'uncategorized')
        if (!catMap[cat]) catMap[cat] = { count: 0, ratingSum: 0 }
        catMap[cat].count++
        catMap[cat].ratingSum += Number(row.avg_rating) || 0
      }
      byCategory = Object.entries(catMap)
        .map(([category, { count, ratingSum }]) => ({
          category,
          count,
          avg_rating: count ? Math.round((ratingSum / count) * 100) / 100 : 0,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 15)
    }
  } catch (e: any) {
    warnings.push(`by_category: ${e?.message}`)
  }

  // ── Provider type distribution ────────────────────────────────────────────
  let byProviderType = { attorney: 0, consultant: 0 }
  try {
    const { data, error } = await auth.db
      .from('gigs')
      .select('provider_type')
      .not('status', 'eq', 'deleted')
    if (error) warnings.push(`by_provider_type: ${error.message}`)
    else {
      for (const row of data ?? []) {
        if (row.provider_type === 'attorney') byProviderType.attorney++
        else if (row.provider_type === 'consultant') byProviderType.consultant++
      }
    }
  } catch (e: any) {
    warnings.push(`by_provider_type: ${e?.message}`)
  }

  // ── Averages & attention count ────────────────────────────────────────────
  let avgContentScore = 0
  let avgRankScore = 0
  let gigsNeedingAttention = 0

  try {
    const { data, error } = await auth.db
      .from('gigs')
      .select('content_score, rank_score, status, auto_flag_score')
      .not('status', 'eq', 'deleted')
    if (error) warnings.push(`averages: ${error.message}`)
    else {
      const rows = data ?? []
      if (rows.length) {
        const totalContent = rows.reduce((s: number, r: any) => s + (Number(r.content_score) || 0), 0)
        const totalRank = rows.reduce((s: number, r: any) => s + (Number(r.rank_score) || 0), 0)
        avgContentScore = Math.round((totalContent / rows.length) * 100) / 100
        avgRankScore = Math.round((totalRank / rows.length) * 10000) / 10000
      }
      for (const r of rows) {
        if (
          r.status === 'suspended' ||
          (Number(r.auto_flag_score) || 0) > 40
        ) {
          gigsNeedingAttention++
        }
      }
    }
  } catch (e: any) {
    warnings.push(`averages: ${e?.message}`)
  }

  // ── Platform metrics from gig_metrics ─────────────────────────────────────
  let totalImpressions = 0
  let totalClicks = 0
  let platformCtr = 0

  try {
    const { data, error } = await auth.db
      .from('gig_metrics')
      .select('impressions, clicks')
    if (error) warnings.push(`metrics: ${error.message}`)
    else {
      for (const m of data ?? []) {
        totalImpressions += Number(m.impressions) || 0
        totalClicks += Number(m.clicks) || 0
      }
      platformCtr = totalImpressions
        ? Math.round((totalClicks / totalImpressions) * 10000) / 10000
        : 0
    }
  } catch (e: any) {
    warnings.push(`metrics: ${e?.message}`)
  }

  // ── Moderation queue count ─────────────────────────────────────────────────
  let modqueueCount = 0
  try {
    const { count, error } = await auth.db
      .from('moderation_queue')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open')
    if (error) warnings.push(`modqueue_count: ${error.message}`)
    else modqueueCount = count ?? 0
  } catch (e: any) {
    warnings.push(`modqueue_count: ${e?.message}`)
  }

  return ok({
    by_status: byStatus,
    by_category: byCategory,
    by_provider_type: byProviderType,
    avg_content_score: avgContentScore,
    avg_rank_score: avgRankScore,
    total_impressions: totalImpressions,
    total_clicks: totalClicks,
    platform_ctr: platformCtr,
    gigs_needing_attention: gigsNeedingAttention,
    modqueue_count: modqueueCount,
    ...(warnings.length ? { data_warnings: warnings } : {}),
  })
}
