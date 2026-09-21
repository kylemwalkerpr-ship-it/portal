/**
 * P6 Batch B — bounded, fail-closed SOURCE-stale disposition for historical
 * jobless `seo_interlinks` planned rows whose SOURCE MISSION never shipped.
 *
 * Why this lane exists: Batch A only clears rows whose exact target freshly
 * proves 404/410. A residual cohort remains that has a CURRENTLY LIVE target
 * but no actionable source: the planned edge belongs to a planner mission
 * (`seo_cluster_plans.cluster_id = seo_interlinks.source_slug`) that never
 * shipped, the row carries no durable source/job/staging/verification identity
 * at all, and no live estate URL carries the mission slug. The spec's P6 gate
 * accepts a backlog row resolved as "verified applied OR explicitly
 * rejected/stale", and the P6 goals explicitly include "mark rejected/stale
 * edges truthfully" — so such a row can be dispositioned as stale WITHOUT
 * fabricating an applied proof, a source URL, a job id or a live anchor.
 *
 * PURE module: subject predicate, mission fence, live-source guard matching,
 * deterministic ordering, planning, patch/CAS-fence construction and argv
 * parsing. No network, no Supabase import, no write verb. IO orchestration
 * lives in `p6SourceStaleRejectionRunner.ts`; the executable wrapper is
 * `scripts/p6-source-stale-rejection.mts`.
 *
 * ELIGIBILITY (every condition is mandatory; anything else is untouched and
 * counted truthfully under its own class):
 *   1. `status='planned'` + nonblank `target_url`;
 *   2. historical jobless/no-proof subject fence — `source_url`,
 *      `source_job_id`, `verification_state`, `verified_at`,
 *      `verification_evidence`, `verification_attempted_at`, `staged_at`,
 *      `applied_at` are ALL strictly NULL (the same fence and the same CAS
 *      builder Batch A uses, so the two lanes can never drift apart);
 *   3. the EXACT trimmed stored `target_url` must be an absolute http(s) URL
 *      AND must classify LIVE in this run through the repository link
 *      authority. Dead (404/410) targets belong to Batch A; unknown/unobserved
 *      targets stay unknown. This lane can therefore never be a disguised dead
 *      -target rejection;
 *   4. `source_slug` must be nonblank and an EXACT `seo_cluster_plans` row for
 *      `cluster_id = source_slug` must exist. A missing mission record is
 *      AMBIGUOUS (the slug is a planner identity; orphaned/content-job-style
 *      slugs may correspond to a hand-written or otherwise shipped page) and
 *      stays planned — fail closed, never inferred;
 *   5. that mission record must be `status='planned'` AND `shipped_at IS NULL`
 *      (never shipped). Any other status — shipped/launched/briefed/done/
 *      skipped/rejected — or a non-null `shipped_at` is ineligible: a
 *      published/shipped/ambiguous mission is fail-closed and stays planned;
 *   6. the mission slug must NOT appear in any live estate URL path (exact
 *      slug substring guard). A live page that carries the mission slug may be
 *      the mission's own source page, so the row stays planned;
 *   7. when the durable mission→`content_jobs` exclusion probe resolved an
 *      exact job identity for the mission, the row is ineligible (the mission
 *      has a durable page in flight/merged). The probe is REQUIRED for apply:
 *      an unavailable probe fails apply closed, because the absence of a
 *      durable job identity is then unproven;
 *   8. legacy Portal auth-wall targets are never Batch B (report-only).
 *
 * WHAT A WRITE IS: exactly four columns — `status='rejected'`,
 * `gate_reason='stale_source_unshipped_mission'`, `gate_actor` and
 * `gate_updated_at` — fenced by the exact-row CAS (`id` + `status='planned'` +
 * the exact RAW STORED `target_url` + the eight NULL subject columns). No
 * source/job/proof/applied column is ever written or fabricated. A zero-row
 * UPDATE is a concurrency SKIP, never success.
 *
 * OPERATOR CONSEQUENCE (documented, not hidden): rejection is terminal for the
 * EDGE — staging selects `status='planned'` rows, and replanning deliberately
 * never resets lifecycle columns — while the MISSION record is untouched and
 * stays plannable. A later ship of that mission will therefore not re-stage
 * this edge; reviving it needs a separately authorized revival path.
 */

