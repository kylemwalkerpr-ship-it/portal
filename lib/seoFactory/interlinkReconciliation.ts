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
 *     `source_url` AND an exact `source_job_id` job identity are even
 *     attempted — an applied row can never be touched, and a row without job
 *     identity is never auto-finalized;
 *   · a source is only attempted after a minimum age (deployment lag) and
 *     outside the re-verification cooldown, and the cooldown only applies to
 *     the CURRENT staged revision. Revision membership is decided by the
 *     durable nullable `staged_at` stamp written by staging/rebind — NOT by
 *     `updated_at`, which the BEFORE UPDATE trigger always pushes to now()
 *     and which therefore made the cooldown structurally dead (a current
 *     verdict can never satisfy `verified_at >= updated_at`). Min-age uses the
 *     same revision stamp; `updated_at` is only a documented fallback for
 *     legacy already-job-bound rows staged before `staged_at` existed. A stale
 *     timestamp from an older revision never suppresses a freshly
 *     rebound/re-staged job;
 *   · `verifyLiveUrl` is the ONLY gate — it is called with the EXACT staged
 *     `(source_url, source_job_id)` pair so a contracted job resolves its
 *     official deployment lineage (`reconcilePublicationDeployment`), and
 *     finalization runs only when that verification resolved ok=true AND the
 *     official deployment lineage is positively proven
 *     (`lineageVerified === true` + `publicationPhase === 'live_verified'`).
 *     An ok=true legacy/uncontracted health verdict is NOT enough: it is
 *     counted as `notDeploymentProven` and never creates applied truth;
 *   · a non-finalizing attempt stamps the additive nullable
 *     `verification_attempted_at` marker on the exact planned tuple (never a
 *     verdict/proof column), so repeated ok=false cannot monopolize every
 *     daily run and cannot fake verification truth;
 *   · the finalizer itself re-proves the exact live anchor href + live target
 *     and still updates `status='planned'` rows staged by that exact job only,
 *     so the pass is idempotent and can never downgrade an applied row;
 *   · a verifier throw (unavailable) or a DB-write failure is reported as a
 *     real error; an ok=false verdict (deployment not observable yet) is
 *     benign pending-deployment truth, never an error.
 *
 * No new public route, no new mutation surface, no broad production mutation:
 * the pass only ever verifies staged planned interlinks.
 */

import type { LiveVerifyInput, LiveVerifyResult } from './liveVerify'
import type {
  FinalizeStagedInterlinksResult,
  InterlinkVerificationAttemptResult,
} from './interlinkVerification'
// Single positive deployment-lineage gate shared with the ship-time background
// verifier and the admin verify-published route (dependency-free module, so
// there is no static import cycle with liveVerify's dynamic import of this
// reconciler's callers).
import { isDeploymentProvenLiveResult } from './deploymentProvenLive'
// Exact-job predicate shared with the staging writer (tiny dependency-free
// module — the reconciler must not pull the whole verification/link-audit
// import graph in just to normalise a UUID).
import { normalizeSourceJobId } from './sourceJobIdentity'

export { isDeploymentProvenLiveResult }

/**
 * Finite-number guard for the tuning envs. `Number('abc')` is NaN, and NaN
 * silently disabled the pass (e.g. `slice(0, NaN)` = zero work forever). A
 * non-finite / out-of-range value now falls back to the safe default instead
 * of quietly turning the seam off.
 */
export function resolveReconcileNumber(
  value: unknown,
  fallback: number,
  opts: { min?: number; integer?: boolean } = {},
): number {
  const raw = typeof value === 'string' ? value.trim() : value
  const numeric = typeof raw === 'number' ? raw : raw === '' || raw == null ? NaN : Number(raw)
  if (!Number.isFinite(numeric)) return fallback
  const floored = opts.integer ? Math.floor(numeric) : numeric
  return Math.max(opts.min ?? 0, floored)
}

