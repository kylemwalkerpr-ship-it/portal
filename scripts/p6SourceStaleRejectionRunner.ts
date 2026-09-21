/**
 * P6 Batch B source-stale runner — IO orchestration with every boundary
 * injected (candidate read, durable mission read, live-estate guard, durable
 * mission→content_jobs exclusion probe, live target probe, exact-row CAS
 * write, status counts, clock, log). This module never imports Supabase or the
 * link authority, never reads `process.env`, and contains no write verb of its
 * own: it is fully unit-testable, and the dry-run path provably makes ZERO
 * write calls because it returns before `deps.applyRejection` is ever reached.
 *
 * Fail-closed contract:
 *   · an `apply: true` config whose `confirm` does not EXACTLY equal
 *     P6_SOURCE_STALE_APPLY_CONFIRM_TOKEN is refused before any status count,
 *     candidate read, mission read, live guard, probe or write (argv parsing is
 *     never trusted alone) → zero IO calls, fatal fail-closed summary;
 *   · candidate read errors or proven truncation → no writes;
 *   · a durable mission-read failure → no writes (the never-shipped fence is
 *     the whole basis of this lane and can never be assumed);
 *   · a live-estate guard failure → no writes (without the live URL set the
 *     "no live source page" guard is unproven);
 *   · global target-verification failure (thrown, or no observation for any
 *     requested target) → no writes;
 *   · APPLY additionally requires the durable mission→content_jobs exclusion
 *     probe to have SUCCEEDED: an unavailable probe fails apply closed with a
 *     fatal error (dry run records the unavailability truthfully instead), so
 *     a row can never be rejected while an unknown durable job identity might
 *     exist for its mission;
 *   · the first write error aborts the remaining writes (already-written rows
 *     are recorded, the rest are `notAttemptedWrites`), never reported as
 *     success or as zero.
 */

import {
  P6_SOURCE_STALE_APPLY_CONFIRM_TOKEN,
  P6_SOURCE_STALE_HARD_MAX_ROWS,
  P6_SOURCE_STALE_TOOL,
  P6_SOURCE_STALE_VERSION,
  buildSourceStaleCasFence,
  buildSourceStaleUpdatePatch,
  isShippedMissionPlan,
  liveSlugMatches,
  missionIdentityMatches,
  planSourceStale,
  type P6SourceStaleCandidateRow,
  type P6SourceStaleClass,
  type P6SourceStaleConfig,
  type P6SourceStaleLane,
  type P6SourceStaleMissionPlan,
  type P6SourceStaleSelectedRow,
  type P6SourceStaleShippedResolutionSummary,
  type P6ShippedSourceResolution,
} from './p6SourceStaleRejection'
import type { P6BatchAFenceEntry } from './p6BatchAStaleRejection'
import type { P6TargetObservation } from './p6InterlinkDisposition'

export interface P6SourceStaleCandidateRead {
  rows: P6SourceStaleCandidateRow[]
  /** True only when the read hit its cap and a probe row proved more rows exist. */
  truncated: boolean
  error?: string | null
}

/**
 * ONE shipped mission offered to the deterministic ownership resolver. Every
 * input is read from the durable plan row: nothing is inferred from the slug.
 */
export interface P6ShippedMissionResolutionInput {
  clusterId: string
  primaryTerm: string | null
  country: string | null
  /** The planner plan body's persisted contentType (exact mission input). */
  contentType: string | null
}

export interface P6ShippedSourceResolutionRequest {
  missions: P6ShippedMissionResolutionInput[]
}

export interface P6SourceStaleMissionRead {
  /** Durable mission records keyed by exact `cluster_id`; missing key = no row. */
  plans: Record<string, P6SourceStaleMissionPlan | null | undefined>
  error?: string | null
}

export interface P6SourceStaleLiveEstateRead {
  /** Live estate URLs (sitemap-derived) considered by the fail-closed guard. */
  urls: string[]
  error?: string | null
}

export interface P6SourceStaleMissionJobProbe {
  /** True only when the durable exclusion probe actually ran to completion. */
  ok: boolean
  /** Mission slugs resolved to a durable `content_jobs` identity → ineligible. */
  resolvedSlugs?: Record<string, string>
  error?: string | null
}

export interface P6SourceStaleWrite {
  id: string
  source_slug: string
  target_url: string
  patch: Record<string, string>
  fence: P6BatchAFenceEntry[]
}

export interface P6SourceStaleWriteResult {
  affected: number
  error?: string | null
}

