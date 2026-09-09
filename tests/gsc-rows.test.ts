import {
  dedupeGscMetricRows,
  gscRowUniqueKey,
  loadPersistedGscWindow,
  normalizeGscMetricRow,
  paginateGscDimensionPages,
  queriesFromPersistedGscRows,
  toSeoGscInsert,
  upsertSeoGscRows,
  type GscMetricRow,
} from '@/lib/seoFactory/gscRows'
import { resolveGscDayWindow } from '@/lib/gscAnalytics'
import { isJunkQuery } from '@/lib/seoFactory/queryNoise'
import { mergeSnapshotIntoQueries, scoreOpportunities } from '@/lib/seoFactory/opportunityEngine'

describe('GSC query×page rows', () => {
  const ctx = {
    siteUrl: 'sc-domain:yousafeconsultancy.com',
    startDate: '2026-06-06',
    endDate: '2026-09-04',
  }

  it('normalizes a Search Analytics query+page row', () => {
    const row = normalizeGscMetricRow(
      { keys: [' f-1 visa ', 'https://legal.yousafeconsultancy.com/us/f-1/'], clicks: 12, impressions: 400, ctr: 0.03, position: 8.2 },
      ctx,
    )
    expect(row).toMatchObject({
      query: 'f-1 visa',
      page: 'https://legal.yousafeconsultancy.com/us/f-1/',
      clicks: 12,
      impressions: 400,
      siteUrl: ctx.siteUrl,
      startDate: ctx.startDate,
      endDate: ctx.endDate,
    })
    expect(normalizeGscMetricRow({ keys: ['only-query'], clicks: 1 }, ctx)).toBeNull()
  })

  it('dedupes duplicate query+page+range and last write wins', () => {
    const a: GscMetricRow = {
      query: 'f-1 visa',
      page: 'https://example.com/a',
      clicks: 1,
      impressions: 10,
      ctr: 0.1,
      position: 9,
      ...ctx,
    }
    const b = { ...a, clicks: 9, impressions: 90 }
    const out = dedupeGscMetricRows([a, b])
    expect(out).toHaveLength(1)
    expect(out[0].clicks).toBe(9)
    expect(gscRowUniqueKey(a)).toBe(gscRowUniqueKey(b))
    expect(toSeoGscInsert(out[0]).start_date).toBe(ctx.startDate)
  })

  it('paginates until an empty page (two full pages then empty)', async () => {
    const page = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ keys: [`q${i}`, `https://x/${i}`], clicks: 1, impressions: 2 }))
    let calls = 0
    const rows = await paginateGscDimensionPages(
      async (_start, limit) => {
        calls++
        if (calls === 1) return page(limit)
        if (calls === 2) return page(limit)
        return []
      },
      { pageSize: 2, maxRows: 10 },
    )
    expect(calls).toBe(3)
    expect(rows).toHaveLength(4)
  })

  it('upserts on the unique window without duplicating keys', async () => {
    const seen: unknown[] = []
    const db = {
      from: () => ({
        upsert: async (rows: unknown[], opts: { onConflict: string }) => {
          seen.push({ rows, opts })
          return { error: null }
        },
      }),
    }
    const row: GscMetricRow = {
      query: 'opt',
      page: 'https://example.com/opt',
      clicks: 2,
      impressions: 20,
      ctr: 0.1,
      position: 4,
      ...ctx,
    }
    const first = await upsertSeoGscRows(db, [row, row])
    expect(first.upserted).toBe(1)
    expect((seen[0] as { opts: { onConflict: string } }).opts.onConflict).toBe(
      'site_url,query,page,start_date,end_date',
    )
    const second = await upsertSeoGscRows(db, [row])
    expect(second.upserted).toBe(1)
  })

  it('defaults the day window to 90 when days is missing or unknown', () => {
    expect(resolveGscDayWindow(undefined).days).toBe(90)
    expect(resolveGscDayWindow(12).days).toBe(90)
    expect(resolveGscDayWindow(28).days).toBe(28)
  })
})

