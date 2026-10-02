/**
 * Studio claim support/freshness contract v1.
 * Pure evaluation of caller supplied immutable facts. It does not establish
 * source authority, verify a human, persist an approval, or activate release.
 */
export const STUDIO_CLAIM_EVALUATION_SCHEMA = 'studio.claim-evaluation/1' as const
export const STUDIO_CLAIM_EVALUATION_ACTIVATION_ENABLED = false as const

export type ClaimVolatility = 'mutable-rule' | 'procedure' | 'stable-background'
export type ClaimEvidenceState = 'known' | 'unknown' | 'missing' | 'partial'
export type ClaimDecision = 'NO_ACTION' | 'ABSTAIN' | 'BLOCK'

/** Optional identity join to studio.source-observation/1 from A2. */
export interface ClaimSourceProvenanceRefV1 {
  schemaVersion: 'studio.source-observation/1'
  observationId: string
  sourceId: string
  evidenceIdentity: string
}

export interface ClaimSourceFactV1 {
  sourceId: string
  observationId: string
  evidenceIdentity: string
  retrievedAt: string
  passageLocator: string | null
  jurisdiction: string | null
  effectiveFrom: string | null
  effectiveTo: string | null
  /** Supplied known-change event; any non-null value invalidates immediately. */
  knownChangedAt: string | null
  /** Authority is an explicit reviewed input; URL or publisher prestige is ignored. */
  authorityStatus: 'accepted' | 'unverified' | 'rejected'
}

export interface ClaimSupportV1 {
  sourceId: string
  relation: 'supports' | 'contradicts'
  state: ClaimEvidenceState
}

export interface ClaimV1 {
  claimId: string
  consequential: boolean
  critical: boolean
  volatility: ClaimVolatility
  jurisdiction: string
  /** Stable program/topic key that the reviewer remit must explicitly cover. */
  remitKey: string
  asOf: string
  effectiveAt: string
  supports: ClaimSupportV1[]
}

export interface ClaimReviewBindingV1 {
  revisionId: string
  revisionVersion: number
  claimSetHash: string
  bodyHash: string
  renderHash: string
  sourceSnapshotHash: string
}

export interface HumanReviewFactsV1 {
  principalKind: 'human' | 'model' | 'unknown'
  principalId: string
  reviewerId: string
  credentialState: 'verified' | 'unverified' | 'expired' | 'revoked'
  reviewerStatus: 'active' | 'suspended' | 'retired'
  jurisdiction: string
  remit: string[]
  validFrom: string
  validTo: string | null
  approvedAt: string
  decision: 'approved' | 'returned' | 'escalated'
  binding: ClaimReviewBindingV1
}

export interface ClaimEvaluationInputV1 {
  schemaVersion: typeof STUDIO_CLAIM_EVALUATION_SCHEMA
  now: string
  claim: ClaimV1
  sources: ClaimSourceFactV1[]
  provenanceRefs?: ClaimSourceProvenanceRefV1[]
  /** Required only for consequential claims; inputs are evaluated, never authenticated. */
  review: HumanReviewFactsV1 | null
  expectedBinding: ClaimReviewBindingV1
}

export interface ClaimEvaluationV1 {
  schemaVersion: typeof STUDIO_CLAIM_EVALUATION_SCHEMA
  decision: ClaimDecision
  reasonCodes: string[]
  checkedAt: string | null
  freshnessMaxAgeMs: number | null
}

const DAY = 24 * 60 * 60 * 1000
const MAX_SOURCES = 64
const MAX_SUPPORTS = 64
const MAX_PROVENANCE_REFS = 64
const MAX_REMIT_KEYS = 64
const MAX_REASONS = 32
const MAX_AGE: Record<ClaimVolatility, number> = {
  'mutable-rule': DAY,
  procedure: 7 * DAY,
  'stable-background': 30 * DAY,
}
const INSTANT = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.(\d+))?(Z|([+-])(\d\d):(\d\d))$/

