import { AsyncLocalStorage } from 'node:async_hooks'
import { createHash } from 'node:crypto'
import type { SeoFactoryAudit } from './audit'
import type { SealedBrief } from './sealedBrief'

export type ContentStudioDeskState = 'not_started' | 'running' | 'completed' | 'failed'
export type ContentStudioRevisionState = 'not_started' | 'running' | 'completed' | 'failed'
export type ContentStudioContractOwnership = {
  host: string
  repo: string
  filePath: string
  canonicalUrl: string
}

export type ContentStudioExecutionState = {
  strict: boolean
  deskState: ContentStudioDeskState
  revisionState: ContentStudioRevisionState
  acceptedContent: string | null
  acceptedHash: string | null
  failedReason: string | null
  contractId: string | null
  contractHash: string | null
  opportunityId: string | null
  contractBrief: SealedBrief | null
  contractOwnership: ContentStudioContractOwnership | null
  requestedModel: string | null
  executionJobId: string | null
  executionOwner: string | null
  executionAttempt: number | null
  executionLeaseExpiresAt: string | null
  executionLeaseLostReason: string | null
  auditEvaluator: ((content: string) => SeoFactoryAudit) | null
  lastPublicationMarker: string | null
  lastPublicationContentHash: string | null
  lastPublicationContent: string | null
  lastPublicationArtifactHash: string | null
  lastPublicationBodyHash: string | null
}

type ExecutionLease = { active: boolean }
type ExecutionStore = { state: ContentStudioExecutionState; lease: ExecutionLease }
const storage = new AsyncLocalStorage<ExecutionStore>()

export function contentHash(content: string): string {
  return createHash('sha256').update(String(content || '').replace(/\r\n/g, '\n').trim()).digest('hex')
}

export function createContentStudioExecutionState(
  strict = true,
  identity?: {
    contractId?: string | null
    contractHash?: string | null
    opportunityId?: string | null
    contractBrief?: SealedBrief | null
    contractOwnership?: ContentStudioContractOwnership | null
    requestedModel?: string | null
    executionJobId?: string | null
    executionOwner?: string | null
    executionAttempt?: number | null
    executionLeaseExpiresAt?: string | null
  },
): ContentStudioExecutionState {
  return {
    strict,
    deskState: 'not_started',
    revisionState: 'not_started',
    acceptedContent: null,
    acceptedHash: null,
    failedReason: null,
    contractId: identity?.contractId || null,
    contractHash: identity?.contractHash || null,
    opportunityId: identity?.opportunityId || null,
    contractBrief: identity?.contractBrief || null,
    contractOwnership: identity?.contractOwnership || null,
    requestedModel: String(identity?.requestedModel || '').trim() || null,
    executionJobId: String(identity?.executionJobId || '').trim() || null,
    executionOwner: String(identity?.executionOwner || '').trim() || null,
    executionAttempt: Number.isInteger(identity?.executionAttempt) ? Number(identity?.executionAttempt) : null,
    executionLeaseExpiresAt: String(identity?.executionLeaseExpiresAt || '').trim() || null,
    executionLeaseLostReason: null,
    auditEvaluator: null,
    lastPublicationMarker: null,
    lastPublicationContentHash: null,
    lastPublicationContent: null,
    lastPublicationArtifactHash: null,
    lastPublicationBodyHash: null,
  }
}

function activeStore(): ExecutionStore | undefined { return storage.getStore() }
function activeState(): ContentStudioExecutionState | undefined {
  const store = activeStore()
  return store?.lease.active ? store.state : undefined
}
export function currentContentStudioExecution(): ContentStudioExecutionState | undefined { return activeState() }
export function currentContentStudioExecutionStore(): { state: ContentStudioExecutionState; active: boolean } | undefined {
  const store = activeStore()
  return store ? { state: store.state, active: store.lease.active } : undefined
}

export async function runInContentStudioExecution<T>(state: ContentStudioExecutionState, fn: () => Promise<T>): Promise<T> {
  const lease: ExecutionLease = { active: true }
  return storage.run({ state, lease }, async () => {
    try { return await fn() }
    finally { lease.active = false }
  })
}
export async function runWithContentStudioExecution<T>(strict: boolean, fn: () => Promise<T>): Promise<{ result: T; state: ContentStudioExecutionState }> {
  const state = createContentStudioExecutionState(strict)
  const result = await runInContentStudioExecution(state, fn)
  return { result, state }
}

export function markContentStudioExecutionLeaseRenewed(expiresAt: string): void {
  const state = activeState()
  if (!state?.strict) return
  state.executionLeaseExpiresAt = String(expiresAt || '').trim() || state.executionLeaseExpiresAt
  state.executionLeaseLostReason = null
}

export function markContentStudioExecutionLeaseLost(reason: unknown): void {
  const store = activeStore()
  if (!store?.state.strict) return
  store.state.executionLeaseLostReason = reason instanceof Error
    ? reason.message
    : String(reason || 'execution lease lost')
}

export function assertLocalContentStudioExecutionLease(): void {
  const store = activeStore()
  if (!store?.state.strict) return
  if (!store.lease.active) {
    throw new Error('strict Content Studio execution window is closed')
  }
  const state = store.state
  if (state.executionLeaseLostReason) {
    throw new Error(`strict Content Studio execution lease lost: ${state.executionLeaseLostReason}`)
  }
  if (!state.executionJobId || !state.executionOwner || !Number.isInteger(state.executionAttempt)) {
    throw new Error('strict Content Studio execution is missing its job/owner/attempt fencing identity')
  }
  const expiresAt = state.executionLeaseExpiresAt ? Date.parse(state.executionLeaseExpiresAt) : Number.NaN
  if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) {
    throw new Error('strict Content Studio execution lease expired')
  }
}

