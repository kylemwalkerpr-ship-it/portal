/**
 * lib/seoFactory/interlinkReconciliation.ts
 *
 * P6 — durable post-deploy re-verification/finalization seam.
 *
 * Why this exists: a ship stages `seo_interlinks` rows and then launches a
 * best-effort background `verifyLiveUrl`. That single serverless
 * fire-and-forget invocation is NOT a durable lifecycle seam — the production
 * deployment is usually not observable yet when it runs, and a dropped
 * invocation leaves staged rows `planned` forever.
 *
 * This module is the bounded, server-side reconciliation pass wired to the
 * EXISTING scheduled lifecycle surface (`POST /api/cron/seo-engine-daily`,
 * CRON_SECRET-only, driven by `.github/workflows/seo-engine-daily.yml`). Each
 * run re-verifies at most a few already-staged sources:
 *
 *   · only rows that are `status = 'planned'` AND carry a durable
 *     `source_url` are even read — an applied row can never be touched;
 *   · a source is only attempted after a minimum age (deployment lag) and
 *     outside the re-verification cooldown;
 *   · `verifyLiveUrl` is the ONLY gate — finalization runs for the EXACT
 *     staged `source_url` and only when that verification resolved ok=true;
 *   · the finalizer itself re-proves the exact live anchor href + live target
 *     and still updates `status='planned'` rows only, so the pass is
 *     idempotent and can never downgrade an applied row;
 *   · a verifier throw (unavailable) or a DB-write failure is reported as a
 *     real error; an ok=false verdict (deployment not observable yet) is
 *     benign pending-deployment truth, never an error.
 *
 * No new public route, no new mutation surface, no broad production mutation:
 * the pass only ever verifies staged planned interlinks.
 */

import type { LiveVerifyInput, LiveVerifyResult } from './liveVerify'
import type { FinalizeStagedInterlinksResult } from './interlinkVerification'

/** Minimum age before a staged row may be re-verified (deployment lag). */
export const INTERLINK_RECONCILE_MIN_AGE_MS = Number(
  process.env.INTERLINK_RECONCILE_MIN_AGE_MS || 30 * 60 * 1000,
)
/** Re-verification cooldown per source (one attempt per scheduled run). */
export const INTERLINK_RECONCILE_COOLDOWN_MS = Number(
  process.env.INTERLINK_RECONCILE_COOLDOWN_MS || 20 * 60 * 60 * 1000,
)
/** Hard bound on sources verified per run (subrequest budget). */
export const INTERLINK_RECONCILE_MAX_SOURCES = Number(
  process.env.INTERLINK_RECONCILE_MAX_SOURCES || 3,
)
/** Hard bound on staged planned rows read per run. */
export const INTERLINK_RECONCILE_SCAN_LIMIT = Number(
  process.env.INTERLINK_RECONCILE_SCAN_LIMIT || 200,
)

export interface StagedInterlinkRow {
  id?: string | number
  sourceUrl?: string | null
  verifiedAt?: string | null
  updatedAt?: string | null
}

export interface StagedInterlinkSource {
  /** Exact durable source identity: the plan canonicalUrl recorded at staging. */
  sourceUrl: string
  rows: number
  lastVerifiedAt: string | null
  lastWrittenAt: string | null
}

export interface InterlinkReconciliationDeps {
  /** Default: bounded SELECT of planned, source_url-bearing rows. */
  loadStagedRows?: (limit: number) => Promise<StagedInterlinkRow[]>
  /** Default: the repository live-verification authority (`verifyLiveUrl`). */
  verify?: (input: LiveVerifyInput) => Promise<LiveVerifyResult>
  /** Default: the live-proof interlink finalizer. */
  finalize?: (input: { canonicalUrl: string }) => Promise<FinalizeStagedInterlinksResult>
  now?: () => number
}

export interface InterlinkReconciliationDetail {
  sourceUrl: string
  verified: boolean
  applied: number
  error?: string
}

