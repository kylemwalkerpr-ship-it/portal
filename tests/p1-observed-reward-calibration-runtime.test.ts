import {
  FAMILY_WEIGHTS,
  OBSERVED_REWARD_CALIBRATION_PREFIX,
  recalibrateFromObservedRewards,
} from '@/lib/seoEngine/rankingModel'

jest.mock('@/lib/supabase', () => {
  const state = {
    rewards: [] as Array<Record<string, unknown>>,
    calibrations: [] as Array<Record<string, unknown>>,
    calibrationWrites: [] as Array<Record<string, unknown>>,
    calibrationReadError: false,
    rewardReadError: false,
  }

  const makeChain = (table: string): any => {
    const filters: Record<string, unknown> = {}
    const orders: Array<{ field: string; ascending: boolean }> = []
    let limitN = 1000
    let rangeStart: number | null = null
    let rangeEnd: number | null = null
    const chain: any = {
      select: () => chain,
      eq: (key: string, value: unknown) => {
        filters['eq:' + key] = value
        return chain
      },
      gt: (key: string, value: unknown) => {
        filters['gt:' + key] = value
        return chain
      },
      like: (key: string, value: unknown) => {
        filters['like:' + key] = value
        return chain
      },
      order: (field: string, opts?: { ascending?: boolean }) => {
        orders.push({ field, ascending: opts?.ascending !== false })
        return chain
      },
      limit: (value: number) => {
        limitN = value
        return chain
      },
      range: (from: number, to: number) => {
        rangeStart = from
        rangeEnd = to
        return chain
      },
      insert: async (row: Record<string, unknown>) => {
        if (table === 'seo_model_calibration') {
          const stored = {
            ...row,
            id: 'cal-' + (state.calibrations.length + 1),
            recalibrated_at: '2026-09-21T00:00:00.000Z',
          }
          state.calibrations.unshift(stored)
          state.calibrationWrites.push(stored)
        }
        return { error: null }
      },
      then: (resolve: (value: { data: unknown; error: unknown }) => unknown) => {
        if (table === 'seo_model_calibration' && state.calibrationReadError) {
          return Promise.resolve(resolve({ data: null, error: { message: 'calibration read failed' } }))
        }
        if (table === 'seo_reward_events' && state.rewardReadError) {
          return Promise.resolve(resolve({ data: null, error: { message: 'reward read failed' } }))
        }
        let rows =
          table === 'seo_reward_events'
            ? [...state.rewards]
            : table === 'seo_model_calibration'
              ? [...state.calibrations]
              : []
        for (const [key, expected] of Object.entries(filters)) {
          const [op, field] = key.split(':')
          if (op === 'eq') rows = rows.filter((row) => row[field] === expected)
          if (op === 'like') {
            const pattern = String(expected)
            const prefix = pattern.endsWith('%') ? pattern.slice(0, -1) : pattern
            rows = rows.filter((row) => String(row[field] || '').startsWith(prefix))
          }
          if (op === 'gt') {
            rows = rows.filter((row) => {
              const actual = row[field]
              const actualTime = typeof actual === 'string' ? Date.parse(actual) : Number.NaN
              const expectedTime = typeof expected === 'string' ? Date.parse(expected) : Number.NaN
              if (Number.isFinite(actualTime) && Number.isFinite(expectedTime)) return actualTime > expectedTime
              return Number(actual) > Number(expected)
            })
          }
        }
        if (orders.length) {
          rows.sort((a, b) => {
            for (const order of orders) {
              const left = String(a[order.field] ?? '')
              const right = String(b[order.field] ?? '')
              const cmp = left.localeCompare(right)
              if (cmp) return order.ascending ? cmp : -cmp
            }
            return 0
          })
        }
        const sliced = rangeStart == null || rangeEnd == null
          ? rows.slice(0, limitN)
          : rows.slice(rangeStart, rangeEnd + 1)
        return Promise.resolve(resolve({ data: sliced, error: null }))
      },
    }
    return chain
  }

  return {
    createSupabaseAdminClient: () => ({ from: (table: string) => makeChain(table) }),
    __rewardCalibrationState: state,
  }
})

