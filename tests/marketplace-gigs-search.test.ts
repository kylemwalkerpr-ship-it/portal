/**
 * marketplace-gigs-search.test.ts
 *
 * Regression: /api/marketplace/gigs?q=… used PostgREST `.fts.` (to_tsquery),
 * which parses `-` as the NOT operator — a user query like "F-1 denial" or
 * "h-1b visa" raised `syntax error in tsquery` → 500 on the live market site.
 * The search must use `.plfts.` (plainto_tsquery): plain text, never throws.
 */

import http from 'http'
import request from 'supertest'
import { GET } from '@/app/api/marketplace/gigs/route'

// ── Mocks ─────────────────────────────────────────────────────
const mockGetCached = jest.fn(async () => null)
const mockSetCached = jest.fn(async () => {})
const mockGetOptionalPortalUser = jest.fn(async () => null)
let db: any
let lastQuery: any

jest.mock('@/lib/cache', () => ({
  getCached: () => mockGetCached(),
  setCached: () => mockSetCached(),
  generateVersionedCacheKey: jest.fn(async () => 'test-cache-key'),
}))

jest.mock('@/lib/portalAuth', () => ({
  getOptionalPortalUser: () => mockGetOptionalPortalUser(),
}))

jest.mock('@/lib/supabase', () => ({
  createSupabaseAdminClient: jest.fn(() => db),
}))

// ── Fake Supabase chain (records .or() filters) ───────────────
class Query {
  orCalls: string[] = []

  constructor(public table: string, public rows: any[] = []) {}

  select() { return this }
  eq() { return this }
  in() { return this }
  or(filters: string) { this.orCalls.push(filters); return this }
  order() { return this }
  range() { return this }
  then<T>(onFulfilled: (v: { data: any[]; error: null; count: number }) => T) {
    return Promise.resolve({ data: this.rows, error: null, count: this.rows.length }).then(onFulfilled)
  }
}

function jsonServer(handler: (req: Request) => Promise<Response>) {
  return http.createServer(async (req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', async () => {
      const body = Buffer.concat(chunks)
      const webReq = new Request(`http://test${req.url}`, {
        method: req.method,
        headers: req.headers as HeadersInit,
        body: body.length ? body : undefined,
      })
      const response = await handler(webReq)
      res.statusCode = response.status
      response.headers.forEach((v, k) => res.setHeader(k, v))
      res.end(Buffer.from(await response.arrayBuffer()))
    })
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  lastQuery = null
  db = {
    from: (table: string) => {
      lastQuery = new Query(table, [])
      return lastQuery
    },
  }
})

describe('GET /api/marketplace/gigs — search query safety', () => {
  it('a hyphenated query ("F-1 denial") builds a plainto_tsquery filter — never to_tsquery', async () => {
    const res = await request(jsonServer(GET))
      .get('/api/marketplace/gigs?q=F-1%20denial&page=1&limit=20&sort=relevance')
    expect(res.status).toBe(200)
    expect(lastQuery.orCalls).toHaveLength(1)
    const filter = lastQuery.orCalls[0]
    expect(filter).toContain('title.plfts.F-1 denial')
    expect(filter).toContain('pitch.plfts.F-1 denial')
    expect(filter).toContain('description.plfts.F-1 denial')
    // The old to_tsquery operator must never be emitted — it 500s on `-`.
    expect(filter).not.toContain('.fts.')
  })

  it('quotes/commas in a query are stripped from the filter but the words survive', async () => {
    const res = await request(jsonServer(GET))
      .get('/api/marketplace/gigs?q=H-1B%20%22visa%22%2C%20premium&limit=20&sort=relevance')
    expect(res.status).toBe(200)
    const filter = lastQuery.orCalls[0]
    // The user's comma/quote are stripped from the value — it becomes a plain
    // word list (the commas that remain are the .or() filter separators).
    expect(filter).toContain('title.plfts.H-1B visa premium')
    expect(filter).not.toContain('"')
    expect(filter).not.toContain('.fts.')
  })

  it('no query → no FTS filter at all', async () => {
    const res = await request(jsonServer(GET)).get('/api/marketplace/gigs?limit=20&sort=relevance')
    expect(res.status).toBe(200)
    expect(lastQuery.orCalls).toHaveLength(0)
  })
})
