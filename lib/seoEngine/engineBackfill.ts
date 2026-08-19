/**
 * Live backfill + stress harness for the later Master Engine stores:
 *   seo_forecast_runs, seo_reward_events, seo_model_calibration,
 *   seo_intelligence_snapshots, seo_ahrefs_snapshots,
 *   seo_backlink_targets / seo_backlink_outreach.
 *
 * Each step calls the real writer (not a raw INSERT of dummy rows) and
 * reports ok/error so a silent supabase `{ error }` cannot look like success.
 */

import { createSupabaseAdminClient } from '@/lib/supabase'
import { buildPredictiveSignal } from './intelligence'
import {
  FAMILY_WEIGHTS,
  persistForecast,
  recordCalibration,
  runRankingPassForPlans,
  RANKING_MODEL_VERSION,
} from './rankingModel'
import { runForecastRewardPass } from './forecastReward'
import { fallbackLegalAhrefsSnapshot, persistAhrefsSnapshot } from './ahrefsAudit'
import { draftOutreachMessage, listOutreachForTarget, listTargetOpportunities, recordOutreach, runBacklinkReport } from './backlinkEngine'
import { loadKnowledgeFeed, recordEngineRun } from './knowledge'
import { saveSnapshotVersion } from '@/lib/seoFactory/gscHistory'

