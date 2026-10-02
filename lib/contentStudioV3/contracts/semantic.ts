import { array, bool, enm, nullable, number, object, str, union, type Infer, type CodecIssue } from './canonicalSchema'
import { validateNode, type CodecRegistryContext, type CodecResult } from './canonicalSchema'

const id = (registry?: string) => str(256, registry)
const text = str(2048)
const ids = (registry?: string) => array(id(registry), 100, 0, true)
const instant = nullable(str(64, undefined, 'date-time'))
const scalar = union(str(4096), number(), bool(), { kind: 'nullable', inner: union(str(4096), number(), bool()) } as const)

export const semanticIdentitySchema = object({
  schemaVersion: enm(['studio.semantic-identity/1'] as const),
  semanticId: id(), ontologyVersion: id(), resolverVersion: id(),
  jurisdiction: nullable(id('jurisdiction')), legalSystem: nullable(id('legalSystem')),
  entityIds: ids('entity'), programOrPathwayId: nullable(id('programOrPathway')),
  audienceId: nullable(id('audience')), readerJobId: nullable(id('readerJob')),
  journeyStage: enm(['understand', 'assess', 'prepare', 'act', 'apply', 'maintain', 'transition', 'settle', 'unknown'] as const),
  searchIntent: enm(['informational', 'commercial_investigation', 'transactional', 'navigational', 'mixed', 'unknown'] as const),
  language: id('language'), countryContext: nullable(id('country')),
  temporalContext: object({ effectiveAt: instant, validFrom: instant, validTo: instant }),
  serviceContextIds: ids('serviceContext'), evidenceIds: ids('evidence'),
  status: enm(['resolved', 'partial', 'ambiguous', 'conflicted', 'unknown', 'unavailable'] as const),
})
export type SemanticIdentity = Infer<typeof semanticIdentitySchema>
export function validateSemanticIdentity(input: unknown, context?: CodecRegistryContext): CodecResult {
  const result = validateNode(semanticIdentitySchema, input, context)
  if (!result.ok) return result
  const range = (input as SemanticIdentity).temporalContext
  if (range.validFrom && range.validTo && Date.parse(range.validFrom) > Date.parse(range.validTo)) {
    const issue: CodecIssue = { path: '$.temporalContext', code: 'invalid_value', message: 'validFrom must not be later than validTo.' }
    return { ok: false, issues: [issue] }
  }
  return result
}

export const semanticFactSchema = object({
  factId: id(), subjectEntityId: id('entity'), predicate: id('predicate'),
  objectEntityId: nullable(id('entity')), scalarValue: scalar, unit: nullable(id('unit')),
  qualifiers: object({
    jurisdiction: nullable(id('jurisdiction')), legalSystem: nullable(id('legalSystem')),
    audienceIds: ids('audience'), programOrPathwayId: nullable(id('programOrPathway')),
    validFrom: instant, validTo: instant, effectiveAt: instant,
  }),
  evidenceIds: ids('evidence'), contradictionEvidenceIds: ids('evidence'),
  supportState: enm(['supported', 'contradicted', 'partial', 'historical', 'unverified'] as const),
  sourceHealth: enm(['current', 'stale', 'conflicted', 'unavailable'] as const),
  sourceAuthorityClass: id('sourceAuthorityClass'),
  verification: enm(['observed', 'reviewed', 'derived', 'model_candidate'] as const),
  extractorVersion: nullable(id()), reviewerId: nullable(id('reviewer')),
  recordedAt: str(64, undefined, 'date-time'), supersedesFactId: nullable(id()),
  legalDatePrecision: enm(['instant', 'date', 'unknown'] as const), legalTimezone: nullable(id('timezone')),
  predicateVersion: id('predicateVersion'), supportFingerprint: str(64, undefined, 'sha256'),
  factHash: str(64, undefined, 'sha256'),
})
export type SemanticFact = Infer<typeof semanticFactSchema>
export function validateSemanticFact(input: unknown, context?: CodecRegistryContext): CodecResult {
  const result = validateNode(semanticFactSchema, input, context)
  if (!result.ok) return result
  const range = (input as SemanticFact).qualifiers
  if (range.validFrom && range.validTo && Date.parse(range.validFrom) > Date.parse(range.validTo)) {
    const issue: CodecIssue = { path: '$.qualifiers', code: 'invalid_value', message: 'validFrom must not be later than validTo.' }
    return { ok: false, issues: [issue] }
  }
  return result
}

export const semanticRelationSchema = object({
  relationId: id(), relationType: id('relationType'), subjectId: id('entity'), objectId: id('entity'),
  scope: object({ jurisdiction: nullable(id('jurisdiction')), language: nullable(id('language')), audienceId: nullable(id('audience')) }),
  evidenceIds: ids('evidence'),
  derivation: object({ method: id(), methodVersion: id(), modelVersion: nullable(id()) }),
  authorityClass: enm(['AUTHORITATIVE', 'OBSERVED', 'DERIVED_DETERMINISTIC', 'MODEL_INFERRED', 'REVIEWED_INFERENCE', 'CANDIDATE'] as const),
  confidence: nullable(number()), validFrom: instant, validTo: instant,
  status: enm(['active', 'superseded', 'invalidated', 'conflicted'] as const),
  invalidationReason: nullable(text),
})
export type SemanticRelation = Infer<typeof semanticRelationSchema>
export function validateSemanticRelation(input: unknown, context?: CodecRegistryContext): CodecResult {
  const result = validateNode(semanticRelationSchema, input, context)
  if (!result.ok) return result
  const range = input as SemanticRelation
  if (
    (range.relationType.startsWith('CANDIDATE_') || range.relationType.startsWith('SHOULD_')) &&
    range.authorityClass === 'AUTHORITATIVE'
  ) {
    const issue: CodecIssue = { path: '$.authorityClass', code: 'invalid_value', message: 'CANDIDATE_* and SHOULD_* relations cannot be authoritative.' }
    return { ok: false, issues: [issue] }
  }
  if (range.validFrom && range.validTo && Date.parse(range.validFrom) > Date.parse(range.validTo)) {
    const issue: CodecIssue = { path: '$', code: 'invalid_value', message: 'validFrom must not be later than validTo.' }
    return { ok: false, issues: [issue] }
  }
  return result
}

export const SEMANTIC_CONTRACTS = Object.freeze({
  SemanticIdentity: semanticIdentitySchema,
  SemanticFact: semanticFactSchema,
  SemanticRelation: semanticRelationSchema,
})