function instant(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const match = INSTANT.exec(value)
  if (!match) return null
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , zone, , offsetHourText, offsetMinuteText] = match
  const year = Number(yearText), month = Number(monthText), day = Number(dayText)
  const hour = Number(hourText), minute = Number(minuteText), second = Number(secondText)
  const daysInMonth = [31, ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0) ? 29 : 28,
    31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1] ||
      hour > 23 || minute > 59 || second > 59 ||
      (zone !== 'Z' && (Number(offsetHourText) > 23 || Number(offsetMinuteText) > 59))) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function validBinding(value: unknown): value is ClaimReviewBindingV1 {
  if (!value || typeof value !== 'object') return false
  const binding = value as Record<string, unknown>
  return typeof binding.revisionId === 'string' && binding.revisionId.length > 0 &&
    Number.isInteger(binding.revisionVersion) && (binding.revisionVersion as number) > 0 &&
    ['claimSetHash', 'bodyHash', 'renderHash', 'sourceSnapshotHash'].every((key) =>
      typeof binding[key] === 'string' && (binding[key] as string).length > 0)
}

function sameBinding(a: ClaimReviewBindingV1, b: ClaimReviewBindingV1): boolean {
  return a.revisionId === b.revisionId && a.revisionVersion === b.revisionVersion &&
    a.claimSetHash === b.claimSetHash && a.bodyHash === b.bodyHash &&
    a.renderHash === b.renderHash && a.sourceSnapshotHash === b.sourceSnapshotHash
}

function add(reasons: string[], code: string): void {
  if (!reasons.includes(code) && reasons.length < MAX_REASONS) reasons.push(code)
}

function reviewReasons(review: HumanReviewFactsV1 | null, expected: ClaimReviewBindingV1, now: number, jurisdiction: string, remitKey: string): string[] {
  const reasons: string[] = []
  if (!review) return ['HUMAN_REVIEW_MISSING']
  if (review.principalKind !== 'human') add(reasons, 'REVIEWER_NOT_HUMAN')
  if (!review.principalId || !review.reviewerId) add(reasons, 'REVIEWER_IDENTITY_MISSING')
  if (review.credentialState !== 'verified' || review.reviewerStatus !== 'active') add(reasons, 'REVIEWER_CREDENTIAL_NOT_CURRENT')
  if (review.jurisdiction !== jurisdiction || !Array.isArray(review.remit)) add(reasons, 'REVIEWER_REMIT_MISMATCH')
  else if (review.remit.length > MAX_REMIT_KEYS) add(reasons, 'REVIEWER_REMIT_UNBOUNDED')
  else if (!review.remit.includes(remitKey)) add(reasons, 'REVIEWER_REMIT_MISMATCH')
  const from = instant(review.validFrom), to = review.validTo === null ? null : instant(review.validTo)
  const approved = instant(review.approvedAt)
  if (from === null || (review.validTo !== null && to === null) || now < (from ?? Infinity) || (to !== null && now > to)) add(reasons, 'REVIEWER_VALIDITY_INVALID')
  if (approved === null || approved > now) add(reasons, 'REVIEW_APPROVAL_TIME_INVALID')
  if (review.decision !== 'approved') add(reasons, 'REVIEW_NOT_APPROVED')
  if (!validBinding(review.binding) || !validBinding(expected) || !sameBinding(review.binding, expected)) add(reasons, 'REVIEW_BINDING_MISMATCH')
  return reasons
}

