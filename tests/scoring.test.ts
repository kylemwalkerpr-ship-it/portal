/**
 * Phase 2a — conversion economy scoring tests.
 *
 * Covers the consolidated opportunity formula (scoring.ts) and the
 * marketplace value layer (marketplaceValue.ts):
 *   1. Monotonicity — impressions ↑ ⇒ score never ↓ (holding everything else).
 *   2. Funnel bet with live supply ≥ informational dead-end at equal demand.
 *   3. monetizeFactor caps at 1.35; conversionScore floors 1.0; funnel+supply = 1.6.
 *   4. Corroboration — UBER_BOOST applies only when isCorroboratedByGsc.
 *   5. marketplaceValue — defaults table covers 4 countries × 9 stages and
 *      reports hasLiveSupply false without a live source (Supabase mocked
 *      with a null-returning chain, same as master-engine-e2e).
 */
import {
  SCORING_CONSTANTS,
  opportunityScore,
  monetizeFactor,
  conversionScore,
  revenueLiftFactor,
  isFunnelStage,
  isDeadFunnelMission,
} from '@/lib/seoEngine/scoring'
import {
  STAGE_VALUE_DEFAULTS,
  marketplaceValue,
  resetMarketplaceValueCache,
  loadMarketplaceServices,
} from '@/lib/seoEngine/marketplaceValue'
import { LIFECYCLE_STAGES, COUNTRIES } from '@/lib/seoEngine/ontology'

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

const BASE: {
  impressions: number
  position: number
  clicks: number
  stage: string
  country: string
  stagePriority: number
  knowledgeBias: number
  revenueLift: number
  predictiveAdjustment: number
  shippedPenalty: number
  hasLiveSupply: boolean
  intent: string
  isCorroboratedByGsc: boolean
  uberBoost: number
} = {
  impressions: 1000,
  position: 20,
  clicks: 50,
  stage: 'visa',
  country: 'US',
  stagePriority: 9,
  knowledgeBias: 0,
  revenueLift: 1,
  predictiveAdjustment: 0.95,
  shippedPenalty: 1,
  hasLiveSupply: false,
  intent: 'transactional',
  isCorroboratedByGsc: false,
  uberBoost: 1.25,
} as const

function score(over: Partial<typeof BASE> = {}): number {
  return opportunityScore({ ...BASE, ...over })
}

