import {
  classifyCannibalMergeResult,
  formatCannibalSweepNotice,
  type CannibalMergeResponseBody,
} from '@/lib/seoFactory/cannibalResolveOutcome'

const WINNER = 'https://legal.yousafeconsultancy.com/uk/dependent-visa'

function body(overrides: Partial<CannibalMergeResponseBody> = {}): CannibalMergeResponseBody {
  return { winnerUrl: WINNER, redirectsAdded: [], skipped: [], ...overrides }
}

describe('classifyCannibalMergeResult — resolved/skipped/failed contract', () => {
  it('classifies a successful merge with redirects as resolved', () => {
    const r = classifyCannibalMergeResult({
      ok: true,
      status: 200,
      body: body({
        redirectsAdded: [{ from: 'a', to: 'b' }, { from: 'c', to: 'd' }],
      }),
    })
    expect(r.status).toBe('resolved')
    expect(r.detail).toBe(`2 redirect(s) → ${WINNER}`)
  })

  it('appends the PR url when the merge opened a pull request', () => {
    const r = classifyCannibalMergeResult({
      ok: true,
      status: 200,
      body: body({
        redirectsAdded: [{ from: 'a', to: 'b' }],
        commits: [{ prUrl: 'https://github.com/x/pull/1' }],
      }),
    })
    expect(r.status).toBe('resolved')
    expect(r.detail).toContain('PR https://github.com/x/pull/1')
  })

  it('falls back to "winner" when winnerUrl is absent', () => {
    const r = classifyCannibalMergeResult({
      ok: true,
      status: 200,
      body: { redirectsAdded: [{ from: 'a', to: 'b' }], skipped: [] },
    })
    expect(r.status).toBe('resolved')
    expect(r.detail).toBe('1 redirect(s) → winner')
  })

  it('classifies zero-redirect with skipped URLs as skipped', () => {
    const r = classifyCannibalMergeResult({
      ok: true,
      status: 200,
      body: body({
        redirectsAdded: [],
        skipped: [{ url: 'a', reason: 'no redirect convention' }, { url: 'b', reason: 'unknown host' }],
      }),
    })
    expect(r.status).toBe('skipped')
    expect(r.detail).toBe('2 page(s) skipped — no redirect convention')
  })

  it('surfaces the skipped reason for a no-competing-pages cluster', () => {
    const r = classifyCannibalMergeResult({
      ok: true,
      status: 200,
      body: body({
        redirectsAdded: [],
        skipped: [{ url: '', reason: 'no competing pages resolvable — not a real cluster' }],
      }),
    })
    expect(r.status).toBe('skipped')
    expect(r.detail).toContain('no competing pages resolvable')
  })

  it('treats a non-array redirectsAdded as zero (defensive)', () => {
    const r = classifyCannibalMergeResult({
      ok: true,
      status: 200,
      body: body({ redirectsAdded: undefined as unknown as never, skipped: [{ url: 'a', reason: 'x' }] }),
    })
    expect(r.status).toBe('skipped')
  })

  it('classifies a non-ok response with body.error as failed', () => {
    const r = classifyCannibalMergeResult({
      ok: false,
      status: 400,
      body: { error: 'could not resolve competing pages' },
    })
    expect(r.status).toBe('failed')
    expect(r.detail).toBe('could not resolve competing pages')
  })

  it('classifies a non-ok response without body.error as failed (HTTP status)', () => {
    const r = classifyCannibalMergeResult({ ok: false, status: 500, body: {} })
    expect(r.status).toBe('failed')
    expect(r.detail).toBe('HTTP 500')
  })

  it('describes an all-skipped sweep as cleared, not unresolved', () => {
    expect(formatCannibalSweepNotice({ resolved: 0, skipped: 8, failed: 0 })).toBe(
      '⚠ Cannibal sweep: 8 cleared — no mergeable estate URLs (GSC noise or title-only overlap).',
    )
  })

  it('classifies ok with zero redirects and zero skipped as resolved', () => {
    // No redirects produced but the API reported ok → resolved (winner only).
    const r = classifyCannibalMergeResult({ ok: true, status: 200, body: body() })
    expect(r.status).toBe('resolved')
    expect(r.detail).toBe(`0 redirect(s) → ${WINNER}`)
  })
})
