import { NextRequest, NextResponse } from 'next/server'
import { ingestKnowledge, recordEngineRun } from '@/lib/seoEngine/knowledge'
import { runPlanner } from '@/lib/seoEngine/planner'
import { runVisibilityAudits } from '@/lib/seoEngine/llmVisibility'
import { classifyEngineRunStatus, formatTopScores } from '@/lib/seoEngine/engineRunSummary'

/**
 * POST /api/cron/seo-engine-daily
 * Daily SEO Master Engine automation (midday Africa/Nairobi via GitHub Actions).
 * Auth: Authorization: Bearer <CRON_SECRET>
 *
 * Phases:
 *   { phase: 'knowledge', limitPerSource? }   — ingest fresh intel only
 *   { phase: 'plan', limit?, draftBriefs? }   — run master planner only
 *   { phase: 'rank', limit? }                 — run the ranking model + forecasts
 *                                                over top planner missions
 *   { phase: 'rewards' }                      — attribute shipped-job outcomes
 *                                                into the reward ledger
 *   { phase: 'track' }                        — forecast vs actual execution
 *                                                tracker (matured 30/60/90d runs)
 *   { phase: 'all' }                          — knowledge → plan → rank → rewards
 *                                                → track (+ optional LLM audits)
 *                                                (default)
 *
 * GET — latest engine runs (audit trail).
 */
function authorize(req: Request): boolean {
  const expected = process.env.CRON_SECRET
  const provided = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  return Boolean(expected && provided && provided === expected)
}

