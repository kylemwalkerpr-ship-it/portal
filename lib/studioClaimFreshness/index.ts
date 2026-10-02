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
// Local bound for opaque identity, binding, jurisdiction/remit, and locator labels.
// It is consistent with the architecture's metric-label budget, but does not define
// reviewer/source identity policy or change any durable schema.
const MAX_LABEL_LENGTH = 256
const MAX_TIMESTAMP_LENGTH = 64
const MAX_AGE: Record<ClaimVolatility, number> = {
  'mutable-rule': DAY,
  procedure: 7 * DAY,
  'stable-background': 30 * DAY,
}
const INSTANT = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.(\d+))?(Z|([+-])(\d\d):(\d\d))$/

function instant(value: unknown): number | null {
  if (typeof value !== 'string' || value.length > MAX_TIMESTAMP_LENGTH) return null
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

function label(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_LABEL_LENGTH && value.trim().length > 0
}

function nullableLabel(value: unknown): value is string | null {
  return value === null || label(value)
}

function volatilityAge(value: unknown): number | null {
  if (value !== 'mutable-rule' && value !== 'procedure' && value !== 'stable-background') return null
  return MAX_AGE[value]
}

function validBinding(value: unknown): value is ClaimReviewBindingV1 {
  if (!value || typeof value !== 'object') return false
  const binding = value as Record<string, unknown>
  return label(binding.revisionId) && Number.isSafeInteger(binding.revisionVersion) && (binding.revisionVersion as number) > 0 &&
    ['claimSetHash', 'bodyHash', 'renderHash', 'sourceSnapshotHash'].every((key) => label(binding[key]))
}

function boundedDenseArray<T>(value: unknown, maximum: number, validMember: (member: unknown) => member is T): value is T[] {
  if (!Array.isArray(value) || value.length > maximum) return false
  let valid = true
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index) || !validMember(value[index])) valid = false
  }
  return valid
}

function validSupport(value: unknown): value is ClaimSupportV1 {
  if (!value || typeof value !== 'object') return false
  const support = value as Record<string, unknown>
  return label(support.sourceId) && (support.relation === 'supports' || support.relation === 'contradicts') &&
    (support.state === 'known' || support.state === 'unknown' || support.state === 'missing' || support.state === 'partial')
}

function validSource(value: unknown): value is ClaimSourceFactV1 {
  if (!value || typeof value !== 'object') return false
  const source = value as Record<string, unknown>
  return label(source.sourceId) && label(source.observationId) && label(source.evidenceIdentity) &&
    instant(source.retrievedAt) !== null && nullableLabel(source.passageLocator) && nullableLabel(source.jurisdiction) &&
    (source.effectiveFrom === null || instant(source.effectiveFrom) !== null) &&
    (source.effectiveTo === null || instant(source.effectiveTo) !== null) &&
    (source.knownChangedAt === null || instant(source.knownChangedAt) !== null) &&
    (source.authorityStatus === 'accepted' || source.authorityStatus === 'unverified' || source.authorityStatus === 'rejected')
}

function validProvenanceRef(value: unknown): value is ClaimSourceProvenanceRefV1 {
  if (!value || typeof value !== 'object') return false
  const ref = value as Record<string, unknown>
  return ref.schemaVersion === 'studio.source-observation/1' && label(ref.observationId) &&
    label(ref.sourceId) && label(ref.evidenceIdentity)
}

function sameBinding(a: ClaimReviewBindingV1, b: ClaimReviewBindingV1): boolean {
  return a.revisionId === b.revisionId && a.revisionVersion === b.revisionVersion &&
    a.claimSetHash === b.claimSetHash && a.bodyHash === b.bodyHash &&
    a.renderHash === b.renderHash && a.sourceSnapshotHash === b.sourceSnapshotHash
}

function add(reasons: string[], code: string): void {
  if (!reasons.includes(code) && reasons.length < MAX_REASONS) reasons.push(code)
}

