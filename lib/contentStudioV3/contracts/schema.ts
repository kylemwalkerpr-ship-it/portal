import { COUNTRY_LIST } from '@/lib/countryList'
import {
  ESTATE_OWNERSHIP_SCHEMA_VERSION,
  ESTATE_ROUTE_NORMALIZATION_VERSION,
  normalizeRouteV1,
  type EstateRoutePolicyV1,
} from '@/lib/estateOwnership'
import {
  computeDefinitionSetHash,
  METRIC_DEFINITIONS,
  METRIC_KEYS,
  METRIC_SCHEMA_VERSION,
  type MetricDefinition,
  type MetricKey,
  type MetricValues,
} from './registry'

export type Hash = string
export type MetricSubjectKind = 'query' | 'page' | 'revision' | 'cluster' | 'cohort'
export type MetricSourceKind = 'gsc' | 'google_ads' | 'ahrefs' | 'ga4' | 'event_ledger' | 'cms' | 'artifact_analyzer' | 'editor' | 'jev' | 'social_api' | 'serp_provider' | 'ubersuggest_export' | 'dataforseo' | 'bing_webmaster' | 'tinyfish' | 'github' | 'cloudflare' | 'marketplace_catalog' | 'indexnow_receipt'
export type MetricStatus = 'available' | 'stale' | 'unavailable' | 'not_applicable' | 'pending' | 'failed'

export interface Provenance {
  observationId: string
  definitionVersion: string
  sourceRunId: string
  projectId: string
  subject: { kind: MetricSubjectKind; id: string }
  artifactHash: Hash | null
  scope: {
    canonicalUrl: string | null
    query: string | null
    country: string | null
    language: string
    device: string | null
    channel: string | null
    searchType: string | null
    propertyId: string | null
    cohortId: string | null
    currency: string | null
    timezone: string
  }
  window: { start: string | null; end: string | null }
  sourceKind: MetricSourceKind
  method: string
  methodVersion: string
  modelVersion: string | null
  evidenceIds: string[]
  inputHashes: Hash[]
  observedAt: string
  ingestedAt: string
  validUntil: string | null
  quality: 'observed' | 'derived' | 'estimated' | 'editorial' | 'model_judgment'
  completeness: 'complete' | 'partial' | 'unknown'
  numerator: number | null
  denominator: number | null
  sampleSize: number | null
  coverage: number | null
  confidence: number | null
  unit: string
  warnings: string[]
  collectionRef: { collectionId: string; totalCount: number | null; completeness: 'complete' | 'partial' | 'unknown'; artifactHash: Hash } | null
}
export type Present<T> = Provenance & { status: 'available' | 'stale'; value: T; reason: string | null }
export type Absent = Provenance & { status: 'unavailable' | 'not_applicable' | 'pending' | 'failed'; value: null; reason: string }
export type MetricObservation<K extends MetricKey> = Present<MetricValues[K]> | Absent
export type SeoMetricSnapshot = {
  schemaVersion: typeof METRIC_SCHEMA_VERSION
  definitionSetHash: Hash
  observations: { [K in MetricKey]: MetricObservation<K> }
}

export type ContextAcceptance = { status: 'accepted' } | { status: 'rejected'; reason: string }
export type CurrencyAcceptance = { status: 'accepted'; code: string } | { status: 'rejected'; reason: string }
export interface CurrencyRegistryContext {
  schemaVersion: 'studio.currency-registry-context/1'
  definitionVersion: string
  accept(code: string): CurrencyAcceptance
}
export interface SafeUrlPolicyContext {
  schemaVersion: 'studio.safe-url-context/1'
  definitionVersion: string
  routePolicy: EstateRoutePolicyV1
}
export interface SeoMetricValidationContext {
  currencyRegistry: CurrencyRegistryContext | null
  safeUrlPolicy: SafeUrlPolicyContext | null
}
export type ValidationIssueCode = 'invalid_snapshot' | 'unsupported_schema_version' | 'definition_hash_mismatch' | 'missing_field' | 'extra_property' | 'invalid_type' | 'invalid_value' | 'invalid_hash' | 'invalid_instant' | 'duplicate_value' | 'context_unavailable' | 'invalid_context' | 'invalid_status' | 'invalid_provenance' | 'invalid_relationship'
export interface ValidationIssue { path: string; code: ValidationIssueCode; message: string }
export type SnapshotValidationResult = { ok: true; snapshot: SeoMetricSnapshot; issues: [] } | { ok: false; snapshot: null; issues: ValidationIssue[] }

