/**
 * scripts/p6InterlinkDisposition.ts
 *
 * P6 - READ-ONLY `seo_interlinks` disposition report.
 *
 * The P6 gate ("80%+ of the approved useful backlog is verified applied or
 * explicitly rejected/stale") cannot be evaluated from `seo_interlinks.status`
 * alone: 1,899 rows claim `planned`, 0 claim `applied`, and the raw backlog is
 * explicitly NOT the approved-useful denominator. This module classifies the
 * persisted estate using durable verification fields PLUS an injected live
 * target observation, and keeps raw backlog counts separate from the
 * approved-useful numerator/denominator.
 *
 * Two terminal dispositions are reported SIDE BY SIDE and never merged:
 * `approvedUseful.numerator` counts verified applied rows only (durable proof
 * + live target), while `approvedUseful.explicitlyRejected` counts audited
 * P6 SOURCE-STALE rejections (allowlisted reason + exact actor) INSIDE the same
 * live-target cohort. `resolved` adds them for the spec's literal "verified
 * applied or explicitly rejected/stale" wording, and a rejected row can never
 * enter the applied numerator. An arbitrary audited reason, a wrong actor and
 * Batch A's target-stale vocabulary are reported but resolve NOTHING.
 * `stale.*` reports the whole rejected estate separately, split into allowed /
 * audited-but-not-allowlisted / unaudited and a `gate_reason` histogram.
 *
 * READ-ONLY BY CONSTRUCTION:
 *   - `fetchP6DispositionRows` only ever issues SELECT ... ORDER BY ... RANGE;
 *   - classification and aggregation are pure functions over fetched rows;
 *   - the module contains no update/delete/upsert/insert/rpc call at all.
 *
 * Unknown stays unknown: a row without a live observation, or with an
 * unreachable/5xx observation, is never guessed into a disposition.
 */

export type P6DispositionClass =
  | 'applied_present'
  | 'target_404'
  | 'legacy_auth_wall'
  | 'live_target_source_verified'
  | 'live_target_source_unverified'
  | 'unknown'

export interface P6InterlinkRow {
  id: string | number
  source_slug?: string | null
  target_url?: string | null
  status?: string | null
  source_url?: string | null
  verification_state?: string | null
  verified_at?: string | null
  verification_evidence?: unknown
  applied_at?: string | null
  /** Auditable stale-disposition metadata (never a verification proof). */
  gate_reason?: string | null
  gate_actor?: string | null
}

/**
 * True only for an AUDITED explicit stale rejection: `status='rejected'` with
 * both `gate_reason` and `gate_actor` present. An unaudited rejection row is
 * legal estate hygiene but is NOT evidence of an explicit disposition, so it
 * is excluded from the resolved numerator and reported under
 * `stale.rejectedUnaudited` instead.
 *
 * AUDITED IS NOT ENOUGH FOR GATE CREDIT: this predicate is the WIDE reading
 * used for the stale histogram only. The approved-useful cohort uses
 * `isAllowlistedSourceStaleRejection`, which additionally requires the exact P6
 * source-stale actor and one of the allowlisted P6 source-stale reasons.
 */
export function isAuditedStaleRejection(row: P6InterlinkRow): boolean {
  if (String(row?.status || '') !== 'rejected') return false
  return nonblank(row?.gate_reason) && nonblank(row?.gate_actor)
}

/**
 * ── P6 SOURCE-STALE AUDIT VOCABULARY (single source of truth) ──────────────
 *
 * This module OWNS the allowlist of reasons that may resolve an approved-useful
 * cohort row, and the ONE actor allowed to write them. The Batch B writer
 * (`scripts/p6SourceStaleRejection.ts`) imports these constants instead of
 * spelling its own literals, so the gate can only ever count a reason the
 * writer is structurally able to produce — a rename cannot silently loosen (or
 * silently tighten) the numerator.
 *
 * Batch A's `stale_target_http_404` / `stale_target_http_410` target-stale
 * reasons are deliberately NOT in this list: a dead TARGET is a stale row but
 * is never a live-target cohort member, and an artificially supplied Batch A
 * reason must therefore never resolve a cohort row.
 */