function reviewReasons(review: unknown, expected: unknown, now: number | null, jurisdiction: unknown, remitKey: unknown,
  progress: { hardReasons: string[] }): string[] {
  const reasons: string[] = []
  const addHard = (code: string) => {
    add(reasons, code)
    add(progress.hardReasons, code)
  }
  if (!review || typeof review !== 'object') { addHard('HUMAN_REVIEW_MISSING'); return reasons }
  const facts = review as Record<string, unknown>
  if (facts.principalKind !== 'human') addHard('REVIEWER_NOT_HUMAN')
  if (!label(facts.principalId) || !label(facts.reviewerId)) addHard('REVIEWER_IDENTITY_MISSING')
  if (facts.credentialState !== 'verified' || facts.reviewerStatus !== 'active') addHard('REVIEWER_CREDENTIAL_NOT_CURRENT')
  if (!label(facts.jurisdiction)) addHard('REVIEWER_REMIT_MISMATCH')
  else if (label(jurisdiction) && facts.jurisdiction !== jurisdiction) addHard('REVIEWER_REMIT_MISMATCH')
  if (!Array.isArray(facts.remit)) addHard('REVIEWER_REMIT_MISMATCH')
  else if (facts.remit.length > MAX_REMIT_KEYS) addHard('REVIEWER_REMIT_UNBOUNDED')
  else {
    let remitValid = true
    let remitMatches = false
    for (let index = 0; index < facts.remit.length; index += 1) {
      if (!Object.prototype.hasOwnProperty.call(facts.remit, index) || !label(facts.remit[index])) remitValid = false
      else if (label(remitKey) && facts.remit[index] === remitKey) remitMatches = true
    }
    if (!remitValid || (label(remitKey) && !remitMatches)) addHard('REVIEWER_REMIT_MISMATCH')
  }
  const from = instant(facts.validFrom), to = facts.validTo === null ? null : instant(facts.validTo)
  const approved = instant(facts.approvedAt)
  if (from === null || (facts.validTo !== null && to === null) || (from !== null && to !== null && from > to) ||
      (now !== null && (now < (from ?? Infinity) || (to !== null && now > to)))) addHard('REVIEWER_VALIDITY_INVALID')
  if (approved === null || (now !== null && approved > now)) addHard('REVIEW_APPROVAL_TIME_INVALID')
  if (facts.decision !== 'approved') addHard('REVIEW_NOT_APPROVED')
  if (!validBinding(facts.binding) || !validBinding(expected) || !sameBinding(facts.binding, expected as ClaimReviewBindingV1)) addHard('REVIEW_BINDING_MISMATCH')
  return reasons
}

