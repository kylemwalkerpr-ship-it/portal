/**
 * Studio GSC junk boundary + in-flight cannibal collapse.
 *
 * Pacific housing PDFs and brand `yousafe` rows must never reach a GSC table.
 * Identical Canada Spousal Sponsorship Drafting jobs must not mint another GAP.
 */
import {
  dropJunkGscRows,
  loadPersistedGscWindow,
  queriesFromPersistedGscRows,
} from '@/lib/seoFactory/gscRows'
import { collapseOpportunityAgainstJobs } from '@/lib/seoFactory/cannibalDetect'
import { scoreOpportunities } from '@/lib/seoFactory/opportunityEngine'
import { verdictFor } from '@/lib/seoEngine/authorityPlaybook'

const PACIFIC_PDF =
  '"2026-2027 stockton room and meal plan rates final.pdf" pacific.edu/sites/default/files/users/user2983'
const PACIFIC_HOUSING_PDF = 'university of the pacific housing rates final.pdf'
const YOUSAFE_BRAND = 'yousafe'
const VISA_QUERY = 'canada spousal sponsorship'

function thenable(result: { data: unknown; error: { message: string } | null }) {
  const api: {
    select: () => typeof api
    eq: () => typeof api
    order: () => typeof api
    limit: () => typeof api
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise<unknown>
  } = {
    select: () => api,
    eq: () => api,
    order: () => api,
    limit: () => api,
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  }
  return api
}

function dbSequence(results: Array<{ data: unknown; error: { message: string } | null }>) {
  let i = 0
  return {
    from: (_table: string) => thenable(results[Math.min(i++, results.length - 1)]),
  }
}

describe('GSC read boundary — junk never surfaces', () => {
  const mixedRows = [
    { query: PACIFIC_PDF, page: 'https://example.com/pdf', impressions: 900, clicks: 0, ctr: 0, position: 3 },
    { query: PACIFIC_HOUSING_PDF, page: 'https://example.com/housing.pdf', impressions: 80, clicks: 0, ctr: 0, position: 4 },
    { query: YOUSAFE_BRAND, page: 'https://yousafeconsultancy.com/', impressions: 220, clicks: 40, ctr: 0.18, position: 1 },
    {
      query: VISA_QUERY,
      page: 'https://legal.yousafeconsultancy.com/ca/spousal-sponsorship/',
      impressions: 140,
      clicks: 4,
      ctr: 0.028,
      position: 18,
    },
  ]

  it('filters the Pacific PDF query', () => {
    const kept = dropJunkGscRows(mixedRows).map((r) => r.query)
    expect(kept).not.toContain(PACIFIC_PDF)
    expect(kept).not.toContain(PACIFIC_HOUSING_PDF)
    expect(queriesFromPersistedGscRows(mixedRows).map((q) => q.term)).not.toContain(
      PACIFIC_PDF.toLowerCase(),
    )
  })

  it('filters the yousafe brand query', () => {
    const kept = dropJunkGscRows(mixedRows).map((r) => r.query)
    expect(kept).not.toContain(YOUSAFE_BRAND)
    expect(queriesFromPersistedGscRows(mixedRows).every((q) => !/\byousafe\b/i.test(q.term))).toBe(true)
  })

  it('keeps an eligible visa query', () => {
    const kept = dropJunkGscRows(mixedRows).map((r) => r.query)
    expect(kept).toContain(VISA_QUERY)
    expect(queriesFromPersistedGscRows(mixedRows).some((q) => q.term === VISA_QUERY)).toBe(true)
  })

  it('loadPersistedGscWindow over-fetches then returns only eligible rows up to limit', async () => {
    const db = dbSequence([{ data: mixedRows, error: null }])
    const out = await loadPersistedGscWindow(db, {
      siteUrl: null,
      startDate: '2026-06-09',
      endDate: '2026-09-06',
      limit: 2,
    })
    expect(out.rows).toHaveLength(1)
    expect(out.rowCount).toBe(1)
    expect(out.rows[0].query).toBe(VISA_QUERY)
    expect(out.rows.every((r) => !/pdf|yousafe|meal plan/i.test(String(r.query || '')))).toBe(true)
  })
})

describe('in-flight jobs collapse GAP cards', () => {
  const spousalJob = {
    title: 'Canada Spousal Sponsorship',
    h1: 'Canada Spousal Sponsorship: 2026 Guide',
    slug: 'canada-spousal-sponsorship',
    status: 'Drafting',
  }
  const unrelatedJob = {
    title: 'UK Graduate Route visa',
    h1: 'UK Graduate Route',
    slug: 'uk-graduate-route',
    status: 'drafting',
  }

  it('spousal in-flight job is not a GAP', () => {
    expect(collapseOpportunityAgainstJobs('Canada Spousal Sponsorship', [spousalJob])).not.toBe('gap')
    expect(collapseOpportunityAgainstJobs('Canada Spousal Sponsorship', [spousalJob])).toBe('refresh')

    const sixCopies = Array.from({ length: 6 }, () => ({ ...spousalJob }))
    expect(collapseOpportunityAgainstJobs('Canada Spousal Sponsorship', sixCopies)).toBe('hide')

    const scored = scoreOpportunities({
      queries: [{ term: 'canada spousal sponsorship', impressions: 400, clicks: 5, ctr: 0.012, position: 40 }],
      jobs: sixCopies,
      limit: 10,
    })
    expect(scored.opportunities.every((o) => o.play !== 'content_gap')).toBe(true)
    expect(scored.opportunities.some((o) => /spousal/i.test(o.topic) && o.play === 'content_gap')).toBe(false)
  })

  it('two unrelated titles still GAP', () => {
    expect(collapseOpportunityAgainstJobs('Canada Spousal Sponsorship', [unrelatedJob])).toBe('gap')

    const scored = scoreOpportunities({
      queries: [{ term: 'canada spousal sponsorship', impressions: 400, clicks: 5, ctr: 0.012, position: 40 }],
      jobs: [unrelatedJob],
      limit: 10,
    })
    const spousal = scored.opportunities.find((o) => /spousal/i.test(o.topic))
    expect(spousal).toBeDefined()
    expect(spousal!.play).toBe('content_gap')
  })
})

describe('fill-spoke whyLine names the topic', () => {
  it('includes the actual topic so FILL SPOKE cards are not identical', () => {
    const a = verdictFor({
      topic: 'marriage green card timeline',
      play: 'content_gap',
      coverageKind: 'spoke',
      intent: 'commercial',
    })
    const b = verdictFor({
      topic: 'express entry canada calculator',
      play: 'content_gap',
      coverageKind: 'spoke',
      intent: 'commercial',
    })
    expect(a.move).toBe('fill_spoke')
    expect(b.move).toBe('fill_spoke')
    expect(a.whyLine).toMatch(/marriage green card timeline/i)
    expect(b.whyLine).toMatch(/express entry canada calculator/i)
    expect(a.whyLine).not.toBe(b.whyLine)
  })
})