const HASH_PATTERN = /^[0-9a-f]{64}$/
const instantPattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-](\d{2}):(\d{2}))$/
const COUNTRY_CODES: ReadonlySet<string> = new Set(COUNTRY_LIST.map(({ code }) => code))
const sources = ['gsc', 'google_ads', 'ahrefs', 'ga4', 'event_ledger', 'cms', 'artifact_analyzer', 'editor', 'jev', 'social_api', 'serp_provider', 'ubersuggest_export', 'dataforseo', 'bing_webmaster', 'tinyfish', 'github', 'cloudflare', 'marketplace_catalog', 'indexnow_receipt']
const subjectKinds = ['query', 'page', 'revision', 'cluster', 'cohort']
const statuses = ['available', 'stale', 'unavailable', 'not_applicable', 'pending', 'failed']
const presentStatuses = ['available', 'stale']
const absentStatuses = ['unavailable', 'not_applicable', 'pending', 'failed']
const qualities = ['observed', 'derived', 'estimated', 'editorial', 'model_judgment']
const completenessValues = ['complete', 'partial', 'unknown']

const schema = (type: string, extra: Record<string, unknown> = {}) => ({ type, ...extra })
const closedObject = (properties: Record<string, unknown>) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false })
const nullable = (value: Record<string, unknown>) => ({ anyOf: [value, { type: 'null' }] })
const stringSchema = (maxLength = 256, extra: Record<string, unknown> = {}) => schema('string', { minLength: 1, maxLength, ...extra })
const hashSchema = schema('string', { pattern: '^[0-9a-f]{64}$' })
const instantSchema = schema('string', { format: 'date-time', pattern: instantPattern.source })

function definitionSchema(definition: any): Record<string, unknown> {
  const base = baseDefinitionSchema(definition)
  return definition.nullable ? nullable(base) : base
}
function baseDefinitionSchema(definition: any): Record<string, unknown> {
  switch (definition.kind) {
    case 'string': return stringSchema(definition.maxLength, definition.format === 'hash' ? { pattern: '^[0-9a-f]{64}$' } : definition.format === 'instant' ? { format: 'date-time', pattern: instantPattern.source } : definition.validationContext === 'safe_url' ? { format: 'uri', 'x-validation-context': 'studio.safe-url-context/1' } : definition.validationContext === 'estate_slug' ? { 'x-validation-context': 'studio.safe-url-context/1' } : definition.allowEmpty ? { minLength: 0 } : {})
    case 'enum': return schema('string', { enum: definition.values })
    case 'number':
      return schema(definition.constraint === 'count' ? 'integer' : 'number', {
        ...(definition.constraint !== 'finite' ? { minimum: 0 } : {}),
        ...(definition.constraint === 'rate' || definition.constraint === 'difficulty' ? { maximum: 100 } : {}),
      })
    case 'boolean': return schema('boolean')
    case 'array': return schema('array', { items: valueSchema(definition.items), maxItems: 100, ...(definition.uniqueBy === 'value' ? { uniqueItems: true } : { 'x-unique-by': definition.uniqueBy }) })
    case 'object': return objectDefinitionSchema(definition)
  }
}
function valueSchema(definition: any): Record<string, unknown> {
  return definition.kind === 'object' ? objectDefinitionSchema(definition) : definitionSchema(definition)
}
function objectDefinitionSchema(definition: any): Record<string, unknown> {
  const properties: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(definition.properties)) properties[key] = valueSchema(child)
  return closedObject(properties)
}

