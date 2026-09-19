import { runForecastRewardPass } from '@/lib/seoEngine/forecastReward'

jest.mock('@/lib/seoEngine/forecastTracker', () => ({
  normalizeTerm: (term: string) => String(term || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(),
  loadForecastTracker: jest.fn(async () => ({
    rows: [{
      topic: 'uk student visa process',
      subjectKey: 'plan:uk-student',
      runDate: '2026-07-01',
      horizonDays: 30,
      maturityDate: '2026-07-31',
      matured: true,
      daysElapsed: 30,
      daysToMaturity: 0,
      projected: { position: 10, impressions: 100, clicks: 10, probabilityTop10: 0.5 },
      actual: { position: 8, impressions: 140, clicks: 14, source: 'snapshot', asOf: '2026-07-31' },
      deltas: { position: -2, impressions: 40, clicks: 4 },
      verdicts: { position: 'under_predicted' },
      overall: 'under_predicted',
      magnitude: 0.4,
      flags: [],
    }],
    summary: {
      evaluated: 1,
      inFlight: 0,
      noData: 0,
      onTrackRate: 0,
      positionBias: -2,
      avgPositionError: 2,
      avgImpressionError: 0.4,
      byVerdict: { over_predicted: 0, under_predicted: 1, on_track: 0, mixed: 0, no_data: 0 },
      perHorizon: {},
      worstMisses: [],
      bestSurprises: [],
    },
  })),
}))

jest.mock('@/lib/seoEngine/rankingModel', () => {
  const actual = jest.requireActual('@/lib/seoEngine/rankingModel')
  return {
    ...actual,
    persistRewardEvent: jest.fn(async () => ({ ok: true })),
    recordCalibration: jest.fn(async () => ({ ok: true })),
    loadCalibrationHistory: jest.fn(async () => []),
    recalibrateFromObservedRewards: jest.fn(async () => ({
      eligible: 0,
      recalibrated: false,
      weightsChanged: false,
      weights: actual.FAMILY_WEIGHTS,
    })),
  }
})

jest.mock('@/lib/supabase', () => ({
  createSupabaseAdminClient: () => {
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      limit: async () => ({ data: [], error: null }),
    }
    return { from: () => chain }
  },
}))

describe('P1 forecast diagnostics never become training rewards', () => {
  beforeEach(() => jest.clearAllMocks())

  it('evaluates generic forecast drift without writing reward or calibration rows', async () => {
    const ranking = jest.requireMock('@/lib/seoEngine/rankingModel') as {
      persistRewardEvent: jest.Mock
      recordCalibration: jest.Mock
      recalibrateFromObservedRewards: jest.Mock
    }
    const result = await runForecastRewardPass({ now: '2026-08-09', limit: 20 })
    expect(result.evaluated).toBe(1)
    expect(result.events).toBe(0)
    expect(result.recalibrated).toBe(false)
    expect(result.weightsChanged).toBe(false)
    expect(ranking.persistRewardEvent).not.toHaveBeenCalled()
    expect(ranking.recordCalibration).not.toHaveBeenCalled()
    expect(ranking.recalibrateFromObservedRewards).toHaveBeenCalledTimes(1)
  })
})
