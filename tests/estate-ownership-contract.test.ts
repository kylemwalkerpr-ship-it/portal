import {
  ESTATE_OWNERSHIP_SCHEMA_VERSION,
  evaluateDecisionV1,
  normalizeIntentV1,
  normalizeRouteV1,
  preflightReservationV1,
  resolvePrimaryOwnerV1,
  type EstateRoutePolicyV1,
  type InMemoryOwnershipState,
  type SemanticIntentV1,
} from '@/lib/estateOwnership'

const routePolicy: EstateRoutePolicyV1 = {
  schemaVersion: ESTATE_OWNERSHIP_SCHEMA_VERSION,
  routePolicyVersion: 'test-routes/1',
  hostId: 'legal-host',
  canonicalHost: 'legal.example.test',
  pathCase: 'lowercase',
  trailingSlash: 'always',
  maxPathLength: 120,
  reservedSegments: ['admin', 'api'],
}

const intent = (overrides: Partial<SemanticIntentV1> = {}): SemanticIntentV1 => ({
  schemaVersion: ESTATE_OWNERSHIP_SCHEMA_VERSION,
  jurisdiction: 'US',
  entityOrProgramId: 'uscis-i-485',
  audienceId: 'applicant',
  readerJobId: 'prepare-adjustment-application',
  journeyStage: 'prepare',
  language: 'en-US',
  searchIntent: 'informational',
  ...overrides,
})

const emptyState = (): InMemoryOwnershipState => ({
  owners: new Map(),
  routes: new Map(),
  intentReservations: new Set(),
  routeReservations: new Set(),
})

describe('estate ownership versioned pure contract', () => {
  it('normalizes intent deterministically while keeping jurisdiction and reader job in identity', () => {
    expect(normalizeIntentV1(intent())).toBe(normalizeIntentV1(intent({ jurisdiction: ' us ', language: 'EN-us' })))
    expect(normalizeIntentV1(intent({ jurisdiction: 'AU', entityOrProgramId: 'au-subclass-485' }))).not.toBe(normalizeIntentV1(intent()))
    expect(normalizeIntentV1(intent({ readerJobId: 'check-application-status' }))).not.toBe(normalizeIntentV1(intent()))
    expect(normalizeIntentV1(intent({ readerJobId: '' }))).toBeNull()
  })

  it('refuses owner assignment from unresolved or similar candidates', () => {
    const owners = new Map([[normalizeIntentV1(intent())!, { ownerId: 'route-us-i485', version: 3 }]])
    expect(resolvePrimaryOwnerV1({ intentKey: normalizeIntentV1(intent())!, registeredOwners: owners, resolution: 'ambiguous' })).toEqual({ status: 'unresolved', reason: 'ambiguous' })
    expect(resolvePrimaryOwnerV1({ intentKey: normalizeIntentV1(intent())!, registeredOwners: owners, resolution: 'resolved' })).toEqual({ status: 'resolved', ownerId: 'route-us-i485', intentKey: normalizeIntentV1(intent()), version: 3 })
  })

  it('normalizes only a route under its declared host and rejects unsafe slug forms', () => {
    const route = normalizeRouteV1('https://legal.example.test/US/I-485-guide?utm_source=x', routePolicy)
    expect(route?.canonicalPath).toBe('/us/i-485-guide/')
    expect(normalizeRouteV1('https://other.example.test/us/i-485-guide', routePolicy)).toBeNull()
    expect(normalizeRouteV1('http://legal.example.test/us/i-485-guide', routePolicy)).toBeNull()
    expect(normalizeRouteV1('https://legal.example.test/%2e%2e/private', routePolicy)).toBeNull()
    expect(normalizeRouteV1('https://legal.example.test/a%2fb', routePolicy)).toBeNull()
    expect(normalizeRouteV1('https://legal.example.test/admin/draft', routePolicy)).toBeNull()
  })

  it('preserves a genuine trailing slash only when the route policy preserves it', () => {
    const preservePolicy = { ...routePolicy, trailingSlash: 'preserve' as const }
    expect(normalizeRouteV1('https://legal.example.test/guide/', preservePolicy)?.canonicalPath).toBe('/guide/')
    expect(normalizeRouteV1('https://legal.example.test/', preservePolicy)?.canonicalPath).toBe('/')
    expect(normalizeRouteV1('https://legal.example.test/guide', { ...preservePolicy, trailingSlash: 'never' })?.canonicalPath).toBe('/guide')
  })

  it('rejects raw URL backslashes before URL parsing can normalize them', () => {
    expect(normalizeRouteV1('https://legal.example.test/guide\\private', routePolicy)).toBeNull()
  })

  it('blocks live owners, tombstones, and pending intent or route reservations', () => {
    const intentKey = normalizeIntentV1(intent())!
    const route = normalizeRouteV1('https://legal.example.test/us/i-485-guide', routePolicy)!
    const base = emptyState()
    expect(preflightReservationV1({ intentKey, route, ownerId: 'new', state: { ...base, owners: new Map([[intentKey, { ownerId: 'existing', version: 1 }]]) } })).toEqual({ status: 'blocked', reason: 'intent_owned' })
    expect(preflightReservationV1({ intentKey, route, ownerId: 'new', state: { ...base, routes: new Map([[route.routeKey, { ownerId: 'old', state: 'tombstone' as const }]]) } })).toEqual({ status: 'blocked', reason: 'route_owned' })
    expect(preflightReservationV1({ intentKey, route, ownerId: 'new', state: { ...base, intentReservations: new Set([intentKey]) } })).toEqual({ status: 'blocked', reason: 'intent_reserved' })
    expect(preflightReservationV1({ intentKey, route, ownerId: 'new', state: { ...base, routeReservations: new Set([route.routeKey]) } })).toEqual({ status: 'blocked', reason: 'route_reserved' })
  })

  it('returns a deterministic in-memory reservation proposal without mutating state', () => {
    const state = emptyState()
    const key = normalizeIntentV1(intent())!
    const route = normalizeRouteV1('https://legal.example.test/us/i-485-guide', routePolicy)!
    const result = preflightReservationV1({ intentKey: key, route, ownerId: 'proposed-owner', state })
    expect(result.status).toBe('reserved')
    expect(state.intentReservations.size).toBe(0)
    expect(state.routeReservations.size).toBe(0)
  })
})

