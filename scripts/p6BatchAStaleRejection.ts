/**
 * P6 Batch A — operator-controlled stale rejection of HISTORICAL JOBLESS
 * `seo_interlinks` planned rows whose exact current target freshly proves
 * HTTP 404 or 410.
 *
 * PURE module: subject predicate, target classification, deterministic
 * ordering, planning, update-patch/CAS-fence construction and CLI argument
 * parsing. No network, no Supabase import, no write verb. The IO orchestration
 * lives in `p6BatchAStaleRejectionRunner.ts` and the executable wrapper in
 * `scripts/p6-batch-a-stale-rejection.mts`.
 *
 * Authorized semantics (Batch A ONLY):
 *   · Subject: `status='planned'` + nonblank `target_url` + historical
 *     jobless/no-proof — `source_url`, `source_job_id`, `verification_state`,
 *     `verified_at`, `verification_evidence`, `verification_attempted_at`,
 *     `staged_at` and `applied_at` are all strictly NULL. These rows have no
 *     source identity and must never be made to look verified: the only
 *     columns this tool writes are `status='rejected'` plus the auditable
 *     `gate_reason` / `gate_actor` / `gate_updated_at` metadata that already
 *     exists on the table and is already surfaced for non-planned rows.
 *   · Fresh proof: the caller probes each distinct target through the
 *     repository link-liveness authority (`verifyUrlsLive` HEAD→GET fallback,
 *     then `classifyLiveStatus`) at execution time. Only a raw HTTP 404/410
 *     is dead. Classified-live observations (2xx/3xx plus the authority-host
 *     401/403/405/429 exemptions) stay untouched. 0/5xx and every other
 *     status is UNKNOWN and stays untouched.
 *   · Legacy Portal auth-wall targets are NEVER Batch A: they are counted and
 *     left read-only/report-only even if they currently answer 404/410.
 *   · Every write is an exact-row CAS (`buildBatchACasFence`): a zero-row
 *     UPDATE is a concurrency SKIP, never success.
 *   · Idempotent: rejected rows are no longer candidates, so a rerun after a
 *     successful rejection touches nothing.
 */

import {
  isLegacyAuthWallTarget,
  p6TargetKey,
  type P6TargetObservation,
} from './p6InterlinkDisposition'

/** Hard ceiling for rows written per invocation — never configurable above. */
export const P6_BATCH_A_HARD_MAX_ROWS = 200
/** Default per-invocation write bound (small, bounded, deterministic). */
export const P6_BATCH_A_DEFAULT_LIMIT = 50
/** Scan/page caps for the candidate SELECT (truncation is proven, not assumed). */
export const P6_BATCH_A_SCAN_LIMIT = 5000
export const P6_BATCH_A_PAGE_SIZE = 1000

/** Exact second-factor required alongside `--apply` (never env-derived). */
export const P6_BATCH_A_APPLY_CONFIRM_TOKEN = 'REJECT-BATCH-A-STALE-404-410'
export const P6_BATCH_A_TOOL = 'p6-batch-a-stale-rejection'
export const P6_BATCH_A_VERSION = 1
export const P6_BATCH_A_GATE_ACTOR = 'p6-batch-a-stale-rejection'
export const P6_BATCH_A_GATE_REASON_404 = 'stale_target_http_404'
export const P6_BATCH_A_GATE_REASON_410 = 'stale_target_http_410'

export const P6_BATCH_A_USAGE = `P6 Batch A — reject historical jobless planned seo_interlinks whose exact target freshly proves 404/410.

Usage:
  npx tsx --env-file=.env.local scripts/p6-batch-a-stale-rejection.mts [--limit N] [--json] [--apply --confirm ${P6_BATCH_A_APPLY_CONFIRM_TOKEN}]

  (no flags)     DRY RUN — SELECT + live probe only, ZERO writes.
  --limit N      rows max per invocation (default ${P6_BATCH_A_DEFAULT_LIMIT}, hard max ${P6_BATCH_A_HARD_MAX_ROWS}).
  --json         machine-readable summary (always emitted by this CLI regardless).
  --apply        enable writes ONLY together with --confirm <token>.
  --confirm T    exact confirmation token (${P6_BATCH_A_APPLY_CONFIRM_TOKEN}); required for and only valid with --apply.
  --help         print this usage and exit 0.

Apply is never enabled by an environment variable. Legacy Portal auth-wall rows,
live targets and unknown/network/5xx targets are never written.`

