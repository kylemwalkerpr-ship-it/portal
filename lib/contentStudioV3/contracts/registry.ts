import { COUNTRY_LIST } from '@/lib/countryList'
import { hashStructuredPayload } from './hashes'

export const METRIC_SCHEMA_VERSION = 'seo.metrics/2' as const
export const METRIC_DEFINITION_VERSION = 'seo.metric-definitions/2' as const

export type JsonSchemaType = 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object'
type ScalarDefinition =
  | { kind: 'string'; maxLength: number; validationContext?: 'safe_url' | 'estate_slug'; format?: 'hash' | 'instant'; nullable?: boolean; allowEmpty?: boolean }
  | { kind: 'number'; constraint: 'finite' | 'nonnegative' | 'count' | 'rate' | 'difficulty' }
  | { kind: 'boolean'; nullable?: boolean }
  | { kind: 'enum'; values: readonly string[] }
  | { kind: 'array'; items: ScalarDefinition | ObjectDefinition; uniqueBy?: 'value' | 'id'; maxItems: 100 }
type ObjectDefinition = { kind: 'object'; properties: Readonly<Record<string, ScalarDefinition>> }

const label = { kind: 'string', maxLength: 256 } as const
const text = { kind: 'string', maxLength: 4000 } as const
const count = { kind: 'number', constraint: 'count' } as const
const rate = { kind: 'number', constraint: 'rate' } as const
const nonnegative = { kind: 'number', constraint: 'nonnegative' } as const
const finite = { kind: 'number', constraint: 'finite' } as const
const hash = { kind: 'string', maxLength: 64, format: 'hash' } as const
const idArray = { kind: 'array', items: label, uniqueBy: 'value', maxItems: 100 } as const
const imageAlt = { kind: 'object', properties: { id: label, alt: { kind: 'string', maxLength: 256, allowEmpty: true }, decorative: { kind: 'boolean' }, missing: { kind: 'boolean' } } } as const
const imageFile = { kind: 'object', properties: { id: label, basename: label, digest: hash } } as const
const anchorText = { kind: 'object', properties: { id: label, text: label, accessibleName: label, target: { kind: 'string', maxLength: 256, validationContext: 'safe_url' }, location: label } } as const
const placementValue = { kind: 'enum', values: ['exact', 'variant', 'absent', 'not_applicable'] } as const
const placement = { kind: 'object', properties: { title: placementValue, H1: placementValue, intro: placementValue, meta: placementValue } } as const
const robots = { kind: 'object', properties: { raw: idArray, bot: label, index: { kind: 'boolean', nullable: true }, follow: { kind: 'boolean', nullable: true }, conflicts: idArray, crawlAllowed: { kind: 'boolean', nullable: true } } } as const
const urgency = { kind: 'object', properties: { kind: { kind: 'enum', values: ['none', 'factual_deadline', 'verified_scarcity', 'unsupported'] }, claimIds: idArray, evidenceIds: idArray, expiresAt: { kind: 'string', maxLength: 64, format: 'instant', nullable: true } } } as const

type MetricConstraint = 'currency' | 'conversion_numerator_lte_denominator'
function metric<const K extends string, const D extends ScalarDefinition>(key: K, definition: D, context: readonly ('query' | 'outcome')[] = [], constraints: readonly MetricConstraint[] = []) {
  return { key, ...definition, context, constraints } as const
}

