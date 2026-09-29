/**
 * A2 source provenance contract. Pure normalization and evaluation only:
 * this module has no adapters, network access, persistence, or activation path.
 */

export const SOURCE_BINDING_SCHEMA = 'studio.source-binding/1' as const
export const SOURCE_OBSERVATION_SCHEMA = 'studio.source-observation/1' as const
export const SOURCE_PROVENANCE_ACTIVATION_ENABLED = false as const
// Invalidation rule IDs are contract vocabulary only. Behavioral invalidation is HOLD.

export type SourceHealth = 'healthy' | 'degraded' | 'unavailable' | 'failed' | 'unknown'
export type SourceCoverage = 'complete' | 'partial' | 'unknown'
export type ObservationState = 'available' | 'empty' | 'unavailable' | 'partial' | 'failed'

export interface SourceBindingV1 {
  schemaVersion: typeof SOURCE_BINDING_SCHEMA
  bindingId: string
  sourceId: string
  accountScope: string
  propertyScope: string | null
  adapterVersion: string
  sourceSchemaVersion: string
  secretReference: string | null
  rightsClass: string
  validityRuleId: string | null
  invalidationRuleIds: string[]
}

export interface ObservationInputV1 {
  schemaVersion: typeof SOURCE_OBSERVATION_SCHEMA
  observationId: string
  projectId: string
  binding: SourceBindingV1
  sourceRunId: string
  subjectKind: string
  subjectId: string
  metricKey: string
  scope: Record<string, string | null>
  window: { start: string | null; end: string | null }
  value: unknown | null
  state: ObservationState
  health: SourceHealth
  coverage: SourceCoverage
  coverageFraction: number | null
  retrievalMethod: string
  retrievalVersion: string
  retrievedAt: string
  effectiveWindow: { start: string | null; end: string | null }
  artifactLocator: string | null
  artifactDigest: string | null
  normalizationVersion: string
}

export interface NormalizedObservationV1 extends ObservationInputV1 {
  evidenceIdentity: string
  issues: string[]
}

export type SourceReadiness =
  | { outcome: 'READY'; evidenceIdentity: string }
  | { outcome: 'ABSTAIN'; reasonCodes: string[] }

const SHA256 = /^[a-f0-9]{64}$/
const INSTANT = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/

function validInstant(value: string | null): boolean {
  return value !== null && INSTANT.test(value) && Number.isFinite(Date.parse(value))
}

