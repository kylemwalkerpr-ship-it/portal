/**
 * lib/seoFactory/postPersistInterlinkBind.ts
 *
 * P6 M1 — close the non-stream JOBLESS window without guessing a job id.
 *
 * The non-stream pipeline performs its Git ship BEFORE `persistPipelineJob`
 * creates/updates the durable `content_jobs` row. `ship.ts` therefore stages
 * the draft's planned `seo_interlinks` rows WITHOUT job identity (`jobId:
 * opts.jobId || null` → jobless), and the scheduled reconciler deliberately
 * refuses to auto-finalize a row that carries no exact `source_job_id` (H1) —
 * so a perfectly successful ship could sit jobless until a human intervened.
 *
 * This module closes that window from the only truthful direction: AFTER the
 * exact durable id exists. It re-runs the SAME staging pass
 * (`stageEngineInterlinksForVerification`) with the exact plan canonicalUrl,
 * the exact persisted `content_jobs.id`, the primary keyword and the shipped
 * body — the SAME inputs the ship surface used, plus the real id it did not
 * have yet. The stager only ever SELECTs/UPDATEs `status='planned'` rows, so
 * this second pass can rebind an already-staged jobless row to its real job
 * but can NEVER create applied truth, proof, or a verification verdict.
 *
 * Guard rails (all fail closed):
 *   · only a real, non-dry SUCCESSFUL Git ship runs the pass. The accepted
 *     statuses are exactly the ones where `ship.ts` itself stages planned
 *     interlinks (`deployed` on the direct-main path, `merged` on the PR-merge
 *     path); a dry run, a withheld/failed ship or a PR that never merged left
 *     no staged row to rebind, so nothing is invented for it;
 *   · a ship that ALREADY carried an exact job id (the stream's early row, or
 *     a non-stream `input.existingJobId`) is skipped — its staged rows are
 *     already bound to the exact job;
 *   · the job id must pass the shared exact-UUID predicate
 *     (`normalizeSourceJobId`, the same authority the stager uses); an absent
 *     or malformed id is a truthful SKIP, never a guessed `plan-*` identity;
 *   · the pass never throws and never fails a successful content ship: a
 *     degraded rebind is reported as observability (console + the additive
 *     outcome field) while the ship verdict stays untouched.
 *
 * Deliberately NOT used as job identity: `input.cluster?.existingJobId`. The
 * pipeline persists the cluster's `existingJobId` only as `gsc_json.cluster`
 * METADATA (see `persistPipelineJobCore`); it is the canonical/cluster row the
 * expansion was resolved FROM, not the `content_jobs` row this run rewrites,
 * so the existing ownership/cluster semantics cannot prove it is this ship's
 * subject. Binding interlinks to it would fabricate job identity — exactly
 * what this module exists to avoid.
 */

import { normalizeSourceJobId } from './sourceJobIdentity'
import type {
  StageEngineInterlinksInput,
  StageEngineInterlinksResult,
} from './interlinkVerification'

/**
 * The exact ship verdicts where `ship.ts` staged planned interlinks without a
 * job id (direct-main deploy, and the PR merge). Only those ships can have
 * left a jobless staged row behind, so only those are rebound here.
 */
export const POST_PERSIST_BIND_SHIP_STATUSES = ['deployed', 'merged'] as const

export type PostPersistBindReason =
  | 'bound'
  | 'dry-run'
  | 'ship-not-successful'
  | 'ship-surface-staged-nothing'
  | 'ship-already-job-bound'
  | 'no-exact-durable-job-id'
  | 'canonical-url-missing'

export interface PostPersistBindDecision {
  /** True only when the second staging pass must run. */
  bind: boolean
  reason: PostPersistBindReason
}

export interface PostPersistBindInput {
  /** The plan canonicalUrl — the only source URL authority. */
  canonicalUrl?: string | null
  /** The exact durable `content_jobs.id` `persistPipelineJob` just returned. */
  persistedJobId?: string | null
  /** The exact job id the ship itself already carried (e.g. `input.existingJobId`). */
  shippedJobId?: string | null
  /** The ship verdict — only a real, non-dry successful ship may rebind. */
  shipResult?: { status?: string | null; dryRun?: boolean | null } | null
  dryRun?: boolean
  primaryKeyword?: string | null
  /** The exact shipped draft body. */
  body?: string | null
}

export interface PostPersistBindOutcome {
  /**
   * False when the guards skipped the pass (reason carries the skip truth).
   * True with `reason: 'bound'` means the pass RAN — the outcome is then in
   * `staged` / `rebounded` / `failed` / `warning` / `error`, and a failed or
   * degraded rebind is always visible there (never implied success).
   */
  attempted: boolean
  reason: PostPersistBindReason
  sourceUrl: string | null
  jobId: string | null
  staged: number
  candidates: number
  rebounded: number
  skipped: number
  failed: number
  warning: string | null
  error: string | null
}

export type StageEngineInterlinks = (
  input: StageEngineInterlinksInput,
) => Promise<StageEngineInterlinksResult>

