import {
  FAMILY_WEIGHTS,
  isObservedCalibrationRow,
  isTrainingEligibleRewardRow,
  trainingRewardEventFromRow,
} from '@/lib/seoEngine/rankingModel'

const verified = {
  id: 'verified-1',
  model_version: 'seo-ranking-model-v1',
  page_url: 'https://legal.yousafeconsultancy.com/uk/graduate-visa/',
  topic: 'uk graduate visa',
  action: 'refresh',
  query: 'uk graduate visa',
  window_start: '2026-08-01',
  window_end: '2026-08-14',
  baseline_clicks: 2,
  delta_clicks: 3,
  delta_impressions: 0,
  delta_position: 0,
  improvement_credited: true,
  observation_label: 'cron_gsc_improvement',
  reward: 0.12,
  attribution: { behavioral: 0.1 },
  observed_at: '2026-08-17T00:00:00.000Z',
  dedupe_key: 'cron-attr:https://legal.yousafeconsultancy.com/uk/graduate-visa:uk graduate visa:2026-08-01:2026-08-14',
}

describe('P1 observed-reward training boundary', () => {
  it('accepts only intervention-bound verified positive improvements', () => {
    expect(isTrainingEligibleRewardRow(verified)).toBe(true)
  })

  it('reconstructs training events only from eligible persisted evidence', () => {
    const event = trainingRewardEventFromRow(verified)
    expect(event).toMatchObject({
      id: 'verified-1',
      pageUrl: verified.page_url,
      query: verified.query,
      windowStart: verified.window_start,
      windowEnd: verified.window_end,
      baselineClicks: 2,
      improvementCredited: true,
      observationLabel: 'cron_gsc_improvement',
      reward: 0.12,
      attribution: { behavioral: 0.1 },
    })
    expect(trainingRewardEventFromRow({ ...verified, page_url: 'forecast:fake' })).toBeNull()
  })

  it.each([
    ['legacy forecast', { ...verified, page_url: 'forecast:uk graduate visa', query: null, window_start: null, window_end: null, baseline_clicks: null, improvement_credited: false, observation_label: null, action: 'forecast_accuracy' }],
    ['manual note', { ...verified, observation_label: 'manual_unverified', improvement_credited: false }],
    ['plain observation', { ...verified, observation_label: 'cron_gsc_observation', improvement_credited: false, reward: 0 }],
    ['missing query', { ...verified, query: null }],
    ['missing window', { ...verified, window_start: null }],
    ['missing baseline', { ...verified, baseline_clicks: null }],
    ['unknown action', { ...verified, action: 'unknown' }],
    ['no measured gain', { ...verified, delta_clicks: 0 }],
    ['missing cron dedupe identity', { ...verified, dedupe_key: null }],
    ['missing attributed family credit', { ...verified, attribution: {} }],
  ])('rejects %s from training', (_label, row) => {
    expect(isTrainingEligibleRewardRow(row)).toBe(false)
  })

  it('treats only observed-reward calibration rows as active model weights', () => {
    const legacy = {
      weights: { ...FAMILY_WEIGHTS, demand: 0.181 },
      events_count: 8,
      note: 'weekly forecast-reward pass · 9 evaluated · action forecast_accuracy',
      recalibrated_at: '2026-08-19T04:28:39Z',
    }
    const safe = {
      weights: { ...FAMILY_WEIGHTS, demand: 0.19 },
      events_count: 6,
      note: 'observed-reward calibration · 6 verified improvements · through 2026-09-20T00:00:00.000Z',
      recalibrated_at: '2026-09-20T00:00:00Z',
    }
    expect(isObservedCalibrationRow(legacy)).toBe(false)
    expect(isObservedCalibrationRow(safe)).toBe(true)
  })
})