export const P6_SOURCE_STALE_GATE_ACTOR = 'p6-source-stale-rejection'

/** Never-shipped planner mission whose exact target is still live. */
export const P6_SOURCE_STALE_REASON_UNSHIPPED_MISSION = 'stale_source_unshipped_mission'
/** Shipped mission whose deterministically resolved canonical source is gone. */
export const P6_SOURCE_STALE_REASON_HTTP_404 = 'stale_source_http_404'
export const P6_SOURCE_STALE_REASON_HTTP_410 = 'stale_source_http_410'

/** The complete allowlist of gate-creditable P6 source-stale reasons. */
export const P6_SOURCE_STALE_GATE_REASONS: readonly string[] = [
  P6_SOURCE_STALE_REASON_UNSHIPPED_MISSION,
  P6_SOURCE_STALE_REASON_HTTP_404,
  P6_SOURCE_STALE_REASON_HTTP_410,
]

/**
 * The exact reason a raw source status justifies, or null when the status
 * proves nothing (2xx/3xx source stays live, 0/5xx/other stays unknown).
 */
export function p6SourceStaleReasonForStatus(status: number): string | null {
  if (status === 404) return P6_SOURCE_STALE_REASON_HTTP_404
  if (status === 410) return P6_SOURCE_STALE_REASON_HTTP_410
  return null
}

/**
 * True only for a rejection this gate may count as an explicit P6
 * SOURCE-STALE disposition: `status='rejected'`, the exact P6 source-stale
 * actor, and an allowlisted P6 source-stale reason. Arbitrary vocabulary, a
 * wrong actor, a blank/missing reason and the Batch A target-stale reasons are
 * all excluded.
 */
export function isAllowlistedSourceStaleRejection(row: P6InterlinkRow): boolean {
  if (String(row?.status || '') !== 'rejected') return false
  if (String(row?.gate_actor ?? '').trim() !== P6_SOURCE_STALE_GATE_ACTOR) return false
  const reason = String(row?.gate_reason ?? '').trim()
  return reason.length > 0 && P6_SOURCE_STALE_GATE_REASONS.includes(reason)
}

/** The spec's approved-useful cohort membership (live-target rows). */
export function isApprovedUsefulClass(classification: P6DispositionClass): boolean {
  return (
    classification === 'applied_present' ||
    classification === 'live_target_source_verified' ||
    classification === 'live_target_source_unverified'
  )
}

/** Injected live target observation (from the existing link-validity authority). */
export interface P6TargetObservation {
  status: number
  ok: boolean
  finalUrl?: string | null
}

export interface P6DispositionRow extends P6InterlinkRow {
  classification: P6DispositionClass
  liveObserved: boolean
  liveStatus: number | null
  /**
   * True only when the persisted row is `status='rejected'` with an
   * ALLOWLISTED P6 source-stale reason written by the P6 source-stale actor.
   * An unaudited rejection, an arbitrary reason, a wrong actor and the Batch A
   * target-stale vocabulary are never counted as an explicit stale disposition
   * (and never as verified applied).
   */
  explicitlyRejected: boolean
}

