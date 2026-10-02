import { createHash } from 'node:crypto'

export const STUDIO_ACTIONS = [
  'INGEST', 'PLAN', 'GSC_SYNC', 'GSC_SCORE', 'LLM_AUDIT', 'RESEARCH', 'BRIEF', 'GENERATE', 'REAUDIT',
  'SITE_HEALTH_AUDIT', 'SITE_HEALTH_REPAIR', 'VERIFY_URL', 'INTERLINK_SWEEP', 'PUBLISH',
] as const
export type StudioActionKind = typeof STUDIO_ACTIONS[number]
export type RunStatus = 'QUEUED' | 'RUNNING' | 'CANCEL_REQUESTED' | 'CANCELLED' | 'RETRY_WAIT' | 'SUCCEEDED' | 'FAILED' | 'BLOCKED' | 'SUPERSEDED'
export type StageState = 'pending' | 'claimed' | 'running' | 'checkpointed' | 'done' | 'failed' | 'cancelled'
export type OutboxDeliveryState = 'pending' | 'claimed' | 'delivered' | 'dead'

/** Canonical execution projection; it does not replace the business Run aggregate. */
export interface StudioRunEnvelope {
  schemaVersion: 'studio.run-envelope/1'
  projectId: string
  runId: string
  actionKind: StudioActionKind
  actor: { issuer: string; subject: string; authorizationEvidenceId: string }
  requestHash: string
  idempotencyKey: string
  authorityEpoch: number
  status: RunStatus
  contentJobId: string | null
  seoEngineRunId: string | null
  cancelRequestedAt: string | null
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
  lastEventSequence: number
  inputRef: string
  resultRef: string | null
  errorClass: string | null
}
export interface StudioRunStage {
  projectId: string; runId: string; stageId: string; stageName: string
  attemptCount: number; currentFence: number; leaseOwner: string | null; leaseExpiresAt: string | null
  inputHash: string; checkpointRef: string | null; outputArtifactRef: string | null; state: StageState; rowVersion: number
}
export interface StudioOutboxEvent {
  projectId: string; runId: string; eventId: string; stageId: string | null; eventType: string; sequence: number
  payloadRef: string; idempotencyKey: string; deliveryState: OutboxDeliveryState; producerVersion: string; createdAt: string
}
export interface StudioRunEvent {
  projectId: string; runId: string; sequence: number; schemaVersion: 'studio.run-event/1'; stageId: string | null
  attemptId: string | null; fence: number | null; createdAt: string; phase: string; messageCode: string; detailRef: string | null
  progress: { completed: number; total: number | null; unit: string } | null
}
export interface StudioRunAdmission {
  projectId: string; runId: string; subjectId: string; decisionId: string; authorizationEvidenceId: string
  expectedOwnerVersion: string; expectedPolicyVersion: string; authorityEpoch: number; snapshotRef: string
  commandJson: RunCommandInput; admittedAt: string
}

export interface RunCommandInput {
  actionKind: StudioActionKind
  subjectId: string
  inputRef: string
  idempotencyKey: string
  expectedOwnerVersion: string
  expectedPolicyVersion: string
  expectedAuthorityEpoch: number
}
export interface VerifiedIdentity { issuer: string; subject: string }
export interface VerifiedCommandContext {
  projectId: string
  actor: { issuer: string; subject: string; authorizationEvidenceId: string }
  decisionId: string
  policyVersion: string
  ownerVersion: string
  authorityEpoch: number
  snapshotRef: string
}
export type AdmissionReason = 'INVALID_COMMAND' | 'AUTHORIZATION_REQUIRED' | 'COMMAND_FORBIDDEN' |
  'EXPECTED_VERSION_CONFLICT' | 'IDEMPOTENCY_CONFLICT' | 'INPUT_SCOPE_MISMATCH' | 'ADMISSION_UNAVAILABLE' |
  'RUNTIME_NOT_ACTIVE' | 'AUTHORITY_BINDING_UNAVAILABLE' | 'REQUEST_HASH_MISMATCH'
export type AdmissionResult =
  | { kind: 'accepted'; runId: string; status: 'QUEUED'; lastEventSequence: number }
  | { kind: 'replayed'; runId: string; status: RunStatus; lastEventSequence: number }
  | { kind: 'rejected'; reason: AdmissionReason }

