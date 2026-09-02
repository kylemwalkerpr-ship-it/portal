import { NextRequest, NextResponse } from 'next/server'
import { ingestKnowledge, recordEngineRun } from '@/lib/seoEngine/knowledge'
import { runPlanner } from '@/lib/seoEngine/planner'
import { runVisibilityAudits } from '@/lib/seoEngine/llmVisibility'
import { classifyEngineRunStatus, formatTopScores } from '@/lib/seoEngine/engineRunSummary'
import { formatEnginePairTape } from '@/lib/seoEngine/engineAi'

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

  // ── Run-in-flight guard ──────────────────────────────────────────────────
  // GitHub's `schedule` + a manual `workflow_dispatch` (or a GH retry) can
  // overlap; two concurrent `all` passes would double LLM audit rows, double
  // reward credits and race the planner's persistence. Refuse to start when
  // a daily run is still marked 'running' from the last 90 minutes.
  try {
    const { createSupabaseAdminClient } = await import('@/lib/supabase')
    const { data: lastRun } = await createSupabaseAdminClient()
      .from('seo_engine_runs')
      .select('id,status,started_at')
      .eq('kind', 'daily')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const row = lastRun as { status?: string; started_at?: string } | null
    if (row?.status === 'running' && row.started_at) {
      const ageMin = (Date.now() - new Date(row.started_at).getTime()) / 60_000
      if (ageMin < 90) {
        return NextResponse.json({
          ok: false,
          error: `Another daily engine run is still in flight (started ${row.started_at}, ${Math.round(ageMin)}m ago) — refusing to overlap. If it is genuinely dead, wait ${Math.round(90 - ageMin)} more minutes.`,
        }, { status: 409 })
      }
    }
  } catch {
    /* guard is best-effort — a DB blip must not block the cron */
  }

  const body = (await req.json().catch(() => ({}))) as { phase?: string; limitPerSource?: number; limit?: number; draftBriefs?: boolean; llmAudits?: boolean }
  const phase = String(body.phase || 'all').toLowerCase()

  try {
    if (phase === 'plan') {
      const { plans, pair } = await runPlanner({ draftBriefs: body.draftBriefs !== false, limit: body.limit })
      await recordEngineRun('daily', plans.length ? 'success' : 'partial', {
        phase,
        plans: plans.length,
        pair: formatEnginePairTape(pair),
      }, [], 'cron')
      return NextResponse.json({ ok: true, phase, plans: plans.length, pair })
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
      // Economics rollup — the "est. monthly funnel value" KPI: persisted
      // expected_revenue across ranked plans + the funnel action mix.
      let economics = { revenueUsdMonthly: 0, estimatedPlans: 0, byAction: {} as Record<string, number> }
      try {
        const { loadPlansDashboard } = await import('@/lib/seoEngine/planner')
        const { planEconomicsSummary } = await import('@/lib/seoEngine/planEconomics')
        const { plans } = await loadPlansDashboard(100)
        economics = planEconomicsSummary(plans)
      } catch { /* rollup is additive */ }
      await recordEngineRun('daily', rank.computed ? 'success' : 'partial', {
        phase, computed: rank.computed, topScores: formatTopScores(rank.topScores),
        revenueUsdMonthly: economics.revenueUsdMonthly,
        estimatedPlans: economics.estimatedPlans,
        byAction: economics.byAction,
      }, [], 'cron')
      return NextResponse.json({ ok: true, phase, ...rank, topScores: formatTopScores(rank.topScores), revenueUsdMonthly: economics.revenueUsdMonthly, estimatedPlans: economics.estimatedPlans, byAction: economics.byAction })
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
    const allPhaseErrors: string[] = []
    if (phase === 'all') {
      const planned = await runPlanner({ draftBriefs: body.draftBriefs !== false, limit: body.limit || 15 })
      plans = planned.plans.length
      if (planned.persistErrors?.length) {
        allPhaseErrors.push(`planner-persist: ${planned.persistErrors.slice(0, 2).join('; ')}${planned.persistErrors.length > 2 ? ` (+${planned.persistErrors.length - 2})` : ''}`)
      }
      try {
        const { persistPlannerInterlinks } = await import('@/lib/seoEngine/interlink')
        interlinksStored = await persistPlannerInterlinks(planned.plans)
      } catch (ilErr) {
        allPhaseErrors.push(`interlinks: ${ilErr instanceof Error ? ilErr.message : 'failed'}`)
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
        const { fetchAhrefsSiteAudit, persistAhrefsSnapshot } = await import('@/lib/seoEngine/ahrefsAudit')
        if (process.env.AHREFS_API_KEY) {
          const snap = await fetchAhrefsSiteAudit()
          const r = await persistAhrefsSnapshot(snap)
          if (!r.ok) throw new Error(`ahrefs persist: ${r.error}`)
        } else {
          // No key — nothing to do. NEVER persist the hardcoded fallback crawl:
          // it would bury the last real snapshot as if it were fresh.
        }
      } catch (ahrefsErr) {
        allPhaseErrors.push(`ahrefs: ${ahrefsErr instanceof Error ? ahrefsErr.message : 'failed'}`)
      }
      // TitleLab CTR feedback loop: recalibrate the title-scorer bucket
      // weights from rows that carry measured ctr_after_ship (GSC-matched).
      // Best-effort — a missing history table or config row never fails the
      // run; the weights only drift toward CTR-proven titles.
      try {
        const { loadCalibrationHistory, recalibrateTitleScorer, TITLE_SCORER_WEIGHTS } = await import('@/lib/seoEngine/titleLab')
        const { saveEngineConfig } = await import('@/lib/seoEngine/engineConfig')
        const rows = await loadCalibrationHistory(500)
        if (rows.length >= 3) {
          const calibrated = recalibrateTitleScorer(rows, TITLE_SCORER_WEIGHTS)
          if (calibrated.applied > 0) {
            await saveEngineConfig('title_scorer', {
              title_weights: calibrated.weights,
              calibrated_at: new Date().toISOString(),
              measured_titles: rows.length,
            })
          }
        }
      } catch { /* title calibration is additive — never fail the daily run */ }
    }
    const status = allPhaseErrors.length
      ? 'partial'
      : classifyEngineRunStatus({
          phase,
          itemsStored: ingest.itemsStored,
          sourcesRun: ingest.sourcesRun,
          sourceErrors: ingest.errors.length,
          plans,
          rankComputed,
        })
    // Economics rollup for the 'all' phase — est. monthly funnel value.
    let economics = { revenueUsdMonthly: 0, estimatedPlans: 0, byAction: {} as Record<string, number> }
    if (rankComputed > 0) {
      try {
        const { loadPlansDashboard } = await import('@/lib/seoEngine/planner')
        const { planEconomicsSummary } = await import('@/lib/seoEngine/planEconomics')
        const { plans: dashboardPlans } = await loadPlansDashboard(100)
        economics = planEconomicsSummary(dashboardPlans)
      } catch { /* rollup is additive */ }
    }
    await recordEngineRun('daily', status, {
      phase,
      ingested: ingest.itemsStored,
      fetched: ingest.itemsFetched,
      aiSummarized: ingest.aiSummarized,
      ingestErrors: ingest.errors.length,
      pair: formatEnginePairTape(ingest.pair),
      plans,
      rankComputed,
      revenueUsdMonthly: economics.revenueUsdMonthly,
      estimatedPlans: economics.estimatedPlans,
      byAction: economics.byAction,
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
    }, [...ingest.errors, ...ingest.aiErrors, ...allPhaseErrors].slice(0, 20), 'cron')

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
      phaseErrors: allPhaseErrors.slice(0, 5),
    })
  } catch (e) {
    await recordEngineRun('daily', 'failed', { phase }, [e instanceof Error ? e.message : 'unknown'], 'cron')
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'daily run failed' }, { status: 500 })
  }
}
