import { createSupabaseAdminClient } from '@/lib/supabase'
import {
  runSeoFactoryPipeline,
  type PipelineInput,
  type PipelineResult,
} from './pipeline'
import {
  runSeoFactoryPipelineStream,
  type PipelineStreamEvent,
} from './pipelineStream'
import {
  resolvePipelineWritingContract,
  type ContractAwarePipelineInput,
} from './pipelineContract'
import {
  assertStrictOwnerTarget,
  createContentStudioExecutionState,
  markContentStudioExecutionLeaseLost,
  markContentStudioExecutionLeaseRenewed,
  runInContentStudioExecution,
  type ContentStudioExecutionState,
} from './contentStudioExecutionContext'
import type { WritingContractV2 } from './writingContract'
import { BriefInvalidError } from './sealedBrief'
import { resolveOwner } from './ownership'
import {
  ProviderDestinationViolationError,
  ProviderSelectionRequiredError,
  canonicalCommissionedPin,
  commissionedProvider,
} from '@/lib/contentAiRegistry'
import {
  UNAPPLIED_COLUMN_ERROR_RE,
  appendProviderAttempt,
  mergeProviderAudit,
  stripUnappliedColumns,
} from './persistContentJobCore'
import {
  assertContentStudioExecution,
  claimContentStudioExecution,
  CONTENT_STUDIO_LEASE_RENEW_MS,
  DEFAULT_CONTENT_STUDIO_LEASE_SECONDS,
  renewContentStudioExecution,
  type ContentStudioExecutionClaim,
} from './writingContractStore'
import {
  buildPublicationApprovalManifest,
  withPublicationManifest,
} from './publicationProof'

export type ContentStudioPipelineInput = PipelineInput & ContractAwarePipelineInput & {
  writingContractRequired: true
}

type PreparedStrictExecution = {
  hydrated: ContentStudioPipelineInput
  contract: WritingContractV2
  claim: ContentStudioExecutionClaim
  state: ContentStudioExecutionState
}

function failureStage(error: unknown, state: ContentStudioExecutionState): string {
  if (state.acceptedContent) return 'revision_required'
  if (error instanceof BriefInvalidError) return error.executionStage
  const message = error instanceof Error ? error.message : String(error || '')
  if (/evidence|source|research/i.test(message)) return 'needs_research'
  return 'brief_invalid'
}

/** Granular provider failure class persisted in `content_jobs.provider_error_class` (design §4.2). */
export type ProviderErrorClass =
  | 'auth'
  | 'quota'
  | 'rate_limit'
  | 'timeout'
  | 'malformed'
  | 'empty'
  | 'unavailable'
  | 'destination_violation'
  | 'unusable_generation'
  | 'selection_required'

/**
 * Classify a provider failure into the migration's closed class set. Returns
 * null for failures that are not provider failures (contract/ownership/
 * evidence errors) so `provider_error_class` never mislabels them. The
 * message is matched, never persisted.
 */
export function providerErrorClassFor(error: unknown): ProviderErrorClass | null {
  if (error instanceof ProviderSelectionRequiredError) return 'selection_required'
  if (error instanceof ProviderDestinationViolationError) return 'destination_violation'
  const message = error instanceof Error ? error.message : String(error || '')
  if (!message) return null
  if (/\b401\b|\b403\b|unauthori[sz]ed|forbidden|invalid[ ._-]*(api[ ._-]*)?key|authentication|oauth|credentials?/i.test(message)) return 'auth'
  if (/\b402\b|quota|billing|credit|payment required|insufficient|exhausted/i.test(message)) return 'quota'
  if (/\b429\b|rate[ ._-]*limit|too many requests|resource.?exhausted|overload|high[ ._-]*demand/i.test(message)) return 'rate_limit'
  if (/\b504\b|\b524\b|gateway timeout|timeout|timed out|deadline|abort(ed)?|ETIMEDOUT/i.test(message)) return 'timeout'
  if (/empty content|empty response|returned empty|stream returned empty|empty sse/i.test(message)) return 'empty'
  if (/unusable|truncated \(token limit\)|reasoning|finish_reason/i.test(message)) return 'unusable_generation'
  if (/malformed|invalid json|json parse|unexpected token|schema/i.test(message)) return 'malformed'
  if (/\b500\b|\b502\b|\b503\b|\b522\b|\b529\b|unavailable|fetch failed|network error|econnreset|etimedout|socket hang up|not configured|not found|connection/i.test(message)) return 'unavailable'
  return null
}

