import { hashStructuredPayload } from '@/lib/contentStudioV3/contracts/hashes'
import {
  getNormativeJsonSchema,
  hashNormativeStructuredPayload,
  NORMATIVE_CONTRACT_SCHEMAS,
  validateNormativeContract,
  type CodecRegistryContext,
} from '@/lib/contentStudioV3/contracts/normativeRegistry'

const hash = 'a'.repeat(64)
const registryNames = [
  'jurisdiction', 'legalSystem', 'entity', 'programOrPathway', 'audience', 'readerJob', 'language',
  'country', 'serviceContext', 'evidence', 'predicate', 'unit', 'sourceAuthorityClass', 'reviewer',
  'timezone', 'predicateVersion', 'relationType', 'semanticIdentity', 'queryFamily', 'ownerRoute',
  'cluster', 'metricSnapshot', 'problemType', 'semanticGap', 'competitorGap', 'informationGainAssessment',
  'collisionBundle', 'authorityGapState', 'commercialPathState', 'policyEligibleAction', 'policyAction',
  'policyReason', 'policyVersion', 'featureSet', 'decisionRecord', 'expectedOutcomeContract',
  'observationPlan', 'opportunity', 'stateSnapshot', 'release', 'changedDimension', 'knownChange',
  'expectedOutcome', 'confounder', 'decisionFeature', 'observation', 'reasonCode', 'project',
  'estateSnapshot', 'owner', 'eligibilityEvaluation', 'rubricVersion', 'answerUnit', 'sourceRef',
  'decisionChoice', 'outOfDistributionFlag', 'decisionScoreLegend', 'decisionScoreOption',
]
const registryValues = [
  'US', 'en', 'identity-1', 'entity-1', 'entity-2', 'program-1', 'audience-1', 'job-1',
  'service-1', 'evidence-1', 'predicate-1', 'unit-1', 'authority-1', 'reviewer-1', 'UTC',
  'predicate-v1', 'relation-1', 'query-family-1', 'route-1', 'cluster-1', 'snapshot-1',
  'problem-1', 'semantic-gap-1', 'competitor-gap-1', 'gain-1', 'collision-1', 'authority-gap-1',
  'commercial-path-1', 'create', 'refresh', 'NO_ACTION', 'CREATE_PRIMARY', 'reason-1', 'policy-v1', 'feature-1',
  'decision-1', 'outcome-1', 'observation-plan-1', 'state-snapshot-1', 'opportunity-1',
  'changed-dimension-1', 'known-change-1', 'expected-outcome-1', 'confounder-1', 'release-1', 'feature-key-1',
  'observation-1', 'project-1', 'estate-snapshot-1', 'owner-1', 'eligibility-1', 'rubric-1',
  'answer-unit-1', 'source-ref-1', 'rubric-v1', 'choice-a', 'choice-b', 'flag-1', 'legend-a', 'score-a',
]
const fixtureRegistry: CodecRegistryContext = {
  schemaVersion: 'studio.normative-registry-context/1',
  registries: Object.fromEntries(registryNames.map((name) => [
    name, { definitionVersion: 'fixture-only/1', values: registryValues },
  ])),
}
// This synthetic context exercises structural reference checks only; it is not production authority.
const context = fixtureRegistry

