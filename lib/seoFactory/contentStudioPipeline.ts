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
  runInContentStudioExecution,
  type ContentStudioExecutionState,
} from './contentStudioExecutionContext'
import type { WritingContractV2 } from './writingContract'
import { BriefInvalidError } from './sealedBrief'
import { resolveOwner } from './ownership'
import {
  claimContentStudioExecution,
  type ContentStudioExecutionClaim,
} from './writingContractStore'
import {
  buildPublicationApprovalManifest,
  withPublicationManifest,
} from './publicationProof'

export type ContentStudioPipelineInput = PipelineInput & ContractAwarePipelineInput & {
  writingContractRequired: true
}

function failureStage(error: unknown, state: ContentStudioExecutionState): string {
  if (state.acceptedContent) return 'revision_required'
  if (error instanceof BriefInvalidError) return error.executionStage
  const message = error instanceof Error ? error.message : String(error || '')
  if (/evidence|source|research/i.test(message)) return 'needs_research'
  return 'brief_invalid'
}

function createStrictState(contract: WritingContractV2, claim: ContentStudioExecutionClaim): ContentStudioExecutionState {
  return createContentStudioExecutionState(true, {
    contractId: contract.contractId,
    contractHash: contract.contractHash,
    opportunityId: contract.opportunity.id,
    contractBrief: contract.brief,
    contractOwnership: contract.ownership,
    requestedModel: contract.requestedModel,
    executionOwner: claim.owner,
    executionAttempt: claim.attempt,
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
    .eq('execution_attempt', claim.attempt) as T
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
    const db = createSupabaseAdminClient()
    const message = input.error instanceof Error ? input.error.message : String(input.error || 'Content Studio execution failed')
    const patch: Record<string, unknown> = {
      status: 'failed',
      execution_stage: failureStage(input.error, input.state),
      error_message: message.slice(0, 1000),
      execution_owner: null,
      execution_lease_expires_at: null,
    }
    if (input.state.acceptedContent) {
      patch.content = input.state.acceptedContent
      patch.word_count = input.state.acceptedContent.trim().split(/\s+/).filter(Boolean).length
    }
    let query = db
      .from('content_jobs')
      .update(patch)
      .eq('id', jobId)
      .eq('opportunity_id', input.contract.opportunity.id)
      .eq('contract_id', input.contract.contractId)
      .eq('contract_hash', input.contract.contractHash)
      .in('status', ['pending', 'drafting', 'processing', 'publishing', 'pr_created'])
    query = ownerCondition(query, input.claim)
    const result = await query.select('id').maybeSingle()
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
  if (publicationPhase) patch.publication_phase = publicationPhase

  const db = createSupabaseAdminClient()
  if (ship) {
    const marker = String(input.state.lastPublicationMarker || '').trim()
    const exactContent = String(input.state.lastPublicationContent || '')
    const exactContentHash = String(input.state.lastPublicationContentHash || '').trim()
    if (!marker || !exactContent.trim() || !exactContentHash) {
      throw new Error('contracted publication completed without exact renderer marker/body/hash proof')
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
      approvalActor: input.request.userId || null,
      prNumber: ship.prNumber || null,
      approvedHeadSha: ship.commitSha || null,
    })
    manifest.mergeSha = ship.mergeCommitSha || (ship.status === 'deployed' ? ship.commitSha || null : null)
    patch.audit_json = withPublicationManifest(current.data.audit_json, manifest)
  }

  let updatedQuery = db
    .from('content_jobs')
    .update(patch)
    .eq('id', jobId)
    .eq('opportunity_id', input.contract.opportunity.id)
    .eq('contract_id', input.contract.contractId)
    .eq('contract_hash', input.contract.contractHash)
  updatedQuery = ownerCondition(updatedQuery, input.claim)
  const updated = await updatedQuery.select('id').maybeSingle()
  if (updated.error || !updated.data?.id) {
    throw new Error(`contracted execution stage persistence failed: ${updated.error?.message || 'execution ownership changed'}`)
  }
}

async function prepareStrictExecution(request: ContentStudioPipelineInput): Promise<{
  hydrated: ContentStudioPipelineInput
  contract: WritingContractV2
  claim: ContentStudioExecutionClaim
  state: ContentStudioExecutionState
}> {
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
  })
  const state = createStrictState(resolved.contract, claim)
  try {
    await runInContentStudioExecution(state, async () => {
      await assertContractOwnershipBeforeAuthoring(resolved.contract!)
      assertStrictOwnerTarget(resolved.contract!.ownership)
    })
  } catch (error) {
    await persistExecutionFailure({ request: hydrated, contract: resolved.contract, state, claim, error })
    throw error
  }
  return { hydrated, contract: resolved.contract, claim, state }
}

export async function runContentStudioPipeline(request: ContentStudioPipelineInput): Promise<PipelineResult> {
  const prepared = await prepareStrictExecution(request)
  try {
    const result = await runInContentStudioExecution(prepared.state, () => runSeoFactoryPipeline(prepared.hydrated))
    await persistExecutionStage({ ...prepared, request: prepared.hydrated, result })
    return result
  } catch (error) {
    await persistExecutionFailure({ ...prepared, request: prepared.hydrated, error })
    throw error
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
  const upstreamSignal = prepared.hydrated.signal
  const abortForwarder = () => cancel.abort(upstreamSignal?.reason)
  if (upstreamSignal) {
    if (upstreamSignal.aborted) cancel.abort(upstreamSignal.reason)
    else upstreamSignal.addEventListener('abort', abortForwarder, { once: true })
  }
  const hydrated = { ...prepared.hydrated, signal: cancel.signal } as ContentStudioPipelineInput
  let rawIterator: AsyncIterator<PipelineStreamEvent> | null = null
  let persistedTerminal = false

  const producer = runInContentStudioExecution(prepared.state, async () => {
    rawIterator = runSeoFactoryPipelineStream(hydrated)[Symbol.asyncIterator]()
    let sawFinal = false
    try {
      while (true) {
        const next = await rawIterator.next()
        if (next.done) {
          if (!sawFinal) {
            const error = new Error('Content Studio stream ended without final event')
            await persistExecutionFailure({ ...prepared, request: hydrated, error })
            persistedTerminal = true
            pushStream(queue, { type: 'error', error: error.message })
          }
          return
        }
        const event = next.value
        if (event.type === 'error') {
          const error = new Error(event.error || 'Content Studio streaming pipeline failed')
          await persistExecutionFailure({ ...prepared, request: hydrated, error })
          persistedTerminal = true
          pushStream(queue, event)
          return
        }
        if (event.type === 'final') {
          sawFinal = true
          await persistExecutionStage({ ...prepared, request: hydrated, result: event.result })
          persistedTerminal = true
          pushStream(queue, event)
          return
        }
        pushStream(queue, event)
      }
    } catch (error) {
      if (!persistedTerminal) {
        await persistExecutionFailure({ ...prepared, request: hydrated, error })
        persistedTerminal = true
      }
      pushStream(queue, { type: 'error', error: error instanceof Error ? error.message : String(error || 'stream failed') })
    } finally {
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
    if (upstreamSignal) upstreamSignal.removeEventListener('abort', abortForwarder)
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