const provenanceSchema = closedObject({
  observationId: stringSchema(), definitionVersion: stringSchema(), sourceRunId: stringSchema(), projectId: stringSchema(),
  subject: closedObject({ kind: schema('string', { enum: subjectKinds }), id: stringSchema() }),
  artifactHash: nullable(hashSchema),
  scope: closedObject({
    canonicalUrl: nullable(stringSchema(256, { format: 'uri', 'x-validation-context': 'studio.safe-url-context/1' })),
    query: nullable(stringSchema()), country: nullable(schema('string', { pattern: '^[A-Z]{2}$', 'x-registry': 'lib/countryList.ts' })), language: stringSchema(),
    device: nullable(stringSchema()), channel: nullable(stringSchema()), searchType: nullable(stringSchema()), propertyId: nullable(stringSchema()),
    cohortId: nullable(stringSchema()), currency: nullable(schema('string', { pattern: '^[A-Z]{3}$', 'x-validation-context': 'studio.currency-registry-context/1' })), timezone: stringSchema(),
  }),
  window: closedObject({ start: nullable(instantSchema), end: nullable(instantSchema) }),
  sourceKind: schema('string', { enum: sources }), method: stringSchema(), methodVersion: stringSchema(), modelVersion: nullable(stringSchema()),
  evidenceIds: schema('array', { items: stringSchema(), maxItems: 100, uniqueItems: true }), inputHashes: schema('array', { items: hashSchema, maxItems: 100, uniqueItems: true }),
  observedAt: instantSchema, ingestedAt: instantSchema, validUntil: nullable(instantSchema),
  quality: schema('string', { enum: qualities }), completeness: schema('string', { enum: completenessValues }),
  numerator: nullable(schema('number')), denominator: nullable(schema('number')), sampleSize: nullable(schema('integer', { minimum: 0 })),
  coverage: nullable(schema('number', { minimum: 0, maximum: 1 })), confidence: nullable(schema('number', { minimum: 0, maximum: 1 })),
  unit: stringSchema(), warnings: schema('array', { items: stringSchema(), maxItems: 100, uniqueItems: true }),
  collectionRef: nullable(closedObject({ collectionId: stringSchema(), totalCount: nullable(schema('integer', { minimum: 0 })), completeness: schema('string', { enum: completenessValues }), artifactHash: hashSchema })),
})

function observationSchema(definition: MetricDefinition): Record<string, unknown> {
  const provenance = (provenanceSchema as any).properties as Record<string, unknown>
  const base = (status: string[], value: Record<string, unknown>, reason: Record<string, unknown>) => closedObject({
    ...provenance, status: schema('string', { enum: status }), value, reason,
  })
  return { oneOf: [
    base(presentStatuses, definitionSchema(definition), nullable(stringSchema())),
    base(absentStatuses, { type: 'null' }, stringSchema()),
  ] }
}

/** Strict JSON Schema generated directly from the versioned registry. */
export function createSeoMetricSchema(): Record<string, unknown> {
  const observations: Record<string, unknown> = {}
  for (const definition of METRIC_DEFINITIONS) observations[definition.key] = observationSchema(definition)
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'studio.seo-metric-snapshot/2', title: 'SEO metric snapshot v2', type: 'object',
    properties: {
      schemaVersion: { const: METRIC_SCHEMA_VERSION }, definitionSetHash: hashSchema,
      observations: { type: 'object', properties: observations, required: [...METRIC_KEYS], additionalProperties: false },
    }, required: ['schemaVersion', 'definitionSetHash', 'observations'], additionalProperties: false,
    'x-definition-set-hash': computeDefinitionSetHash(),
    'x-country-definition': { source: 'lib/countryList.ts', definitionVersion: 'country-list/sha256:ce77965cce410a44b2459f6cab2d375c657948b5537903c85d59235857835b28' },
    'x-context-dependencies': ['studio.currency-registry-context/1', 'studio.safe-url-context/1', 'lib/countryList.ts'],
  }
}

