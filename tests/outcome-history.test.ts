/**
 * outcome-history.test.ts
 *
 * Locks the pure correlation that turns stored engine reports + live GSC page
 * positions into HistoricalOutcome[] for masterEngineLearn. No DB/network —
 * just the deterministic merge logic.
 */
import {
  buildOutcomeHistory,
  normPathname,
  type OutcomeJobRow,
  type GscPageRow,
} from '@/lib/seoFactory/outcomeHistory'

const report = (intent: string, scores: Record<string, number | null>) => ({
  intent,
  subsystems: Object.fromEntries(
    Object.entries(scores).map(([s, score]) => [s, { score, coverage: 0.5 }]),
  ),
})

const job = (over: Partial<OutcomeJobRow>): OutcomeJobRow => ({
  id: 'j1',
  primary_keyword: 'uk graduate visa',
  canonical_url: 'https://legal.yousafeconsultancy.com/uk/graduate-visa/',
  master_engine_json: report('procedural', { content: 0.74, eeat: 0.7 }),
  updated_at: '2026-08-01T00:00:00Z',
  ...over,
})

const page = (over: Partial<GscPageRow>): GscPageRow => ({
  url: 'https://legal.yousafeconsultancy.com/uk/graduate-visa/',
  clicks: 10,
  impressions: 300,
  ctr: 0.033,
  position: 8.2,
  ...over,
})

describe('normPathname', () => {
  it('normalizes host + pathname and trims trailing slash', () => {
    expect(normPathname('https://Legal.YouSafeConsultancy.com/uk/graduate-visa/')).toBe(
      'legal.yousafeconsultancy.com/uk/graduate-visa',
    )
  })
  it('falls back to a lowercase trimmed string for malformed URLs', () => {
    expect(normPathname('Foo/Bar/')).toBe('foo/bar')
  })
})

describe('buildOutcomeHistory', () => {
  it('correlates a job with its GSC page and marks top10 from position', () => {
    const history = buildOutcomeHistory(
      [job({})],
      [page({ position: 8.2, clicks: 10, impressions: 300 })],
    )
    expect(history).toHaveLength(1)
    const h = history[0]
    expect(h.intent).toBe('procedural')
    expect(h.subsystemScores.content).toBeCloseTo(0.74)
    expect(h.subsystemScores.eeat).toBeCloseTo(0.7)
    expect(h.subsystemScores.intent).toBeUndefined()
    expect(h.outcome.top10).toBe(true)
    expect(h.outcome.position).toBe(8.2)
    expect(h.outcome.clicks).toBe(10)
    expect(h.outcome.impressions).toBe(300)
  })

  it('marks top10 false when the page sits below position 10', () => {
    const history = buildOutcomeHistory(
      [job({})],
      [page({ position: 13.6 })],
    )
    expect(history).toHaveLength(1)
    expect(history[0].outcome.top10).toBe(false)
    expect(history[0].outcome.position).toBe(13.6)
  })

  it('skips jobs whose report has no valid intent', () => {
    const history = buildOutcomeHistory(
      [job({ master_engine_json: report('not-an-intent', { content: 0.5 }) })],
      [page({})],
    )
    expect(history).toHaveLength(0)
  })

  it('skips reports with no numeric subsystem scores', () => {
    const history = buildOutcomeHistory(
      [job({ master_engine_json: report('procedural', { content: null, eeat: null }) })],
      [page({})],
    )
    expect(history).toHaveLength(0)
  })

  it('dedupes by canonical URL — refreshed jobs do not double-count', () => {
    const history = buildOutcomeHistory(
      [job({}), job({ id: 'j2', updated_at: '2026-07-01T00:00:00Z' })],
      [page({})],
    )
    expect(history).toHaveLength(1)
  })

  it('ignores GSC pages with position 0 (not ranking)', () => {
    const history = buildOutcomeHistory([job({})], [page({ position: 0 })])
    expect(history).toHaveLength(0)
  })

  it('honors minImpressions on the GSC page', () => {
    const history = buildOutcomeHistory(
      [job({})],
      [page({ impressions: 1 })],
      { minImpressions: 2 },
    )
    expect(history).toHaveLength(0)
  })

  it('falls back to the trailing-path match when the exact URL is absent', () => {
    const history = buildOutcomeHistory(
      [job({ canonical_url: 'https://legal.yousafeconsultancy.com/uk/graduate-visa/' })],
      [page({ url: 'https://www.yousafeconsultancy.com/uk/graduate-visa' })],
    )
    expect(history).toHaveLength(1)
    expect(history[0].intent).toBe('procedural')
  })
})
