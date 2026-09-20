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
   * verification proof (applied_present + live_target_source_verified).
   */
  approvedUseful: {
    denominator: number
    numerator: number
    unverified: number
  }
  /** Explicitly dispositioned stale backlog, reported separately. */
  stale: {
    target404: number
    legacyAuthWall: number
    rejected: number
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
 * Observation projection for the existing link-validity authority
 * (`verifyUrlsLive` → `classifyLiveStatus`): its `ok` already encodes the
 * repository's HEAD-hostile fallback (HEAD, retried as GET on 403/405/501) and
 * its authority-host exemptions, so the report classifies exactly what the
 * repo link authority proved.
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

  for (const row of rows) {
    const key = p6TargetKey(row.target_url)
    const observation = key
      ? observations[key] || observations[String(row.target_url || '').trim()]
      : undefined
    const classification = classifyP6Row(row, observation)
    classes[classification] += 1
    if (String(row.status || '') === 'rejected') rejected += 1
    classified.push({
      ...row,
      classification,
      liveObserved: Boolean(observation),
      liveStatus: observation ? observation.status : null,
    })
  }

  const approvedUsefulDenominator =
    classes.applied_present + classes.live_target_source_verified + classes.live_target_source_unverified
  return {
    rawBacklog: rows.length,
    total: rows.length,
    truncated: Boolean(opts.truncated),
    rowLimit: opts.rowLimit ?? P6_DISPOSITION_ROW_LIMIT,
    rows: classified,
    classes,
    approvedUseful: {
      denominator: approvedUsefulDenominator,
      numerator: classes.applied_present + classes.live_target_source_verified,
      unverified: classes.live_target_source_unverified,
    },
    stale: {
      target404: classes.target_404,
      legacyAuthWall: classes.legacy_auth_wall,
      rejected,
    },
    unknown: classes.unknown,
    gate: { evaluated: false, note: P6_GATE_NOTE },
  }
}

/** Hard row cap for a single report run (never silently treated as complete). */
export const P6_DISPOSITION_ROW_LIMIT = 5000
export const P6_DISPOSITION_PAGE_SIZE = 1000

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
  'id,source_slug,target_url,status,source_url,verification_state,verified_at,verification_evidence,applied_at'

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
