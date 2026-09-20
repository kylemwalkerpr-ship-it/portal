/**
 * P5 Gate 2 — the upstream Master Engine planner itself must not generate a
 * mission from off-mission demand.
 *
 * `runPlanner({ draftBriefs: true })` runs from the daily cron and persists
 * `seo_cluster_plans` rows (called "missions" downstream). Before this pass
 * its three signal loops filtered on `isJunkQuery` only, so real-but-off-mission
 * campus-housing demand (e.g. "university of south carolina student housing")
 * both became a persisted plan and corroborated the housing cell for an
 * Ubersuggest volume boost. This suite drives the REAL planner and pins:
 *
 *   1. an off-mission signal (GSC or Ubersuggest) never becomes a plan,
 *      is never persisted, and never leaks into an on-mission plan's cluster;
 *   2. an off-mission GSC signal can never corroborate an Ubersuggest-only
 *      housing boost (score is bit-identical with and without it);
 *   3. off-mission demand creates no actionable-cell marketplace work;
 *   4. qualified/on-mission immigration + tenancy-legal housing demand in the
 *      same batch still plans — this is an admission boundary, not ontology
 *      deletion.
 *
 * Only the Supabase boundary is mocked (shared repository pattern); the
 * planner, ontology, query-noise boundary, scoring and marketplace modules
 * are the real ones.
 */
import { runPlanner, bestCellForTerm, MIN_CELL_MATCH_SCORE, type GscSignalInput } from '@/lib/seoEngine/planner'
import { resetMarketplaceValueCache } from '@/lib/seoEngine/marketplaceValue'
import { getStage } from '@/lib/seoEngine/ontology'
import { isActionableDemandQuery, isOffMissionDemandQuery } from '@/lib/seoFactory/queryNoise'

type SupabaseQueryLogEntry = { table: string; filters: Array<[string, unknown]> }

jest.mock('@/lib/seoEngine/interlink', () => ({
  persistPlannerInterlinks: jest.fn(async () => undefined),
}))

// The AI narrative boundary: hermetic (no provider/network), but observable so
// the cron path can be pinned to draft ONLY the admitted mission.
jest.mock('@/lib/seoEngine/engineAi', () => ({
  emptyPairRollup: () => ({}),
  accumulatePairRollup: () => undefined,
  generateEngineText: jest.fn(async () => ({ text: 'brief', pair: null })),
}))

jest.mock('@/lib/supabase', () => {
  const queryLog: SupabaseQueryLogEntry[] = []
  const result = { data: null, error: null, count: 0 }

  const chain = (table: string, filters: Array<[string, unknown]>): unknown => {
    const thenable = {
      // Recording at await-time keeps the log to queries the planner actually
      // executed (not mere chain construction).
      then: (resolve: (v: unknown) => unknown) => {
        queryLog.push({ table, filters })
        return Promise.resolve(resolve(result))
      },
      catch: () => {
        queryLog.push({ table, filters })
        return Promise.resolve(result)
      },
    }
    return new Proxy(thenable, {
      get(target, prop) {
        if (prop === 'then' || prop === 'catch') return target[prop as 'then' | 'catch']
        return (...args: unknown[]) => {
          const filter: [string, unknown] = [String(prop), args[0]]
          return chain(table, [...filters, filter])
        }
      },
    })
  }

  return {
    createSupabaseAdminClient: () => ({ from: (table: string) => chain(String(table), []) }),
    __queryLog: queryLog,
  }
})

function supabaseQueryLog(): SupabaseQueryLogEntry[] {
  return (jest.requireMock('@/lib/supabase') as { __queryLog: SupabaseQueryLogEntry[] }).__queryLog
}

function gsc(term: string, impressions: number, position: number, clicks = 0): GscSignalInput {
  return { term, impressions, position, clicks, ctr: impressions ? clicks / impressions : 0, source: 'gsc' }
}

function ubersuggest(term: string, volume: number, keywordDifficulty = 25): GscSignalInput {
  return {
    term,
    impressions: Math.round(volume / 3),
    position: 30,
    clicks: 0,
    source: 'ubersuggest',
    volume,
    keywordDifficulty,
  }
}

