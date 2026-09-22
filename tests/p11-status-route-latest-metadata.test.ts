jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number; headers?: Record<string, string> }) => ({
      status: init?.status ?? 200,
      headers: init?.headers,
      json: async () => body,
    }),
  },
}))

jest.mock('@/lib/portalAuth', () => ({
  requireAdminUser: jest.fn(async () => ({ db: {}, profile: {}, profileId: 'admin-1', role: 'admin' })),
}))

function builder(result: unknown = { data: [], error: null, count: 0 }) {
  const chain: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'not', 'gte', 'order', 'limit']) chain[method] = () => chain
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve)
  return chain
}

jest.mock('@/lib/supabase', () => ({
  getSupabaseAdminClient: jest.fn(() => ({ from: () => builder() })),
  isServiceRoleAchieved: jest.fn(() => true),
}))

jest.mock('@/lib/seoEngine/knowledge', () => ({
  latestEngineRuns: jest.fn(async () => []),
  DEFAULT_SOURCES: [],
}))

jest.mock('@/lib/seoEngine/rankingModel', () => ({
  loadRankingScores: jest.fn(async () => []),
}))

jest.mock('@/lib/seoEngine/specCoverage', () => ({
  reportSpecCoverage: jest.fn(() => ({ coverage: 100 })),
}))

jest.mock('@/lib/seoEngine/gate', () => ({
  hydrateGateFromJobScores: jest.fn(() => ({ runs: 0, passed: 0, passRate: 0, source: 'gate_runs' })),
}))

jest.mock('@/lib/seoEngine/llmVisibility', () => ({
  loadVisibilityStatusSummary: jest.fn(async () => ({
    cited: 1,
    total: 2,
    attempted: 2,
    failed: 0,
    shareOfVoice: 50,
    measurementState: 'measured',
    reporting: { contractVersion: 'p11-geo-v1' },
    reportingTruncated: false,
    latest: { query: 'P11 latest query', createdAt: '2026-09-22T11:00:00Z' },
    summaryMode: true,
  })),
}))

jest.mock('@/lib/seoEngine/demandHealth', () => ({
  resolveDemandHealth: jest.fn(async () => ({ source: 'none', ageDays: -1, stale: true, generatedAt: null })),
}))

jest.mock('@/lib/seoEngine/ahrefsAudit', () => ({
  loadLatestAhrefsSnapshot: jest.fn(async () => null),
}))

import { GET } from '@/app/api/seo-engine/status/route'

describe('GET /api/seo-engine/status — P11 latest metadata', () => {
  it('maps the P11 summary latest row to latestQuery and latestAt', async () => {
    const response = await GET(new Request('https://portal.example/api/seo-engine/status') as any)
    const body = await response.json()

    expect(body.llmVisibility).toEqual(expect.objectContaining({
      latestQuery: 'P11 latest query',
      latestAt: '2026-09-22T11:00:00Z',
    }))
  })
})