function normalizeScope(scope: Record<string, string | null>): Record<string, string | null> {
  return Object.fromEntries(Object.entries(scope).sort(([a], [b]) => a.localeCompare(b)))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function stableValue(value: unknown, seen = new Set<object>()): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value)
  if (Array.isArray(value)) {
    if (seen.has(value)) throw new Error('cyclic value')
    seen.add(value)
    const result = `[${value.map((item) => stableValue(item, seen)).join(',')}]`
    seen.delete(value)
    return result
  }
  if (isRecord(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) {
    if (seen.has(value)) throw new Error('cyclic value')
    seen.add(value)
    const result = `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableValue(value[key], seen)}`).join(',')}}`
    seen.delete(value)
    return result
  }
  throw new Error('value is not JSON-compatible')
}

/** Validate a binding without interpreting a secret reference or contacting its source. */
export function validateSourceBinding(input: SourceBindingV1): string[] {
  const issues: string[] = []
  if (!isRecord(input)) return ['BINDING_SHAPE_INVALID']
  if (input.schemaVersion !== SOURCE_BINDING_SCHEMA) issues.push('BINDING_SCHEMA_UNSUPPORTED')
  for (const [field, value] of Object.entries({
    bindingId: input.bindingId,
    sourceId: input.sourceId,
    accountScope: input.accountScope,
    adapterVersion: input.adapterVersion,
    sourceSchemaVersion: input.sourceSchemaVersion,
    rightsClass: input.rightsClass,
  })) if (typeof value !== 'string' || !TOKEN.test(value)) issues.push(`BINDING_${field.toUpperCase()}_INVALID`)
  if (input.propertyScope !== null && (typeof input.propertyScope !== 'string' || !TOKEN.test(input.propertyScope))) issues.push('BINDING_PROPERTY_SCOPE_INVALID')
  if (input.secretReference !== null && (typeof input.secretReference !== 'string' || !TOKEN.test(input.secretReference))) issues.push('BINDING_SECRET_REFERENCE_INVALID')
  if (input.validityRuleId !== null && (typeof input.validityRuleId !== 'string' || !TOKEN.test(input.validityRuleId))) issues.push('BINDING_VALIDITY_RULE_INVALID')
  if (!Array.isArray(input.invalidationRuleIds) || input.invalidationRuleIds.some((id) => typeof id !== 'string' || !TOKEN.test(id)) || new Set(input.invalidationRuleIds).size !== input.invalidationRuleIds.length) {
    issues.push('BINDING_INVALIDATION_RULES_INVALID')
  }
  return issues
}

/**
 * Normalize only deterministic scalar representations. The evidence identity is a
 * stable, versioned tuple encoding; raw values remain opaque and are never coerced.
 */
export function normalizeObservation(input: ObservationInputV1): NormalizedObservationV1 {
  const raw: Record<string, unknown> = isRecord(input) ? input : {}
  const rawBinding: Record<string, unknown> = isRecord(raw.binding) ? raw.binding : {}
  const safeScope: Record<string, unknown> = isRecord(raw.scope) ? raw.scope : {}
  const safeBinding = { ...rawBinding, invalidationRuleIds: Array.isArray(rawBinding.invalidationRuleIds) ? [...rawBinding.invalidationRuleIds] : rawBinding.invalidationRuleIds } as unknown as SourceBindingV1
  const normalized = {
    ...raw,
    binding: safeBinding,
    scope: safeScope,
    window: raw.window,
    effectiveWindow: raw.effectiveWindow,
  } as unknown as ObservationInputV1
  const issues = validateObservation(normalized)
  let scopeEncoding = 'invalid', windowEncoding = 'invalid', effectiveWindowEncoding = 'invalid', valueEncoding = 'invalid'
  try { scopeEncoding = JSON.stringify(normalizeScope(safeScope as Record<string, string | null>)) } catch { issues.push('SCOPE_SHAPE_INVALID') }
  try { windowEncoding = stableValue(raw.window) } catch { issues.push('WINDOW_SHAPE_INVALID') }
  try { effectiveWindowEncoding = stableValue(raw.effectiveWindow) } catch { issues.push('EFFECTIVE_WINDOW_SHAPE_INVALID') }
  try { valueEncoding = stableValue(raw.value) } catch { issues.push('VALUE_SHAPE_INVALID') }
  const identityParts = [
    'studio.evidence-identity/1', raw.projectId, raw.binding && rawBinding.sourceId,
    rawBinding.bindingId, rawBinding.accountScope, rawBinding.propertyScope,
    raw.sourceRunId, raw.subjectKind, raw.subjectId, raw.metricKey,
    scopeEncoding, windowEncoding, raw.state, raw.health, raw.coverage, raw.coverageFraction,
    valueEncoding, raw.retrievalMethod, raw.retrievalVersion, raw.retrievedAt,
    effectiveWindowEncoding, raw.artifactLocator, raw.artifactDigest, raw.normalizationVersion,
  ]
  // A tuple encoding is intentionally not presented as a content digest. Storage A1
  // must bind it to the registered canonical SHA-256 hash domain before persistence.
  const evidenceIdentity = JSON.stringify(identityParts)
  return { ...normalized, evidenceIdentity, issues: [...new Set(issues)] }
}

export function validateObservation(input: ObservationInputV1): string[] {
  if (!isRecord(input)) return ['OBSERVATION_SHAPE_INVALID']
  const issues = validateSourceBinding(input.binding)
  if (input.schemaVersion !== SOURCE_OBSERVATION_SCHEMA) issues.push('OBSERVATION_SCHEMA_UNSUPPORTED')
  for (const [field, value] of Object.entries({
    observationId: input.observationId, projectId: input.projectId, sourceRunId: input.sourceRunId,
    subjectKind: input.subjectKind, subjectId: input.subjectId, metricKey: input.metricKey,
    retrievalMethod: input.retrievalMethod, retrievalVersion: input.retrievalVersion,
    normalizationVersion: input.normalizationVersion,
  })) if (typeof value !== 'string' || !TOKEN.test(value)) issues.push(`${field.toUpperCase()}_INVALID`)
  if (!validInstant(input.retrievedAt)) issues.push('RETRIEVED_AT_INVALID')
  for (const [name, interval] of [['window', input.window], ['effectiveWindow', input.effectiveWindow]] as const) {
    if (!isRecord(interval) || !('start' in interval) || !('end' in interval) || (interval.start !== null && typeof interval.start !== 'string') || (interval.end !== null && typeof interval.end !== 'string')) {
      issues.push(`${name === 'window' ? 'WINDOW' : 'EFFECTIVE_WINDOW'}_SHAPE_INVALID`)
      continue
    }
    if (interval.start !== null && !validInstant(interval.start)) issues.push('WINDOW_START_INVALID')
    if (interval.end !== null && !validInstant(interval.end)) issues.push('WINDOW_END_INVALID')
    if (interval.start !== null && interval.end !== null && Date.parse(interval.start) > Date.parse(interval.end)) issues.push('WINDOW_ORDER_INVALID')
  }
  if (!isRecord(input.scope) || Object.values(input.scope).some((v) => v !== null && typeof v !== 'string')) issues.push('SCOPE_SHAPE_INVALID')
  if (typeof input.health !== 'string' || !['healthy', 'degraded', 'unavailable', 'failed', 'unknown'].includes(input.health)) issues.push('HEALTH_INVALID')
  if (typeof input.coverage !== 'string' || !['complete', 'partial', 'unknown'].includes(input.coverage)) issues.push('COVERAGE_INVALID')
  if (typeof input.state !== 'string' || !['available', 'empty', 'unavailable', 'partial', 'failed'].includes(input.state)) issues.push('STATE_INVALID')
  if (input.value !== null) { try { stableValue(input.value) } catch { issues.push('VALUE_SHAPE_INVALID') } }
  if (input.coverageFraction !== null && (!Number.isFinite(input.coverageFraction) || input.coverageFraction < 0 || input.coverageFraction > 1)) issues.push('COVERAGE_FRACTION_INVALID')
  if (input.artifactDigest !== null && !SHA256.test(input.artifactDigest)) issues.push('ARTIFACT_DIGEST_INVALID')
  if (input.artifactLocator !== null && !TOKEN.test(input.artifactLocator)) issues.push('ARTIFACT_LOCATOR_INVALID')
  if ((input.state === 'available' || input.state === 'empty') && (input.health !== 'healthy' || input.coverage !== 'complete')) issues.push('POSITIVE_STATE_REQUIRES_HEALTHY_COMPLETE_COVERAGE')
  if (input.state === 'available' && input.value === null) issues.push('AVAILABLE_VALUE_REQUIRED')
  if (input.state !== 'available' && input.value !== null) issues.push('NON_AVAILABLE_VALUE_MUST_BE_NULL')
  if (input.state === 'empty' && input.coverage !== 'complete') issues.push('EMPTY_REQUIRES_COMPLETE_COVERAGE')
  if (input.state === 'empty' && input.artifactLocator === null && input.artifactDigest === null) issues.push('EMPTY_ARTIFACT_REQUIRED')
  if (input.state === 'partial' && input.coverage !== 'partial') issues.push('PARTIAL_STATE_REQUIRES_PARTIAL_COVERAGE')
  if ((input.state === 'unavailable' || input.state === 'failed') && input.health === 'healthy') issues.push('FAILED_OR_UNAVAILABLE_CANNOT_BE_HEALTHY')
  return [...new Set(issues)]
}

/** Missing/invalid/ambiguous required evidence denies readiness; it never yields NO_ACTION. */
export function evaluateRequiredSource(observation: NormalizedObservationV1 | null): SourceReadiness {
  if (!observation) return { outcome: 'ABSTAIN', reasonCodes: ['REQUIRED_SOURCE_MISSING'] }
  if (!isRecord(observation) || !Array.isArray(observation.issues) || typeof observation.evidenceIdentity !== 'string') return { outcome: 'ABSTAIN', reasonCodes: ['REQUIRED_SOURCE_SHAPE_INVALID'] }
  if (typeof observation.state !== 'string' || !['available', 'empty', 'unavailable', 'partial', 'failed'].includes(observation.state) || typeof observation.health !== 'string' || !['healthy', 'degraded', 'unavailable', 'failed', 'unknown'].includes(observation.health) || typeof observation.coverage !== 'string' || !['complete', 'partial', 'unknown'].includes(observation.coverage)) return { outcome: 'ABSTAIN', reasonCodes: ['REQUIRED_SOURCE_ENUM_INVALID'] }
  if (!observation.evidenceIdentity || validateObservation(observation).length) return { outcome: 'ABSTAIN', reasonCodes: ['REQUIRED_SOURCE_SHAPE_INVALID'] }
  if (observation.issues.length) return { outcome: 'ABSTAIN', reasonCodes: [...observation.issues] }
  const canonicalIdentity = normalizeObservation(observation).evidenceIdentity
  if (observation.evidenceIdentity !== canonicalIdentity) return { outcome: 'ABSTAIN', reasonCodes: ['REQUIRED_SOURCE_IDENTITY_MISMATCH'] }
  if (observation.state === 'unavailable' || observation.state === 'failed') return { outcome: 'ABSTAIN', reasonCodes: ['REQUIRED_SOURCE_NOT_AVAILABLE'] }
  if (observation.state === 'partial' || observation.coverage !== 'complete') return { outcome: 'ABSTAIN', reasonCodes: ['REQUIRED_SOURCE_COVERAGE_INCOMPLETE'] }
  if (observation.health !== 'healthy') return { outcome: 'ABSTAIN', reasonCodes: ['REQUIRED_SOURCE_UNHEALTHY'] }
  return { outcome: 'READY', evidenceIdentity: canonicalIdentity }
}
