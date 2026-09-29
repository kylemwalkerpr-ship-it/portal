/**
 * Pure, non-activating estate ownership contract.
 *
 * This module validates proposed identity/route values and models decisions in
 * memory. It is not a persistence authority: durable owner and reservation
 * state must be mapped only after A0.3/A0.4 evidence and A1 admission.
 */

export const ESTATE_OWNERSHIP_SCHEMA_VERSION = 'studio.estate-ownership/1' as const
export const ESTATE_ROUTE_NORMALIZATION_VERSION = 'studio.route-normalization/1' as const
export const ESTATE_INTENT_NORMALIZATION_VERSION = 'studio.intent-normalization/1' as const
export const ESTATE_DECISION_POLICY_VERSION = 'studio.decision-policy/1' as const

export interface SemanticIntentV1 {
  schemaVersion: typeof ESTATE_OWNERSHIP_SCHEMA_VERSION
  jurisdiction: string
  entityOrProgramId: string
  audienceId: string
  readerJobId: string
  journeyStage: string
  language: string
  searchIntent: string
}

export interface EstateRoutePolicyV1 {
  schemaVersion: typeof ESTATE_OWNERSHIP_SCHEMA_VERSION
  routePolicyVersion: string
  hostId: string
  canonicalHost: string
  pathCase: 'preserve' | 'lowercase'
  trailingSlash: 'preserve' | 'always' | 'never'
  maxPathLength: number
  reservedSegments: readonly string[]
}

export interface NormalizedRouteV1 {
  schemaVersion: typeof ESTATE_OWNERSHIP_SCHEMA_VERSION
  normalizationVersion: typeof ESTATE_ROUTE_NORMALIZATION_VERSION
  hostId: string
  canonicalHost: string
  canonicalPath: string
  routeKey: string
}

export type OwnershipResult =
  | { status: 'resolved'; ownerId: string; intentKey: string; version: number }
  | { status: 'unresolved'; reason: 'ambiguous' | 'unknown' | 'conflicted' | 'unavailable' }

export type ReservationResult =
  | { status: 'reserved'; route: NormalizedRouteV1; intentKey: string; reservationId: string }
  | { status: 'blocked'; reason: 'intent_owned' | 'intent_reserved' | 'route_owned' | 'route_reserved' | 'invalid_route' }

export interface InMemoryOwnershipState {
  owners: ReadonlyMap<string, { ownerId: string; version: number }>
  routes: ReadonlyMap<string, { ownerId: string; state: 'active' | 'tombstone' }>
  intentReservations: ReadonlySet<string>
  routeReservations: ReadonlySet<string>
}

export interface DecisionInputV1 {
  schemaVersion: typeof ESTATE_OWNERSHIP_SCHEMA_VERSION
  coverage: 'complete' | 'partial' | 'unavailable' | 'unknown'
  evidenceSufficient: boolean
  meaningfulDemandOrMissionFit: 'yes' | 'no' | 'unknown'
  interventionCandidates: readonly string[]
  noActionRationale?: string
  rejectedInterventions?: readonly { action: string; reason: string }[]
  nextReevaluationTrigger?: string
  quotaPressure?: 'none' | 'constrained' | 'exhausted' | 'unknown'
}

export type DecisionResultV1 =
  | { schemaVersion: typeof ESTATE_OWNERSHIP_SCHEMA_VERSION; policyVersion: typeof ESTATE_DECISION_POLICY_VERSION; outcome: 'NO_ACTION'; rationale: string; rejectedInterventions: readonly { action: string; reason: string }[]; nextReevaluationTrigger: string | null }
  | { schemaVersion: typeof ESTATE_OWNERSHIP_SCHEMA_VERSION; policyVersion: typeof ESTATE_DECISION_POLICY_VERSION; outcome: 'ABSTAIN'; reason: 'INSUFFICIENT_EVIDENCE' | 'INCOMPLETE_COVERAGE' | 'UNKNOWN_MISSION_FIT' | 'MISSING_NO_ACTION_TRACE' | 'MISSING_REJECTED_CHOICES' }
  | { schemaVersion: typeof ESTATE_OWNERSHIP_SCHEMA_VERSION; policyVersion: typeof ESTATE_DECISION_POLICY_VERSION; outcome: 'SELECTED_ACTION'; action: string }