export interface P6SourceStaleStatusCounts {
  planned: number | null
  rejected: number | null
  applied: number | null
  error?: string | null
}

export interface P6SourceStaleRunnerDeps {
  readCandidates: () => Promise<P6SourceStaleCandidateRead>
  /** Durable `seo_cluster_plans` read for the exact candidate slugs. */
  readMissionPlans: (slugs: string[]) => Promise<P6SourceStaleMissionRead>
  /** Live estate URL set backing the fail-closed live-source guard. */
  readLiveEstateUrls: () => Promise<P6SourceStaleLiveEstateRead>
  /** Fresh live-target probe, keyed by the EXACT trimmed stored target_url. */
  observeTargets: (
    exactTargets: string[],
  ) => Promise<Record<string, P6TargetObservation | undefined>>
  /**
   * Durable mission→`content_jobs` exclusion probe. OPTIONAL for dry run
   * (recorded truthfully as unavailable) and MANDATORY for apply.
   */
  probeMissionJobIdentity?: (
    slugs: string[],
  ) => Promise<P6SourceStaleMissionJobProbe>
  /**
   * Deterministic ownership resolution for shipped missions (ONE exact
   * canonical source URL each). Optional: when absent every shipped mission is
   * `shipped_source_unresolved` (fail-closed, counted) and the shipped lane
   * selects nothing. A THROW is an authority failure and fails the run closed.
   */
  resolveShippedSources?: (
    missions: P6ShippedMissionResolutionInput[],
  ) => Promise<Record<string, P6ShippedSourceResolution | undefined>>
  /**
   * Fresh GET-only probe of the RESOLVED canonical source URLs, keyed by the
   * exact resolved URL. Optional for the same reason as the resolver: without
   * it every resolved shipped source stays `shipped_source_unknown`.
   */
  probeSourceUrls?: (
    urls: string[],
  ) => Promise<Record<string, P6TargetObservation | undefined>>
  applyRejection?: (write: P6SourceStaleWrite) => Promise<P6SourceStaleWriteResult>
  countStatuses?: () => Promise<P6SourceStaleStatusCounts | null>
  now?: () => string
  log?: (line: string) => void
}

export interface P6SourceStaleWriteOutcome {
  id: string
  source_slug: string
  target_url: string
  outcome: 'rejected' | 'cas_skip' | 'error'
  affected: number | null
  error?: string | null
}

export interface P6SourceStaleSummary {
  tool: string
  version: number
  mode: 'dry-run' | 'apply'
  apply: boolean
  generatedAt: string
  limit: number
  hardMaxRows: number
  scannedRows: number
  distinctTargetsProbed: number
  distinctSourceSlugs: number
  missionPlanRowsRead: number
  liveEstateUrlsConsidered: number
  liveSourceSlugMatches: number
  missionJobIdentityProbe: {
    available: boolean
    resolvedSlugs: number
    error?: string | null
  }
  /** Deterministic shipped-mission ownership resolution accounting. */
  shippedSourceResolution: P6SourceStaleShippedResolutionSummary
  /** Distinct resolved canonical source URLs actually probed. */
  distinctSourceUrlsProbed: number
  /** Fresh RAW source-status histogram (404/410 prove a shipped source gone). */
  sourceStatusCounts: Record<string, number>
  eligibleRows: number
  rowsBeyondLimit: number
  selectedForWrite: number
  /** Eligible rows per independent lane. */
  laneCounts: Record<P6SourceStaleLane, number>
  /** Selected rows per written gate reason (both must be allowlisted). */
  selectionByReason: Record<string, number>
  attemptedWrites: number
  rejectedWrites: number
  casSkips: number
  notAttemptedWrites: number
  classCounts: Record<P6SourceStaleClass, number>
  observedStatusCounts: Record<string, number>
  /** Explicit blockers that would prevent an authorized apply right now. */
  applyBlockers: string[]
  aborted: boolean
  truncated: boolean
  failedClosed: boolean
  before: P6SourceStaleStatusCounts | null
  after: P6SourceStaleStatusCounts | null
  selected: P6SourceStaleSelectedRow[]
  writeResults: P6SourceStaleWriteOutcome[]
  errors: string[]
  fatalErrors: string[]
  telemetryErrors: string[]
}

