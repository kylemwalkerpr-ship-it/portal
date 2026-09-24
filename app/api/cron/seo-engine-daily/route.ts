import { NextRequest, NextResponse } from 'next/server'
import { ingestKnowledge, recordEngineRun } from '@/lib/seoEngine/knowledge'
import { runPlanner } from '@/lib/seoEngine/planner'
import { runVisibilityAudits } from '@/lib/seoEngine/llmVisibility'
import { classifyEngineRunStatus, formatTopScores } from '@/lib/seoEngine/engineRunSummary'
import { formatEnginePairTape } from '@/lib/seoEngine/engineAi'
import { executeP11AuditCommand, scheduledP11IdempotencyKey, SEO_ENGINE_DAILY_ACTOR, type P11AuditRequest, type P11CommandContext } from '@/lib/seoEngine/p11AuditCommand'
// Type-only: erased at compile time (the reconciliation module itself is still
// imported dynamically below so this route never pulls the verification graph
// until the interlink phase actually runs). Deriving the recorded summary from
// the real reconciliation type keeps the engine-run telemetry honest when the
// seam grows another truthful counter.
import type { InterlinkReconciliationSummary } from '@/lib/seoFactory/interlinkReconciliation'

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
 *   { phase: 'interlinks' }                   — bounded durable re-verification
 *                                                + finalization of staged planned
 *                                                interlinks (post-deploy seam)
 *   { phase: 'all' }                          — knowledge → plan → rank → rewards
 *                                                → track → interlinks (+ optional
 *                                                LLM audits)
 *                                                (default)
 *
 * GET — latest engine runs (audit trail).
 */
function authorize(req: Request): boolean {
  const expected = process.env.CRON_SECRET
  const provided = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  return Boolean(expected && provided && provided === expected)
}

