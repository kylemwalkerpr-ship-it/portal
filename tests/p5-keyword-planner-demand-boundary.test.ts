/**
 * P5 — keyword-planner action boundary.
 *
 * The GSC research board (and therefore the editorial plan, auto-run candidates
 * and every downstream action) may only be fed by terms that clear the
 * metric-aware QUALIFIED boundary. Junk-only filtering is not the boundary:
 * real off-mission campus-lifestyle demand and on-mission deep-tail noise are
 * both excluded here while staying observable in raw GSC measurement.
 *
 * No live GSC / Supabase calls: snapshot rows are injected.
 */
import { buildKeywordPlan } from '@/lib/seoFactory/keywordPlanner'
import { getGscAccess } from '@/lib/gscAuth'
import { loadGscSnapshot, loadOwnershipRegistry } from '@/lib/seoDataLoaders'
import {
  isJunkQuery,
  isOffMissionDemandQuery,
  isQualifiedGscDemandQuery,
  isSelfBrandQuery,
} from '@/lib/seoFactory/queryNoise'

jest.mock('@/lib/gscAuth', () => ({ getGscAccess: jest.fn() }))
jest.mock('@/lib/seoDataLoaders', () => ({
  loadGscSnapshot: jest.fn(),
  loadOwnershipRegistry: jest.fn(),
}))
jest.mock('@supabase/supabase-js', () => {
  const makeBuilder = (result: unknown) => {
    const builder: Record<string, any> = { then: (resolve: any) => Promise.resolve(resolve(result)) }
    for (const m of ['select', 'eq', 'not', 'gte', 'neq', 'order', 'limit', 'head', 'single']) {
      builder[m] = () => builder
    }
    return builder
  }
  return {
    createClient: jest.fn(() => ({
      from: () => makeBuilder({ data: [], error: null, count: 0 }),
    })),
  }
})

const mockAccess = getGscAccess as jest.Mock
const mockSnapshot = loadGscSnapshot as jest.Mock
const mockRegistry = loadOwnershipRegistry as jest.Mock

const OFF_MISSION_HOUSING = {
  term: 'university of south carolina student housing',
  impressions: 120,
  clicks: 0,
  ctr: 0,
  position: 8.4,
}
const OFF_MISSION_LIFESTYLE = {
  term: 'cornell university dorm move in checklist',
  impressions: 88,
  clicks: 0,
  ctr: 0,
  position: 6.2,
}
const QUALIFIED_IMMIGRATION = {
  term: 'h-1b visa extension employer change',
  impressions: 210,
  clicks: 2,
  ctr: 0.0095,
  position: 12.5,
}
const QUALIFIED_ADMISSIONS = {
  term: 'university of warwick admissions requirements international students',
  impressions: 95,
  clicks: 1,
  ctr: 0.0105,
  position: 11,
}
const QUALIFIED_TENANCY = {
  // Campus-lifestyle wording released by the tenancy-legal anchor
  // ("deposit dispute" / "tenant rights") — on-mission demand, refresh lane.
  term: 'housing deposit dispute tenant rights',
  impressions: 90,
  clicks: 1,
  ctr: 0.008,
  position: 7,
}
const ON_MISSION_DEEP_TAIL = {
  term: 'immigration lawyer bristol',
  impressions: 7,
  clicks: 0,
  ctr: 0,
  position: 42,
}
const BRAND_TERM = {
  term: 'you safe consultancy login',
  impressions: 30,
  clicks: 0,
  ctr: 0,
  position: 5,
}

/**
 * The estate's own navigational self-searches, compact and spaced. Both shapes
 * are junk-class by default; the `includeBrand` opt-in exists to re-admit them,
 * so it must read the SAME bounded predicate the junk boundary reads.
 */
const COMPACT_BRAND_TERMS = ['yousafe', 'yousafe login', 'mycaseworks', 'mycaseworks login', 'yousafeconsultancy']
const SPACED_BRAND_TERMS = [
  'you safe',
  'You Safe?',
  'you safe login',
  'you safe consultancy login',
  'you safe consultancy london',
  'you safe portal wales',
  'you safe reviews 2024',
]

/**
 * Real safety / mission demand that merely CONTAINS the words "you safe" or
 * "safe" — never self-brand. A loose `/you\s?safe/` fix would junk these.
 */
const NON_BRAND_SAFETY_TERMS = [
  'are you safe to travel on a student visa',
  'you safe to travel on a student visa',
  'is warwick safe for international students',
  'you safe phone number for international students',
]

/** Compact brand row for the board-level opt-in test. */
const COMPACT_BRAND_ROW = {
  term: 'mycaseworks login',
  impressions: 22,
  clicks: 0,
  ctr: 0,
  position: 4,
}
/** Qualified on-mission safety question — admitted on merit, never by brand. */
const SAFETY_QUESTION_ROW = {
  term: 'are you safe to travel on a student visa',
  impressions: 64,
  clicks: 0,
  ctr: 0,
  position: 12,
}
/** Off-mission campus place-safety question — non-brand, must stay refused. */
const PLACE_SAFETY_QUESTION_ROW = {
  term: 'is warwick safe for international students',
  impressions: 92,
  clicks: 0,
  ctr: 0,
  position: 9,
}

