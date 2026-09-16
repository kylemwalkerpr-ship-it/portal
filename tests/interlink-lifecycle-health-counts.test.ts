/**
 * P0 — system-health and daily-digest must count executed/applied interlinks.
 *
 * `seo_interlinks.status` has never contained 'active' (the production set is
 * planned · applied · rejected · manual · paused · awaiting_gate), so the old
 * `.eq('status', 'active')` query always returned 0 and mislabelled the metric.
 * Response field names stay stable (`interlinkActive`) for compatibility; the
 * underlying query and displayed meaning are applied/executed.
 */

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

jest.mock('@/lib/gscConfig', () => ({ getGscConfig: jest.fn() }))
jest.mock('@/lib/seoEngine/ga4', () => ({ loadGa4Config: jest.fn(async () => ({ enabled: false, propertyId: '', connectedAt: null })) }))
jest.mock('@/lib/seoEngine/ubersuggest', () => ({ loadUbersuggestConfig: jest.fn(async () => ({ enabled: false, accessToken: '', refreshToken: '' })) }))
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }))

import { createClient } from '@supabase/supabase-js'
import { getGscConfig } from '@/lib/gscConfig'
import { GET as systemHealthGET } from '@/app/api/content-studio/system-health/route'
import { POST as dailyDigestPOST } from '@/app/api/cron/daily-digest/route'

interface QueryCall { table: string; method: string; args: unknown[] }

let calls: QueryCall[] = []

function makeQueryBuilder(table: string) {
  const filters: QueryCall[] = []
  const builder: Record<string, unknown> = {}
  const record = (method: string) =>
    (...args: unknown[]) => {
      const call = { table, method, args }
      calls.push(call)
      filters.push(call)
      return builder
    }
  for (const method of ['select', 'eq', 'not', 'order', 'limit', 'in', 'ilike']) {
    builder[method] = record(method)
  }
  builder.then = (resolve: (value: unknown) => unknown) => {
    const appliedQuery = table === 'seo_interlinks' &&
      filters.some((c) => c.method === 'eq' && c.args[0] === 'status' && c.args[1] === 'applied')
    const activeQuery = table === 'seo_interlinks' &&
      filters.some((c) => c.method === 'eq' && c.args[0] === 'status' && c.args[1] === 'active')
    const count =
      appliedQuery ? 7
      : activeQuery ? 99
      : table === 'seo_interlinks' ? 12
      : table === 'content_jobs' ? 3
      : 0
    return Promise.resolve({ data: [], error: null, count }).then(resolve)
  }
  builder.catch = (reject: (reason: unknown) => unknown) => Promise.resolve({ data: [], error: null, count: 0 }).catch(reject)
  return builder
}

const interlinkStatusFilters = () =>
  calls.filter((c) => c.table === 'seo_interlinks' && c.method === 'eq' && c.args[0] === 'status')

beforeEach(() => {
  calls = []
  ;(createClient as jest.Mock).mockImplementation(() => ({
    from: (table: string) => makeQueryBuilder(table),
  }))
  ;(getGscConfig as jest.Mock).mockResolvedValue({
    clientId: null,
    clientSecret: null,
    refreshToken: null,
    serviceAccountKey: null,
    siteUrl: null,
    connectedEmail: null,
    connectedAt: null,
  })
  delete process.env.SLACK_WEBHOOK_URL
  delete process.env.DISCORD_WEBHOOK_URL
})

describe('GET /api/content-studio/system-health — applied interlink count', () => {
  it('queries status=applied (never status=active) and keeps the interlinkActive field name', async () => {
    const res = await systemHealthGET()
    const body = (await res.json()) as Record<string, unknown>

    expect(interlinkStatusFilters()).toEqual([
      { table: 'seo_interlinks', method: 'eq', args: ['status', 'applied'] },
    ])
    expect(calls.some((c) => c.args.includes('active'))).toBe(false)
    expect(body.interlinkActive).toBe(7)
    expect(body.interlinkTotal).toBe(12)
  })
})

describe('POST /api/cron/daily-digest — applied interlink count', () => {
  const OLD_FETCH = global.fetch

  afterEach(() => {
    global.fetch = OLD_FETCH
    delete process.env.CRON_SECRET
  })

  it('queries status=applied (never status=active) and reports it as applied/executed', async () => {
    process.env.CRON_SECRET = 'test-cron-secret'
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.example.com/slack'
    const slackBodies: Array<Record<string, unknown>> = []
    global.fetch = jest.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      slackBodies.push(JSON.parse(String(init?.body || '{}')) as Record<string, unknown>)
      return { ok: true, status: 200 } as Response
    }) as unknown as typeof fetch

    const request = {
      headers: { get: (name: string) => (name === 'x-cron-secret' ? 'test-cron-secret' : null) },
    }
    const res = await dailyDigestPOST(request as never)
    const body = (await res.json()) as { ok: boolean; sent: boolean; health: Record<string, unknown> }

    expect(body.ok).toBe(true)
    expect(interlinkStatusFilters()).toEqual([
      { table: 'seo_interlinks', method: 'eq', args: ['status', 'applied'] },
    ])
    expect(calls.some((c) => c.args.includes('active'))).toBe(false)
    expect(body.health.interlinks).toBe(12)

    const blocks = (slackBodies[0].blocks as Array<{ fields?: Array<{ text: string }> }>).flatMap((b) => b.fields || [])
    const interlinkField = blocks.find((f) => f.text.includes('Interlinks'))
    expect(interlinkField?.text).toContain('7 applied')
  })
})
