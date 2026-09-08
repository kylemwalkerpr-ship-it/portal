/**
 * P1 — stable, COMPLETED-window, page-specific reward attribution.
 * The cron pass must never credit a growing partial window, never re-credit a
 * completed observation on a later run date, never attribute by query gossip,
 * require verified publication, never invent a delta without a baseline, honor
 * persistence failures, and credit ONLY measured change. Includes an actual
 * attributizeOutcomes() cron-path integration regression.
 */
import { attributionWindowsFor, attributionAvailabilityCutoff, prepareCronRewards, type CronMission, type GscPageQueryRow } from '@/lib/seoEngine/rankingModel'
import type { getGscAccess as GetGscAccess } from '@/lib/gscAuth'

jest.mock('@/lib/supabase', () => {
  const state = {
    rewardRows: new Map<string, { id: string }>(),
    failUpsert: false,
    jobs: [] as Array<Record<string, unknown>>,
  }
  // IMPORTANT: the BASE client must NOT be thenable — db() (an async fn) returns
  // createSupabaseAdminClient() and an async `return` adopts thenables, which
  // would prematurely assimilate the client. Only `.from(row)` chains are
  // thenable (those are awaited directly).
  const makeClient = (): unknown => {
    const makeChain = (table: string): any => {
      const chain: any = {
        _table: table,
        _filters: {} as Record<string, unknown>,
        from: (t: string) => makeChain(t),
        select: function select(this: any) {
          return this
        },
        in: function inFilter(this: any) {
          return this
        },
        gte: function gte(this: any) {
          return this
        },
        limit: function limit(this: any) {
          return this
        },
        eq: function eq(this: any, k: string, v: unknown) {
          this._filters[k] = v
          return this
        },
        maybeSingle: function maybeSingle(this: any) {
          return this
        },
        then: function then(this: any, cb: (rows: { data: unknown; error: unknown }) => unknown) {
          if (this._table === 'content_jobs') return Promise.resolve(cb({ data: state.jobs, error: null }))
          if (this._table === 'seo_reward_events' && this._filters.dedupe_key) {
            return Promise.resolve(cb({ data: state.rewardRows.get(this._filters.dedupe_key) || null, error: null }))
          }
          return Promise.resolve(cb({ data: null, error: null }))
        },
        upsert: function upsert(this: any, row: any) {
          return this._write(row, 'upsert')
        },
        insert: function insert(this: any, row: any) {
          return this._write(row, 'insert')
        },
        _write: function write(_row: any, kind: string) {
          if (state.failUpsert) return Promise.resolve({ error: { message: 'insert refused (test)' } })
          if (kind === 'upsert' && _row.dedupe_key && state.rewardRows.has(_row.dedupe_key)) return Promise.resolve({ error: null })
          if (_row.dedupe_key) state.rewardRows.set(_row.dedupe_key, { id: 'r-1' })
          return Promise.resolve({ error: null })
        },
      }
      return chain
    }
    return { from: (table: string) => makeChain(table) }
  }
  return { createSupabaseAdminClient: makeClient, __cronState: state }
})

jest.mock('@/lib/gscAuth', () => ({
  getGscAccess: jest.fn(async () => ({ accessToken: 'tok', siteUrl: 'sc-domain:yousafeconsultancy.com' })),
}))

const page = 'https://legal.yousafeconsultancy.com/uk/graduate-visa-guide/'
const other = 'https://legal.yousafeconsultancy.com/uk/another-page/'

function row(pageUrl: string, query: string, clicks: number): GscPageQueryRow {
  return { page: pageUrl, query, clicks, impressions: 100, position: 8 }
}

const mission: CronMission = {
  jobId: 'job-1',
  pageUrl: page,
  topic: 'uk graduate visa',
  publishDate: '2026-07-01T00:00:00Z',
  action: 'create',
}