/** The persisted row shape this tool reads (SELECT-only projection). */
export interface P6BatchACandidateRow {
  id: string
  source_slug?: string | null
  target_url?: string | null
  status?: string | null
  source_url?: string | null
  source_job_id?: string | null
  verification_state?: string | null
  verified_at?: string | null
  verification_evidence?: unknown
  verification_attempted_at?: string | null
  staged_at?: string | null
  applied_at?: string | null
  created_at?: string | null
}

export type P6BatchAClass =
  | 'dead_404'
  | 'dead_410'
  | 'live'
  | 'unknown'
  | 'legacy_auth_wall'

/** SELECT projection required to prove the Batch A subject fence. */
export const P6_BATCH_A_CANDIDATE_COLUMNS =
  'id,source_slug,target_url,status,source_url,source_job_id,verification_state,verified_at,verification_evidence,verification_attempted_at,staged_at,applied_at,created_at'

function nonblank(value: unknown): boolean {
  return typeof value === 'string' ? value.trim().length > 0 : Boolean(value)
}

/**
 * Historical jobless/no-proof subject fence. Selection and the write-time CAS
 * fence agree on strict NULL for every proof/identity/lifecycle column, so a
 * concurrent write that adds ANY of them removes the row from Batch A.
 */
export function isHistoricalJoblessNoProofCandidate(row: P6BatchACandidateRow): boolean {
  if (String(row?.status || '') !== 'planned') return false
  if (!nonblank(row?.target_url)) return false
  return (
    row.source_url == null &&
    row.source_job_id == null &&
    row.verification_state == null &&
    row.verified_at == null &&
    row.verification_evidence == null &&
    row.verification_attempted_at == null &&
    row.staged_at == null &&
    row.applied_at == null
  )
}

/**
 * Pure target classification.
 *
 * Precedence: legacy Portal auth-wall (report-only, never a candidate) →
 * raw HTTP 404/410 (dead) → classified live (`ok === true`, which already
 * includes the authority-host 401/403/405/429 exemptions) → UNKNOWN.
 * 401/403/405/429/0/5xx that the authority did NOT classify live are unknown
 * and never dead.
 */
export function classifyBatchARow(
  row: P6BatchACandidateRow,
  observation?: P6TargetObservation | null,
): P6BatchAClass {
  if (isLegacyAuthWallTarget(row?.target_url)) return 'legacy_auth_wall'
  const observed =
    observation && typeof observation.status === 'number' ? observation : null
  if (observed && observed.status === 404) return 'dead_404'
  if (observed && observed.status === 410) return 'dead_410'
  if (observed && observed.ok === true) return 'live'
  return 'unknown'
}

/**
 * Deterministic candidate order: (created_at ASC, id ASC). Unstable DB order
 * or pagination overlap can therefore never change which rows are selected
 * first.
 */
export function orderBatchACandidates(
  rows: P6BatchACandidateRow[],
): P6BatchACandidateRow[] {
  return [...rows].sort((a, b) => {
    const at = String(a?.created_at || '')
    const bt = String(b?.created_at || '')
    if (at < bt) return -1
    if (at > bt) return 1
    const aid = String(a?.id || '')
    const bid = String(b?.id || '')
    if (aid < bid) return -1
    if (aid > bid) return 1
    return 0
  })
}

/** Keep the first occurrence per id (guards overlapping pagination pages). */
export function uniqueBatchACandidatesById(
  rows: P6BatchACandidateRow[],
): P6BatchACandidateRow[] {
  const seen = new Set<string>()
  const out: P6BatchACandidateRow[] = []
  for (const row of rows) {
    const id = String(row?.id ?? '')
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(row)
  }
  return out
}

