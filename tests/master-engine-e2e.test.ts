/**
 * End-to-end Master Engine contract:
 *   1. scoreMaster on two real pages must not emit the same opportunity set.
 *   2. runPlanner on two GSC demand mixes must rank different unique clusters
 *      (country+stage in the id so US/UK cannot overwrite each other).
 *
 * No live GSC / Clerk / GitHub. Supabase persist is stubbed.
 */
import { scoreMaster, type MasterEngineInput } from '@/lib/seoFactory/masterEngine'
import {
  plannerClusterId,
  normalizePlannerTopic,
  runPlanner,
  bestCellForTerm,
  MIN_CELL_MATCH_SCORE,
  type GscSignalInput,
} from '@/lib/seoEngine/planner'
import { isJunkQuery } from '@/lib/seoFactory/queryNoise'

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

const UK_GRADUATE = `---
title: "UK Graduate Visa Requirements: Eligibility, Costs and Steps"
description: "Complete 2026 guide to the UK Graduate Route visa — eligibility, cost, documents and how to apply step by step, with official sources."
---
# UK Graduate Visa Requirements

## In 60 seconds
The UK Graduate Route lets international students stay for 2 years after an eligible course.

## Eligibility requirements
To apply for the uk graduate visa you must have completed an eligible UK degree.

## How to apply step by step
1. Complete your course.
2. Check UKVI eligibility at [GOV.UK](https://www.gov.uk/graduate-visa).
3. Submit the online application.

## Documents required
Passport, BRP, CAS number, and proof of completion.

## FAQ
### Can I work on the Graduate Route?
Yes, you can work in most roles.

### How long does it take?
Most applications take 8 weeks.

## Official sources
See [GOV.UK Graduate visa](https://www.gov.uk/graduate-visa).

---
This guide is educational and does not constitute legal advice.
`

const THIN_F1 = `# F-1 visa
A student visa. Delve into the complexities. Guaranteed approval if you apply with us.
`

const HOUSING = `---
title: "Stockton student housing rates 2026"
description: "FY27 housing and meal plan rates for University of the Pacific Stockton students."
---
# Stockton student housing rates 2026

## In 60 seconds
Pacific publishes FY27 room and meal-plan rates for the Stockton campus.

## Rate table
Standard double rooms are listed on the university housing page.

## How to apply for housing
Apply through the campus housing portal before the deadline.

## Meal plans
Meal plans are billed per semester.

## FAQ
### Are rates guaranteed?
FY27 published rates are guaranteed for the academic year.

### Where do I verify?
See the university housing office.

## Official sources
[University of the Pacific housing](https://www.pacific.edu/).
`

function recCodes(input: MasterEngineInput): string[] {
  return scoreMaster(input)
    .recommendations.filter((r) => r.open)
    .map((r) => r.code)
}

function gsc(term: string, impressions: number, position: number, clicks = 0): GscSignalInput {
  return { term, impressions, position, clicks, ctr: impressions ? clicks / impressions : 0 }
}