function isRecord(value: unknown): value is Record<string, any> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  try {
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) return false
    return Reflect.ownKeys(value).every((key) => {
      if (typeof key !== 'string') return false
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      return !!descriptor && 'value' in descriptor && descriptor.enumerable
    })
  } catch { return false }
}
function issue(issues: ValidationIssue[], path: string, code: ValidationIssueCode, message: string): void { issues.push({ path, code, message }) }
function exactKeys(value: Record<string, unknown>, keys: readonly string[], path: string, issues: ValidationIssue[]): void {
  for (const key of keys) if (!Object.prototype.hasOwnProperty.call(value, key)) issue(issues, `${path}.${key}`, 'missing_field', `Required property ${key} is missing.`)
  for (const key of Object.keys(value)) if (!keys.includes(key)) issue(issues, `${path}.${key}`, 'extra_property', `Unexpected property ${key}.`)
}
function nonempty(value: unknown, max = 256): value is string { return typeof value === 'string' && value.trim().length > 0 && value.length <= max }
function isInstant(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const match = instantPattern.exec(value)
  if (!match) return false
  const [, ys, mos, ds, hs, mis, ss, zone, offHs, offMs] = match
  const year = Number(ys), month = Number(mos), day = Number(ds), hour = Number(hs), minute = Number(mis), second = Number(ss)
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return false
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const daysInMonth = month === 2 ? (leapYear ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31
  if (day < 1 || day > daysInMonth) return false
  if (zone !== 'Z' && (Number(offHs) > 23 || Number(offMs) > 59)) return false
  return Number.isFinite(Date.parse(value))
}
function checkInstant(value: unknown, path: string, issues: ValidationIssue[], nullableValue = false): void {
  if (nullableValue && value === null) return
  if (!isInstant(value)) issue(issues, path, 'invalid_instant', 'Expected a real RFC3339 instant with a valid calendar date and offset.')
}
function checkHash(value: unknown, path: string, issues: ValidationIssue[], nullableValue = false): void {
  if (nullableValue && value === null) return
  if (typeof value !== 'string' || !HASH_PATTERN.test(value)) issue(issues, path, 'invalid_hash', 'Expected lowercase 64-character SHA-256 hex.')
}
function hasStandardArrayPrototype(value: unknown[]): boolean {
  return Object.getPrototypeOf(value) === Array.prototype
}

function isDenseBoundedArray(value: unknown, maxItems: number): value is unknown[] {
  if (!Array.isArray(value) || value.length > maxItems) return false
  try {
    if (!hasStandardArrayPrototype(value)) return false
    const keys = Reflect.ownKeys(value)
    if (keys.length !== value.length + 1 || !keys.includes('length')) return false
    for (const key of keys) {
      if (key === 'length') continue
      if (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key)) return false
      const index = Number(key)
      if (!Number.isInteger(index) || index < 0 || index >= value.length || String(index) !== key) return false
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) return false
    }
    return true
  } catch { return false }
}

function checkUnique(values: unknown[], path: string, issues: ValidationIssue[]): void {
  const seen = new Set<string>()
  values.forEach((value, index) => {
    if (typeof value === 'string') {
      if (seen.has(value)) issue(issues, `${path}[${index}]`, 'duplicate_value', 'String arrays must not contain duplicates.')
      seen.add(value)
    }
  })
}

function valueMatches(definition: any, value: unknown, path: string, issues: ValidationIssue[]): void {
  if (value === null && definition.nullable) return
  if (definition.kind === 'string') {
    if (typeof value !== 'string' || value.length > definition.maxLength || (!definition.allowEmpty && !value.trim())) issue(issues, path, 'invalid_type', `Expected a nonempty string of at most ${definition.maxLength} characters.`)
    if (definition.format === 'hash') checkHash(value, path, issues)
    if (definition.format === 'instant') checkInstant(value, path, issues)
    return
  }
  if (definition.kind === 'enum') {
    if (typeof value !== 'string' || !(definition.values as readonly unknown[]).includes(value)) issue(issues, path, 'invalid_value', 'Value is outside the registered enumeration.')
    return
  }
  if (definition.kind === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) { issue(issues, path, 'invalid_type', 'Expected a finite JSON number.'); return }
    if (definition.constraint === 'count' && (!Number.isInteger(value) || value < 0)) issue(issues, path, 'invalid_value', 'Expected an integer greater than or equal to zero.')
    if (definition.constraint === 'nonnegative' && value < 0) issue(issues, path, 'invalid_value', 'Expected a number greater than or equal to zero.')
    if ((definition.constraint === 'rate' || definition.constraint === 'difficulty') && (value < 0 || value > 100)) issue(issues, path, 'invalid_value', 'Expected a number from zero through one hundred.')
    return
  }
  if (definition.kind === 'array') {
    if (!Array.isArray(value)) { issue(issues, path, 'invalid_type', 'Expected an array.'); return }
    if (!isDenseBoundedArray(value, 100)) { issue(issues, path, 'invalid_value', 'Expected a dense JSON array with at most 100 entries and no extra properties.'); return }
    if (definition.uniqueBy === 'value') checkUnique(value, path, issues)
    const ids = new Set<string>()
    value.forEach((item, index) => {
      const itemPath = `${path}[${index}]`
      if (definition.uniqueBy === 'id' && isRecord(item)) {
        if (typeof item.id === 'string' && ids.has(item.id)) issue(issues, `${itemPath}.id`, 'duplicate_value', 'Array record IDs must be unique.')
        if (typeof item.id === 'string') ids.add(item.id)
      }
      valueMatches(definition.items, item, itemPath, issues)
    })
    return
  }
  if (definition.kind === 'object') {
    if (!isRecord(value)) { issue(issues, path, 'invalid_type', 'Expected an object.'); return }
    exactKeys(value, Object.keys(definition.properties), path, issues)
    for (const [key, child] of Object.entries(definition.properties)) if (Object.prototype.hasOwnProperty.call(value, key)) valueMatches(child, value[key], `${path}.${key}`, issues)
    return
  }
  if (definition.kind === 'boolean') {
    if (typeof value !== 'boolean') issue(issues, path, 'invalid_type', 'Expected a boolean.')
  }
}