export async function GET(req: NextRequest) {
  if (!authorize(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { latestEngineRuns } = await import('@/lib/seoEngine/knowledge')
  const runs = await latestEngineRuns(10)
  return NextResponse.json({ ok: true, runs })
}

export async function POST(req: NextRequest) {
  if (!authorize(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { phase?: string; limitPerSource?: number; limit?: number; draftBriefs?: boolean; llmAudits?: boolean }
  const phase = String(body.phase || 'all').toLowerCase()

  try {
    if (phase === 'plan') {
      const plans = await runPlanner({ draftBriefs: body.draftBriefs !== false, limit: body.limit })
      await recordEngineRun('daily', plans.length ? 'success' : 'partial', { phase, plans: plans.length }, [], 'cron')
      return NextResponse.json({ ok: true, phase, plans: plans.length })
    }
    if (phase === 'llm') {
      const vis = await runVisibilityAudits({ maxAudits: 8 })
      // Fan-out sub-query audits per top cluster — feeds the aeoGeo family with
      // measured citation evidence (per-cluster map returned for attribution).
      let fanOut = { cited: 0, total: 0, clusters: 0, byCluster: {} as Record<string, { cited: number; total: number }> }
      try {
        const { runFanOutVisibilityAudits } = await import('@/lib/seoEngine/llmVisibility')
        fanOut = await runFanOutVisibilityAudits({ planLimit: 8, maxPerPlan: 5, maxAudits: 16 })
      } catch {
        fanOut = { cited: 0, total: 0, clusters: 0, byCluster: {} }
      }
      await recordEngineRun('daily', 'success', {
        phase, cited: vis.cited, total: vis.total, failed: vis.failed, shareOfVoice: vis.shareOfVoice,
        fanOutCited: fanOut.cited, fanOutTotal: fanOut.total, fanOutClusters: fanOut.clusters,
      }, [], 'cron')
      return NextResponse.json({ ok: true, phase, ...vis, fanOut })
    }
    if (phase === 'rank') {
      const { runRankingPassForPlans } = await import('@/lib/seoEngine/rankingModel')
      const rank = await runRankingPassForPlans(body.limit || 15)
      await recordEngineRun('daily', rank.computed ? 'success' : 'partial', { phase, computed: rank.computed, topScores: formatTopScores(rank.topScores) }, [], 'cron')
      return NextResponse.json({ ok: true, phase, ...rank, topScores: formatTopScores(rank.topScores) })
    }
    if (phase === 'rewards') {
      const { attributizeOutcomes } = await import('@/lib/seoEngine/rankingModel')
      const reward = await attributizeOutcomes()
      await recordEngineRun('daily', 'success', {
        phase,
        events: reward.events,
        jobsConsidered: reward.jobsConsidered,
        jobsMatched: reward.jobsMatched,
      }, [], 'cron')
      return NextResponse.json({ ok: true, phase, ...reward })
    }
    if (phase === 'track') {
      const { loadForecastTracker } = await import('@/lib/seoEngine/forecastTracker')
      const tracker = await loadForecastTracker({ limit: 200 })
      await recordEngineRun('daily', tracker.summary.inFlight || tracker.summary.evaluated ? 'success' : 'partial', {
        phase,
        evaluated: tracker.summary.evaluated,
        inFlight: tracker.summary.inFlight,
        noData: tracker.summary.noData,
        onTrackRate: tracker.summary.onTrackRate,
        overPredicted: tracker.summary.byVerdict.over_predicted,
        underPredicted: tracker.summary.byVerdict.under_predicted,
        positionBias: tracker.summary.positionBias,
        avgPositionError: tracker.summary.avgPositionError,
      }, [], 'cron')
      return NextResponse.json({ ok: true, phase, tracker: tracker.summary })
    }

    // knowledge (or all): ingest first
    const ingest = await ingestKnowledge({ limitPerSource: body.limitPerSource, maxAiItems: 6 })
    let plans = 0
    let llmAudits = 0
    let cited = 0
    let rankComputed = 0
    let rewardEvents = 0
    let rewardJobs = 0
    let rewardMatched = 0
    let tracked = 0
    let inFlight = 0
    let onTrackRate = 0
    let llmFailed = 0
    let interlinksStored = 0
    const topScores: string[] = []
    if (phase === 'all') {
      const result = await runPlanner({ draftBriefs: body.draftBriefs !== false, limit: body.limit || 15 })
      plans = result.length
      try {
        const { persistPlannerInterlinks } = await import('@/lib/seoEngine/interlink')
        interlinksStored = await persistPlannerInterlinks(result)
      } catch {
        interlinksStored = 0
      }
      const { runRankingPassForPlans, attributizeOutcomes } = await import('@/lib/seoEngine/rankingModel')
      const rank = await runRankingPassForPlans(body.limit || 15)
      rankComputed = rank.computed
      topScores.push(...formatTopScores(rank.topScores))
      const reward = await attributizeOutcomes()
      rewardEvents = reward.events
      rewardJobs = reward.jobsConsidered
      rewardMatched = reward.jobsMatched
      const { loadForecastTracker } = await import('@/lib/seoEngine/forecastTracker')
      const tracker = await loadForecastTracker({ limit: 200 })
      tracked = tracker.summary.evaluated
      inFlight = tracker.summary.inFlight
      onTrackRate = tracker.summary.onTrackRate
      if (body.llmAudits !== false) {
        const vis = await runVisibilityAudits({ maxAudits: 6 })
        llmAudits = vis.total
        cited = vis.cited
        llmFailed = vis.failed
      }
      try {
        const { fetchAhrefsSiteAudit, persistAhrefsSnapshot, fallbackLegalAhrefsSnapshot } = await import('@/lib/seoEngine/ahrefsAudit')
        if (process.env.AHREFS_API_KEY) {
          const snap = await fetchAhrefsSiteAudit()
          await persistAhrefsSnapshot(snap)
        } else {
          await persistAhrefsSnapshot(fallbackLegalAhrefsSnapshot())
        }
      } catch { /* Ahrefs is additive — never fail the daily run */ }
    }
    const status = classifyEngineRunStatus({
      phase,
      itemsStored: ingest.itemsStored,
      sourcesRun: ingest.sourcesRun,
      sourceErrors: ingest.errors.length,
      plans,
      rankComputed,
    })
    await recordEngineRun('daily', status, {
      phase,
      ingested: ingest.itemsStored,
      fetched: ingest.itemsFetched,
      aiSummarized: ingest.aiSummarized,
      ingestErrors: ingest.errors.length,
      plans,
      rankComputed,
      rewardEvents,
      rewardJobs,
      rewardMatched,
      tracked,
      inFlight,
      onTrackRate,
      topScores,
      llmAudits,
      llmCited: cited,
      llmFailed,
      interlinksStored,
    }, [...ingest.errors, ...ingest.aiErrors].slice(0, 20), 'cron')

    return NextResponse.json({
      ok: true,
      phase,
      ingest: {
        fetched: ingest.itemsFetched,
        stored: ingest.itemsStored,
        aiSummarized: ingest.aiSummarized,
        errors: ingest.errors.slice(0, 5),
        aiErrors: ingest.aiErrors.slice(0, 5),
      },
      plans,
      rankComputed,
      rewardEvents,
      rewardJobs,
      rewardMatched,
      tracked,
      inFlight,
      onTrackRate,
      topScores,
      llmAudits,
      llmCited: cited,
      llmFailed,
      interlinksStored,
    })
  } catch (e) {
    await recordEngineRun('daily', 'failed', { phase }, [e instanceof Error ? e.message : 'unknown'], 'cron')
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'daily run failed' }, { status: 500 })
  }
}