describe('Master Engine e2e — unique opportunities from real page scoring', () => {
  it('a complete UK graduate guide and a thin F-1 stub do not share an opportunity set', () => {
    const graduate = recCodes({
      topic: 'uk graduate visa requirements',
      primaryKeyword: 'uk graduate visa',
      contentType: 'legal_guide',
      region: 'UK',
      title: 'UK Graduate Visa Requirements',
      content: UK_GRADUATE,
      indexable: true,
    })
    const f1 = recCodes({
      topic: 'f-1 visa',
      primaryKeyword: 'f-1 visa',
      contentType: 'legal_guide',
      region: 'US',
      title: 'F-1 visa',
      content: THIN_F1,
      indexable: true,
    })
    const graduateRisks = scoreMaster({
      topic: 'uk graduate visa requirements',
      primaryKeyword: 'uk graduate visa',
      contentType: 'legal_guide',
      region: 'UK',
      title: 'UK Graduate Visa Requirements',
      content: UK_GRADUATE,
      indexable: true,
    }).risks.map((r) => r.code)
    const f1Full = scoreMaster({
      topic: 'f-1 visa',
      primaryKeyword: 'f-1 visa',
      contentType: 'legal_guide',
      region: 'US',
      title: 'F-1 visa',
      content: THIN_F1,
      indexable: true,
    })
    expect(graduate.length).toBeGreaterThan(0)
    expect(f1.length).toBeGreaterThan(0)
    expect([...graduate].sort().join('|')).not.toBe([...f1].sort().join('|'))
    expect(f1).toContain('ymyl_disclaimer')
    expect(f1Full.risks.map((r) => r.code)).toContain('thin_content')
    expect(graduate).not.toContain('outcome_promise')
    expect(graduateRisks).not.toContain('outcome_promise')
  })

  it('a housing page and a visa page produce different top opportunities', () => {
    const housing = recCodes({
      topic: 'stockton student housing rates',
      primaryKeyword: 'stockton housing rates',
      contentType: 'article',
      region: 'US',
      title: 'Stockton student housing rates 2026',
      content: HOUSING,
      indexable: true,
    })
    const visa = recCodes({
      topic: 'uk graduate visa requirements',
      primaryKeyword: 'uk graduate visa',
      contentType: 'legal_guide',
      region: 'UK',
      title: 'UK Graduate Visa Requirements',
      content: UK_GRADUATE,
      indexable: true,
    })
    expect([...housing].sort().join('|')).not.toBe([...visa].sort().join('|'))
    expect(new Set([...housing, ...visa]).size).toBeGreaterThan(Math.max(housing.length, visa.length))
  })
})

