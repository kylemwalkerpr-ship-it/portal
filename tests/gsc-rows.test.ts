import {
  dedupeGscMetricRows,
  gscRowUniqueKey,
  normalizeGscMetricRow,
  paginateGscDimensionPages,
  toSeoGscInsert,
  upsertSeoGscRows,
  type GscMetricRow,
} from '@/lib/seoFactory/gscRows'
import { resolveGscDayWindow } from '@/lib/gscAnalytics'

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
