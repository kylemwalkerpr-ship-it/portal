/**
 * Regression guards for the jobs-queue summary builder.
 *
 * The admin command-center pills and KPIs must reflect REAL table totals
 * (the API summary), never window-derived counts. This locks the pure builder
 * the jobs route and dashboard share.
 */
import { buildJobSummary, statusTotalsFromRows, type JobSummaryInput } from '@/lib/seoFactory/jobSummary'

function input(overrides: Partial<JobSummaryInput> = {}): JobSummaryInput {
  return {
    total: 158,
    window: 100,
    statusTotals: { drafting: 0, pr_created: 0, merged: 68, failed: 80, closed: 10 },
    scored: [{ seo_score: 80 }, { seo_score: 60 }, { seo_score: null }],
    ...overrides,
  }
}

describe('buildJobSummary', () => {
  it('reports real table totals, not the fetched window', () => {
    const s = buildJobSummary(input())
    expect(s.total).toBe(158)
    expect(s.window).toBe(100)
    // The exact regression: pills must show 68 merged / 80 failed (whole
    // table), NOT the 33/41 that a 100-row window would produce.
    expect(s.merged).toBe(68)
    expect(s.failed).toBe(80)
    expect(s.drafting).toBe(0)
    expect(s.pr_created).toBe(0)
    expect(s.closed).toBe(10)
  })

  it('averages SEO score over scored rows only', () => {
    const s = buildJobSummary(input())
    expect(s.avgSeo).toBe(70) // (80 + 60) / 2 — the null row is excluded
  })

  it('returns null avgSeo when no scored rows', () => {
    const s = buildJobSummary(input({ scored: [] }))
    expect(s.avgSeo).toBeNull()
  })

  it('handles empty status totals (fresh table) without throwing', () => {
    const s = buildJobSummary(input({ statusTotals: {}, total: 0, window: 0, scored: [] }))
    expect(s).toMatchObject({
      total: 0, window: 0, drafting: 0, pr_created: 0, merged: 0, failed: 0,
      closed: 0, pending: 0, publishing: 0, avgSeo: null,
    })
  })

  it('counts unknown statuses implicitly and keeps known keys zero-safe', () => {
    const s = buildJobSummary(input({ statusTotals: { drafting: 2, pending: 1, publishing: 1, weird: 9 } }))
    expect(s.drafting).toBe(2)
    expect(s.pending).toBe(1)
    expect(s.publishing).toBe(1)
    expect(s.merged).toBe(0) // absent keys never become NaN/undefined
    expect(s.total).toBe(158) // exact count is authoritative, not statuses sum
  })

  it('counts every status from a single status-column scan', () => {
    const totals = statusTotalsFromRows([
      { status: 'merged' }, { status: 'merged' }, { status: 'pr_created' },
      { status: 'failed' }, { status: 'drafting' }, { status: 'pending' },
      { status: 'closed' },
    ])
    expect(totals.merged).toBe(2)
    expect(totals.pr_created).toBe(1)
    expect(totals.failed).toBe(1)
    expect(totals.drafting).toBe(1)
    expect(totals.pending).toBe(1)
    expect(totals.publishing).toBe(0)
  })

  it('window is the number of returned rows, independent of totals', () => {
    const s = buildJobSummary(input({ window: 100, total: 300 }))
    expect(s.window).toBe(100)
    expect(s.total).toBe(300)
  })
})
