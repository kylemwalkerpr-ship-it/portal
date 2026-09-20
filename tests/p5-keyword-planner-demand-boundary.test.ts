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
