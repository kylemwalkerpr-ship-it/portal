/**
 * OUTCOME HISTORY — the real-world feedback loop for the adaptive engine.
 *
 * masterEngineLearn.ts learns subsystem weights from `HistoricalOutcome[]`
 * (intent + the page's 0–1 subsystem scores at evaluation time + the measured
 * rank outcome). This module builds that history from production data:
 *
 *   1. Every merged content_job already stores a full Master Engine report
 *      (`master_engine_json`) — the detected `intent` and the per-subsystem
 *      `score` (0–1) the engine produced for that page.
 *   2. Live Google Search Console (`searchAnalytics.query`, `page` dimension)
 *      gives the page's real average position / impressions / clicks.
 *   3. Correlating (1) × (2) turns "the engine scored these subsystems X and
 *      the page actually ranked Y" into the training signal that makes the
 *      intent weight matrix adapt to measured rank outcomes.
 *
 * Split into:
 *   · `buildOutcomeHistory(jobs, gscPages)` — pure, unit-testable correlation.
 *   · `buildOutcomeHistoryFromLiveGsc()` — fetches jobs + GSC and calls the
 *     pure fn. Used by the master route so learned weights shift from live data
 *     without a caller having to hand-supply history.
 */
import { createClient } from '@supabase/supabase-js'
import { getGscAccess } from '@/lib/gscAuth'
import { resolveSupabaseKey } from '@/lib/supabaseKey'
import { SUBSYSTEMS, type IntentId, type SubsystemId } from './masterEngine'
import type { HistoricalOutcome } from './masterEngineLearn'

const VALID_INTENTS = new Set<IntentId>([
  'informational',
  'procedural',
  'commercial',
  'transactional',
  'navigational',
  'local',
  'ymyl',
])

/** A content_jobs row, narrowed to what the correlation needs. */
export interface OutcomeJobRow {
  id?: string
  primary_keyword?: string | null
  canonical_url?: string | null
  live_canonical_url?: string | null
  master_engine_json?: Record<string, unknown> | null
  updated_at?: string | null
}

