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

  it('uses a closed volatility enum and always returns a finite age or null', () => {
    for (const volatility of ['toString', 'constructor', '__proto__', 'valueOf', 'unknown', 1, null, {}, []]) {
      const result = evaluateStudioClaimFreshness(input({ claim: { ...input().claim, volatility } as any }))
      expect(result.decision).toBe('ABSTAIN')
      expect(result.freshnessMaxAgeMs).toBeNull()
      expect(result.reasonCodes).toContain('INPUT_INVALID_OR_UNBOUNDED')
    }
    for (const volatility of ['mutable-rule', 'procedure', 'stable-background'] as const) {
      expect(Number.isFinite(evaluateStudioClaimFreshness(input({ claim: { ...input().claim, volatility } })).freshnessMaxAgeMs)).toBe(true)
    }
  })

  it('rejects malformed source, support, provenance, claim and binding identities at runtime', () => {
    const cases: Array<Partial<ClaimEvaluationInputV1>> = [
      { claim: { ...input().claim, claimId: 123 } as any },
      { claim: { ...input().claim, jurisdiction: '   ' } as any },
      { claim: { ...input().claim, remitKey: 'x'.repeat(257) } as any },
      { claim: { ...input().claim, supports: [{ sourceId: 123, relation: 'supports', state: 'unknown' }] } as any },
      { sources: [{ ...source, sourceId: 123 } as any] },
      { sources: [{ ...source, observationId: 123 } as any] },
      { sources: [{ ...source, evidenceIdentity: 456 } as any] },
      { sources: [{ ...source, evidenceIdentity: 'x'.repeat(1_000_000) }] },
      { sources: [source, { ...source, sourceId: 'unused-source', observationId: 123 } as any] },
      { sources: [{ ...source, sourceId: '   ' }] },
      { sources: [{ ...source, passageLocator: 42 } as any] },
      { provenanceRefs: [{ schemaVersion: 'studio.source-observation/1', observationId: 'used', sourceId: 'source', evidenceIdentity: 42 } as any] },
    ]
    for (const patch of cases) {
      const result = evaluateStudioClaimFreshness(input(patch))
      expect(result.decision).toBe('ABSTAIN')
      expect(result.freshnessMaxAgeMs === null || Number.isFinite(result.freshnessMaxAgeMs)).toBe(true)
    }
    const malformedUnusedProvenance = evaluateStudioClaimFreshness(input({ provenanceRefs: [
      { schemaVersion: 'wrong', observationId: 'unused', sourceId: 'unused', evidenceIdentity: 'unused' } as any,
    ] }))
    expect(malformedUnusedProvenance.decision).toBe('ABSTAIN')
    const malformedExpectedBinding = evaluateStudioClaimFreshness(input({ expectedBinding: { ...binding, bodyHash: false } as any }))
    expect(malformedExpectedBinding.decision).toBe('BLOCK')
    expect(malformedExpectedBinding.reasonCodes).toContain('REVIEW_BINDING_MISMATCH')
    const malformedReviewerAlongsideInvalidClaim = evaluateStudioClaimFreshness(input({
      claim: { ...input().claim, claimId: 123 } as any,
      review: { ...review, principalId: 123 } as any,
    }))
    expect(malformedReviewerAlongsideInvalidClaim.decision).toBe('BLOCK')
    expect(malformedReviewerAlongsideInvalidClaim.reasonCodes).toContain('REVIEWER_IDENTITY_MISSING')
  })

  it('keeps malformed consequential reviewer identities, remit scalars and bindings consequential', () => {
    for (const patch of [
      { principalId: 123 }, { reviewerId: false }, { principalId: ' ' }, { reviewerId: 'r'.repeat(257) },
      { jurisdiction: 42 }, { remit: ['valid', 123] }, { remit: ['r'.repeat(257)] },
      { binding: { ...binding, revisionId: {} } },
      { binding: { ...binding, revisionVersion: Number.MAX_SAFE_INTEGER + 1 } },
    ]) {
      const result = evaluateStudioClaimFreshness(input({ review: { ...review, ...patch } as any }))
      expect(result.decision).toBe('BLOCK')
      expect(result.reasonCodes.some((reason) => reason.startsWith('REVIEWER_') || reason === 'REVIEW_BINDING_MISMATCH')).toBe(true)
    }
    const throwingReview = { ...review, principalKind: 'model' as const }
    Object.defineProperty(throwingReview, 'principalId', { get() { throw new Error('unexpected accessor') } })
    const caughtAfterHardGate = evaluateStudioClaimFreshness(input({ review: throwingReview as any }))
    expect(caughtAfterHardGate.decision).toBe('BLOCK')
    expect(caughtAfterHardGate.reasonCodes).toContain('REVIEWER_NOT_HUMAN')
  })

  it('prioritizes intrinsic reviewer date failures over an invalid evaluation clock', () => {
    const invalidClock = 'not-a-time'
    const cases = [
      { review: { ...review, validFrom: 'not-a-date' } },
      { review: { ...review, approvedAt: 'not-a-date' } },
      { review: { ...review, validTo: '2026-02-30T00:00:00Z' } },
      { review: { ...review, validFrom: '2026-10-01T00:00:00Z', validTo: '2026-09-01T00:00:00Z' } },
    ]
    for (const patch of cases) {
      const result = evaluateStudioClaimFreshness(input({ now: invalidClock, ...patch }))
      expect(result.decision).toBe('BLOCK')
      expect(result.reasonCodes).toContain('INPUT_INVALID_OR_UNBOUNDED')
      expect(result.reasonCodes.some((code) => code === 'REVIEWER_VALIDITY_INVALID' || code === 'REVIEW_APPROVAL_TIME_INVALID')).toBe(true)
    }
    expect(evaluateStudioClaimFreshness(input({ now: invalidClock })).decision).toBe('ABSTAIN')
  })

  it('preserves independently known reviewer jurisdiction and remit mismatches', () => {
    const badClaimRemit = evaluateStudioClaimFreshness(input({
      claim: { ...input().claim, remitKey: '' },
      review: { ...review, jurisdiction: 'US-NY', remit: ['unrelated-topic'] },
    }))
    expect(badClaimRemit.decision).toBe('BLOCK')
    expect(badClaimRemit.reasonCodes).toContain('REVIEWER_REMIT_MISMATCH')

    const badClaimJurisdiction = evaluateStudioClaimFreshness(input({
      claim: { ...input().claim, jurisdiction: '' },
      review: { ...review, jurisdiction: 'US-CA', remit: ['unrelated-topic'] },
    }))
    expect(badClaimJurisdiction.decision).toBe('BLOCK')
    expect(badClaimJurisdiction.reasonCodes).toContain('REVIEWER_REMIT_MISMATCH')
  })

  it('keeps hard review and critical contradiction gates across malformed bounded collections', () => {
    const critical = { ...input().claim, supports: [null, { sourceId: 'other', relation: 'contradicts', state: 'known' }] }
    const malformedSourcesMissingReview = evaluateStudioClaimFreshness(input({ review: null, sources: Array(1) as any }))
    expect(malformedSourcesMissingReview.decision).toBe('BLOCK')
    expect(malformedSourcesMissingReview.reasonCodes).toContain('HUMAN_REVIEW_MISSING')

    const sparseSupports = evaluateStudioClaimFreshness(input({ review: null, claim: { ...input().claim, supports: Object.assign(Array(2), { 1: critical.supports[1] }) } as any }))
    expect(sparseSupports.decision).toBe('BLOCK')
    expect(sparseSupports.reasonCodes).toEqual(expect.arrayContaining(['INPUT_INVALID_OR_UNBOUNDED', 'HUMAN_REVIEW_MISSING', 'CRITICAL_CONTRADICTION']))

    const sparseSupportJson = JSON.parse(JSON.stringify({ ...input().claim, supports: Array(1) }))
    const nullSupportJson = evaluateStudioClaimFreshness(input({ review: null, claim: { ...input().claim, supports: sparseSupportJson.supports } as any }))
    expect(nullSupportJson.decision).toBe('BLOCK')
    expect(nullSupportJson.reasonCodes).toContain('HUMAN_REVIEW_MISSING')

    for (const sources of [[null], JSON.parse(JSON.stringify(Array(1)))]) {
      const result = evaluateStudioClaimFreshness(input({ review: null, sources: sources as any }))
      expect(result.decision).toBe('BLOCK')
      expect(result.reasonCodes).toContain('HUMAN_REVIEW_MISSING')
    }

    for (const remit of [Array(1), [null], JSON.parse(JSON.stringify(Array(1)))]) {
      const result = evaluateStudioClaimFreshness(input({ review: { ...review, remit } as any }))
      expect(result.decision).toBe('BLOCK')
      expect(result.reasonCodes).toContain('REVIEWER_REMIT_MISMATCH')
    }
  })

  it('rejects oversized raw padded labels before normalization work', () => {
    const padded = `${' '.repeat(2_097_152)}id`
    const result = evaluateStudioClaimFreshness(input({ sources: [{ ...source, evidenceIdentity: padded }] }))
    expect(result.decision).toBe('ABSTAIN')
    expect(result.reasonCodes).toContain('INPUT_INVALID_OR_UNBOUNDED')
  })

  it('accepts 256-code-unit opaque labels and rejects 257 across identity and locator fields', () => {
    const label = 'x'.repeat(256)
    const longBinding = { revisionId: label, revisionVersion: 1, claimSetHash: label, bodyHash: label, renderHash: label, sourceSnapshotHash: label }
    const valid = input({
      claim: { ...input().claim, claimId: label, jurisdiction: label, remitKey: label, supports: [{ sourceId: label, relation: 'supports', state: 'known' }] },
      sources: [{ ...source, sourceId: label, observationId: label, evidenceIdentity: label, passageLocator: label, jurisdiction: label }],
      review: { ...review, principalId: label, reviewerId: label, jurisdiction: label, remit: [label], binding: longBinding },
      expectedBinding: longBinding,
      provenanceRefs: [{ schemaVersion: 'studio.source-observation/1', observationId: label, sourceId: label, evidenceIdentity: label }],
    })
    expect(evaluateStudioClaimFreshness(valid).decision).toBe('NO_ACTION')
    const tooLong = 'x'.repeat(257)
    const invalidInputs: Array<Partial<ClaimEvaluationInputV1>> = [
      { claim: { ...input().claim, claimId: tooLong } as any },
      { claim: { ...input().claim, jurisdiction: tooLong } as any },
      { claim: { ...input().claim, remitKey: tooLong } as any },
      { claim: { ...input().claim, supports: [{ sourceId: tooLong, relation: 'supports', state: 'known' }] } },
      { sources: [{ ...source, sourceId: tooLong }] }, { sources: [{ ...source, observationId: tooLong }] },
      { sources: [{ ...source, evidenceIdentity: tooLong }] }, { sources: [{ ...source, passageLocator: tooLong }] },
      { sources: [{ ...source, jurisdiction: tooLong }] },
      { provenanceRefs: [{ schemaVersion: 'studio.source-observation/1', observationId: tooLong, sourceId: 's', evidenceIdentity: 'e' }] },
      { expectedBinding: { ...binding, revisionId: tooLong } }, { expectedBinding: { ...binding, bodyHash: tooLong } },
      { expectedBinding: { ...binding, claimSetHash: tooLong } }, { expectedBinding: { ...binding, renderHash: tooLong } },
      { expectedBinding: { ...binding, sourceSnapshotHash: tooLong } },
      { review: { ...review, principalId: tooLong } }, { review: { ...review, reviewerId: tooLong } },
      { review: { ...review, jurisdiction: tooLong } }, { review: { ...review, remit: [tooLong] } },
    ]
    for (const patch of invalidInputs) expect(evaluateStudioClaimFreshness(input(patch)).decision).not.toBe('NO_ACTION')
  })

  it('bounds timestamps before parsing and rejects impossible dates and unsafe revisions', () => {
    const maxTimestamp = `2026-09-29T13:00:00.${'1'.repeat(43)}Z`
    expect(maxTimestamp.length).toBe(64)
    expect(evaluateStudioClaimFreshness(input({ now: maxTimestamp })).decision).toBe('NO_ACTION')
    for (const now of ['x'.repeat(65), '2026-02-30T13:00:00Z', '2026-09-29T13:00:00.123456789012345678901234567890123456789012345678901234567890123456789Z']) {
      const result = evaluateStudioClaimFreshness(input({ now }))
      expect(result.decision).toBe('ABSTAIN')
      expect(result.checkedAt).toBeNull()
    }
    for (const revisionVersion of [1.5, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN]) {
      const result = evaluateStudioClaimFreshness(input({ expectedBinding: { ...binding, revisionVersion } as any }))
      expect(result.decision).toBe('BLOCK')
      expect(result.reasonCodes).toContain('REVIEW_BINDING_MISMATCH')
    }
  })
})
