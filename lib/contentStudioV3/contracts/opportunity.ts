import { array, enm, nullable, number, object, str, type Infer } from './canonicalSchema'
import { validateNode, type CodecRegistryContext, type CodecIssue, type CodecResult } from './canonicalSchema'
import { STUDIO_INTERVENTION_KINDS } from './registry'

const id = (registry?: string) => str(256, registry)
const ids = (registry?: string) => array(id(registry), 100, 0, true)
const nullableId = (registry?: string) => nullable(id(registry))
const instant = str(64, undefined, 'date-time')

export const predictedMetricSchema = object({
  metric: id(), direction: enm(['up', 'down', 'stable'] as const), horizon: id(),
})
export type PredictedMetric = Infer<typeof predictedMetricSchema>

export const semanticOpportunitySchema = object({
  opportunityId: id(), version: number({ integer: true, min: 1 }),
  semanticIdentityId: id('semanticIdentity'), queryFamilyIds: ids('queryFamily'),
  readerJobId: nullableId('readerJob'), ownerRouteId: nullableId('ownerRoute'),
  clusterId: nullableId('cluster'), jurisdiction: nullableId('jurisdiction'),
  metricSnapshotId: nullableId('metricSnapshot'), evidenceIds: ids('evidence'),
  problemType: id('problemType'), semanticGapIds: ids('semanticGap'),
  competitorGapIds: ids('competitorGap'), informationGainAssessmentId: nullableId('informationGainAssessment'),
  collisionBundleId: nullableId('collisionBundle'),
  cannibalizationRiskState: enm(['none', 'candidate', 'confirmed', 'unknown'] as const),
  authorityGapState: id('authorityGapState'), commercialPathState: id('commercialPathState'),
  eligibleActions: array(enm(STUDIO_INTERVENTION_KINDS, 'policyEligibleAction'), 100, 0, true),
  blockedActions: array(object({
    action: enm(STUDIO_INTERVENTION_KINDS, 'policyAction'), reasonCodes: ids('policyReason'),
  }), 100),
  policyVersion: id('policyVersion'), featureSetId: nullableId('featureSet'),
  decisionRecordId: nullableId('decisionRecord'),
  recommendedAction: nullable(enm(STUDIO_INTERVENTION_KINDS, 'policyAction')),
  recommendationState: enm(['pending', 'advisory', 'accepted', 'dismissed', 'abstained'] as const),
  predictedOutcome: array(predictedMetricSchema, 100),
  interventionCostClass: enm([
    'S0_DETERMINISTIC_CPU', 'S1_EMBEDDING', 'S2_RERANKER', 'S3_SMALL_MODEL',
    'S4_LARGER_LOCAL', 'S5_FRONTIER_OR_HUMAN',
  ] as const),
  expectedOutcomeContractId: nullableId('expectedOutcomeContract'),
  observationPlanId: id('observationPlan'),
  status: enm(['detected', 'investigating', 'eligible', 'blocked', 'executing', 'observing', 'mature', 'dismissed'] as const),
  createdAt: instant, supersededBy: nullableId('opportunity'),
})
export type SemanticOpportunity = Infer<typeof semanticOpportunitySchema>
export function validateSemanticOpportunity(input: unknown, context?: CodecRegistryContext): CodecResult {
  return validateNode(semanticOpportunitySchema, input, context)
}

export const informationGainAssessmentSchema = object({
  assessmentId: id(), ownerRouteId: nullableId('ownerRoute'), ownerVersion: nullableId(),
  proposedAnswerUnits: ids('answerUnit'), alreadySatisfiedUnits: ids('answerUnit'),
  genuinelyNewUnits: ids('answerUnit'), unsupportedUnits: ids('answerUnit'),
  proposedRevisionHash: str(64, undefined, 'sha256'), identityVersion: id(),
  coverageSnapshotHash: str(64, undefined, 'sha256'),
  comparedOwnerRevisions: array(object({ routeId: id('ownerRoute'), revisionHash: str(64, undefined, 'sha256') }), 100),
  comparisonCompleteness: enm(['complete', 'partial', 'unknown'] as const),
  uniqueReaderJob: enm(['yes', 'no', 'unknown'] as const),
  estimatedGainState: enm(['high', 'medium', 'low', 'none', 'unknown'] as const),
  evidenceIds: ids('evidence'), analyzerVersion: id(),
})
export type InformationGainAssessment = Infer<typeof informationGainAssessmentSchema>
export function validateInformationGainAssessment(input: unknown, context?: CodecRegistryContext): CodecResult {
  return validateNode(informationGainAssessmentSchema, input, context)
}

export const interventionRecordSchema = object({
  interventionId: id(), opportunityId: id('opportunity'),
  action: enm(STUDIO_INTERVENTION_KINDS),
  ownerRouteId: nullableId('ownerRoute'), preStateSnapshotId: id('stateSnapshot'),
  postReleaseId: nullableId('release'), changedDimensions: ids('changedDimension'),
  concurrentKnownChanges: ids('knownChange'), expectedOutcomeIds: ids('expectedOutcome'),
  observationPlanId: id('observationPlan'),
  prediction: object({
    predictedMetrics: array(predictedMetricSchema, 100), targetQueryFamilies: ids('queryFamily'),
    expectedReaderBenefit: str(4096), confoundersKnown: ids('confounder'),
    predictionAuthor: enm(['rule', 'jev', 'model', 'human'] as const), createdAt: instant,
  }),
  plannedAt: instant, executedAt: nullable(instant),
})
export type InterventionRecord = Infer<typeof interventionRecordSchema>
export function validateInterventionRecord(input: unknown, context?: CodecRegistryContext): CodecResult {
  const result = validateNode(interventionRecordSchema, input, context)
  if (!result.ok) return result
  const value = input as InterventionRecord
  if (value.executedAt && Date.parse(value.executedAt) < Date.parse(value.plannedAt)) {
    const issue: CodecIssue = { path: '$.executedAt', code: 'invalid_value', message: 'Execution cannot precede planning.' }
    return { ok: false, issues: [issue] }
  }
  return result
}

export const OPPORTUNITY_CONTRACTS = Object.freeze({
  SemanticOpportunity: semanticOpportunitySchema,
  InformationGainAssessment: informationGainAssessmentSchema,
  InterventionRecord: interventionRecordSchema,
})