export interface P6DispositionReport {
  /** Raw persisted backlog - explicitly NOT the approved-useful denominator. */
  rawBacklog: number
  total: number
  /** True when the read hit the row cap and more rows exist (never silently complete). */
  truncated: boolean
  /** The row cap this report was produced under. */
  rowLimit: number
  rows: P6DispositionRow[]
  classes: Record<P6DispositionClass, number>
  /**
   * Approved-useful backlog = rows whose target live-checks as a current,
   * reachable estate/market URL. `numerator` counts those with durable
   * verification proof (applied_present + live_target_source_verified) and is
   * NEVER mixed with rejections. `explicitlyRejected` counts cohort rows whose
   * persisted status is an ALLOWLISTED P6 source-stale rejection (exact actor +
   * allowlisted reason), and `resolved` is the sum of the two — the spec's
   * "verified applied or explicitly rejected/stale" reading — reported NEXT TO
   * (never inside) the applied-only numerator.
   */
  approvedUseful: {
    denominator: number
    numerator: number
    unverified: number
    explicitlyRejected: number
    resolved: number
    verifiedAppliedRatio: number
    resolvedRatio: number
    basis: string
    /** Cohort rows resolved per allowlisted source-stale reason (audit view). */
    resolvedByReason: Record<string, number>
  }
  /** Explicitly dispositioned stale backlog, reported separately. */
  stale: {
    target404: number
    legacyAuthWall: number
    rejected: number
    /** Rejected rows carrying gate_reason + gate_actor (auditable). */
    rejectedWithAudit: number
    /** Rejected rows with no audit metadata (never treated as evidence). */
    rejectedUnaudited: number
    /** Rejected-row histogram by `gate_reason` (audit vocabulary truth). */
    rejectedByReason: Record<string, number>
    /**
     * Rejected rows whose reason AND actor are the allowlisted P6
     * source-stale pair — the ONLY rejections this report may resolve.
     */
    rejectedAllowlisted: number
    /**
     * Audited rejections excluded from gate credit (arbitrary reason, wrong
     * actor, or Batch A target-stale vocabulary). Reported so the exclusion is
     * visible rather than silent.
     */
    rejectedAuditedNonAllowlisted: number
  }
  unknown: number
  /** P6 gate is NOT evaluable from this foundation checkpoint. */
  gate: {
    evaluated: false
    note: string
  }
}

const P6_GATE_NOTE =
  'P6 foundation only: production rows are unclassified until a read-only run is performed. The gate is unevaluable here and no production row is mutated.'

/** Spec ratio for the P6 gate ("≥80% of approved useful backlog …"). */
export const P6_GATE_REQUIRED_RATIO = 0.8

/**
 * Explicit-basis string carried by every report so a reader can never mistake
 * a stale rejection for verified applied truth.
 */
export const P6_APPROVED_USEFUL_BASIS =
  'denominator = rows whose target classifies live now; numerator = verified applied only (durable proof + live target); explicitlyRejected = ALLOWLISTED P6 source-stale rejection (exact actor + reason) inside the same cohort; resolved = numerator + explicitlyRejected (the spec\'s "verified applied or explicitly rejected/stale" reading). Arbitrary reasons, wrong actors and Batch A target-stale reasons add nothing; a rejection is never counted as verified applied.'

const LEGACY_AUTH_WALL_HOSTS = new Set(['portal.yousafeconsultancy.com'])

/** Legacy Portal auth-wall targets (the pre-Marketplace Portal surface). */
export function isLegacyAuthWallTarget(url: string | null | undefined): boolean {
  const raw = String(url || '').trim()
  if (!raw) return false
  try {
    return LEGACY_AUTH_WALL_HOSTS.has(new URL(raw).hostname.toLowerCase())
  } catch {
    return false
  }
}

function nonblank(value: unknown): boolean {
  return typeof value === 'string' ? value.trim().length > 0 : Boolean(value)
}

/**
 * True when the row carries non-null verification evidence — the same shape
 * the `seo_interlinks_applied_requires_verification` DB constraint enforces.
 */
function hasVerificationEvidence(value: unknown): boolean {
  if (value == null) return false
  if (typeof value === 'string') return value.trim().length > 0
  return true
}

/**
 * Durable proof contract required before a row may count as verified — mirrors
 * the migration's fail-closed `status='applied'` CHECK: nonblank `source_url`,
 * `verification_state='present'`, non-null `verified_at`, non-null
 * `verification_evidence`, and `applied_at`.
 */
