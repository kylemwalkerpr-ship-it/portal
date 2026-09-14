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
  createContentStudioExecutionState,
  runInContentStudioExecution,
  type ContentStudioExecutionState,
} from './contentStudioExecutionContext'
import type { WritingContractV2 } from './writingContract'
import { BriefInvalidError } from './sealedBrief'

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

function createStrictState(contract: WritingContractV2): ContentStudioExecutionState {
  return createContentStudioExecutionState(true, {
    contractId: contract.contractId,
    contractHash: contract.contractHash,
    opportunityId: contract.opportunity.id,
  })
}

async function persistExecutionFailure(input: {
  request: ContentStudioPipelineInput
  contract: WritingContractV2
  state: ContentStudioExecutionState
  error: unknown
}): Promise<void> {
  const jobId = String(input.request.existingJobId || '').trim()
  if (!jobId) return
  try {
    const db = createSupabaseAdminClient()
    const message = input.error instanceof Error ? input.error.message : String(input.error || 'Content Studio execution failed')
    const patch: Record<string, unknown> = {
      status: 'failed',
      execution_stage: failureStage(input.error, input.state),
      error_message: message.slice(0, 1000),
    }
    if (input.state.acceptedContent) {
      patch.content = input.state.acceptedContent
      patch.word_count = input.state.acceptedContent.trim().split(/\s+/).filter(Boolean).length
    }
    const result = await db
      .from('content_jobs')
      .update(patch)
      .eq('id', jobId)
      .eq('opportunity_id', input.contract.opportunity.id)
      .eq('contract_id', input.contract.contractId)
      .eq('contract_hash', input.contract.contractHash)
      .in('status', ['pending', 'drafting', 'processing', 'publishing', 'pr_created'])
      .select('id')
      .maybeSingle()
    if (result.error) console.warn('[contentStudioPipeline] failure persistence skipped:', result.error.message)
  } catch (error) {
    console.warn('[contentStudioPipeline] failure persistence skipped:', error instanceof Error ? error.message : error)
  }
}

async function persistExecutionStage(input: {
  request: ContentStudioPipelineInput
  contract: WritingContractV2
  state: ContentStudioExecutionState
  result: PipelineResult
}): Promise<void> {
  const jobId = String(input.request.existingJobId || input.result.jobId || '').trim()
  if (!jobId) return
  try {
    const shipStatus = input.result.ship?.status
    const stage = shipStatus === 'pr_created'
      ? 'pr_open'
      : shipStatus === 'merged' || shipStatus === 'deployed'
        ? 'merged'
        : input.result.audit?.blockers?.length
          ? 'revision_required'
          : 'ready_for_approval'
    const publicationPhase = shipStatus === 'pr_created'
      ? 'pr_open'
      : shipStatus === 'merged'
        ? 'merged'
        : shipStatus === 'deployed'
          ? 'deployed'
          : null
    const patch: Record<string, unknown> = {
      execution_stage: stage,
      actual_model: input.result.model || null,
    }
    if (publicationPhase) patch.publication_phase = publicationPhase
    if (input.state.lastPublicationMarker) patch.expected_revision_marker = input.state.lastPublicationMarker

    const db = createSupabaseAdminClient()
    await db
      .from('content_jobs')
      .update(patch)
      .eq('id', jobId)
      .eq('opportunity_id', input.contract.opportunity.id)
      .eq('contract_id', input.contract.contractId)
      .eq('contract_hash', input.contract.contractHash)
  } catch (error) {
    console.warn('[contentStudioPipeline] stage persistence skipped:', error instanceof Error ? error.message : error)
  }
}

export async function runContentStudioPipeline(
  request: ContentStudioPipelineInput,
): Promise<PipelineResult> {
  const resolved = await resolvePipelineWritingContract({ ...request, writingContractRequired: true })
  if (!resolved.contract) throw new Error('writing contract required')
  const hydrated = resolved.input as ContentStudioPipelineInput
  const state = createStrictState(resolved.contract)
  try {
    const result = await runInContentStudioExecution(state, () => runSeoFactoryPipeline(hydrated))
    await persistExecutionStage({ request: hydrated, contract: resolved.contract, state, result })
    return result
  } catch (error) {
    await persistExecutionFailure({ request: hydrated, contract: resolved.contract, state, error })
    throw error
  }
}

export async function* runContentStudioPipelineStream(
  request: ContentStudioPipelineInput,
): AsyncGenerator<PipelineStreamEvent> {
  const resolved = await resolvePipelineWritingContract({ ...request, writingContractRequired: true })
  if (!resolved.contract) throw new Error('writing contract required')
  const hydrated = resolved.input as ContentStudioPipelineInput
  const state = createStrictState(resolved.contract)
  const iterator = runSeoFactoryPipelineStream(hydrated)[Symbol.asyncIterator]()
  let finished = false
  let terminalError: unknown = null
  try {
    while (true) {
      const next = await runInContentStudioExecution(state, () => iterator.next())
      if (next.done) {
        finished = true
        break
      }
      if (next.value.type === 'final') {
        finished = true
        const finalResult = (next.value as PipelineStreamEvent & { result?: PipelineResult }).result
        if (finalResult) {
          await persistExecutionStage({ request: hydrated, contract: resolved.contract, state, result: finalResult })
        }
      }
      yield next.value
    }
  } catch (error) {
    terminalError = error
    throw error
  } finally {
    if (!finished) {
      try { await iterator.return?.() } catch { /* preserve original failure */ }
      await persistExecutionFailure({
        request: hydrated,
        contract: resolved.contract,
        state,
        error: terminalError || new Error('stream interrupted before final event'),
      })
    }
  }
}