const limits: Record<string, number> = {
  subjectId: 256, idempotencyKey: 128, inputRef: 512, expectedOwnerVersion: 128, expectedPolicyVersion: 128,
}
function validString(value: unknown, maxBytes: number): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.trim().length === 0 || /[\p{Cc}]/u.test(value)) return false
  // TextEncoder silently replaces lone surrogates, so reject them before hashing.
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(i + 1)
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false
      i++
    } else if (code >= 0xdc00 && code <= 0xdfff) return false
  }
  return Buffer.byteLength(value, 'utf8') <= maxBytes
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function decodeRunCommand(value: unknown): RunCommandInput {
  if (!isRecord(value)) throw new TypeError('INVALID_COMMAND')
  const expected = ['actionKind', 'subjectId', 'inputRef', 'idempotencyKey', 'expectedOwnerVersion', 'expectedPolicyVersion', 'expectedAuthorityEpoch']
  if (Object.keys(value).length !== expected.length || Object.keys(value).some(key => !expected.includes(key))) throw new TypeError('INVALID_COMMAND')
  if (!(STUDIO_ACTIONS as readonly unknown[]).includes(value.actionKind)) throw new TypeError('INVALID_COMMAND')
  for (const [key, max] of Object.entries(limits)) if (!validString(value[key], max)) throw new TypeError('INVALID_COMMAND')
  if (typeof value.expectedAuthorityEpoch !== 'number' || !Number.isSafeInteger(value.expectedAuthorityEpoch) || value.expectedAuthorityEpoch < 0) {
    throw new TypeError('INVALID_COMMAND')
  }
  return {
    actionKind: value.actionKind as StudioActionKind,
    subjectId: value.subjectId as string,
    inputRef: value.inputRef as string,
    idempotencyKey: value.idempotencyKey as string,
    expectedOwnerVersion: value.expectedOwnerVersion as string,
    expectedPolicyVersion: value.expectedPolicyVersion as string,
    expectedAuthorityEpoch: value.expectedAuthorityEpoch,
  }
}

function lengthPrefix(value: string): Buffer {
  const bytes = Buffer.from(value, 'utf8')
  return Buffer.concat([Buffer.from(`${bytes.length}:`, 'ascii'), bytes])
}
export function canonicalCommandBytes(input: RunCommandInput): Buffer {
  const fields = [input.actionKind, input.subjectId, input.inputRef, input.expectedOwnerVersion, input.expectedPolicyVersion, String(input.expectedAuthorityEpoch)]
  return Buffer.concat([Buffer.from('studio.command-request/1:', 'ascii'), ...fields.map(lengthPrefix)])
}
export function hashRunCommand(input: RunCommandInput): string {
  // Re-decode to make the exported hashing boundary reject forged/internal invalid values too.
  const command = decodeRunCommand(input)
  return createHash('sha256').update(canonicalCommandBytes(command)).digest('hex')
}

export function isAdmissionResult(value: unknown): value is AdmissionResult {
  if (!isRecord(value) || !['accepted', 'replayed', 'rejected'].includes(String(value.kind))) return false
  const reasons: readonly string[] = ['INVALID_COMMAND', 'AUTHORIZATION_REQUIRED', 'COMMAND_FORBIDDEN', 'EXPECTED_VERSION_CONFLICT',
    'IDEMPOTENCY_CONFLICT', 'INPUT_SCOPE_MISMATCH', 'ADMISSION_UNAVAILABLE', 'RUNTIME_NOT_ACTIVE', 'AUTHORITY_BINDING_UNAVAILABLE', 'REQUEST_HASH_MISMATCH']
  if (value.kind === 'rejected') return reasons.includes(String(value.reason))
  const statuses: readonly string[] = ['QUEUED', 'RUNNING', 'CANCEL_REQUESTED', 'CANCELLED', 'RETRY_WAIT', 'SUCCEEDED', 'FAILED', 'BLOCKED', 'SUPERSEDED']
  return typeof value.runId === 'string' && value.runId.length > 0 && Number.isSafeInteger(value.lastEventSequence) &&
    Number(value.lastEventSequence) >= 1 && (value.kind === 'accepted' ? value.status === 'QUEUED' : statuses.includes(String(value.status)))
}
