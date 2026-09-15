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
 * Preserve the verified SSE producer exactly: contentStudioPipelineCore owns one
 * full-lifetime AsyncLocalStorage execution window plus its heartbeat while it
 * drains runSeoFactoryPipelineStream. The recovery context is needed only when
 * the core generator first acquires a failed-job retry lease; it must never be
 * replaced by the JSON producer or by per-yield execution contexts.
 */
export async function* runContentStudioPipelineStream(
  request: core.ContentStudioPipelineInput,
): AsyncGenerator<PipelineStreamEvent> {
  const iterator = core.runContentStudioPipelineStream(request)[Symbol.asyncIterator]()
  try {
    while (true) {
      const next = await runWithContentStudioRecoveryClaim(() => iterator.next())
      if (next.done) return
      yield next.value
    }
  } finally {
    try {
      await runWithContentStudioRecoveryClaim(() => iterator.return?.(undefined) ?? Promise.resolve({ done: true, value: undefined as never }))
    } catch {
      // The core producer owns terminal failure persistence and stale attempts
      // are fenced; closing a consumer must not mask the already-emitted error.
    }
  }
}