function validateValueContexts(definition: any, value: unknown, path: string, context: SeoMetricValidationContext, issues: ValidationIssue[]): void {
  if (definition.kind === 'string' && definition.validationContext && typeof value === 'string') {
    checkSafeUrl(value, context, path, issues, definition.validationContext === 'estate_slug')
    return
  }
  if (definition.kind === 'array' && Array.isArray(value)) {
    if (!isDenseBoundedArray(value, 100)) return
    value.forEach((item, index) => validateValueContexts(definition.items, item, `${path}[${index}]`, context, issues))
    return
  }
  if (definition.kind === 'object' && isRecord(value)) {
    for (const [key, child] of Object.entries(definition.properties)) if (Object.prototype.hasOwnProperty.call(value, key)) validateValueContexts(child, value[key], `${path}.${key}`, context, issues)
  }
}

function checkCurrency(code: unknown, context: SeoMetricValidationContext, path: string, issues: ValidationIssue[]): void {
  const registry = context?.currencyRegistry
  if (!registry || registry.schemaVersion !== 'studio.currency-registry-context/1' || !nonempty(registry.definitionVersion)) {
    issue(issues, path, 'context_unavailable', 'A versioned currency registry is required to validate this currency.')
    return
  }
  if (code === null) return
  if (typeof code !== 'string' || !/^[A-Z]{3}$/.test(code)) { issue(issues, path, 'invalid_value', 'Currency must be a canonical three-letter code.'); return }
  let acceptance: CurrencyAcceptance
  try { acceptance = registry.accept(code) } catch { issue(issues, path, 'invalid_context', 'Currency registry acceptance failed.'); return }
  if (!acceptance || acceptance.status === 'rejected' || acceptance.status !== 'accepted' || acceptance.code !== code) issue(issues, path, 'invalid_value', 'Currency registry did not explicitly accept this canonical code.')
}

function checkSafeUrl(value: unknown, context: SeoMetricValidationContext, path: string, issues: ValidationIssue[], isSlug = false): void {
  if (typeof value !== 'string') return
  const urlContext = context?.safeUrlPolicy
  if (!urlContext || urlContext.schemaVersion !== 'studio.safe-url-context/1' || !nonempty(urlContext.definitionVersion) || urlContext.routePolicy?.schemaVersion !== ESTATE_OWNERSHIP_SCHEMA_VERSION) {
    issue(issues, path, 'context_unavailable', 'A versioned estate route policy is required to validate this URL.')
    return
  }
  const candidate = isSlug ? `https://${urlContext.routePolicy.canonicalHost}/${value.replace(/^\/+/, '')}` : value
  let normalized
  try { normalized = normalizeRouteV1(candidate, urlContext.routePolicy) } catch { normalized = null }
  if (!normalized || normalized.normalizationVersion !== ESTATE_ROUTE_NORMALIZATION_VERSION) issue(issues, path, 'invalid_value', 'URL is not accepted by the supplied estate route policy.')
}

