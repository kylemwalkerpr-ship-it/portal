import { AsyncLocalStorage } from 'node:async_hooks'
import { createHash } from 'node:crypto'

export type ContentStudioDeskState = 'not_started' | 'running' | 'completed' | 'failed'

export type ContentStudioExecutionState = {
  strict: boolean
  deskState: ContentStudioDeskState
  acceptedContent: string | null
  acceptedHash: string | null
  failedReason: string | null
}

const storage = new AsyncLocalStorage<ContentStudioExecutionState>()

export function contentHash(content: string): string {
  return createHash('sha256').update(String(content || '').replace(/\r\n/g, '\n')).digest('hex')
}

export function currentContentStudioExecution(): ContentStudioExecutionState | undefined {
  return storage.getStore()
}

export async function runWithContentStudioExecution<T>(
  strict: boolean,
  fn: () => Promise<T>,
): Promise<{ result: T; state: ContentStudioExecutionState }> {
  const state: ContentStudioExecutionState = {
    strict,
    deskState: 'not_started',
    acceptedContent: null,
    acceptedHash: null,
    failedReason: null,
  }
  const result = await storage.run(state, fn)
  return { result, state }
}

export function markCoherentDeskRunning(): void {
  const state = storage.getStore()
  if (!state?.strict) return
  state.deskState = 'running'
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

export function assertIsolatedAuthoringAllowed(): void {
  const state = storage.getStore()
  if (!state?.strict) return
  if (state.deskState === 'failed') {
    throw new Error(`strict Content Studio execution stopped after coherent-writing failure: ${state.failedReason || 'unknown failure'}`)
  }
  if (state.deskState === 'completed') {
    throw new Error('strict Content Studio execution forbids isolated authoring after the accepted coherent draft')
  }
}

export function assertStrictShipContent(content: string): void {
  const state = storage.getStore()
  if (!state?.strict) return
  if (state.deskState !== 'completed' || !state.acceptedHash) {
    throw new Error('strict Content Studio ship blocked: coherent draft is not accepted')
  }
  if (contentHash(content) !== state.acceptedHash) {
    throw new Error('strict Content Studio ship blocked: post-acceptance content changed without reevaluation')
  }
}