/** One GSC `page`-dimension row (aggregate over the window). */
export interface GscPageRow {
  url: string
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export interface OutcomeHistoryResult {
  history: HistoricalOutcome[]
  source: 'live' | 'none'
  matchedJobs: number
  pages: number
  warnings: string[]
}

/** host + pathname, trailing slash trimmed — the same key GSC page URLs use. */
export function normPathname(u: string): string {
  try {
    const p = new URL(u)
    return (p.host.toLowerCase() + (p.pathname.replace(/\/+$/, '') || '/'))
  } catch {
    return u.replace(/\/+$/, '').toLowerCase()
  }
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/** Extract the stored engine report's intent + subsystem scores (0–1). */
function outcomeFromReport(
  report: Record<string, unknown>,
  page: GscPageRow,
  at?: string,
): HistoricalOutcome | null {
  const intent = report.intent
  if (typeof intent !== 'string' || !VALID_INTENTS.has(intent as IntentId)) return null

  const subs = report.subsystems
  if (!subs || typeof subs !== 'object') return null
  const subsystemScores: Partial<Record<SubsystemId, number>> = {}
  let any = false
  for (const s of SUBSYSTEMS) {
    const sub = (subs as Record<string, unknown>)[s]
    const score = sub && typeof sub === 'object' ? num((sub as { score?: unknown }).score) : null
    if (score == null) continue
    subsystemScores[s] = Math.max(0, Math.min(1, score))
    any = true
  }
  if (!any) return null

  const position = page.position > 0 ? page.position : null
  return {
    intent: intent as IntentId,
    at,
    subsystemScores,
    outcome: {
      top10: position != null ? position <= 10 : undefined,
      position: position ?? undefined,
      clicks: page.clicks,
      impressions: page.impressions,
    },
  }
}

/**
 * Pure correlation: merge stored engine reports with live GSC page positions.
 * `jobs` should be ordered most-recent-first; a URL is kept from its first
 * (most recent) job so refreshed pages aren't double-counted.
 */
export function buildOutcomeHistory(
  jobs: OutcomeJobRow[],
  gscPages: GscPageRow[],
  opts: { minImpressions?: number } = {},
): HistoricalOutcome[] {
  const minImpressions = opts.minImpressions ?? 0

  // Index GSC pages by normalized URL (exact) and by trailing path (fallback).
  const byExact = new Map<string, GscPageRow>()
  const byTail = new Map<string, GscPageRow>()
  for (const p of gscPages) {
    if (!p.url || p.position <= 0) continue
    if (p.impressions < minImpressions) continue
    const norm = normPathname(p.url)
    if (!byExact.has(norm)) byExact.set(norm, p)
    const tail = norm.split('/').slice(-2).join('/')
    if (tail && !byTail.has(tail)) byTail.set(tail, p)
  }

  const seen = new Set<string>()
  const out: HistoricalOutcome[] = []
  for (const job of jobs) {
    const report = job.master_engine_json
    if (!report || typeof report !== 'object') continue

    // Resolve the page this job owns (canonical first, then live-verified).
    const candidates = [job.canonical_url, job.live_canonical_url].filter(
      (u): u is string => typeof u === 'string' && u.length > 0,
    )
    if (!candidates.length) continue

    let page: GscPageRow | null = null
    for (const u of candidates) {
      const norm = normPathname(u)
      page = byExact.get(norm) || null
      if (page) break
      const tail = norm.split('/').slice(-2).join('/')
      if (tail && byTail.has(tail)) {
        page = byTail.get(tail) || null
        break
      }
    }
    if (!page) continue

    // Dedupe by canonical URL so a refreshed/regenerated job doesn't double
    // the same page's outcome (both snapshots would read the same current GSC
    // position). The first job seen is the most recent (caller orders).
    const dedupeKey = candidates[0]
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)

    const oc = outcomeFromReport(report, page, job.updated_at ?? undefined)
    if (oc) out.push(oc)
  }
  return out
}

/**
 * Build outcome history from production data: merged jobs' stored engine
 * reports + live GSC page positions. Never throws — degraded data surfaces as
 * an empty history + warnings so the master route keeps working offline.
 */
export async function buildOutcomeHistoryFromLiveGsc(opts?: {
  days?: number
  minImpressions?: number
}): Promise<OutcomeHistoryResult> {
  const days = Math.min(180, Math.max(7, Number(opts?.days) || 28))
  const warnings: string[] = []

  // ── 1. Merged jobs with a stored engine report ───────────────────────────
  let jobs: OutcomeJobRow[] = []
  try {
    // Read-only query — resolveSupabaseKey() accepts the legacy `eyJ…`
    // service-role JWT, else falls back to the anon key (handles the newer
    // `sb_secret_…` key format that supabase-js v2 rejects).
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      resolveSupabaseKey()!,
    )
    const { data, error } = await supabase
      .from('content_jobs')
      .select('id, primary_keyword, canonical_url, live_canonical_url, master_engine_json, updated_at')
      .eq('status', 'merged')
      .not('master_engine_json', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(500)
    if (error) {
      warnings.push(`content_jobs query failed: ${error.message}`)
    } else {
      jobs = (data ?? []) as OutcomeJobRow[]
    }
  } catch (e) {
    warnings.push(`content_jobs query failed: ${e instanceof Error ? e.message : 'error'}`)
  }

  if (!jobs.length) {
    return { history: [], source: 'none', matchedJobs: 0, pages: 0, warnings }
  }

  // ── 2. Live GSC page positions ───────────────────────────────────────────
  let gscPages: GscPageRow[] = []
  let source: 'live' | 'none' = 'none'
  try {
    const access = await getGscAccess()
    const site = access?.siteUrl ?? process.env.GSC_SITE_URL ?? null
    if (!access?.accessToken || !site) {
      warnings.push('GSC not configured — no live rank outcomes (set GSC_SERVICE_ACCOUNT_JSON + GSC_SITE_URL)')
    } else {
      const endDate = new Date().toISOString().slice(0, 10)
      const startDate = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10)
      const res = await fetch(
        `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${access.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            startDate,
            endDate,
            dimensions: ['page'],
            rowLimit: 500,
          }),
          // Hard deadline — this fetch previously had NO abort, so a hanging
          // GSC request froze the Master Engine stream for minutes right at
          // the "Building outcome history from live GSC …" checkpoint, then
          // the serverless budget killed the whole run mid-stream.
          signal: AbortSignal.timeout(30_000),
        },
      )
      if (!res.ok) {
        warnings.push(`GSC page query failed (${res.status})`)
      } else {
        const json = (await res.json()) as { rows?: Array<{ keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number }> }
        gscPages = (json.rows ?? []).map((r) => ({
          url: (r.keys?.[0] ?? '').trim(),
          clicks: r.clicks ?? 0,
          impressions: r.impressions ?? 0,
          ctr: r.ctr ?? 0,
          position: r.position ?? 0,
        }))
        if (gscPages.length > 0) source = 'live'
        else warnings.push('GSC live query returned 0 page rows')
      }
    }
  } catch (e) {
    warnings.push(`GSC live query failed: ${e instanceof Error ? e.message : 'error'}`)
  }

  const history = buildOutcomeHistory(jobs, gscPages, { minImpressions: opts?.minImpressions })
  return {
    history,
    source,
    matchedJobs: history.length,
    pages: gscPages.length,
    warnings,
  }
}
