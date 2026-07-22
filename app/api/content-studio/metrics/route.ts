import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-clerk-user-id')
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    // ── Aggregate metrics ──
    const { data: jobs, error } = await supabase
      .from('content_jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500)

    if (error) throw new Error(`Query failed: ${error.message}`)

    const total = jobs?.length ?? 0

    if (total === 0) {
      return NextResponse.json({
        total: 0, merged: 0, closed: 0, inProgress: 0, failed: 0,
        mergeRate: 0, avgSeoScore: 0, avgWordCount: 0,
        byRegion: {}, byType: {}, byProvider: {}, recentJobs: [],
      })
    }

    const merged = jobs.filter(j => j.status === 'merged').length
    const closedNoMerge = jobs.filter(j => j.status === 'closed').length
    const inProgress = jobs.filter(j => !['merged', 'closed', 'failed'].includes(j.status)).length
    const failed = jobs.filter(j => j.status === 'failed').length

    const mergeRate = merged + closedNoMerge > 0
      ? Math.round((merged / (merged + closedNoMerge)) * 100)
      : 0

    const seoScores = jobs.filter(j => j.seo_score != null).map(j => j.seo_score)
    const avgSeoScore = seoScores.length > 0 ? Math.round(seoScores.reduce((a, b) => a + b, 0) / seoScores.length) : 0

    const wordCounts = jobs.filter(j => j.word_count != null).map(j => j.word_count)
    const avgWordCount = wordCounts.length > 0 ? Math.round(wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length) : 0

    // ── By region ──
    const byRegion: Record<string, { total: number; merged: number }> = {}
    for (const j of jobs) {
      if (!j.region) continue
      byRegion[j.region] = byRegion[j.region] ?? { total: 0, merged: 0 }
      byRegion[j.region].total++
      if (j.status === 'merged') byRegion[j.region].merged++
    }

    // ── By content type ──
    const byType: Record<string, number> = {}
    for (const j of jobs) {
      if (!j.content_type) continue
      byType[j.content_type] = (byType[j.content_type] ?? 0) + 1
    }

    // ── By AI provider ──
    const byProvider: Record<string, { total: number; avgSeo: number }> = {}
    for (const j of jobs) {
      const p = j.ai_provider ?? 'unknown'
      byProvider[p] = byProvider[p] ?? { total: 0, avgSeo: 0 }
      byProvider[p].total++
      if (j.seo_score != null) {
        byProvider[p].avgSeo = Math.round(
          (byProvider[p].avgSeo * (byProvider[p].total - 1) + j.seo_score) / byProvider[p].total
        )
      }
    }

    // ── Recent 10 ──
    const recentJobs = jobs.slice(0, 10).map(j => ({
      id: j.id,
      title: j.title,
      status: j.status,
      region: j.region,
      content_type: j.content_type,
      pr_url: j.pr_url,
      seo_score: j.seo_score,
      created_at: j.created_at,
    }))

    return NextResponse.json({
      total, merged, closed: closedNoMerge, inProgress, failed,
      mergeRate, avgSeoScore, avgWordCount,
      byRegion, byType, byProvider, recentJobs,
    })
  } catch (err) {
    console.error('[content-studio/metrics]', err)
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Internal error',
    }, { status: 500 })
  }
}
