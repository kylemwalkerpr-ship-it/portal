import { ok, fail } from '@/lib/apiEnvelope'
import { requireAdminUser } from '@/lib/portalAuth'

export async function GET() {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  const { db } = auth

  const data_warnings: string[] = []

  // Gig metrics aggregate
  let totalImpressions = 0
  let totalClicks = 0
  let metricsRows: any[] = []
  try {
    const { data, error } = await db
      .from('gig_metrics')
      .select('gig_id, impressions, clicks, saves')
    if (error) throw error
    metricsRows = data ?? []
    for (const m of metricsRows) {
      totalImpressions += Number(m.impressions) || 0
      totalClicks      += Number(m.clicks) || 0
    }
  } catch (e: any) {
    data_warnings.push(`gig_metrics: ${e.message}`)
  }

  // Saves from saved_gigs
  let totalSaves = 0
  try {
    const { count, error } = await db
      .from('saved_gigs')
      .select('id', { count: 'exact', head: true })
    if (error) throw error
    totalSaves = count ?? 0
  } catch (e: any) {
    data_warnings.push(`saved_gigs: ${e.message}`)
  }

  // Non-cancelled orders count
  let orderCount = 0
  try {
    const { count, error } = await db
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .not('status', 'in', '(cancelled,refunded)')
    if (error) throw error
    orderCount = count ?? 0
  } catch (e: any) {
    data_warnings.push(`orders (funnel): ${e.message}`)
  }

  // Top gigs by impressions
  let top_gigs: any[] = []
  try {
    const sorted = [...metricsRows].sort((a, b) => (b.impressions ?? 0) - (a.impressions ?? 0)).slice(0, 10)
    if (sorted.length) {
      const gigIds = sorted.map(m => m.gig_id)
      const { data: gigsData, error: gigsErr } = await db
        .from('gigs')
        .select('id, title, status, provider_id')
        .in('id', gigIds)
      if (gigsErr) throw gigsErr

      const providerIds = [...new Set((gigsData ?? []).map((g: any) => g.provider_id).filter(Boolean))]
      let profileMap: Record<string, any> = {}
      if (providerIds.length) {
        const { data: profs } = await db
          .from('profiles')
          .select('id, full_name, email')
          .in('id', providerIds)
        for (const p of profs ?? []) profileMap[p.id] = p
      }

      const gigMap: Record<string, any> = {}
      for (const g of gigsData ?? []) gigMap[g.id] = g

      top_gigs = sorted.map(m => {
        const g = gigMap[m.gig_id] || {}
        const prof = profileMap[g.provider_id] || {}
        const imp = Number(m.impressions) || 0
        const clk = Number(m.clicks) || 0
        return {
          id:            m.gig_id,
          title:         g.title || null,
          provider_name: prof.full_name || prof.email || null,
          status:        g.status || null,
          impressions:   imp,
          clicks:        clk,
          saves:         Number(m.saves) || 0,
          ctr:           imp ? (clk / imp) * 100 : 0,
        }
      })
    }
  } catch (e: any) {
    data_warnings.push(`top_gigs: ${e.message}`)
  }

  // By category
  let by_category: any[] = []
  try {
    const { data: gigsData, error } = await db
      .from('gigs')
      .select('id, category, avg_rating')
      .is('deleted_at', null)
    if (error) throw error

    const gigCatMap: Record<string, { category: string; avg_rating: number }> = {}
    for (const g of gigsData ?? []) gigCatMap[g.id] = { category: g.category || 'uncategorized', avg_rating: Number(g.avg_rating) || 0 }

    const catData: Record<string, { gig_count: number; impressions: number; clicks: number; rating_sum: number; rating_count: number }> = {}
    for (const m of metricsRows) {
      const cat = gigCatMap[m.gig_id]?.category || 'uncategorized'
      if (!catData[cat]) catData[cat] = { gig_count: 0, impressions: 0, clicks: 0, rating_sum: 0, rating_count: 0 }
      catData[cat].gig_count   += 1
      catData[cat].impressions += Number(m.impressions) || 0
      catData[cat].clicks      += Number(m.clicks) || 0
      const ar = gigCatMap[m.gig_id]?.avg_rating
      if (ar) { catData[cat].rating_sum += ar; catData[cat].rating_count++ }
    }

    by_category = Object.entries(catData)
      .map(([category, d]) => ({
        category,
        gig_count:   d.gig_count,
        impressions: d.impressions,
        clicks:      d.clicks,
        avg_rating:  d.rating_count ? d.rating_sum / d.rating_count : 0,
      }))
      .sort((a, b) => b.impressions - a.impressions)
  } catch (e: any) {
    data_warnings.push(`by_category: ${e.message}`)
  }

  // Rating distribution
  const rating_distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  try {
    const { data, error } = await db
      .from('gig_reviews')
      .select('rating')
      .eq('status', 'published')
    if (error) throw error
    for (const r of data ?? []) {
      const rat = Number(r.rating)
      if (rat >= 1 && rat <= 5) rating_distribution[rat]++
    }
  } catch (e: any) {
    data_warnings.push(`gig_reviews: ${e.message}`)
  }

  // Avg content score
  let avg_content_score = 0
  let gigs_needing_attention = 0
  try {
    const { data, error } = await db
      .from('gigs')
      .select('id, status, content_score')
      .is('deleted_at', null)
    if (error) throw error
    const gigsWithScore = (data ?? []).filter((g: any) => g.content_score != null)
    avg_content_score = gigsWithScore.length
      ? gigsWithScore.reduce((s: number, g: any) => s + (Number(g.content_score) || 0), 0) / gigsWithScore.length
      : 0
    gigs_needing_attention = (data ?? []).filter(
      (g: any) => g.status === 'suspended' || (g.content_score != null && Number(g.content_score) < 50)
    ).length
  } catch (e: any) {
    data_warnings.push(`content_score: ${e.message}`)
  }

  return ok({
    funnel: {
      impressions: totalImpressions,
      clicks:      totalClicks,
      saves:       totalSaves,
      orders:      orderCount,
    },
    top_gigs,
    by_category,
    rating_distribution,
    avg_content_score,
    gigs_needing_attention,
    data_warnings,
  })
}