import {
  buildBatchACasFence,
  batchAExactTarget,
  isHistoricalJoblessNoProofCandidate,
  type P6BatchACandidateRow,
  type P6BatchAFenceEntry,
} from './p6BatchAStaleRejection'
import {
  P6_SOURCE_STALE_GATE_ACTOR,
  P6_SOURCE_STALE_GATE_REASONS,
  P6_SOURCE_STALE_REASON_HTTP_404,
  P6_SOURCE_STALE_REASON_HTTP_410,
  P6_SOURCE_STALE_REASON_UNSHIPPED_MISSION,
  isLegacyAuthWallTarget,
  p6SourceStaleReasonForStatus,
  p6TargetKey,
  type P6TargetObservation,
} from './p6InterlinkDisposition'

/** Hard ceiling for rows written per invocation — never configurable above. */
export const P6_SOURCE_STALE_HARD_MAX_ROWS = 200
/** Default per-invocation write bound (small, bounded, deterministic). */
export const P6_SOURCE_STALE_DEFAULT_LIMIT = 50
/** Scan/page caps for the candidate SELECT (truncation is proven, not assumed). */
export const P6_SOURCE_STALE_SCAN_LIMIT = 5000
export const P6_SOURCE_STALE_PAGE_SIZE = 1000
/** Hard cap on live estate URLs considered by the live-source guard. */
export const P6_SOURCE_STALE_LIVE_URL_CAP = 20000

/** Exact second-factor required alongside `--apply` (never env-derived). */
export const P6_SOURCE_STALE_APPLY_CONFIRM_TOKEN = 'REJECT-BATCH-B-SOURCE-STALE'
export const P6_SOURCE_STALE_TOOL = 'p6-source-stale-rejection'
export const P6_SOURCE_STALE_VERSION = 1
/**
 * The audit vocabulary is OWNED by the read-only disposition module (the same
 * module whose gate arithmetic counts it) and re-exported here, so the writer
 * cannot drift from the allowlist the gate credits.
 */
export {
  P6_SOURCE_STALE_GATE_ACTOR,
  P6_SOURCE_STALE_GATE_REASONS,
  P6_SOURCE_STALE_REASON_HTTP_404,
  P6_SOURCE_STALE_REASON_HTTP_410,
  P6_SOURCE_STALE_REASON_UNSHIPPED_MISSION,
  p6SourceStaleReasonForStatus,
}
/** Never-shipped-mission reason (the only reason the unshipped lane writes). */
export const P6_SOURCE_STALE_GATE_REASON = P6_SOURCE_STALE_REASON_UNSHIPPED_MISSION
/** Hard requirement that any patched reason is gate-creditable. */
export const P6_SOURCE_STALE_GATE_REASON_ALLOWLIST: readonly string[] =
  P6_SOURCE_STALE_GATE_REASONS

export const P6_SOURCE_STALE_USAGE = `P6 Batch B — reject historical jobless planned seo_interlinks whose SOURCE MISSION never shipped, while their exact target stays LIVE.

Usage:
  npx tsx --env-file=.env.local scripts/p6-source-stale-rejection.mts [--limit N] [--json] [--apply --confirm ${P6_SOURCE_STALE_APPLY_CONFIRM_TOKEN}]

  (no flags)     DRY RUN — SELECT + mission fence + live-source guard + live target probe only, ZERO writes.
  --limit N      rows max per invocation (default ${P6_SOURCE_STALE_DEFAULT_LIMIT}, hard max ${P6_SOURCE_STALE_HARD_MAX_ROWS}).
  --json         machine-readable summary (always emitted by this CLI regardless).
  --apply        enable writes ONLY together with --confirm <token>.
  --confirm T    exact confirmation token (${P6_SOURCE_STALE_APPLY_CONFIRM_TOKEN}); required for and only valid with --apply.
  --help         print this usage and exit 0.

A row is eligible only when ALL of these hold: the row is planned with the
historical jobless/no-proof NULL fence, the exact stored target is an absolute
http(s) URL that classifies LIVE now, and the row's source_slug names an EXACT
seo_cluster_plans mission whose cluster_id equals that slug verbatim. Two
independent evidence lanes can then select the row:

  A) NEVER-SHIPPED lane: the mission is still planned with shipped_at NULL, no
     live estate URL carries the mission slug, and the durable
     mission->content_jobs exclusion probe resolved no job identity. Reason:
     ${P6_SOURCE_STALE_REASON_UNSHIPPED_MISSION}.

  B) SHIPPED lane: the mission is exactly shipped with a non-null shipped_at,
     the deterministic repository ownership resolver (resolveOwner over the
     mission's own primary_term + country + persisted plan-body contentType)
     yields ONE absolute http(s) canonical source URL on an estate host, and a
     fresh GET-only check of that EXACT URL proves a RAW 404/410. Reason:
     ${P6_SOURCE_STALE_REASON_HTTP_404} or ${P6_SOURCE_STALE_REASON_HTTP_410}.
     A shipped source that answers 2xx/3xx is NEVER rejected because the planned
     href is absent; an unresolved/ambiguous owner, a self-target and an
     unknown/5xx source are never written.

Shipped/ambiguous missions (missing plan, other status), dead or unknown
targets, noncanonical targets, legacy Portal auth-wall rows and any row carrying
source/job/staging/verification identity are never written. Apply is never
enabled by an environment variable, and apply additionally requires a WORKING
durable mission->content_jobs exclusion probe plus genuine service-role
authority. Rejection is terminal for the edge (staging is planned-only); the
mission record itself is untouched.`