describe('Master Engine e2e — planner unique clusters from GSC demand', () => {
  it('normalizes topics so predictive intel can match punctuated GSC queries', () => {
    expect(normalizePlannerTopic('UK Graduate Visa (2026)!')).toBe('uk graduate visa 2026')
  })

  it('cluster ids include country + stage so US and UK cannot collide', () => {
    const us = plannerClusterId('US', 'visa', 'f-1 visa')
    const uk = plannerClusterId('UK', 'visa', 'f-1 visa')
    expect(us).not.toBe(uk)
    expect(us).toContain('us')
    expect(uk).toContain('uk')
  })

  it('two GSC mixes rank different unique missions (demand-driven, not a canned list)', async () => {
    const ukMix: GscSignalInput[] = [
      gsc('uk graduate visa requirements', 4200, 8, 90),
      gsc('uk spouse visa document checklist', 3100, 12, 40),
      gsc('ilr from spouse visa', 1800, 18, 20),
    ]
    const usMix: GscSignalInput[] = [
      gsc('f-1 visa interview questions', 8000, 6, 200),
      gsc('opt stem unemployment cap', 2600, 14, 30),
      gsc('h-1b processing time', 1900, 22, 15),
    ]

    const uk = await runPlanner({ signals: ukMix, knowledge: [], draftBriefs: false, limit: 5 })
    const us = await runPlanner({ signals: usMix, knowledge: [], draftBriefs: false, limit: 5 })

    expect(uk.plans.length).toBeGreaterThanOrEqual(2)
    expect(us.plans.length).toBeGreaterThanOrEqual(2)

    const ukIds = uk.plans.map((p) => p.clusterId)
    const usIds = us.plans.map((p) => p.clusterId)
    expect(new Set(ukIds).size).toBe(ukIds.length)
    expect(new Set(usIds).size).toBe(usIds.length)
    expect(ukIds.some((id) => usIds.includes(id))).toBe(false)

    expect(uk.plans.map((p) => p.primaryTerm.toLowerCase()).join(' ')).toContain('graduate')
    expect(uk.plans[0].primaryTerm.toLowerCase()).toMatch(/graduate|spouse|ilr/)
    expect(us.plans[0].primaryTerm.toLowerCase()).toMatch(/f-1|opt|h-1b/)
    expect(uk.plans[0].opportunityScore).toBeGreaterThan(0)
    expect(uk.plans[0].opportunityScore).toBeGreaterThanOrEqual(uk.plans[uk.plans.length - 1].opportunityScore)
    expect(uk.plans.every((p) => p.country === 'UK')).toBe(true)
    expect(us.plans.every((p) => p.country === 'US')).toBe(true)
  })

  it('drops brand/URL junk and unmatched score-0 cells instead of defaulting to US visa', async () => {
    const mix: GscSignalInput[] = [
      gsc('yousafeconsultancy.com', 960, 16, 0),
      gsc('yousafe', 620, 8, 0),
      gsc('www.yousafeconsultancy.com', 450, 12, 0),
      gsc('uk student visa process for warwick university', 190, 21, 4),
      gsc('appendix fm se documents checklist', 230, 48, 2),
      gsc('f-1 visa interview questions', 800, 6, 40),
    ]
    const { plans } = await runPlanner({ signals: mix, knowledge: [], draftBriefs: false, limit: 8 })
    const terms = plans.map((p) => p.primaryTerm.toLowerCase())
    expect(terms.some((t) => isJunkQuery(t))).toBe(false)
    expect(terms.some((t) => t.includes('yousafe'))).toBe(false)
    expect(plans.length).toBeGreaterThanOrEqual(2)
    expect(new Set(plans.map((p) => p.clusterId)).size).toBe(plans.length)

    const warwick = plans.find((p) => /warwick/i.test(p.primaryTerm))
    expect(warwick).toBeTruthy()
    expect(warwick!.country).toBe('UK')
    expect(warwick!.stage).toBe('schools')

    const appendix = plans.find((p) => /appendix fm/i.test(p.primaryTerm))
    expect(appendix).toBeTruthy()
    expect(appendix!.country).toBe('UK')

    const f1 = plans.find((p) => /f-1/i.test(p.primaryTerm))
    expect(f1).toBeTruthy()
    expect(f1!.country).toBe('US')
    expect(f1!.stage).toBe('schools')
  })

  it('maps distinctive GSC terms to the matching country × stage cell', () => {
    expect(MIN_CELL_MATCH_SCORE).toBeGreaterThanOrEqual(2)
    const warwick = bestCellForTerm('uk student visa process for warwick university')
    expect(warwick.score).toBeGreaterThanOrEqual(MIN_CELL_MATCH_SCORE)
    expect(warwick.country).toBe('UK')
    expect(warwick.stage).toBe('schools')

    const appendix = bestCellForTerm('appendix fm se documents checklist')
    expect(appendix.score).toBeGreaterThanOrEqual(MIN_CELL_MATCH_SCORE)
    expect(appendix.country).toBe('UK')

    const f1 = bestCellForTerm('f-1 visa interview questions')
    expect(f1.score).toBeGreaterThanOrEqual(MIN_CELL_MATCH_SCORE)
    expect(f1.country).toBe('US')
    expect(f1.stage).toBe('schools')

    const brand = bestCellForTerm('yousafeconsultancy.com')
    expect(brand.score < MIN_CELL_MATCH_SCORE || !brand.stage || isJunkQuery('yousafeconsultancy.com')).toBe(true)

    const asu = bestCellForTerm('asu visa requirements')
    expect(asu.score).toBeGreaterThanOrEqual(MIN_CELL_MATCH_SCORE)
    expect(asu.country).toBe('US')
    expect(asu.stage).toBe('schools')

    const visa485 = bestCellForTerm('485 visa english requirements')
    expect(visa485.score).toBeGreaterThanOrEqual(MIN_CELL_MATCH_SCORE)
    expect(visa485.country).toBe('AU')
  })

  it('keeps GSC ranking-gap terms when Ads market heads are mixed in', async () => {
    const mixed: GscSignalInput[] = [
      gsc('administrative review letter template uk', 92, 48, 2),
      gsc('united states work visa', 70, 80, 0),
      gsc('stem opt', 70, 80, 0),
      gsc('opt application', 58, 80, 0),
      gsc('work visas in the united states', 70, 80, 0),
      gsc('united states student visa', 66, 80, 0),
    ]
    const { plans } = await runPlanner({ signals: mixed, knowledge: [], draftBriefs: false, limit: 3 })
    expect(plans.some((p) => /administrative review/i.test(p.primaryTerm))).toBe(true)
    expect(plans.find((p) => /administrative review/i.test(p.primaryTerm))!.country).toBe('UK')
  })
})