const cleanToken = (value: string): string => value.trim()

/** Canonical identity is deterministic and jurisdiction/entity/job scoped. */
export function normalizeIntentV1(intent: SemanticIntentV1): string | null {
  if (intent.schemaVersion !== ESTATE_OWNERSHIP_SCHEMA_VERSION) return null
  const values = [intent.jurisdiction, intent.entityOrProgramId, intent.audienceId, intent.readerJobId, intent.journeyStage, intent.language, intent.searchIntent].map(cleanToken)
  if (values.some((value) => !value)) return null
  return `${ESTATE_INTENT_NORMALIZATION_VERSION}:${JSON.stringify(values.map((value) => value.toLocaleLowerCase('en-US')))}`
}

function canonicalPath(pathname: string, policy: EstateRoutePolicyV1): string | null {
  if (!pathname.startsWith('/') || pathname.startsWith('//') || /[\\\u0000-\u001f\u007f?#]/.test(pathname)) return null
  if (/%(?![0-9a-f]{2})/i.test(pathname)) return null
  if (/%(?:2f|5c)/i.test(pathname)) return null
  let decoded: string
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    return null
  }
  if (decoded.includes('\\') || decoded.includes('//') || /[\u0000-\u001f\u007f?#]/.test(decoded)) return null
  const segments = decoded.split('/').filter(Boolean)
  if (segments.some((segment) => segment === '.' || segment === '..' || segment.includes('/'))) return null
  if (segments.some((segment) => policy.reservedSegments.some((reserved) => reserved.toLocaleLowerCase('en-US') === segment.toLocaleLowerCase('en-US')))) return null
  let normalized = `/${segments.join('/')}`
  if (policy.pathCase === 'lowercase') normalized = normalized.toLocaleLowerCase('en-US')
  if (normalized.length > policy.maxPathLength) return null
  if (policy.trailingSlash === 'always' && normalized !== '/') normalized += '/'
  if (policy.trailingSlash === 'never' && normalized.length > 1) normalized = normalized.replace(/\/+$/, '')
  return normalized
}

/** Validate an absolute HTTPS canonical against a registered, explicit host policy. */
export function normalizeRouteV1(canonicalUrl: string, policy: EstateRoutePolicyV1): NormalizedRouteV1 | null {
  if (policy.schemaVersion !== ESTATE_OWNERSHIP_SCHEMA_VERSION || !policy.routePolicyVersion || !policy.hostId || !policy.canonicalHost || !Number.isInteger(policy.maxPathLength) || policy.maxPathLength < 1) return null
  const rawPath = canonicalUrl.match(/^https:\/\/[^/?#]*(\/[^?#]*)?/i)?.[1] ?? '/'
  // URL() removes literal dot segments during parsing, so inspect the supplied
  // spelling first to ensure traversal is rejected rather than normalized.
  if (rawPath.split('/').some((segment) => {
    try { return decodeURIComponent(segment) === '.' || decodeURIComponent(segment) === '..' }
    catch { return true }
  })) return null
  let parsed: URL
  try {
    parsed = new URL(canonicalUrl)
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port || parsed.hostname.toLocaleLowerCase('en-US') !== policy.canonicalHost.toLocaleLowerCase('en-US')) return null
  const path = canonicalPath(parsed.pathname, policy)
  if (path === null) return null
  const canonicalHost = policy.canonicalHost.toLocaleLowerCase('en-US')
  return {
    schemaVersion: ESTATE_OWNERSHIP_SCHEMA_VERSION,
    normalizationVersion: ESTATE_ROUTE_NORMALIZATION_VERSION,
    hostId: policy.hostId,
    canonicalHost,
    canonicalPath: path,
    routeKey: `${policy.hostId}:${path}`,
  }
}

/** Similarity is deliberately not accepted as an ownership authority. */
export function resolvePrimaryOwnerV1(input: {
  intentKey: string | null
  registeredOwners: ReadonlyMap<string, { ownerId: string; version: number }>
  resolution: 'resolved' | 'ambiguous' | 'unknown' | 'conflicted' | 'unavailable'
}): OwnershipResult {
  if (input.resolution !== 'resolved') return { status: 'unresolved', reason: input.resolution }
  if (!input.intentKey) return { status: 'unresolved', reason: 'unknown' }
  const owner = input.registeredOwners.get(input.intentKey)
  return owner ? { status: 'resolved', ownerId: owner.ownerId, intentKey: input.intentKey, version: owner.version } : { status: 'unresolved', reason: 'unknown' }
}

/** Deterministic preflight only; this does not create a durable reservation. */
export function preflightReservationV1(input: {
  intentKey: string | null
  route: NormalizedRouteV1 | null
  ownerId: string
  state: InMemoryOwnershipState
}): ReservationResult {
  if (!input.intentKey || !input.route) return { status: 'blocked', reason: 'invalid_route' }
  const owner = input.state.owners.get(input.intentKey)
  if (owner && owner.ownerId !== input.ownerId) return { status: 'blocked', reason: 'intent_owned' }
  if (input.state.intentReservations.has(input.intentKey)) return { status: 'blocked', reason: 'intent_reserved' }
  const routeOwner = input.state.routes.get(input.route.routeKey)
  if (routeOwner && (routeOwner.state === 'tombstone' || routeOwner.ownerId !== input.ownerId)) return { status: 'blocked', reason: 'route_owned' }
  if (input.state.routeReservations.has(input.route.routeKey)) return { status: 'blocked', reason: 'route_reserved' }
  return { status: 'reserved', route: input.route, intentKey: input.intentKey, reservationId: `proposal:${input.intentKey}:${input.route.routeKey}` }
}

/**
 * Missing dependencies abstain. Affirmative NO_ACTION survives quota pressure
 * and carries enough trace data to remain a completed business decision.
 */
export function evaluateDecisionV1(input: DecisionInputV1): DecisionResultV1 {
  const base = { schemaVersion: ESTATE_OWNERSHIP_SCHEMA_VERSION, policyVersion: ESTATE_DECISION_POLICY_VERSION } as const
  if (input.schemaVersion !== ESTATE_OWNERSHIP_SCHEMA_VERSION || !input.evidenceSufficient) return { ...base, outcome: 'ABSTAIN', reason: 'INSUFFICIENT_EVIDENCE' }
  if (input.coverage !== 'complete') return { ...base, outcome: 'ABSTAIN', reason: 'INCOMPLETE_COVERAGE' }
  if (input.meaningfulDemandOrMissionFit === 'unknown') return { ...base, outcome: 'ABSTAIN', reason: 'UNKNOWN_MISSION_FIT' }
  if (input.meaningfulDemandOrMissionFit === 'no') {
    if (!input.noActionRationale?.trim()) return { ...base, outcome: 'ABSTAIN', reason: 'MISSING_NO_ACTION_TRACE' }
    if (!input.rejectedInterventions?.length || input.rejectedInterventions.some((item) => !item.action.trim() || !item.reason.trim())) return { ...base, outcome: 'ABSTAIN', reason: 'MISSING_REJECTED_CHOICES' }
    return { ...base, outcome: 'NO_ACTION', rationale: input.noActionRationale.trim(), rejectedInterventions: input.rejectedInterventions, nextReevaluationTrigger: input.nextReevaluationTrigger?.trim() || null }
  }
  const action = input.interventionCandidates.find((candidate) => candidate.trim())
  return action ? { ...base, outcome: 'SELECTED_ACTION', action } : { ...base, outcome: 'ABSTAIN', reason: 'MISSING_REJECTED_CHOICES' }
}