function validateProvenance(value: unknown, path: string, context: SeoMetricValidationContext, issues: ValidationIssue[]): void {
  if (!isRecord(value)) { issue(issues, path, 'invalid_provenance', 'Provenance must be an object.'); return }
  const keys = ['observationId', 'definitionVersion', 'sourceRunId', 'projectId', 'subject', 'artifactHash', 'scope', 'window', 'sourceKind', 'method', 'methodVersion', 'modelVersion', 'evidenceIds', 'inputHashes', 'observedAt', 'ingestedAt', 'validUntil', 'quality', 'completeness', 'numerator', 'denominator', 'sampleSize', 'coverage', 'confidence', 'unit', 'warnings', 'collectionRef']
  keys.push('status', 'value', 'reason')
  exactKeys(value, keys, path, issues)
  for (const key of ['observationId', 'definitionVersion', 'sourceRunId', 'projectId', 'method', 'methodVersion', 'unit']) if (!nonempty(value[key])) issue(issues, `${path}.${key}`, 'invalid_provenance', 'Expected a nonempty bounded label.')
  if (value.modelVersion !== null && !nonempty(value.modelVersion)) issue(issues, `${path}.modelVersion`, 'invalid_provenance', 'Expected null or a nonempty model version.')
  if (!isRecord(value.subject)) issue(issues, `${path}.subject`, 'invalid_provenance', 'Subject must be a plain object.')
  else {
    exactKeys(value.subject, ['kind', 'id'], `${path}.subject`, issues)
    if (!subjectKinds.includes(value.subject.kind) || !nonempty(value.subject.id)) issue(issues, `${path}.subject`, 'invalid_provenance', 'Subject kind and ID must be registered and nonempty.')
  }
  checkHash(value.artifactHash, `${path}.artifactHash`, issues, true)
  if (value.sourceKind === 'artifact_analyzer' && value.artifactHash === null) issue(issues, `${path}.artifactHash`, 'invalid_provenance', 'Artifact-derived observations require artifactHash.')
  if (!isRecord(value.scope)) { issue(issues, `${path}.scope`, 'invalid_provenance', 'Scope must be an object.'); return }
  exactKeys(value.scope, ['canonicalUrl', 'query', 'country', 'language', 'device', 'channel', 'searchType', 'propertyId', 'cohortId', 'currency', 'timezone'], `${path}.scope`, issues)
  for (const key of ['canonicalUrl', 'query', 'country', 'device', 'channel', 'searchType', 'propertyId', 'cohortId', 'currency']) if (value.scope[key] !== null && !nonempty(value.scope[key])) issue(issues, `${path}.scope.${key}`, 'invalid_provenance', 'Expected null or a nonempty bounded label.')
  for (const key of ['language', 'timezone']) if (!nonempty(value.scope[key])) issue(issues, `${path}.scope.${key}`, 'invalid_provenance', 'Expected a nonempty bounded label.')
  if (value.scope.country !== null && (typeof value.scope.country !== 'string' || !COUNTRY_CODES.has(value.scope.country))) issue(issues, `${path}.scope.country`, 'invalid_value', 'Country is not present in the pinned COUNTRY_LIST definition.')
  if (value.scope.currency !== null) checkCurrency(value.scope.currency, context, `${path}.scope.currency`, issues)
  if (value.scope.canonicalUrl !== null) checkSafeUrl(value.scope.canonicalUrl, context, `${path}.scope.canonicalUrl`, issues)
  if (!isRecord(value.window)) issue(issues, `${path}.window`, 'invalid_provenance', 'Window must be an object.')
  else {
    exactKeys(value.window, ['start', 'end'], `${path}.window`, issues)
    checkInstant(value.window.start, `${path}.window.start`, issues, true); checkInstant(value.window.end, `${path}.window.end`, issues, true)
  }
  if (!sources.includes(value.sourceKind) || !qualities.includes(value.quality) || !completenessValues.includes(value.completeness)) issue(issues, path, 'invalid_provenance', 'Source, quality, or completeness is outside the registry.')
  for (const key of ['observedAt', 'ingestedAt']) checkInstant(value[key], `${path}.${key}`, issues)
  checkInstant(value.validUntil, `${path}.validUntil`, issues, true)
  for (const key of ['evidenceIds', 'inputHashes', 'warnings']) {
    if (!Array.isArray(value[key])) { issue(issues, `${path}.${key}`, 'invalid_provenance', 'Expected an array with at most 100 entries.'); continue }
    if (!isDenseBoundedArray(value[key], 100)) { issue(issues, `${path}.${key}`, 'invalid_provenance', 'Expected a dense JSON array with at most 100 entries and no extra properties.'); continue }
    checkUnique(value[key], `${path}.${key}`, issues)
    value[key].forEach((entry: unknown, index: number) => {
      if (key === 'inputHashes') checkHash(entry, `${path}.${key}[${index}]`, issues)
      else if (!nonempty(entry)) issue(issues, `${path}.${key}[${index}]`, 'invalid_provenance', 'Expected a nonempty bounded string.')
    })
  }
  for (const key of ['numerator', 'denominator', 'sampleSize', 'coverage', 'confidence']) {
    const entry = value[key]
    if (entry !== null && (typeof entry !== 'number' || !Number.isFinite(entry))) issue(issues, `${path}.${key}`, 'invalid_type', 'Expected null or a finite number.')
  }
  if (value.sampleSize !== null && (!Number.isInteger(value.sampleSize) || value.sampleSize < 0)) issue(issues, `${path}.sampleSize`, 'invalid_value', 'Sample size must be a nonnegative integer.')
  for (const key of ['coverage', 'confidence']) if (value[key] !== null && (value[key] < 0 || value[key] > 1)) issue(issues, `${path}.${key}`, 'invalid_value', 'Coverage and confidence must be from zero through one.')
  if ((value.numerator !== null || value.denominator !== null) && (typeof value.numerator !== 'number' || value.numerator < 0 || typeof value.denominator !== 'number' || value.denominator <= 0)) issue(issues, path, 'invalid_relationship', 'A ratio requires numerator greater than or equal to zero and denominator greater than zero.')
  if (value.collectionRef !== null) {
    const collection = value.collectionRef
    if (!isRecord(collection)) issue(issues, `${path}.collectionRef`, 'invalid_provenance', 'Collection reference must be null or an object.')
    else {
      exactKeys(collection, ['collectionId', 'totalCount', 'completeness', 'artifactHash'], `${path}.collectionRef`, issues)
      if (!nonempty(collection.collectionId) || !completenessValues.includes(collection.completeness)) issue(issues, `${path}.collectionRef`, 'invalid_provenance', 'Collection reference fields are invalid.')
      if (collection.totalCount !== null && (!Number.isInteger(collection.totalCount) || collection.totalCount < 0)) issue(issues, `${path}.collectionRef.totalCount`, 'invalid_value', 'Total count must be null or a nonnegative integer.')
      checkHash(collection.artifactHash, `${path}.collectionRef.artifactHash`, issues)
    }
  }
}