function createStrictState(
  contract: WritingContractV2,
  claim: ContentStudioExecutionClaim,
  jobId: string,
): ContentStudioExecutionState {
  return createContentStudioExecutionState(true, {
    contractId: contract.contractId,
    contractHash: contract.contractHash,
    opportunityId: contract.opportunity.id,
    contractBrief: contract.brief,
    contractOwnership: contract.ownership,
    contractQueryCoverage: contract.queryCoverage,
    requestedModel: contract.requestedModel,
    executionJobId: jobId,
    executionOwner: claim.owner,
    executionAttempt: claim.attempt,
    executionLeaseExpiresAt: claim.leaseExpiresAt,
  })
}

async function assertContractOwnershipBeforeAuthoring(contract: WritingContractV2): Promise<void> {
  const plan = await resolveOwner({
    primaryKeyword: contract.primaryKeyword,
    contentType: contract.contentType,
    region: contract.opportunity.jurisdiction || 'US',
    indexable: true,
    slug: contract.metadata.targetSlug,
  })
  const norm = (value: unknown) => String(value || '').trim().replace(/\/+$/, '').toLowerCase()
  if (
    norm(plan.host) !== norm(contract.ownership.host)
    || norm(plan.repo) !== norm(contract.ownership.repo)
    || norm(plan.filePath) !== norm(contract.ownership.filePath)
    || norm(plan.canonicalUrl) !== norm(contract.ownership.canonicalUrl)
  ) {
    throw new Error(
      `writing contract ownership drift: resolved ${plan.repo}:${plan.filePath} (${plan.canonicalUrl}) != contract ${contract.ownership.repo}:${contract.ownership.filePath} (${contract.ownership.canonicalUrl})`,
    )
  }
}

function ownerCondition<T>(query: T, claim: ContentStudioExecutionClaim): T {
  return (query as any)
    .eq('execution_owner', claim.owner)
    .eq('execution_attempt', claim.attempt)
    .gt('execution_lease_expires_at', new Date().toISOString()) as T
}

async function assertPreparedExecution(prepared: PreparedStrictExecution): Promise<void> {
  const jobId = String(prepared.hydrated.existingJobId || '').trim()
  if (!jobId) throw new Error('contracted execution lost its persisted job id')
  await assertContentStudioExecution(createSupabaseAdminClient(), {
    jobId,
    contractId: prepared.contract.contractId,
    contractHash: prepared.contract.contractHash,
    owner: prepared.claim.owner,
    attempt: prepared.claim.attempt,
  })
}

function startExecutionLeaseHeartbeat(
  prepared: PreparedStrictExecution,
  abort?: AbortController,
): { stop: () => Promise<void> } {
  let stopped = false
  let inFlight: Promise<void> | null = null
  const jobId = String(prepared.hydrated.existingJobId || '').trim()

  const renew = async () => {
    if (stopped || inFlight || !jobId) return
    inFlight = (async () => {
      try {
        const expiresAt = await renewContentStudioExecution(createSupabaseAdminClient(), {
          jobId,
          contractId: prepared.contract.contractId,
          contractHash: prepared.contract.contractHash,
          owner: prepared.claim.owner,
          attempt: prepared.claim.attempt,
          leaseSeconds: DEFAULT_CONTENT_STUDIO_LEASE_SECONDS,
        })
        prepared.claim.leaseExpiresAt = expiresAt
        prepared.state.executionLeaseExpiresAt = expiresAt
        markContentStudioExecutionLeaseRenewed(expiresAt)
      } catch (error) {
        markContentStudioExecutionLeaseLost(error)
        if (abort && !abort.signal.aborted) abort.abort(error)
        throw error
      }
    })()
    try { await inFlight } finally { inFlight = null }
  }

  const timer = setInterval(() => { void renew().catch(() => {}) }, CONTENT_STUDIO_LEASE_RENEW_MS)
  return {
    async stop() {
      stopped = true
      clearInterval(timer)
      if (inFlight) await inFlight.catch(() => {})
    },
  }
}

