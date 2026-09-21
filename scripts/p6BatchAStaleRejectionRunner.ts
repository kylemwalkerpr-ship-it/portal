/**
 * P6 Batch A stale-rejection runner — IO orchestration with every boundary
 * injected (candidate read, fresh target verification, exact-row CAS write,
 * status counts, clock, log). This module never imports Supabase or the link
 * authority, never reads `process.env`, and contains no write verb of its own:
 * it is fully unit-testable, and the dry-run path provably makes ZERO write
 * calls because it returns before `deps.applyRejection` is ever reached.
 *
 * Fail-closed contract:
 *   · an `apply: true` config whose `confirm` does not EXACTLY equal
 *     P6_BATCH_A_APPLY_CONFIRM_TOKEN is refused before any status count,
 *     candidate read, live probe or write (argv parsing is never trusted
 *     alone) → zero IO calls, zero writes, fatal fail-closed summary;
 *   · candidate read errors or proven truncation → no writes;
 *   · global target-verification failure (thrown, or every requested target
 *     missing from the observation set) → no writes;
 *   · a per-target missing/unknown observation leaves only that target's rows
 *     untouched; 401/403/405/429/0/5xx are never dead;
 *   · the first write error aborts the remaining writes (already-applied rows
 *     are recorded, the rest are `notAttemptedWrites`), never reported as
 *     success or as zero.
 */

import type { P6TargetObservation } from './p6InterlinkDisposition'
import {
  P6_BATCH_A_APPLY_CONFIRM_TOKEN,
  P6_BATCH_A_DEFAULT_LIMIT,
  P6_BATCH_A_HARD_MAX_ROWS,
  P6_BATCH_A_TOOL,
  P6_BATCH_A_VERSION,
  buildBatchACasFence,
  buildBatchAUpdatePatch,
  isHistoricalJoblessNoProofCandidate,
  planBatchA,
  uniqueBatchACandidatesById,
  type P6BatchACandidateRow,
  type P6BatchAConfig,
  type P6BatchAFenceEntry,
  type P6BatchASelectedRow,
} from './p6BatchAStaleRejection'
import { p6TargetKey } from './p6InterlinkDisposition'

export interface P6BatchACandidateRead {
  rows: P6BatchACandidateRow[]
  /** True only when the read hit its cap and a probe row proved more rows exist. */
  truncated: boolean
  error?: string | null
}

export interface P6BatchAWrite {
  id: string
  target_url: string
  httpStatus: number
  patch: Record<string, string>
  fence: P6BatchAFenceEntry[]
}

export interface P6BatchAWriteResult {
  affected: number
  error?: string | null
}

export interface P6BatchAStatusCounts {
  planned: number | null
  rejected: number | null
  applied: number | null
  error?: string | null
}

export interface P6BatchARunnerDeps {
  readCandidates: () => Promise<P6BatchACandidateRead>
  observeTargets: (
    targetKeys: string[],
  ) => Promise<Record<string, P6TargetObservation | undefined>>
  applyRejection?: (write: P6BatchAWrite) => Promise<P6BatchAWriteResult>
  countStatuses?: () => Promise<P6BatchAStatusCounts | null>
  now?: () => string
  log?: (line: string) => void
}

export interface P6BatchAWriteOutcome {
  id: string
  target_url: string
  httpStatus: number
  outcome: 'rejected' | 'cas_skip' | 'error'
  affected: number | null
  error?: string | null
}

export interface P6BatchASummary {
  tool: string
  version: number
  mode: 'dry-run' | 'apply'
  apply: boolean
  generatedAt: string
  limit: number
  hardMaxRows: number
  scannedRows: number
  distinctTargetsProbed: number
  deadCandidateRows: number
  deadRowsBeyondLimit: number
  selectedForWrite: number
  attemptedWrites: number
  rejectedWrites: number
  casSkips: number
  notAttemptedWrites: number
  unknownUntouchedRows: number
  liveUntouchedRows: number
  legacyAuthWallRows: number
  observedStatusCounts: Record<string, number>
  aborted: boolean
  truncated: boolean
  failedClosed: boolean
  before: P6BatchAStatusCounts | null
  after: P6BatchAStatusCounts | null
  selected: P6BatchASelectedRow[]
  writeResults: P6BatchAWriteOutcome[]
  errors: string[]
  fatalErrors: string[]
  telemetryErrors: string[]
}

