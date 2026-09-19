import { NextRequest } from 'next/server'
import { GET, POST } from '@/app/api/seo-engine/rewards/route'

jest.mock('@/lib/portalAuth', () => ({
  requireAdminUser: jest.fn(async () => ({ user: { id: 'admin' } })),
}))

jest.mock('@/lib/seoEngine/rankingModel', () => ({
  FAMILY_WEIGHTS: { demand: 0.2 },
  SIGNAL_FAMILIES: ['demand'],
  actionFamily: () => 'demand',
  creditOutcome: jest.fn((input: Record<string, unknown>) => ({
    ...input,
    id: 'reward-manual',
    modelVersion: 'seo-ranking-model-v1',
    reward: 0.75,
    attribution: { behavioral: 0.6 },
    observedAt: '2026-09-19T00:00:00.000Z',
  })),
  loadCalibrationHistory: jest.fn(async () => [
    {
      id: 'legacy-cal',
      weights: { demand: 0.9 },
      events_count: 9,
      note: 'weekly forecast-reward pass · action forecast_accuracy',
      recalibrated_at: '2026-09-21T00:00:00.000Z',
    },
    {
      id: 'observed-cal',
      weights: { demand: 0.3 },
      events_count: 5,
      note: 'observed-reward calibration · 5 verified improvements · through 2026-09-20T05:00:00.000Z',
      recalibrated_at: '2026-09-20T06:00:00.000Z',
    },
  ]),
  loadObservedCalibrationHistory: jest.fn(async () => [{
    id: 'observed-cal',
    weights: { demand: 0.3 },
    events_count: 5,
    note: 'observed-reward calibration · 5 verified improvements · through 2026-09-20T05:00:00.000Z',
    recalibrated_at: '2026-09-20T06:00:00.000Z',
  }]),
  loadRewardLedger: jest.fn(async () => [
    {
      id: 'legacy',
      page_url: 'forecast:legacy topic',
      topic: 'legacy topic',
      action: 'forecast_accuracy',
      reward: 0.8,
      delta_impressions: 100,
      delta_clicks: 20,
      delta_position: -5,
    },
    {
      id: 'observed',
      page_url: 'https://legal.yousafeconsultancy.com/uk/graduate-visa/',
      topic: 'uk graduate visa',
      action: 'refresh',
      reward: 0.5,
      attribution: { behavioral: 0.4 },
      observation_label: 'cron_gsc_improvement',
      improvement_credited: true,
    },
  ]),
  isObservedCalibrationRow: (row: Record<string, unknown>) =>
    String(row.note || '').startsWith('observed-reward calibration') && Boolean(row.weights),
  isTrainingEligibleRewardRow: (row: Record<string, unknown>) =>
    row.observation_label === 'cron_gsc_improvement' && row.improvement_credited === true,
  persistRewardEvent: jest.fn(async () => ({ ok: true })),
  recalibrateWeights: jest.fn(() => ({ demand: 0.9 })),
  recordCalibration: jest.fn(async () => ({ ok: true })),
}))

describe('P1 manual reward endpoint is explicitly non-training', () => {
  beforeEach(() => jest.clearAllMocks())

  it('reports audit-ledger totals separately from verified training evidence and ignores legacy active weights', async () => {
    const req = new NextRequest('https://portal.example/api/seo-engine/rewards?limit=30')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.weights).toEqual({ demand: 0.3 })
    expect(body.summary.activeCalibration).toBe('2026-09-20T06:00:00.000Z')
    expect(body.summary.audit).toMatchObject({
      events: 2,
      totalReward: 1.3,
      avgReward: 0.65,
    })
    expect(body.summary.training).toMatchObject({
      eligibleEvents: 1,
      totalReward: 0.5,
      avgReward: 0.5,
      attribution: { behavioral: 0.4 },
    })
    expect(body.summary.trainingEligibleEvents).toBe(1)
  })

  it('records arbitrary caller deltas only as an unverified zero-reward note and never recalibrates', async () => {
    const ranking = jest.requireMock('@/lib/seoEngine/rankingModel') as {
      persistRewardEvent: jest.Mock
      recalibrateWeights: jest.Mock
      recordCalibration: jest.Mock
    }
    const req = new NextRequest('https://portal.example/api/seo-engine/rewards', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        pageUrl: 'https://legal.yousafeconsultancy.com/uk/graduate-visa/',
        deltaClicks: 99,
        deltaImpressions: 9999,
        deltaPosition: -20,
        recalibrate: true,
      }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.recalibrated).toBe(false)
    expect(body.trainingEligible).toBe(false)
    expect(body.event).toMatchObject({
      action: 'unknown',
      reward: 0,
      attribution: {},
      observationLabel: 'manual_unverified',
      improvementCredited: false,
    })
    expect(ranking.persistRewardEvent).toHaveBeenCalledTimes(1)
    expect(ranking.recalibrateWeights).not.toHaveBeenCalled()
    expect(ranking.recordCalibration).not.toHaveBeenCalled()
  })
})
