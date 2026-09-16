/**
 * P1A — Ahrefs project identity truth.
 *
 * New/live ingestion defaults to the verified full-domain project 10381179
 * (env override wins); the 2026-08-17 legal crawl (project 9902912) stays
 * historical evidence, and loadLatest must never present another project's
 * snapshot as current evidence for the expected project.
 */
import {
  DEFAULT_AHREFS_PROJECT_ID,
  LEGAL_AHREFS_CRAWL_2026_08_17,
  fallbackLegalAhrefsSnapshot,
  fetchAhrefsSiteAudit,
  loadLatestAhrefsSnapshot,
  persistAhrefsSnapshot,
} from '@/lib/seoEngine/ahrefsAudit'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { GET, POST } from '@/app/api/seo-engine/ahrefs/route'

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}))

jest.mock('@/lib/portalAuth', () => ({
  requireAdminUser: jest.fn(async () => ({ db: {}, profile: {}, profileId: 'p_admin', role: 'admin' })),
}))

jest.mock('@/lib/supabase', () => ({
  createSupabaseAdminClient: jest.fn(),
}))

jest.mock('@/lib/seoEngine/ahrefsAudit', () => {
  const actual = jest.requireActual('@/lib/seoEngine/ahrefsAudit')
  return { ...actual, persistAhrefsSnapshot: jest.fn(async () => ({ ok: true })) }
})

const supabase = createSupabaseAdminClient as jest.Mock
const persist = persistAhrefsSnapshot as jest.Mock

const ENV_KEY = 'AHREFS_API_KEY'
const ENV_PROJECT = 'AHREFS_PROJECT_ID'
const originalKey = process.env[ENV_KEY]
const originalProject = process.env[ENV_PROJECT]
const originalFetch = global.fetch

afterEach(() => {
  if (originalKey === undefined) delete process.env[ENV_KEY]
  else process.env[ENV_KEY] = originalKey
  if (originalProject === undefined) delete process.env[ENV_PROJECT]
  else process.env[ENV_PROJECT] = originalProject
  global.fetch = originalFetch
})

type Row = Record<string, unknown>

/** Minimal in-memory Supabase chain so project filters are genuinely applied. */
function fakeDb(rows: Row[]) {
  const filters: Array<{ col: string; val: unknown; neq?: boolean }> = []
  const builder: Record<string, unknown> = {}
  builder.select = () => builder
  builder.eq = (col: string, val: unknown) => {
    filters.push({ col, val })
    return builder
  }
  builder.neq = (col: string, val: unknown) => {
    filters.push({ col, val, neq: true })
    return builder
  }
  builder.order = () => builder
  builder.limit = () => builder
  builder.maybeSingle = async () => {
    const matched = rows.filter((r) =>
      filters.every((f) => (f.neq ? r[f.col] !== f.val : r[f.col] === f.val)),
    )
    return { data: matched[0] ?? null, error: null }
  }
  builder.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data: rows, error: null }).then(resolve)
  return { from: () => builder }
}

function snapshotRow(projectId: string, source = 'api'): Row {
  return {
    project_id: projectId,
    fetched_at: '2026-09-01T21:00:00.000Z',
    crawl_date: '2026-08-17T11:00:20Z',
    date_compared: '2026-08-10T11:20:07Z',
    health_score: 82,
    health_score_compared: 80,
    cs_open: 10,
    total_open: 20,
    issues: [],
    source,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  delete process.env[ENV_PROJECT]
  supabase.mockReturnValue(fakeDb([]))
})