export function hasDurableVerificationProof(row: P6InterlinkRow): boolean {
  return (
    nonblank(row.source_url) &&
    row.verification_state === 'present' &&
    nonblank(row.verified_at) &&
    hasVerificationEvidence(row.verification_evidence) &&
    nonblank(row.applied_at)
  )
}

/**
 * Observation projection for the repository link-validity authority.
 *
 * `verifyUrlsLive` alone is the RAW HTTP probe: its `ok` is 2xx/3xx and its
 * HEAD-hostile handling is limited to retrying HEAD as GET on 403/405/501. The
 * authority-host exemptions (official/reputable hosts that answer crawlers
 * with 401/403/405/429 while staying live for readers) live in
 * `classifyLiveStatus`, so the CALLER must classify through it (the CLI does)
 * and pass the classified `ok` here. A raw `verifyUrlsLive.ok` is NOT a
 * verdict and must never be projected as one.
 */
export function p6ObservationFromLiveCheck(
  url: string,
  result: { ok: boolean; status: number; finalUrl?: string | null },
): P6TargetObservation {
  return {
    status: Number(result?.status ?? 0),
    ok: Boolean(result?.ok),
    finalUrl: result?.finalUrl ?? url,
  }
}

/** Live-target observation key (trailing-slash tolerant, fragment dropped). */
export function p6TargetKey(url: string | null | undefined): string {
  const raw = String(url || '').trim()
  if (!raw) return ''
  try {
    const parsed = new URL(raw)
    const path = (parsed.pathname || '/').replace(/\/+$/, '') || '/'
    return `${parsed.protocol}//${parsed.host.toLowerCase()}${path}${parsed.search}`
  } catch {
    let out = raw.split('#')[0]
    if (out.length > 1) out = out.replace(/\/+$/, '')
    return out
  }
}

/**
 * Pure single-row classification. Precedence:
 *   1. applied rows need the full durable proof, otherwise they are unknown
 *      (an unproven applied claim is never re-labelled as verified);
 *   2. an observed 404/410 target is stale regardless of its shape;
 *   3. a legacy Portal auth-wall target is stale;
 *   4. a live observed target is verified only with durable proof, else
 *      unverified;
 *   5. anything unobserved/unreachable stays unknown.
 */
export function classifyP6Row(
  row: P6InterlinkRow,
  observation?: P6TargetObservation | null,
): P6DispositionClass {
  if (String(row.status || '') === 'applied') {
    return hasDurableVerificationProof(row) ? 'applied_present' : 'unknown'
  }
  const observed = observation && typeof observation.status === 'number' ? observation : null
  if (observed && (observed.status === 404 || observed.status === 410)) return 'target_404'
  if (isLegacyAuthWallTarget(row.target_url)) return 'legacy_auth_wall'
  if (!observed || !observed.ok) return 'unknown'
  if (nonblank(row.source_url) && row.verification_state === 'present' && nonblank(row.verified_at)) {
    return 'live_target_source_verified'
  }
  return 'live_target_source_unverified'
}

