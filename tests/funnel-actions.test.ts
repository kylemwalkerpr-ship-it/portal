/**
 * Phase 2b — funnel action taxonomy + expected-revenue math.
 * Locks: expectedMonthlyRevenue formula + constants, monotonicity, zero-diff,
 * labels for all five funnel kinds, and the buildCitationActions honesty rule
 * (never fabricate impressions).
 */
import {
  FUNNEL_ACTION_HINT,
  FUNNEL_ACTION_LABELS,
  FUNNEL_FALLBACK_PRICE_USD,
  actionFamily,
  buildForecast,
  expectedMonthlyRevenue,
  type FunnelActionKind,
} from '@/lib/seoEngine/rankingModel'
import { buildCitationActions } from '@/lib/seoEngine/llmVisibility'
import {
  FORECAST_REWARD_ACTION,
  buildForecastRewardEvent,
  funnelAttributionFamily,
} from '@/lib/seoEngine/forecastReward'
import type { ForecastEvalRow } from '@/lib/seoEngine/forecastTracker'

const ALL_KINDS: FunnelActionKind[] = ['funnel_new', 'funnel_revenue', 'funnel_climb', 'authority_anchor', 'kill_or_merge']

describe('expectedMonthlyRevenue — formula + constants', () => {
  it('computes the documented formula: impressions × ΔCTR × intentCVR × avg price', () => {
    // expectedCtr(3) = 0.15 − expectedCtr(11) = 0.025 → ΔCTR 0.125
    // 1800 × 0.125 × 0.08 (transactional) × $300 avg = $5,400
    const r = expectedMonthlyRevenue({
      impressions: 1800,
      currentPosition: 11,
      targetPosition: 3,
      intent: 'transactional',
      action: 'funnel_climb',
      priceMin: 200,
      priceMax: 400,
    })
    expect(r.usdPerMonth).toBeGreaterThan(5000)
    expect(r.usdPerMonth).toBeLessThan(6000)
    expect(r.note).toMatch(/1,800 impressions at #11 → #3/)
    expect(r.note).toMatch(/transactional intent/)
    expect(r.note).toMatch(/\$200-400 service/)
  })

  it('uses FUNNEL_FALLBACK_PRICE_USD when the price range is unknown (never NaN)', () => {
    // 1000 × 0.125 × 0.08 × 400 = 4,000 exactly — deterministic.
    const r = expectedMonthlyRevenue({
      impressions: 1000,
      currentPosition: 11,
      targetPosition: 3,
      intent: 'transactional',
      action: 'funnel_climb',
      priceMin: 0,
      priceMax: 0,
    })
    expect(FUNNEL_FALLBACK_PRICE_USD).toBe(400)
    expect(r.usdPerMonth).toBe(4000)
    expect(r.note).toMatch(/flat \$400 price fallback/)
  })

  it('is monotonic in impressions — more impressions ⇒ ≥ revenue (same everything else)', () => {
    const base = { currentPosition: 11, targetPosition: 3, intent: 'commercial', action: 'funnel_climb' as const, priceMin: 100, priceMax: 300 }
    const small = expectedMonthlyRevenue({ ...base, impressions: 1200 })
    const large = expectedMonthlyRevenue({ ...base, impressions: 4800 })
    expect(large.usdPerMonth).toBeGreaterThanOrEqual(small.usdPerMonth)
    // Exact linearity when params match and neither side rounds: 1200 → 1350, 4800 → 5400.
    expect(large.usdPerMonth).toBe(4 * small.usdPerMonth)
  })

  it('returns 0 when the position diff is zero or negative (no climb to price)', () => {
    const same = expectedMonthlyRevenue({ impressions: 5000, currentPosition: 3, targetPosition: 3, intent: 'transactional', action: 'funnel_climb', priceMin: 200, priceMax: 400 })
    const falling = expectedMonthlyRevenue({ impressions: 5000, currentPosition: 1, targetPosition: 5, intent: 'transactional', action: 'funnel_climb', priceMin: 200, priceMax: 400 })
    expect(same.usdPerMonth).toBe(0)
    expect(falling.usdPerMonth).toBe(0)
  })

  it('prices conservative intent below transactional intent at equal volume', () => {
    const base = { impressions: 1200, currentPosition: 11, targetPosition: 3, action: 'funnel_climb' as const, priceMin: 200, priceMax: 400 }
    const info = expectedMonthlyRevenue({ ...base, intent: 'informational' })
    const txn = expectedMonthlyRevenue({ ...base, intent: 'transactional' })
    expect(info.usdPerMonth).toBeLessThan(txn.usdPerMonth)
  })
})

describe('funnel taxonomy — labels + hints for all five kinds', () => {
  it('exports a label and hint for every FunnelActionKind', () => {
    for (const kind of ALL_KINDS) {
      expect(FUNNEL_ACTION_LABELS[kind]).toBeTruthy()
      expect(FUNNEL_ACTION_LABELS[kind].length).toBeGreaterThan(8)
      expect(FUNNEL_ACTION_HINT[kind]).toBeTruthy()
    }
  })

  it('renders the exact mission verbs (funnel phrasing, not generic refresh/merge)', () => {
    expect(FUNNEL_ACTION_LABELS.funnel_new).toBe('Funnel new · service-enabled guide')
    expect(FUNNEL_ACTION_LABELS.funnel_revenue).toBe('Funnel revenue · add pricing + consult CTA')
    expect(FUNNEL_ACTION_LABELS.funnel_climb).toBe('Funnel climb · win CTR/title/answer')
    expect(FUNNEL_ACTION_LABELS.authority_anchor).toBe('Authority anchor · statutory-neighbor pillar')
    expect(FUNNEL_ACTION_LABELS.kill_or_merge).toMatch(/Kill \/ merge/)
    for (const label of Object.values(FUNNEL_ACTION_LABELS)) {
      expect(label).not.toMatch(/^refresh|^merge|^rework|^update|^improve/i)
    }
  })

  it('routes each funnel kind to its signal family (and funnel actions to demand)', () => {
    expect(actionFamily('funnel_new')).toBe('topicalAuthority')
    expect(actionFamily('funnel_revenue')).toBe('demand')
    expect(actionFamily('funnel_climb')).toBe('behavioral')
    expect(actionFamily('authority_anchor')).toBe('aeoGeo')
    expect(actionFamily('kill_or_merge')).toBe('indexability')
    expect(funnelAttributionFamily('funnel_revenue: add pricing + consult CTA')).toBe('demand')
    expect(funnelAttributionFamily('forecast_accuracy')).toBeNull()
  })

  it('forecast assumptions render the funnel label, not the raw verb id', () => {
    const forecast = buildForecast({
      position: 18,
      impressions: 1000,
      modelTotal: 70,
      plannedActions: [{ action: 'funnel_climb', strength: 2 }],
    })
    expect(forecast.assumptions.some((a) => a.includes('Funnel climb · win CTR/title/answer'))).toBe(true)
  })
})

describe('forecast-reward — funnel actions always attribute to demand', () => {
  const NOW = '2026-08-09T00:00:00.000Z'
  const over: ForecastEvalRow = {
    subjectKey: '',
    topic: 'auburn student housing',
    runDate: '2026-07-10',
    horizonDays: 30,
    maturityDate: '2026-09-08',
    matured: true,
    daysElapsed: 0,
    daysToMaturity: 0,
    projected: { position: 10, impressions: 1000, clicks: 100, probabilityTop10: 0.5 },
    actual: { position: 23, impressions: 600, clicks: 40, source: 'snapshot', asOf: '2026-09-08' },
    deltas: { position: 13, impressions: -400, clicks: -35 },
    verdicts: {},
    overall: 'over_predicted',
    magnitude: 0.5,
    flags: [],
  }

  it('overrides the verdict→behavioral routing when the event is a funnel action', () => {
    const funnel = buildForecastRewardEvent(over, NOW, 'funnel_climb')
    expect(funnel.action).toBe('funnel_climb')
    expect(funnel.attribution.demand).toBeGreaterThan(0)
    expect(funnel.attribution.behavioral).toBeUndefined()
    expect(funnel.reward).toBe(0.02) // over_predicted constant unchanged
  })

  it('keeps the verdict-driven default for non-funnel actions (constants preserved)', () => {
    const plain = buildForecastRewardEvent(over, NOW)
    expect(plain.action).toBe(FORECAST_REWARD_ACTION)
    expect(plain.attribution.demand).toBeUndefined()
    expect(plain.attribution.behavioral).toBeGreaterThan(0)
  })
})

describe('buildCitationActions — actionKind + honesty rule (no fabricated impressions)', () => {
  it('tags every loss action with a funnel kind and OMITS expectedRevenue when impressions are unknown', () => {
    const actions = buildCitationActions({ shareOfVoice: 0, topCompetitorDomain: 'boundless.com', competitorShare: 0.8, cited: false })
    expect(actions.length).toBeGreaterThanOrEqual(5)
    for (const a of actions) {
      expect(a.actionKind).toBeDefined()
      expect(a.expectedRevenue).toBeUndefined() // never invent a USD number without impressions
    }
    // capsule/FAQ/stats/llms.txt are climbs; the new-page remediation is funnel_new.
    expect(actions.filter((a) => a.actionKind === 'funnel_climb').length).toBeGreaterThanOrEqual(4)
    expect(actions.some((a) => a.actionKind === 'funnel_new' && /service-enabled page/i.test(a.action))).toBe(true)
  })

  it('attaches conservative expectedRevenue only when impressions AND a stage/country cell are real', () => {
    const withData = buildCitationActions({
      shareOfVoice: 0,
      topCompetitorDomain: null,
      competitorShare: null,
      cited: false,
      stage: 'visa',
      country: 'US',
      impressions: 1200,
    })
    for (const a of withData) {
      expect(a.expectedRevenue).toBeDefined()
      expect(a.expectedRevenue!.usdPerMonth).toBeGreaterThan(0)
      expect(a.expectedRevenue!.note).toMatch(/impressions at #11 → #3|impressions at #21 → #5/)
      expect(a.expectedRevenue!.note).toMatch(/informational intent/)
    }
  })

  it('still omits expectedRevenue when impressions exist but no cell is resolvable', () => {
    const noCell = buildCitationActions({
      shareOfVoice: 0,
      topCompetitorDomain: null,
      competitorShare: null,
      cited: false,
      impressions: 5000,
    })
    for (const a of noCell) expect(a.expectedRevenue).toBeUndefined()
  })
})