async function runScheduledP11Audit(key: string, request: P11AuditRequest, run: (command: P11CommandContext) => Promise<unknown>) {
  const outcome = await executeP11AuditCommand({ actor: SEO_ENGINE_DAILY_ACTOR, idempotencyKey: key, request, run })
  if (outcome.kind === 'conflict') throw new Error('P11 scheduled audit idempotency key conflicts with its persisted request')
  if (outcome.kind === 'pending') throw new Error(`P11 scheduled audit ${outcome.command.id} is ${outcome.command.status}; provider attempts will not be repeated`)
  return outcome.result
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
      const vis = await runScheduledP11Audit(scheduledP11IdempotencyKey('llm'), { maxAudits: 8 }, (command) => runVisibilityAudits({ ...command.request, command })) as Awaited<ReturnType<typeof runVisibilityAudits>>
      // Fan-out sub-query audits per top cluster — feeds the aeoGeo family with
      // measured citation evidence (per-cluster map returned for attribution).
      let fanOut = { cited: 0, total: 0, clusters: 0, byCluster: {} as Record<string, { cited: number; total: number }> }
      let fanOutCommandStarted = false
      try {
        const { runFanOutVisibilityAudits } = await import('@/lib/seoEngine/llmVisibility')
        fanOutCommandStarted = true
        fanOut = await runScheduledP11Audit(scheduledP11IdempotencyKey('llm-fanout'), { fanOut: true, planLimit: 8, maxPerPlan: 5, maxAudits: 16 }, (command) => runFanOutVisibilityAudits({ ...command.request, command })) as typeof fanOut
      } catch (error) {
        if (fanOutCommandStarted) throw error
        fanOut = { cited: 0, total: 0, clusters: 0, byCluster: {} }
      }
      await recordEngineRun('daily', vis.total ? 'success' : 'partial', {
        phase, cited: vis.cited, total: vis.total, attempted: vis.attempted, failed: vis.failed, shareOfVoice: vis.shareOfVoice, measurementState: vis.measurementState,
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
      const rewardErrors: string[] = []
      if (reward.unavailable) rewardErrors.push(`reward-attribution: ${reward.unavailable}`)
      if (reward.persistFailed > 0) rewardErrors.push(`reward-persist: ${reward.persistFailed} write(s) failed`)
      await recordEngineRun('daily', rewardErrors.length ? 'partial' : 'success', {
        phase,
        events: reward.events,
        jobsConsidered: reward.jobsConsidered,
        jobsMatched: reward.jobsMatched,
        duplicatesSkipped: reward.duplicatesSkipped,
        persistFailed: reward.persistFailed,
        preparedEvents: reward.preparedEvents ?? null,
        historyRows: reward.historyRows ?? null,
        distinctWindows: reward.distinctWindows ?? null,
        unavailable: reward.unavailable || null,
      }, rewardErrors, 'cron')
      return NextResponse.json({ ok: rewardErrors.length === 0, phase, ...reward, errors: rewardErrors })
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
    if (phase === 'interlinks') {
      // Durable post-deploy seam: staged planned interlinks are re-verified
      // (and finalized only on an ok=true live verdict) on the existing
      // scheduled surface. A pending deployment is benign truth; only a
      // verifier-unavailable / DB-write failure is an error.
      const { reconcileStagedInterlinks } = await import('@/lib/seoFactory/interlinkReconciliation')
      const interlinkReconcile = await reconcileStagedInterlinks()
      await recordEngineRun('daily', interlinkReconcile.ok ? 'success' : 'partial', {
        phase,
        interlinkUnavailable: interlinkReconcile.unavailable,
        interlinkUnavailableReason: interlinkReconcile.unavailableReason,
        interlinkScannedRows: interlinkReconcile.scannedRows,
        interlinkStagedSources: interlinkReconcile.stagedSources,
        interlinkSkippedMissingJobIdentity: interlinkReconcile.skippedMissingJobIdentity,
        interlinkMissingJobIdentityRows: interlinkReconcile.missingJobIdentityRows,
        interlinkMissingJobIdentityError: interlinkReconcile.missingJobIdentityError,
        interlinkEligibleSources: interlinkReconcile.eligibleSources,
        interlinkVerifiedLive: interlinkReconcile.verifiedLive,
        interlinkNotDeploymentProven: interlinkReconcile.notDeploymentProven,
        interlinkVerificationPending: interlinkReconcile.verificationFailed,
        interlinkSkippedAttemptCooldown: interlinkReconcile.skippedAttemptCooldown,
        interlinkApplied: interlinkReconcile.applied,
        interlinkFinalized: interlinkReconcile.finalized,
        interlinkPlannedVerdicts: interlinkReconcile.plannedVerdicts,
        interlinkRemaining: interlinkReconcile.remaining,
      }, interlinkReconcile.errors, 'cron')
      return NextResponse.json({ ok: interlinkReconcile.ok, phase, interlinkReconcile })
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
    let interlinksFiltered = 0
    let interlinkReconcileSummary: Pick<
      InterlinkReconciliationSummary,
      | 'scannedRows'
      | 'stagedSources'
      | 'skippedMissingJobIdentity'
      | 'missingJobIdentityRows'
      | 'missingJobIdentityError'
      | 'eligibleSources'
      | 'unavailable'
      | 'unavailableReason'
      | 'verifiedLive'
      | 'notDeploymentProven'
      | 'verificationFailed'
      | 'skippedAttemptCooldown'
      | 'applied'
      | 'finalized'
      | 'plannedVerdicts'
      | 'remaining'
    > | null = null
    let gscPersistStatus: string | null = null
    let gscRowsProcessed = 0
    let gscWindowEnd: string | null = null
    let gscSyncedAt: string | null = null
    let gscAttemptedAt: string | null = null
    const topScores: string[] = []
    const allPhaseErrors: string[] = []
    if (phase === 'all') {
      // Measurement first: persist the rolling GSC query×page window so the
      // planner/ranking/reward consumers in this same run can read it. A
      // missing/unavailable connection is measurement truth — record it and
      // mark the run partial, never fake a healthy zero.
      try {
        const { persistGscQueryPageRows } = await import('@/lib/seoFactory/gscPersistence')
        const { createSupabaseAdminClient } = await import('@/lib/supabase')
        const gsc = await persistGscQueryPageRows(createSupabaseAdminClient())
        gscPersistStatus = gsc.status
        gscRowsProcessed = gsc.rowsProcessed
        gscWindowEnd = gsc.range.endDate
        gscSyncedAt = gsc.syncedAt
        gscAttemptedAt = gsc.attemptedAt
        if (!gsc.ok) {
          allPhaseErrors.push(`gsc-persist: ${gsc.status} — ${gsc.error || gsc.warnings[0] || 'no GSC rows persisted'}`)
        }
      } catch (gscErr) {
        gscPersistStatus = 'failed'
        gscAttemptedAt = new Date().toISOString()
        allPhaseErrors.push(`gsc-persist: ${gscErr instanceof Error ? gscErr.message : 'failed'}`)
      }
      const planned = await runPlanner({ draftBriefs: body.draftBriefs !== false, limit: body.limit || 15 })
      plans = planned.plans.length
      if (planned.persistErrors?.length) {
        allPhaseErrors.push(`planner-persist: ${planned.persistErrors.slice(0, 2).join('; ')}${planned.persistErrors.length > 2 ? ` (+${planned.persistErrors.length - 2})` : ''}`)
      }
      try {
        const { persistPlannerInterlinks } = await import('@/lib/seoEngine/interlink')
        const interlinks = await persistPlannerInterlinks(planned.plans)
        interlinksStored = interlinks.stored
        // Dead/synthetic targets that were successfully checked and filtered
        // are expected P6 hygiene — a truthful filtered count, NOT a phase
        // error. Only verifier-unavailable / DB-write failures are errors.
        interlinksFiltered = interlinks.filtered
        for (const error of interlinks.errors) allPhaseErrors.push(`interlinks: ${error}`)
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
      if (reward.unavailable) {
        allPhaseErrors.push(`reward-attribution: ${reward.unavailable}`)
      }
      if (reward.persistFailed > 0) {
        allPhaseErrors.push(`reward-persist: ${reward.persistFailed} write(s) failed`)
      }
      const { loadForecastTracker } = await import('@/lib/seoEngine/forecastTracker')
      const tracker = await loadForecastTracker({ limit: 200 })
      tracked = tracker.summary.evaluated
      inFlight = tracker.summary.inFlight
      onTrackRate = tracker.summary.onTrackRate
      if (body.llmAudits !== false) {
        const vis = await runScheduledP11Audit(scheduledP11IdempotencyKey('all-llm'), { maxAudits: 6 }, (command) => runVisibilityAudits({ ...command.request, command })) as Awaited<ReturnType<typeof runVisibilityAudits>>
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
      // Durable post-deploy interlink seam: staged planned interlinks get their
      // automatic re-verification/finalization opportunity here, on the
      // existing scheduled surface, AFTER a real production deployment has had
      // time to become observable. A pending deployment is benign truth; only
      // verifier-unavailable / DB-write failures are phase errors.
      try {
        const { reconcileStagedInterlinks } = await import('@/lib/seoFactory/interlinkReconciliation')
        const reconcile = await reconcileStagedInterlinks()
        interlinkReconcileSummary = {
          scannedRows: reconcile.scannedRows,
          stagedSources: reconcile.stagedSources,
          skippedMissingJobIdentity: reconcile.skippedMissingJobIdentity,
          missingJobIdentityRows: reconcile.missingJobIdentityRows,
          missingJobIdentityError: reconcile.missingJobIdentityError,
          eligibleSources: reconcile.eligibleSources,
          unavailable: reconcile.unavailable,
          unavailableReason: reconcile.unavailableReason,
          verifiedLive: reconcile.verifiedLive,
          notDeploymentProven: reconcile.notDeploymentProven,
          verificationFailed: reconcile.verificationFailed,
          skippedAttemptCooldown: reconcile.skippedAttemptCooldown,
          applied: reconcile.applied,
          finalized: reconcile.finalized,
          plannedVerdicts: reconcile.plannedVerdicts,
          remaining: reconcile.remaining,
        }
        if (!reconcile.ok) {
          for (const error of reconcile.errors) allPhaseErrors.push(`interlink-reconcile: ${error}`)
        }
      } catch (reconcileErr) {
        allPhaseErrors.push(
          `interlink-reconcile: ${reconcileErr instanceof Error ? reconcileErr.message : 'failed'}`,
        )
      }
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
      ...(gscPersistStatus
        ? { gscPersistStatus, gscRowsProcessed, gscWindowEnd, gscSyncedAt, gscAttemptedAt }
        : {}),
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
      interlinksFiltered,
      ...(interlinkReconcileSummary ? { interlinkReconcile: interlinkReconcileSummary } : {}),
    }, [...ingest.errors, ...ingest.aiErrors, ...allPhaseErrors].slice(0, 20), 'cron')

    return NextResponse.json({
      // Explicit phase errors must agree with the persisted partial status so
      // the GitHub workflow can fail instead of green-lighting degraded work.
      // A benign no-data partial with no explicit phase error remains ok:true.
      ok: allPhaseErrors.length === 0,
      phase,
      ...(gscPersistStatus
        ? { gscPersistStatus, gscRowsProcessed, gscWindowEnd, gscSyncedAt, gscAttemptedAt }
        : {}),
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
      interlinksFiltered,
      ...(interlinkReconcileSummary ? { interlinkReconcile: interlinkReconcileSummary } : {}),
      phaseErrors: allPhaseErrors.slice(0, 5),
    })
  } catch (e) {
    await recordEngineRun('daily', 'failed', { phase }, [e instanceof Error ? e.message : 'unknown'], 'cron')
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'daily run failed' }, { status: 500 })
  }
}
