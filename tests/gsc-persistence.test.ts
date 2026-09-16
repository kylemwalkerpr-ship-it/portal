/**
 * P1A measurement truth — one persisted GSC query×page sync shared by the
 * manual sync route and the scheduled daily engine run.
 *
 * Contract locked here:
 *   live        — configured fetch + rows upserted (snapshot best-effort)
 *   empty       — configured live query that legitimately returned zero rows
 *   unavailable — credentials/property missing; NO DB writes
 *   failed      — fetch/upsert actually threw; never a fake success
 *
 * Freshness contract: `syncedAt` is stamped ONLY when rows were successfully
 * persisted (live/empty). Unavailable/failed carry `syncedAt: null` plus an
 * `attemptedAt` for attempt recency — a failed attempt must never look fresh.
 */
import { persistGscQueryPageRows } from '@/lib/seoFactory/gscPersistence'
import { fetchQueryPageRows } from '@/lib/gscAnalytics'
import { upsertSeoGscRows, type GscMetricRow } from '@/lib/seoFactory/gscRows'
import { saveSnapshotVersion } from '@/lib/seoFactory/gscHistory'

jest.mock('@/lib/gscAnalytics', () => ({
  ...jest.requireActual('@/lib/gscAnalytics'),
  fetchQueryPageRows: jest.fn(),
}))
jest.mock('@/lib/seoFactory/gscRows', () => ({
  ...jest.requireActual('@/lib/seoFactory/gscRows'),
  upsertSeoGscRows: jest.fn(),
}))
jest.mock('@/lib/seoFactory/gscHistory', () => ({
  saveSnapshotVersion: jest.fn(),
}))

const fetchRows = fetchQueryPageRows as jest.Mock
const upsert = upsertSeoGscRows as jest.Mock
const saveSnap = saveSnapshotVersion as jest.Mock

const RANGE = { startDate: '2026-06-18', endDate: '2026-09-15', days: 90 }
const SITE = 'sc-domain:yousafeconsultancy.com'
const db = { from: () => ({ upsert: async () => ({ error: null }) }) } as never

function metricRow(query: string): GscMetricRow {
  return {
    query,
    page: `https://legal.yousafeconsultancy.com/${query}`,
    clicks: 1,
    impressions: 10,
    ctr: 0.1,
    position: 5,
    startDate: RANGE.startDate,
    endDate: RANGE.endDate,
    siteUrl: SITE,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('persistGscQueryPageRows', () => {
  it('persists configured live rows through one upsert + snapshot and reports the real window', async () => {
    fetchRows.mockResolvedValue({
      configured: true,
      siteUrl: SITE,
      range: RANGE,
      rows: [metricRow('a'), metricRow('b')],
      warnings: [],
    })
    upsert.mockResolvedValue({ upserted: 2 })
    saveSnap.mockResolvedValue(undefined)

    const result = await persistGscQueryPageRows(db, { days: 90 })

    expect(fetchRows).toHaveBeenCalledTimes(1)
    expect(fetchRows).toHaveBeenCalledWith({ days: 90, siteUrl: undefined })
    expect(upsert).toHaveBeenCalledTimes(1)
    expect(upsert.mock.calls[0][0]).toBe(db)
    expect(upsert.mock.calls[0][1]).toHaveLength(2)
    expect(saveSnap).toHaveBeenCalledTimes(1)
    expect(saveSnap).toHaveBeenCalledWith(SITE, '2026-09-15', 2, expect.any(String))
    expect(result.status).toBe('live')
    expect(result.ok).toBe(true)
    expect(result.rowsProcessed).toBe(2)
    expect(result.range).toEqual(RANGE)
    expect(result.siteUrl).toBe(SITE)
    expect(typeof result.syncedAt).toBe('string')
    expect(Number.isFinite(Date.parse(result.syncedAt as string))).toBe(true)
    expect(typeof result.attemptedAt).toBe('string')
    expect(Number.isFinite(Date.parse(result.attemptedAt))).toBe(true)
  })

  it('defaults the window to 90 days and reports unavailable without any DB write', async () => {
    fetchRows.mockResolvedValue({
      configured: false,
      siteUrl: null,
      range: RANGE,
      rows: [],
      warnings: ['GSC credentials not configured (set GSC_SERVICE_ACCOUNT_JSON or OAuth bundle)'],
    })

    const result = await persistGscQueryPageRows(db)

    expect(fetchRows).toHaveBeenCalledWith({ days: 90, siteUrl: undefined })
    expect(result.status).toBe('unavailable')
    expect(result.ok).toBe(false)
    expect(result.rowsProcessed).toBe(0)
    expect(result.range).toEqual(RANGE)
    expect(result.warnings).toHaveLength(1)
    expect(result.syncedAt).toBeNull()
    expect(typeof result.attemptedAt).toBe('string')
    expect(Number.isFinite(Date.parse(result.attemptedAt))).toBe(true)
    expect(upsert).not.toHaveBeenCalled()
    expect(saveSnap).not.toHaveBeenCalled()
  })

  it('reports a live zero-row query as empty — distinct from unavailable', async () => {
    fetchRows.mockResolvedValue({ configured: true, siteUrl: SITE, range: RANGE, rows: [], warnings: [] })
    upsert.mockResolvedValue({ upserted: 0 })
    saveSnap.mockResolvedValue(undefined)

    const result = await persistGscQueryPageRows(db)

    expect(result.status).toBe('empty')
    expect(result.status).not.toBe('unavailable')
    expect(result.ok).toBe(true)
    expect(result.rowsProcessed).toBe(0)
    expect(result.range.endDate).toBe('2026-09-15')
    expect(typeof result.syncedAt).toBe('string')
    expect(typeof result.attemptedAt).toBe('string')
  })

  it('reports an explicit failed state when the fetch throws (no fake success)', async () => {
    fetchRows.mockRejectedValue(new Error('GSC query 500'))

    const result = await persistGscQueryPageRows(db)

    expect(result.status).toBe('failed')
    expect(result.ok).toBe(false)
    expect(result.rowsProcessed).toBe(0)
    expect(result.error).toMatch(/GSC query 500/)
    expect(result.range.days).toBe(90)
    expect(result.syncedAt).toBeNull()
    expect(typeof result.attemptedAt).toBe('string')
    expect(upsert).not.toHaveBeenCalled()
    expect(saveSnap).not.toHaveBeenCalled()
  })

  it('reports an explicit failed state when the upsert throws', async () => {
    fetchRows.mockResolvedValue({ configured: true, siteUrl: SITE, range: RANGE, rows: [metricRow('a')], warnings: [] })
    upsert.mockRejectedValue(new Error('upsert exploded'))

    const result = await persistGscQueryPageRows(db)

    expect(result.status).toBe('failed')
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/upsert exploded/)
    expect(result.syncedAt).toBeNull()
    expect(typeof result.attemptedAt).toBe('string')
    expect(saveSnap).not.toHaveBeenCalled()
  })

  it('keeps live rows when the best-effort snapshot version write fails', async () => {
    fetchRows.mockResolvedValue({ configured: true, siteUrl: SITE, range: RANGE, rows: [metricRow('a')], warnings: [] })
    upsert.mockResolvedValue({ upserted: 1 })
    saveSnap.mockRejectedValue(new Error('gsc_snapshots unavailable'))

    const result = await persistGscQueryPageRows(db)

    expect(result.status).toBe('live')
    expect(result.ok).toBe(true)
    expect(result.rowsProcessed).toBe(1)
    expect(result.warnings.join(' ')).toMatch(/snapshot/i)
  })
})