/** Real off-mission campus-housing demand (NOT junk). */
const OFF_MISSION_HOUSING = 'university of south carolina student housing'
const OFF_MISSION_HOUSING_UBER = 'arizona state university student housing'
/** Qualified on-mission tenancy/legal housing demand (same housing cell). */
const QUALIFIED_TENANCY_HOUSING = 'tenant rights for immigrants usa'
/** Qualified on-mission immigration demand. */
const QUALIFIED_IMMIGRATION = 'uk graduate visa dependant rules'

beforeEach(() => {
  resetMarketplaceValueCache()
  supabaseQueryLog().length = 0
})

describe('P5 planner fixtures are the real boundary case', () => {
  it('off-mission campus housing is real demand that fails the actionable boundary but still matches the housing cell', () => {
    expect(isOffMissionDemandQuery(OFF_MISSION_HOUSING)).toBe(true)
    expect(isActionableDemandQuery(OFF_MISSION_HOUSING)).toBe(false)
    const cell = bestCellForTerm(OFF_MISSION_HOUSING)
    expect(cell.stage).toBe('housing')
    expect(cell.score).toBeGreaterThanOrEqual(MIN_CELL_MATCH_SCORE)

    expect(isOffMissionDemandQuery(OFF_MISSION_HOUSING_UBER)).toBe(true)
    expect(isActionableDemandQuery(OFF_MISSION_HOUSING_UBER)).toBe(false)
  })

  it('qualified tenancy-legal housing and immigration demand pass the boundary on the real cells', () => {
    expect(isActionableDemandQuery(QUALIFIED_TENANCY_HOUSING)).toBe(true)
    const cell = bestCellForTerm(QUALIFIED_TENANCY_HOUSING)
    expect(cell.stage).toBe('housing')
    expect(cell.score).toBeGreaterThanOrEqual(MIN_CELL_MATCH_SCORE)

    expect(isActionableDemandQuery(QUALIFIED_IMMIGRATION)).toBe(true)
  })

  it('keeps the housing lifecycle stage and its settlement/tenancy seeds (admission boundary, not ontology deletion)', () => {
    const housing = getStage('housing')
    expect(housing).toBeTruthy()
    const seeds = Object.values(housing!.countries).flatMap((c) => c.seedKeywords)
    expect(seeds).toContain('student housing')
    expect(seeds.some((s) => /tenant rights/i.test(s))).toBe(true)
    expect(seeds.some((s) => /newcomers/i.test(s))).toBe(true)
  })
})

