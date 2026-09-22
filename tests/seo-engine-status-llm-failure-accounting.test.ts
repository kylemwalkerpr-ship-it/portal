/**
 * P1 measurement integrity — status headline must not substitute older fan-out
 * measurements when prompt audits exist but every prompt audit failed.
 */

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
  requireAdminUser: jest.fn(async () => ({ db: {}, profile: {}, profileId: 'p_admin', role: 'admin' })),
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

jest.mock('@/lib/seoEngine/demandHealth', () => ({
  resolveDemandHealth: jest.fn(async () => ({ source: 'none' })),
}))

jest.mock('@/lib/seoEngine/ahrefsAudit', () => ({
  loadLatestAhrefsSnapshot: jest.fn(async () => null),
}))

type Filter = { method: string; args: unknown[] }

let promptAttempts = 3

function hasFilter(filters: Filter[], method: string, ...args: unknown[]) {
  return filters.some((f) => f.method === method && args.every((arg, i) => f.args[i] === arg))
}

function makeSupabase() {
  return {
    from(table: string) {
      const filters: Filter[] = []
      let selected = ''
      const builder: Record<string, unknown> = {}
      const chain = (method: string) => (...args: unknown[]) => {
        filters.push({ method, args })
        return builder
      }
      builder.select = (columns: string) => {
        selected = columns
        return builder
      }
      for (const method of ['eq', 'not', 'gte', 'order', 'limit']) builder[method] = chain(method)
      builder.then = (resolve: (value: unknown) => unknown) => {
        let count = 0
        let data: Array<Record<string, unknown>> = []
        if (table === 'seo_llm_visibility' && selected === 'id') {
          const prompt = hasFilter(filters, 'eq', 'fan_out', false)
          const cited = hasFilter(filters, 'eq', 'cited', true)
          const excludesFailed = hasFilter(filters, 'not', 'flags', 'ov', '{audit_failed}')
          if (prompt && excludesFailed) count = 0 // no measured prompt audits
          else if (prompt) count = promptAttempts // prompt attempts, possibly all failed
          else if (excludesFailed && cited) count = 2 // older measured fan-out citations
          else if (excludesFailed) count = 4 // older measured fan-out rows
        } else if (table === 'seo_llm_visibility' && selected.includes('query')) {
          data = [{ id: 'f1', query: 'study permit canada', cited: false, created_at: '2026-09-19T01:00:00Z' }]
        } else if (table === 'seo_engine_config') {
          data = []
        } else if (table === 'seo_gate_runs' && selected === 'score,passed') {
          data = []
        }
        return Promise.resolve({ data, error: null, count }).then(resolve)
      }
      return builder
    },
  }
}

jest.mock('@/lib/supabase', () => ({
  createSupabaseAdminClient: jest.fn(() => makeSupabase()),
  isServiceRoleAchieved: jest.fn(() => true),
}))

import { GET } from '@/app/api/seo-engine/status/route'

describe('GET /api/seo-engine/status — failed prompt audit accounting', () => {
  beforeEach(() => { promptAttempts = 3 })

  it('reports unavailable when prompt attempts exist but none were measured, instead of substituting older fan-out share', async () => {
    const res = await GET()
    const body = await res.json() as {
      llmVisibility: { total: number; cited: number; shareOfVoice: number | null; measurementState: string }
    }

    expect(body.llmVisibility).toEqual(expect.objectContaining({
      total: 0,
      cited: 0,
      shareOfVoice: null,
      measurementState: 'unavailable',
    }))
  })

  it('does not fall back to legacy all-row history when no P11 prompt attempts exist', async () => {
    promptAttempts = 0
    const res = await GET()
    const body = await res.json() as {
      llmVisibility: { total: number; cited: number; shareOfVoice: number | null; measurementState: string }
    }

    expect(body.llmVisibility).toEqual(expect.objectContaining({
      total: 0,
      cited: 0,
      shareOfVoice: null,
      measurementState: 'unavailable',
    }))
  })
})