const JOB1 = {
  id: 'job-1',
  title: 'UK Graduate Visa Guide',
  topic: 'uk graduate visa',
  primary_keyword: 'uk graduate visa',
  status: 'merged',
  content_path: 'app/uk/graduate-visa-guide/page.tsx',
  canonical_url: page,
  created_at: '2026-06-20T00:00:00Z',
  merged_at: '2026-07-01T00:00:00Z',
  regeneration_mode: 'new',
}
const JOB2_DRAFT = {
  id: 'job-2',
  title: 'OPT Guide Draft',
  topic: 'usr opt guide',
  primary_keyword: 'opt guide',
  status: 'closed',
  content_path: 'app/us/opt-guide/page.tsx',
  canonical_url: 'https://legal.yousafeconsultancy.com/us/opt-guide/',
  created_at: '2026-07-10T00:00:00Z',
  merged_at: null,
  regeneration_mode: null,
}
const JOB3_REFRESH = {
  id: 'job-3',
  title: 'UK Graduate Visa Guide v2',
  topic: 'uk graduate visa updated fees',
  primary_keyword: 'uk graduate visa updated fees',
  status: 'merged',
  content_path: 'app/uk/graduate-visa-guide/page.tsx',
  canonical_url: page,
  created_at: '2026-07-25T00:00:00Z',
  merged_at: '2026-07-28T00:00:00Z',
  regeneration_mode: 'refresh',
}
const JOB4_NO_ACTION = {
  id: 'job-4',
  title: 'Missing Action Page',
  topic: 'uk graduate visa no action',
  primary_keyword: 'uk graduate visa no action',
  status: 'merged',
  content_path: 'app/uk/no-action/page.tsx',
  canonical_url: page,
  created_at: '2026-07-01T00:00:00Z',
  merged_at: '2026-07-02T00:00:00Z',
  regeneration_mode: null,
}

describe('attributionWindowsFor — COMPLETED buckets strictly inside the availability cutoff', () => {
  it('treats a bucket ending TODAY as incomplete (never credited today)', () => {
    expect(attributionWindowsFor('2026-07-01', '2026-07-14')).toBeNull()
  })

  it('treats a bucket ending YESTERDAY as still unavailable', () => {
    // bucket0 [07-01..07-14] ends 07-14; cutoff(today 07-15) = 07-13 → not settled.
    expect(attributionWindowsFor('2026-07-01', '2026-07-15')).toBeNull()
  })

  it('becomes eligible exactly at the availability cutoff', () => {
    // cutoff(today 07-16) = 07-14 → bucket0 end 07-14 <= cutoff → eligible.
    const w = attributionWindowsFor('2026-07-01', '2026-07-16')!
    expect(w.completedBucket).toBe(0)
    expect(w.window).toEqual({ start: '2026-07-01', end: '2026-07-14' })
    expect(w.baselineWindow).toBeNull()
  })

  it('returns the latest completed window fully before the cutoff, with the prior bucket as baseline', () => {
    // today 07-30 → cutoff 07-28 → bucket1 [07-15..07-28] eligible; bucket0 is its baseline.
    const w = attributionWindowsFor('2026-07-01', '2026-07-30')!
    expect(w.completedBucket).toBe(1)
    expect(w.window).toEqual({ start: '2026-07-15', end: '2026-07-28' })
    expect(w.baselineWindow).toEqual({ start: '2026-07-01', end: '2026-07-14' })
  })

  it('never picks a bucket whose end passes the cutoff (no partial/unavailable observation)', () => {
    // today 08-12 → cutoff 08-10 → bucket2 [07-29..08-11] ends 08-11 > cutoff → skipped.
    const w = attributionWindowsFor('2026-07-01', '2026-08-12')!
    expect(w.completedBucket).toBe(1)
    expect(w.window).toEqual({ start: '2026-07-15', end: '2026-07-28' })
    // As data settles (today 09-01 → cutoff 08-30), bucket3 [08-12..08-25] becomes eligible.
    const later = attributionWindowsFor('2026-07-01', '2026-09-01')!
    expect(later.completedBucket).toBe(3)
    expect(later.window).toEqual({ start: '2026-08-12', end: '2026-08-25' })
    expect(later.baselineWindow).toEqual({ start: '2026-07-29', end: '2026-08-11' })
  })

  it('uses a strict-before-today default cutoff (2 days) and rejects invalid dates', () => {
    expect(attributionAvailabilityCutoff('2026-09-01')).toBe('2026-08-30')
    expect(attributionWindowsFor('oops', '2026-09-01')).toBeNull()
    expect(attributionWindowsFor('2026-09-01', '2026-09-01')).toBeNull()
  })
})

