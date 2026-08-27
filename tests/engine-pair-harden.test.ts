import {
  accumulatePairRollup,
  emptyPairRollup,
  formatEnginePairTape,
  harvestComplementExtras,
} from '@/lib/seoEngine/engineAi'
import {
  ENGINE_PAIR_BREAKER_THRESHOLD,
  engineLegBreakerLabel,
  isEngineLegOpen,
  recordEngineLegFailure,
  recordEngineLegSuccess,
  resetEnginePairBreaker,
} from '@/lib/seoEngine/enginePairBreaker'
import { formatEngineRunSummary } from '@/lib/seoEngine/engineRunSummary'
import { nemotronFirstProviderOrder, parasailFirstProviderOrder } from '@/lib/aiKeyVault'

describe('harvestComplementExtras', () => {
  it('keeps statutes and URLs GLM found that Grok omitted', () => {
    const extras = harvestComplementExtras(
      'The graduate route lasts two years.',
      'See INA 214(b) and https://www.uscis.gov/working-in-the-united-states for the bar. Appendix FM also applies.',
    )
    expect(extras.statutes).toEqual(expect.arrayContaining(['INA 214(b)', 'Appendix FM']))
    expect(extras.urls).toEqual(['https://www.uscis.gov/working-in-the-united-states'])
  })

  it('does not re-keep facts already in the Grok-winning text', () => {
    const extras = harvestComplementExtras(
      'INA 214(b) is cited at https://www.uscis.gov/working-in-the-united-states',
      'INA 214(b) remains the bar. https://www.uscis.gov/working-in-the-united-states',
    )
    expect(extras.statutes).toEqual([])
    expect(extras.urls).toEqual([])
  })
})

describe('engine pair circuit breaker', () => {
  afterEach(() => resetEnginePairBreaker())

  it('opens after two failures and stays closed after a success', () => {
    expect(isEngineLegOpen('parasail-glm')).toBe(false)
    recordEngineLegFailure('parasail-glm')
    expect(isEngineLegOpen('parasail-glm')).toBe(false)
    recordEngineLegFailure('parasail-glm')
    expect(isEngineLegOpen('parasail-glm')).toBe(true)
    expect(engineLegBreakerLabel('parasail-glm')).toMatch(/circuit-open/)
    expect(ENGINE_PAIR_BREAKER_THRESHOLD).toBe(2)
    recordEngineLegSuccess('parasail-glm')
    expect(isEngineLegOpen('parasail-glm')).toBe(false)
  })
})

describe('pair tape on engine runs', () => {
  it('renders Grok + GLM disagreed/merged for the desk', () => {
    const rollup = emptyPairRollup()
    accumulatePairRollup(rollup, {
      leadModel: 'grok-4.6',
      complementModel: 'z-ai/glm-5.2',
      merged: true,
      leadOnly: false,
      complementOnly: false,
      disagreed: true,
      extras: { statutes: ['INA 214(b)'], urls: [] },
    })
    expect(formatEnginePairTape(rollup)).toBe('Grok 4.6 + GLM, disagreed, merged, extras:1')
    expect(formatEngineRunSummary({
      plans: 10,
      pair: formatEnginePairTape(rollup),
    })).toContain('pair=Grok 4.6 + GLM, disagreed, merged, extras:1')
  })
})

describe('provider order defaults', () => {
  it('moves NVIDIA Nemotron to the front of a saved drafting order', () => {
    const next = nemotronFirstProviderOrder(JSON.stringify([
      'baseten-deepseek', 'nvidia-nemotron', 'grok', 'parasail-deepseek',
    ]))
    expect(JSON.parse(next)[0]).toBe('nvidia-nemotron')
  })

  it('keeps the legacy Parasail order helper available for explicit callers', () => {
    const next = parasailFirstProviderOrder(JSON.stringify([
      'baseten-deepseek', 'nvidia-nemotron', 'grok', 'parasail-deepseek',
    ]))
    expect(JSON.parse(next)[0]).toBe('parasail-deepseek')
  })
})