describe('resolveGscDayWindow stable window (GSC lag)', () => {
  afterEach(() => jest.useRealTimers())

  it('is identical for any two calls inside the same UTC day', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-04T00:01:00Z'))
    const morning = resolveGscDayWindow(90)
    jest.useFakeTimers().setSystemTime(new Date('2026-09-04T23:59:00Z'))
    const evening = resolveGscDayWindow(90)
    expect(evening).toEqual(morning)
  })

  it('shifts the window only at the UTC day boundary', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-04T23:59:59Z'))
    const september4 = resolveGscDayWindow(90)
    jest.useFakeTimers().setSystemTime(new Date('2026-09-05T00:00:00Z'))
    const september5 = resolveGscDayWindow(90)
    expect(september4.endDate).toBe('2026-09-03')
    expect(september5.endDate).toBe('2026-09-04')
    expect(september5.startDate).toBe('2026-06-07')
  })

  it('ends at yesterday UTC and covers exactly `days` calendar dates', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-04T12:00:00Z'))
    const r = resolveGscDayWindow(90)
    expect(r.endDate).toBe('2026-09-03')
    expect(r.startDate).toBe('2026-06-06')
    expect(r.days).toBe(90)
    expect((Date.parse(r.endDate) - Date.parse(r.startDate)) / 86400_000).toBe(89)
  })

  it('still honors explicit start/end overrides', () => {
    expect(resolveGscDayWindow(90, '2026-06-06', '2026-09-04')).toEqual({
      startDate: '2026-06-06',
      endDate: '2026-09-04',
      days: 90,
    })
  })
})

function thenable(result: { data: unknown; error: { message: string } | null }) {
  const api: Record<string, unknown> = {}
  const self = () => api
  api.select = self
  api.eq = self
  api.order = self
  api.limit = self
  api.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject)
  return api
}

function dbSequence(results: Array<{ data: unknown; error: { message: string } | null }>) {
  let i = 0
  return {
    from: () => thenable(results[Math.min(i++, results.length - 1)]),
  }
}

describe('queriesFromPersistedGscRows', () => {
  const PDF_JUNK = '"2026-2027 stockton room and meal plan rates final.pdf" pacific.edu/sites/default/files/users/user2983'

  it('drops junk, keeps the highest-impression page per term, and sorts by demand', () => {
    const rows = [
      {
        query: 'breaking a lease international student',
        page: 'https://legal.yousafeconsultancy.com/us/breaking-a-lease-international-student-us/',
        impressions: 76,
        clicks: 4,
        ctr: 0.053,
        position: 10.4,
      },
      {
        query: 'Breaking a Lease International Student',
        page: 'https://legal.yousafeconsultancy.com/us/weaker-sibling/',
        impressions: 12,
        clicks: 0,
        ctr: 0,
        position: 40,
      },
      {
        query: 'university of bristol international student guide',
        page: 'https://legal.yousafeconsultancy.com/uk/bristol-international-student-guide/',
        impressions: 248,
        clicks: 1,
        ctr: 0.004,
        position: 10.2,
      },
      { query: PDF_JUNK, page: 'https://example.com/pdf', impressions: 900, clicks: 0, ctr: 0, position: 3 },
      { query: '  ', page: 'https://example.com/empty', impressions: 50, clicks: 1, ctr: 0.02, position: 8 },
    ]
    const out = queriesFromPersistedGscRows(rows, isJunkQuery)
    expect(out.map((q) => q.term)).toEqual([
      'university of bristol international student guide',
      'breaking a lease international student',
    ])
    expect(out[1].page).toContain('breaking-a-lease-international-student-us')
    expect(out[1].impressions).toBe(76)
  })
})