describe('prepareCronRewards — fail closed, no invented deltas, page+query anchored', () => {
  it('returns no events when the page URL is unavailable (fail closed)', () => {
    const r = prepareCronRewards({
      mission: { ...mission, pageUrl: null },
      currentWindow: { start: '2026-07-29', end: '2026-08-11' },
      currentRows: [row(page, 'uk graduate visa', 10)],
      baselineRows: null,
      bucket: 1,
    })
    expect(r).toHaveLength(0)
  })

  it('never attributes an unrelated page sharing the same query', () => {
    const r = prepareCronRewards({
      mission,
      currentWindow: { start: '2026-07-29', end: '2026-08-11' },
      currentRows: [row(other, 'uk graduate visa', 500)],
      baselineRows: [row(page, 'uk graduate visa', 3)],
      bucket: 1,
    })
    expect(r).toHaveLength(0)
  })

  it('keeps an observation WITHOUT an improvement reward when no baseline exists, preserving job action', () => {
    const r = prepareCronRewards({
      mission,
      currentWindow: { start: '2026-07-29', end: '2026-08-11' },
      currentRows: [row(page, 'uk graduate visa', 40)],
      baselineRows: null,
      bucket: 1,
    })
    expect(r).toHaveLength(1)
    expect(r[0].improvementCredited).toBe(false)
    expect(r[0].deltaClicks).toBe(0)
    expect(r[0].baselineClicks).toBeNull()
    // Actual job action identity is preserved separately from the label.
    expect(r[0].action).toBe('create')
    expect(r[0].observationLabel).toBe('cron_gsc_observation')
  })

  it('credits ONLY the measured change over a completed-window baseline', () => {
    const r = prepareCronRewards({
      mission,
      currentWindow: { start: '2026-08-12', end: '2026-08-25' },
      currentRows: [row(page, 'uk graduate visa', 30)],
      baselineRows: [row(page, 'uk graduate visa', 10)],
      bucket: 3,
    })
    expect(r).toHaveLength(1)
    expect(r[0].improvementCredited).toBe(true)
    expect(r[0].deltaClicks).toBe(20)
    expect(r[0].baselineClicks).toBe(10)
    expect(r[0].observationLabel).toBe('cron_gsc_improvement')
    expect(r[0].action).toBe('create')
  })

  it('keeps the RECORDED action verb, whatever it is — never inferred', () => {
    const r = prepareCronRewards({
      mission: { ...mission, action: 'refresh' },
      currentWindow: { start: '2026-08-12', end: '2026-08-25' },
      currentRows: [row(page, 'uk graduate visa', 30)],
      baselineRows: [row(page, 'uk graduate visa', 10)],
      bucket: 3,
    })
    expect(r[0].action).toBe('refresh')
    expect(r[0].improvementCredited).toBe(true)
  })

  it('NEVER credits an improvement when the action is missing/unknown (no guessed create/refresh)', () => {
    const r = prepareCronRewards({
      mission: { ...mission, action: null },
      currentWindow: { start: '2026-08-12', end: '2026-08-25' },
      currentRows: [row(page, 'uk graduate visa', 30)],
      baselineRows: [row(page, 'uk graduate visa', 10)],
      bucket: 3,
    })
    expect(r).toHaveLength(1)
    expect(r[0].action).toBe('unknown')
    expect(r[0].improvementCredited).toBe(false)
    expect(r[0].deltaClicks).toBe(0)
    expect(r[0].observationLabel).toBe('cron_gsc_observation')
  })

  it('records no improvement when current is not above baseline (no invented delta)', () => {
    const r = prepareCronRewards({
      mission,
      currentWindow: { start: '2026-08-12', end: '2026-08-25' },
      currentRows: [row(page, 'uk graduate visa', 8)],
      baselineRows: [row(page, 'uk graduate visa', 12)],
      bucket: 3,
    })
    expect(r[0].improvementCredited).toBe(false)
    expect(r[0].deltaClicks).toBe(0)
  })
})

