import {
  evaluateRequiredSource,
  normalizeObservation,
  SOURCE_BINDING_SCHEMA,
  SOURCE_OBSERVATION_SCHEMA,
  SOURCE_PROVENANCE_ACTIVATION_ENABLED,
  validateSourceBinding,
  type ObservationInputV1,
  type SourceBindingV1,
} from '../lib/sourceProvenance'

const binding: SourceBindingV1 = {
  schemaVersion: SOURCE_BINDING_SCHEMA,
  bindingId: 'binding:gsc:main',
  sourceId: 'gsc',
  accountScope: 'account:analytics',
  propertyScope: 'property:sc-domain:yousafe.example',
  adapterVersion: 'gsc-adapter/1',
  sourceSchemaVersion: 'gsc-export/1',
  secretReference: 'secret:gsc-readonly',
  rightsClass: 'licensed:analytics-read',
  validityRuleId: 'source-watermark/gsc/1',
  invalidationRuleIds: ['credential-revoked/1', 'source-corrected/1'],
}

const observation = (overrides: Partial<ObservationInputV1> = {}): ObservationInputV1 => ({
  schemaVersion: SOURCE_OBSERVATION_SCHEMA,
  observationId: 'obs:001',
  projectId: 'project:portal',
  binding,
  sourceRunId: 'run:001',
  subjectKind: 'page',
  subjectId: 'route:home',
  metricKey: 'clicks',
  scope: { country: 'US', device: null, property: 'sc-domain:yousafe.example' },
  window: { start: '2026-09-01T00:00:00Z', end: '2026-09-02T00:00:00Z' },
  value: 0,
  state: 'available',
  health: 'healthy',
  coverage: 'complete',
  coverageFraction: 1,
  retrievalMethod: 'api-export',
  retrievalVersion: 'gsc-adapter/1',
  retrievedAt: '2026-09-03T12:00:00Z',
  effectiveWindow: { start: '2026-09-01T00:00:00Z', end: '2026-09-02T00:00:00Z' },
  artifactLocator: 'artifact:sha256:abc',
  artifactDigest: 'a'.repeat(64),
  normalizationVersion: 'source-normalizer/1',
  ...overrides,
})