const ROWS = [
  OFF_MISSION_HOUSING,
  OFF_MISSION_LIFESTYLE,
  QUALIFIED_IMMIGRATION,
  QUALIFIED_ADMISSIONS,
  QUALIFIED_TENANCY,
  ON_MISSION_DEEP_TAIL,
  BRAND_TERM,
]

const metrics = (row: { impressions: number; clicks: number; position: number }) => ({
  impressions: row.impressions,
  clicks: row.clicks,
  position: row.position,
})

beforeEach(() => {
  jest.clearAllMocks()
  mockAccess.mockResolvedValue(null) // no live GSC → snapshot path
  mockRegistry.mockResolvedValue({ rows: [] })
  mockSnapshot.mockResolvedValue({
    topQueries: ROWS.map((row) => ({ ...row })),
    opportunities: {},
    topPages: [],
  })
})

describe('P5 keyword-planner boundary — classification facts', () => {
  it('off-mission campus demand is REAL demand (not junk) that fails the qualified boundary', () => {
    for (const row of [OFF_MISSION_HOUSING, OFF_MISSION_LIFESTYLE]) {
      expect(isJunkQuery(row.term)).toBe(false)
      expect(isOffMissionDemandQuery(row.term)).toBe(true)
      expect(isQualifiedGscDemandQuery(row.term, metrics(row))).toBe(false)
    }
  })

  it('qualified immigration / admissions / tenancy demand still clears the boundary', () => {
    for (const row of [QUALIFIED_IMMIGRATION, QUALIFIED_ADMISSIONS, QUALIFIED_TENANCY]) {
      expect(isQualifiedGscDemandQuery(row.term, metrics(row))).toBe(true)
    }
    // Tenant-legal wording releases the campus-housing family too.
    const lease = { term: 'student housing lease agreement rights', impressions: 60, clicks: 2, position: 9 }
    expect(isOffMissionDemandQuery(lease.term)).toBe(false)
    expect(isQualifiedGscDemandQuery(lease.term, metrics(lease))).toBe(true)
    // A campus-housing phrase WITH a mission anchor is on-mission demand.
    const anchored = {
      term: 'f-1 student housing proof of address',
      impressions: 40,
      clicks: 0,
      position: 6,
    }
    expect(isQualifiedGscDemandQuery(anchored.term, metrics(anchored))).toBe(true)
  })

  it('on-mission deep-tail noise fails the metric-aware boundary without being junk', () => {
    expect(isJunkQuery(ON_MISSION_DEEP_TAIL.term)).toBe(false)
    expect(isOffMissionDemandQuery(ON_MISSION_DEEP_TAIL.term)).toBe(false)
    expect(isQualifiedGscDemandQuery(ON_MISSION_DEEP_TAIL.term, metrics(ON_MISSION_DEEP_TAIL))).toBe(false)
  })

  it('documents the deliberate P5 consequence for off-mission strike-seed housing keywords', () => {
    // The locked 2026-08 strike seed `university of the pacific student housing`
    // is off-mission-classified, so it can no longer enter GSC-driven planning.
    // Strike-seed ROUTING is unchanged for terms that do clear the boundary.
    expect(isOffMissionDemandQuery('university of the pacific student housing')).toBe(true)
    expect(isQualifiedGscDemandQuery('university of bristol international student guide', {
      impressions: 248,
      clicks: 1,
      position: 10.2,
    })).toBe(true)
  })
})

describe('P5 keyword-planner boundary — board and plan admission', () => {
  it('keeps off-mission and deep-tail terms out of the board and the plan', async () => {
    const result = await buildKeywordPlan({ minImpressions: 5, planLimit: 8 })
    const boardTerms = result.board.map((b) => b.term)
    const planTerms = result.plan.map((p) => p.term)

    expect(boardTerms).not.toContain(OFF_MISSION_HOUSING.term)
    expect(boardTerms).not.toContain(OFF_MISSION_LIFESTYLE.term)
    expect(boardTerms).not.toContain(ON_MISSION_DEEP_TAIL.term)
    expect(planTerms).not.toContain(OFF_MISSION_HOUSING.term)
    expect(planTerms).not.toContain(OFF_MISSION_LIFESTYLE.term)
    expect(planTerms).not.toContain(ON_MISSION_DEEP_TAIL.term)
    // The plan is a strict subset of the board — no side door into auto-run.
    for (const term of planTerms) expect(boardTerms).toContain(term)
  })

  it('admits qualified immigration, admissions and tenancy demand', async () => {
    const result = await buildKeywordPlan({ minImpressions: 5, planLimit: 8 })
    const boardTerms = result.board.map((b) => b.term)
    const planTerms = result.plan.map((p) => p.term)

    expect(boardTerms).toContain(QUALIFIED_IMMIGRATION.term)
    expect(boardTerms).toContain(QUALIFIED_ADMISSIONS.term)
    expect(boardTerms).toContain(QUALIFIED_TENANCY.term)
    // All three clear the actionable refresh lane, so each family still reaches
    // the executable plan (not just the research board).
    expect(planTerms).toContain(QUALIFIED_IMMIGRATION.term)
    expect(planTerms).toContain(QUALIFIED_ADMISSIONS.term)
    expect(planTerms).toContain(QUALIFIED_TENANCY.term)
    for (const item of result.plan) {
      expect(item.lane).toBe('refresh')
    }
  })

  it('preserves the explicit includeBrand opt-in and excludes brand terms by default', async () => {
    const withoutBrand = await buildKeywordPlan({ minImpressions: 5, planLimit: 8 })
    expect(withoutBrand.board.map((b) => b.term)).not.toContain(BRAND_TERM.term)

    const withBrand = await buildKeywordPlan({ minImpressions: 5, planLimit: 8, includeBrand: true })
    expect(withBrand.board.map((b) => b.term)).toContain(BRAND_TERM.term)
    // The opt-in is brand-only: off-mission demand is still refused.
    expect(withBrand.board.map((b) => b.term)).not.toContain(OFF_MISSION_HOUSING.term)
  })
})

