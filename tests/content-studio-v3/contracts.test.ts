import { COUNTRY_LIST } from '@/lib/countryList'
import { ESTATE_OWNERSHIP_SCHEMA_VERSION, type EstateRoutePolicyV1 } from '@/lib/estateOwnership'
import {
  COUNTRY_LIST_DEFINITION,
  METRIC_DEFINITIONS,
  METRIC_KEYS,
  REJECTED_LEGACY_INTERVENTION_ALIASES,
  STUDIO_ACTION_KINDS,
  STUDIO_INTERVENTION_KINDS,
  acceptStudioActionKind,
  acceptStudioInterventionKind,
  computeDefinitionSetHash,
  metricTypeFromDefinition,
} from '@/lib/contentStudioV3/contracts/registry'
import {
  createSeoMetricSchema,
  validateSeoMetricSnapshot,
  type SeoMetricValidationContext,
} from '@/lib/contentStudioV3/contracts/schema'
import {
  ARTIFACT_HASH_DOMAIN,
  STRUCTURED_HASH_DOMAIN,
  describeArtifactHash,
  describeStructuredHash,
  hashArtifactBytes,
  hashStructuredPayload,
} from '@/lib/contentStudioV3/contracts/hashes'
import { hashContractPayload } from '@/lib/seoFactory/writingContract'

const routePolicy: EstateRoutePolicyV1 = {
  schemaVersion: ESTATE_OWNERSHIP_SCHEMA_VERSION,
  routePolicyVersion: 'portal-routes/1',
  hostId: 'portal',
  canonicalHost: 'example.test',
  pathCase: 'lowercase',
  trailingSlash: 'never',
  maxPathLength: 2048,
  reservedSegments: ['admin'],
}

const context: SeoMetricValidationContext = {
  currencyRegistry: {
    schemaVersion: 'studio.currency-registry-context/1',
    definitionVersion: 'test-currencies/1',
    accept(code) { return code === 'USD' ? { status: 'accepted', code } : { status: 'rejected', reason: 'unknown' } },
  },
  safeUrlPolicy: {
    schemaVersion: 'studio.safe-url-context/1',
    definitionVersion: 'estate-routes/1',
    routePolicy,
  },
}

const HASH = 'a'.repeat(64)

function provenance(overrides: Record<string, unknown> = {}) {
  return {
    observationId: 'obs-1', definitionVersion: 'metric/1', sourceRunId: 'run-1', projectId: 'project-1',
    subject: { kind: 'page', id: 'page-1' }, artifactHash: HASH,
    scope: { canonicalUrl: 'https://example.test/article', query: null, country: null, language: 'en', device: null, channel: null, searchType: null, propertyId: null, cohortId: null, currency: null, timezone: 'UTC' },
    window: { start: null, end: null }, sourceKind: 'artifact_analyzer', method: 'test', methodVersion: '1', modelVersion: null,
    evidenceIds: ['evidence-1'], inputHashes: [HASH], observedAt: '2026-10-01T12:00:00Z', ingestedAt: '2026-10-01T12:01:00Z', validUntil: null,
    quality: 'observed', completeness: 'complete', numerator: null, denominator: null, sampleSize: null, coverage: null, confidence: null, unit: 'count', warnings: [], collectionRef: null,
    ...overrides,
  }
}

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function validSnapshot(_ctx: SeoMetricValidationContext = context): any {
  const observations: Record<string, unknown> = {}
  for (const definition of METRIC_DEFINITIONS) {
    observations[definition.key] = { ...provenance(), status: 'unavailable', value: null, reason: 'not observed' }
  }
  return { schemaVersion: 'seo.metrics/2', definitionSetHash: computeDefinitionSetHash(), observations }
}

function validate(snapshot: Record<string, unknown>, ctx: SeoMetricValidationContext = context) {
  return validateSeoMetricSnapshot(snapshot, ctx)
}

function setPresent(snapshot: any, key: string, value: unknown, metadata: Record<string, unknown> = {}) {
  snapshot.observations[key] = { ...provenance(metadata), status: 'available', value, reason: null }
}