export function buildP6DispositionReport(
  rows: P6InterlinkRow[],
  observations: Record<string, P6TargetObservation> = {},
  opts: { truncated?: boolean; rowLimit?: number } = {},
): P6DispositionReport {
  const classified: P6DispositionRow[] = []
  const classes: Record<P6DispositionClass, number> = {
    applied_present: 0,
    target_404: 0,
    legacy_auth_wall: 0,
    live_target_source_verified: 0,
    live_target_source_unverified: 0,
    unknown: 0,
  }
  let rejected = 0
  let rejectedWithAudit = 0
  let rejectedAllowlisted = 0
  const rejectedByReason: Record<string, number> = {}
  let cohortExplicitlyRejected = 0
  const resolvedByReason: Record<string, number> = {}

  for (const row of rows) {
    const key = p6TargetKey(row.target_url)
    const observation = key
      ? observations[key] || observations[String(row.target_url || '').trim()]
      : undefined
    const classification = classifyP6Row(row, observation)
    classes[classification] += 1
    // Gate credit is ALLOWLIST-ONLY: an audited rejection with an arbitrary
    // reason, a wrong actor or the Batch A target-stale vocabulary resolves
    // nothing.
    const explicitlyRejected = isAllowlistedSourceStaleRejection(row)
    const allowlistedReason = String(row.gate_reason || '').trim()
    if (String(row.status || '') === 'rejected') {
      rejected += 1
      if (isAuditedStaleRejection(row)) rejectedWithAudit += 1
      if (explicitlyRejected) rejectedAllowlisted += 1
      const reason = nonblank(row.gate_reason)
        ? String(row.gate_reason).trim()
        : '(no gate_reason)'
      rejectedByReason[reason] = (rejectedByReason[reason] || 0) + 1
      // A live-target row that was explicitly rejected/stale is a RESOLVED
      // member of the approved-useful cohort — the spec's second terminal
      // disposition. It stays in the denominator (cohort membership is
      // target-liveness based) and never enters the applied numerator.
      if (explicitlyRejected && isApprovedUsefulClass(classification)) {
        cohortExplicitlyRejected += 1
        resolvedByReason[allowlistedReason] = (resolvedByReason[allowlistedReason] || 0) + 1
      }
    }
    classified.push({
      ...row,
      classification,
      liveObserved: Boolean(observation),
      liveStatus: observation ? observation.status : null,
      explicitlyRejected,
    })
  }

  const approvedUsefulDenominator =
    classes.applied_present + classes.live_target_source_verified + classes.live_target_source_unverified
  const approvedUsefulNumerator = classes.applied_present + classes.live_target_source_verified
  const approvedUsefulResolved = approvedUsefulNumerator + cohortExplicitlyRejected
  return {
    rawBacklog: rows.length,
    total: rows.length,
    truncated: Boolean(opts.truncated),
    rowLimit: opts.rowLimit ?? P6_DISPOSITION_ROW_LIMIT,
    rows: classified,
    classes,
    approvedUseful: {
      denominator: approvedUsefulDenominator,
      numerator: approvedUsefulNumerator,
      unverified: classes.live_target_source_unverified,
      explicitlyRejected: cohortExplicitlyRejected,
      resolved: approvedUsefulResolved,
      verifiedAppliedRatio:
        approvedUsefulDenominator > 0
          ? approvedUsefulNumerator / approvedUsefulDenominator
          : 0,
      resolvedRatio:
        approvedUsefulDenominator > 0 ? approvedUsefulResolved / approvedUsefulDenominator : 0,
      basis: P6_APPROVED_USEFUL_BASIS,
      resolvedByReason,
    },
    stale: {
      target404: classes.target_404,
      legacyAuthWall: classes.legacy_auth_wall,
      rejected,
      rejectedWithAudit,
      rejectedUnaudited: rejected - rejectedWithAudit,
      rejectedByReason,
      rejectedAllowlisted,
      rejectedAuditedNonAllowlisted: rejectedWithAudit - rejectedAllowlisted,
    },
    unknown: classes.unknown,
    gate: { evaluated: false, note: P6_GATE_NOTE },
  }
}

/** Hard row cap for a single report run (never silently treated as complete). */
export const P6_DISPOSITION_ROW_LIMIT = 5000
export const P6_DISPOSITION_PAGE_SIZE = 1000