/**
 * Pure guard: may the post-persist rebind run for this ship?
 *
 * Order matters — a dry run or a failed/withheld ship can never bind, and an
 * already exact-job-bound ship is skipped (the ship surface already bound the
 * exact id, so a second pass would be a redundant DB round-trip).
 */
export function decidePostPersistInterlinkBind(
  input: PostPersistBindInput,
): PostPersistBindDecision {
  if (input.dryRun || input.shipResult?.dryRun) return { bind: false, reason: 'dry-run' }
  const status = String(input.shipResult?.status || '').trim()
  if (!(POST_PERSIST_BIND_SHIP_STATUSES as readonly string[]).includes(status)) {
    // A created-but-unmerged PR did ship to Git, but `ship.ts` stages planned
    // interlinks ONLY on the direct-main / merged paths — so there is no
    // already-staged row to rebind and inventing one is out of scope.
    if (status === 'pr_created') return { bind: false, reason: 'ship-surface-staged-nothing' }
    return { bind: false, reason: 'ship-not-successful' }
  }
  if (normalizeSourceJobId(input.shippedJobId)) {
    return { bind: false, reason: 'ship-already-job-bound' }
  }
  if (!normalizeSourceJobId(input.persistedJobId)) {
    return { bind: false, reason: 'no-exact-durable-job-id' }
  }
  if (!/^https?:\/\//i.test(String(input.canonicalUrl || '').trim())) {
    return { bind: false, reason: 'canonical-url-missing' }
  }
  return { bind: true, reason: 'bound' }
}

function emptyOutcome(
  reason: PostPersistBindReason,
  sourceUrl: string | null,
  jobId: string | null,
): PostPersistBindOutcome {
  return {
    attempted: false,
    reason,
    sourceUrl,
    jobId,
    staged: 0,
    candidates: 0,
    rebounded: 0,
    skipped: 0,
    failed: 0,
    warning: null,
    error: null,
  }
}

/**
 * Run the second (post-persist) planned-only staging pass. Never throws.
 *
 * `deps.stage` is injectable so the guard/observability contract can be
 * exercised without a DB; production uses the real planned-only stager.
 */
export async function bindStagedInterlinksToPersistedJob(
  input: PostPersistBindInput,
  deps: { stage?: StageEngineInterlinks } = {},
): Promise<PostPersistBindOutcome> {
  const decision = decidePostPersistInterlinkBind(input)
  const sourceUrl = String(input.canonicalUrl || '').trim() || null
  const jobId = normalizeSourceJobId(input.persistedJobId)
  if (!decision.bind || !jobId || !sourceUrl) {
    return emptyOutcome(decision.reason, sourceUrl, jobId)
  }

  let staged: StageEngineInterlinksResult
  try {
    const stage =
      deps.stage ||
      (async (stagingInput: StageEngineInterlinksInput) =>
        (await import('./interlinkVerification')).stageEngineInterlinksForVerification(stagingInput))
    staged = await stage({
      canonicalUrl: sourceUrl,
      jobId,
      primaryKeyword: String(input.primaryKeyword || ''),
      body: String(input.body || ''),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || 'rebind failed')
    console.warn(
      '[seoFactory/pipeline] post-persist interlink rebind failed — the content ship stays successful; staged rows remain unresolved/jobless',
      { sourceUrl, jobId, error: message.slice(0, 300) },
    )
    return {
      ...emptyOutcome('bound', sourceUrl, jobId),
      attempted: true,
      failed: 1,
      error: message.slice(0, 300),
    }
  }

  const outcome: PostPersistBindOutcome = {
    attempted: true,
    reason: 'bound',
    sourceUrl: staged?.sourceUrl ?? sourceUrl,
    jobId,
    staged: staged?.staged || 0,
    candidates: staged?.candidates || 0,
    rebounded: staged?.rebounded || 0,
    skipped: staged?.skipped || 0,
    failed: staged?.failed || 0,
    warning: staged?.warning ? String(staged.warning).slice(0, 300) : null,
    error: staged?.error ? String(staged.error).slice(0, 300) : null,
  }
  // Observability only. A degraded rebind (write failure / missing additive
  // column) is a warning; a healthy rebind that actually bound planned rows is
  // an informational line. Neither can change the ship verdict.
  if (outcome.failed > 0 || outcome.error || outcome.warning) {
    console.warn('[seoFactory/pipeline] post-persist interlink rebind degraded', {
      sourceUrl: outcome.sourceUrl,
      jobId: outcome.jobId,
      staged: outcome.staged,
      candidates: outcome.candidates,
      rebounded: outcome.rebounded,
      skipped: outcome.skipped,
      failed: outcome.failed,
      warning: outcome.warning,
      error: outcome.error,
    })
  } else if (outcome.rebounded > 0 || outcome.staged > 0) {
    console.info('[seoFactory/pipeline] post-persist interlink rebind', {
      sourceUrl: outcome.sourceUrl,
      jobId: outcome.jobId,
      staged: outcome.staged,
      rebounded: outcome.rebounded,
    })
  }
  return outcome
}
