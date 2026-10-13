import { evaluateYqaaGoldSet, type YqaaEvaluation } from '@/lib/yqaaOfflineEvaluator'

export type YqaaOutcomeEvent = { source_kind: 'offer' | 'provider_approval'; source_id?: string; occurred_at?: string; state: string }

export function summarizeYqaaOutcomes(events: YqaaOutcomeEvent[]) {
  const offers = events.filter((event) => event.source_kind === 'offer')
  const approvals = events.filter((event) => event.source_kind === 'provider_approval')
  const offerCounts: Record<string, number> = {}
  const approvalCounts: Record<string, number> = {}
  for (const event of offers) offerCounts[event.state] = (offerCounts[event.state] || 0) + 1
  for (const event of approvals) approvalCounts[event.state] = (approvalCounts[event.state] || 0) + 1
  const latestOffers = new Map<string, YqaaOutcomeEvent>()
  offers.forEach((event, index) => {
    const key = event.source_id || `event-${index}`
    const current = latestOffers.get(key)
    if (!current || String(event.occurred_at || '') > String(current.occurred_at || '')) latestOffers.set(key, event)
  })
  const terminalOffers = [...latestOffers.values()].filter((event) => ['accepted', 'paid', 'declined', 'expired', 'cancelled'].includes(event.state))
  const positiveOffers = terminalOffers.filter((event) => ['accepted', 'paid'].includes(event.state)).length
  const latestApprovals = new Map<string, YqaaOutcomeEvent>()
  approvals.forEach((event, index) => {
    const key = event.source_id || `approval-event-${index}`
    const current = latestApprovals.get(key)
    if (!current || String(event.occurred_at || '') > String(current.occurred_at || '')) latestApprovals.set(key, event)
  })
  const resolvedApprovals = [...latestApprovals.values()].filter((event) => ['approved', 'declined', 'invalidated'].includes(event.state))
  const approved = resolvedApprovals.filter((event) => event.state === 'approved').length
  return {
    offerEvents: offers.length,
    approvalEvents: approvals.length,
    offerStates: offerCounts,
    approvalStates: approvalCounts,
    offerAcceptanceRate: terminalOffers.length ? positiveOffers / terminalOffers.length : null,
    providerApprovalRate: resolvedApprovals.length ? approved / resolvedApprovals.length : null,
    resolvedOffers: terminalOffers.length,
    resolvedApprovals: resolvedApprovals.length,
  }
}

export type YqaaReviewSubmission = {
  decision_record_id: string
  reviewer_profile_id: string
  human_safe: boolean
  is_critical: boolean
  reviewer_qualification_claim: string
  provenance_ref: string
  qualification_verified_at?: string | null
}

/** Reviewers must submit independently. Any disagreement or missing second
 * reviewer holds a critical case; claimed credentials are never treated as verified. */
export function summarizeYqaaReviews(submissions: YqaaReviewSubmission[]) {
  const cases = new Map<string, YqaaReviewSubmission[]>()
  for (const row of submissions) cases.set(row.decision_record_id, [...(cases.get(row.decision_record_id) || []), row])
  let pending = 0
  let dualReviewedCritical = 0
  let conflictingCritical = 0
  let qualificationVerified = 0
  for (const rows of cases.values()) {
    const critical = rows.some((row) => row.is_critical)
    const reviewers = new Set(rows.map((row) => row.reviewer_profile_id))
    if (rows.some((row) => row.qualification_verified_at)) qualificationVerified++
    if (critical) {
      if (reviewers.size < 2) pending++
      else if (new Set(rows.map((row) => row.human_safe)).size > 1) conflictingCritical++
      else dualReviewedCritical++
    } else if (reviewers.size < 1) pending++
  }
  return {
    caseCount: cases.size,
    criticalCasesPendingDualReview: pending,
    dualReviewedCriticalCases: dualReviewedCritical,
    conflictingCriticalCases: conflictingCritical,
    qualificationVerifiedCases: qualificationVerified,
    eligibleGoldLabels: 0,
    note: 'Reviewer qualification claims are unverified; intake submissions do not enter calibration metrics.',
  }
}

export function buildYqaaCalibrationState(goldCases: unknown, outcomes: YqaaOutcomeEvent[], reviews: YqaaReviewSubmission[]) {
  const evaluation: YqaaEvaluation = evaluateYqaaGoldSet(goldCases)
  const falseSafeDemotions = evaluation.falseSafeCount > 0
    ? { recommendation: 'DEMOTE_SHADOW_RUBRIC', requiresHumanReview: true, appliesAutomatically: false, count: evaluation.falseSafeCount }
    : { recommendation: null, requiresHumanReview: false, appliesAutomatically: false, count: 0 }
  return {
    metrics: summarizeYqaaOutcomes(outcomes),
    evaluation,
    falseSafeDemotions,
    reviews: summarizeYqaaReviews(reviews),
    policyMutation: 'DISABLED' as const,
    promotion: 'HOLD' as const,
  }
}