async function persistExecutionFailure(input: {
  request: ContentStudioPipelineInput
  contract: WritingContractV2
  state: ContentStudioExecutionState
  claim: ContentStudioExecutionClaim
  error: unknown
}): Promise<boolean> {
  const jobId = String(input.request.existingJobId || '').trim()
  if (!jobId) return false
  try {
    await assertContentStudioExecution(createSupabaseAdminClient(), {
      jobId,
      contractId: input.contract.contractId,
      contractHash: input.contract.contractHash,
      owner: input.claim.owner,
      attempt: input.claim.attempt,
    })
    const db = createSupabaseAdminClient()
    const message = input.error instanceof Error ? input.error.message : String(input.error || 'Content Studio execution failed')
    const stage = failureStage(input.error, input.state)
    const errorClass = providerErrorClassFor(input.error)
    const requestedPin = canonicalCommissionedPin(input.contract.requestedModel)
      ?? canonicalCommissionedPin(input.request.aiProvider)
    const patch: Record<string, unknown> = {
      status: 'failed',
      execution_stage: stage,
      error_message: message.slice(0, 1000),
      execution_owner: null,
      execution_lease_expires_at: null,
    }
    if (errorClass) patch.provider_error_class = errorClass
    if (input.state.acceptedContent) {
      patch.content = input.state.acceptedContent
      patch.word_count = input.state.acceptedContent.trim().split(/\s+/).filter(Boolean).length
      // Only an execution that produced an accepted artifact may name the
      // provider/model that produced it (design §3.3 invariant 1).
      if (requestedPin) {
        patch.actual_provider = requestedPin
        patch.actual_model = commissionedProvider(requestedPin).apiModel
      }
    }
    // Merge the bounded provider attempt under the same fence. Read first so
    // the audited body/score is preserved; lineage never blocks the failure.
    try {
      let auditQuery = db
        .from('content_jobs')
        .select('audit_json')
        .eq('id', jobId)
        .eq('opportunity_id', input.contract.opportunity.id)
        .eq('contract_id', input.contract.contractId)
        .eq('contract_hash', input.contract.contractHash)
      auditQuery = ownerCondition(auditQuery, input.claim)
      const current = await auditQuery.maybeSingle()
      const priorAudit = (current as { data?: { audit_json?: unknown } } | null)?.data?.audit_json
      const attributedPin = input.state.acceptedContent ? requestedPin : null
      const attributedModel = attributedPin ? commissionedProvider(attributedPin).apiModel : null
      patch.audit_json = mergeProviderAudit(priorAudit, {
        requested: requestedPin ?? input.contract.requestedModel ?? null,
        actual: attributedPin,
        requestedModel: attributedModel,
        actualModel: attributedModel,
        pinSource: input.state.providerPinSource,
        attempts: appendProviderAttempt(
          (priorAudit as { provider?: { attempts?: unknown } } | null | undefined)?.provider?.attempts,
          { stage, attempt: input.claim.attempt, outcome: 'error', failureClass: errorClass, at: new Date().toISOString() },
        ),
      })
    } catch { /* provider lineage must never block the fenced failure write */ }

    const failureWrite = async (target: Record<string, unknown>) => {
      let writeQuery = db
        .from('content_jobs')
        .update(target)
        .eq('id', jobId)
        .eq('opportunity_id', input.contract.opportunity.id)
        .eq('contract_id', input.contract.contractId)
        .eq('contract_hash', input.contract.contractHash)
        .in('status', ['pending', 'drafting', 'processing', 'publishing', 'pr_created'])
      writeQuery = ownerCondition(writeQuery, input.claim)
      return writeQuery.select('id').maybeSingle()
    }
    let result = await failureWrite(patch)
    if (result.error && UNAPPLIED_COLUMN_ERROR_RE.test(result.error.message || '')) {
      result = await failureWrite(stripUnappliedColumns(patch))
    }
    if (result.error) {
      console.warn('[contentStudioPipeline] failure persistence skipped:', result.error.message)
      return false
    }
    return Boolean(result.data?.id)
  } catch (error) {
    console.warn('[contentStudioPipeline] failure persistence skipped:', error instanceof Error ? error.message : error)
    return false
  }
}