/** Auditable lifecycle metadata written next to `status='rejected'`. */
export function buildBatchAUpdatePatch(input: {
  httpStatus: number
  nowIso: string
}): Record<string, string> {
  return {
    status: 'rejected',
    gate_reason:
      input.httpStatus === 410
        ? P6_BATCH_A_GATE_REASON_410
        : P6_BATCH_A_GATE_REASON_404,
    gate_actor: P6_BATCH_A_GATE_ACTOR,
    gate_updated_at: input.nowIso,
  }
}

export type P6BatchAFenceEntry =
  | { op: 'eq'; column: string; value: string }
  | { op: 'is'; column: string; value: null }

/**
 * Exact-row CAS fence for one Batch A rejection. `id` + `status='planned'` +
 * the exact observed `target_url` + every historical jobless/no-proof column
 * fenced `IS NULL`. A row that changed concurrently (status, target, any
 * proof/identity/staging column) yields a zero-row UPDATE → SKIP, never
 * success.
 */
export function buildBatchACasFence(
  row: P6BatchACandidateRow,
): P6BatchAFenceEntry[] {
  return [
    { op: 'eq', column: 'id', value: String(row.id) },
    { op: 'eq', column: 'status', value: 'planned' },
    { op: 'eq', column: 'target_url', value: String(row.target_url) },
    { op: 'is', column: 'source_url', value: null },
    { op: 'is', column: 'source_job_id', value: null },
    { op: 'is', column: 'verification_state', value: null },
    { op: 'is', column: 'verified_at', value: null },
    { op: 'is', column: 'applied_at', value: null },
    { op: 'is', column: 'verification_evidence', value: null },
    { op: 'is', column: 'verification_attempted_at', value: null },
    { op: 'is', column: 'staged_at', value: null },
  ]
}

export interface P6BatchASelectedRow {
  id: string
  target_url: string
  targetKey: string
  httpStatus: number
  gateReason: string
}

export interface P6BatchAPlan {
  scannedRows: number
  distinctTargets: number
  deadCandidateRows: number
  deadRowsBeyondLimit: number
  liveUntouchedRows: number
  legacyAuthWallRows: number
  unknownUntouchedRows: number
  /** Raw observed HTTP status histogram across candidate rows that were observed. */
  observedStatusCounts: Record<string, number>
  selected: P6BatchASelectedRow[]
}

/**
 * Pure planning: classify every scanned candidate row against the injected
 * fresh observations, never select legacy/live/unknown rows, and select at
 * most `limit` dead rows in deterministic order.
 */
export function planBatchA(
  rows: P6BatchACandidateRow[],
  observations: Record<string, P6TargetObservation | undefined> = {},
  opts: { limit?: number } = {},
): P6BatchAPlan {
  const requestedLimit = opts.limit ?? P6_BATCH_A_DEFAULT_LIMIT
  const limit = Number.isInteger(requestedLimit)
    ? Math.max(0, Math.min(requestedLimit, P6_BATCH_A_HARD_MAX_ROWS))
    : P6_BATCH_A_DEFAULT_LIMIT

  const candidates = orderBatchACandidates(
    uniqueBatchACandidatesById(
      rows.filter((row) => isHistoricalJoblessNoProofCandidate(row)),
    ),
  )

  const targetKeys = new Set<string>()
  for (const row of candidates) {
    const key = p6TargetKey(row.target_url)
    if (key) targetKeys.add(key)
  }

  const observedStatusCounts: Record<string, number> = {}
  const dead: P6BatchASelectedRow[] = []
  let liveUntouchedRows = 0
  let legacyAuthWallRows = 0
  let unknownUntouchedRows = 0

  for (const row of candidates) {
    const key = p6TargetKey(row.target_url)
    const observation = key ? observations[key] : undefined
    if (observation && typeof observation.status === 'number') {
      const statusKey = String(observation.status)
      observedStatusCounts[statusKey] = (observedStatusCounts[statusKey] || 0) + 1
    }
    const classification = classifyBatchARow(row, observation)
    if (classification === 'legacy_auth_wall') {
      legacyAuthWallRows += 1
      continue
    }
    if (classification === 'live') {
      liveUntouchedRows += 1
      continue
    }
    if (classification === 'unknown') {
      unknownUntouchedRows += 1
      continue
    }
    const httpStatus = Number(observation?.status)
    dead.push({
      id: String(row.id),
      target_url: String(row.target_url),
      targetKey: key,
      httpStatus,
      gateReason: buildBatchAUpdatePatch({
        httpStatus,
        nowIso: '',
      }).gate_reason,
    })
  }

  return {
    scannedRows: candidates.length,
    distinctTargets: targetKeys.size,
    deadCandidateRows: dead.length,
    deadRowsBeyondLimit: Math.max(0, dead.length - limit),
    liveUntouchedRows,
    legacyAuthWallRows,
    unknownUntouchedRows,
    observedStatusCounts,
    selected: dead.slice(0, limit),
  }
}