describe('Ahrefs project identity constants', () => {
  it('defaults new/live fetches to 10381179, not the historical 9902912', () => {
    expect(DEFAULT_AHREFS_PROJECT_ID).toBe('10381179')
  })

  it('preserves the 2026-08-17 legal crawl as project 9902912 historical evidence', () => {
    expect(LEGAL_AHREFS_CRAWL_2026_08_17.project_id).toBe('9902912')
    const fb = fallbackLegalAhrefsSnapshot()
    expect(fb.projectId).toBe('9902912')
    expect(fb.source).toBe('fallback')
    expect(fb.date).toBe('2026-08-17T11:00:20Z')
    expect(fb.fetchedAt).toBe('2026-08-17T11:00:20Z')
  })

  it('sends live fetches to the current project and lets env override win', async () => {
    process.env[ENV_KEY] = 'test-key'
    const fetchMock = jest.fn(async (..._args: unknown[]) => ({ ok: true, json: async () => ({ issues: [] }) }))
    global.fetch = fetchMock as unknown as typeof fetch

    await fetchAhrefsSiteAudit()
    const liveUrl = new URL(String(fetchMock.mock.calls[0][0]))
    expect(liveUrl.searchParams.get('project_id')).toBe('10381179')

    process.env[ENV_PROJECT] = '424242'
    await fetchAhrefsSiteAudit()
    const overrideUrl = new URL(String(fetchMock.mock.calls[1][0]))
    expect(overrideUrl.searchParams.get('project_id')).toBe('424242')

    await fetchAhrefsSiteAudit({ projectId: '777777' })
    const explicitUrl = new URL(String(fetchMock.mock.calls[2][0]))
    expect(explicitUrl.searchParams.get('project_id')).toBe('777777')
  })
})

describe('loadLatestAhrefsSnapshot project identity', () => {
  it('does not present a real snapshot from another project as current evidence', async () => {
    supabase.mockReturnValue(fakeDb([snapshotRow('9902912')]))

    const snap = await loadLatestAhrefsSnapshot()

    expect(snap?.projectId).toBe('9902912')
    expect(snap?.source).toBe('fallback')
    expect(snap?.fetchedAt).toBe('2026-08-17T11:00:20Z')
  })

  it('returns the real snapshot when it belongs to the expected project', async () => {
    supabase.mockReturnValue(fakeDb([snapshotRow('10381179')]))

    const snap = await loadLatestAhrefsSnapshot()

    expect(snap?.projectId).toBe('10381179')
    expect(snap?.source).toBe('api')
    expect(snap?.fetchedAt).toBe('2026-09-01T21:00:00.000Z')
  })

  it('honors an explicit projectId override for historical inspection', async () => {
    supabase.mockReturnValue(fakeDb([snapshotRow('9902912')]))

    const snap = await loadLatestAhrefsSnapshot({ projectId: '9902912' })

    expect(snap?.projectId).toBe('9902912')
    expect(snap?.source).toBe('api')
  })
})

describe('GET /api/seo-engine/ahrefs identity truth', () => {
  it('exposes expected project + identity mismatch for a historical fallback', async () => {
    supabase.mockReturnValue(fakeDb([snapshotRow('9902912')]))

    const res = await GET()
    const body = (await res.json()) as Record<string, unknown>

    expect(body.expectedProjectId).toBe('10381179')
    expect(body.identityMatch).toBe(false)
    expect(body.snapshotIsFallback).toBe(true)
    expect((body.snapshot as Record<string, unknown>).projectId).toBe('9902912')
  })

  it('reports identityMatch true for a real snapshot of the expected project', async () => {
    supabase.mockReturnValue(fakeDb([snapshotRow('10381179')]))

    const res = await GET()
    const body = (await res.json()) as Record<string, unknown>

    expect(body.expectedProjectId).toBe('10381179')
    expect(body.identityMatch).toBe(true)
    expect(body.snapshotIsFallback).toBe(false)
  })
})

describe('POST /api/seo-engine/ahrefs manual snapshot identity', () => {
  function request(body: Record<string, unknown>) {
    return { json: async () => body } as never
  }

  it('labels an unlabeled manual snapshot with the current expected project', async () => {
    const res = await POST(request({ issues: [{ name: 'Orphan page', count: 3 }] }))
    const body = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(200)
    expect(persist).toHaveBeenCalledTimes(1)
    expect((persist.mock.calls[0][0] as Record<string, unknown>).projectId).toBe('10381179')
    expect((body.snapshot as Record<string, unknown>).projectId).toBe('10381179')
  })

  it('honors AHREFS_PROJECT_ID and an explicit projectId for manual snapshots', async () => {
    process.env[ENV_PROJECT] = '424242'

    await POST(request({ issues: [{ name: 'Orphan page', count: 3 }] }))
    expect((persist.mock.calls[0][0] as Record<string, unknown>).projectId).toBe('424242')

    await POST(request({ projectId: '777777', issues: [{ name: 'Orphan page', count: 3 }] }))
    expect((persist.mock.calls[1][0] as Record<string, unknown>).projectId).toBe('777777')
  })
})