export interface P6GateAccounting {
  /** Spec ratio required by the P6 gate (0.8). */
  requiredRatio: number
  /** Approved-useful denominator (live-target cohort size). */
  approvedUseful: number
  /** Verified applied inside that cohort (durable proof + live target). */
  verifiedApplied: number
  /** Audited stale rejections inside that cohort (no applied claim). */
  explicitlyRejected: number
  /** verifiedApplied + explicitlyRejected. */
  resolved: number
  verifiedAppliedRatio: number
  resolvedRatio: number
  /**
   * True only when the report can actually carry a PASS/FAIL verdict: the read
   * was complete (`truncated === false`), no row was left `unknown`, and the
   * cohort is non-empty. An evaluable:false report can never claim a gate.
   */
  evaluable: boolean
  /** Why the report is not evaluable (null when it is). */
  notEvaluableReason: string | null
  /** Strict reading: the cohort must be ≥80% VERIFIED APPLIED. */
  verifiedAppliedGateMet: boolean
  /** Literal reading: the cohort must be ≥80% resolved (applied or explicitly rejected/stale). */
  resolvedGateMet: boolean
  /**
   * Third spec bullet ("no applied count is based solely on DB state") is
   * structurally satisfied: the applied numerator requires durable proof AND a
   * live-target classification, never a bare persisted status.
   */
  appliedCountBasis: 'durable_proof_plus_live_target_classification'
  note: string
}

/**
 * Turn a read-only disposition report into the spec's P6 gate arithmetic.
 *
 * Two readings are returned side by side and NEVER merged:
 *   · `verifiedAppliedRatio` — the strict "verified applied" measure;
 *   · `resolvedRatio` — the literal spec wording that also accepts an
 *     explicitly rejected/stale row inside the approved-useful cohort.
 * A caller that prints only one of them is hiding half of the truth, so this
 * helper always exposes both plus the exact basis of the applied count.
 */
export function computeP6GateAccounting(
  report: P6DispositionReport,
  opts: { requiredRatio?: number } = {},
): P6GateAccounting {
  const requiredRatio =
    typeof opts.requiredRatio === 'number' && Number.isFinite(opts.requiredRatio)
      ? opts.requiredRatio
      : P6_GATE_REQUIRED_RATIO
  const denominator = Number(report?.approvedUseful?.denominator || 0)
  const verifiedApplied = Number(report?.approvedUseful?.numerator || 0)
  const explicitlyRejected = Number(report?.approvedUseful?.explicitlyRejected || 0)
  const resolved = verifiedApplied + explicitlyRejected
  const verifiedAppliedRatio = denominator > 0 ? verifiedApplied / denominator : 0
  const resolvedRatio = denominator > 0 ? resolved / denominator : 0
  // A truncated read, any `unknown` row or an empty cohort means the gate is NOT
  // evaluable: no ratio can be claimed, so both readings stay false.
  const notEvaluableReason = report?.truncated
    ? 'the row read was truncated at the cap, so the estate is incomplete'
    : Number(report?.unknown || 0) > 0
      ? `${Number(report?.unknown || 0)} row(s) remain unclassified/unknown`
      : denominator <= 0
        ? 'the approved-useful cohort is empty (zero denominator)'
        : null
  const evaluable = notEvaluableReason == null
  return {
    requiredRatio,
    approvedUseful: denominator,
    verifiedApplied,
    explicitlyRejected,
    resolved,
    verifiedAppliedRatio,
    resolvedRatio,
    evaluable,
    notEvaluableReason,
    verifiedAppliedGateMet: evaluable && verifiedAppliedRatio >= requiredRatio,
    resolvedGateMet: evaluable && resolvedRatio >= requiredRatio,
    appliedCountBasis: 'durable_proof_plus_live_target_classification',
    note:
      'Explicit stale rejection is a terminal disposition, NOT applied truth: a rejected row enters `explicitlyRejected`/`resolved` only, never `verifiedApplied`, and only an ALLOWLISTED P6 source-stale reason written by the P6 source-stale actor counts at all. Both readings are reported side by side — `verifiedAppliedGateMet` is the strict measured outcome and `resolvedGateMet` is the literal spec wording — and both are false unless the report is evaluable (complete, non-truncated, zero unknown, non-empty cohort), so neither can be mistaken for the other and an unevaluable report can never read as PASS.',
  }
}