const identity = {
  schemaVersion: 'studio.semantic-identity/1',
  semanticId: 'identity-1', ontologyVersion: 'ontology-v1', resolverVersion: 'resolver-v1',
  jurisdiction: null, legalSystem: null, entityIds: [], programOrPathwayId: null,
  audienceId: 'audience-1', readerJobId: 'job-1',
  journeyStage: 'unknown', searchIntent: 'unknown', language: 'en', countryContext: null,
  temporalContext: { effectiveAt: null, validFrom: null, validTo: null },
  serviceContextIds: [], evidenceIds: [], status: 'ambiguous',
}
const fact = {
  factId: 'fact-1', subjectEntityId: 'entity-1', predicate: 'predicate-1',
  objectEntityId: null, scalarValue: '485', unit: null,
  qualifiers: { jurisdiction: null, legalSystem: null, audienceIds: [], programOrPathwayId: null, validFrom: null, validTo: null, effectiveAt: null },
  evidenceIds: ['evidence-1'], contradictionEvidenceIds: [],
  supportState: 'unverified', sourceHealth: 'unavailable', sourceAuthorityClass: 'authority-1',
  verification: 'model_candidate', extractorVersion: null, reviewerId: null,
  recordedAt: '2026-10-02T12:00:00Z', supersedesFactId: null,
  legalDatePrecision: 'unknown', legalTimezone: null, predicateVersion: 'predicate-v1',
  supportFingerprint: hash, factHash: hash,
}
const relation = {
  relationId: 'relation-1', relationType: 'relation-1', subjectId: 'entity-1', objectId: 'entity-2',
  scope: { jurisdiction: null, language: null, audienceId: null }, evidenceIds: [],
  derivation: { method: 'method-1', methodVersion: 'method-v1', modelVersion: null },
  authorityClass: 'CANDIDATE', confidence: null, validFrom: null, validTo: null,
  status: 'active', invalidationReason: null,
}
const opportunity = {
  opportunityId: 'opportunity-1', version: 1, semanticIdentityId: 'identity-1',
  queryFamilyIds: ['query-family-1'], readerJobId: 'job-1', ownerRouteId: null,
  clusterId: null, jurisdiction: null, metricSnapshotId: null, evidenceIds: [],
  problemType: 'problem-1', semanticGapIds: [], competitorGapIds: [],
  informationGainAssessmentId: null, collisionBundleId: null, cannibalizationRiskState: 'unknown',
  authorityGapState: 'authority-gap-1', commercialPathState: 'commercial-path-1',
  eligibleActions: [], blockedActions: [], policyVersion: 'policy-v1', featureSetId: null,
  decisionRecordId: null, recommendedAction: null, recommendationState: 'pending',
  predictedOutcome: [], interventionCostClass: 'S0_DETERMINISTIC_CPU',
  expectedOutcomeContractId: null, observationPlanId: 'observation-plan-1',
  status: 'blocked', createdAt: '2026-10-02T12:00:00Z', supersededBy: null,
}
const decisionState = {
  schemaVersion: 'studio.decision-state/2', projectId: 'project-1', decisionTask: 'D0_RELATION',
  subjectId: 'subject-pair', subjectVersion: 1, estateSnapshotId: 'estate-snapshot-1',
  estateSnapshotHash: hash, semanticIdentityHash: hash, ontologyVersion: 'ontology-v1',
  ownerId: null, ownerVersion: null, policyVersion: 'policy-v1',
  eligibilityEvaluationId: 'eligibility-1', eligibleSetHash: hash,
  featureSetId: 'feature-1', featureSetVersion: 'feature-v1', rubricVersion: 'rubric-v1',
  semanticSpaceVersion: null, expectedModelVersion: 'model-v1',
  subjects: [
    { id: 'subject-a', revisionHash: hash, jurisdiction: null, readerJob: null, purpose: null, answerUnits: [], sourceRefs: [] },
    { id: 'subject-b', revisionHash: hash, jurisdiction: null, readerJob: null, purpose: null, answerUnits: [], sourceRefs: [] },
  ],
  features: [], evidenceState: {
    completeness: 'unknown', freshness: 'unknown', contradictions: null, requiredReviewer: null, reasonCodes: [],
  },
  allowedChoices: ['choice-a', 'choice-b'], outOfDistributionFlags: ['flag-1'],
  inputArtifactHashes: [hash], computedAt: '2026-10-02T12:00:00Z', validUntil: '2026-10-03T12:00:00Z',
}
const gain = {
  assessmentId: 'gain-1', ownerRouteId: null, ownerVersion: null,
  proposedAnswerUnits: ['answer-unit-1'], alreadySatisfiedUnits: [], genuinelyNewUnits: [],
  unsupportedUnits: [], proposedRevisionHash: hash, identityVersion: 'identity-v1',
  coverageSnapshotHash: hash, comparedOwnerRevisions: [],
  comparisonCompleteness: 'unknown', uniqueReaderJob: 'unknown', estimatedGainState: 'unknown',
  evidenceIds: [], analyzerVersion: 'analyzer-v1',
}
const intervention = {
  interventionId: 'intervention-1', opportunityId: 'opportunity-1', action: 'CREATE_PRIMARY',
  ownerRouteId: null, preStateSnapshotId: 'state-snapshot-1', postReleaseId: null,
  changedDimensions: [], concurrentKnownChanges: [], expectedOutcomeIds: [],
  observationPlanId: 'observation-plan-1',
  prediction: {
    predictedMetrics: [], targetQueryFamilies: [], expectedReaderBenefit: 'Answer the reader task.',
    confoundersKnown: [], predictionAuthor: 'rule', createdAt: '2026-10-02T12:00:00Z',
  },
  plannedAt: '2026-10-02T12:00:00Z', executedAt: null,
}
const valid = (name: keyof typeof NORMATIVE_CONTRACT_SCHEMAS, value: unknown) =>
  validateNormativeContract(name, value, context)