function emptySummary(
  config: P6BatchAConfig,
  generatedAt: string,
): P6BatchASummary {
  return {
    tool: P6_BATCH_A_TOOL,
    version: P6_BATCH_A_VERSION,
    mode: config.apply ? 'apply' : 'dry-run',
    apply: Boolean(config.apply),
    generatedAt,
    limit: config.limit,
    hardMaxRows: P6_BATCH_A_HARD_MAX_ROWS,
    scannedRows: 0,
    distinctTargetsProbed: 0,
    deadCandidateRows: 0,
    deadRowsBeyondLimit: 0,
    selectedForWrite: 0,
    attemptedWrites: 0,
    rejectedWrites: 0,
    casSkips: 0,
    notAttemptedWrites: 0,
    unknownUntouchedRows: 0,
    liveUntouchedRows: 0,
    legacyAuthWallRows: 0,
    observedStatusCounts: {},
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

function finalizeErrors(summary: P6BatchASummary): P6BatchASummary {
  summary.errors = [...summary.fatalErrors, ...summary.telemetryErrors]
  summary.failedClosed = summary.fatalErrors.length > 0
  return summary
}

/**
 * Run one bounded Batch A invocation. The caller owns argv parsing; this
 * function re-validates the bound so an out-of-range limit can never write.
 */
export async function runP6BatchARejection(
  config: P6BatchAConfig,
  deps: P6BatchARunnerDeps,
): Promise<P6BatchASummary> {
  const now = deps.now || (() => new Date().toISOString())
  const log = deps.log || (() => {})
  const generatedAt = now()
  const summary = emptySummary(config, generatedAt)

  // AUTHORIZATION GATE (defense in depth). Apply must never be reachable
  // through a programmatic call or a partially-trusted parsed config: re-check
  // the exact confirmation token HERE, before any status count, candidate
  // read, live probe or write, so an unauthorized `apply: true` performs ZERO
  // IO calls and returns a fatal fail-closed summary.
  if (config.apply && config.confirm !== P6_BATCH_A_APPLY_CONFIRM_TOKEN) {
    summary.fatalErrors.push(
      `apply mode requested without the exact ${P6_BATCH_A_APPLY_CONFIRM_TOKEN} confirmation token — refusing before any read, probe or write`,
    )
    return finalizeErrors(summary)
  }

  if (
    !Number.isInteger(config.limit) ||
    config.limit < 1 ||
    config.limit > P6_BATCH_A_HARD_MAX_ROWS
  ) {
    summary.fatalErrors.push(
      `limit ${config.limit} is outside the allowed 1..${P6_BATCH_A_HARD_MAX_ROWS} range`,
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

  let read: P6BatchACandidateRead
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

  const rawRows = Array.isArray(read?.rows) ? read.rows : []
  const candidates = uniqueBatchACandidatesById(
    rawRows.filter((row) => Boolean(row) && isHistoricalJoblessNoProofCandidate(row)),
  )
  const targetKeys = [
    ...new Set(
      candidates
        .map((row) => p6TargetKey(row.target_url))
        .filter((key) => Boolean(key)),
    ),
  ]
  summary.scannedRows = candidates.length
  summary.distinctTargetsProbed = targetKeys.length

  let observations: Record<string, P6TargetObservation | undefined> = {}
  if (targetKeys.length > 0) {
    try {
      observations = (await deps.observeTargets(targetKeys)) || {}
    } catch (error) {
      summary.fatalErrors.push(
        `target verification authority failed: ${error instanceof Error ? error.message : String(error)}`,
      )
      return finalizeErrors(summary)
    }
    const observedAny = targetKeys.some((key) => observations[key] != null)
    if (!observedAny) {
      summary.fatalErrors.push(
        `target verification authority returned no observation for any of ${targetKeys.length} distinct target(s)`,
      )
      return finalizeErrors(summary)
    }
  }

  const plan = planBatchA(candidates, observations, { limit: config.limit })
  summary.deadCandidateRows = plan.deadCandidateRows
  summary.deadRowsBeyondLimit = plan.deadRowsBeyondLimit
  summary.unknownUntouchedRows = plan.unknownUntouchedRows
  summary.liveUntouchedRows = plan.liveUntouchedRows
  summary.legacyAuthWallRows = plan.legacyAuthWallRows
  summary.observedStatusCounts = plan.observedStatusCounts
  summary.selected = plan.selected
  summary.selectedForWrite = plan.selected.length
  summary.notAttemptedWrites = plan.selected.length

  log(
    `${summary.mode.toUpperCase()}: scanned ${summary.scannedRows} candidate rows, probed ${summary.distinctTargetsProbed} distinct targets, ` +
      `${summary.deadCandidateRows} dead (404/410) candidate rows, selecting ${summary.selectedForWrite} (limit ${config.limit}).`,
  )

  if (!config.apply) {
    // DRY RUN: no write dependency is ever called.
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

  for (const row of plan.selected) {
    const write: P6BatchAWrite = {
      id: row.id,
      target_url: row.target_url,
      httpStatus: row.httpStatus,
      patch: buildBatchAUpdatePatch({ httpStatus: row.httpStatus, nowIso: generatedAt }),
      fence: buildBatchACasFence({
        id: row.id,
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
      }),
    }
    let result: P6BatchAWriteResult
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
        target_url: row.target_url,
        httpStatus: row.httpStatus,
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
        target_url: row.target_url,
        httpStatus: row.httpStatus,
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
        target_url: row.target_url,
        httpStatus: row.httpStatus,
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
        target_url: row.target_url,
        httpStatus: row.httpStatus,
        outcome: 'error',
        affected: Number.isFinite(affected) ? affected : null,
        error: `unexpected affected-row count ${affected}`,
      })
      break
    }
    summary.rejectedWrites += 1
    summary.writeResults.push({
      id: row.id,
      target_url: row.target_url,
      httpStatus: row.httpStatus,
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

export { P6_BATCH_A_DEFAULT_LIMIT }