function validateObservation(definition: MetricDefinition, observation: unknown, path: string, context: SeoMetricValidationContext, issues: ValidationIssue[]): void {
  if (!isRecord(observation)) { issue(issues, path, 'invalid_type', 'Observation must be an object.'); return }
  validateProvenance(observation, path, context, issues)
  const status = observation.status
  if (!statuses.includes(status)) { issue(issues, `${path}.status`, 'invalid_status', 'Observation status is not registered.'); return }
  if (presentStatuses.includes(status)) {
    if (!Object.prototype.hasOwnProperty.call(observation, 'value') || !Object.prototype.hasOwnProperty.call(observation, 'reason')) issue(issues, path, 'missing_field', 'Present observations require value and reason.')
    valueMatches(definition, observation.value, `${path}.value`, issues)
    if (observation.reason !== null && !nonempty(observation.reason)) issue(issues, `${path}.reason`, 'invalid_value', 'Reason must be null or a nonempty bounded label.')
    for (const field of ['evidenceIds', 'inputHashes']) {
      if (!Array.isArray(observation[field]) || observation[field].length === 0) issue(issues, `${path}.${field}`, 'invalid_provenance', 'Available and stale observations require nonempty evidence and input hash arrays.')
      else if (!isDenseBoundedArray(observation[field], 100)) issue(issues, `${path}.${field}`, 'invalid_provenance', 'Expected a dense JSON array with at most 100 entries and no extra properties.')
    }
    if ((definition.context as readonly string[]).includes('query')) {
      const subject = isRecord(observation.subject) ? observation.subject : null
      const scope = isRecord(observation.scope) ? observation.scope : null
      if (subject?.kind !== 'query' || !nonempty(scope?.query) || !nonempty(scope?.country)) issue(issues, path, 'invalid_relationship', 'Query metrics require query subject and query/country scope.')
      else if (!COUNTRY_CODES.has(scope.country)) issue(issues, `${path}.scope.country`, 'invalid_value', 'Country is not present in COUNTRY_LIST.')
    }
    if ((definition.constraints as readonly string[]).includes('currency')) {
      const scope = isRecord(observation.scope) ? observation.scope : null
      if (!nonempty(scope?.currency)) issue(issues, `${path}.scope.currency`, 'invalid_relationship', 'Cost per click requires currency.')
      if (scope?.currency == null) checkCurrency(null, context, `${path}.scope.currency`, issues)
    }
    if ((definition.context as readonly string[]).includes('outcome')) {
      const scope = isRecord(observation.scope) ? observation.scope : null
      const window = isRecord(observation.window) ? observation.window : null
      if (!nonempty(scope?.cohortId) || !isInstant(window?.start) || !isInstant(window?.end) || !nonempty(scope?.timezone)) issue(issues, path, 'invalid_relationship', 'Outcome metrics require cohort, bounded window, and timezone.')
      if (definition.kind === 'number' && definition.constraint === 'rate' && (typeof observation.numerator !== 'number' || typeof observation.denominator !== 'number' || observation.denominator <= 0)) issue(issues, path, 'invalid_relationship', 'Outcome rates require a nonnegative numerator and positive eligible denominator.')
      if ((definition.constraints as readonly string[]).includes('conversion_numerator_lte_denominator') && typeof observation.numerator === 'number' && typeof observation.denominator === 'number' && observation.numerator > observation.denominator) issue(issues, path, 'invalid_relationship', 'Conversion numerator cannot exceed eligible sessions.')
    }
    validateValueContexts(definition, observation.value, `${path}.value`, context, issues)
  } else {
    if (observation.value !== null) issue(issues, `${path}.value`, 'invalid_value', 'Absent statuses require JSON null.')
    if (!nonempty(observation.reason)) issue(issues, `${path}.reason`, 'invalid_value', 'Absent statuses require a nonempty reason.')
  }
}