/** The persisted row shape this tool reads (SELECT-only projection). */
export type P6SourceStaleCandidateRow = P6BatchACandidateRow

/** Durable planner mission record (`seo_cluster_plans`). */
export interface P6SourceStaleMissionPlan {
  cluster_id?: string | null
  status?: string | null
  shipped_at?: string | null
  /** Planner inputs for the deterministic ownership resolver (shipped lane). */
  primary_term?: string | null
  country?: string | null
  /** Planner plan body — carries the persisted `contentType` for the mission. */
  plan?: { contentType?: unknown } | null
}

/**
 * The two independent evidence lanes this tool may act on. They are reported
 * separately and never blended: the reasons written (and therefore the gate
 * credit) differ.
 */
export type P6SourceStaleLane = 'unshipped_mission' | 'shipped_source_gone'

export type P6SourceStaleClass =
  | 'eligible'
  | 'eligible_shipped_source_gone'
  | 'legacy_auth_wall'
  | 'noncanonical_target'
  | 'subject_fence_failed'
  | 'target_dead'
  | 'target_not_live'
  | 'target_unknown'
  | 'no_source_slug'
  | 'mission_plan_missing'
  | 'mission_identity_mismatch'
  | 'mission_not_unshipped'
  | 'live_source_page_present'
  | 'mission_job_resolved'
  | 'shipped_source_unresolved'
  | 'shipped_source_self_target'
  | 'shipped_source_live'
  | 'shipped_source_unknown'

/**
 * Deterministic ownership-resolver output for ONE shipped mission.
 *
 * `ok: true` means the repository resolver returned exactly ONE canonical
 * absolute http(s) source URL for the mission. Anything else — a missing
 * resolver input, an ambiguous/multiple owner, a resolver error, or a
 * non-absolute result — is an explicit failure and the mission is ineligible.
 */
export type P6ShippedSourceResolution =
  | { ok: true; source: P6ResolvedShippedSource }
  | { ok: false; reason: string }

export interface P6ResolvedShippedSource {
  /** The ONE exact canonical source URL the resolver returned. */
  url: string
  /** Resolver identity + inputs, recorded for audit (never synthesized here). */
  resolver: string
  contentType: string
  host?: string | null
  routingSource?: string | null
}

/** SELECT projection required to prove the Batch B subject fence. */
export const P6_SOURCE_STALE_CANDIDATE_COLUMNS =
  'id,source_slug,target_url,status,source_url,source_job_id,verification_state,verified_at,verification_evidence,verification_attempted_at,staged_at,applied_at,created_at'

/**
 * SELECT projection for the durable mission fence. `primary_term`, `country`
 * and the plan body's `contentType` are the EXACT inputs the deterministic
 * ownership resolver needs for a shipped mission; nothing is inferred from the
 * planner slug.
 */
export const P6_SOURCE_STALE_MISSION_COLUMNS =
  'cluster_id,status,shipped_at,primary_term,country,plan'

function nonblank(value: unknown): boolean {
  return typeof value === 'string' ? value.trim().length > 0 : Boolean(value)
}

/**
 * True only for a mission record that PROVES the mission never shipped:
 * an exact `seo_cluster_plans` row that is still `planned` with a NULL
 * `shipped_at`. Every other shape (missing row, shipped/launched/briefed/done/
 * skipped/rejected status, non-null shipped_at) is ineligible — fail closed.
 */
