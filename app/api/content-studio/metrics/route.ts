import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdminUser } from '@/lib/portalAuth'

export async function GET(_request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const { data: jobs, error } = await supabase
      .from('content_jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500)

    if (error) throw new Error(`Query failed: ${error.message}`)

    const total = jobs?.length ?? 0

    if (total === 0) {
      return NextResponse.json({
        total: 0,
        merged: 0,
        closed: 0,
        inProgress: 0,
        failed: 0,
        mergeRate: 0,
        avgSeoScore: 0,
        avgWordCount: 0,
        byRegion: {},
        byType: {},
        byProvider: {},
        recentJobs: [],
      })
    }

    const list = jobs ?? []
    const merged = list.filter((j) => j.status === 'merged').length
    const closedNoMerge = list.filter((j) => j.status === 'closed').length
    const inProgress = list.filter(
      (j) => !['merged', 'closed', 'failed'].includes(j.status),
    ).length
    const failed = list.filter((j) => j.status === 'failed').length

    const mergeRate =
      merged + closedNoMerge > 0
        ? Math.round((merged / (merged + closedNoMerge)) * 100)
        : 0

    const seoScores = list
      .filter((j) => j.seo_score != null)
      .map((j) => j.seo_score as number)
    const avgSeoScore =
      seoScores.length > 0
        ? Math.round(seoScores.reduce((a, b) => a + b, 0) / seoScores.length)
        : 0

    const wordCounts = list
      .filter((j) => j.word_count != null)
      .map((j) => j.word_count as number)
    const avgWordCount =
      wordCounts.length > 0
        ? Math.round(wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length)
        : 0

    const byRegion: Record<string, number> = {}
    const byType: Record<string, number> = {}
    const byProvider: Record<string, number> = {}
    for (const j of list) {
      byRegion[j.region || 'unknown'] = (byRegion[j.region || 'unknown'] || 0) + 1
      byType[j.content_type || 'unknown'] =
        (byType[j.content_type || 'unknown'] || 0) + 1
      const p = j.ai_provider || 'unknown'
      byProvider[p] = (byProvider[p] || 0) + 1
    }

    return NextResponse.json({
      total,
      merged,
      closed: closedNoMerge,
      inProgress,
      failed,
      mergeRate,
      avgSeoScore,
      avgWordCount,
      byRegion,
      byType,
      byProvider,
      recentJobs: list.slice(0, 10),
    })
  } catch (err) {
    console.error('[content-studio/metrics]', err)
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : 'Internal error',
      },
      { status: 500 },
    )
  }
}