type MockState = {
  rewards: Array<Record<string, unknown>>
  calibrations: Array<Record<string, unknown>>
  calibrationWrites: Array<Record<string, unknown>>
  calibrationReadError: boolean
  rewardReadError: boolean
}

function eligible(id: string, action: string, reward: number, family: string, observedAt: string) {
  return {
    id,
    model_version: 'seo-ranking-model-v1',
    page_url: 'https://legal.yousafeconsultancy.com/guide/' + id + '/',
    topic: id,
    action,
    query: id + ' query',
    window_start: '2026-08-01',
    window_end: '2026-08-14',
    baseline_clicks: 1,
    delta_clicks: Math.max(1, Math.round(reward * 10)),
    delta_impressions: 0,
    delta_position: 0,
    improvement_credited: true,
    observation_label: 'cron_gsc_improvement',
    reward,
    attribution: { [family]: reward * 0.8 },
    dedupe_key: 'cron-attr:' + id,
    observed_at: observedAt,
  }
}

describe('P1 observed-only calibration runtime', () => {
  const state = () =>
    (jest.requireMock('@/lib/supabase') as { __rewardCalibrationState: MockState }).__rewardCalibrationState

  beforeEach(() => {
    state().rewards = []
    state().calibrations = []
    state().calibrationWrites = []
    state().calibrationReadError = false
    state().rewardReadError = false
  })

  it('ignores legacy calibration lineage and refuses insufficient/unverified evidence', async () => {
    state().calibrations = [{
      id: 'legacy-cal',
      weights: { ...FAMILY_WEIGHTS, demand: 0.5 },
      events_count: 8,
      note: 'weekly forecast-reward pass · action forecast_accuracy',
      recalibrated_at: '2026-08-19T00:00:00Z',
    }]
    state().rewards = [
      { page_url: 'forecast:legacy', action: 'forecast_accuracy', reward: 1, improvement_credited: false },
      eligible('one', 'refresh', 0.8, 'behavioral', '2026-09-19T01:00:00Z'),
      eligible('two', 'refresh', 0.7, 'behavioral', '2026-09-19T02:00:00Z'),
    ]

    const result = await recalibrateFromObservedRewards()
    expect(result.eligible).toBe(2)
    expect(result.recalibrated).toBe(false)
    expect(result.weights.demand).toBe(FAMILY_WEIGHTS.demand)
    expect(state().calibrationWrites).toHaveLength(0)
  })

  it('fails closed when prior calibration state cannot be read', async () => {
    state().rewards = [
      eligible('a', 'refresh', 0.9, 'behavioral', '2026-09-20T01:00:00Z'),
      eligible('b', 'refresh', 0.8, 'behavioral', '2026-09-20T02:00:00Z'),
      eligible('c', 'refresh', 0.7, 'behavioral', '2026-09-20T03:00:00Z'),
      eligible('d', 'new_page', 0.15, 'topicalAuthority', '2026-09-20T04:00:00Z'),
      eligible('e', 'new_page', 0.12, 'topicalAuthority', '2026-09-20T05:00:00Z'),
      eligible('f', 'new_page', 0.1, 'topicalAuthority', '2026-09-20T06:00:00Z'),
    ]
    state().calibrationReadError = true

    const result = await recalibrateFromObservedRewards()
    expect(result.recalibrated).toBe(false)
    expect(result.error).toMatch(/calibration read failed/i)
    expect(state().calibrationWrites).toHaveLength(0)
  })

  it('surfaces reward-evidence read failure as unknown, never as a healthy zero', async () => {
    state().rewardReadError = true
    const result = await recalibrateFromObservedRewards()
    expect(result.recalibrated).toBe(false)
    expect(result.error).toMatch(/reward read failed/i)
    expect(state().calibrationWrites).toHaveLength(0)
  })

  it('uses the processed observation watermark so delayed evidence before recalibration time is not skipped', async () => {
    state().calibrations = [{
      id: 'observed-prior',
      weights: { ...FAMILY_WEIGHTS },
      events_count: 5,
      note: OBSERVED_REWARD_CALIBRATION_PREFIX + ' · 5 verified improvements · weights updated · through 2026-09-20T03:00:00.000Z',
      recalibrated_at: '2026-09-21T00:00:00.000Z',
    }]
    state().rewards = [
      eligible('late-a', 'refresh', 0.9, 'behavioral', '2026-09-20T04:00:00.000Z'),
      eligible('late-b', 'refresh', 0.8, 'behavioral', '2026-09-20T05:00:00.000Z'),
      eligible('late-c', 'refresh', 0.7, 'behavioral', '2026-09-20T06:00:00.000Z'),
      eligible('late-d', 'new_page', 0.2, 'topicalAuthority', '2026-09-20T07:00:00.000Z'),
      eligible('late-e', 'new_page', 0.15, 'topicalAuthority', '2026-09-20T08:00:00.000Z'),
    ]

    const result = await recalibrateFromObservedRewards()
    expect(result.eligible).toBe(5)
    expect(result.recalibrated).toBe(true)
    expect(result.watermark).toBe('2026-09-20T08:00:00.000Z')
    expect(state().calibrationWrites).toHaveLength(1)
  })

  it('paginates beyond 200 eligible observations without skipping evidence', async () => {
    state().rewards = Array.from({ length: 205 }, (_, index) => {
      const observedAt = new Date(Date.UTC(2026, 8, 1, 0, index)).toISOString()
      return eligible('page-' + index, 'refresh', 0.4 + (index % 3) * 0.05, 'behavioral', observedAt)
    })

    const result = await recalibrateFromObservedRewards()
    expect(result.error).toBeUndefined()
    expect(result.eligible).toBe(205)
    expect(result.recalibrated).toBe(true)
    expect(result.watermark).toBe(state().rewards[204].observed_at)
    expect(state().calibrationWrites).toHaveLength(1)
  })

  it('fails closed instead of advancing a watermark past the bounded pagination ceiling', async () => {
    state().rewards = Array.from({ length: 51 }, (_, index) => {
      const observedAt = new Date(Date.UTC(2026, 8, 2, 0, index)).toISOString()
      return eligible('overflow-' + index, 'refresh', 0.5, 'behavioral', observedAt)
    })

    const result = await recalibrateFromObservedRewards(1)
    expect(result.recalibrated).toBe(false)
    expect(result.error).toMatch(/page ceiling/i)
    expect(result.watermark).toBeNull()
    expect(state().calibrationWrites).toHaveLength(0)
  })

  it('writes one safe calibration from differential verified improvements and is idempotent afterward', async () => {
    state().rewards = [
      eligible('a', 'refresh', 0.9, 'behavioral', '2026-09-20T01:00:00Z'),
      eligible('b', 'refresh', 0.8, 'behavioral', '2026-09-20T02:00:00Z'),
      eligible('c', 'refresh', 0.7, 'behavioral', '2026-09-20T03:00:00Z'),
      eligible('d', 'new_page', 0.15, 'topicalAuthority', '2026-09-20T04:00:00Z'),
      eligible('e', 'new_page', 0.12, 'topicalAuthority', '2026-09-20T05:00:00Z'),
      eligible('f', 'new_page', 0.1, 'topicalAuthority', '2026-09-20T06:00:00Z'),
    ]

    const first = await recalibrateFromObservedRewards()
    expect(first.eligible).toBe(6)
    expect(first.recalibrated).toBe(true)
    expect(state().calibrationWrites).toHaveLength(1)
    expect(String(state().calibrationWrites[0].note)).toContain(OBSERVED_REWARD_CALIBRATION_PREFIX)

    const second = await recalibrateFromObservedRewards()
    expect(second.eligible).toBe(0)
    expect(second.recalibrated).toBe(false)
    expect(state().calibrationWrites).toHaveLength(1)
  })
})