/** Sole declarative authority for metric key, value kind, bounds and per-metric context. */
export const METRIC_DEFINITIONS = [
  metric('targetKeyword', label, ['query']),
  metric('searchVolume', nonnegative, ['query']),
  metric('keywordDifficulty', { kind: 'number', constraint: 'difficulty' }, ['query']),
  metric('searchIntentType', { kind: 'enum', values: ['informational', 'commercial_investigation', 'transactional', 'navigational', 'mixed', 'unknown'] }, ['query']),
  metric('keywordDensity', rate, ['query']),
  metric('costPerClick', nonnegative, ['query'], ['currency']),
  metric('primaryKeywordPlacement', placement, ['query']),
  metric('longTailKeyword', idArray, ['query']),
  metric('lsiKeyword', idArray, ['query']),
  metric('searchResultCount', count, ['query']),
  metric('wordCount', count),
  metric('headingCount', count),
  metric('readabilityScore', finite),
  metric('sentenceLengthAverage', nonnegative),
  metric('paragraphLengthMax', count),
  metric('passiveVoicePercentage', rate),
  metric('callToActionCount', count),
  metric('introHookLength', count),
  metric('altTextString', { kind: 'array', items: imageAlt, uniqueBy: 'id', maxItems: 100 }),
  metric('bulletPointCount', count),
  metric('titleTagLength', count),
  metric('metaDescriptionLength', count),
  metric('urlSlug', { kind: 'string', maxLength: 256, validationContext: 'estate_slug' }),
  metric('schemaMarkupType', idArray),
  metric('canonicalUrl', { kind: 'string', maxLength: 256, validationContext: 'safe_url' }),
  metric('internalLinkCount', count),
  metric('externalLinkCount', count),
  metric('imageFileNames', { kind: 'array', items: imageFile, uniqueBy: 'id', maxItems: 100 }),
  metric('anchorText', { kind: 'array', items: anchorText, uniqueBy: 'id', maxItems: 100 }),
  metric('robotsTagState', robots),
  metric('clickThroughRate', rate, ['query', 'outcome']),
  metric('bounceRate', rate, ['outcome']),
  metric('dwellTime', nonnegative),
  metric('scrollDepth', rate, ['outcome']),
  metric('conversionRate', rate, ['outcome'], ['conversion_numerator_lte_denominator']),
  metric('exitPageRate', rate, ['outcome']),
  metric('organicTrafficVolume', count),
  metric('socialShareCount', count),
  metric('timeOnPageAverage', nonnegative),
  metric('commentCount', count),
  metric('urgencyFactor', urgency),
  metric('powerWordCount', count),
  metric('readTimeMinutes', nonnegative),
  metric('fleschReadingEase', finite),
  metric('transitionWordDensity', nonnegative),
  metric('problemStatement', text),
  metric('solutionStatement', text),
  metric('benefitCount', count),
  metric('trustSignalCount', count),
  metric('headlineType', { kind: 'enum', values: ['how_to', 'listicle', 'question', 'explainer', 'comparison', 'service', 'other'] }),
] as const

export type MetricDefinition = (typeof METRIC_DEFINITIONS)[number]
export type MetricKey = MetricDefinition['key']
export const METRIC_KEYS = Object.freeze(METRIC_DEFINITIONS.map(({ key }) => key)) as readonly MetricKey[]
export type MetricDefinitionByKey = { [D in MetricDefinition as D['key']]: D }

type NonNullableValueForDefinition<D> = D extends { kind: 'string' } ? string
  : D extends { kind: 'number' } ? number
  : D extends { kind: 'boolean' } ? boolean
  : D extends { kind: 'enum'; values: readonly (infer V)[] } ? V
        : D extends { kind: 'array'; items: infer I } ? Array<ValueForDefinition<I>>
          : D extends { kind: 'object'; properties: infer P } ? { [K in keyof P]: ValueForDefinition<P[K]> }
            : never
export type ValueForDefinition<D> = D extends { nullable: true } ? NonNullableValueForDefinition<D> | null : NonNullableValueForDefinition<D>
export type MetricValues = { [D in MetricDefinition as D['key']]: ValueForDefinition<D> }