describe('loadPersistedGscWindow', () => {
  it('returns the requested window when it has rows', async () => {
    const row = { query: 'f-1 visa', impressions: 400, clicks: 12, ctr: 0.03, position: 8.2 }
    const db = dbSequence([{ data: [row], error: null }])
    const out = await loadPersistedGscWindow(db, {
      siteUrl: null,
      startDate: '2026-06-09',
      endDate: '2026-09-06',
      limit: 50,
    })
    expect(out.usedFallback).toBe(false)
    expect(out.rowCount).toBe(1)
    expect(out.range).toEqual({ startDate: '2026-06-09', endDate: '2026-09-06' })
  })

  it('falls back to the latest stored window when the rolling window is empty', async () => {
    const fallback = {
      query: 'breaking a lease international student',
      page: 'https://legal.yousafeconsultancy.com/us/breaking-a-lease-international-student-us/',
      impressions: 76,
      clicks: 4,
      ctr: 0.053,
      position: 10.4,
    }
    const db = dbSequence([
      { data: [], error: null },
      { data: [{ start_date: '2026-06-09', end_date: '2026-09-06' }], error: null },
      { data: [fallback], error: null },
    ])
    const out = await loadPersistedGscWindow(db, {
      siteUrl: 'sc-domain:yousafeconsultancy.com',
      startDate: '2026-06-12',
      endDate: '2026-09-09',
      limit: 50,
    })
    expect(out.usedFallback).toBe(true)
    expect(out.rowCount).toBe(1)
    expect(out.range).toEqual({ startDate: '2026-06-09', endDate: '2026-09-06' })
    expect(out.rows[0]).toEqual(fallback)
  })
})

describe('persisted GSC fallback feeds Discover suggestions', () => {
  it('turns stored rows into scored opportunities when live/snapshot demand is empty', () => {
    const live: Array<{ term: string; impressions: number; clicks: number; ctr: number; position: number }> = []
    const persisted = queriesFromPersistedGscRows(
      [
        {
          query: 'university of bristol international student guide',
          page: 'https://legal.yousafeconsultancy.com/uk/bristol/',
          impressions: 248,
          clicks: 1,
          ctr: 0.004,
          position: 10.2,
        },
        {
          query: 'breaking a lease international student',
          page: 'https://legal.yousafeconsultancy.com/us/breaking-a-lease-international-student-us/',
          impressions: 76,
          clicks: 4,
          ctr: 0.053,
          position: 10.4,
        },
        {
          query: 'university of the pacific student housing',
          page: 'https://legal.yousafeconsultancy.com/us/pacific-student-housing/',
          impressions: 193,
          clicks: 1,
          ctr: 0.005,
          position: 9.8,
        },
        {
          query: 'university of warwick international student guide',
          page: 'https://legal.yousafeconsultancy.com/uk/warwick/',
          impressions: 189,
          clicks: 1,
          ctr: 0.005,
          position: 13.8,
        },
        {
          query: 'opt stem extension timeline',
          page: 'https://legal.yousafeconsultancy.com/us/opt-stem/',
          impressions: 120,
          clicks: 2,
          ctr: 0.016,
          position: 18,
        },
        {
          query: '"2026-2027 stockton room and meal plan rates final.pdf"',
          page: 'https://example.com/pdf',
          impressions: 900,
          clicks: 0,
          ctr: 0,
          position: 3,
        },
      ],
      isJunkQuery,
    )
    const merged = mergeSnapshotIntoQueries(live, persisted)
    expect(merged.length).toBeGreaterThanOrEqual(5)
    const { opportunities } = scoreOpportunities({ queries: merged, limit: 24 })
    expect(opportunities.length).toBeGreaterThanOrEqual(3)
    expect(opportunities.some((o) => /bristol|lease|warwick|pacific|opt/i.test(o.topic))).toBe(true)
    expect(opportunities.every((o) => !/meal plan|\.pdf/i.test(o.topic))).toBe(true)
  })
})