export function isNeverShippedMissionPlan(
  plan: P6SourceStaleMissionPlan | null | undefined,
): boolean {
  if (!plan) return false
  if (plan.shipped_at != null && String(plan.shipped_at).trim() !== '') return false
  return String(plan.status || '') === 'planned'
}

/**
 * True only for a mission record that PROVES the mission shipped: status is
 * exactly `shipped` AND `shipped_at` is non-blank. Either half alone is
 * ambiguous and ineligible — the shipped lane exists to resolve the mission's
 * canonical source URL, and a mission whose ship stamp is missing cannot be
 * given that treatment.
 */
export function isShippedMissionPlan(
  plan: P6SourceStaleMissionPlan | null | undefined,
): boolean {
  if (!plan) return false
  if (String(plan.status || '') !== 'shipped') return false
  return plan.shipped_at != null && String(plan.shipped_at).trim() !== ''
}

/**
 * The mission's EXACT planner identity: the durable plan row's own
 * `cluster_id` must equal the row's `source_slug` verbatim (trimmed). No
 * normalization, no case folding, no fuzzy match — a mismatch is ambiguity and
 * is fail-closed.
 */
export function missionIdentityMatches(
  plan: P6SourceStaleMissionPlan | null | undefined,
  sourceSlug: string,
): boolean {
  const slug = String(sourceSlug || '').trim()
  if (!slug || !plan) return false
  return String(plan.cluster_id || '').trim() === slug
}

function isAbsoluteHttpUrl(raw: unknown): boolean {
  const trimmed = String(raw || '').trim()
  if (!trimmed) return false
  try {
    const parsed = new URL(trimmed)
    return (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      Boolean(parsed.hostname)
    )
  } catch {
    return false
  }
}

/**
 * Deterministic, inference-free live-source guard.
 *
 * A mission slug counts as POSSIBLY LIVE when any live estate URL's path
 * carries the exact slug string inside one of its segments (substring match,
 * case-insensitive). The exact slug is used verbatim: no stem extraction, no
 * country/stage rewriting, no URL synthesis — planner slugs are identities,
 * not URLs, and the guard exists only to FAIL CLOSED, never to claim that a
 * particular URL is the mission's page.
 */
export function liveSlugMatches(
  slugs: string[],
  liveUrls: string[],
): Set<string> {
  const wanted = [
    ...new Set(
      slugs
        .map((slug) => String(slug || '').trim().toLowerCase())
        .filter(Boolean),
    ),
  ]
  const matches = new Set<string>()
  if (!wanted.length || !Array.isArray(liveUrls)) return matches

  const segmentsByUrl: string[][] = []
  for (const url of liveUrls) {
    const raw = String(url || '').trim()
    if (!raw) continue
    let pathname = ''
    try {
      pathname = new URL(raw).pathname || ''
    } catch {
      continue
    }
    const segments = pathname
      .split('/')
      .map((segment) => {
        try {
          return decodeURIComponent(segment).toLowerCase()
        } catch {
          return segment.toLowerCase()
        }
      })
      .filter(Boolean)
    if (segments.length) segmentsByUrl.push(segments)
  }

  for (const slug of wanted) {
    for (const segments of segmentsByUrl) {
      if (segments.some((segment) => segment.includes(slug))) {
        matches.add(slug)
        break
      }
    }
  }
  return matches
}

export interface P6SourceStaleContext {
  /** Fresh live-target observations, keyed by the EXACT trimmed target_url. */
  observations?: Record<string, P6TargetObservation | undefined>
  /**
   * Fresh GET-only observations of RESOLVED canonical source URLs, keyed by the
   * exact resolved URL. Only raw 404/410 proves the shipped source gone.
   */
  sourceObservations?: Record<string, P6TargetObservation | undefined>
  /** Durable mission records keyed by exact `cluster_id` (absent = no record). */
  missionPlans?: Record<string, P6SourceStaleMissionPlan | null | undefined>
  /**
   * ONE resolved canonical source URL per shipped mission, keyed by the exact
   * `cluster_id`. Absent/failed entries are ineligible (never inferred).
   */
  shippedSources?: Record<string, P6ShippedSourceResolution | undefined>
  /** Mission slugs proven present in a live estate URL path (fail-closed guard). */
  liveSourceSlugs?: Set<string> | string[]
  /** Mission slugs resolved to a durable `content_jobs` identity (ineligible). */
  missionJobResolvedSlugs?: Set<string> | string[] | Record<string, unknown>
}