export type StudioActionKind = (typeof STUDIO_ACTION_KINDS)[number]
export const STUDIO_ACTION_KINDS = [
  'INGEST', 'PLAN', 'GSC_SYNC', 'GSC_SCORE', 'LLM_AUDIT', 'RESEARCH', 'BRIEF', 'GENERATE',
  'REAUDIT', 'SITE_HEALTH_AUDIT', 'SITE_HEALTH_REPAIR', 'VERIFY_URL', 'INTERLINK_SWEEP', 'PUBLISH',
] as const
export type StudioInterventionKind = (typeof STUDIO_INTERVENTION_KINDS)[number]
export const STUDIO_INTERVENTION_KINDS = [
  'RESEARCH', 'REFRESH', 'EXPAND_OWNER', 'CONSOLIDATE', 'REPAIR_TECHNICAL', 'RELINK_INTERNAL',
  'AUTHORITY_WORK', 'CTR_OPTIMIZE', 'CONVERSION_PATH_REPAIR', 'GEO_REMEDIATION', 'CREATE_SUPPORTING',
  'CREATE_PRIMARY', 'OBSERVE', 'NO_ACTION', 'ESCALATE',
] as const
export const REJECTED_LEGACY_INTERVENTION_ALIASES = ['LINK', 'REPAIR', 'CONVERSION', 'CREATE', 'CONSOLIDATE_RECOMMENDATION'] as const
function freezeDeep<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child)
    Object.freeze(value)
  }
  return value
}
freezeDeep(METRIC_DEFINITIONS)
freezeDeep(STUDIO_ACTION_KINDS)
freezeDeep(STUDIO_INTERVENTION_KINDS)
freezeDeep(REJECTED_LEGACY_INTERVENTION_ALIASES)
export type NamespaceAcceptance<T extends string> = { status: 'accepted'; value: T } | { status: 'rejected'; reason: 'legacy_alias' | 'unknown_value' }
export function acceptStudioActionKind(value: unknown): NamespaceAcceptance<StudioActionKind> {
  if (typeof value === 'string' && (REJECTED_LEGACY_INTERVENTION_ALIASES as readonly string[]).includes(value)) return { status: 'rejected', reason: 'legacy_alias' }
  return typeof value === 'string' && (STUDIO_ACTION_KINDS as readonly string[]).includes(value)
    ? { status: 'accepted', value: value as StudioActionKind }
    : { status: 'rejected', reason: 'unknown_value' }
}
export function acceptStudioInterventionKind(value: unknown): NamespaceAcceptance<StudioInterventionKind> {
  if (typeof value === 'string' && (REJECTED_LEGACY_INTERVENTION_ALIASES as readonly string[]).includes(value)) return { status: 'rejected', reason: 'legacy_alias' }
  return typeof value === 'string' && (STUDIO_INTERVENTION_KINDS as readonly string[]).includes(value)
    ? { status: 'accepted', value: value as StudioInterventionKind }
    : { status: 'rejected', reason: 'unknown_value' }
}

export const COUNTRY_LIST_DEFINITION = Object.freeze({
  source: 'lib/countryList.ts',
  definitionVersion: 'country-list/sha256:ce77965cce410a44b2459f6cab2d375c657948b5537903c85d59235857835b28',
  codes: Object.freeze([...new Set(COUNTRY_LIST.map(({ code }) => code))].sort()),
})

export const METRIC_DEFINITION_SET = Object.freeze({
  schemaVersion: METRIC_SCHEMA_VERSION,
  definitionVersion: METRIC_DEFINITION_VERSION,
  countryList: COUNTRY_LIST_DEFINITION,
  metrics: METRIC_DEFINITIONS,
})
export const DEFINITION_SET_HASH = hashStructuredPayload(METRIC_DEFINITION_SET)
export function computeDefinitionSetHash(): string { return DEFINITION_SET_HASH }

export function metricTypeFromDefinition(definition: MetricDefinition): JsonSchemaType {
  switch (definition.kind) {
    case 'array': return 'array'
    case 'object': return 'object'
    case 'number': return definition.constraint === 'count' ? 'integer' : 'number'
    case 'enum': return 'string'
    case 'string': return 'string'
  }
}

export const METRIC_CONTEXT_REQUIREMENTS = freezeDeep({
  queryKeys: METRIC_DEFINITIONS.filter((definition) => (definition.context as readonly string[]).includes('query')).map(({ key }) => key),
  outcomeKeys: METRIC_DEFINITIONS.filter((definition) => (definition.context as readonly string[]).includes('outcome')).map(({ key }) => key),
  urlKeys: METRIC_DEFINITIONS.filter((definition) => definition.kind === 'string' && (definition.validationContext === 'safe_url' || definition.validationContext === 'estate_slug')).map(({ key }) => key),
})