export interface InterlinkReconciliationSummary {
  scannedRows: number
  stagedSources: number
  eligibleSources: number
  /**
   * True when the verification-truth columns are not deployed yet (P6
   * migration not applied). The seam is inert and says so — the daily run is
   * not turned red by a known pre-migration state.
   */
  unavailable: boolean
  unavailableReason: string | null
  skippedYoung: number
  skippedCooldown: number
  skippedInvalidSource: number
  /** Sources whose live verification resolved ok=true. */
  verifiedLive: number
  /** Sources verified but not yet ok (deployment not observable) — benign. */
  verificationFailed: number
  /** Sources where the verifier threw (unavailable) — a real error. */
  verificationUnavailable: number
  finalized: number
  applied: number
  /** Non-applied durable verdicts written (absent/target_not_live/unverifiable). */
  plannedVerdicts: number
  /** DB write failures surfaced by the finalizer. */
  dbErrors: number
  /** Eligible sources not attempted this run (bounded work). */
  remaining: number
  ok: boolean
  errors: string[]
  details: InterlinkReconciliationDetail[]
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || 'unknown error')
}

function parseTime(value: unknown): number | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const time = Date.parse(value)
  return Number.isFinite(time) ? time : null
}

function isAbsoluteHttpUrl(value: string): boolean {
  return /^https?:\/\/\S+$/i.test(value)
}

/**
 * A missing table/column means the additive P6 migration has not been applied
 * yet. That is a known, documented pre-migration state (the seam is inert and
 * reports it) — never a fake "nothing to do" and never a red daily run.
 */
function isSchemaUnavailable(message: string): boolean {
  return /(column .* does not exist|relation .* does not exist|schema cache|does not exist)/i.test(message)
}

/**
 * Bounded default loader. `source_url is not null` is filtered in the query so
 * the enormous unstaged planner backlog can never starve the staged rows out
 * of the scan window.
 */
async function defaultLoadStagedRows(limit: number): Promise<StagedInterlinkRow[]> {
  const { createSupabaseAdminClient } = await import('@/lib/supabase')
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('seo_interlinks')
    .select('id,source_url,status,verified_at,updated_at')
    .eq('status', 'planned')
    .not('source_url', 'is', null)
    .order('updated_at', { ascending: true })
    .limit(limit)
  if (error) throw new Error(`staged interlink read failed: ${error.message}`)
  const rows = (data as Array<Record<string, unknown>> | null) || []
  return rows.map((row) => ({
    id: row.id as string | number | undefined,
    sourceUrl: (row.source_url as string | null) ?? null,
    verifiedAt: (row.verified_at as string | null) ?? null,
    updatedAt: (row.updated_at as string | null) ?? null,
  }))
}

export interface InterlinkReconcileOptions {
  maxSources?: number
  minAgeMs?: number
  cooldownMs?: number
  scanLimit?: number
}

/**
 * One bounded reconciliation pass. Never throws: a loader/verifier/finalizer
 * failure is returned in `errors` (truthful, zero writes for that source).
 */