/**
 * Normalize a slug collection to a Set. Accepts a Set, an array of slugs, or a
 * plain slug→identity record (the runner's durable `content_jobs` probe result
 * shape, whose KEYS are the mission slugs) so the fail-closed guards cannot
 * throw on a legal caller shape.
 */
function toSet(
  value: Set<string> | string[] | Record<string, unknown> | undefined,
): Set<string> {
  if (!value) return new Set()
  if (value instanceof Set) return value
  if (Array.isArray(value)) return new Set(value.map((v) => String(v)))
  return new Set(Object.keys(value))
}

/**
 * Pure single-row classification with a fail-closed precedence:
 * legacy auth wall → noncanonical target → subject fence (planned + the
 * historical jobless/no-proof NULL fence) → target verdict (dead/not-live/
 * unknown) → source slug → mission record → exact mission identity →
 *
 *   · NEVER-SHIPPED lane (`status='planned'`, `shipped_at IS NULL`):
 *     live-source guard → durable job identity → `eligible`.
 *
 *   · SHIPPED lane (exactly `shipped` + non-blank `shipped_at`): the
 *     deterministic ownership resolution must exist → the resolved canonical
 *     source URL must be absolute http(s) and different from the exact target →
 *     its fresh GET-only observation must be a RAW 404/410 →
 *     `eligible_shipped_source_gone`. A live/unknown source, a self-target, an
 *     unresolved/ambiguous owner and every other status stay untouched.
 *
 *     A live source is NEVER rejected because the planned href is absent: only
 *     the raw 404/410 proof of the resolved canonical source URL counts.
 *
 *   · Any other mission status is ambiguous → `mission_not_unshipped`.
 */
export function classifySourceStaleRow(
  row: P6SourceStaleCandidateRow,
  context: P6SourceStaleContext = {},
): P6SourceStaleClass {
  if (isLegacyAuthWallTarget(row?.target_url)) return 'legacy_auth_wall'
  const exactTarget = batchAExactTarget(row?.target_url)
  if (!exactTarget) return 'noncanonical_target'
  // A row carrying ANY source/job/staging/verification identity — or that is no
  // longer `planned` — is never Batch B: it has real lifecycle truth that this
  // lane must not overwrite.
  if (!isHistoricalJoblessNoProofCandidate(row)) return 'subject_fence_failed'

  const observation = context.observations ? context.observations[exactTarget] : undefined
  if (!observation || typeof observation.status !== 'number') return 'target_unknown'
  if (observation.status === 404 || observation.status === 410) return 'target_dead'
  if (observation.ok !== true) return 'target_not_live'

  const slug = String(row?.source_slug || '').trim()
  if (!slug) return 'no_source_slug'

  const plan = context.missionPlans ? context.missionPlans[slug] : undefined
  if (!plan) return 'mission_plan_missing'
  // EXACT mission identity: the durable plan row must carry this very slug.
  if (!missionIdentityMatches(plan, slug)) return 'mission_identity_mismatch'

  if (isNeverShippedMissionPlan(plan)) {
    if (toSet(context.liveSourceSlugs).has(slug)) return 'live_source_page_present'
    if (toSet(context.missionJobResolvedSlugs).has(slug)) return 'mission_job_resolved'
    return 'eligible'
  }

  if (isShippedMissionPlan(plan)) {
    const resolved = context.shippedSources ? context.shippedSources[slug] : undefined
    if (!resolved || resolved.ok !== true) return 'shipped_source_unresolved'
    const sourceUrl = String(resolved.source?.url || '').trim()
    if (!isAbsoluteHttpUrl(sourceUrl)) return 'shipped_source_unresolved'
    // Self-target: a source that IS the target is an internal self-link, never a
    // source-stale disposition. Compared both verbatim and normalized.
    if (sourceUrl === exactTarget) return 'shipped_source_self_target'
    if (p6TargetKey(sourceUrl) === p6TargetKey(exactTarget)) return 'shipped_source_self_target'

    const sourceObservation = context.sourceObservations
      ? context.sourceObservations[sourceUrl]
      : undefined
    if (!sourceObservation || typeof sourceObservation.status !== 'number') {
      return 'shipped_source_unknown'
    }
    if (p6SourceStaleReasonForStatus(sourceObservation.status) != null) {
      return 'eligible_shipped_source_gone'
    }
    if (sourceObservation.status >= 200 && sourceObservation.status < 400) {
      return 'shipped_source_live'
    }
    return 'shipped_source_unknown'
  }

  // planned with a ship stamp, briefed/done/launched/skipped/rejected, or any
  // other planner status: ambiguous identity → fail closed.
  return 'mission_not_unshipped'
}

