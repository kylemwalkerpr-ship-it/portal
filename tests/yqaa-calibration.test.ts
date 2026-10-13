import fs from 'node:fs'
import path from 'node:path'
import { buildYqaaCalibrationState, summarizeYqaaOutcomes, summarizeYqaaReviews } from '@/lib/yqaaCalibration'
import { isQualifiedYqaaGoldCase } from '@/lib/yqaaOfflineEvaluator'

describe('YQAA Phase 3 calibration boundaries', () => {
  it('counts the latest status per YQAA offer and derives approval rates only from outcome states', () => {
    const metrics = summarizeYqaaOutcomes([
      { source_kind: 'offer', source_id: 'offer-a', state: 'pending', occurred_at: '2026-01-01' },
      { source_kind: 'offer', source_id: 'offer-a', state: 'accepted', occurred_at: '2026-01-02' },
      { source_kind: 'offer', source_id: 'offer-a', state: 'paid', occurred_at: '2026-01-03' },
      { source_kind: 'offer', source_id: 'offer-b', state: 'declined', occurred_at: '2026-01-02' },
      { source_kind: 'provider_approval', source_id: 'request-a', state: 'pending', occurred_at: '2026-01-01' },
      { source_kind: 'provider_approval', source_id: 'request-b', state: 'approved', occurred_at: '2026-01-02' },
      { source_kind: 'provider_approval', source_id: 'request-b', state: 'invalidated', occurred_at: '2026-01-03' },
      { source_kind: 'provider_approval', source_id: 'request-c', state: 'declined', occurred_at: '2026-01-02' },
    ])
    expect(metrics.offerEvents).toBe(4)
    expect(metrics.resolvedOffers).toBe(2)
    expect(metrics.offerAcceptanceRate).toBe(0.5)
    expect(metrics.providerApprovalRate).toBe(0)
  })

  it('uses durable transition order when event timestamps tie and honors offer reversions', () => {
    const metrics = summarizeYqaaOutcomes([
      { source_kind: 'offer', source_id: 'paid-after-retry', state: 'accepted', occurred_at: '2026-01-01T00:00:00Z', event_order: 10 },
      { source_kind: 'offer', source_id: 'paid-after-retry', state: 'pending', occurred_at: '2026-01-01T00:00:00Z', event_order: 11 },
      { source_kind: 'offer', source_id: 'paid-after-retry', state: 'accepted', occurred_at: '2026-01-01T00:00:00Z', event_order: 12 },
      { source_kind: 'offer', source_id: 'paid-after-retry', state: 'paid', occurred_at: '2026-01-01T00:00:00Z', event_order: 13 },
      { source_kind: 'offer', source_id: 'refunded-order', state: 'accepted', occurred_at: '2026-01-01T00:00:00Z', event_order: 14 },
      { source_kind: 'offer', source_id: 'refunded-order', state: 'pending', occurred_at: '2026-01-01T00:00:00Z', event_order: 15 },
      { source_kind: 'provider_approval', source_id: 'approval-v1', state: 'approved', occurred_at: '2026-01-01T00:00:00Z', event_order: 16 },
      { source_kind: 'provider_approval', source_id: 'approval-v1', state: 'invalidated', occurred_at: '2026-01-01T00:00:00Z', event_order: 17 },
      { source_kind: 'provider_approval', source_id: 'approval-v2', state: 'pending', occurred_at: '2026-01-01T00:00:00Z', event_order: 18 },
      { source_kind: 'provider_approval', source_id: 'approval-v2', state: 'approved', occurred_at: '2026-01-01T00:00:00Z', event_order: 19 },
    ])
    expect(metrics.offerEvents).toBe(6)
    expect(metrics.offerStates).toEqual({ accepted: 3, pending: 2, paid: 1 })
    expect(metrics.resolvedOffers).toBe(1)
    expect(metrics.offerAcceptanceRate).toBe(1)
    expect(metrics.providerApprovalRate).toBe(0.5)
  })

  it('requires two distinct, agreeing reviewer submissions for critical cases and never verifies claims itself', () => {
    const one = [{ decision_record_id: 'critical', reviewer_profile_id: 'admin-a', human_safe: false, is_critical: true, reviewer_qualification_claim: 'licensed attorney', provenance_ref: 'batch-001' }]
    expect(summarizeYqaaReviews(one)).toMatchObject({ criticalCasesPendingDualReview: 1, dualReviewedCriticalCases: 0, qualificationVerifiedCases: 0, eligibleGoldLabels: 0 })
    expect(summarizeYqaaReviews([...one, { ...one[0], reviewer_profile_id: 'admin-b' }])).toMatchObject({ criticalCasesPendingDualReview: 0, dualReviewedCriticalCases: 1, eligibleGoldLabels: 0 })
    expect(summarizeYqaaReviews([...one, { ...one[0], reviewer_profile_id: 'admin-b', human_safe: true }])).toMatchObject({ criticalCasesPendingDualReview: 0, conflictingCriticalCases: 1, dualReviewedCriticalCases: 0 })
  })

  it('keeps empty/unqualified intake on HOLD and exposes only demotion recommendations', () => {
    const state = buildYqaaCalibrationState([], [], [])
    expect(state.promotion).toBe('HOLD')
    expect(state.evaluation.promotion).toBe('HOLD_INSUFFICIENT_LABELS')
    expect(state.falseSafeDemotions.recommendation).toBeNull()
    expect(state.policyMutation).toBe('DISABLED')
  })

  it('surfaces a demotion recommendation on false-safe evidence without enabling promotion', () => {
    const labels = [{ id: 'miss-1', stratum: 'channel:dm', predictedSafe: true, humanSafe: false, labelSource: 'licensed_expert', expertQualification: 'licensed attorney', rubricVersion: 'r1', provenance: 'review-batch-1' }]
    const state = buildYqaaCalibrationState(labels, [], [])
    expect(state.falseSafeDemotions).toMatchObject({ recommendation: 'DEMOTE_SHADOW_RUBRIC', requiresHumanReview: true, appliesAutomatically: false, count: 1 })
    expect(state.promotion).toBe('HOLD')
  })

  it('rejects a critical gold label unless two distinct expert reviewers are recorded', () => {
    const base = { id: 'critical-case', stratum: 'risk:high-stakes', predictedSafe: true, humanSafe: false, labelSource: 'licensed_expert', expertQualification: 'licensed attorney', rubricVersion: 'r1', provenance: 'batch-001' }
    expect(isQualifiedYqaaGoldCase(base)).toBe(false)
    expect(isQualifiedYqaaGoldCase({ ...base, reviewerIds: ['same', 'same'], reviewerQualifications: ['qualified', 'qualified'] })).toBe(false)
    expect(isQualifiedYqaaGoldCase({ ...base, reviewerIds: ['reviewer-a', 'reviewer-b'], reviewerQualifications: ['licensed attorney', 'licensed attorney'] })).toBe(true)
  })

  it('uses service-only, additive triggers and prevents intake from claiming verified qualifications', () => {
    const sql = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20261013200000_yqaa_negotiation_outcomes.sql'), 'utf8')
    expect(sql).toMatch(/enable row level security/i)
    expect(sql).toMatch(/force row level security/i)
    expect(sql).toMatch(/revoke all on table public\.yqaa_negotiation_outcomes from public, anon, authenticated/i)
    expect(sql).toMatch(/grant select, insert on table public\.yqaa_negotiation_outcomes to service_role/i)
    expect(sql).toMatch(/new\.yqaa_idempotency_key is null then return new/i)
    expect(sql).toMatch(/old\.status is distinct from new\.status/i)
    expect(sql).toMatch(/event_order bigint not null unique/i)
    expect(sql).toMatch(/nextval\('public\.yqaa_negotiation_outcomes_order_seq'\)/i)
    expect(sql).toMatch(/'offer:' \|\| new\.id::text \|\| ':' \|\| v_event_order::text/i)
    expect(sql).toMatch(/unique \(decision_record_id, reviewer_profile_id\)/i)
    expect(sql).toMatch(/check \(qualification_verified_at is null\)/i)
    expect(sql).not.toMatch(/grant .*authenticated/i)
    expect(sql).not.toMatch(/create or replace function public\.(commit_yqaa_reply|commit_yqaa_reply_with_pricing_approval)/i)
  })

  it('protects dashboard API with existing admin auth and does not select transcript or contact fields', () => {
    const route = fs.readFileSync(path.join(process.cwd(), 'app/api/admin/yqaa-learning/route.ts'), 'utf8')
    expect(route).toMatch(/requireAdminUser\(request\)/g)
    expect(route).toMatch(/reason_codes/)
    expect(route).not.toMatch(/\.from\(['"](?:conversation_messages|conversation_messages_private|conversation_attachments)['"]\)/i)
    expect(route).not.toMatch(/select\([^)]*(?:email|phone|body|visitor_text)/i)
    expect(route).toMatch(/SAFE_REF/)
    expect(route).toMatch(/qualificationVerified: false/)
  })
})