describe('versioned stateless metrics contract', () => {
  test('has the exact fifty registry-derived keys and strict generated schema', () => {
    expect(METRIC_KEYS).toHaveLength(50)
    expect(new Set(METRIC_KEYS).size).toBe(50)
    expect(Object.keys((createSeoMetricSchema().properties as any).observations.properties)).toEqual(METRIC_KEYS)
    expect(createSeoMetricSchema().additionalProperties).toBe(false)
    expect((createSeoMetricSchema().properties as any).observations.additionalProperties).toBe(false)
    expect(COUNTRY_LIST_DEFINITION.codes).toEqual([...new Set(COUNTRY_LIST.map(({ code }) => code))].sort())
    expect(COUNTRY_LIST_DEFINITION.source).toMatch(/countryList\.ts/)
    expect(METRIC_DEFINITIONS.map((definition) => metricTypeFromDefinition(definition))).toHaveLength(50)
    expect(STUDIO_ACTION_KINDS).toEqual(['INGEST', 'PLAN', 'GSC_SYNC', 'GSC_SCORE', 'LLM_AUDIT', 'RESEARCH', 'BRIEF', 'GENERATE', 'REAUDIT', 'SITE_HEALTH_AUDIT', 'SITE_HEALTH_REPAIR', 'VERIFY_URL', 'INTERLINK_SWEEP', 'PUBLISH'])
    expect(STUDIO_INTERVENTION_KINDS).toEqual(['RESEARCH', 'REFRESH', 'EXPAND_OWNER', 'CONSOLIDATE', 'REPAIR_TECHNICAL', 'RELINK_INTERNAL', 'AUTHORITY_WORK', 'CTR_OPTIMIZE', 'CONVERSION_PATH_REPAIR', 'GEO_REMEDIATION', 'CREATE_SUPPORTING', 'CREATE_PRIMARY', 'OBSERVE', 'NO_ACTION', 'ESCALATE'])
    for (const alias of REJECTED_LEGACY_INTERVENTION_ALIASES) expect(STUDIO_INTERVENTION_KINDS).not.toContain(alias)
    expect(STUDIO_ACTION_KINDS).not.toContain('CONSOLIDATE_RECOMMENDATION')
    for (const alias of REJECTED_LEGACY_INTERVENTION_ALIASES) {
      expect(acceptStudioActionKind(alias)).toEqual({ status: 'rejected', reason: 'legacy_alias' })
      expect(acceptStudioInterventionKind(alias)).toEqual({ status: 'rejected', reason: 'legacy_alias' })
    }
    for (const action of STUDIO_ACTION_KINDS) expect(acceptStudioActionKind(action)).toEqual({ status: 'accepted', value: action })
    for (const intervention of STUDIO_INTERVENTION_KINDS) expect(acceptStudioInterventionKind(intervention)).toEqual({ status: 'accepted', value: intervention })
  })

  test('rejects missing observations and extra root or nested properties', () => {
    const base = validSnapshot()
    const missing = jsonClone(base); delete missing.observations.searchVolume
    expect(validate(missing).ok).toBe(false)
    expect(validate({ ...base, extra: true }).ok).toBe(false)
    const nested = jsonClone(base); nested.observations.searchVolume.extra = true
    expect(validate(nested).ok).toBe(false)
    const scope = jsonClone(base); scope.observations.searchVolume.scope.extra = true
    expect(validate(scope).ok).toBe(false)
    const metricObject = jsonClone(base); setPresent(metricObject, 'primaryKeywordPlacement', { title: 'exact', H1: 'variant', intro: 'absent', meta: 'not_applicable' }, { subject: { kind: 'query', id: 'query-1' }, scope: { ...provenance().scope, query: 'q', country: 'US' } })
    metricObject.observations.primaryKeywordPlacement.value.extra = 'unknown'
    expect(validate(metricObject).ok).toBe(false)
  })

  test('enforces present and absent status value/evidence requirements', () => {
    const base = validSnapshot()
    const absent = jsonClone(base); absent.observations.targetKeyword = { ...provenance(), status: 'unavailable', value: null, reason: 'missing' }
    expect(validate(absent).ok).toBe(true)
    absent.observations.targetKeyword.value = 'not null'
    expect(validate(absent).ok).toBe(false)
    const noEvidence = jsonClone(base); setPresent(noEvidence, 'wordCount', 4); noEvidence.observations.wordCount.evidenceIds = []
    expect(validate(noEvidence).ok).toBe(false)
    const noInputHash = jsonClone(base); setPresent(noInputHash, 'wordCount', 4); noInputHash.observations.wordCount.inputHashes = []
    expect(validate(noInputHash).ok).toBe(false)
    const noReason = jsonClone(base); noReason.observations.targetKeyword = { ...provenance(), status: 'failed', value: null, reason: ' ' }
    expect(validate(noReason).ok).toBe(false)
    const badStatus = jsonClone(base); badStatus.observations.targetKeyword.status = 'missing'
    expect(validate(badStatus).ok).toBe(false)
    const stale = jsonClone(base); setPresent(stale, 'wordCount', 0); stale.observations.wordCount.status = 'stale'
    expect(validate(stale).ok).toBe(true)
  })

  test('applies type and number boundaries without coercion', () => {
    const base = validSnapshot()
    for (const value of ['12', NaN, Infinity, -Infinity]) {
      const candidate = jsonClone(base); setPresent(candidate, 'searchVolume', value)
      expect(validate(candidate).ok).toBe(false)
    }
    for (const [key, value] of [['wordCount', 1.5], ['headingCount', -1], ['keywordDifficulty', 101], ['passiveVoicePercentage', 101], ['clickThroughRate', 101], ['costPerClick', -1], ['searchVolume', -1], ['transitionWordDensity', -1]] as const) {
      const candidate = jsonClone(base); setPresent(candidate, key, value, key === 'clickThroughRate' ? { numerator: 1, denominator: 2, scope: { ...provenance().scope, cohortId: 'cohort-1' }, window: { start: '2026-10-01T00:00:00Z', end: '2026-10-02T00:00:00Z' } } : {})
      expect(validate(candidate).ok).toBe(false)
    }
    const allowed = jsonClone(base)
    setPresent(allowed, 'readabilityScore', -12.5)
    setPresent(allowed, 'fleschReadingEase', -80)
    setPresent(allowed, 'transitionWordDensity', 101.25)
    expect(validate(allowed).ok).toBe(true)
  })

  test('enforces array bounds, label bounds, uniqueness, and text limits', () => {
    const base = validSnapshot()
    const dupId = jsonClone(base); setPresent(dupId, 'altTextString', [{ id: 'x', alt: 'a', decorative: false, missing: false }, { id: 'x', alt: 'b', decorative: false, missing: false }])
    expect(validate(dupId).ok).toBe(false)
    const dupString = jsonClone(base); setPresent(dupString, 'longTailKeyword', ['x', 'x'])
    expect(validate(dupString).ok).toBe(false)
    const tooMany = jsonClone(base); setPresent(tooMany, 'schemaMarkupType', Array.from({ length: 101 }, (_, i) => `t${i}`))
    expect(validate(tooMany).ok).toBe(false)
    const longLabel = jsonClone(base); setPresent(longLabel, 'targetKeyword', 'x'.repeat(257))
    expect(validate(longLabel).ok).toBe(false)
    const longText = jsonClone(base); setPresent(longText, 'problemStatement', 'x'.repeat(4001))
    expect(validate(longText).ok).toBe(false)
  })

  test('checks instants, hashes, context dependencies and URL safety', () => {
    const base = validSnapshot()
    const date = jsonClone(base); date.observations.wordCount.observedAt = '2026-02-30T00:00:00Z'
    expect(validate(date).ok).toBe(false)
    const hash = jsonClone(base); setPresent(hash, 'wordCount', 4); hash.observations.wordCount.inputHashes = ['A'.repeat(64)]
    expect(validate(hash).ok).toBe(false)
    const noContexts = { currencyRegistry: null, safeUrlPolicy: null } as any
    const needsUrlContext = jsonClone(base); setPresent(needsUrlContext, 'canonicalUrl', 'https://example.test/article')
    expect(validate(needsUrlContext, noContexts).issues.some((issue: any) => issue.code === 'context_unavailable')).toBe(true)
    const url = jsonClone(base); setPresent(url, 'canonicalUrl', 'https://evil.test/path')
    expect(validate(url).ok).toBe(false)
    const nestedUrl = jsonClone(base); setPresent(nestedUrl, 'anchorText', [{ id: 'link-1', text: 'Read', accessibleName: 'Read article', target: 'https://evil.test/path', location: 'body' }])
    expect(validate(nestedUrl).ok).toBe(false)
    const slug = jsonClone(base); setPresent(slug, 'urlSlug', 'safe-path')
    expect(validate(slug).ok).toBe(true)
  })

  test('enforces ratio, conversion, query/country, CPC currency, and outcome cohort contexts', () => {
    const base = validSnapshot()
    const ratio = jsonClone(base); setPresent(ratio, 'clickThroughRate', 50, { numerator: 1, denominator: 0, scope: { ...provenance().scope, cohortId: 'cohort-1' }, window: { start: '2026-10-01T00:00:00Z', end: '2026-10-02T00:00:00Z' } })
    expect(validate(ratio).ok).toBe(false)
    const conversion = jsonClone(base); setPresent(conversion, 'conversionRate', 50, { numerator: 2, denominator: 1, sampleSize: 1, scope: { ...provenance().scope, cohortId: 'cohort-1' }, window: { start: '2026-10-01T00:00:00Z', end: '2026-10-02T00:00:00Z' } })
    expect(validate(conversion).ok).toBe(false)
    const query = jsonClone(base); setPresent(query, 'searchVolume', 10, { subject: { kind: 'page', id: 'page-1' }, scope: { ...provenance().scope, country: 'ZZ' } })
    expect(validate(query).ok).toBe(false)
    const cpc = jsonClone(base); setPresent(cpc, 'costPerClick', 1.5)
    expect(validate(cpc).ok).toBe(false)
    const validCpc = jsonClone(base); setPresent(validCpc, 'costPerClick', 1.5, { subject: { kind: 'query', id: 'query-1' }, scope: { ...provenance().scope, query: 'q', country: 'US', currency: 'USD' } })
    expect(validate(validCpc).ok).toBe(true)
    const unknownCurrency = jsonClone(validCpc); unknownCurrency.observations.costPerClick.scope.currency = 'CAD'
    expect(validate(unknownCurrency).ok).toBe(false)
    expect(validate(validCpc, { currencyRegistry: null, safeUrlPolicy: context.safeUrlPolicy }).issues.some((issue: any) => issue.code === 'context_unavailable')).toBe(true)
    const outcome = jsonClone(base); setPresent(outcome, 'conversionRate', 25, { scope: { ...provenance().scope, cohortId: null, timezone: '' }, window: { start: null, end: null } })
    expect(validate(outcome).ok).toBe(false)
  })

  test('rejects aliases, unsupported versions, and definition hash drift', () => {
    const base = validSnapshot()
    const alias = jsonClone(base); setPresent(alias, 'headlineType', 'CREATE')
    expect(validate(alias).ok).toBe(false)
    const version = jsonClone(base); version.schemaVersion = 'seo.metrics/1'
    expect(validate(version).issues.some((issue: any) => issue.code === 'unsupported_schema_version')).toBe(true)
    const hash = jsonClone(base); hash.definitionSetHash = 'f'.repeat(64)
    expect(validate(hash).ok).toBe(false)
  })

  test('rejects non-JSON subject and collection descriptors without invoking getters', () => {
    const base = validSnapshot()
    expect(validate(base).ok).toBe(true)

    const extraSubject = jsonClone(base)
    extraSubject.observations.wordCount.subject.extra = true
    expect(validate(extraSubject).issues.some((issue: any) => issue.path.includes('.subject.') && issue.code === 'extra_property')).toBe(true)

    const arraySubject = jsonClone(base)
    const masquerade: any[] = []
    ;(masquerade as any).kind = 'page'
    ;(masquerade as any).id = 'page-1'
    arraySubject.observations.wordCount.subject = masquerade
    expect(validate(arraySubject).ok).toBe(false)

    let getterCalls = 0
    const subjectGetter = { id: 'page-1' } as Record<string, unknown>
    Object.defineProperty(subjectGetter, 'kind', { enumerable: true, get() { getterCalls += 1; return 'page' } })
    const accessorSubject = jsonClone(base)
    setPresent(accessorSubject, 'searchVolume', 10, { subject: subjectGetter, scope: { ...provenance().scope, query: 'q', country: 'US' } })
    expect(validate(accessorSubject).ok).toBe(false)
    expect(getterCalls).toBe(0)
    const accessorArray: any[] = []
    Object.defineProperty(accessorArray, '0', { enumerable: true, configurable: true, get() { getterCalls += 1; return 'Article' } })
    accessorArray.length = 1
    const hostilePrototype: any[] = []
    Object.defineProperties(hostilePrototype, Object.getOwnPropertyDescriptors(Array.prototype) as unknown as PropertyDescriptorMap)
    Object.defineProperty(hostilePrototype, Symbol.iterator, { configurable: true, enumerable: false, writable: true, value: function* () { getterCalls += 1; yield 'Article' } })
    const hostileArray = ['Article']
    Object.setPrototypeOf(hostileArray, hostilePrototype)
    const malformedArrays: unknown[][] = [
      Array(1),
      Object.assign(['Article'], { extra: true }),
      Object.assign(['Article'], { 4294967295: 'extra' }),
      Object.assign(['Article'], { [Symbol('extra')]: 'extra' }),
      accessorArray,
      hostileArray,
    ]
    const hiddenArray: string[] = []
    Object.defineProperty(hiddenArray, '0', { enumerable: false, configurable: true, value: 'Article' })
    hiddenArray.length = 1
    malformedArrays.push(hiddenArray)

    for (const value of malformedArrays) {
      const candidate = jsonClone(base)
      setPresent(candidate, 'schemaMarkupType', value)
      expect(validate(candidate).ok).toBe(false)
      expect(getterCalls).toBe(0)
    }

    const nestedAccessor: Record<string, unknown> = {}
    Object.defineProperty(nestedAccessor, 'secret', { enumerable: true, get() { getterCalls += 1; return 'hidden' } })
    expect(() => hashStructuredPayload({ nested: [nestedAccessor] })).toThrow()
    expect(getterCalls).toBe(0)
    const hashAccessor: any[] = []
    Object.defineProperty(hashAccessor, '0', { enumerable: true, configurable: true, get() { getterCalls += 1; return 1 } })
    hashAccessor.length = 1
    expect(() => hashStructuredPayload(hashAccessor)).toThrow()
    expect(getterCalls).toBe(0)
    expect(() => hashStructuredPayload(Object.assign([], { 4294967295: 'extra' }))).toThrow()
    expect(() => hashStructuredPayload(hostileArray)).toThrow()
    expect(getterCalls).toBe(0)
  })

  test('uses exact-byte artifact hashing and delegates structured hashing unchanged', () => {
    expect(hashStructuredPayload({ a: 1, b: [2, 3] })).toBe('efbd0040190fb0871831e606c581f8a66db79d8e2bb836745a70051306956070')
    expect(hashStructuredPayload({ composed: 'é' })).toBe('2edf8a6c3718382fc5410d427e56bee468d42f0cb0d20d193ccf738fefd8124e')
    expect(hashArtifactBytes('é')).toBe('4a99557e4033c3539de2eb65472017cad5f9557f7a0625a09f1c3f6e2ba69c4c')
    expect(hashArtifactBytes('e\u0301')).toBe('bf12767b0f2a56b2190075bae8169f656e3ce8d6357d4aff184bc6c7ea48f9f6')
    expect(hashArtifactBytes('a\r\nb')).toBe('18745f36a05e29072709042d6062ce54f1b08ff36c27ba80c39f81fb010c8ce2')
    expect(hashArtifactBytes('a\nb')).toBe('7e18f737311b2dc3b2f269dd78396b0351f14fb66efa879f768cb23181883c78')
    expect(hashArtifactBytes('é')).not.toBe(hashArtifactBytes('e\u0301'))
    expect(hashArtifactBytes('a\r\nb')).not.toBe(hashArtifactBytes('a\nb'))
    expect(hashStructuredPayload({ a: 1, b: [2, 3] })).toBe(hashStructuredPayload({ b: [2, 3], a: 1 }))
    expect(hashStructuredPayload([1, 2])).not.toBe(hashStructuredPayload([2, 1]))
    expect(hashStructuredPayload({ composed: 'é' })).not.toBe(hashStructuredPayload({ composed: 'e\u0301' }))
    expect(hashContractPayload({ a: 1, b: [2, 3] })).toBe(hashStructuredPayload({ b: [2, 3], a: 1 }))
    expect(hashContractPayload({ value: undefined })).toBe('44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a')
    expect(hashArtifactBytes('{"a":1}')).toBe(hashStructuredPayload({ a: 1 }))
    expect(ARTIFACT_HASH_DOMAIN).not.toBe(STRUCTURED_HASH_DOMAIN)
    expect(describeArtifactHash('{"a":1}').domain).toBe(ARTIFACT_HASH_DOMAIN)
    expect(describeStructuredHash({ a: 1 }).domain).toBe(STRUCTURED_HASH_DOMAIN)
    expect(() => hashStructuredPayload({ value: undefined })).toThrow()
    expect(() => hashStructuredPayload([, 1])).toThrow()
    expect(() => hashStructuredPayload(Number.NaN)).toThrow()
    expect(() => hashStructuredPayload(Infinity)).toThrow()
    const cycle: any = {}; cycle.self = cycle
    expect(() => hashStructuredPayload(cycle)).toThrow()
    expect(hashContractPayload({ value: undefined })).toMatch(/^[0-9a-f]{64}$/)
  })
})
