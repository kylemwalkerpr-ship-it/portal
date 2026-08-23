/**
 * mobile-safety.test.ts
 *
 * Unit tests for report + block endpoints:
 *   - POST /api/mobile/report
 *   - POST /api/mobile/block
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
  _pendingInsert: any[] = []

  constructor(_table: string, rows: any[]) { this.rows = Array.isArray(rows) ? [...rows] : [] }

  select() { return this }
  eq(col: string, val: any) { this.rows = this.rows.filter(r => r[col] === val); return this }
  in() { return this }
  single() {
    const row = this.rows[0] ?? null
    return Promise.resolve({ data: row, error: row ? null : { message: 'no rows' } })
  }
  insert(rows: any) {
    const arr = Array.isArray(rows) ? rows : [rows]
    this._pendingInsert.push(...arr)
    return this
  }
  upsert(rows: any, _opts?: any) {
    const arr = Array.isArray(rows) ? rows : [rows]
    this._pendingInsert.push(...arr)
    return this
  }
  then<T>(onFulfilled: (v: { data: any[] | null; error: any; count: number | null }) => T) {
    return Promise.resolve({ data: this.rows, error: null, count: null }).then(onFulfilled)
  }
}

function makeDb() {
  const rows: Record<string, any[]> = {
    profiles: [{ id: 'prof_1', clerk_user_id: 'user_known', role: 'client' }],
    support_tickets: [],
  }
  return { from: (table: string) => new Query(table, rows[table] ?? []) }
}

beforeEach(() => {
  mockVerifyToken.mockReset()
  mockVerifyToken.mockResolvedValue({ sub: 'user_known' })
  db = makeDb()
})

// ────────────────────────────────────────────────────────────
// POST /api/mobile/report
// ────────────────────────────────────────────────────────────

describe('POST /api/mobile/report', () => {
  it('returns 401 without a token', async () => {
    const { POST } = await import('@/app/api/mobile/report/route')
    const res = await request(jsonServer(POST)).post('/api').send({})
    expect(res.status).toBe(401)
  })

  it('returns 400 without targetUserId', async () => {
    const { POST } = await import('@/app/api/mobile/report/route')
    const res = await request(jsonServer(POST)).post('/api')
      .set('Authorization', 'Bearer good.token')
      .send({ reason: 'spam' })
    expect(res.status).toBe(400)
  })

  it('returns 400 without reason', async () => {
    const { POST } = await import('@/app/api/mobile/report/route')
    const res = await request(jsonServer(POST)).post('/api')
      .set('Authorization', 'Bearer good.token')
      .send({ targetUserId: 'prof_other' })
    expect(res.status).toBe(400)
  })

  it('returns 200 with reported flag', async () => {
    const { POST } = await import('@/app/api/mobile/report/route')
    const res = await request(jsonServer(POST)).post('/api')
      .set('Authorization', 'Bearer good.token')
      .send({ targetUserId: 'prof_other', reason: 'Inappropriate behaviour', context: 'Details here' })
    expect(res.status).toBe(200)
    expect(res.body.reported).toBe(true)
  })
})

// ────────────────────────────────────────────────────────────
// POST /api/mobile/block
// ────────────────────────────────────────────────────────────

describe('POST /api/mobile/block', () => {
  it('returns 401 without a token', async () => {
    const { POST } = await import('@/app/api/mobile/block/route')
    const res = await request(jsonServer(POST)).post('/api').send({})
    expect(res.status).toBe(401)
  })

  it('returns 400 without targetUserId', async () => {
    const { POST } = await import('@/app/api/mobile/block/route')
    const res = await request(jsonServer(POST)).post('/api')
      .set('Authorization', 'Bearer good.token')
      .send({})
    expect(res.status).toBe(400)
  })

  it('returns 200 with blocked flag (local block, no imaginary table insert)', async () => {
    const { POST } = await import('@/app/api/mobile/block/route')
    const res = await request(jsonServer(POST)).post('/api')
      .set('Authorization', 'Bearer good.token')
      .send({ targetUserId: 'prof_other' })
    expect(res.status).toBe(200)
    expect(res.body.blocked).toBe(true)
    expect(res.body.note).toBeTruthy()
  })
})