/** Minimum age before a staged row may be re-verified (deployment lag). */
export const INTERLINK_RECONCILE_MIN_AGE_MS = resolveReconcileNumber(
  process.env.INTERLINK_RECONCILE_MIN_AGE_MS,
  30 * 60 * 1000,
)
/** Re-verification cooldown per source (one attempt per scheduled run). */
export const INTERLINK_RECONCILE_COOLDOWN_MS = resolveReconcileNumber(
  process.env.INTERLINK_RECONCILE_COOLDOWN_MS,
  20 * 60 * 60 * 1000,
)
/** Hard bound on sources verified per run (subrequest budget). */
export const INTERLINK_RECONCILE_MAX_SOURCES = resolveReconcileNumber(
  process.env.INTERLINK_RECONCILE_MAX_SOURCES,
  3,
  { min: 1, integer: true },
)
/** Hard bound on staged planned rows read per run. */
export const INTERLINK_RECONCILE_SCAN_LIMIT = resolveReconcileNumber(
  process.env.INTERLINK_RECONCILE_SCAN_LIMIT,
  200,
  { min: 1, integer: true },
)

export interface StagedInterlinkRow {
  id?: string | number
  sourceUrl?: string | null
  sourceJobId?: string | null
  verifiedAt?: string | null
  /** Durable non-proof attempt marker (verification_attempted_at). */
  attemptedAt?: string | null
  /** Durable staging/revision stamp (staged_at) — decides current revision. */
  stagedAt?: string | null
  updatedAt?: string | null
}

export interface StagedInterlinkSource {
  /** Exact durable source identity: the plan canonicalUrl recorded at staging. */
  sourceUrl: string
  /** Exact ship job identity (content_jobs.id) recorded at staging. */
  sourceJobId: string
  rows: number
  lastVerifiedAt: string | null
  /** Durable non-proof attempt marker of the current revision, if any. */
  lastAttemptedAt: string | null
  /** Durable staging/revision timestamp of the current revision, if any. */
  lastStagedAt: string | null
  lastWrittenAt: string | null
}

export interface InterlinkReconciliationDeps {
  /** Default: bounded SELECT of planned, source_url-bearing rows. */
  loadStagedRows?: (limit: number) => Promise<StagedInterlinkRow[]>
  /**
   * Default: cheap separate SCALAR count of jobless staged rows (planned +
   * durable source_url + `source_job_id IS NULL`). Telemetry only — a failure
   * is reported in `missingJobIdentityError`, never as a pass error.
   */
  countJoblessStagedRows?: () => Promise<{ count: number; error: string | null }>
  /** Default: the repository live-verification authority (`verifyLiveUrl`). */
  verify?: (input: LiveVerifyInput) => Promise<LiveVerifyResult>
  /** Default: the live-proof interlink finalizer. */
  finalize?: (input: {
    canonicalUrl: string
    sourceJobId?: string | null
  }) => Promise<FinalizeStagedInterlinksResult>
  /** Default: the additive non-proof attempt marker writer. */
  markAttempted?: (input: {
    sourceUrl: string
    sourceJobId: string
    now?: string
  }) => Promise<InterlinkVerificationAttemptResult>
  now?: () => number
}