describe('NO_ACTION and dependency semantics', () => {
  const completeNoAction = {
    schemaVersion: ESTATE_OWNERSHIP_SCHEMA_VERSION,
    coverage: 'complete' as const,
    evidenceSufficient: true,
    meaningfulDemandOrMissionFit: 'no' as const,
    interventionCandidates: ['CREATE_PRIMARY'],
    noActionRationale: 'No meaningful demand or mission fit in the observed scope.',
    rejectedInterventions: [{ action: 'CREATE_PRIMARY', reason: 'NO_MEANINGFUL_DEMAND_OR_MISSION_FIT' }],
    nextReevaluationTrigger: 'new qualified demand evidence',
  }

  it('records NO_ACTION with rejected choices and preserves it under quota pressure', () => {
    const decision = evaluateDecisionV1({ ...completeNoAction, quotaPressure: 'exhausted' })
    expect(decision).toMatchObject({ outcome: 'NO_ACTION', policyVersion: 'studio.decision-policy/1', nextReevaluationTrigger: 'new qualified demand evidence' })
  })

  it('abstains when source coverage or evidence dependencies are incomplete even with no candidates', () => {
    expect(evaluateDecisionV1({ ...completeNoAction, interventionCandidates: [], coverage: 'partial' })).toMatchObject({ outcome: 'ABSTAIN', reason: 'INCOMPLETE_COVERAGE' })
    expect(evaluateDecisionV1({ ...completeNoAction, interventionCandidates: [], evidenceSufficient: false })).toMatchObject({ outcome: 'ABSTAIN', reason: 'INSUFFICIENT_EVIDENCE' })
  })

  it('does not label a missing rationale or rejected-choice trace as NO_ACTION', () => {
    expect(evaluateDecisionV1({ ...completeNoAction, noActionRationale: '' })).toMatchObject({ outcome: 'ABSTAIN', reason: 'MISSING_NO_ACTION_TRACE' })
    expect(evaluateDecisionV1({ ...completeNoAction, rejectedInterventions: [] })).toMatchObject({ outcome: 'ABSTAIN', reason: 'MISSING_REJECTED_CHOICES' })
  })
})