/** Evaluate supplied claim/source/review facts. Invalid or incomplete input abstains. */
function evaluateStudioClaimFreshnessFacts(input: ClaimEvaluationInputV1, progress: { hardReasons: string[] }): ClaimEvaluationV1 {
  const reasons: string[] = []
  const now = instant(input?.now)
  const claim = input?.claim
  const age = volatilityAge(claim?.volatility)
  const consequentialClaim = !!claim && typeof claim === 'object' && claim.consequential === true
  const reviewFailures = consequentialClaim
    ? reviewReasons(input.review, input.expectedBinding, now, claim.jurisdiction, claim.remitKey, progress)
    : []

  // Scan only bounded support arrays, by index, so holes cannot hide facts and
  // oversized arrays cannot be traversed to infer a contradiction.
  let knownCriticalContradiction = false
  if (claim && typeof claim === 'object' && claim.critical === true && Array.isArray(claim.supports) && claim.supports.length <= MAX_SUPPORTS) {
    for (let index = 0; index < claim.supports.length; index += 1) {
      const support = claim.supports[index]
      if (support && typeof support === 'object' &&
          (support as Record<string, unknown>).relation === 'contradicts' && (support as Record<string, unknown>).state === 'known') {
        knownCriticalContradiction = true
        add(progress.hardReasons, 'CRITICAL_CONTRADICTION')
      }
    }
  }

  const claimShapeValid = !!claim && typeof claim === 'object' && label(claim.claimId) &&
    typeof claim.consequential === 'boolean' && typeof claim.critical === 'boolean' && age !== null &&
    label(claim.jurisdiction) && label(claim.remitKey) && instant(claim.asOf) !== null && instant(claim.effectiveAt) !== null &&
    boundedDenseArray(claim.supports, MAX_SUPPORTS, validSupport)
  const sourcesValid = boundedDenseArray(input?.sources, MAX_SOURCES, validSource)
  const refsValid = input?.provenanceRefs === undefined ||
    boundedDenseArray(input.provenanceRefs, MAX_PROVENANCE_REFS, validProvenanceRef)
  const shapeInvalid = now === null || input?.schemaVersion !== STUDIO_CLAIM_EVALUATION_SCHEMA || !claimShapeValid ||
    !sourcesValid || !refsValid || !validBinding(input?.expectedBinding)
  if (shapeInvalid) {
    const invalidReasons = ['INPUT_INVALID_OR_UNBOUNDED', ...reviewFailures]
    if (knownCriticalContradiction) add(invalidReasons, 'CRITICAL_CONTRADICTION')
    return {
      schemaVersion: STUDIO_CLAIM_EVALUATION_SCHEMA,
      decision: reviewFailures.length || knownCriticalContradiction ? 'BLOCK' : 'ABSTAIN',
      reasonCodes: invalidReasons,
      checkedAt: null,
      freshnessMaxAgeMs: null,
    }
  }
  const checkedAt = now as number
  const freshnessAge = age as number
  const asOf = instant(claim.asOf)!
  const effectiveAt = instant(claim.effectiveAt)!
  if (asOf > checkedAt || effectiveAt > checkedAt) add(reasons, 'CLAIM_TIME_INVALID')
  const sources = new Map<string, ClaimSourceFactV1>()
  for (const source of input.sources) {
    if (sources.has(source.sourceId)) add(reasons, 'SOURCE_ID_INVALID_OR_DUPLICATE')
    else sources.set(source.sourceId, source)
  }
  for (const support of claim.supports) {
    if (support.relation === 'contradicts' && support.state === 'known') {
      add(reasons, claim.critical ? 'CRITICAL_CONTRADICTION' : 'CONTRADICTION_PRESENT')
      if (claim.critical) add(progress.hardReasons, 'CRITICAL_CONTRADICTION')
    }
    if (support.state !== 'known') {
      add(reasons, `EVIDENCE_${support.state.toUpperCase()}`); continue
    }
    // The supplied current source must still match the source captured by the decision.
    const source = sources.get(support.sourceId)
    if (!source) { add(reasons, 'SOURCE_MISSING'); continue }
    if (source.authorityStatus !== 'accepted') add(reasons, 'SOURCE_AUTHORITY_UNVERIFIED')
    const retrieved = instant(source.retrievedAt)
    if (retrieved === null || retrieved > checkedAt) add(reasons, 'SOURCE_TIME_INVALID')
    else if (checkedAt - retrieved > freshnessAge) add(reasons, 'SOURCE_STALE')
    if (source.knownChangedAt !== null) add(reasons, 'SOURCE_CHANGED_INVALIDATES')
    if (source.passageLocator === null) add(reasons, 'PASSAGE_MISSING')
    if (source.jurisdiction === null || source.jurisdiction !== claim.jurisdiction) add(reasons, 'SOURCE_JURISDICTION_MISMATCH')
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
  for (const reason of reviewFailures) add(reasons, reason)
  const blocks = reasons.includes('CRITICAL_CONTRADICTION') || reviewFailures.length > 0
  return {
    schemaVersion: STUDIO_CLAIM_EVALUATION_SCHEMA,
    decision: blocks ? 'BLOCK' : reasons.length ? 'ABSTAIN' : 'NO_ACTION',
    reasonCodes: reasons,
    checkedAt: input.now,
    freshnessMaxAgeMs: freshnessAge,
  }
}

/** Malformed runtime values fail closed as ABSTAIN rather than escaping evaluation. */
export function evaluateStudioClaimFreshness(input: ClaimEvaluationInputV1): ClaimEvaluationV1 {
  const progress = { hardReasons: [] as string[] }
  try {
    return evaluateStudioClaimFreshnessFacts(input, progress)
  } catch {
    return {
      schemaVersion: STUDIO_CLAIM_EVALUATION_SCHEMA,
      decision: progress.hardReasons.length ? 'BLOCK' : 'ABSTAIN',
      reasonCodes: ['INPUT_INVALID_OR_UNBOUNDED', ...progress.hardReasons],
      checkedAt: null,
      freshnessMaxAgeMs: null,
    }
  }
}