describe('P5 planner mission-generation boundary', () => {
  it('never plans or persists an off-mission signal (GSC or Ubersuggest) while qualified demand in the same batch still plans', async () => {
    const { plans } = await runPlanner({
      signals: [
        gsc(OFF_MISSION_HOUSING, 9000, 7, 25),
        ubersuggest(OFF_MISSION_HOUSING_UBER, 2900),
        gsc(QUALIFIED_IMMIGRATION, 4200, 9, 60),
        gsc(QUALIFIED_TENANCY_HOUSING, 1400, 44, 12),
      ],
      knowledge: [],
      draftBriefs: false,
      limit: 8,
    })

    // Off-mission: no plan, no related-term leak, no persisted row.
    expect(plans.map((p) => p.primaryTerm)).not.toContain(OFF_MISSION_HOUSING)
    expect(plans.map((p) => p.primaryTerm)).not.toContain(OFF_MISSION_HOUSING_UBER)
    expect(plans.some((p) => /south carolina|arizona/i.test(p.primaryTerm))).toBe(false)
    expect(plans.some((p) => p.relatedTerms.some((t) => /south carolina|arizona/i.test(t)))).toBe(false)

    const persistedPayloads = supabaseQueryLog()
      .filter((q) => q.table === 'seo_cluster_plans')
      .map((q) => JSON.stringify(q.filters))
    expect(persistedPayloads.some((p) => p.includes(OFF_MISSION_HOUSING) || p.includes(OFF_MISSION_HOUSING_UBER))).toBe(false)

    // Qualified/on-mission demand in the same batch still plans (and is persisted).
    expect(plans.some((p) => p.primaryTerm === QUALIFIED_IMMIGRATION)).toBe(true)
    expect(plans.some((p) => p.primaryTerm === QUALIFIED_TENANCY_HOUSING && p.stage === 'housing')).toBe(true)
    expect(persistedPayloads.some((p) => p.includes(QUALIFIED_IMMIGRATION))).toBe(true)
    expect(persistedPayloads.some((p) => p.includes(QUALIFIED_TENANCY_HOUSING))).toBe(true)
  })

  it('never leaks an off-mission term into an on-mission plan cluster', async () => {
    const { plans } = await runPlanner({
      signals: [gsc(QUALIFIED_TENANCY_HOUSING, 4200, 9, 60), gsc(OFF_MISSION_HOUSING, 9000, 7, 25)],
      knowledge: [],
      draftBriefs: false,
      limit: 8,
    })
    expect(plans).toHaveLength(1)
    expect(plans[0].primaryTerm).toBe(QUALIFIED_TENANCY_HOUSING)
    expect(plans[0].relatedTerms).not.toContain(OFF_MISSION_HOUSING)
    expect(plans[0].relatedTerms.join(' ')).not.toMatch(/south carolina|student housing/i)
    expect(plans[0].plan.spokes.join(' ')).not.toMatch(/south carolina|student housing/i)
  })

  it('an off-mission GSC signal cannot corroborate an Ubersuggest-only housing boost', async () => {
    const uber = ubersuggest(QUALIFIED_TENANCY_HOUSING, 2900)
    const solo = await runPlanner({ signals: [uber], knowledge: [], draftBriefs: false, limit: 8 })
    expect(solo.plans).toHaveLength(1)
    expect(solo.plans[0].primaryTerm).toBe(QUALIFIED_TENANCY_HOUSING)
    const soloScore = solo.plans[0].opportunityScore
    expect(soloScore).toBeGreaterThan(0)

    const mixed = await runPlanner({
      signals: [uber, gsc(OFF_MISSION_HOUSING, 9000, 7, 25)],
      knowledge: [],
      draftBriefs: false,
      limit: 8,
    })
    // Only the qualified Ubersuggest plan survives, and its score is identical:
    // the off-mission GSC signal granted no corroboration (no 1.25× boost).
    expect(mixed.plans.map((p) => p.primaryTerm)).toEqual([QUALIFIED_TENANCY_HOUSING])
    expect(mixed.plans[0].opportunityScore).toBe(soloScore)
  })

  it('off-mission demand creates no actionable-cell marketplace work', async () => {
    const offMissionOnly = await runPlanner({
      signals: [gsc(OFF_MISSION_HOUSING, 9000, 7, 25)],
      knowledge: [],
      draftBriefs: false,
      limit: 8,
    })
    expect(offMissionOnly.plans).toHaveLength(0)
    expect(supabaseQueryLog().filter((q) => q.table === 'gigs')).toHaveLength(0)

    // Non-vacuous control: the same housing cell IS looked up for qualified demand.
    const qualifiedHousing = await runPlanner({
      signals: [gsc(QUALIFIED_TENANCY_HOUSING, 4200, 9, 60)],
      knowledge: [],
      draftBriefs: false,
      limit: 8,
    })
    expect(qualifiedHousing.plans).toHaveLength(1)
    expect(supabaseQueryLog().filter((q) => q.table === 'gigs').length).toBeGreaterThan(0)
  })

  it('the daily cron path (draftBriefs: true) never drafts or persists the off-mission mission', async () => {
    const engineAi = jest.requireMock('@/lib/seoEngine/engineAi') as { generateEngineText: jest.Mock }
    engineAi.generateEngineText.mockClear()
    const { plans, persisted } = await runPlanner({
      signals: [gsc(OFF_MISSION_HOUSING, 9000, 7, 25), gsc(QUALIFIED_IMMIGRATION, 4200, 9, 60)],
      knowledge: [],
      limit: 8,
    })
    expect(plans.map((p) => p.primaryTerm)).toEqual([QUALIFIED_IMMIGRATION])
    expect(persisted).toBe(1)
    const prompts = engineAi.generateEngineText.mock.calls.map((c) => JSON.stringify(c[0]))
    expect(prompts).toHaveLength(1)
    expect(prompts[0]).toContain(QUALIFIED_IMMIGRATION)
    expect(prompts[0]).not.toMatch(/south carolina/i)
  })
})
