import {
  COMMAND_AUTHORITY_LOCK_ORDER,
  COMMAND_AUTHORITY_UNAVAILABLE,
  decodeCommandAuthorityObservation,
  decodeCommandAuthorityRequest,
} from '@/lib/studioAuthority/contracts'
import {
  createInactiveCommandAuthorityRepository,
  decodeUntrustedAuthorityObservation,
} from '@/lib/studioAuthority/repository'

const request = {
  projectId: '3f5a9d10-65c8-4f82-9d0f-73953db82812',
  actorIssuer: 'https://issuer.example',
  actorSubject: 'user:42',
  actionKind: 'INGEST',
  subjectId: 'page:home',
  inputRef: 'input:01',
  snapshotRef: 'snapshot:01',
  authorizationEvidenceId: 'evidence:01',
} as const

function allowedObservation(overrides: Record<string, unknown> = {}) {
  return {
    available: true,
    allowed: true,
    ...request,
    ownerVersion: 2,
    policyVersion: 3,
    authorityEpoch: 4,
    ...overrides,
  }
}

describe('inactive command authority contracts', () => {
  test('keeps the lock order and source status explicit', () => {
    expect(COMMAND_AUTHORITY_LOCK_ORDER).toEqual([
      'project_authority_epoch', 'policy', 'owner_subject',
      'scoped_admission_key', 'run_stage',
    ])
  })

  test('accepts exact request and exact available observations, including denial', () => {
    expect(decodeCommandAuthorityRequest(request)).toEqual({ ok: true, request })
    const allowed = decodeCommandAuthorityObservation(allowedObservation(), request)
    expect(allowed.ok).toBe(true)
    if (allowed.ok) expect(allowed.observation).toMatchObject({ available: true, allowed: true })
    const denied = decodeCommandAuthorityObservation(allowedObservation({ allowed: false }), request)
    expect(denied.ok).toBe(true)
    if (denied.ok) expect(denied.observation).toMatchObject({ available: true, allowed: false })
  })

  test('requires exact result keys and preserves the exact unavailable shape', () => {
    expect(decodeCommandAuthorityObservation(COMMAND_AUTHORITY_UNAVAILABLE)).toEqual({
      ok: true, observation: COMMAND_AUTHORITY_UNAVAILABLE,
    })
    expect(decodeCommandAuthorityObservation({ ...allowedObservation(), decisionId: 'd1' }).ok).toBe(false)
    const missing = allowedObservation()
    delete (missing as Record<string, unknown>).authorityEpoch
    expect(decodeCommandAuthorityObservation(missing).ok).toBe(false)
    expect(decodeCommandAuthorityObservation({ ...COMMAND_AUTHORITY_UNAVAILABLE, decisionId: 'd1' }).ok).toBe(false)
    expect(decodeCommandAuthorityObservation(null).ok).toBe(false)
    expect(decodeCommandAuthorityObservation(undefined).ok).toBe(false)
  })

  test('rejects malformed local requests without coercion or normalization', () => {
    for (const actionKind of ['UNKNOWN', 'CREATE', '14', null]) {
      expect(decodeCommandAuthorityRequest({ ...request, actionKind }).ok).toBe(false)
    }
    for (const value of ['   ', 'bad\u0000id', '\ud800', 'x'.repeat(513)]) {
      expect(decodeCommandAuthorityRequest({ ...request, subjectId: value }).ok).toBe(false)
    }
    expect(decodeCommandAuthorityRequest({ ...request, projectId: request.projectId.toUpperCase() }).ok).toBe(false)
    expect(decodeCommandAuthorityRequest({ ...request, actorSubject: ' user:42 ' }).ok).toBe(true)
    expect(decodeCommandAuthorityRequest({ ...request, extra: true }).ok).toBe(false)
  })

  test('rejects numeric strings, non-finite values, unsafe epochs, and invalid bindings', () => {
    for (const authorityEpoch of ['4', Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, 0]) {
      expect(decodeCommandAuthorityObservation(allowedObservation({ authorityEpoch }), request).ok).toBe(false)
    }
    expect(decodeCommandAuthorityObservation(allowedObservation({ ownerVersion: 1.5 }), request).ok).toBe(false)
    expect(decodeCommandAuthorityObservation(allowedObservation({ policyVersion: 0 }), request).ok).toBe(false)
    expect(decodeCommandAuthorityObservation(allowedObservation({ projectId: '9f5a9d10-65c8-4f82-9d0f-73953db82812' }), request).ok).toBe(false)
    expect(decodeCommandAuthorityObservation(allowedObservation({ actorSubject: 'user:other' }), request).ok).toBe(false)
    expect(decodeCommandAuthorityObservation(allowedObservation({ inputRef: 'input:other' }), request).ok).toBe(false)
    expect(decodeCommandAuthorityObservation(allowedObservation({ snapshotRef: 'snapshot:other' }), request).ok).toBe(false)
  })

  test('rejects inherited objects, accessors, and arrays without invoking getters', () => {
    const inherited = Object.assign(Object.create({ extra: true }), request)
    expect(decodeCommandAuthorityRequest(inherited).ok).toBe(false)
    let getterCalls = 0
    const accessor = { ...request }
    Object.defineProperty(accessor, 'actorSubject', {
      enumerable: true, get() { getterCalls += 1; return 'user:42' },
    })
    expect(decodeCommandAuthorityRequest(accessor).ok).toBe(false)
    const hostile = Object.assign([], request)
    expect(decodeCommandAuthorityRequest(hostile).ok).toBe(false)
    const observedAccessor = allowedObservation()
    Object.defineProperty(observedAccessor, 'allowed', {
      enumerable: true, get() { getterCalls += 1; return true },
    })
    expect(decodeCommandAuthorityObservation(observedAccessor, request).ok).toBe(false)
    expect(getterCalls).toBe(0)
  })

  test('the default repository always fails closed and the observation adapter never authorizes', async () => {
    const repository = createInactiveCommandAuthorityRepository()
    await expect(repository.resolveCurrentCommandAuthority(request)).resolves.toEqual({
      kind: 'provider_unavailable', observation: COMMAND_AUTHORITY_UNAVAILABLE,
    })
    await expect(repository.resolveCurrentCommandAuthority(allowedObservation())).resolves.toEqual({
      kind: 'provider_unavailable', observation: COMMAND_AUTHORITY_UNAVAILABLE,
    })
    await expect(repository.resolveCurrentCommandAuthority({ ...request, actionKind: 'UNKNOWN' })).resolves.toEqual({
      kind: 'provider_unavailable', observation: COMMAND_AUTHORITY_UNAVAILABLE,
    })
    expect(decodeCommandAuthorityRequest({ ...request, actionKind: 'UNKNOWN' })).toEqual({
      ok: false, reason: 'INVALID_COMMAND_AUTHORITY_REQUEST',
    })
    expect(decodeUntrustedAuthorityObservation(allowedObservation()).kind).toBe('untrusted_observation')
    expect(decodeUntrustedAuthorityObservation(allowedObservation()).observation).toMatchObject({ allowed: true })
  })
})
