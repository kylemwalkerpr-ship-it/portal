/**
 * mobile-attorney.test.ts
 *
 * Unit tests for Bearer-verified attorney mobile surface:
 *   - GET /api/mobile/attorney/home
 *   - GET /api/mobile/attorney/inquiries
 *   - GET /api/mobile/attorney/orders
 *
 * verifyToken is mocked — no live Clerk/network in CI.
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

jest.mock('@/lib/earnings', () => ({
  summary: jest.fn().mockResolvedValue({ owedCents: 5000, releasableCents: 2000, paidCents: 3000 }),
}))

jest.mock('@/lib/attorneyInquiries', () => {
  const actual = jest.requireActual('@/lib/attorneyInquiries')
  return {
    ...actual,
    getAcceptedInquiryIds: jest.fn().mockResolvedValue([]),
    applyOpenQueueFilter: jest.fn((q: any) => q),
  }
})

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

// ── Fake Supabase ───────────────────────────────────────────

class Query {
  table: string
  rows: any[]

  constructor(table: string, rows: any[]) {
    this.table = table
    this.rows = [...rows]
  }

  select() { return this }
  eq(col: string, val: any) { this.rows = this.rows.filter(r => r[col] === val); return this }
  in(col: string, vals: any[]) { this.rows = this.rows.filter(r => vals.includes(r[col])); return this }
  or() { return this }
  order() { return this }
  range() { return this }
  limit() { return this }
  single() {
    const row = this.rows[0] ?? null
    return Promise.resolve({ data: row, error: row ? null : { message: 'no rows' } })
  }
  then<T>(onFulfilled: (v: { data: any[]; error: any; count: number }) => T) {
    return Promise.resolve({ data: this.rows, error: null, count: this.rows.length }).then(onFulfilled)
  }
}

function makeDb(rowsByTable: Record<string, any[]>) {
  return { from: (table: string) => new Query(table, rowsByTable[table] ?? []) }
}

// ── Fixtures ────────────────────────────────────────────────

const ATTORNEY_PROFILE = {
  id: 'prof_a1',
  clerk_user_id: 'user_attorney',
  role: 'attorney',
  status: 'active',
  email: 'attorney@example.com',
  full_name: 'Alice Attorney',
}

function baseRows(overrides: Record<string, any[]> = {}) {
  return {
    profiles: [ATTORNEY_PROFILE],
    attorneys: [
      { id: 'att_1', profile_id: 'prof_a1', available: true, tagline: 'Immigration law expert', headshot_url: null },
    ],
    orders: [
      { id: 'o1', consultant_id: 'prof_a1', status: 'in_progress', escrow_status: 'held', payout_status: 'pending', attorney_fee: 100, delivery_deadline: '2026-09-01T00:00:00Z', progress: 60, requirements: 'EB-2 NIW petition prep', created_at: '2026-08-01T00:00:00Z' },
    ],
    inquiries: [
      { id: 'inq_1', email: 'client@example.com', full_name: 'Client One', case_type: 'asylum', case_type_label: 'Asylum', urgency: 'medium', status: 'new', created_at: '2026-08-15T00:00:00Z', source: 'portal', target_attorney_profile_id: null },
    ],
    inquiry_messages: [],
    attorney_offers: [],
    ...overrides,
  }
}

beforeEach(() => {
  mockVerifyToken.mockReset()
  mockVerifyToken.mockResolvedValue({ sub: 'user_attorney' })
  db = makeDb(baseRows())
})

// ────────────────────────────────────────────────────────────
// GET /api/mobile/attorney/home
// ────────────────────────────────────────────────────────────

describe('GET /api/mobile/attorney/home', () => {
  it('returns 401 without a token', async () => {
    const { GET } = await import('@/app/api/mobile/attorney/home/route')
    const res = await request(jsonServer(GET)).get('/api')
    expect(res.status).toBe(401)
    expect(res.body.signInRequired).toBe(true)
  })

  it('returns 401 for invalid token', async () => {
    mockVerifyToken.mockRejectedValue(new Error('token-invalid'))
    const { GET } = await import('@/app/api/mobile/attorney/home/route')
    const res = await request(jsonServer(GET)).get('/api').set('Authorization', 'Bearer bad.token')
    expect(res.status).toBe(401)
  })

  it('returns 403 for non-attorney role', async () => {
    db = makeDb({ profiles: [{ id: 'prof_a1', clerk_user_id: 'user_attorney', role: 'client', status: 'active' }] })
    const { GET } = await import('@/app/api/mobile/attorney/home/route')
    const res = await request(jsonServer(GET)).get('/api').set('Authorization', 'Bearer good.token')
    expect(res.status).toBe(403)
  })

  it('returns home dashboard with stats and recent orders', async () => {
    const { GET } = await import('@/app/api/mobile/attorney/home/route')
    const res = await request(jsonServer(GET)).get('/api').set('Authorization', 'Bearer good.token')
    expect(res.status).toBe(200)
    const body = res.body
    expect(body.attorney.tagline).toBe('Immigration law expert')
    expect(body.orderStats.total).toBe(1)
    expect(body.orderStats.active).toBe(1)
    expect(body.inquiryStats.open).toBe(1)
    expect(body.recentOrders).toHaveLength(1)
    expect(body.recentOrders[0].id).toBe('o1')
  })
})

// ────────────────────────────────────────────────────────────
// GET /api/mobile/attorney/inquiries
// ────────────────────────────────────────────────────────────

describe('GET /api/mobile/attorney/inquiries', () => {
  it('returns 401 without a token', async () => {
    const { GET } = await import('@/app/api/mobile/attorney/inquiries/route')
    const res = await request(jsonServer(GET)).get('/api')
    expect(res.status).toBe(401)
  })

  it('returns inquiry list', async () => {
    const { GET } = await import('@/app/api/mobile/attorney/inquiries/route')
    const res = await request(jsonServer(GET)).get('/api').set('Authorization', 'Bearer good.token')
    expect(res.status).toBe(200)
    expect(res.body.inquiries).toHaveLength(1)
    expect(res.body.inquiries[0].id).toBe('inq_1')
    expect(res.body.inquiries[0].case_type_label).toBe('Asylum')
  })
})

// ────────────────────────────────────────────────────────────
// GET /api/mobile/attorney/orders
// ────────────────────────────────────────────────────────────

describe('GET /api/mobile/attorney/orders', () => {
  it('returns 401 without a token', async () => {
    const { GET } = await import('@/app/api/mobile/attorney/orders/route')
    const res = await request(jsonServer(GET)).get('/api')
    expect(res.status).toBe(401)
  })

  it('returns filtered orders list', async () => {
    const { GET } = await import('@/app/api/mobile/attorney/orders/route')
    const res = await request(jsonServer(GET)).get('/api?status=in_progress').set('Authorization', 'Bearer good.token')
    expect(res.status).toBe(200)
    expect(res.body.orders).toHaveLength(1)
    expect(res.body.orders[0].id).toBe('o1')
    // clientName is 'Client' fallback because mock Query.in() doesn't hydrate cross-table refs
    expect(res.body.orders[0].clientName).toBe('Client')
  })

  it('returns empty when no matching status', async () => {
    const { GET } = await import('@/app/api/mobile/attorney/orders/route')
    const res = await request(jsonServer(GET)).get('/api?status=completed').set('Authorization', 'Bearer good.token')
    expect(res.status).toBe(200)
    expect(res.body.orders).toHaveLength(0)
  })
})