import { array, bool, enm, map, nullable, number, object, str, union, type Infer, type CodecIssue } from './canonicalSchema'
import { validateNode, type CodecRegistryContext, type CodecResult } from './canonicalSchema'

const id = (registry?: string) => str(256, registry)
const ids = (registry?: string) => array(id(registry), 100, 0, true)
const hash = () => str(64, undefined, 'sha256')
const instant = nullable(str(64, undefined, 'date-time'))
const family = enm(['D0_RELATION', 'D1_DIAGNOSIS', 'D2_INTERVENTION', 'D6_FUNNEL'] as const)

export const decisionFeatureSchema = object({
  key: id('decisionFeature'), value: nullable(union(number(), bool(), str(4096))),
  status: enm(['available', 'stale', 'partial', 'unavailable', 'not_applicable'] as const),
  unit: id('unit'), definitionVersion: id(), scopeHash: hash(),
  windowStart: instant, windowEnd: instant, observedAt: instant, validUntil: instant,
  observationIds: ids('observation'), reason: nullable(id('reasonCode')),
})
export type DecisionFeature = Infer<typeof decisionFeatureSchema>

export const decisionStateSchema = object({
  schemaVersion: enm(['studio.decision-state/2'] as const),
  projectId: id('project'), decisionTask: family, subjectId: id(), subjectVersion: number({ integer: true, min: 1 }),
  estateSnapshotId: id('estateSnapshot'), estateSnapshotHash: hash(),
  semanticIdentityHash: hash(), ontologyVersion: id(), ownerId: nullable(id('owner')),
  ownerVersion: nullable(id()), policyVersion: id('policyVersion'),
  eligibilityEvaluationId: id('eligibilityEvaluation'), eligibleSetHash: hash(),
  featureSetId: id('featureSet'), featureSetVersion: id(), rubricVersion: id('rubricVersion'),
  semanticSpaceVersion: nullable(id()), expectedModelVersion: id(),
  subjects: array(object({
    id: id(), revisionHash: hash(), jurisdiction: nullable(id('jurisdiction')),
    readerJob: nullable(id('readerJob')), purpose: nullable(id('purpose')),
    answerUnits: ids('answerUnit'), sourceRefs: ids('sourceRef'),
  }), 6, 1),
  features: array(decisionFeatureSchema, 100),
  evidenceState: object({
    completeness: enm(['complete', 'partial', 'unknown'] as const),
    freshness: enm(['current', 'stale', 'unknown'] as const),
    contradictions: nullable(number({ integer: true, min: 0 })),
    requiredReviewer: nullable(bool()), reasonCodes: ids('reasonCode'),
  }),
  allowedChoices: ids('decisionChoice'), outOfDistributionFlags: ids('outOfDistributionFlag'),
  inputArtifactHashes: array(hash(), 100, 0, true),
  computedAt: str(64, undefined, 'date-time'), validUntil: str(64, undefined, 'date-time'),
})
export type DecisionState = Infer<typeof decisionStateSchema>

export const jevAnswerSchema = union(
  object({ type: enm(['choice'] as const), choice: id('decisionChoice'),
    probabilities: map(number({ min: 0, max: 1 }), 100, 'decisionChoice'), confidence: number({ min: 0, max: 1 }) }),
  object({ type: enm(['score'] as const), score: number(),
    legend: map(str(1024), 100, 'decisionScoreLegend'),
    probabilities: map(number({ min: 0, max: 1 }), 100, 'decisionScoreOption'), confidence: number({ min: 0, max: 1 }) }),
  object({ type: enm(['noul'] as const), noul: number() }),
)
export type JevAnswer = Infer<typeof jevAnswerSchema>

export const decisionRecordSchema = object({
  schemaVersion: enm(['studio.decision-record/2'] as const),
  decisionId: id(), decisionTask: family, subjectId: id(), subjectVersion: number({ integer: true, min: 1 }),
  decisionStateHash: hash(), inputArtifactHashes: array(hash(), 100, 0, true), eligibleSetHash: hash(),
  provider: enm(['typesafe'] as const), requestedModelVersion: id(), returnedModelVersion: nullable(id()),
  rubricVersion: id(), ontologyVersion: id(), featureSetVersion: id(),
  calibrationVersion: nullable(id()), requestHash: hash(), responseArtifactKey: nullable(id()),
  providerOutcome: enm(['ok', 'timeout', 'rate_limited', 'overloaded', 'auth_failed', 'schema_failed', 'provider_failed', 'budget_blocked', 'not_called'] as const),
  answer: nullable(jevAnswerSchema), selectedOption: nullable(id('decisionChoice')),
  abstained: bool(), abstentionReasonCode: nullable(id('reasonCode')),
  policyResult: object({ eligible: bool(), evaluationId: nullable(id('eligibilityEvaluation')), reasonCodes: ids('reasonCode') }),
  mode: enm(['shadow', 'advisory', 'bounded_assist', 'expanded_bounded'] as const),
  inputTokens: nullable(number({ integer: true, min: 0 })), outputTokens: nullable(number({ integer: true, min: 0 })),
  latencyMs: nullable(number({ integer: true, min: 0 })),
  createdAt: str(64, undefined, 'date-time'), supersedesDecisionId: nullable(id()),
})
export type DecisionRecord = Infer<typeof decisionRecordSchema>

export function validateDecisionState(input: unknown, context?: CodecRegistryContext): CodecResult {
  const result = validateNode(decisionStateSchema, input, context)
  if (!result.ok) return result
  const value = input as DecisionState
  const expected = value.decisionTask === 'D0_RELATION' ? 2
    : value.decisionTask === 'D6_FUNNEL' ? null : 1
  if ((expected !== null && value.subjects.length !== expected) || (value.decisionTask === 'D6_FUNNEL' && value.subjects.length > 6)) {
    const issue: CodecIssue = { path: '$.subjects', code: 'invalid_value', message: 'Subject count does not match the decision-family contract.' }
    return { ok: false, issues: [issue] }
  }
  const subjectIds = new Set<string>()
  for (const subject of value.subjects) {
    if (subjectIds.has(subject.id)) return { ok: false, issues: [{ path: '$.subjects', code: 'invalid_value', message: 'Decision subjects must have distinct IDs.' }] }
    subjectIds.add(subject.id)
  }
  const featureKeys = new Set<string>()
  for (const feature of value.features) {
    if (featureKeys.has(feature.key)) return { ok: false, issues: [{ path: '$.features', code: 'invalid_value', message: 'Decision feature keys must be unique.' }] }
    featureKeys.add(feature.key)
  }
  return result
}
export function validateDecisionRecord(input: unknown, context?: CodecRegistryContext): CodecResult {
  const result = validateNode(decisionRecordSchema, input, context)
  if (!result.ok) return result
  const value = input as DecisionRecord
  if (value.providerOutcome !== 'ok' && (value.returnedModelVersion !== null || value.answer !== null || value.selectedOption !== null || value.calibrationVersion !== null)) {
    return { ok: false, issues: [{ path: '$', code: 'invalid_value', message: 'Failure records cannot invent returned models, answers, selected options, or calibration.' }] }
  }
  return result
}
export const DECISION_CONTRACTS = Object.freeze({
  DecisionFeature: decisionFeatureSchema, DecisionState: decisionStateSchema,
  JevAnswer: jevAnswerSchema, DecisionRecord: decisionRecordSchema,
})