async function persistExecutionStage(input: {
  request: ContentStudioPipelineInput
  contract: WritingContractV2
  state: ContentStudioExecutionState
  claim: ContentStudioExecutionClaim
  result: PipelineResult
}): Promise<void> {
  const jobId = String(input.request.existingJobId || input.result.jobId || '').trim()
  if (!jobId) throw new Error('contracted execution cannot complete without its reserved job id')

  await assertContentStudioExecution(createSupabaseAdminClient(), {
    jobId,
    contractId: input.contract.contractId,
    contractHash: input.contract.contractHash,
    owner: input.claim.owner,
    attempt: input.claim.attempt,
  })

  const ship = input.result.ship
  const shipStatus = ship?.status
  const stage = shipStatus === 'pr_created'
    ? 'pr_open'
    : shipStatus === 'merged' || shipStatus === 'deployed'
      ? 'merged'
      : input.result.audit?.blockers?.length
        ? 'revision_required'
        : 'ready_for_approval'
  const publicationPhase = shipStatus === 'pr_created'
    ? 'pr_open'
    : shipStatus === 'merged' || shipStatus === 'deployed'
      ? 'deployment_pending'
      : null
  const patch: Record<string, unknown> = {
    execution_stage: stage,
    actual_model: input.result.model || null,
    execution_owner: null,
    execution_lease_expires_at: null,
  }
  // The commissioned provider that produced this result owns the artifact; a
  // successful stage clears any prior provider failure class.
  const actualPin = canonicalCommissionedPin(input.result.provider)
  if (actualPin) patch.actual_provider = actualPin
  patch.provider_error_class = null
  if (publicationPhase) patch.publication_phase = publicationPhase

  const db = createSupabaseAdminClient()
  if (ship) {
    const marker = String(input.state.lastPublicationMarker || '').trim()
    const exactContent = String(input.state.lastPublicationContent || '')
    const exactContentHash = String(input.state.lastPublicationContentHash || '').trim()
    const exactArtifactHash = String(input.state.lastPublicationArtifactHash || '').trim()
    const exactBodyHash = String(input.state.lastPublicationBodyHash || '').trim()
    if (!marker || !exactContent.trim() || !exactContentHash || !exactArtifactHash || !exactBodyHash) {
      throw new Error('contracted publication completed without exact renderer marker/body/artifact digest proof')
    }
    patch.expected_revision_marker = marker
    let currentQuery = db.from('content_jobs').select('audit_json').eq('id', jobId)
    currentQuery = ownerCondition(currentQuery, input.claim)
    const current = await currentQuery.maybeSingle()
    if (current.error || !current.data) throw new Error(`publication manifest load failed or execution ownership lost: ${current.error?.message || 'owner changed'}`)
    const manifest = buildPublicationApprovalManifest({
      jobId,
      contractId: input.contract.contractId,
      contractHash: input.contract.contractHash,
      opportunityId: input.contract.opportunity.id,
      repoOwner: ship.owner,
      repoName: ship.repo,
      path: ship.path,
      canonical: ship.canonicalUrl,
      expectedMarker: marker,
      content: exactContent,
      approvedContentHash: exactContentHash,
      approvedArtifactHash: exactArtifactHash,
      renderedArtifact: input.state.lastPublicationArtifactContent,
      approvedBodyHash: exactBodyHash,
      approvalActor: input.request.userId || null,
      prNumber: ship.prNumber || null,
      approvedHeadSha: ship.commitSha || null,
    })
    manifest.mergeSha = ship.mergeCommitSha || (ship.status === 'deployed' ? ship.commitSha || null : null)
    patch.audit_json = withPublicationManifest(current.data.audit_json, manifest)
  }

  const stageWrite = async (target: Record<string, unknown>) => {
    let updatedQuery = db
      .from('content_jobs')
      .update(target)
      .eq('id', jobId)
      .eq('opportunity_id', input.contract.opportunity.id)
      .eq('contract_id', input.contract.contractId)
      .eq('contract_hash', input.contract.contractHash)
    updatedQuery = ownerCondition(updatedQuery, input.claim)
    return updatedQuery.select('id').maybeSingle()
  }
  let updated = await stageWrite(patch)
  if (updated.error && UNAPPLIED_COLUMN_ERROR_RE.test(updated.error.message || '')) {
    updated = await stageWrite(stripUnappliedColumns(patch))
  }
  if (updated.error || !updated.data?.id) {
    throw new Error(`contracted execution stage persistence failed: ${updated.error?.message || 'execution ownership changed or lease expired'}`)
  }
}

