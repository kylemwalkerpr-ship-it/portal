import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdminUser } from '@/lib/portalAuth'
import { fetchSiteSearchAnalytics } from '@/lib/gscAnalytics'
import snapshot from '@/data/gsc/snapshot.json'

/**
 * GET /api/seo-factory/metrics
 * Factory KPIs + GSC visibility rollup.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    let jobs: any[] = []
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      )
      const { data } = await supabase
        .from('content_jobs')
        .select('id,status,seo_score,ship_mode,indexable,owner_host,created_at,deployed_at')
        .order('created_at', { ascending: false })
        .limit(200)
      jobs = data || []
    } catch {
      jobs = []
    }

    const live = await fetchSiteSearchAnalytics(28)
    const snap = snapshot as { totals?: { totalClicks?: number; totalImpressions?: number } }

    const avgSeo =
      jobs.length > 0
        ? Math.round(jobs.reduce((s, j) => s + (j.seo_score || 0), 0) / jobs.length)
        : 0

    return NextResponse.json({
      factory: {
        jobsTotal: jobs.length,
        prCreated: jobs.filter((j) => j.status === 'pr_created').length,
        deployedOrMerged: jobs.filter((j) => j.status === 'merged' || j.deployed_at).length,
        failed: jobs.filter((j) => j.status === 'failed').length,
        avgSeoScore: avgSeo,
        indexableShare:
          jobs.length > 0
            ? Math.round((jobs.filter((j) => j.indexable !== false).length / jobs.length) * 100)
            : null,
        byHost: Object.entries(
          jobs.reduce((acc: Record<string, number>, j) => {
            const h = j.owner_host || 'unknown'
            acc[h] = (acc[h] || 0) + 1
            return acc
          }, {}),
        ).map(([host, count]) => ({ host, count })),
      },
      visibility: {
        source: live.configured ? 'live' : 'snapshot',
        clicks28d: live.configured ? live.totals.clicks : snap.totals?.totalClicks ?? null,
        impressions28d: live.configured ? live.totals.impressions : snap.totals?.totalImpressions ?? null,
        ctr: live.configured ? live.totals.ctr : null,
        position: live.configured ? live.totals.position : null,
        topQueries: live.topQueries.slice(0, 10),
        topPages: live.topPages.slice(0, 10),
        warnings: live.warnings,
      },
    })
  } catch (err) {
    console.error('[seo-factory/metrics]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 500 },
    )
  }
}
