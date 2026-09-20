import {
  classifyCannibalMergeResult,
  formatCannibalEvidenceReviewNotice,
  type CannibalMergeResponseBody,
} from '@/lib/seoFactory/cannibalResolveOutcome'

const WINNER = 'https://legal.yousafeconsultancy.com/uk/dependent-visa'

function body(overrides: Partial<CannibalMergeResponseBody> = {}): CannibalMergeResponseBody {
  return { mode: 'pr', winnerUrl: WINNER, redirectsAdded: [], skipped: [], ...overrides }
}

describe('classifyCannibalMergeResult — resolved/skipped/failed contract', () => {
  it('classifies a PR-only result with redirects as resolved', () => {
    const r = classifyCannibalMergeResult({
      ok: true,
      status: 200,
      body: body({ redirectsAdded: [{ from: 'a', to: 'b' }, { from: 'c', to: 'd' }] }),
    })
    expect(r.status).toBe('resolved')
    expect(r.detail).toBe(`2 redirect(s) → ${WINNER}`)
  })

  it('appends the PR url when the executor opened a review PR', () => {
    const r = classifyCannibalMergeResult({
      ok: true,
      status: 200,
      body: body({
        redirectsAdded: [{ from: 'a', to: 'b' }],
        commits: [{ prUrl: 'https://github.com/x/pull/1', branch: 'cannibal-p4-x' }],
      }),
    })
    expect(r.status).toBe('resolved')
    expect(r.detail).toContain('PR https://github.com/x/pull/1')
  })

  it('falls back to "winner" when winnerUrl is absent', () => {
    const r = classifyCannibalMergeResult({
      ok: true,
      status: 200,
      body: { mode: 'pr', redirectsAdded: [{ from: 'a', to: 'b' }], skipped: [] },
    })
    expect(r.status).toBe('resolved')
    expect(r.detail).toBe('1 redirect(s) → winner')
  })

  it('rejects any direct/main destructive result', () => {
    const mainBranch = classifyCannibalMergeResult({
      ok: true,
      status: 200,
      body: body({ redirectsAdded: [{ from: 'a', to: 'b' }], commits: [{ branch: 'main', commitSha: 'x' }] }),
    })
    expect(mainBranch.status).toBe('failed')
    expect(mainBranch.detail).toMatch(/cannot write directly to main/)

    const mergedSha = classifyCannibalMergeResult({
      ok: true,
      status: 200,
      body: body({ redirectsAdded: [{ from: 'a', to: 'b' }], commits: [{ commitSha: 'merged-to-main' }] }),
    })
    expect(mergedSha.status).toBe('failed')

    const mergedFlag = classifyCannibalMergeResult({
      ok: true,
      status: 200,
      body: body({ redirectsAdded: [{ from: 'a', to: 'b' }], commits: [{ mergedToMain: true }] }),
    })
    expect(mergedFlag.status).toBe('failed')

    const mergeMode = classifyCannibalMergeResult({
      ok: true,
      status: 200,
      body: body({ mode: 'merge', redirectsAdded: [{ from: 'a', to: 'b' }] }),
    })
    expect(mergeMode.status).toBe('failed')
    expect(mergeMode.detail).toMatch(/cannot write directly to main/)
  })

  it('classifies zero-redirect with skipped URLs as skipped', () => {
    const r = classifyCannibalMergeResult({
      ok: true,
      status: 200,
      body: body({
        redirectsAdded: [],
        skipped: [{ url: 'a', reason: 'redirect_already_present_on_main' }, { url: 'b', reason: 'x' }],
      }),
    })
    expect(r.status).toBe('skipped')
    expect(r.detail).toBe('2 page(s) skipped — redirect_already_present_on_main')
  })

  it('treats a non-array redirectsAdded as zero (defensive)', () => {
    const r = classifyCannibalMergeResult({
      ok: true,
      status: 200,
      body: body({
        redirectsAdded: undefined as unknown as never,
        skipped: [{ url: 'a', reason: 'x' }],
      }),
    })
    expect(r.status).toBe('skipped')
  })

  it('classifies a non-ok response with body.error as failed and surfaces blockers', () => {
    const plain = classifyCannibalMergeResult({ ok: false, status: 400, body: { error: 'could not resolve competing pages' } })
    expect(plain.status).toBe('failed')
    expect(plain.detail).toBe('could not resolve competing pages')
    const blocked = classifyCannibalMergeResult({
      ok: false,
      status: 409,
      body: { error: 'blocked', blockers: ['winner_must_equal_authoritative_owner', 'rollback_snapshot_required'] },
    })
    expect(blocked.status).toBe('failed')
    expect(blocked.detail).toContain('winner_must_equal_authoritative_owner')
  })

  it('classifies a non-ok response without body.error as failed (HTTP status)', () => {
    const r = classifyCannibalMergeResult({ ok: false, status: 500, body: {} })
    expect(r.status).toBe('failed')
    expect(r.detail).toBe('HTTP 500')
  })

  it('classifies partial ledger state as needs_decision, never resolved', () => {
    const r = classifyCannibalMergeResult({
      ok: false,
      status: 409,
      body: body({
        error: 'partial state',
        needsDecision: true,
        status: 'needs_decision',
        ledgerPersisted: false,
        blockers: ['pr_opened_ledger_persistence_failed'],
        redirectsAdded: [{ from: 'a', to: 'b' }],
        commits: [{ prUrl: 'https://github.com/x/pull/9', branch: 'cannibal-p4-x' }],
      }),
    })
    expect(r.status).toBe('needs_decision')
    expect(r.detail).toContain('pr_opened_ledger_persistence_failed')
    expect(r.detail).toContain('PR https://github.com/x/pull/9')
    expect(r.detail).toMatch(/operator decision required/)
  })

  it('classifies a bare needs_decision status as needs_decision even when HTTP is ok', () => {
    const r = classifyCannibalMergeResult({
      ok: true,
      status: 200,
      body: body({ status: 'needs_decision', ledgerPersisted: false }),
    })
    expect(r.status).toBe('needs_decision')
    expect(r.detail).toMatch(/append-only decision ledger row is missing/)
    expect(r.detail).not.toMatch(/redirect\(s\)/)
  })

  it('still fails a needs-decision payload that also claims a main-branch mutation', () => {
    const r = classifyCannibalMergeResult({
      ok: false,
      status: 409,
      body: body({
        needsDecision: true,
        status: 'needs_decision',
        redirectsAdded: [{ from: 'a', to: 'b' }],
        commits: [{ branch: 'main' }],
      }),
    })
    expect(r.status).toBe('failed')
    expect(r.detail).toMatch(/cannot write directly to main/)
  })

  it('classifies an explicit no-op/skipped result as skipped, never resolved', () => {
    const r = classifyCannibalMergeResult({
      ok: true,
      status: 200,
      body: body({ status: 'skipped', noop: true, redirectsAdded: [], skipped: [], commits: [] }),
    })
    expect(r.status).toBe('skipped')
    expect(r.detail).toMatch(/No actionable cannibalization writes remain/)
  })
})

describe('Work Plan evidence-review notice (non-destructive)', () => {
  it('describes an all-recommendation-only sweep as review-only', () => {
    expect(formatCannibalEvidenceReviewNotice({ qualified: 0, recommendationOnly: 8, unavailable: 0 })).toBe(
      '⚠ Cannibal review: 8 recommendation-only — no qualified GSC overlap; no redirects, noindex or PRs were requested.',
    )
  })

  it('summarizes a mixed sweep without claiming any destructive write', () => {
    const notice = formatCannibalEvidenceReviewNotice({ qualified: 2, recommendationOnly: 3, unavailable: 1, blockers: ['uk dependent visa: no competing-page pair resolved'] })
    expect(notice).toContain('2 qualified for a decision')
    expect(notice).toContain('3 recommendation-only')
    expect(notice).toContain('1 unavailable')
    expect(notice).toContain('no destructive writes performed')
    expect(notice).toContain('uk dependent visa')
  })
})