async function prepareStrictExecution(request: ContentStudioPipelineInput): Promise<PreparedStrictExecution> {
  const resolved = await resolvePipelineWritingContract({ ...request, writingContractRequired: true })
  if (!resolved.contract) throw new Error('writing contract required')
  const hydrated = resolved.input as ContentStudioPipelineInput
  const jobId = String(hydrated.existingJobId || '').trim()
  if (!jobId) throw new Error('contracted Content Studio generation requires its persisted job id')
  const db = createSupabaseAdminClient()
  const claim = await claimContentStudioExecution(db, {
    jobId,
    contractId: resolved.contract.contractId,
    contractHash: resolved.contract.contractHash,
    leaseSeconds: DEFAULT_CONTENT_STUDIO_LEASE_SECONDS,
  })
  const state = createStrictState(resolved.contract, claim, jobId)
  const prepared = { hydrated, contract: resolved.contract, claim, state }
  try {
    await runInContentStudioExecution(state, async () => {
      await assertPreparedExecution(prepared)
      await assertContractOwnershipBeforeAuthoring(resolved.contract!)
      assertStrictOwnerTarget(resolved.contract!.ownership)
    })
  } catch (error) {
    await persistExecutionFailure({ request: hydrated, contract: resolved.contract, state, claim, error })
    throw error
  }
  return prepared
}

function linkAbortSignal(source: AbortSignal | undefined, target: AbortController): () => void {
  if (!source) return () => {}
  const forward = () => {
    if (!target.signal.aborted) target.abort(source.reason)
  }
  if (source.aborted) forward()
  else source.addEventListener('abort', forward, { once: true })
  return () => source.removeEventListener('abort', forward)
}

export async function runContentStudioPipeline(request: ContentStudioPipelineInput): Promise<PipelineResult> {
  const prepared = await prepareStrictExecution(request)
  const cancel = new AbortController()
  const unlinkAbort = linkAbortSignal(prepared.hydrated.signal, cancel)
  const hydrated = { ...prepared.hydrated, signal: cancel.signal } as ContentStudioPipelineInput

  try {
    return await runInContentStudioExecution(prepared.state, async () => {
      const heartbeat = startExecutionLeaseHeartbeat(prepared, cancel)
      try {
        const result = await runSeoFactoryPipeline(hydrated)
        await heartbeat.stop()
        await assertPreparedExecution(prepared)
        await persistExecutionStage({ ...prepared, request: hydrated, result })
        return result
      } catch (error) {
        await heartbeat.stop()
        await persistExecutionFailure({ ...prepared, request: hydrated, error })
        throw error
      }
    })
  } finally {
    unlinkAbort()
  }
}

