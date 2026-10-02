import { acceptStudioActionKind, type StudioActionKind } from '@/lib/contentStudioV3/contracts/registry'

export const COMMAND_AUTHORITY_UNAVAILABLE = Object.freeze({
  available: false,
  reason: 'AUTHORITY_BINDING_UNAVAILABLE',
} as const)

export const COMMAND_AUTHORITY_LOCK_ORDER = Object.freeze([
  'project_authority_epoch',
  'policy',
  'owner_subject',
  'scoped_admission_key',
  'run_stage',
] as const)

export const COMMAND_AUTHORITY_SOURCE_STATUS = Object.freeze({
  durableAuthority: 'NEW_PLANNED',
  fixture: 'FIXTURE_ONLY',
} as const)

export interface CommandAuthorityLockRequest {
  projectId: string
  actorIssuer: string
  actorSubject: string
  actionKind: StudioActionKind
  subjectId: string
  inputRef: string
  snapshotRef: string
  authorizationEvidenceId: string
}

export interface CommandAuthorityBindings {
  projectId: string
  actorIssuer: string
  actorSubject: string
  actionKind: StudioActionKind
  subjectId: string
  inputRef: string
  snapshotRef: string
  authorizationEvidenceId: string
  ownerVersion: number
  policyVersion: number
  authorityEpoch: number
}

export interface AvailableCommandAuthorityObservation extends CommandAuthorityBindings {
  available: true
  allowed: boolean
}

export type CommandAuthorityObservation =
  | typeof COMMAND_AUTHORITY_UNAVAILABLE
  | AvailableCommandAuthorityObservation

export type CommandAuthorityRequestDecode =
  | { ok: true; request: CommandAuthorityLockRequest }
  | { ok: false; reason: 'INVALID_COMMAND_AUTHORITY_REQUEST' }

const requestKeys = [
  'projectId', 'actorIssuer', 'actorSubject', 'actionKind', 'subjectId',
  'inputRef', 'snapshotRef', 'authorizationEvidenceId',
] as const
const resultKeys = ['available', 'allowed', ...requestKeys, 'ownerVersion', 'policyVersion', 'authorityEpoch'] as const
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

function ownDataRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return false
  if (Reflect.ownKeys(value).some((key) => typeof key !== 'string')) return false
  return Object.values(Object.getOwnPropertyDescriptors(value)).every((descriptor) =>
    Object.hasOwn(descriptor, 'value') && descriptor.enumerable === true
  )
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const own = Reflect.ownKeys(value)
  return own.length === keys.length && keys.every((key) => Object.hasOwn(value, key))
}

function requestsMatch(left: CommandAuthorityLockRequest, right: CommandAuthorityLockRequest): boolean {
  return requestKeys.every((key) => left[key] === right[key])
}

function wellFormedUnicode(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false
      index += 1
    } else if (code >= 0xdc00 && code <= 0xdfff) return false
  }
  return true
}

function boundedText(value: unknown, maxBytes: number): value is string {
  return typeof value === 'string'
    && value.trim().length > 0
    && wellFormedUnicode(value)
    && !/[\u0000-\u001f\u007f-\u009f]/u.test(value)
    && new TextEncoder().encode(value).byteLength <= maxBytes
}

export function decodeCommandAuthorityRequest(input: unknown): CommandAuthorityRequestDecode {
  if (!ownDataRecord(input) || !exactKeys(input, requestKeys)) {
    return { ok: false, reason: 'INVALID_COMMAND_AUTHORITY_REQUEST' }
  }
  const action = acceptStudioActionKind(input.actionKind)
  if (
    typeof input.projectId !== 'string' || !uuidPattern.test(input.projectId)
    || !boundedText(input.actorIssuer, 256)
    || !boundedText(input.actorSubject, 256)
    || action.status !== 'accepted'
    || !boundedText(input.subjectId, 512)
    || !boundedText(input.inputRef, 512)
    || !boundedText(input.snapshotRef, 512)
    || !boundedText(input.authorizationEvidenceId, 512)
  ) return { ok: false, reason: 'INVALID_COMMAND_AUTHORITY_REQUEST' }

  return {
    ok: true,
    request: {
      projectId: input.projectId,
      actorIssuer: input.actorIssuer,
      actorSubject: input.actorSubject,
      actionKind: action.value,
      subjectId: input.subjectId,
      inputRef: input.inputRef,
      snapshotRef: input.snapshotRef,
      authorizationEvidenceId: input.authorizationEvidenceId,
    },
  }
}

export type AuthorityObservationDecode =
  | { ok: true; observation: AvailableCommandAuthorityObservation }
  | { ok: true; observation: typeof COMMAND_AUTHORITY_UNAVAILABLE }
  | { ok: false; reason: 'INVALID_COMMAND_AUTHORITY_OBSERVATION' }

export function decodeCommandAuthorityObservation(
  input: unknown,
  expectedRequest?: CommandAuthorityLockRequest,
): AuthorityObservationDecode {
  if (!ownDataRecord(input)) return { ok: false, reason: 'INVALID_COMMAND_AUTHORITY_OBSERVATION' }
  let expected = expectedRequest
  if (expected !== undefined) {
    const decodedExpected = decodeCommandAuthorityRequest(expected)
    if (!decodedExpected.ok) return { ok: false, reason: 'INVALID_COMMAND_AUTHORITY_OBSERVATION' }
    expected = decodedExpected.request
  }
  if (exactKeys(input, ['available', 'reason']) && input.available === false
      && input.reason === COMMAND_AUTHORITY_UNAVAILABLE.reason) {
    return { ok: true, observation: COMMAND_AUTHORITY_UNAVAILABLE }
  }
  if (!exactKeys(input, resultKeys) || input.available !== true || typeof input.allowed !== 'boolean') {
    return { ok: false, reason: 'INVALID_COMMAND_AUTHORITY_OBSERVATION' }
  }
  const request = decodeCommandAuthorityRequest(Object.fromEntries(
    requestKeys.map((key) => [key, input[key]])
  ))
  if (!request.ok || (expected !== undefined && !requestsMatch(expected, request.request))
      || !Number.isSafeInteger(input.ownerVersion) || (input.ownerVersion as number) < 1
      || !Number.isSafeInteger(input.policyVersion) || (input.policyVersion as number) < 1
      || !Number.isSafeInteger(input.authorityEpoch) || (input.authorityEpoch as number) < 1) {
    return { ok: false, reason: 'INVALID_COMMAND_AUTHORITY_OBSERVATION' }
  }
  return {
    ok: true,
    observation: {
      available: true,
      allowed: input.allowed,
      ...request.request,
      ownerVersion: input.ownerVersion as number,
      policyVersion: input.policyVersion as number,
      authorityEpoch: input.authorityEpoch as number,
    },
  }
}