/** Deterministic candidate order: (created_at ASC, id ASC). */
export function orderSourceStaleCandidates(
  rows: P6SourceStaleCandidateRow[],
): P6SourceStaleCandidateRow[] {
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
export function uniqueSourceStaleCandidatesById(
  rows: P6SourceStaleCandidateRow[],
): P6SourceStaleCandidateRow[] {
  const seen = new Set<string>()
  const out: P6SourceStaleCandidateRow[] = []
  for (const row of rows) {
    const id = String(row?.id ?? '')
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(row)
  }
  return out
}

/**
 * Auditable lifecycle metadata written next to `status='rejected'`. Exactly
 * these four columns — never a source/job/proof/applied field.
 *
 * The reason MUST be a gate-creditable allowlisted reason (imported from the
 * disposition module that counts it): a non-allowlisted reason throws here, so
 * the tool can never write a rejection the gate would silently ignore (or,
 * worse, a reason nobody allowlisted as evidence).
 */
export function buildSourceStaleUpdatePatch(input: {
  nowIso: string
  gateReason?: string
}): Record<string, string> {
  const gateReason = String(input?.gateReason ?? P6_SOURCE_STALE_GATE_REASON).trim()
  if (!P6_SOURCE_STALE_GATE_REASONS.includes(gateReason)) {
    throw new Error(
      `refusing to write a non-allowlisted gate_reason (${gateReason || 'blank'}) — the P6 gate counts only ${P6_SOURCE_STALE_GATE_REASONS.join(', ')}`,
    )
  }
  return {
    status: 'rejected',
    gate_reason: gateReason,
    gate_actor: P6_SOURCE_STALE_GATE_ACTOR,
    gate_updated_at: input.nowIso,
  }
}

/**
 * Exact-row CAS fence for one Batch B rejection. Identical in shape to Batch
 * A's fence (same shared builder): `id` + `status='planned'` + the exact RAW
 * STORED `target_url` + every historical jobless/no-proof column `IS NULL`.
 * A row that changed concurrently (status, target, any proof/identity/staging
 * column) yields a zero-row UPDATE → SKIP, never success.
 *
 * The SHIPPED lane appends one more fence: `source_slug = <exact mission
 * cluster_id>` — its whole proof is bound to that exact planner identity, so a
 * concurrent re-point of the slug must also be a zero-row skip.
 */
export function buildSourceStaleCasFence(
  row: P6SourceStaleCandidateRow,
  opts: { lane?: P6SourceStaleLane; sourceSlug?: string | null } = {},
): P6BatchAFenceEntry[] {
  const fence = buildBatchACasFence(row)
  if (opts.lane !== 'shipped_source_gone') return fence
  const slug = String(opts.sourceSlug ?? row?.source_slug ?? '').trim()
  if (!slug) return fence
  return [...fence, { op: 'eq', column: 'source_slug', value: slug }]
}

export interface P6SourceStaleSelectedRow {
  id: string
  source_slug: string
  /** Which independent evidence class selected this row. */
  lane: P6SourceStaleLane
  /** Exact stored target_url used for the CAS fence (never normalized). */
  target_url: string
  /** Exact trimmed stored target the live proof is bound to. */
  exactTarget: string
  /** Classified-live raw HTTP status observed for that exact target. */
  observedStatus: number
  gateReason: string
  /**
   * SHIPPED lane only: the ONE resolved canonical source URL, its fresh raw
   * status, and the resolver identity that produced it.
   */
  source?: {
    url: string
    rawStatus: number
    resolver: string
    contentType: string
  } | null
  /** Durable mission evidence recorded with the selection (audit trail). */
  mission: {
    clusterId: string
    status: string | null
    shippedAt: string | null
  }
}

export interface P6SourceStaleShippedResolutionSummary {
  attempted: number
  resolved: number
  unresolved: number
  /** Failure-reason histogram (fail-closed accounting, never silent). */
  unresolvedReasons: Record<string, number>
}

export interface P6SourceStalePlan {
  scannedRows: number
  distinctTargets: number
  distinctSourceSlugs: number
  eligibleRows: number
  rowsBeyondLimit: number
  /** Eligible rows per lane (the two classes are reported separately). */
  laneCounts: Record<P6SourceStaleLane, number>
  /** Fresh raw source-status histogram for resolved shipped sources. */
  sourceStatusCounts: Record<string, number>
  /** Durable shipped-mission resolution accounting (fail-closed). */
  shippedSourceResolution: P6SourceStaleShippedResolutionSummary
  /** Per-class untouched accounting (never silently dropped). */
  classCounts: Record<P6SourceStaleClass, number>
  observedStatusCounts: Record<string, number>
  selected: P6SourceStaleSelectedRow[]
}

/**
 * Pure planning: classify every candidate row against the injected live
 * observations, durable mission records, live-source guard and durable job
 * identity probe, then select at most `limit` eligible rows in deterministic
 * order. Nothing is inferred or synthesized.
 */
export function planSourceStale(
  rows: P6SourceStaleCandidateRow[],
  context: P6SourceStaleContext = {},
  opts: { limit?: number } = {},
): P6SourceStalePlan {
  const requestedLimit = opts.limit ?? P6_SOURCE_STALE_DEFAULT_LIMIT
  const limit = Number.isInteger(requestedLimit)
    ? Math.max(0, Math.min(requestedLimit, P6_SOURCE_STALE_HARD_MAX_ROWS))
    : P6_SOURCE_STALE_DEFAULT_LIMIT

  const candidates = orderSourceStaleCandidates(
    uniqueSourceStaleCandidatesById(rows.filter((row) => Boolean(row))),
  )

  const classCounts: Record<P6SourceStaleClass, number> = {
    eligible: 0,
    eligible_shipped_source_gone: 0,
    legacy_auth_wall: 0,
    noncanonical_target: 0,
    subject_fence_failed: 0,
    target_dead: 0,
    target_not_live: 0,
    target_unknown: 0,
    no_source_slug: 0,
    mission_plan_missing: 0,
    mission_identity_mismatch: 0,
    mission_not_unshipped: 0,
    live_source_page_present: 0,
    mission_job_resolved: 0,
    shipped_source_unresolved: 0,
    shipped_source_self_target: 0,
    shipped_source_live: 0,
    shipped_source_unknown: 0,
  }
  const observedStatusCounts: Record<string, number> = {}
  const sourceStatusCounts: Record<string, number> = {}
  const laneCounts: Record<P6SourceStaleLane, number> = {
    unshipped_mission: 0,
    shipped_source_gone: 0,
  }
  const unresolvedReasons: Record<string, number> = {}
  const exactTargets = new Set<string>()
  const slugs = new Set<string>()
  const countedShippedMissions = new Set<string>()
  const eligible: P6SourceStaleSelectedRow[] = []
  let shippedResolutionAttempted = 0
  let shippedResolutionResolved = 0

  for (const row of candidates) {
    const exactTarget = batchAExactTarget(row.target_url)
    if (exactTarget) {
      exactTargets.add(exactTarget)
      const observation = context.observations ? context.observations[exactTarget] : undefined
      if (observation && typeof observation.status === 'number') {
        const key = String(observation.status)
        observedStatusCounts[key] = (observedStatusCounts[key] || 0) + 1
      }
    }
    const slug = String(row?.source_slug || '').trim()
    if (slug) slugs.add(slug)

    const plan = context.missionPlans ? context.missionPlans[slug] : undefined
    // Shipped-mission resolution accounting: every shipped candidate counts,
    // whether the resolver succeeded, failed or was never called.
    // Counted per MISSION (the resolver is invoked once per mission), not per
    // row: several planned edges can share one shipped mission.
    if (
      slug &&
      !countedShippedMissions.has(slug) &&
      isShippedMissionPlan(plan) &&
      missionIdentityMatches(plan, slug)
    ) {
      countedShippedMissions.add(slug)
      shippedResolutionAttempted += 1
      const resolution = context.shippedSources ? context.shippedSources[slug] : undefined
      if (resolution && resolution.ok === true) {
        shippedResolutionResolved += 1
        const sourceUrl = String(resolution.source?.url || '').trim()
        const sourceObservation = context.sourceObservations
          ? context.sourceObservations[sourceUrl]
          : undefined
        if (sourceObservation && typeof sourceObservation.status === 'number') {
          const key = String(sourceObservation.status)
          sourceStatusCounts[key] = (sourceStatusCounts[key] || 0) + 1
        }
      } else {
        const reason =
          resolution && 'reason' in resolution
            ? String(resolution.reason || 'no deterministic source resolution')
            : 'no deterministic source resolution'
        unresolvedReasons[reason] = (unresolvedReasons[reason] || 0) + 1
      }
    }

    const classification = classifySourceStaleRow(row, context)
    classCounts[classification] += 1
    if (classification !== 'eligible') continue

    eligible.push({
      id: String(row.id),
      source_slug: slug,
      lane: 'unshipped_mission',
      target_url: String(row.target_url),
      exactTarget: exactTarget as string,
      observedStatus: Number((context.observations || {})[exactTarget as string]?.status),
      gateReason: P6_SOURCE_STALE_GATE_REASON,
      source: null,
      mission: {
        clusterId: String(plan?.cluster_id || slug),
        status: plan?.status ?? null,
        shippedAt: plan?.shipped_at ?? null,
      },
    })
  }

  // Shipped lane selections are appended after the never-shipped lane, keeping
  // each lane internally deterministic while never mixing their evidence.
  for (const row of candidates) {
    if (classifySourceStaleRow(row, context) !== 'eligible_shipped_source_gone') continue
    const slug = String(row?.source_slug || '').trim()
    const plan = context.missionPlans ? context.missionPlans[slug] : undefined
    const resolution = context.shippedSources ? context.shippedSources[slug] : undefined
    if (!resolution || resolution.ok !== true) continue
    const sourceUrl = String(resolution.source.url).trim()
    const rawStatus = Number(
      (context.sourceObservations || {})[sourceUrl]?.status,
    )
    const gateReason = p6SourceStaleReasonForStatus(rawStatus)
    if (!gateReason) continue
    eligible.push({
      id: String(row.id),
      source_slug: slug,
      lane: 'shipped_source_gone',
      target_url: String(row.target_url),
      exactTarget: batchAExactTarget(row.target_url) as string,
      observedStatus: Number(
        (context.observations || {})[batchAExactTarget(row.target_url) as string]?.status,
      ),
      gateReason,
      source: {
        url: sourceUrl,
        rawStatus,
        resolver: resolution.source.resolver,
        contentType: resolution.source.contentType,
      },
      mission: {
        clusterId: String(plan?.cluster_id || slug),
        status: plan?.status ?? null,
        shippedAt: plan?.shipped_at ?? null,
      },
    })
  }

  for (const selected of eligible) {
    laneCounts[selected.lane] += 1
  }

  return {
    scannedRows: candidates.length,
    distinctTargets: exactTargets.size,
    distinctSourceSlugs: slugs.size,
    eligibleRows: eligible.length,
    rowsBeyondLimit: Math.max(0, eligible.length - limit),
    laneCounts,
    sourceStatusCounts,
    shippedSourceResolution: {
      attempted: shippedResolutionAttempted,
      resolved: shippedResolutionResolved,
      unresolved: shippedResolutionAttempted - shippedResolutionResolved,
      unresolvedReasons,
    },
    classCounts,
    observedStatusCounts,
    selected: eligible.slice(0, limit),
  }
}

export interface P6SourceStaleConfig {
  apply: boolean
  confirm: string | null
  limit: number
  json: boolean
  help: boolean
}

export type P6SourceStaleArgParse =
  | { ok: true; config: P6SourceStaleConfig }
  | { ok: false; error: string }

const DEFAULT_CONFIG: P6SourceStaleConfig = {
  apply: false,
  confirm: null,
  limit: P6_SOURCE_STALE_DEFAULT_LIMIT,
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
export function parseSourceStaleArgs(argv: string[]): P6SourceStaleArgParse {
  const config: P6SourceStaleConfig = { ...DEFAULT_CONFIG }
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
          if (limit > P6_SOURCE_STALE_HARD_MAX_ROWS) {
            return {
              ok: false,
              error: `--limit ${limit} exceeds the hard maximum ${P6_SOURCE_STALE_HARD_MAX_ROWS}`,
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
  if (config.apply && config.confirm !== P6_SOURCE_STALE_APPLY_CONFIRM_TOKEN) {
    return {
      ok: false,
      error: `--apply requires --confirm ${P6_SOURCE_STALE_APPLY_CONFIRM_TOKEN}`,
    }
  }
  return { ok: true, config }
}