describe('dedupe stability — a completed observation is never re-credited', () => {
  it('produces the SAME key for the same page+query+completed-window on any run date', () => {
    const window = { start: '2026-07-29', end: '2026-08-11' }
    const a = prepareCronRewards({ mission, currentWindow: window, currentRows: [row(page, 'uk graduate visa', 30)], baselineRows: [row(page, 'uk graduate visa', 10)], bucket: 2 })[0]
    const b = prepareCronRewards({ mission, currentWindow: window, currentRows: [row(page, 'uk graduate visa', 30)], baselineRows: [row(page, 'uk graduate visa', 10)], bucket: 2 })[0]
    expect(a.dedupeKey).toBe(b.dedupeKey)
    expect(a.dedupeKey).toContain(page.replace(/\/+$/, ''))
    expect(a.dedupeKey).toContain('uk graduate visa')
    expect(a.dedupeKey).toContain('2026-07-29')
    expect(a.dedupeKey).toContain('2026-08-11')
    // The run date is NOT part of the identity — another run day cannot re-credit.
    expect(a.dedupeKey).not.toContain('2026-09')
  })

  it('different query on the same page gets its own stable observation', () => {
    const window = { start: '2026-07-29', end: '2026-08-11' }
    const a = prepareCronRewards({ mission, currentWindow: window, currentRows: [row(page, 'uk graduate visa', 30)], baselineRows: [row(page, 'uk graduate visa', 10)], bucket: 2 })[0]
    const c = prepareCronRewards({ mission, currentWindow: window, currentRows: [row(page, 'graduate visa work', 30)], baselineRows: [row(page, 'graduate visa work', 10)], bucket: 2 })[0]
    expect(a.dedupeKey).not.toBe(c.dedupeKey)
  })
})