type StreamQueue = {
  values: PipelineStreamEvent[]
  waiters: Array<() => void>
  closed: boolean
}
function pushStream(queue: StreamQueue, event: PipelineStreamEvent): void {
  queue.values.push(event)
  queue.waiters.splice(0).forEach((wake) => wake())
}
function closeStream(queue: StreamQueue): void {
  queue.closed = true
  queue.waiters.splice(0).forEach((wake) => wake())
}
async function takeStream(queue: StreamQueue): Promise<PipelineStreamEvent | null> {
  while (!queue.values.length && !queue.closed) {
    await new Promise<void>((resolve) => queue.waiters.push(resolve))
  }
  return queue.values.shift() || null
}

export async function* runContentStudioPipelineStream(request: ContentStudioPipelineInput): AsyncGenerator<PipelineStreamEvent> {
  const prepared = await prepareStrictExecution(request)
  const queue: StreamQueue = { values: [], waiters: [], closed: false }
  const cancel = new AbortController()
  const unlinkAbort = linkAbortSignal(prepared.hydrated.signal, cancel)
  const hydrated = { ...prepared.hydrated, signal: cancel.signal } as ContentStudioPipelineInput
  let rawIterator: AsyncIterator<PipelineStreamEvent> | null = null
  let persistedTerminal = false

  const producer = runInContentStudioExecution(prepared.state, async () => {
    const heartbeat = startExecutionLeaseHeartbeat(prepared, cancel)
    rawIterator = runSeoFactoryPipelineStream(hydrated)[Symbol.asyncIterator]()
    let sawFinal = false
    try {
      while (true) {
        const next = await rawIterator.next()
        if (next.done) {
          if (!sawFinal) {
            const error = new Error('Content Studio stream ended without final event')
            await heartbeat.stop()
            await persistExecutionFailure({ ...prepared, request: hydrated, error })
            persistedTerminal = true
            pushStream(queue, { type: 'error', error: error.message })
          }
          return
        }
        const event = next.value
        if (event.type === 'error') {
          const error = new Error(event.error || 'Content Studio streaming pipeline failed')
          await heartbeat.stop()
          await persistExecutionFailure({ ...prepared, request: hydrated, error })
          persistedTerminal = true
          pushStream(queue, event)
          return
        }
        if (event.type === 'final') {
          sawFinal = true
          await heartbeat.stop()
          await assertPreparedExecution(prepared)
          await persistExecutionStage({ ...prepared, request: hydrated, result: event.result })
          persistedTerminal = true
          pushStream(queue, event)
          return
        }
        pushStream(queue, event)
      }
    } catch (error) {
      await heartbeat.stop()
      if (!persistedTerminal) {
        await persistExecutionFailure({ ...prepared, request: hydrated, error })
        persistedTerminal = true
      }
      pushStream(queue, { type: 'error', error: error instanceof Error ? error.message : String(error || 'stream failed') })
    } finally {
      await heartbeat.stop()
      try { await rawIterator?.return?.(undefined) } catch { /* failure already persisted */ }
      closeStream(queue)
    }
  })

  try {
    while (true) {
      const event = await takeStream(queue)
      if (!event) break
      yield event
      if (event.type === 'final' || event.type === 'error') break
    }
    await producer
  } finally {
    cancel.abort(new Error('Content Studio stream consumer closed'))
    try { await rawIterator?.return?.(undefined) } catch { /* producer persists terminal state */ }
    try { await producer } catch { /* producer emits/persists its own terminal failure */ }
    unlinkAbort()
    if (!persistedTerminal) {
      await persistExecutionFailure({
        ...prepared,
        request: hydrated,
        error: new Error('Content Studio stream interrupted before final persistence'),
      })
      persistedTerminal = true
    }
  }
}