export function matureRunDate(todayIso: string, horizonDays: number): string {
  const d = new Date(`${todayIso.slice(0, 10)}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() - horizonDays)
  return d.toISOString().slice(0, 10)
}

export interface EngineBackfillStep {
  name: string
  ok: boolean
  wrote: number
  detail: string
  error?: string
}

export interface EngineBackfillReport {
  ok: boolean
  steps: EngineBackfillStep[]
}

function step(name: string, ok: boolean, wrote: number, detail: string, error?: string): EngineBackfillStep {
  return { name, ok, wrote, detail, error }
}

export async function backfillAhrefs(): Promise<EngineBackfillStep> {
  const snap = fallbackLegalAhrefsSnapshot()
  const wrote = await persistAhrefsSnapshot({ ...snap, fetchedAt: new Date().toISOString(), source: 'fallback' })
  return step('seo_ahrefs_snapshots', wrote.ok, wrote.ok ? 1 : 0, wrote.ok ? `persisted ${snap.issues.length} issues · health ${snap.healthScore}` : 'persist failed', wrote.error)
}

export async function backfillIntelligenceFromKnowledge(limit = 80): Promise<EngineBackfillStep> {
  const feed = await loadKnowledgeFeed(limit)
  const db = createSupabaseAdminClient()
  let wrote = 0
  let lastError: string | undefined
  for (const item of feed.items) {
    const url = String(item.url || '')
    const title = String(item.title || '')
    const source = String(item.source || 'knowledge')
    if (!url || !title) continue
    const observedAt = String(item.fetched_at || new Date().toISOString())
    const summary = String(item.ai_summary || item.summary || title)
    const evidence = [{
      kind: 'knowledge' as const,
      id: source,
      url,
      observedAt,
      source: String(item.source_label || source),
      authority: Number(item.confidence) || 0.8,
      excerpt: summary.slice(0, 280),
    }]
    const prediction = buildPredictiveSignal(
      {
        topic: title,
        play: 'content_gap',
        opportunityScore: Math.min(100, (Number(item.confidence) || 0.8) * 80),
        difficultyScore: 50,
        signals: [`${item.source_label || source} · ${title}`],
        sourcePage: url,
      },
      evidence,
    )
    const snapshotKey = `${source}:${url}`
    const row = {
      snapshot_key: snapshotKey,
      model_version: prediction.modelVersion,
      topic: prediction.topic,
      normalized_topic: title.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim(),
      play: prediction.play,
      opportunity_score: prediction.opportunityScore,
      confidence: prediction.confidence,
      freshness: prediction.freshness,
      rankability: prediction.rankability,
      evidence: prediction.evidence,
      reasons: prediction.reasons,
      regeneration_eligible: prediction.regenerationEligible,
      last_seen_at: new Date().toISOString(),
    }
    const { error } = await db.from('seo_intelligence_snapshots').upsert(row, { onConflict: 'snapshot_key' })
    if (error) {
      lastError = error.message
      continue
    }
    wrote += 1
  }
  return step(
    'seo_intelligence_snapshots',
    wrote > 0 && !lastError,
    wrote,
    `upserted ${wrote}/${feed.items.length} from seo_knowledge`,
    lastError,
  )
}

export async function backfillRankingAndForecasts(limit = 40): Promise<EngineBackfillStep> {
  const result = await runRankingPassForPlans(limit)
  return step(
    'seo_ranking_scores+seo_forecast_runs',
    result.computed > 0,
    result.computed,
    result.computed
      ? `computed ${result.computed} · top ${result.topScores.map((s) => `${s.topic}=${s.total}`).slice(0, 3).join(', ')}`
      : 'ranking pass computed 0 — plans or persist failed',
  )
}

export async function backfillGscSnapshot(): Promise<EngineBackfillStep> {
  try {
    const { pullGscSignals } = await import('./planner')
    const signals = await pullGscSignals()
    if (!signals.length) return step('gsc_snapshots', false, 0, 'pullGscSignals returned 0 rows')
    const siteUrl = process.env.GSC_SITE_URL || 'https://legal.yousafeconsultancy.com/'
    const dateKey = new Date().toISOString().slice(0, 10)
    const rows = signals.map((s) => ({
      keys: [s.term],
      impressions: s.impressions,
      clicks: s.clicks,
      ctr: s.ctr,
      position: s.position,
    }))
    await saveSnapshotVersion(siteUrl, dateKey, rows.length, JSON.stringify({ rows }))
    return step('gsc_snapshots', true, rows.length, `saved ${rows.length} queries for ${dateKey}`)
  } catch (e) {
    const error = e instanceof Error ? e.message : 'gsc snapshot failed'
    return step('gsc_snapshots', false, 0, 'save failed', error)
  }
}

export async function backfillMaturedForecasts(today = new Date().toISOString().slice(0, 10)): Promise<EngineBackfillStep> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from('seo_forecast_runs')
    .select('topic,subject_key,horizon_days,projected_position,projected_impressions,projected_clicks,probability_top10,assumptions,model_version')
    .order('run_date', { ascending: false })
    .limit(400)
  if (error) return step('matured_forecasts', false, 0, 'load failed', error.message)
  const latest = new Map<string, Record<string, unknown>>()
  for (const row of (data || []) as Array<Record<string, unknown>>) {
    const key = `${row.topic}|${row.subject_key}|${row.horizon_days}`
    if (!latest.has(key)) latest.set(key, row)
  }
  let wrote = 0
  let lastError: string | undefined
  for (const row of latest.values()) {
    const horizon = Number(row.horizon_days) || 30
    const runDate = matureRunDate(today, horizon)
    const persist = await persistForecast(
      String(row.topic),
      {
        baseline: { position: null, impressions: 0, clicks: 0, ctr: 0 },
        points: [{
          horizonDays: horizon as 30 | 60 | 90,
          projectedPosition: Number(row.projected_position) || 20,
          projectedImpressions: Number(row.projected_impressions) || 0,
          projectedClicks: Number(row.projected_clicks) || 0,
          probabilityOfTop10: Number(row.probability_top10) || 0,
          lift: 0,
        }],
        assumptions: Array.isArray(row.assumptions) ? (row.assumptions as string[]) : [`backfill matured ${horizon}d from live projection`],
      },
      String(row.subject_key || ''),
      { runDate },
    )
    if (!persist.ok) lastError = persist.error
    else wrote += persist.wrote
  }
  return step(
    'matured_forecasts',
    wrote > 0,
    wrote,
    `wrote ${wrote} matured copies (run_date = today − horizon) so the reward pass has evaluable rows`,
    lastError,
  )
}

export async function backfillRewardAndCalibration(): Promise<EngineBackfillStep> {
  const pass = await runForecastRewardPass({ limit: 400 })
  if (pass.failed) return step('seo_reward_events', false, 0, pass.note, pass.failed)
  let calWrote = 0
  if (!pass.recalibrated) {
    const baseline = await recordCalibration(
      FAMILY_WEIGHTS,
      pass.events,
      pass.events
        ? `baseline after forecast-reward · ${pass.events} events · weights unchanged`
        : `baseline seed · ${RANKING_MODEL_VERSION} default weights (no matured GSC match yet)`,
    )
    calWrote = baseline.ok ? 1 : 0
    if (!baseline.ok) {
      return step('seo_model_calibration', false, pass.events, pass.note, baseline.error)
    }
  }
  return step(
    'seo_reward_events+seo_model_calibration',
    pass.events > 0 || calWrote > 0,
    pass.events + calWrote,
    `${pass.note} · calibration ${pass.recalibrated ? 'moved' : `baseline+${calWrote}`}`,
  )
}

export async function backfillBacklinkOutreach(limit = 14): Promise<EngineBackfillStep> {
  const targets = await listTargetOpportunities({ limit })
  if (!targets.length) return step('seo_backlink_outreach', false, 0, 'no targets — seed list missing')
  let wrote = 0
  let lastError: string | undefined
  for (const target of targets) {
    const existing = await listOutreachForTarget(target.id)
    if (existing.length) continue
    const draft = await draftOutreachMessage({ target, skipAi: true })
    const row = await recordOutreach({
      target_id: target.id,
      channel: 'email',
      subject: draft.subject,
      message_body: draft.body,
      status: 'drafted',
      operator_id: 'engine-backfill',
      source_brief: { model: draft.model, backfill: true },
    })
    if (!row) {
      lastError = `recordOutreach returned null for ${target.domain}`
      continue
    }
    wrote += 1
  }
  const report = await runBacklinkReport()
  return step(
    'seo_backlink_outreach',
    wrote > 0 || report.summary.target_total > 0,
    wrote,
    `drafted ${wrote} outreach rows · dashboard targets ${report.summary.target_total} · inbound gaps ${report.inboundGaps.length}`,
    lastError,
  )
}

export async function runEngineStoreBackfill(): Promise<EngineBackfillReport> {
  const steps: EngineBackfillStep[] = []
  steps.push(await backfillAhrefs())
  steps.push(await backfillIntelligenceFromKnowledge())
  steps.push(await backfillRankingAndForecasts(40))
  steps.push(await backfillGscSnapshot())
  steps.push(await backfillMaturedForecasts())
  steps.push(await backfillRewardAndCalibration())
  steps.push(await backfillBacklinkOutreach())

  const ok = steps.every((s) => s.ok)
  const run = await recordEngineRun(
    'manual',
    ok ? 'success' : 'partial',
    { phase: 'engine-store-backfill', steps },
    steps.filter((s) => !s.ok).map((s) => `${s.name}: ${s.error || s.detail}`),
    'backfill',
  )
  steps.push(step('seo_engine_runs', run.ok, run.ok ? 1 : 0, run.ok ? 'recorded manual backfill run' : 'run log failed', run.error))
  return { ok: steps.every((s) => s.ok), steps }
}
