/**
 * P1A — POST /api/content-studio/gsc/sync must never report an unavailable
 * GSC connection as ok:true + rowsProcessed:0 (which read as measured zero).
 *
 * Auth + day/site override parsing are preserved; a live empty window is a
 * 200 but explicitly status:'empty' with source:'live', never 'unconfigured'.
 */
import { POST } from '@/app/api/content-studio/gsc/sync/route'
import { fetchQueryPageRows } from '@/lib/gscAnalytics'
import { upsertSeoGscRows } from '@/lib/seoFactory/gscRows'
import { saveSnapshotVersion } from '@/lib/seoFactory/gscHistory'

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}))

jest.mock('@/lib/portalAuth', () => ({
  requireAdminUser: jest.fn(async () => ({
    db: { from: () => ({ upsert: async () => ({ error: null }) }) },
    profile: {},
    profileId: 'p_admin',
    role: 'admin',
  })),
}))

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

function request(body: Record<string, unknown>) {
  return { json: async () => body } as never
}

beforeEach(() => {
  jest.clearAllMocks()
  upsert.mockResolvedValue({ upserted: 1 })
  saveSnap.mockResolvedValue(undefined)
})

describe('POST /api/content-studio/gsc/sync — measurement truth', () => {
  it('returns 503 + ok:false when GSC is unavailable (never ok:true/zero)', async () => {
    fetchRows.mockResolvedValue({
      configured: false,
      siteUrl: null,
      range: RANGE,
      rows: [],
      warnings: ['GSC credentials not configured (set GSC_SERVICE_ACCOUNT_JSON or OAuth bundle)'],
    })

    const res = await POST(request({ days: 90 }))
    const body = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(503)
    expect(body.ok).toBe(false)
    expect(body.status).toBe('unavailable')
    expect(body.source).toBe('unconfigured')
    expect(body.rowsProcessed).toBe(0)
    expect(Array.isArray(body.warnings) && (body.warnings as string[]).length > 0).toBe(true)
    expect(String(body.error)).toMatch(/credentials/i)
    expect(body.syncedAt).toBeNull()
    expect(typeof body.attemptedAt).toBe('string')
    expect(upsert).not.toHaveBeenCalled()
    expect(saveSnap).not.toHaveBeenCalled()
  })

  it('keeps a configured live sync at 200 with measured rows', async () => {
    fetchRows.mockResolvedValue({
      configured: true,
      siteUrl: SITE,
      range: RANGE,
      rows: [
        {
          query: 'f-1 visa',
          page: 'https://legal.yousafeconsultancy.com/us/f-1/',
          clicks: 2,
          impressions: 20,
          ctr: 0.1,
          position: 4,
          startDate: RANGE.startDate,
          endDate: RANGE.endDate,
          siteUrl: SITE,
        },
      ],
      warnings: [],
    })

    const res = await POST(request({ days: 90 }))
    const body = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.status).toBe('live')
    expect(body.source).toBe('live')
    expect(body.rowsProcessed).toBe(1)
    expect(body.range).toEqual(RANGE)
    expect(body.siteUrl).toBe(SITE)
    expect(typeof body.syncedAt).toBe('string')
    expect(typeof body.attemptedAt).toBe('string')
  })

  it('reports a live empty window at 200 as status empty (distinct from unavailable)', async () => {
    fetchRows.mockResolvedValue({ configured: true, siteUrl: SITE, range: RANGE, rows: [], warnings: [] })
    upsert.mockResolvedValue({ upserted: 0 })

    const res = await POST(request({ days: 90 }))
    const body = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.status).toBe('empty')
    expect(body.status).not.toBe('unavailable')
    expect(body.source).toBe('live')
    expect(body.rowsProcessed).toBe(0)
    expect(typeof body.syncedAt).toBe('string')
  })

  it('returns 502 + ok:false when the measured sync actually fails', async () => {
    fetchRows.mockResolvedValue({
      configured: true,
      siteUrl: SITE,
      range: RANGE,
      rows: [
        {
          query: 'f-1 visa',
          page: 'https://legal.yousafeconsultancy.com/us/f-1/',
          clicks: 2,
          impressions: 20,
          ctr: 0.1,
          position: 4,
          startDate: RANGE.startDate,
          endDate: RANGE.endDate,
          siteUrl: SITE,
        },
      ],
      warnings: [],
    })
    upsert.mockRejectedValue(new Error('upsert exploded'))

    const res = await POST(request({ days: 90 }))
    const body = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(502)
    expect(body.ok).toBe(false)
    expect(body.status).toBe('failed')
    expect(String(body.error)).toMatch(/upsert exploded/)
    expect(body.syncedAt).toBeNull()
    expect(typeof body.attemptedAt).toBe('string')
  })

  it('still honors allowed day presets and the siteUrl override', async () => {
    fetchRows.mockResolvedValue({ configured: false, siteUrl: null, range: RANGE, rows: [], warnings: ['nope'] })

    await POST(request({ days: 28, siteUrl: 'https://legal.yousafeconsultancy.com/' }))

    expect(fetchRows).toHaveBeenCalledWith({ days: 28, siteUrl: 'https://legal.yousafeconsultancy.com/' })
  })

  it('falls back to a 90-day window for unknown presets', async () => {
    fetchRows.mockResolvedValue({ configured: false, siteUrl: null, range: RANGE, rows: [], warnings: ['nope'] })

    await POST(request({ days: 12 }))

    expect(fetchRows).toHaveBeenCalledWith({ days: 90, siteUrl: undefined })
  })
})