export interface InterlinkReconciliationDetail {
  sourceUrl: string
  sourceJobId?: string
  verified: boolean
  applied: number
  /** Rows the finalizer actually checked for this source (0 = no-op). */
  checked?: number
  /**
   * Durable verdict/applied rows the finalizer actually WROTE for this source
   * (applied + absent + targetNotLive + unverifiable + sourceNotLive). 0 means
   * nothing was finalized even when `checked > 0` (fetch/write failure).
   */
  written?: number
  /** ok=true but not positively deployment-proven — no applied truth created. */
  notDeploymentProven?: boolean
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
  /** Suppressed by a verdict timestamp that belongs to the current revision. */
  skippedCooldown: number
  /** Suppressed by a failed-attempt marker of the current revision. */
  skippedAttemptCooldown: number
  skippedInvalidSource: number
  /**
   * Staged planned rows with a durable source_url but no valid exact
   * `source_job_id`. They are deliberately NOT auto-finalized: without exact
   * job identity the official deployment lineage cannot be proved, and the
   * scheduled seam must never fall back to legacy verification. Truthful
   * unresolved count, not an error.
   */
  skippedMissingJobIdentity: number
  /**
   * TRUTHFUL countable of the OTHER unresolved class the bounded exact-job
   * scan never even reads: planned rows that carry a durable `source_url` but
   * `source_job_id IS NULL` (jobless staging — e.g. a ship that had no durable
   * job id at staging time). They can never be auto-finalized (no job identity
   * ⇒ no official deployment lineage), and they must NOT consume bounded scan
   * slots — so they are counted by their own cheap scalar query instead of
   * disappearing from telemetry.
   */
  missingJobIdentityRows: number
  /** The scalar jobless-count probe failed (count is then NOT a truth). */
  missingJobIdentityError: string | null
  /** Sources whose live verification resolved ok=true. */
  verifiedLive: number
  /**
   * Sources whose live verification resolved ok=true WITHOUT positive official
   * deployment-lineage proof (legacy/uncontracted health path, or a contracted
   * job whose lineage was not verified). They are deliberately NOT finalized:
   * exact job identity is necessary but not sufficient. Truthful unresolved
   * count, not an error.
   */
  notDeploymentProven: number
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
  /** Attempt-marker write failures (never a verification-proof write). */
  attemptMarkerErrors: number
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

// `isDeploymentProvenLiveResult` (re-exported above) is the ONLY verdict gate
// for scheduled auto-finalization: a live verdict must positively prove the
// official deployment lineage of the exact ship job. `ok` alone is not enough
// — a content_jobs row with no contract_id takes verifyLiveUrl's legacy health
// path (`lineageVerified` null, `publicationPhase` null), and a contracted job
// whose deployment lineage could not be proven must not create applied truth
// either.

/** Group key for exact (source_url, source_job_id) identity. */
function sourceJobKey(sourceUrl: string, sourceJobId: string): string {
  return `${sourceUrl}\u0000${sourceJobId}`
}

/**
 * P6 columns whose absence is a known, documented pre-migration state.
 * Coverage must stay narrow: a generic "does not exist" DB failure (a dropped
 * FK target, a bad join, a typo'd column anywhere else) is a REAL error and
 * must never be silently converted into a green `unavailable` run.
 */
const P6_SCHEMA_COLUMN_NAMES = [
  'source_url',
  'source_job_id',
  'staged_at',
  'verification_state',
  'verified_at',
  'verification_evidence',
  'applied_at',
  'verification_attempted_at',
] as const

/**
 * A missing table/column means the additive P6 migration has not been applied
 * yet. That is a known, documented pre-migration state (the seam is inert and
 * reports it) — never a fake "nothing to do" and never a red daily run.
 *
 * Signature-narrowed: the message must both (a) be a PostgREST schema-cache
 * miss or a Postgres undefined-column/undefined-relation error, and (b) name
 * the additive `seo_interlinks` relation/table itself (for a relation miss) or
 * one of the actual P6 additive columns (for a column miss). Anything else —
 * including a bare "does not exist", a different relation, or a NON-P6 column
 * of `seo_interlinks` — stays a real error.
 */
export function isSchemaUnavailable(message: string): boolean {
  const msg = String(message || '')
  if (!msg) return false
  // The message must actually BE a missing-object report (schema-cache miss /
  // undefined relation / undefined column). A generic DB failure that merely
  // contains the word "column" is not a pre-migration signature.
  if (!/could not find|not find|does not exist|undefined/i.test(msg)) return false
  // (a) the additive P6 relation itself is missing — the ONLY relation-miss
  //     signature that is a known pre-migration state;
  // (b) a P6 additive column is reported missing.
  // Anything else (a different table, a non-P6 column of `seo_interlinks`, a
  // permission/RLS error) stays a REAL error.
  const relationMiss =
    /\bseo_interlinks\b/i.test(msg) && /schema cache|\brelation\b|\btable\b/i.test(msg)
  if (relationMiss) return true
  return P6_SCHEMA_COLUMN_NAMES.some((name) => new RegExp(`\\b${name}\\b`, 'i').test(msg))
}

/**
 * Bounded default loader. `source_url is not null` is filtered in the query so
 * the enormous unstaged planner backlog can never starve the staged rows out
 * of the scan window. `source_job_id is not null` is filtered too: jobless
 * historical/backlog rows can never be auto-finalized, so they must not occupy
 * the bounded window either (they stay unresolved/manual and are never
 * verified). Rows whose `source_job_id` is not a valid UUID are still returned
 * by this predicate and skipped/counted server-side, never verified.
 *
 * `staged_at` is the revision stamp. If that additive column alone is not
 * deployed yet (a partial pre-migration state where source_job_id exists), the
 * read falls back to the legacy column set with an explicit warning; the
 * reconciler then uses the documented `updated_at` fallback for revision
 * membership instead of pretending no staged row exists.
 */
async function defaultLoadStagedRows(limit: number): Promise<StagedInterlinkRow[]> {
  const { createSupabaseAdminClient } = await import('@/lib/supabase')
  const supabase = createSupabaseAdminClient()
  const baseColumns = 'id,source_url,source_job_id,status,verified_at,verification_attempted_at,updated_at'
  let stagedAtAvailable = true
  // Normalise both the current and the legacy column-set reads to the same
  // untyped record shape: the untyped client's failed-query data union is not
  // directly castable to a record array, and the legacy SELECT does not even
  // select `staged_at`. The revision stamp is still read ONLY when it is
  // available; the fallback leaves `stagedAt: null` so the documented
  // `updated_at` revision fallback applies instead of a fabricated stamp.
  const toRecords = (data: unknown): Array<Record<string, unknown>> =>
    Array.isArray(data)
      ? data.map((row) => (row && typeof row === 'object' ? (row as Record<string, unknown>) : {}))
      : []
  const primary = await supabase
    .from('seo_interlinks')
    .select(`${baseColumns},staged_at`)
    .eq('status', 'planned')
    .not('source_url', 'is', null)
    .not('source_job_id', 'is', null)
    .order('updated_at', { ascending: true })
    .limit(limit)
  let rows = toRecords(primary.data)
  let error = primary.error
  if (error && /staged_at/i.test(String(error.message || ''))) {
    const message = String(error.message || 'staged_at unavailable')
    console.warn(
      '[interlinkReconciliation] staged_at column unavailable (P6 migration not fully applied yet) — revision membership falls back to updated_at for these legacy job-bound rows:',
      message,
    )
    stagedAtAvailable = false
    const legacy = await supabase
      .from('seo_interlinks')
      .select(baseColumns)
      .eq('status', 'planned')
      .not('source_url', 'is', null)
      .not('source_job_id', 'is', null)
      .order('updated_at', { ascending: true })
      .limit(limit)
    rows = toRecords(legacy.data)
    error = legacy.error
  }
  if (error) throw new Error(`staged interlink read failed: ${error.message}`)
  return rows.map((row) => ({
    id: row.id as string | number | undefined,
    sourceUrl: (row.source_url as string | null) ?? null,
    sourceJobId: (row.source_job_id as string | null) ?? null,
    verifiedAt: (row.verified_at as string | null) ?? null,
    attemptedAt: (row.verification_attempted_at as string | null) ?? null,
    stagedAt: stagedAtAvailable ? ((row.staged_at as string | null) ?? null) : null,
    updatedAt: (row.updated_at as string | null) ?? null,
  }))
}

/**
 * Cheap SEPARATE scalar probe for the unresolved class the bounded exact-job
 * scan never reads: planned rows with a durable `source_url` and
 * `source_job_id IS NULL` (jobless staging). They can never be auto-finalized
 * — without exact job identity the official deployment lineage cannot be
 * proved — but they must be COUNTED truthfully, and a scalar
 * `count: 'exact'` head query keeps them from consuming bounded scan slots.
 *
 * Never throws. A probe failure is returned as an explicit error string so the
 * count is never presented as if it were a truth.
 */
async function defaultCountJoblessStagedRows(): Promise<{ count: number; error: string | null }> {
  try {
    const { createSupabaseAdminClient } = await import('@/lib/supabase')
    const supabase = createSupabaseAdminClient()
    const { count, error } = await supabase
      .from('seo_interlinks')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'planned')
      .not('source_url', 'is', null)
      .is('source_job_id', null)
    if (error) {
      return { count: 0, error: String(error.message || 'jobless interlink count failed').slice(0, 300) }
    }
    return { count: typeof count === 'number' ? count : 0, error: null }
  } catch (error) {
    return { count: 0, error: errorMessage(error).slice(0, 300) }
  }
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
  // Caller-supplied overrides go through the same finite guard as the envs: a
  // NaN option must never silently disable the pass.
  const maxSources = Math.max(
    1,
    resolveReconcileNumber(opts.maxSources, INTERLINK_RECONCILE_MAX_SOURCES, { min: 1, integer: true }),
  )
  const minAgeMs = resolveReconcileNumber(opts.minAgeMs, INTERLINK_RECONCILE_MIN_AGE_MS)
  const cooldownMs = resolveReconcileNumber(opts.cooldownMs, INTERLINK_RECONCILE_COOLDOWN_MS)
  const scanLimit = Math.max(
    1,
    resolveReconcileNumber(opts.scanLimit, INTERLINK_RECONCILE_SCAN_LIMIT, { min: 1, integer: true }),
  )