/** Validates the stateless v2 projection; it does not decide source eligibility or publication authority. */
export function validateSeoMetricSnapshot(input: unknown, context: SeoMetricValidationContext): SnapshotValidationResult {
  const issues: ValidationIssue[] = []
  if (!isRecord(input)) return { ok: false, snapshot: null, issues: [{ path: '$', code: 'invalid_snapshot', message: 'Snapshot must be a plain JSON object.' }] }
  if (input.schemaVersion !== METRIC_SCHEMA_VERSION) return { ok: false, snapshot: null, issues: [{ path: '$.schemaVersion', code: 'unsupported_schema_version', message: 'Only seo.metrics/2 is supported; no implicit upconversion is performed.' }] }
  exactKeys(input, ['schemaVersion', 'definitionSetHash', 'observations'], '$', issues)
  checkHash(input.definitionSetHash, '$.definitionSetHash', issues)
  if (input.definitionSetHash !== computeDefinitionSetHash()) issue(issues, '$.definitionSetHash', 'definition_hash_mismatch', 'Definition set hash does not match the versioned registry.')
  if (!isRecord(input.observations)) issue(issues, '$.observations', 'invalid_type', 'Observations must be an object.')
  else {
    exactKeys(input.observations, METRIC_KEYS, '$.observations', issues)
    for (const definition of METRIC_DEFINITIONS) if (Object.prototype.hasOwnProperty.call(input.observations, definition.key)) validateObservation(definition, input.observations[definition.key], `$.observations.${definition.key}`, context, issues)
  }
  return issues.length ? { ok: false, snapshot: null, issues } : { ok: true, snapshot: input as SeoMetricSnapshot, issues: [] }
}

/** Explicit, grounded adapter over the existing reviewed estate route normalizer. */
export function acceptEstateUrl(value: string, policy: EstateRoutePolicyV1): ContextAcceptance & { route?: ReturnType<typeof normalizeRouteV1> } {
  try {
    const route = normalizeRouteV1(value, policy)
    return route ? { status: 'accepted', route } : { status: 'rejected', reason: 'route_policy_rejected' }
  } catch {
    return { status: 'rejected', reason: 'route_policy_error' }
  }
}
