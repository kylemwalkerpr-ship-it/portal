/**
 * P1 — planner filters are inclusion constraints, never relabelling.
 *
 * A UK-explicit query must not become a US mission under a US filter; visa-only
 * demand must not become a housing mission under a housing filter; matching or
 * unfiltered demand keeps its metrics + ranking; and voluntarily-empty filtered
 * results stay empty (no synthetic demand).
 */
import { runPlanner, bestCellForTerm, type GscSignalInput } from '@/lib/seoEngine/planner'

jest.mock('@/lib/seoEngine/interlink', () => ({
  persistPlannerInterlinks: jest.fn(async () => undefined),
}))

jest.mock('@/lib/supabase', () => {
  const thenable = {
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(resolve({ data: null, error: null, count: 0 })),
    catch: () => Promise.resolve({ data: null, error: null, count: 0 }),
  }
  const chain = (): unknown =>
    new Proxy(thenable, {
      get(target, prop) {
        if (prop === 'then' || prop === 'catch') return target[prop as 'then' | 'catch']
        return () => chain()
      },
    })
  return {
    createSupabaseAdminClient: () => ({ from: () => chain() }),
  }
})

function gsc(term: string, impressions: number, position: number, clicks = 0): GscSignalInput {
  return { term, impressions, position, clicks, ctr: impressions ? clicks / impressions : 0, source: 'gsc' }
}

describe('planner filter inclusion constraints', () => {
  it('never turns an explicit-UK query into a US mission under a US filter', async () => {
    const mix = [
      gsc('uk spouse visa document checklist', 3100, 12, 40),
      gsc('f-1 visa interview questions', 8000, 6, 200),
    ]
    expect(bestCellForTerm('uk spouse visa document checklist').country).toBe('UK')
    const { plans } = await runPlanner({
      signals: mix,
      knowledge: [],
      draftBriefs: false,
      limit: 8,
      country: 'US',
    })
    expect(plans.length).toBeGreaterThan(0)
    expect(plans.every((p) => p.country === 'US')).toBe(true)
    expect(plans.some((p) => /spouse|uk/i.test(p.primaryTerm))).toBe(false)
    expect(plans.some((p) => /f-1/i.test(p.primaryTerm))).toBe(true)
  })

  it('never relabels visa-only demand into a housing mission under a housing filter', async () => {
    const mix = [
      gsc('uk spouse visa document checklist', 3100, 12, 40),
      gsc('stockton student housing rates 2026', 1400, 44, 12),
    ]
    expect(bestCellForTerm('stockton student housing rates 2026').stage).toBe('housing')
    const { plans } = await runPlanner({
      signals: mix,
      knowledge: [],
      draftBriefs: false,
      limit: 8,
      stage: 'housing',
    })
    expect(plans.length).toBeGreaterThan(0)
    expect(plans.every((p) => p.stage === 'housing')).toBe(true)
    expect(plans.some((p) => /spouse|visa/i.test(p.primaryTerm))).toBe(false)
    expect(plans.some((p) => /housing/i.test(p.primaryTerm))).toBe(true)
  })

  it('keeps metrics + ranking for matching/unfiltered demand', async () => {
    const mix = [
      gsc('f-1 visa interview questions', 9000, 5, 300),
      gsc('opt stem unemployment cap', 2600, 14, 30),
    ]
    const { plans } = await runPlanner({ signals: mix, knowledge: [], draftBriefs: false, limit: 5 })
    const f1 = plans.find((p) => /f-1/i.test(p.primaryTerm))
    expect(f1).toBeTruthy()
    // GSC window ÷ 3 is the honest monthly third — metrics survive the filter.
    expect(f1!.estMonthlyImpressions).toBe(Math.round(9000 / 3))
    expect(f1!.estMonthlyClicks).toBe(Math.round(300 / 3))
    expect(f1!.opportunityScore).toBeGreaterThan(0)
    // Ranked by opportunity score descending.
    expect(plans[0].opportunityScore).toBeGreaterThanOrEqual(plans[plans.length - 1].opportunityScore)
  })

  it('keeps empty filtered results empty — no synthetic demand', async () => {
    const mix = [gsc('uk graduate visa requirements', 4200, 8, 90)]
    const { plans } = await runPlanner({
      signals: mix,
      knowledge: [],
      draftBriefs: false,
      limit: 8,
      country: 'US',
    })
    expect(plans).toHaveLength(0)
  })
})