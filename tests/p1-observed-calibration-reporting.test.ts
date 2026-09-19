jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}))

jest.mock('@/lib/portalAuth', () => ({
  requireAdminUser: jest.fn(async () => ({ user: { id: 'admin' } })),
}))

jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }))

import { createClient } from '@supabase/supabase-js'
import { GET } from '@/app/api/content-studio/model-calibration/route'

const legacy = {
  id: 'legacy-newer',
  model_version: 'seo-ranking-model-v1',
  events_count: 20,
  note: 'weekly forecast-reward pass · action forecast_accuracy',
  weights: { demand: 0.9 },
  recalibrated_at: '2026-09-21T00:00:00.000Z',
}

const observedLatest = {
  id: 'observed-latest',
  model_version: 'seo-ranking-model-v1',
  events_count: 7,
  note: 'observed-reward calibration · 7 verified improvements · through 2026-09-20T07:00:00.000Z',
  weights: { demand: 0.3 },
  recalibrated_at: '2026-09-20T08:00:00.000Z',
}

const observedPrevious = {
  id: 'observed-previous',
  model_version: 'seo-ranking-model-v1',
  events_count: 5,
  note: 'observed-reward calibration · 5 verified improvements · through 2026-09-19T05:00:00.000Z',
  weights: { demand: 0.25 },
  recalibrated_at: '2026-09-19T06:00:00.000Z',
}

function queryFor(table: string) {
  const result =
    table === 'seo_model_calibration'
      ? { data: [legacy, observedLatest, observedPrevious], error: null }
      : table === 'seo_forecast_runs'
        ? { data: null, error: null, count: 4 }
        : table === 'seo_reward_events'
          ? { data: [{ direction_match: true }, { direction_match: false }], error: null }
          : { data: [], error: null }

  const chain: any = {
    select: () => chain,
    order: () => chain,
    limit: () => chain,
    like: () => chain,
    gte: () => chain,
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
  }
  return chain
}

describe('P1 observed calibration reporting', () => {
  beforeEach(() => {
    ;(createClient as jest.Mock).mockImplementation(() => ({
      from: (table: string) => queryFor(table),
    }))
  })

  it('never presents a newer legacy forecast calibration as the current model calibration', async () => {
    const res = await GET(new Request('https://portal.example/api/content-studio/model-calibration'))
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.ok).toBe(true)
    expect(body.lastCalibratedAt).toBe(observedLatest.recalibrated_at)
    expect(body.eventsCount).toBe(7)
    expect(body.calibrationNote).toBe(observedLatest.note)
    expect(body.previousCalibratedAt).toBe(observedPrevious.recalibrated_at)
    expect(body.lastCalibratedAt).not.toBe(legacy.recalibrated_at)
  })
})