describe('scoring — consolidated opportunity formula', () => {
  it('wraps every weight in documented named constants', () => {
    expect(SCORING_CONSTANTS.GAP_CAP).toBe(2)
    expect(SCORING_CONSTANTS.REVENUE_LIFT_CAP).toBe(1.8)
    expect(SCORING_CONSTANTS.SHIPPED_PENALTY).toBe(0.15)
    expect(SCORING_CONSTANTS.UBER_BOOST).toBe(1.25)
    expect(SCORING_CONSTANTS.CONVERSION_TABLE.funnelSupply).toBe(1.6)
  })

  it('is monotonic in impressions — more demand never lowers the score', () => {
    const at = (impressions: number, v: Partial<typeof BASE>) => score({ impressions, ...v })
    const fixed = { clicks: 0, position: 30 }
    const seq: number[] = []
    for (const imp of [10, 100, 500, 1_000, 5_000, 10_000, 50_000, 100_000]) {
      seq.push(at(imp, { ...fixed, stage: 'visa' }))
    }
    for (let i = 1; i < seq.length; i++) expect(seq[i]).toBeGreaterThanOrEqual(seq[i - 1])
    // Same monotonicity on a non-funnel stage.
    const seqSchools: number[] = []
    for (const imp of [10, 100, 1_000, 10_000, 100_000]) {
      seqSchools.push(at(imp, { ...fixed, stage: 'schools', intent: 'informational' }))
    }
    for (let i = 1; i < seqSchools.length; i++) expect(seqSchools[i]).toBeGreaterThanOrEqual(seqSchools[i - 1])
  })

  it('funnel bet with live supply scores ≥ an informational dead-end at equal demand', () => {
    const funnel = score({ stage: 'visa', hasLiveSupply: true, isCorroboratedByGsc: false })
    const deadEnd = score({ stage: 'intent', hasLiveSupply: false, intent: 'informational' })
    expect(funnel).toBeGreaterThanOrEqual(deadEnd)
    // The 1.6 conversion factor must be visible as a strict gap in isolation.
    expect(conversionScore('visa', 'transactional', true)).toBe(1.6)
    expect(conversionScore('intent', 'informational', false)).toBe(1.0)
  })

  it('monetizeFactor caps at 1.35 and stays 1.0 without purchasable supply', () => {
    expect(monetizeFactor('visa', true)).toBe(1.35)
    expect(monetizeFactor('visa', false)).toBe(1)
    expect(monetizeFactor('intent', true)).toBe(1)
    expect(monetizeFactor('intent', false)).toBe(1)
    expect(monetizeFactor('schools', true)).toBe(1.35)
    expect(monetizeFactor('schools', false)).toBe(1)
    expect(monetizeFactor('unknown-stage', true)).toBe(1)
  })

  it('conversionScore floors at 1.0 and hits 1.6 only for funnel+supply', () => {
    expect(conversionScore('visa', 'informational', true)).toBe(1.6)
    expect(conversionScore('visa', 'informational', false)).toBe(1.25)
    expect(conversionScore('citizenship', 'transactional', true)).toBe(1.6)
    expect(conversionScore('family', 'informational', true)).toBe(1.6)
    expect(conversionScore('intent', 'transactional', true)).toBe(1.0)
    expect(conversionScore('intent', 'informational', false)).toBe(1.0)
    expect(conversionScore('schools', 'informational', false)).toBe(1.0)
    expect(conversionScore('work', 'transactional', false)).toBe(1.06)
    expect(conversionScore('schools', 'informational', true)).toBe(1.12)
  })

  it('supply raises the total score: same demand, live supply wins', () => {
    const withSupply = score({ stage: 'visa', hasLiveSupply: true })
    const withoutSupply = score({ stage: 'visa', hasLiveSupply: false })
    expect(withSupply).toBeGreaterThan(withoutSupply)
  })

  it('revenueLiftFactor caps at 1.8 and is 1.0 for zero revenue', () => {
    expect(revenueLiftFactor(0)).toBe(1)
    expect(revenueLiftFactor(10_000_000)).toBeCloseTo(1.8, 5)
    expect(revenueLiftFactor(1200)).toBeGreaterThan(1)
  })

  it('isFunnelStage covers visa/citizenship/family and ontology-critical stages', () => {
    expect(isFunnelStage('visa')).toBe(true)
    expect(isFunnelStage('citizenship')).toBe(true)
    expect(isFunnelStage('family')).toBe(true)
    expect(isFunnelStage('schools')).toBe(false)
    expect(isFunnelStage('work')).toBe(false)
    expect(isFunnelStage('intent')).toBe(false)
    expect(isFunnelStage('settlement')).toBe(false)
  })

  describe('uberBoost corroboration', () => {
    it('applies the boost only when isCorroboratedByGsc is true', () => {
      const without = score({ isCorroboratedByGsc: false, uberBoost: 1.25 })
      const withProof = score({ isCorroboratedByGsc: true, uberBoost: 1.25 })
      expect(without).toBeGreaterThan(0)
      expect(withProof).toBeGreaterThan(without)

      // Reconstruct the ratio: everything cancels except the boost factor
      // (both branches Math.round the raw product, so allow rounding slack).
      const w = score({ isCorroboratedByGsc: false, uberBoost: 1.25 })
      const c = score({ isCorroboratedByGsc: true, uberBoost: 1.25 })
      expect(c).toBeGreaterThan(w)
      const ratio = c / w
      expect(ratio).toBeGreaterThan(1.2)
      expect(ratio).toBeLessThanOrEqual(1.3)
    })

    it('a boosted but uncorroborated cell equals the same cell with no boost', () => {
      const noBoost = score({ uberBoost: 1 })
      const unproven = score({ uberBoost: 1.25, isCorroboratedByGsc: false })
      expect(unproven).toBe(noBoost)
    })
  })
})

