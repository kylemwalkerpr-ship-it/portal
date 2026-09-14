import { AsyncLocalStorage } from 'node:async_hooks'
import { createHash } from 'node:crypto'

export type ContentStudioDeskState = 'not_started' | 'running' | 'completed' | 'failed'
export type ContentStudioRevisionState = 'not_started' | 'running' | 'completed' | 'failed'

export type ContentStudioExecutionState = {
  strict: boolean
  deskState: ContentStudioDeskState
  revisionState: ContentStudioRevisionState
  acceptedContent: string | null
  acceptedHash: string | null
  failedReason: string | null
}

const storage = new AsyncLocalStorage<ContentStudioExecutionState>()

export function contentHash(content: string): string {
  return createHash('sha256').update(String(content || '').replace(/\r\n/g, '\n')).digest('hex')
}

export function createContentStudioExecutionState(strict = true): ContentStudioExecutionState {
  return {
    strict,
    deskState: 'not_started',
    revisionState: 'not_started',
    acceptedContent: null,
    acceptedHash: null,
    failedReason: null,
  }
}

export function currentContentStudioExecution(): ContentStudioExecutionState | undefined {
  return storage.getStore()
}

export async function runInContentStudioExecution<T>(
  state: ContentStudioExecutionState,
  fn: () => Promise<T>,
): Promise<T> {
  return storage.run(state, fn)
}

export async function runWithContentStudioExecution<T>(
  strict: boolean,
  fn: () => Promise<T>,
): Promise<{ result: T; state: ContentStudioExecutionState }> {
  const state = createContentStudioExecutionState(strict)
  const result = await runInContentStudioExecution(state, fn)
  return { result, state }
}

export function markCoherentDeskRunning(): void {
  const state = storage.getStore()
  if (!state?.strict) return
  state.deskState = 'running'
  state.failedReason = null
}

export function markCoherentDeskFailed(reason: unknown): void {
  const state = storage.getStore()
  if (!state?.strict) return
  state.deskState = 'failed'
  state.failedReason = reason instanceof Error ? reason.message : String(reason || 'coherent writing failed')
}

export function markCoherentDeskCompleted(content: string): void {
  const state = storage.getStore()
  if (!state?.strict) return
  const accepted = String(content || '')
  state.deskState = 'completed'
  state.acceptedContent = accepted
  state.acceptedHash = contentHash(accepted)
  state.failedReason = null
}

export function markBoundedRevisionRunning(previousContent: string): void {
  const state = storage.getStore()
  if (!state?.strict) return
  const previous = String(previousContent || '')
  if (!previous.trim()) throw new Error('strict Content Studio revision requires an accepted previous draft')
  state.revisionState = 'running'
  state.acceptedContent = previous
  state.acceptedHash = contentHash(previous)
  state.failedReason = null
}

export function markBoundedRevisionFailed(reason: unknown): void {
  const state = storage.getStore()
  if (!state?.strict) return
  state.revisionState = 'failed'
  state.failedReason = reason instanceof Error ? reason.message : String(reason || 'bounded revision failed')
}

export function markBoundedRevisionCompleted(content: string): void {
  const state = storage.getStore()
  if (!state?.strict) return
  const accepted = String(content || '')
  state.revisionState = 'completed'
  state.acceptedContent = accepted
  state.acceptedHash = contentHash(accepted)
  state.failedReason = null
}

export function assertIsolatedAuthoringAllowed(): void {
  const state = storage.getStore()
  if (!state?.strict) return
  if (state.deskState === 'running' || state.revisionState === 'running') return
  if (state.deskState === 'failed' || state.revisionState === 'failed') {
    throw new Error(`strict Content Studio execution stopped after authoring failure: ${state.failedReason || 'unknown failure'}`)
  }
  if (state.deskState === 'completed' || state.revisionState === 'completed') {
    throw new Error('strict Content Studio execution forbids isolated authoring after the accepted draft')
  }
  throw new Error('strict Content Studio execution forbids AI authoring before the validated writing stage starts')
}

export function assertStrictShipContent(content: string): void {
  const state = storage.getStore()
  if (!state?.strict) return
  if (!state.acceptedHash) {
    throw new Error('strict Content Studio ship blocked: no accepted revision is bound to this execution')
  }
  if (contentHash(content) !== state.acceptedHash) {
    throw new Error('strict Content Studio ship blocked: post-acceptance content changed without reevaluation')
  }
}