export interface P6BatchAConfig {
  apply: boolean
  confirm: string | null
  limit: number
  json: boolean
  help: boolean
}

export type P6BatchAArgParse =
  | { ok: true; config: P6BatchAConfig }
  | { ok: false; error: string }

const DEFAULT_CONFIG: P6BatchAConfig = {
  apply: false,
  confirm: null,
  limit: P6_BATCH_A_DEFAULT_LIMIT,
  json: false,
  help: false,
}

function readFlagValue(
  argv: string[],
  index: number,
  flag: string,
): { value: string | null; nextIndex: number } | { error: string } {
  const token = argv[index]
  const eq = token.indexOf('=')
  if (eq >= 0) return { value: token.slice(eq + 1), nextIndex: index }
  const value = argv[index + 1]
  if (value == null || value.startsWith('--')) {
    return { error: `${flag} requires a value` }
  }
  return { value, nextIndex: index + 1 }
}

/**
 * Strict argv parsing. Apply is enabled ONLY by the exact pair
 * `--apply --confirm <token>`; a confirmation token without `--apply`, a wrong
 * token, an out-of-range limit, an unknown flag or a duplicated flag all fail
 * closed with zero writes. No environment variable can enable apply.
 */
export function parseBatchAArgs(argv: string[]): P6BatchAArgParse {
  const config: P6BatchAConfig = { ...DEFAULT_CONFIG }
  const seen = new Set<string>()

  for (let i = 0; i < argv.length; i += 1) {
    const token = String(argv[i])
    const flag = token.includes('=') ? token.slice(0, token.indexOf('=')) : token
    if (flag === '--help' || flag === '-h') {
      return { ok: true, config: { ...DEFAULT_CONFIG, help: true } }
    }
    if (seen.has(flag)) return { ok: false, error: `duplicate flag ${flag}` }
    seen.add(flag)
    switch (flag) {
      case '--apply':
        config.apply = true
        break
      case '--dry-run':
        config.apply = false
        break
      case '--json':
        config.json = true
        break
      case '--confirm':
      case '--limit': {
        const read = readFlagValue(argv, i, flag)
        if ('error' in read) return { ok: false, error: read.error }
        i = read.nextIndex
        if (flag === '--confirm') {
          config.confirm = read.value
        } else {
          const raw = String(read.value)
          if (!/^\d+$/.test(raw)) {
            return { ok: false, error: `--limit must be a positive integer (got ${raw})` }
          }
          const limit = Number(raw)
          if (!Number.isInteger(limit) || limit < 1) {
            return { ok: false, error: `--limit must be >= 1 (got ${raw})` }
          }
          if (limit > P6_BATCH_A_HARD_MAX_ROWS) {
            return {
              ok: false,
              error: `--limit ${limit} exceeds the hard maximum ${P6_BATCH_A_HARD_MAX_ROWS}`,
            }
          }
          config.limit = limit
        }
        break
      }
      default:
        return { ok: false, error: `unknown flag ${flag}` }
    }
  }

  if (config.confirm != null && !config.apply) {
    return { ok: false, error: '--confirm is only valid together with --apply' }
  }
  if (config.apply && config.confirm !== P6_BATCH_A_APPLY_CONFIRM_TOKEN) {
    return {
      ok: false,
      error: `--apply requires --confirm ${P6_BATCH_A_APPLY_CONFIRM_TOKEN}`,
    }
  }
  return { ok: true, config }
}