describe('marketplaceValue — staged defaults and live fallback', () => {
  const STAGES = LIFECYCLE_STAGES.map((s) => s.key)

  beforeEach(() => resetMarketplaceValueCache())

  it('defaults table covers every country × stage cell with usable ranges', () => {
    expect(STAGES).toHaveLength(9)
    expect(COUNTRIES.length).toBe(4)
    for (const country of COUNTRIES) {
      expect(STAGE_VALUE_DEFAULTS[country]).toBeTruthy()
      for (const stage of STAGES) {
        const range = STAGE_VALUE_DEFAULTS[country][stage]
        expect(range).toBeTruthy()
        expect(range.min).toBeGreaterThanOrEqual(0)
        expect(range.max).toBeGreaterThanOrEqual(range.min)
        // Every priced stage carries a real consult range, intent is $0.
        if (stage === 'intent') expect(range.max).toBe(0)
        else expect(range.max).toBeGreaterThan(50)
      }
    }
  })

  it('visa/citizenship/family sit in the high-value bands; schools/work mid; intent free', () => {
    expect(STAGE_VALUE_DEFAULTS.US.visa.min).toBeGreaterThanOrEqual(150)
    expect(STAGE_VALUE_DEFAULTS.US.citizenship.min).toBeGreaterThanOrEqual(200)
    expect(STAGE_VALUE_DEFAULTS.US.family.max).toBeLessThanOrEqual(500)
    expect(STAGE_VALUE_DEFAULTS.US.schools.max).toBeLessThanOrEqual(250)
    expect(STAGE_VALUE_DEFAULTS.US.work.max).toBeLessThanOrEqual(250)
    expect(STAGE_VALUE_DEFAULTS.US.settlement.max).toBeLessThanOrEqual(300)
  })

  it('returns defaults with hasLiveSupply false when no live source exists', async () => {
    const v = await marketplaceValue('visa', 'US')
    expect(v.hasLiveSupply).toBe(false)
    expect(v.serviceCount).toBe(0)
    const d = STAGE_VALUE_DEFAULTS.US.visa
    expect(v.priceMin).toBe(d.min)
    expect(v.priceMax).toBe(d.max)
    // AU jurisdiction has no rows (marketplace_gig_jurisdiction.sql only
    // allows us/uk/ca) — must fall back gracefully, never throw.
    const au = await marketplaceValue('citizenship', 'AU')
    expect(au.hasLiveSupply).toBe(false)
    expect(STAGE_VALUE_DEFAULTS.AU.citizenship.max).toBeGreaterThan(0)
  })

  it('loadMarketplaceServices is best-effort and returns [] on failure', async () => {
    await expect(loadMarketplaceServices('visa', 'US')).resolves.toEqual([])
    await expect(loadMarketplaceServices('visa', 'AU')).resolves.toEqual([])
    await expect(loadMarketplaceServices()).resolves.toEqual([])
  })

  it('unknown stage/country never throws and falls back to zero-value defaults', async () => {
    const v = await marketplaceValue('nonsense-stage', 'XX')
    expect(v.hasLiveSupply).toBe(false)
    expect(v.serviceCount).toBe(0)
    expect(v.priceMin).toBe(0)
    expect(v.priceMax).toBe(0)
  })

  it('caches per-cell results (5 min TTL) so repeated reads are cheap', async () => {
    const a = await marketplaceValue('visa', 'US')
    const b = await marketplaceValue('visa', 'US')
    expect(b).toBe(a)
    resetMarketplaceValueCache()
    const c = await marketplaceValue('visa', 'US')
    expect(c).toEqual(a)
  })
})
describe('dead-funnel kill-switch', () => {
  it('never kills funnel stages or service-supplied cells', () => {
    expect(isDeadFunnelMission({ stage: 'visa', hasLiveSupply: false, impressions: 0, clicks: 0, knowledgeBias: 0, corroborated: false })).toBe(false)
    expect(isDeadFunnelMission({ stage: 'schools', hasLiveSupply: true, impressions: 0, clicks: 0, knowledgeBias: 0, corroborated: false })).toBe(false)
  })

  it('kills a service-less demand blip with no proof', () => {
    expect(isDeadFunnelMission({ stage: 'intent', hasLiveSupply: false, impressions: 40, clicks: 0, knowledgeBias: 0, corroborated: false })).toBe(true)
  })

  it('spares anything with demand, clicks, intel, or GSC corroboration', () => {
    expect(isDeadFunnelMission({ stage: 'intent', hasLiveSupply: false, impressions: 500, clicks: 0, knowledgeBias: 0, corroborated: false })).toBe(false)
    expect(isDeadFunnelMission({ stage: 'schools', hasLiveSupply: false, impressions: 10, clicks: 3, knowledgeBias: 0, corroborated: false })).toBe(false)
    expect(isDeadFunnelMission({ stage: 'housing', hasLiveSupply: false, impressions: 10, clicks: 0, knowledgeBias: 4, corroborated: false })).toBe(false)
    expect(isDeadFunnelMission({ stage: 'work', hasLiveSupply: false, impressions: 10, clicks: 0, knowledgeBias: 0, corroborated: true })).toBe(false)
  })
})