describe('inactive normative codec registry', () => {
  test('accepts exact canonical fixtures without promoting ambiguity, candidate facts, or blocked actions', () => {
    expect(valid('SemanticIdentity', identity).ok).toBe(true)
    expect(valid('SemanticFact', fact).ok).toBe(true)
    expect(valid('SemanticRelation', relation).ok).toBe(true)
    expect(relation.authorityClass).toBe('CANDIDATE')
    expect(valid('SemanticFact', { ...fact, qualifiers: { ...fact.qualifiers, validFrom: '2026-10-03T00:00:00Z', validTo: '2026-10-02T00:00:00Z' } }).ok).toBe(false)
    expect(valid('SemanticOpportunity', opportunity).ok).toBe(true)
    expect(valid('InformationGainAssessment', gain).ok).toBe(true)
    expect(valid('InterventionRecord', intervention).ok).toBe(true)
    expect(valid('InterventionRecord', { ...intervention, action: 'PUBLISH' }).ok).toBe(false)
    expect(valid('InterventionRecord', { ...intervention, executedAt: '2026-10-01T12:00:00Z' }).ok).toBe(false)
    expect(valid('SemanticOpportunity', { ...opportunity, eligibleActions: ['not-registered'] }).ok).toBe(false)
    expect(valid('DecisionState', decisionState).ok).toBe(true)
    expect(identity.status).toBe('ambiguous')
    expect(fact.verification).toBe('model_candidate')
    expect(opportunity.eligibleActions).toEqual([])
  })

  test('fails closed when a registry-backed reference has no supplied versioned context', () => {
    const result = validateNormativeContract('SemanticIdentity', { ...identity, language: 'en' })
    expect(result.ok).toBe(false)
    expect(result.issues.some((issue) => issue.code === 'context_unavailable')).toBe(true)
    expect(validateNormativeContract('not-a-contract' as keyof typeof NORMATIVE_CONTRACT_SCHEMAS, identity, context).ok).toBe(false)
  })

  test('rejects unknown properties recursively, missing fields, numeric strings and closed-enum aliases', () => {
    expect(valid('SemanticIdentity', { ...identity, extra: true }).ok).toBe(false)
    expect(valid('SemanticFact', { ...fact, qualifiers: { ...fact.qualifiers, surprise: true } }).ok).toBe(false)
    expect(valid('SemanticOpportunity', { ...opportunity, version: '1' }).ok).toBe(false)
    expect(valid('SemanticIdentity', { ...identity, journeyStage: 'NEXT' }).ok).toBe(false)
    const missing = { ...identity }
    delete (missing as Record<string, unknown>).semanticId
    expect(valid('SemanticIdentity', missing).ok).toBe(false)
  })

  test('rejects malformed instants, hashes, sparse arrays and custom prototypes', () => {
    expect(valid('SemanticFact', { ...fact, recordedAt: '2026-02-30T10:00:00Z' }).ok).toBe(false)
    expect(valid('SemanticFact', { ...fact, factHash: 'A'.repeat(64) }).ok).toBe(false)
    const sparse = { ...identity, entityIds: new Array(1) }
    expect(valid('SemanticIdentity', sparse).ok).toBe(false)
    expect(valid('SemanticIdentity', Object.assign(Object.create({ inherited: true }), identity)).ok).toBe(false)
  })

  test('does not invoke getters while rejecting hostile data', () => {
    let getterCalls = 0
    const hostile = { ...identity }
    Object.defineProperty(hostile, 'semanticId', { enumerable: true, get() { getterCalls += 1; return 'identity-1' } })
    expect(valid('SemanticIdentity', hostile).ok).toBe(false)
    expect(getterCalls).toBe(0)
  })

  test('enforces D0 subject cardinality while keeping D6 bounded without inventing subject roles', () => {
    expect(valid('DecisionState', { ...decisionState, subjects: [decisionState.subjects[0]] }).ok).toBe(false)
    expect(valid('DecisionState', { ...decisionState, subjects: [decisionState.subjects[0], decisionState.subjects[0]] }).ok).toBe(false)
    const d6 = { ...decisionState, decisionTask: 'D6_FUNNEL', subjects: decisionState.subjects.slice(0, 1) }
    expect(valid('DecisionState', d6).ok).toBe(true)
    expect(valid('DecisionState', { ...d6, subjects: [...decisionState.subjects, ...decisionState.subjects, ...decisionState.subjects] }).ok).toBe(false)
  })

  test('preserves typed Jev answers and does not renormalize distributions', () => {
    const answer = {
      type: 'choice', choice: 'choice-a',
      probabilities: { 'choice-a': 0.2, 'choice-b': 0.2 }, confidence: 0.1,
    }
    const record = {
      schemaVersion: 'studio.decision-record/2', decisionId: 'decision-1', decisionTask: 'D1_DIAGNOSIS',
      subjectId: 'opportunity-1', subjectVersion: 1, decisionStateHash: hash,
      inputArtifactHashes: [hash], eligibleSetHash: hash, provider: 'typesafe',
      requestedModelVersion: 'model-v1', returnedModelVersion: null, rubricVersion: 'rubric-v1',
      ontologyVersion: 'ontology-v1', featureSetVersion: 'feature-v1', calibrationVersion: null,
      requestHash: hash, responseArtifactKey: null, providerOutcome: 'ok', answer,
      selectedOption: 'choice-a', abstained: false, abstentionReasonCode: null,
      policyResult: { eligible: false, evaluationId: null, reasonCodes: ['reason-1'] },
      mode: 'shadow', inputTokens: null, outputTokens: null, latencyMs: null,
      createdAt: '2026-10-02T12:00:00Z', supersedesDecisionId: null,
    }
    expect(valid('DecisionRecord', record).ok).toBe(true)
    expect(valid('DecisionRecord', { ...record, providerOutcome: 'timeout' }).ok).toBe(false)
    expect(valid('DecisionRecord', { ...record, providerOutcome: 'timeout', answer: null, selectedOption: null, returnedModelVersion: null, calibrationVersion: null }).ok).toBe(true)
    expect(record.answer.type).toBe('choice')
    expect(Object.values(answer.probabilities).reduce((sum, item) => sum + item, 0)).toBe(0.4)
  })

  test('generates closed JSON Schemas from the same immutable descriptors', () => {
    const schema = getNormativeJsonSchema('SemanticIdentity')
    expect(schema.additionalProperties).toBe(false)
    expect((schema.required as string[]).includes('readerJobId')).toBe(true)
    expect(Object.isFrozen(NORMATIVE_CONTRACT_SCHEMAS.SemanticIdentity)).toBe(true)
    for (const name of Object.keys(NORMATIVE_CONTRACT_SCHEMAS) as (keyof typeof NORMATIVE_CONTRACT_SCHEMAS)[]) {
      const generated = getNormativeJsonSchema(name)
      expect(generated.$id).toBe(`studio.normative-codecs/1/${name}`)
      expect(generated.type ?? generated.oneOf).toBeDefined()
    }
  })

  test('delegates structured hashing to the frozen kernel serializer', () => {
    const payload = { status: 'unknown', unicode: 'I-485/485', value: null }
    expect(hashNormativeStructuredPayload(payload)).toBe(hashStructuredPayload(payload))
  })
})