export function recordStrictAuditEvaluator(evaluator: (content: string) => SeoFactoryAudit): void {
  const state = activeState(); if (!state?.strict) return; state.auditEvaluator = evaluator
}
export function currentStrictAuditEvaluator(): ((content: string) => SeoFactoryAudit) | null {
  const state = activeState(); return state?.strict ? state.auditEvaluator : null
}
export function recordPublicationMarker(marker: string, content?: string): void {
  const state = activeState()
  if (!state?.strict) return
  state.lastPublicationMarker = String(marker || '').trim() || null
  if (content != null) {
    state.lastPublicationContent = String(content)
    state.lastPublicationContentHash = contentHash(content)
  }
}
export function recordStrictPublicationDigests(input: { artifactHash: string; bodyHash: string }): void {
  const state = activeState()
  if (!state?.strict) return
  state.lastPublicationArtifactHash = String(input.artifactHash || '').trim() || null
  state.lastPublicationBodyHash = String(input.bodyHash || '').trim() || null
}

export function markCoherentDeskRunning(): void {
  const state = activeState(); if (!state?.strict) return
  assertLocalContentStudioExecutionLease()
  state.deskState = 'running'; state.failedReason = null
}
export function markCoherentDeskFailed(reason: unknown): void {
  const state = activeState(); if (!state?.strict) return
  state.deskState = 'failed'; state.failedReason = reason instanceof Error ? reason.message : String(reason || 'coherent writing failed')
}
export function markCoherentDeskCompleted(content: string): void {
  const state = activeState(); if (!state?.strict) return
  assertLocalContentStudioExecutionLease()
  const accepted = String(content || '')
  state.deskState = 'completed'; state.acceptedContent = accepted; state.acceptedHash = contentHash(accepted); state.failedReason = null
}
export function markBoundedRevisionRunning(previousContent: string): void {
  const state = activeState(); if (!state?.strict) return
  assertLocalContentStudioExecutionLease()
  const previous = String(previousContent || '')
  if (!previous.trim()) throw new Error('strict Content Studio revision requires an accepted previous draft')
  state.revisionState = 'running'; state.acceptedContent = previous; state.acceptedHash = contentHash(previous); state.failedReason = null
}
export function markBoundedRevisionFailed(reason: unknown): void {
  const state = activeState(); if (!state?.strict) return
  state.revisionState = 'failed'; state.failedReason = reason instanceof Error ? reason.message : String(reason || 'bounded revision failed')
}
export function markBoundedRevisionCompleted(content: string): void {
  const state = activeState(); if (!state?.strict) return
  assertLocalContentStudioExecutionLease()
  const accepted = String(content || '')
  state.revisionState = 'completed'; state.acceptedContent = accepted; state.acceptedHash = contentHash(accepted); state.failedReason = null
}

export function assertIsolatedAuthoringAllowed(): void {
  const store = activeStore()
  if (!store?.state.strict) return
  assertLocalContentStudioExecutionLease()
  const state = store.state
  if (state.deskState === 'running' || state.revisionState === 'running') return
  if (state.deskState === 'failed' || state.revisionState === 'failed') throw new Error(`strict Content Studio execution stopped after authoring failure: ${state.failedReason || 'unknown failure'}`)
  if (state.deskState === 'completed' || state.revisionState === 'completed') throw new Error('strict Content Studio execution forbids isolated authoring after the accepted draft')
  throw new Error('strict Content Studio execution forbids AI authoring before the validated writing stage starts')
}

export function assertContractProviderSelection(opts: { aiProvider?: string | null; model?: string | null }): void {
  const state = activeState()
  if (!state?.strict || !state.requestedModel) return
  assertLocalContentStudioExecutionLease()
  const requested = state.requestedModel.trim().toLowerCase()
  const runtimeProvider = String(opts.aiProvider || '').trim().toLowerCase()
  const runtimeModel = String(opts.model || '').trim().toLowerCase()
  if (runtimeProvider && runtimeProvider !== 'auto' && runtimeProvider !== requested) throw new Error(`strict Content Studio provider conflicts with immutable contract: ${runtimeProvider} != ${requested}`)
  if (runtimeModel && runtimeModel !== requested) throw new Error(`strict Content Studio model conflicts with immutable contract: ${runtimeModel} != ${requested}`)
}

export function assertStrictOwnerTarget(actual: ContentStudioContractOwnership): void {
  const state = activeState()
  if (!state?.strict || !state.contractOwnership) return
  assertLocalContentStudioExecutionLease()
  const expected = state.contractOwnership
  const norm = (value: unknown) => String(value || '').trim().replace(/\/+$/, '').toLowerCase()
  if (norm(actual.host) !== norm(expected.host) || norm(actual.repo) !== norm(expected.repo) || norm(actual.filePath) !== norm(expected.filePath) || norm(actual.canonicalUrl) !== norm(expected.canonicalUrl)) {
    throw new Error(`strict Content Studio ownership drift: resolved ${actual.repo}:${actual.filePath} does not match immutable contract ${expected.repo}:${expected.filePath}`)
  }
}
export function assertStrictShipContent(content: string): void {
  const state = activeState()
  if (!state?.strict) return
  assertLocalContentStudioExecutionLease()
  if (!state.acceptedHash) throw new Error('strict Content Studio ship blocked: no accepted revision is bound to this execution')
  if (contentHash(content) !== state.acceptedHash) throw new Error('strict Content Studio ship blocked: post-acceptance content changed without reevaluation')
}