describe('source provenance v1 contract', () => {
  it('keeps activation disabled and versions binding/observation interfaces', () => {
    expect(SOURCE_PROVENANCE_ACTIVATION_ENABLED).toBe(false)
    expect(binding.schemaVersion).toBe('studio.source-binding/1')
    expect(observation().schemaVersion).toBe('studio.source-observation/1')
  })

  it('rejects incomplete source bindings without attempting source access', () => {
    expect(validateSourceBinding({ ...binding, accountScope: '', secretReference: 'raw secret value' })).toEqual(
      expect.arrayContaining(['BINDING_ACCOUNTSCOPE_INVALID']),
    )
    expect(validateSourceBinding({ ...binding, invalidationRuleIds: ['same', 'same'] })).toContain('BINDING_INVALIDATION_RULES_INVALID')
  })

  it('rejects non-string token fields before applying the token regex', () => {
    for (const value of [undefined, null]) {
      const malformed = { ...observation(), observationId: value } as unknown as ObservationInputV1
      expect(normalizeObservation(malformed).issues).toContain('OBSERVATIONID_INVALID')
      expect(evaluateRequiredSource(normalizeObservation(malformed)).outcome).toBe('ABSTAIN')
      expect(validateSourceBinding({ ...binding, bindingId: value } as unknown as SourceBindingV1))
        .toContain('BINDING_BINDINGID_INVALID')
    }
  })

  it('normalizes scope order and produces stable evidence identity', () => {
    const first = normalizeObservation(observation())
    const reordered = normalizeObservation(observation({ scope: { property: 'sc-domain:yousafe.example', device: null, country: 'US' } }))
    expect(first.issues).toEqual([])
    expect(first.evidenceIdentity).toBe(reordered.evidenceIdentity)
    expect(evaluateRequiredSource(first)).toEqual({ outcome: 'READY', evidenceIdentity: first.evidenceIdentity })
  })

  it('rejects a supplied evidence identity that does not match the validated tuple', () => {
    const normalized = normalizeObservation(observation())
    expect(evaluateRequiredSource({ ...normalized, evidenceIdentity: 'forged-identity' })).toEqual({
      outcome: 'ABSTAIN', reasonCodes: ['REQUIRED_SOURCE_IDENTITY_MISMATCH'],
    })
  })

  it('preserves evidenced numeric zero as an available value', () => {
    const zero = normalizeObservation(observation({ value: 0 }))
    expect(zero.issues).toEqual([])
    expect(zero.value).toBe(0)
    expect(evaluateRequiredSource(zero).outcome).toBe('READY')
  })

  it('keeps complete empty results distinct from zero and unavailable', () => {
    const empty = normalizeObservation(observation({ state: 'empty', value: null }))
    expect(empty.issues).toEqual([])
    expect(empty.state).toBe('empty')
    expect(evaluateRequiredSource(empty).outcome).toBe('READY')

    const unavailable = normalizeObservation(observation({ state: 'unavailable', health: 'unavailable', value: null }))
    expect(unavailable.issues).toEqual([])
    expect(evaluateRequiredSource(unavailable)).toEqual({ outcome: 'ABSTAIN', reasonCodes: ['REQUIRED_SOURCE_NOT_AVAILABLE'] })

    const unavailableWithUnknownCoverage = normalizeObservation(observation({
      state: 'unavailable', health: 'unavailable', coverage: 'unknown', value: null,
    }))
    expect(unavailableWithUnknownCoverage.issues).toEqual([])
    expect(evaluateRequiredSource(unavailableWithUnknownCoverage)).toEqual({
      outcome: 'ABSTAIN', reasonCodes: ['REQUIRED_SOURCE_NOT_AVAILABLE'],
    })
    expect(normalizeObservation(observation({ state: 'empty', value: null, artifactLocator: null, artifactDigest: null })).issues)
      .toContain('EMPTY_ARTIFACT_REQUIRED')
  })

  it('abstains for partial coverage, source failure and missing required evidence', () => {
    const partial = normalizeObservation(observation({ state: 'partial', health: 'degraded', coverage: 'partial', coverageFraction: 0.4, value: null }))
    expect(evaluateRequiredSource(partial).outcome).toBe('ABSTAIN')
    const failed = normalizeObservation(observation({ state: 'failed', health: 'failed', coverage: 'unknown', value: null }))
    expect(evaluateRequiredSource(failed).outcome).toBe('ABSTAIN')
    expect(evaluateRequiredSource(null)).toEqual({ outcome: 'ABSTAIN', reasonCodes: ['REQUIRED_SOURCE_MISSING'] })
  })

  it('rejects invalid digests, timestamps, bounds, and numeric coercions', () => {
    const invalid = normalizeObservation(observation({
      retrievedAt: 'yesterday',
      window: { start: '2026-09-02T00:00:00Z', end: '2026-09-01T00:00:00Z' },
      artifactDigest: 'not-a-digest',
      coverageFraction: 101,
      value: '0',
    }))
    expect(invalid.issues).toEqual(expect.arrayContaining([
      'RETRIEVED_AT_INVALID', 'WINDOW_ORDER_INVALID', 'ARTIFACT_DIGEST_INVALID',
      'COVERAGE_FRACTION_INVALID',
    ]))
    expect(evaluateRequiredSource(invalid).outcome).toBe('ABSTAIN')
  })

  it('rejects zero-filling unavailable state and source health contradictions', () => {
    expect(normalizeObservation(observation({ state: 'unavailable', health: 'unavailable', value: 0 })).issues)
      .toContain('NON_AVAILABLE_VALUE_MUST_BE_NULL')
    expect(normalizeObservation(observation({ state: 'available', health: 'unknown' })).issues)
      .toContain('POSITIVE_STATE_REQUIRES_HEALTHY_COMPLETE_COVERAGE')
    expect(normalizeObservation(observation({ state: 'empty', value: null, coverage: 'partial' })).issues)
      .toContain('EMPTY_REQUIRES_COMPLETE_COVERAGE')
  })

  it('does not claim durable SHA-256 identity from the in-memory tuple identity', () => {
    const normalized = normalizeObservation(observation())
    expect(normalized.evidenceIdentity).toContain('studio.evidence-identity/1')
    expect(normalized.evidenceIdentity).not.toMatch(/^[a-f0-9]{64}$/)
  })

  it('encodes nullable tuple members unambiguously and binds identity to material evidence fields', () => {
    const base = normalizeObservation(observation())
    expect(normalizeObservation(observation({ binding: { ...binding, propertyScope: '-' } })).evidenceIdentity)
      .not.toBe(normalizeObservation(observation({ binding: { ...binding, propertyScope: null } })).evidenceIdentity)
    const changes: Partial<ObservationInputV1>[] = [
      { state: 'available', value: 1 }, { health: 'degraded' }, { coverage: 'partial' },
      { coverageFraction: 0.5 }, { value: 3 }, { retrievalMethod: 'cache' },
      { retrievalVersion: 'adapter/2' }, { window: { start: null, end: null } },
      { effectiveWindow: { start: null, end: null } },
    ]
    for (const change of changes) expect(normalizeObservation(observation(change)).evidenceIdentity).not.toBe(base.evidenceIdentity)
  })

  it('fails closed for malformed runtime shapes and enum values without throwing', () => {
    const malformed = normalizeObservation({ ...observation(), scope: null, window: null, binding: null, state: 'mystery', health: 'ok', coverage: 'all' } as unknown as ObservationInputV1)
    expect(malformed.issues.length).toBeGreaterThan(0)
    expect(evaluateRequiredSource(malformed).outcome).toBe('ABSTAIN')
    expect(() => normalizeObservation({ ...observation(), binding: { ...binding, invalidationRuleIds: null } as unknown as SourceBindingV1 })).not.toThrow()
    expect(evaluateRequiredSource({ ...normalizeObservation(observation()), state: 'mystery' } as unknown as ReturnType<typeof normalizeObservation>)).toEqual({
      outcome: 'ABSTAIN', reasonCodes: ['REQUIRED_SOURCE_ENUM_INVALID'],
    })
    expect(validateSourceBinding(null as unknown as SourceBindingV1)).toContain('BINDING_SHAPE_INVALID')
  })
})