describe('P5 shared self-brand predicate — bounded brand boundary', () => {
  it('recognizes compact and spaced estate self-searches as the same brand fact', () => {
    for (const term of [...COMPACT_BRAND_TERMS, ...SPACED_BRAND_TERMS]) {
      expect(isSelfBrandQuery(term)).toBe(true)
      // The default boundary reads the SAME predicate, so `includeBrand:false`
      // and the opt-in cannot drift apart again.
      expect(isJunkQuery(term)).toBe(true)
      expect(
        isQualifiedGscDemandQuery(term, { impressions: 30, position: 5, clicks: 0 }),
      ).toBe(false)
    }
  })

  it('never brands real safety/mission questions that merely contain the words', () => {
    for (const term of NON_BRAND_SAFETY_TERMS) {
      expect(isSelfBrandQuery(term)).toBe(false)
    }
    // Non-brand controls keep their existing classification: a qualified
    // on-mission safety question, and an off-mission place-safety question.
    expect(
      isQualifiedGscDemandQuery('are you safe to travel on a student visa', {
        impressions: 64,
        position: 12,
        clicks: 0,
      }),
    ).toBe(true)
    expect(isOffMissionDemandQuery('is warwick safe for international students')).toBe(true)
    expect(isSelfBrandQuery('is warwick safe for international students')).toBe(false)
  })
})

describe('P5 keyword-planner boundary — brand opt-in is brand-only', () => {
  it('admits compact AND spaced self-brand forms through includeBrand without loosening non-brand rules', async () => {
    mockSnapshot.mockResolvedValue({
      topQueries: [
        BRAND_TERM,
        COMPACT_BRAND_ROW,
        SAFETY_QUESTION_ROW,
        PLACE_SAFETY_QUESTION_ROW,
        ON_MISSION_DEEP_TAIL,
      ].map((row) => ({ ...row })),
      opportunities: {},
      topPages: [],
    })

    const withoutBrand = await buildKeywordPlan({ minImpressions: 5, planLimit: 8 })
    const defaultTerms = withoutBrand.board.map((b) => b.term)
    expect(defaultTerms).not.toContain(BRAND_TERM.term)
    expect(defaultTerms).not.toContain(COMPACT_BRAND_ROW.term)
    // The non-brand safety question is admitted on MERIT (qualified demand),
    // and the off-mission place-safety question stays refused.
    expect(defaultTerms).toContain(SAFETY_QUESTION_ROW.term)
    expect(defaultTerms).not.toContain(PLACE_SAFETY_QUESTION_ROW.term)

    const withBrand = await buildKeywordPlan({ minImpressions: 5, planLimit: 8, includeBrand: true })
    const brandBoardTerms = withBrand.board.map((b) => b.term)
    expect(brandBoardTerms).toContain(BRAND_TERM.term)
    expect(brandBoardTerms).toContain(COMPACT_BRAND_ROW.term)

    // The opt-in is brand-ONLY by construction: every term it newly admits is
    // self-brand, and no non-brand rule is bypassed for anything else.
    const added = brandBoardTerms.filter((term) => !defaultTerms.includes(term))
    expect(added.length).toBeGreaterThan(0)
    for (const term of added) expect(isSelfBrandQuery(term)).toBe(true)
    expect(brandBoardTerms).not.toContain(PLACE_SAFETY_QUESTION_ROW.term)
    expect(brandBoardTerms).not.toContain(ON_MISSION_DEEP_TAIL.term)
    // The brand opt-in never opens the executable plan to off-mission or
    // deep-tail demand.
    for (const item of withBrand.plan) {
      expect([
        OFF_MISSION_HOUSING.term,
        OFF_MISSION_LIFESTYLE.term,
        ON_MISSION_DEEP_TAIL.term,
        PLACE_SAFETY_QUESTION_ROW.term,
      ]).not.toContain(item.term)
    }
  })
})