/** Evaluate supplied claim/source/review facts. Invalid or incomplete input abstains. */
function evaluateStudioClaimFreshnessFacts(input: ClaimEvaluationInputV1): ClaimEvaluationV1 {
  const reasons: string[] = []
  const now = instant(input?.now)
  const claim = input?.claim
  const age = claim && MAX_AGE[claim.volatility]
  if (now === null || !claim || input.schemaVersion !== STUDIO_CLAIM_EVALUATION_SCHEMA || !claim.claimId ||
      typeof claim.consequential !== 'boolean' || typeof claim.critical !== 'boolean' || !age ||
      !claim.jurisdiction || !claim.remitKey || instant(claim.asOf) === null || instant(claim.effectiveAt) === null ||
      !Array.isArray(claim.supports) || claim.supports.length > MAX_SUPPORTS ||
      !Array.isArray(input.sources) || input.sources.length > MAX_SOURCES ||
      (input.provenanceRefs !== undefined && (!Array.isArray(input.provenanceRefs) || input.provenanceRefs.length > MAX_PROVENANCE_REFS)) ||
      !validBinding(input.expectedBinding)) {
    return { schemaVersion: STUDIO_CLAIM_EVALUATION_SCHEMA, decision: 'ABSTAIN', reasonCodes: ['INPUT_INVALID_OR_UNBOUNDED'], checkedAt: null, freshnessMaxAgeMs: null }
  }
  const asOf = instant(claim.asOf)!
  const effectiveAt = instant(claim.effectiveAt)!
  if (asOf > now || effectiveAt > now) add(reasons, 'CLAIM_TIME_INVALID')
  const sources = new Map<string, ClaimSourceFactV1>()
  for (const source of input.sources) {
    if (!source || !source.sourceId || sources.has(source.sourceId)) add(reasons, 'SOURCE_ID_INVALID_OR_DUPLICATE')
    else sources.set(source.sourceId, source)
  }
  for (const support of claim.supports) {
    if (!support || !['supports', 'contradicts'].includes(support.relation) || !['known', 'unknown', 'missing', 'partial'].includes(support.state)) {
      add(reasons, 'SUPPORT_SHAPE_INVALID'); continue
    }
    if (support.relation === 'contradicts' && support.state === 'known') {
      add(reasons, claim.critical ? 'CRITICAL_CONTRADICTION' : 'CONTRADICTION_PRESENT')
    }
    if (support.state !== 'known') {
      add(reasons, `EVIDENCE_${support.state.toUpperCase()}`); continue
    }
    // The supplied current source must still match the source captured by the decision.
    const source = sources.get(support.sourceId)
    if (!source) { add(reasons, 'SOURCE_MISSING'); continue }
    if (source.authorityStatus !== 'accepted') add(reasons, 'SOURCE_AUTHORITY_UNVERIFIED')
    if (!source.evidenceIdentity || !source.observationId) add(reasons, 'SOURCE_IDENTITY_MISSING')
    const retrieved = instant(source.retrievedAt)
    if (retrieved === null || retrieved > now) add(reasons, 'SOURCE_TIME_INVALID')
    else if (now - retrieved > age) add(reasons, 'SOURCE_STALE')
    if (source.knownChangedAt !== null) add(reasons, 'SOURCE_CHANGED_INVALIDATES')
    if (!source.passageLocator) add(reasons, 'PASSAGE_MISSING')
    if (!source.jurisdiction || source.jurisdiction !== claim.jurisdiction) add(reasons, 'SOURCE_JURISDICTION_MISMATCH')
    const from = source.effectiveFrom === null ? null : instant(source.effectiveFrom)
    const to = source.effectiveTo === null ? null : instant(source.effectiveTo)
    if ((source.effectiveFrom === null && source.effectiveTo === null) ||
        (source.effectiveFrom !== null && from === null) || (source.effectiveTo !== null && to === null) ||
        (from !== null && to !== null && from > to) ||
        (from !== null && effectiveAt < from) || (to !== null && effectiveAt > to)) add(reasons, 'SOURCE_EFFECTIVE_DATE_MISMATCH')
    const refs = input.provenanceRefs ?? []
    if (input.provenanceRefs !== undefined && !refs.some((ref) => ref.schemaVersion === 'studio.source-observation/1' && ref.observationId === source.observationId && ref.sourceId === source.sourceId && ref.evidenceIdentity === source.evidenceIdentity)) add(reasons, 'SOURCE_PROVENANCE_MISMATCH')
  }
  if (!claim.supports.length) add(reasons, 'SUPPORT_MISSING')
  const reviewFailures = claim.consequential
    ? reviewReasons(input.review, input.expectedBinding, now, claim.jurisdiction, claim.remitKey)
    : []
  for (const reason of reviewFailures) add(reasons, reason)
  const blocks = reasons.includes('CRITICAL_CONTRADICTION') || reviewFailures.length > 0
  return {
    schemaVersion: STUDIO_CLAIM_EVALUATION_SCHEMA,
    decision: blocks ? 'BLOCK' : reasons.length ? 'ABSTAIN' : 'NO_ACTION',
    reasonCodes: reasons,
    checkedAt: input.now,
    freshnessMaxAgeMs: age,
  }
}

/** Malformed runtime values fail closed as ABSTAIN rather than escaping evaluation. */
export function evaluateStudioClaimFreshness(input: ClaimEvaluationInputV1): ClaimEvaluationV1 {
  try {
    return evaluateStudioClaimFreshnessFacts(input)
  } catch {
    return {
      schemaVersion: STUDIO_CLAIM_EVALUATION_SCHEMA,
      decision: 'ABSTAIN',
      reasonCodes: ['INPUT_INVALID_OR_UNBOUNDED'],
      checkedAt: null,
      freshnessMaxAgeMs: null,
    }
  }
}
