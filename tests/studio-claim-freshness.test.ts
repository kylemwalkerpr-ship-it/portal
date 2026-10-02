import {
  evaluateStudioClaimFreshness,
  STUDIO_CLAIM_EVALUATION_ACTIVATION_ENABLED,
  STUDIO_CLAIM_EVALUATION_SCHEMA,
  type ClaimEvaluationInputV1,
} from '../lib/studioClaimFreshness'

const binding = {
  revisionId: 'revision-1', revisionVersion: 3, claimSetHash: 'claims-a', bodyHash: 'body-a',
  renderHash: 'render-a', sourceSnapshotHash: 'sources-a',
}
const source = {
  sourceId: 'authority-1', observationId: 'observation-1', evidenceIdentity: 'identity-1',
  retrievedAt: '2026-09-29T12:00:00Z', passageLocator: 'section-4#p2', jurisdiction: 'US-CA',
  effectiveFrom: '2026-01-01T00:00:00Z', effectiveTo: null, knownChangedAt: null,
  authorityStatus: 'accepted' as const,
}
const review = {
  principalKind: 'human' as const, principalId: 'human-1', reviewerId: 'reviewer-1',
  credentialState: 'verified' as const, reviewerStatus: 'active' as const, jurisdiction: 'US-CA',
  remit: ['immigration-eligibility'], validFrom: '2026-01-01T00:00:00Z', validTo: null,
  approvedAt: '2026-09-29T12:30:00Z', decision: 'approved' as const, binding,
}
const input = (overrides: Partial<ClaimEvaluationInputV1> = {}): ClaimEvaluationInputV1 => ({
  schemaVersion: STUDIO_CLAIM_EVALUATION_SCHEMA,
  now: '2026-09-29T13:00:00Z',
  claim: {
    claimId: 'claim-1', consequential: true, critical: true, volatility: 'mutable-rule',
    jurisdiction: 'US-CA', remitKey: 'immigration-eligibility', asOf: '2026-09-29T13:00:00Z', effectiveAt: '2026-09-29T13:00:00Z',
    supports: [{ sourceId: source.sourceId, relation: 'supports', state: 'known' }],
  },
  sources: [source], review, expectedBinding: binding, ...overrides,
})

