import { hashStructuredPayload } from './hashes'
import { toJsonSchema, validateNode, type CodecIssue, type CodecRegistryContext, type CodecResult, type Node } from './canonicalSchema'
import { SEMANTIC_CONTRACTS, validateSemanticFact, validateSemanticIdentity, validateSemanticRelation } from './semantic'
import { OPPORTUNITY_CONTRACTS, validateInformationGainAssessment, validateInterventionRecord, validateSemanticOpportunity } from './opportunity'
import { DECISION_CONTRACTS, validateDecisionRecord, validateDecisionState } from './decision'

export const NORMATIVE_CODEC_REGISTRY_VERSION = 'studio.normative-codecs/1' as const
export const NORMATIVE_CONTRACT_SCHEMAS = Object.freeze({
  ...SEMANTIC_CONTRACTS,
  ...OPPORTUNITY_CONTRACTS,
  ...DECISION_CONTRACTS,
})
export type NormativeContractName = keyof typeof NORMATIVE_CONTRACT_SCHEMAS

/** Family descriptors are defined once; this registry only composes and names them. */
export function getNormativeJsonSchema(name: NormativeContractName): Record<string, unknown> {
  const schema = NORMATIVE_CONTRACT_SCHEMAS[name] as Node
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: `studio.normative-codecs/1/${name}`,
    ...toJsonSchema(schema),
  }
}

/** Structural codec acceptance never proves authority, freshness, ownership, review or permission. */
export function validateNormativeContract(
  name: NormativeContractName,
  input: unknown,
  context?: CodecRegistryContext,
): CodecResult {
  switch (name) {
    case 'SemanticIdentity': return validateSemanticIdentity(input, context)
    case 'SemanticFact': return validateSemanticFact(input, context)
    case 'SemanticRelation': return validateSemanticRelation(input, context)
    case 'SemanticOpportunity': return validateSemanticOpportunity(input, context)
    case 'InformationGainAssessment': return validateInformationGainAssessment(input, context)
    case 'InterventionRecord': return validateInterventionRecord(input, context)
    case 'DecisionState': return validateDecisionState(input, context)
    case 'DecisionRecord': return validateDecisionRecord(input, context)
    case 'DecisionFeature': return validateNode(NORMATIVE_CONTRACT_SCHEMAS[name], input, context)
    case 'JevAnswer': return validateNode(NORMATIVE_CONTRACT_SCHEMAS[name], input, context)
    default: {
      const issue: CodecIssue = { path: '$.schemaVersion', code: 'invalid_value', message: 'Contract is not present in the normative registry.' }
      return { ok: false, issues: [issue] }
    }
  }
}

/** Delegates to the frozen metric kernel's strict JSON guard and V2 stable serializer. */
export function hashNormativeStructuredPayload(payload: unknown): string {
  return hashStructuredPayload(payload)
}

export { type CodecIssue, type CodecRegistryContext, type CodecResult, type JsonSchemaType } from './canonicalSchema'
export { type SemanticIdentity, type SemanticFact, type SemanticRelation } from './semantic'
export { type SemanticOpportunity, type InformationGainAssessment, type InterventionRecord, type PredictedMetric } from './opportunity'
export { type DecisionFeature, type DecisionState, type DecisionRecord, type JevAnswer } from './decision'