function emptyClassCounts(): Record<P6SourceStaleClass, number> {
  return {
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
}

function emptySummary(
  config: P6SourceStaleConfig,
  generatedAt: string,
): P6SourceStaleSummary {
  return {
    tool: P6_SOURCE_STALE_TOOL,
    version: P6_SOURCE_STALE_VERSION,
    mode: config.apply ? 'apply' : 'dry-run',
    apply: Boolean(config.apply),
    generatedAt,
    limit: config.limit,
    hardMaxRows: P6_SOURCE_STALE_HARD_MAX_ROWS,
    scannedRows: 0,
    distinctTargetsProbed: 0,
    distinctSourceSlugs: 0,
    missionPlanRowsRead: 0,
    liveEstateUrlsConsidered: 0,
    liveSourceSlugMatches: 0,
    missionJobIdentityProbe: { available: false, resolvedSlugs: 0, error: null },
    shippedSourceResolution: { attempted: 0, resolved: 0, unresolved: 0, unresolvedReasons: {} },
    distinctSourceUrlsProbed: 0,
    sourceStatusCounts: {},
    eligibleRows: 0,
    rowsBeyondLimit: 0,
    selectedForWrite: 0,
    laneCounts: { unshipped_mission: 0, shipped_source_gone: 0 },
    selectionByReason: {},
    attemptedWrites: 0,
    rejectedWrites: 0,
    casSkips: 0,
    notAttemptedWrites: 0,
    classCounts: emptyClassCounts(),
    observedStatusCounts: {},
    applyBlockers: [],
    aborted: false,
    truncated: false,
    failedClosed: false,
    before: null,
    after: null,
    selected: [],
    writeResults: [],
    errors: [],
    fatalErrors: [],
    telemetryErrors: [],
  }
}

function finalizeErrors(summary: P6SourceStaleSummary): P6SourceStaleSummary {
  summary.errors = [...summary.fatalErrors, ...summary.telemetryErrors]
  summary.failedClosed = summary.fatalErrors.length > 0
  return summary
}

/**
 * Run one bounded Batch B invocation. The caller owns argv parsing; this
 * function re-validates the confirmation token and the bound so an
 * unauthorized or out-of-range call can never write.
 */
export async function runP6SourceStaleRejection(
  config: P6SourceStaleConfig,
  deps: P6SourceStaleRunnerDeps,
): Promise<P6SourceStaleSummary> {
  const now = deps.now || (() => new Date().toISOString())
  const log = deps.log || (() => {})
  const generatedAt = now()
  const summary = emptySummary(config, generatedAt)

  // AUTHORIZATION GATE (defense in depth). Apply must never be reachable
  // through a programmatic call or a partially-trusted parsed config: re-check
  // the exact confirmation token HERE, before any status count, read, guard,
  // probe or write, so an unauthorized `apply: true` performs ZERO IO calls.
  if (config.apply && config.confirm !== P6_SOURCE_STALE_APPLY_CONFIRM_TOKEN) {
    summary.fatalErrors.push(
      `apply mode requested without the exact ${P6_SOURCE_STALE_APPLY_CONFIRM_TOKEN} confirmation token — refusing before any read, guard, probe or write`,
    )
    return finalizeErrors(summary)
  }

  if (
    !Number.isInteger(config.limit) ||
    config.limit < 1 ||
    config.limit > P6_SOURCE_STALE_HARD_MAX_ROWS
  ) {
    summary.fatalErrors.push(
      `limit ${config.limit} is outside the allowed 1..${P6_SOURCE_STALE_HARD_MAX_ROWS} range`,
    )
    return finalizeErrors(summary)
  }

  if (deps.countStatuses) {
    try {
      summary.before = await deps.countStatuses()
    } catch (error) {
      summary.telemetryErrors.push(
        `before-status count failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  let read: P6SourceStaleCandidateRead
  try {
    read = await deps.readCandidates()
  } catch (error) {
    summary.fatalErrors.push(
      `candidate read failed: ${error instanceof Error ? error.message : String(error)}`,
    )
    return finalizeErrors(summary)
  }
  summary.truncated = Boolean(read?.truncated)
  if (read?.error) {
    summary.fatalErrors.push(`candidate read incomplete: ${read.error}`)
    return finalizeErrors(summary)
  }
  if (summary.truncated) {
    summary.fatalErrors.push(
      'candidate read was truncated at the scan cap — refusing to plan or write from an incomplete estate',
    )
    return finalizeErrors(summary)
  }

  const rows = Array.isArray(read?.rows) ? read.rows : []
  summary.scannedRows = rows.length
  const slugs = [
    ...new Set(
      rows
        .map((row) => String(row?.source_slug || '').trim())
        .filter(Boolean),
    ),
  ]
  summary.distinctSourceSlugs = slugs.length

  // Durable mission fence. Without it there is no provable "mission never
  // shipped" predicate, so a read failure is fatal (never assumed).
  let missionRead: P6SourceStaleMissionRead
  try {
    missionRead = await deps.readMissionPlans(slugs)
  } catch (error) {
    summary.fatalErrors.push(
      `durable mission read failed: ${error instanceof Error ? error.message : String(error)}`,
    )
    return finalizeErrors(summary)
  }
  if (missionRead?.error) {
    summary.fatalErrors.push(`durable mission read incomplete: ${missionRead.error}`)
    return finalizeErrors(summary)
  }
  const missionPlans = missionRead?.plans || {}
  summary.missionPlanRowsRead = Object.values(missionPlans).filter(Boolean).length

  // Deterministic ownership resolution for the SHIPPED lane. Only missions whose
  // durable plan row proves an exact shipped status + ship stamp AND whose
  // `cluster_id` equals the row's `source_slug` verbatim are offered — nothing
  // is inferred from the slug, and a missing resolver simply leaves the shipped
  // lane ineligible (counted as unresolved, never guessed).
  const shippedMissionInputs: P6ShippedMissionResolutionInput[] = []
  for (const row of rows) {
    const slug = String(row?.source_slug || '').trim()
    if (!slug) continue
    const plan = missionPlans[slug]
    if (!plan) continue
    if (!missionIdentityMatches(plan, slug)) continue
    if (!isShippedMissionPlan(plan)) continue
    if (shippedMissionInputs.some((mission) => mission.clusterId === slug)) continue
    shippedMissionInputs.push({
      clusterId: slug,
      primaryTerm: plan.primary_term == null ? null : String(plan.primary_term),
      country: plan.country == null ? null : String(plan.country),
      contentType:
        plan.plan && typeof plan.plan === 'object' && plan.plan.contentType != null
          ? String(plan.plan.contentType)
          : null,
    })
  }

  let shippedSources: Record<string, P6ShippedSourceResolution | undefined> = {}
  if (shippedMissionInputs.length > 0) {
    if (deps.resolveShippedSources) {
      try {
        shippedSources = (await deps.resolveShippedSources(shippedMissionInputs)) || {}
      } catch (error) {
        summary.fatalErrors.push(
          `shipped-source ownership resolver failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
        return finalizeErrors(summary)
      }
    } else {
      for (const mission of shippedMissionInputs) {
        shippedSources[mission.clusterId] = {
          ok: false,
          reason: 'no deterministic shipped-source resolver dependency was provided',
        }
      }
    }
  }
  const resolvedSourceUrls = [
    ...new Set(
      shippedMissionInputs.flatMap((mission) => {
        const resolution = shippedSources[mission.clusterId]
        if (!resolution || resolution.ok !== true) return []
        const url = String(resolution.source?.url || '').trim()
        return url ? [url] : []
      }),
    ),
  ]

  // Live-source guard. Without the live URL set the "no live source page"
  // condition is unproven, so a read failure is fatal.
  let liveEstate: P6SourceStaleLiveEstateRead
  try {
    liveEstate = await deps.readLiveEstateUrls()
  } catch (error) {
    summary.fatalErrors.push(
      `live estate guard failed: ${error instanceof Error ? error.message : String(error)}`,
    )
    return finalizeErrors(summary)
  }
  if (liveEstate?.error) {
    summary.fatalErrors.push(`live estate guard incomplete: ${liveEstate.error}`)
    return finalizeErrors(summary)
  }
  const liveUrls = Array.isArray(liveEstate?.urls) ? liveEstate.urls : []
  summary.liveEstateUrlsConsidered = liveUrls.length

  // Durable mission→content_jobs exclusion probe. Optional in dry run
  // (recorded truthfully), MANDATORY before any write.
  const resolvedSlugs: Record<string, string> = {}
  if (deps.probeMissionJobIdentity) {
    try {
      const probe = await deps.probeMissionJobIdentity(slugs)
      if (probe?.ok) {
        summary.missionJobIdentityProbe = {
          available: true,
          resolvedSlugs: Object.keys(probe.resolvedSlugs || {}).length,
          error: null,
        }
        for (const [slug, jobId] of Object.entries(probe.resolvedSlugs || {})) {
          resolvedSlugs[slug] = String(jobId)
        }
      } else {
        summary.missionJobIdentityProbe = {
          available: false,
          resolvedSlugs: 0,
          error: probe?.error || 'durable mission→content_jobs exclusion probe reported failure',
        }
      }
    } catch (error) {
      summary.missionJobIdentityProbe = {
        available: false,
        resolvedSlugs: 0,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  } else {
    summary.missionJobIdentityProbe = {
      available: false,
      resolvedSlugs: 0,
      error: 'no durable mission→content_jobs exclusion probe dependency was provided',
    }
  }

  // Fresh live-target probe, keyed by the EXACT trimmed stored target_url.
  const exactTargets = [
    ...new Set(
      rows
        .map((row) => String(row?.target_url || '').trim())
        .filter((target) => {
          if (!target) return false
          try {
            const parsed = new URL(target)
            return (
              (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
              Boolean(parsed.hostname)
            )
          } catch {
            return false
          }
        }),
    ),
  ]
  summary.distinctTargetsProbed = exactTargets.length

  let observations: Record<string, P6TargetObservation | undefined> = {}
  if (exactTargets.length > 0) {
    try {
      observations = (await deps.observeTargets(exactTargets)) || {}
    } catch (error) {
      summary.fatalErrors.push(
        `target verification authority failed: ${error instanceof Error ? error.message : String(error)}`,
      )
      return finalizeErrors(summary)
    }
    const observedAny = exactTargets.some((target) => observations[target] != null)
    if (!observedAny) {
      summary.fatalErrors.push(
        `target verification authority returned no observation for any of ${exactTargets.length} distinct target(s)`,
      )
      return finalizeErrors(summary)
    }
  }

  const liveSourceSlugs = liveSlugMatches(slugs, liveUrls)
  summary.liveSourceSlugMatches = liveSourceSlugs.size

  // Fresh GET-only proof of the RESOLVED canonical source URLs (shipped lane).
  // A throw is an authority failure (fail closed); a resolved URL with no
  // observation simply stays `shipped_source_unknown` and is never written.
  let sourceObservations: Record<string, P6TargetObservation | undefined> = {}
  if (resolvedSourceUrls.length > 0 && deps.probeSourceUrls) {
    try {
      sourceObservations = (await deps.probeSourceUrls(resolvedSourceUrls)) || {}
    } catch (error) {
      summary.fatalErrors.push(
        `shipped-source probe authority failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
      return finalizeErrors(summary)
    }
  }
  summary.distinctSourceUrlsProbed = resolvedSourceUrls.length

  const plan = planSourceStale(
    rows,
    {
      observations,
      sourceObservations,
      missionPlans,
      shippedSources,
      liveSourceSlugs,
      missionJobResolvedSlugs: new Set(Object.keys(resolvedSlugs)),
    },
    { limit: config.limit },
  )
  summary.classCounts = plan.classCounts
  summary.observedStatusCounts = plan.observedStatusCounts
  summary.sourceStatusCounts = plan.sourceStatusCounts
  summary.shippedSourceResolution = plan.shippedSourceResolution
  summary.laneCounts = plan.laneCounts
  summary.eligibleRows = plan.eligibleRows
  summary.rowsBeyondLimit = plan.rowsBeyondLimit
  summary.selected = plan.selected
  summary.selectedForWrite = plan.selected.length
  summary.notAttemptedWrites = plan.selected.length
  summary.distinctTargetsProbed = plan.distinctTargets || summary.distinctTargetsProbed
  summary.selectionByReason = plan.selected.reduce<Record<string, number>>((acc, row) => {
    acc[row.gateReason] = (acc[row.gateReason] || 0) + 1
    return acc
  }, {})

  if (!summary.missionJobIdentityProbe.available) {
    summary.applyBlockers.push(
      `durable mission→content_jobs exclusion probe unavailable (${
        summary.missionJobIdentityProbe.error || 'unknown reason'
      }) — apply would fail closed`,
    )
  }
  if (shippedMissionInputs.length > 0 && summary.shippedSourceResolution.resolved === 0) {
    summary.applyBlockers.push(
      `deterministic shipped-source ownership resolver produced no canonical source URL for any of ${shippedMissionInputs.length} shipped mission(s) — the shipped-source class is unavailable and selects nothing`,
    )
  }
  if (summary.sourceStatusCounts['404'] || summary.sourceStatusCounts['410']) {
    // Truthful visibility only: the raw source statuses prove the shipped-source
    // class; they never touch the never-shipped lane's guards.
    log(
      `shipped-source probe: ${
        (summary.sourceStatusCounts['404'] || 0) + (summary.sourceStatusCounts['410'] || 0)
      } resolved canonical source URL(s) answered a raw 404/410`,
    )
  }

  log(
    `${summary.mode.toUpperCase()}: scanned ${summary.scannedRows} planned jobless/no-proof rows across ${summary.distinctSourceSlugs} source slugs; ` +
      `${summary.missionPlanRowsRead} durable mission record(s) read, ${summary.liveEstateUrlsConsidered} live estate URL(s) considered ` +
      `(${summary.liveSourceSlugMatches} slug match(es) fail-closed), ${summary.distinctTargetsProbed} distinct live target(s) probed, ` +
      `${summary.eligibleRows} eligible source-stale row(s), selecting ${summary.selectedForWrite} (limit ${config.limit}).`,
  )

  if (!config.apply) {
    // DRY RUN: no write dependency is ever called.
    summary.applyBlockers.push('mode is dry-run')
    if (deps.countStatuses) {
      try {
        summary.after = await deps.countStatuses()
      } catch (error) {
        summary.telemetryErrors.push(
          `after-status count failed: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }
    return finalizeErrors(summary)
  }

  const applyRejection = deps.applyRejection
  if (!applyRejection) {
    summary.fatalErrors.push('apply mode requested but no write dependency was provided')
    return finalizeErrors(summary)
  }
  if (!summary.missionJobIdentityProbe.available) {
    summary.fatalErrors.push(
      `apply mode requires a WORKING durable mission→content_jobs exclusion probe: ${
        summary.missionJobIdentityProbe.error || 'unavailable'
      } — refusing to write while a durable job identity may exist`,
    )
    return finalizeErrors(summary)
  }

  for (const row of plan.selected) {
    const write: P6SourceStaleWrite = {
      id: row.id,
      source_slug: row.source_slug,
      target_url: row.target_url,
      patch: buildSourceStaleUpdatePatch({ nowIso: generatedAt, gateReason: row.gateReason }),
      fence: buildSourceStaleCasFence(
        {
          id: row.id,
          source_slug: row.source_slug,
          target_url: row.target_url,
          status: 'planned',
          source_url: null,
          source_job_id: null,
          verification_state: null,
          verified_at: null,
          verification_evidence: null,
          verification_attempted_at: null,
          staged_at: null,
          applied_at: null,
        },
        { lane: row.lane, sourceSlug: row.source_slug },
      ),
    }
    let result: P6SourceStaleWriteResult
    try {
      result = await applyRejection(write)
    } catch (error) {
      summary.attemptedWrites += 1
      summary.aborted = true
      summary.fatalErrors.push(
        `write threw for row ${row.id}: ${error instanceof Error ? error.message : String(error)}`,
      )
      summary.writeResults.push({
        id: row.id,
        source_slug: row.source_slug,
        target_url: row.target_url,
        outcome: 'error',
        affected: null,
        error: error instanceof Error ? error.message : String(error),
      })
      break
    }
    summary.attemptedWrites += 1
    if (result?.error) {
      summary.aborted = true
      summary.fatalErrors.push(`write failed for row ${row.id}: ${result.error}`)
      summary.writeResults.push({
        id: row.id,
        source_slug: row.source_slug,
        target_url: row.target_url,
        outcome: 'error',
        affected: null,
        error: result.error,
      })
      break
    }
    const affected = Number(result?.affected)
    if (affected === 0) {
      // Exact-row CAS miss: the row changed concurrently. A skip, never success.
      summary.casSkips += 1
      summary.writeResults.push({
        id: row.id,
        source_slug: row.source_slug,
        target_url: row.target_url,
        outcome: 'cas_skip',
        affected: 0,
      })
      continue
    }
    if (affected !== 1) {
      summary.aborted = true
      summary.fatalErrors.push(
        `write for row ${row.id} reported ${affected} affected rows (expected exactly 1)`,
      )
      summary.writeResults.push({
        id: row.id,
        source_slug: row.source_slug,
        target_url: row.target_url,
        outcome: 'error',
        affected: Number.isFinite(affected) ? affected : null,
        error: `unexpected affected-row count ${affected}`,
      })
      break
    }
    summary.rejectedWrites += 1
    summary.writeResults.push({
      id: row.id,
      source_slug: row.source_slug,
      target_url: row.target_url,
      outcome: 'rejected',
      affected: 1,
    })
  }

  summary.notAttemptedWrites = plan.selected.length - summary.attemptedWrites

  if (deps.countStatuses) {
    try {
      summary.after = await deps.countStatuses()
    } catch (error) {
      summary.telemetryErrors.push(
        `after-status count failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  return finalizeErrors(summary)
}
