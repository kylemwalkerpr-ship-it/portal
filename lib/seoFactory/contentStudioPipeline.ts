// Public contracted Content Studio runner. The complete reviewed implementation
// remains byte-preserved in contentStudioPipelineCore. Generation/regeneration is
// explicitly a recovery-capable claim; manual publication paths are not.
export * from './contentStudioPipelineCore'

import * as core from './contentStudioPipelineCore'
import type { PipelineStreamEvent } from './pipelineStream'
import { runWithContentStudioRecoveryClaim } from './writingContractStore'

export async function runContentStudioPipeline(
  request: core.ContentStudioPipelineInput,
): Promise<Awaited<ReturnType<typeof core.runContentStudioPipeline>>> {
  return runWithContentStudioRecoveryClaim(() => core.runContentStudioPipeline(request))
}

/**
 * Contracted SSE uses the same fenced JSON producer rather than the legacy stream
 * implementation, whose early progress row writes predate execution ownership.
 * The HTTP surface remains SSE (job/progress/provider/ship/final/error), while all
 * job mutations now pass through the single fenced persist door.
 */
export async function* runContentStudioPipelineStream(
  request: core.ContentStudioPipelineInput,
): AsyncGenerator<PipelineStreamEvent> {
  yield { type: 'progress', stage: 'contract', message: 'Contract-bound generation started under a fenced execution lease' }
  const existingJobId = String(request.existingJobId || '').trim()
  if (existingJobId) yield { type: 'job', jobId: existingJobId }
  try {
    const result = await runWithContentStudioRecoveryClaim(() => core.runContentStudioPipeline(request))
    if (result.provider || result.model) {
      yield { type: 'provider', provider: String(result.provider || ''), model: String(result.model || '') }
    }
    if (result.ship || result.shipError) {
      yield { type: 'ship', ship: result.ship || null, shipError: result.shipError || null, shipMode: String(result.shipMode || request.shipMode || 'none') }
    }
    yield { type: 'final', result }
  } catch (error) {
    yield { type: 'error', error: error instanceof Error ? error.message : String(error || 'Content Studio generation failed') }
  }
}