describe('Studio claim support/freshness v1', () => {
  it('is versioned and evaluation cannot activate release', () => {
    expect(STUDIO_CLAIM_EVALUATION_ACTIVATION_ENABLED).toBe(false)
    expect(evaluateStudioClaimFreshness(input()).decision).toBe('NO_ACTION')
  })

  it.each([
    ['mutable-rule', 24 * 60 * 60 * 1000],
    ['procedure', 7 * 24 * 60 * 60 * 1000],
    ['stable-background', 30 * 24 * 60 * 60 * 1000],
  ] as const)('accepts exact %s freshness boundary and expires immediately after it', (volatility, maxAge) => {
    const now = Date.parse('2026-09-29T12:00:00Z')
    const retrievedAt = new Date(now - maxAge).toISOString()
    const base = input({
      now: new Date(now).toISOString(),
      claim: { ...input().claim, volatility, asOf: new Date(now).toISOString(), effectiveAt: new Date(now).toISOString() },
      sources: [{ ...source, retrievedAt }],
      review: { ...review, approvedAt: new Date(now).toISOString() },
    })
    expect(evaluateStudioClaimFreshness(base).decision).toBe('NO_ACTION')
    expect(evaluateStudioClaimFreshness({ ...base, sources: [{ ...source, retrievedAt: new Date(now - maxAge - 1).toISOString() }] }).reasonCodes).toContain('SOURCE_STALE')
  })

  it.each(['unknown', 'missing', 'partial'] as const)('abstains distinctly for %s evidence', (state) => {
    const result = evaluateStudioClaimFreshness(input({ claim: { ...input().claim, supports: [{ sourceId: source.sourceId, relation: 'supports', state }] } }))
    expect(result.decision).toBe('ABSTAIN')
    expect(result.reasonCodes).toContain(`EVIDENCE_${state.toUpperCase()}`)
  })

  it('distinguishes an absent source and requires a passage, date, jurisdiction, and accepted authority input', () => {
    expect(evaluateStudioClaimFreshness(input({ sources: [] })).reasonCodes).toContain('SOURCE_MISSING')
    expect(evaluateStudioClaimFreshness(input({ sources: [{ ...source, effectiveFrom: null }] })).reasonCodes).toContain('SOURCE_EFFECTIVE_DATE_MISMATCH')
    const result = evaluateStudioClaimFreshness(input({ sources: [{ ...source, passageLocator: null, jurisdiction: 'US-NY', effectiveFrom: null, authorityStatus: 'unverified' }] }))
    expect(result.decision).toBe('ABSTAIN')
    expect(result.reasonCodes).toEqual(expect.arrayContaining(['PASSAGE_MISSING', 'SOURCE_JURISDICTION_MISMATCH', 'SOURCE_EFFECTIVE_DATE_MISMATCH', 'SOURCE_AUTHORITY_UNVERIFIED']))
  })

  it('invalidates freshness when a supplied current source identifier differs from the decision source', () => {
    const currentSource = { ...source, sourceId: 'replacement-authority' }
    expect(currentSource.sourceId).not.toBe(source.sourceId)
    const result = evaluateStudioClaimFreshness(input({ sources: [currentSource] }))
    expect(result.decision).toBe('ABSTAIN')
    expect(result.reasonCodes).toContain('SOURCE_MISSING')
  })

  it('blocks a known contradiction on a critical claim', () => {
    const result = evaluateStudioClaimFreshness(input({ claim: { ...input().claim, supports: [
      { sourceId: source.sourceId, relation: 'supports', state: 'known' },
      { sourceId: 'other', relation: 'contradicts', state: 'known' },
    ] } }))
    expect(result.decision).toBe('BLOCK')
    expect(result.reasonCodes).toContain('CRITICAL_CONTRADICTION')
  })

  it('invalidates immediately on any supplied known source change', () => {
    const result = evaluateStudioClaimFreshness(input({ sources: [{ ...source, knownChangedAt: '2026-09-29T12:59:59Z' }] }))
    expect(result.decision).toBe('ABSTAIN')
    expect(result.reasonCodes).toContain('SOURCE_CHANGED_INVALIDATES')
  })

  it('joins optional A2 observation provenance by immutable identity', () => {
    const good = { schemaVersion: 'studio.source-observation/1' as const, observationId: source.observationId, sourceId: source.sourceId, evidenceIdentity: source.evidenceIdentity }
    expect(evaluateStudioClaimFreshness(input({ provenanceRefs: [good] })).decision).toBe('NO_ACTION')
    expect(evaluateStudioClaimFreshness(input({ provenanceRefs: [{ ...good, evidenceIdentity: 'other' }] })).reasonCodes).toContain('SOURCE_PROVENANCE_MISMATCH')
    const empty = evaluateStudioClaimFreshness(input({ provenanceRefs: [] }))
    expect(empty.decision).toBe('ABSTAIN')
    expect(empty.reasonCodes).toContain('SOURCE_PROVENANCE_MISMATCH')
  })

  it('requires a supplied identified verified human review for consequential claims; model and unknown reviewers fail closed', () => {
    const missing = evaluateStudioClaimFreshness(input({ review: null }))
    expect(missing.decision).toBe('BLOCK')
    expect(missing.reasonCodes).toContain('HUMAN_REVIEW_MISSING')
    const model = evaluateStudioClaimFreshness(input({ review: { ...review, principalKind: 'model' } }))
    expect(model.decision).toBe('BLOCK')
    expect(model.reasonCodes).toContain('REVIEWER_NOT_HUMAN')
    const unknown = evaluateStudioClaimFreshness(input({ review: { ...review, principalKind: 'unknown' } }))
    expect(unknown.decision).toBe('BLOCK')
    expect(unknown.reasonCodes).toContain('REVIEWER_NOT_HUMAN')
    const unverified = evaluateStudioClaimFreshness(input({ review: { ...review, credentialState: 'unverified' } }))
    expect(unverified.decision).toBe('BLOCK')
    expect(unverified.reasonCodes).toContain('REVIEWER_CREDENTIAL_NOT_CURRENT')
    const outOfRemit = evaluateStudioClaimFreshness(input({ review: { ...review, remit: ['unrelated-topic'] } }))
    expect(outOfRemit.decision).toBe('BLOCK')
    expect(outOfRemit.reasonCodes).toContain('REVIEWER_REMIT_MISMATCH')
  })

  it('requires exact revision, claim-set, body, render, and source-snapshot binding', () => {
    for (const key of Object.keys(binding) as (keyof typeof binding)[]) {
      const result = evaluateStudioClaimFreshness(input({ review: { ...review, binding: { ...binding, [key]: key === 'revisionVersion' ? 4 : 'changed' } } }))
      expect(result.reasonCodes).toContain('REVIEW_BINDING_MISMATCH')
    }
  })

  it('does not require YMYL review for non-consequential claims and abstains on invalid input', () => {
    expect(evaluateStudioClaimFreshness(input({ claim: { ...input().claim, consequential: false }, review: null })).decision).toBe('NO_ACTION')
    expect(evaluateStudioClaimFreshness(input({ now: 'not-a-time' })).decision).toBe('ABSTAIN')
    const invalidCalendarTime = evaluateStudioClaimFreshness(input({ now: '2026-02-30T13:00:00Z' }))
    expect(invalidCalendarTime.reasonCodes).toContain('INPUT_INVALID_OR_UNBOUNDED')
    expect(invalidCalendarTime.checkedAt).toBeNull()
    expect(evaluateStudioClaimFreshness(null as unknown as ClaimEvaluationInputV1).decision).toBe('ABSTAIN')
  })
})
