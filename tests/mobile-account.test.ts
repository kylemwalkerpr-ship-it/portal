/**
 * mobile-account.test.ts
 *
 * Unit tests for account delete + export:
 *   - POST /api/mobile/account/delete
 *   - POST /api/mobile/account/export
 */

import http from 'http'
import request from 'supertest'

const mockVerifyToken = jest.fn()
let db: any

jest.mock('@clerk/backend', () => ({
  verifyToken: (...args: unknown[]) => mockVerifyToken(...args),
}))

jest.mock('@/lib/supabase', () => ({
  createSupabaseAdminClient: jest.fn(() => db),
}))

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

class Query {
  rows: any[]
  _countResult: number | null = null
  _pendingDelete: boolean = false
  _pendingUpdate: any = null

  constructor(_table: string, rows: any[]) { this.rows = Array.isArray(rows) ? [...rows] : [] }

  select(_cols?: string, _opts?: any) { return this }
  eq(col: string, val: any) { this.rows = this.rows.filter(r => r[col] === val); return this }
  or(_filter: string) { return this }
  in(_col: string, _vals: any[]) { return this }
  order() { return this }
  limit() { return this }
  single() {
    const row = this.rows[0] ?? null
    return Promise.resolve({ data: row, error: row ? null : { message: 'no rows' } })
  }
  update(data: any) { this._pendingUpdate = data; return this }
  then<T>(onFulfilled: (v: { data: any[] | null; error: any; count: number | null }) => T) {
    return Promise.resolve({ data: this.rows, error: null, count: this._countResult }).then(onFulfilled)
  }
}

function makeDb(nonTerminalOrders: boolean = false) {
  const rows: Record<string, any[]> = {
    profiles: [
      { id: 'prof_1', clerk_user_id: 'user_known', role: 'client', status: 'active', email: 'a@b.c', full_name: 'Test User', country_code: 'US', created_at: '2026-01-01T00:00:00Z' },
    ],
    orders: nonTerminalOrders ? [
      { id: 'o1', client_id: 'prof_1', escrow_status: 'held', status: 'in_progress' },
    ] : [
      { id: 'o2', client_id: 'prof_1', escrow_status: 'released', status: 'completed' },
    ],
    conversation_messages: [
      { id: 'm1', body: 'Hello', type: 'text', sender_id: 'prof_1', created_at: '2026-08-01T00:00:00Z' },
    ],
  }
  return { from: (table: string) => new Query(table, rows[table] ?? []) }
}

beforeEach(() => {
  mockVerifyToken.mockReset()
  mockVerifyToken.mockResolvedValue({ sub: 'user_known' })
  db = makeDb()
})

// ────────────────────────────────────────────────────────────
// POST /api/mobile/account/delete
// ────────────────────────────────────────────────────────────

describe('POST /api/mobile/account/delete', () => {
  it('returns 401 without a token', async () => {
    const { POST } = await import('@/app/api/mobile/account/delete/route')
    const res = await request(jsonServer(POST)).post('/api')
    expect(res.status).toBe(401)
  })

  it('returns 409 when non-terminal orders exist', async () => {
    db = makeDb(true)
    const { POST } = await import('@/app/api/mobile/account/delete/route')
    const res = await request(jsonServer(POST)).post('/api')
      .set('Authorization', 'Bearer good.token')
    expect(res.status).toBe(409)
    expect(res.body.error.message).toMatch(/active order/)
  })

  it('returns 200 when all orders are terminal (anonymise)', async () => {
    const { POST } = await import('@/app/api/mobile/account/delete/route')
    const res = await request(jsonServer(POST)).post('/api')
      .set('Authorization', 'Bearer good.token')
    expect(res.status).toBe(200)
    expect(res.body.anonymised).toBe(true)
  })
})

// ────────────────────────────────────────────────────────────
// POST /api/mobile/account/export
// ────────────────────────────────────────────────────────────

describe('POST /api/mobile/account/export', () => {
  it('returns 401 without a token', async () => {
    const { POST } = await import('@/app/api/mobile/account/export/route')
    const res = await request(jsonServer(POST)).post('/api')
    expect(res.status).toBe(401)
  })

  it('returns 200 with profile + orders + messages', async () => {
    const { POST } = await import('@/app/api/mobile/account/export/route')
    const res = await request(jsonServer(POST)).post('/api')
      .set('Authorization', 'Bearer good.token')
    expect(res.status).toBe(200)
    expect(res.body.data.profile).toBeTruthy()
    expect(Array.isArray(res.body.data.orders)).toBe(true)
    expect(Array.isArray(res.body.data.messages)).toBe(true)
    expect(res.body.data.exported_at).toBeTruthy()
  })
})