  const summary: InterlinkReconciliationSummary = {
    scannedRows: 0,
    stagedSources: 0,
    eligibleSources: 0,
    unavailable: false,
    unavailableReason: null,
    skippedYoung: 0,
    skippedCooldown: 0,
    skippedAttemptCooldown: 0,
    skippedInvalidSource: 0,
    skippedMissingJobIdentity: 0,
    missingJobIdentityRows: 0,
    missingJobIdentityError: null,
    verifiedLive: 0,
    notDeploymentProven: 0,
    verificationFailed: 0,
    verificationUnavailable: 0,
    finalized: 0,
    applied: 0,
    plannedVerdicts: 0,
    dbErrors: 0,
    attemptMarkerErrors: 0,
    remaining: 0,
    ok: true,
    errors: [],
    details: [],
  }

  // Telemetry probe FIRST: jobless staged rows are never read by the bounded
  // exact-job scan, so their truthful count comes from its own cheap scalar
  // query. A probe failure is explicit (`missingJobIdentityError`) and cannot
  // turn the verification pass red or fake a zero.
  try {
    const jobless = await (deps.countJoblessStagedRows || defaultCountJoblessStagedRows)()
    summary.missingJobIdentityRows = typeof jobless?.count === 'number' ? jobless.count : 0
    summary.missingJobIdentityError = jobless?.error
      ? String(jobless.error).slice(0, 300)
      : null
  } catch (error) {
    summary.missingJobIdentityRows = 0
    summary.missingJobIdentityError = errorMessage(error).slice(0, 300)
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
    {
      sourceUrl: string
      sourceJobId: string
      rows: number
      lastVerifiedAt: number | null
      lastAttemptedAt: number | null
      lastStagedAt: number | null
      lastWrittenAt: number | null
    }
  >()
  for (const row of rows) {
    const sourceUrl = String(row.sourceUrl || '').trim()
    if (!isAbsoluteHttpUrl(sourceUrl)) {
      summary.skippedInvalidSource += 1
      continue
    }
    // Exact job identity is required for scheduled auto-finalization. Without
    // it the official deployment lineage cannot be proved for the exact job,
    // so the row is skipped as unresolved — never verified/finalized through
    // the legacy path.
    const sourceJobId = normalizeSourceJobId(row.sourceJobId)
    if (!sourceJobId) {
      summary.skippedMissingJobIdentity += 1
      continue
    }
    const key = sourceJobKey(sourceUrl, sourceJobId)
    const group = groups.get(key) || {
      sourceUrl,
      sourceJobId,
      rows: 0,
      lastVerifiedAt: null,
      lastAttemptedAt: null,
      lastStagedAt: null,
      lastWrittenAt: null,
    }
    group.rows += 1
    const verifiedAt = parseTime(row.verifiedAt)
    if (verifiedAt != null && (group.lastVerifiedAt == null || verifiedAt > group.lastVerifiedAt)) {
      group.lastVerifiedAt = verifiedAt
    }
    const attemptedAt = parseTime(row.attemptedAt)
    if (attemptedAt != null && (group.lastAttemptedAt == null || attemptedAt > group.lastAttemptedAt)) {
      group.lastAttemptedAt = attemptedAt
    }
    const stagedAt = parseTime(row.stagedAt)
    if (stagedAt != null && (group.lastStagedAt == null || stagedAt > group.lastStagedAt)) {
      group.lastStagedAt = stagedAt
    }
    const writtenAt = parseTime(row.updatedAt)
    if (writtenAt != null && (group.lastWrittenAt == null || writtenAt > group.lastWrittenAt)) {
      group.lastWrittenAt = writtenAt
    }
    groups.set(key, group)
  }
  summary.stagedSources = groups.size

  const eligible: StagedInterlinkSource[] = []
  for (const group of groups.values()) {
    // Current-revision membership: the durable staged_at stamp wins. The
    // updated_at fallback exists ONLY for legacy rows already carrying exact
    // job identity that were staged before staged_at was deployed (the BEFORE
    // UPDATE trigger always makes updated_at >= any app verdict, which is
    // exactly why it cannot be used when a real revision stamp exists).
    const revisionAt = group.lastStagedAt ?? group.lastWrittenAt
    if (revisionAt != null && now - revisionAt < minAgeMs) {
      summary.skippedYoung += 1
      continue
    }
    // A cooldown may only reflect the CURRENT staged revision. If the row was
    // re-staged/rebound after the last verdict/attempt (a new staged_at), the
    // old timestamp belongs to a previous revision and must not suppress this
    // one.
    const verificationIsCurrent =
      group.lastVerifiedAt != null &&
      (revisionAt == null || group.lastVerifiedAt >= revisionAt)
    if (verificationIsCurrent && now - (group.lastVerifiedAt as number) < cooldownMs) {
      summary.skippedCooldown += 1
      continue
    }
    const attemptIsCurrent =
      group.lastAttemptedAt != null &&
      (revisionAt == null || group.lastAttemptedAt >= revisionAt)
    if (attemptIsCurrent && now - (group.lastAttemptedAt as number) < cooldownMs) {
      summary.skippedAttemptCooldown += 1
      continue
    }
    eligible.push({
      sourceUrl: group.sourceUrl,
      sourceJobId: group.sourceJobId,
      rows: group.rows,
      lastVerifiedAt: group.lastVerifiedAt != null ? new Date(group.lastVerifiedAt).toISOString() : null,
      lastAttemptedAt: group.lastAttemptedAt != null ? new Date(group.lastAttemptedAt).toISOString() : null,
      lastStagedAt: group.lastStagedAt != null ? new Date(group.lastStagedAt).toISOString() : null,
      lastWrittenAt: group.lastWrittenAt != null ? new Date(group.lastWrittenAt).toISOString() : null,
    })
  }
  // Deterministic stalest-first order so repeated runs make progress. Sources
  // that were never attempted sort first; already-attempted sources sort by
  // their oldest attempt, then by oldest write. A permanently non-ok source
  // therefore moves to the back of the queue after each attempt and can never
  // monopolize the bounded batch.
  eligible.sort((a, b) => {
    const byAttempt = String(a.lastAttemptedAt || '').localeCompare(String(b.lastAttemptedAt || ''))
    if (byAttempt !== 0) return byAttempt
    const byWrite = String(a.lastWrittenAt || '').localeCompare(String(b.lastWrittenAt || ''))
    if (byWrite !== 0) return byWrite
    const byUrl = a.sourceUrl.localeCompare(b.sourceUrl)
    return byUrl !== 0 ? byUrl : a.sourceJobId.localeCompare(b.sourceJobId)
  })
  summary.eligibleSources = eligible.length

  const batch = eligible.slice(0, maxSources)
  summary.remaining = Math.max(0, eligible.length - batch.length)
  if (!batch.length) return summary

  const [
    { verifyLiveUrl },
    { finalizeStagedInterlinksForLiveSource, markInterlinkVerificationAttempt },
  ] = await Promise.all([
    import('./liveVerify'),
    import('./interlinkVerification'),
  ])
  const verify = deps.verify || verifyLiveUrl
  const finalize = deps.finalize || finalizeStagedInterlinksForLiveSource
  const markAttempted = deps.markAttempted || markInterlinkVerificationAttempt

  /**
   * Durable bounded-retry marker for a non-finalizing attempt. Never writes a
   * verdict/proof column, and a marker failure is a truthful error (it is a DB
   * write failure, not a verification result).
   */
  const recordAttempt = async (source: StagedInterlinkSource): Promise<void> => {
    try {
      const marked = await markAttempted({
        sourceUrl: source.sourceUrl,
        sourceJobId: source.sourceJobId,
        now: new Date(now).toISOString(),
      })
      if (marked?.error) {
        summary.attemptMarkerErrors += 1
        summary.errors.push(
          `interlink attempt marker failed for ${source.sourceUrl} (job ${source.sourceJobId}): ${marked.error}`,
        )
      }
    } catch (error) {
      summary.attemptMarkerErrors += 1
      summary.errors.push(
        `interlink attempt marker failed for ${source.sourceUrl} (job ${source.sourceJobId}): ${errorMessage(error).slice(0, 200)}`,
      )
    }
  }

  for (const source of batch) {
    let verification: LiveVerifyResult
    try {
      // The exact job id is mandatory here: verifyLiveUrl uses it to resolve
      // the official publication deployment for that ship job. Calling with
      // the canonicalUrl alone would silently land on the legacy/uncontracted
      // path, which must never drive scheduled auto-finalization.
      verification = await verify({ canonicalUrl: source.sourceUrl, jobId: source.sourceJobId })
    } catch (error) {
      summary.verificationUnavailable += 1
      summary.errors.push(
        `live verification unavailable for ${source.sourceUrl} (job ${source.sourceJobId}): ${errorMessage(error).slice(0, 200)}`,
      )
      summary.details.push({
        sourceUrl: source.sourceUrl,
        sourceJobId: source.sourceJobId,
        verified: false,
        applied: 0,
        error: 'verifier unavailable',
      })
      // The attempt happened (and the verifier is the repository authority):
      // bound the durable retry so a permanently unavailable verifier cannot
      // monopolize every daily batch. The real error above is still reported.
      await recordAttempt(source)
      continue
    }
    // Fail closed: an ok=false verdict (deployment not observable yet) is
    // benign pending truth, and it is never finalized.
    if (!verification?.ok) {
      summary.verificationFailed += 1
      summary.details.push({
        sourceUrl: source.sourceUrl,
        sourceJobId: source.sourceJobId,
        verified: false,
        applied: 0,
      })
      await recordAttempt(source)
      continue
    }
    // ok=true is NECESSARY BUT NOT SUFFICIENT. Only a positively proven
    // official deployment lineage (exact job → deployment commit) may create
    // applied truth. The legacy/uncontracted health path (no contract_id) can
    // report ok=true while proving nothing about the deployment, so it is
    // surfaced as unresolved and never finalized.
    if (!isDeploymentProvenLiveResult(verification)) {
      summary.notDeploymentProven += 1
      summary.details.push({
        sourceUrl: source.sourceUrl,
        sourceJobId: source.sourceJobId,
        verified: false,
        applied: 0,
        notDeploymentProven: true,
      })
      await recordAttempt(source)
      continue
    }
    summary.verifiedLive += 1

    let outcome: FinalizeStagedInterlinksResult
    try {
      // Job-bound finalization: only rows staged by this exact ship job are
      // eligible for the applied transition.
      outcome = await finalize({ canonicalUrl: source.sourceUrl, sourceJobId: source.sourceJobId })
    } catch (error) {
      summary.errors.push(
        `interlink finalization failed for ${source.sourceUrl} (job ${source.sourceJobId}): ${errorMessage(error).slice(0, 200)}`,
      )
      summary.details.push({
        sourceUrl: source.sourceUrl,
        sourceJobId: source.sourceJobId,
        verified: true,
        applied: 0,
        error: 'finalization threw',
      })
      continue
    }
    // `finalized` counts a source only when the finalizer actually WROTE a
    // durable verdict/applied outcome (.applied + .absent + .targetNotLive +
    // .unverifiable + .sourceNotLive are all written-row buckets). `checked`
    // alone is NOT proof of a write: a source fetch failure or a DB-write
    // failure can check rows and write nothing — that is surfaced as
    // checked > 0 / written 0 and must never inflate the finalized count into
    // fake progress.
    const checked = outcome?.checked || 0
    const written =
      (outcome?.applied || 0) +
      (outcome?.absent || 0) +
      (outcome?.targetNotLive || 0) +
      (outcome?.unverifiable || 0) +
      (outcome?.sourceNotLive || 0)
    if (written > 0) summary.finalized += 1
    summary.applied += outcome?.applied || 0
    summary.plannedVerdicts +=
      (outcome?.absent || 0) +
      (outcome?.targetNotLive || 0) +
      (outcome?.unverifiable || 0) +
      (outcome?.sourceNotLive || 0)
    summary.dbErrors += outcome?.dbErrors || 0
    if (outcome?.error) {
      summary.errors.push(
        `interlink finalization error for ${source.sourceUrl} (job ${source.sourceJobId}): ${outcome.error}`,
      )
    }
    summary.details.push({
      sourceUrl: source.sourceUrl,
      sourceJobId: source.sourceJobId,
      verified: true,
      checked,
      written,
      applied: outcome?.applied || 0,
      ...(outcome?.error ? { error: outcome.error } : {}),
    })
  }

  summary.ok = summary.errors.length === 0
  return summary
}