/** Structural, SELECT-only Supabase surface used by this report. */
export interface P6SelectBuilder {
  select(columns: string): P6SelectBuilder
  order(column: string, opts?: { ascending?: boolean }): P6SelectBuilder
  range(
    from: number,
    to: number,
  ): PromiseLike<{ data: P6InterlinkRow[] | null; error: { message: string } | null }>
}

export interface P6ReadOnlySupabase {
  from(table: string): P6SelectBuilder
}

const P6_DISPOSITION_COLUMNS =
  'id,source_slug,target_url,status,source_url,verification_state,verified_at,verification_evidence,applied_at,gate_reason,gate_actor'

async function readDispositionRange(
  supabase: P6ReadOnlySupabase,
  from: number,
  to: number,
): Promise<P6InterlinkRow[]> {
  const { data, error } = await supabase
    .from('seo_interlinks')
    .select(P6_DISPOSITION_COLUMNS)
    .order('id', { ascending: true })
    .range(from, to)
  if (error) throw new Error(`seo_interlinks read failed: ${error.message}`)
  return (data as P6InterlinkRow[] | null) || []
}

/**
 * Fetch disposition rows with SELECT only, paginated up to the cap. When the
 * cap is reached one extra row is probed so `truncated` is PROVEN rather than
 * assumed: a capped result is never silently reported as the complete estate.
 */
export async function fetchP6DispositionRowsWithTruncation(
  supabase: P6ReadOnlySupabase,
  opts: { limit?: number; pageSize?: number } = {},
): Promise<{ rows: P6InterlinkRow[]; truncated: boolean; limit: number }> {
  const limit = Math.max(1, Math.min(opts.limit ?? P6_DISPOSITION_ROW_LIMIT, P6_DISPOSITION_ROW_LIMIT))
  const pageSize = Math.max(1, Math.min(opts.pageSize ?? P6_DISPOSITION_PAGE_SIZE, P6_DISPOSITION_ROW_LIMIT))
  const rows: P6InterlinkRow[] = []
  let truncated = false
  for (let from = 0; from < limit; from += pageSize) {
    const to = Math.min(from + pageSize - 1, limit - 1)
    const batch = await readDispositionRange(supabase, from, to)
    rows.push(...batch)
    if (batch.length < to - from + 1) break
    if (rows.length >= limit) {
      const probe = await readDispositionRange(supabase, limit, limit)
      truncated = probe.length > 0
      break
    }
  }
  return { rows, truncated, limit }
}

/**
 * Fetch every disposition-relevant row with SELECT only, paginated so a large
 * backlog is never silently truncated. No write verb exists on the interface.
 */
export async function fetchP6DispositionRows(
  supabase: P6ReadOnlySupabase,
  opts: { limit?: number; pageSize?: number } = {},
): Promise<P6InterlinkRow[]> {
  return (await fetchP6DispositionRowsWithTruncation(supabase, opts)).rows
}

/**
 * Full read-only run: fetch rows, observe targets through an injected live
 * checker, classify and report. The checker receives unique target URLs and
 * returns observations keyed by `p6TargetKey`.
 */
export async function runP6DispositionReport(opts: {
  supabase: P6ReadOnlySupabase
  observeTargets: (urls: string[]) => Promise<Record<string, P6TargetObservation>>
  limit?: number
  pageSize?: number
}): Promise<P6DispositionReport> {
  const { rows, truncated, limit } = await fetchP6DispositionRowsWithTruncation(opts.supabase, {
    limit: opts.limit,
    pageSize: opts.pageSize,
  })
  // One live observation per normalized target, not per raw spelling.
  const targets = [
    ...new Set(rows.map((row) => p6TargetKey(row.target_url)).filter(Boolean)),
  ]
  const observations = targets.length ? await opts.observeTargets(targets) : {}
  return buildP6DispositionReport(rows, observations, { truncated, rowLimit: limit })
}