export async function reconcileStagedInterlinks(
  deps: InterlinkReconciliationDeps = {},
  opts: InterlinkReconcileOptions = {},
): Promise<InterlinkReconciliationSummary> {
  const now = deps.now ? deps.now() : Date.now()
  const maxSources = Math.max(1, Math.floor(opts.maxSources ?? INTERLINK_RECONCILE_MAX_SOURCES))
  const minAgeMs = Math.max(0, opts.minAgeMs ?? INTERLINK_RECONCILE_MIN_AGE_MS)
  const cooldownMs = Math.max(0, opts.cooldownMs ?? INTERLINK_RECONCILE_COOLDOWN_MS)
  const scanLimit = Math.max(1, Math.floor(opts.scanLimit ?? INTERLINK_RECONCILE_SCAN_LIMIT))

  const summary: InterlinkReconciliationSummary = {
    scannedRows: 0,
    stagedSources: 0,
    eligibleSources: 0,
    unavailable: false,
    unavailableReason: null,
    skippedYoung: 0,
    skippedCooldown: 0,
    skippedInvalidSource: 0,
    verifiedLive: 0,
    verificationFailed: 0,
    verificationUnavailable: 0,
    finalized: 0,
    applied: 0,
    plannedVerdicts: 0,
    dbErrors: 0,
    remaining: 0,
    ok: true,
    errors: [],
    details: [],
  }

  let rows: StagedInterlinkRow[]
  try {
    rows = await (deps.loadStagedRows || defaultLoadStagedRows)(scanLimit)
  } catch (error) {
    const message = errorMessage(error).slice(0, 300)
    if (isSchemaUnavailable(message)) {
      summary.unavailable = true
      summary.unavailableReason = message
      return summary
    }
    summary.errors.push(`staged interlink load failed: ${message}`)
    summary.ok = false
    return summary
  }
  summary.scannedRows = rows.length

  const groups = new Map<
    string,
    { rows: number; lastVerifiedAt: number | null; lastWrittenAt: number | null }
  >()
  for (const row of rows) {
    const sourceUrl = String(row.sourceUrl || '').trim()
    if (!isAbsoluteHttpUrl(sourceUrl)) {
      summary.skippedInvalidSource += 1
      continue
    }
    const group = groups.get(sourceUrl) || { rows: 0, lastVerifiedAt: null, lastWrittenAt: null }
    group.rows += 1
    const verifiedAt = parseTime(row.verifiedAt)
    if (verifiedAt != null && (group.lastVerifiedAt == null || verifiedAt > group.lastVerifiedAt)) {
      group.lastVerifiedAt = verifiedAt
    }
    const writtenAt = parseTime(row.updatedAt)
    if (writtenAt != null && (group.lastWrittenAt == null || writtenAt > group.lastWrittenAt)) {
      group.lastWrittenAt = writtenAt
    }
    groups.set(sourceUrl, group)
  }
  summary.stagedSources = groups.size

  const eligible: StagedInterlinkSource[] = []
  for (const [sourceUrl, group] of groups) {
    if (group.lastWrittenAt != null && now - group.lastWrittenAt < minAgeMs) {
      summary.skippedYoung += 1
      continue
    }
    if (group.lastVerifiedAt != null && now - group.lastVerifiedAt < cooldownMs) {
      summary.skippedCooldown += 1
      continue
    }
    eligible.push({
      sourceUrl,
      rows: group.rows,
      lastVerifiedAt: group.lastVerifiedAt != null ? new Date(group.lastVerifiedAt).toISOString() : null,
      lastWrittenAt: group.lastWrittenAt != null ? new Date(group.lastWrittenAt).toISOString() : null,
    })
  }
  // Deterministic stalest-first order so repeated runs make progress.
  eligible.sort((a, b) => {
    const byWrite = String(a.lastWrittenAt || '').localeCompare(String(b.lastWrittenAt || ''))
    return byWrite !== 0 ? byWrite : a.sourceUrl.localeCompare(b.sourceUrl)
  })
  summary.eligibleSources = eligible.length

  const batch = eligible.slice(0, maxSources)
  summary.remaining = Math.max(0, eligible.length - batch.length)
  if (!batch.length) return summary

  const [{ verifyLiveUrl }, { finalizeStagedInterlinksForLiveSource }] = await Promise.all([
    import('./liveVerify'),
    import('./interlinkVerification'),
  ])
  const verify = deps.verify || verifyLiveUrl
  const finalize = deps.finalize || finalizeStagedInterlinksForLiveSource

  for (const source of batch) {
    let verification: LiveVerifyResult
    try {
      verification = await verify({ canonicalUrl: source.sourceUrl })
    } catch (error) {
      summary.verificationUnavailable += 1
      summary.errors.push(
        `live verification unavailable for ${source.sourceUrl}: ${errorMessage(error).slice(0, 200)}`,
      )
      summary.details.push({ sourceUrl: source.sourceUrl, verified: false, applied: 0, error: 'verifier unavailable' })
      continue
    }
    // Fail closed: only an explicit ok=true verdict may run finalization.
    if (!verification?.ok) {
      summary.verificationFailed += 1
      summary.details.push({ sourceUrl: source.sourceUrl, verified: false, applied: 0 })
      continue
    }
    summary.verifiedLive += 1

    let outcome: FinalizeStagedInterlinksResult
    try {
      outcome = await finalize({ canonicalUrl: source.sourceUrl })
    } catch (error) {
      summary.errors.push(
        `interlink finalization failed for ${source.sourceUrl}: ${errorMessage(error).slice(0, 200)}`,
      )
      summary.details.push({ sourceUrl: source.sourceUrl, verified: true, applied: 0, error: 'finalization threw' })
      continue
    }
    summary.finalized += 1
    summary.applied += outcome?.applied || 0
    summary.plannedVerdicts +=
      (outcome?.absent || 0) +
      (outcome?.targetNotLive || 0) +
      (outcome?.unverifiable || 0) +
      (outcome?.sourceNotLive || 0)
    summary.dbErrors += outcome?.dbErrors || 0
    if (outcome?.error) {
      summary.errors.push(`interlink finalization error for ${source.sourceUrl}: ${outcome.error}`)
    }
    summary.details.push({
      sourceUrl: source.sourceUrl,
      verified: true,
      applied: outcome?.applied || 0,
      ...(outcome?.error ? { error: outcome.error } : {}),
    })
  }

  summary.ok = summary.errors.length === 0
  return summary
}