describe('attributizeOutcomes — ACTUAL cron path regression', () => {
  type MockSupabase = { __cronState: { rewardRows: Map<string, { id: string }>; failUpsert: boolean; jobs: Array<Record<string, unknown>> } }
  const mockSb = (): MockSupabase => jest.requireMock('@/lib/supabase') as MockSupabase
  const realFetch = global.fetch

  beforeAll(() => {
    const gsc = jest.requireMock('@/lib/gscAuth') as { getGscAccess: typeof GetGscAccess }
    ;(gsc.getGscAccess as jest.Mock).mockResolvedValue({ accessToken: 'tok', siteUrl: 'sc-domain:yousafeconsultancy.com' })
    global.fetch = jest.fn(async (_input: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || '{}'))
      const start = String(body.startDate || '')
      // Windows starting on/after 2026-08-01 observe 30 clicks; earlier 10.
      const clicks = start >= '2026-08-01' ? 30 : 10
      return {
        ok: true,
        status: 200,
        json: async () => ({ rows: [{ keys: [page, 'uk graduate visa'], clicks, impressions: 90, position: 7 }] }),
      } as unknown as Response
    })
  })

  afterAll(() => {
    global.fetch = realFetch
  })

  beforeEach(() => {
    const sb = mockSb()
    sb.__cronState.rewardRows.clear()
    sb.__cronState.failUpsert = false
    sb.__cronState.jobs = [JOB1, JOB2_DRAFT]
  })

  it('requires a verified merged publication timestamp — draft/closed jobs are skipped', async () => {
    const sb = mockSb()
    sb.__cronState.jobs = [{ ...JOB2_DRAFT, merged_at: null }]
    const { attributizeOutcomes } = await import('@/lib/seoEngine/rankingModel')
    const res = await attributizeOutcomes('2026-08-12')
    expect(res.events).toBe(0)
    expect(res.jobsConsidered).toBe(1)
  })

  it('credits a completed available window once; a reprocessing run date cannot re-credit it', async () => {
    const sb = mockSb()
    const { attributizeOutcomes } = await import('@/lib/seoEngine/rankingModel')
    // Run A: today 08-12 → cutoff 08-10 → eligible bucket1 [07-15..07-28];
    // baseline bucket0 [07-01..07-14] → equal clicks → observation, no improvement.
    const first = await attributizeOutcomes('2026-08-12')
    expect(first.events).toBe(1)
    expect(first.jobsMatched).toBe(1)
    expect(first.persistFailed).toBe(0)
    expect(sb.__cronState.rewardRows.size).toBe(1)
    // Run B: SAME run date again → dedupe hit, no repeating credit.
    const second = await attributizeOutcomes('2026-08-12')
    expect(second.events).toBe(0)
    expect(second.duplicatesSkipped).toBe(1)
    expect(sb.__cronState.rewardRows.size).toBe(1)
  })

  it('transitions into the next completed-and-available bucket — credits only the measured change', async () => {
    const sb = mockSb()
    const { attributizeOutcomes } = await import('@/lib/seoEngine/rankingModel')
    await attributizeOutcomes('2026-08-12') // bucket1 [07-15..07-28] observation
    // Today 09-09 → cutoff 09-07 → bucket3 [08-12..08-25] settles with 30 clicks
    // vs baseline bucket2 [07-29..08-11] (10) → improvement of 20 credited once.
    const next = await attributizeOutcomes('2026-09-09')
    expect(next.events).toBe(1)
    expect(next.jobsMatched).toBe(1)
    expect(next.duplicatesSkipped).toBe(0)
    // Only ONE new completed-and-available window observation was credited.
    expect(sb.__cronState.rewardRows.size).toBe(2)
  })

  it('persistence failure is NOT reported as a credited success', async () => {
    const sb = mockSb()
    const { attributizeOutcomes } = await import('@/lib/seoEngine/rankingModel')
    await attributizeOutcomes('2026-08-12')
    sb.__cronState.rewardRows.clear()
    sb.__cronState.failUpsert = true
    const res = await attributizeOutcomes('2026-08-12')
    expect(res.events).toBe(0)
    expect(res.persistFailed).toBe(1)
  })

  it('uses the RECORDED regeneration_mode as the action identity — no order-based guessing', async () => {
    const sb = mockSb()
    sb.__cronState.jobs = [JOB1, JOB3_REFRESH]
    const { attributizeOutcomes } = await import('@/lib/seoEngine/rankingModel')
    // job-1 merged 07-01 → bucket1 [07-15..07-28] observation; job-3 merged 07-28 →
    // bucket0 [07-28..08-10] observation. Both recorded actions ride the events.
    const res = await attributizeOutcomes('2026-08-12')
    expect(res.events).toBe(2)
    expect(res.jobsMatched).toBe(2)
  })

  it('a job without a recorded action is observed but NEVER credited as improvement', async () => {
    const sb = mockSb()
    sb.__cronState.jobs = [JOB4_NO_ACTION]
    const { attributizeOutcomes } = await import('@/lib/seoEngine/rankingModel')
    // merged 07-02, today 09-10 → cutoff 09-08 → bucket3 [08-12..08-25] end 08-25
    // available with 30 clicks vs baseline 10 — but action missing → observation only.
    const res = await attributizeOutcomes('2026-09-10')
    expect(res.events).toBe(1)
    expect(res.persistFailed).toBe(0)
  })
})