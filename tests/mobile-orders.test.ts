/**
 * mobile-orders.test.ts
 *
 * Unit tests for the Bearer-verified student orders surface:
 *   - GET /api/mobile/orders — list (401/403/404/200)
 *   - GET /api/mobile/orders/[id] — detail with signed-URL files
 *
 * verifyToken and document minting are mocked — no live Clerk/network in CI.
 */

import http from 'http'
import request from 'supertest'

// ────────────────────────────────────────────────────────────
// Mocks — reset in beforeEach
// ────────────────────────────────────────────────────────────

const mockVerifyToken = jest.fn()
const mockMintSignedUrl = jest.fn()
let db: any

jest.mock('@clerk/backend', () => ({
  verifyToken: (...args: unknown[]) => mockVerifyToken(...args),
}))

jest.mock('@/lib/supabase', () => ({
  createSupabaseAdminClient: jest.fn(() => db),
}))

jest.mock('@/lib/documentStorage', () => ({
  mintSignedDocumentUrl: (...args: unknown[]) => mockMintSignedUrl(...args),
  recordDocumentAccess: jest.fn(),
  DEFAULT_TTL_SECONDS: 3600,
}))

// ────────────────────────────────────────────────────────────
// Tiny HTTP adapter for exercising route handlers in-process
// ────────────────────────────────────────────────────────────

function jsonServer(handler: (req: Request, context?: any) => Promise<Response>) {
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
      const path = webReq.url.split('?')[0]
      const match = path.match(/\/api\/mobile\/orders\/([^/]+)$/)
      const response = await handler(webReq, { params: Promise.resolve(match ? { id: decodeURIComponent(match[1]) } : {}) })
      res.statusCode = response.status
      response.headers.forEach((v, k) => res.setHeader(k, v))
      res.end(Buffer.from(await response.arrayBuffer()))
    })
  })
}

// ────────────────────────────────────────────────────────────
// Fake Supabase chain
// ────────────────────────────────────────────────────────────

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
  maybeSingle() { return this.single() }
  then<T>(onFulfilled: (v: { data: any[]; error: any; count: number }) => T) {
    return Promise.resolve({ data: this.rows, error: null, count: this.rows.length }).then(onFulfilled)
  }
}

function makeDb(rowsByTable: Record<string, any[]>) {
  return { from: (table: string) => new Query(table, rowsByTable[table] ?? []) }
}

// ────────────────────────────────────────────────────────────
// Shared fixtures
// ────────────────────────────────────────────────────────────

const STUDENT_PROFILE = {
  id: 'prof_1',
  clerk_user_id: 'user_known',
  role: 'client',
  status: 'active',
  email: 'student@example.com',
  full_name: 'Student One',
}

const CONSULTANT = {
  id: 'c1',
  clerk_user_id: null,
  role: 'consultant',
  status: 'active',
  email: 'cons@example.com',
  full_name: 'Connie Consultant',
}

function baseRows(overrides: Record<string, any[]> = {}) {
  return {
    profiles: [STUDENT_PROFILE, CONSULTANT],
    orders: [
      {
        id: 'o1',
        client_id: 'prof_1',
        order_number: 'YS-001',
        consultant_id: 'c1',
        status: 'in_progress',
        requirements: 'F-1 documents review',
        created_at: '2026-08-01T00:00:00Z',
        deadline: '2026-09-01T00:00:00Z',
        progress: 50,
        total_amount: 25,
        payout_status: 'pending',
        escrow_status: 'held',
      },
    ],
    order_items: [],
    order_files: [],
    order_messages: [],
    order_events: [],
    order_milestones: [],
    order_scope_changes: [],
    services: [],
    ...overrides,
  }
}

beforeEach(() => {
  mockVerifyToken.mockReset()
  mockMintSignedUrl.mockReset()
  mockMintSignedUrl.mockResolvedValue({ signedUrl: 'https://cdn.example.com/signed?x=1', ttl: 3600 })
  mockVerifyToken.mockResolvedValue({ sub: 'user_known' })
  db = makeDb(baseRows())
})

// ────────────────────────────────────────────────────────────
// GET /api/mobile/orders
// ────────────────────────────────────────────────────────────

describe('GET /api/mobile/orders', () => {
  it('returns 401 + signInRequired without a token', async () => {
    const { GET } = await import('@/app/api/mobile/orders/route')
    const res = await request(jsonServer(GET)).get('/api/mobile/orders')

    expect(res.status).toBe(401)
    expect(res.body.signInRequired).toBe(true)
  })

  it('returns 401 + signInRequired for an invalid token', async () => {
    mockVerifyToken.mockRejectedValue(new Error('token-invalid'))
    const { GET } = await import('@/app/api/mobile/orders/route')
    const res = await request(jsonServer(GET))
      .get('/api/mobile/orders')
      .set('Authorization', 'Bearer bad.token')

    expect(res.status).toBe(401)
    expect(res.body.signInRequired).toBe(true)
  })

  it('returns 403 for a non-buyer role', async () => {
    db = makeDb(baseRows({
      profiles: [{ id: 'prof_1', clerk_user_id: 'user_known', role: 'attorney', status: 'active', email: 'a@b.c' }],
    }))
    const { GET } = await import('@/app/api/mobile/orders/route')
    const res = await request(jsonServer(GET))
      .get('/api/mobile/orders')
      .set('Authorization', 'Bearer good.token')

    expect(res.status).toBe(403)
  })

  it('returns 404 when the Clerk user has no profile row', async () => {
    db = makeDb(baseRows({ profiles: [] }))
    const { GET } = await import('@/app/api/mobile/orders/route')
    const res = await request(jsonServer(GET))
      .get('/api/mobile/orders')
      .set('Authorization', 'Bearer good.token')

    expect(res.status).toBe(404)
  })

  it('returns the student orders list with pagination fields', async () => {
    const { GET } = await import('@/app/api/mobile/orders/route')
    const res = await request(jsonServer(GET))
      .get('/api/mobile/orders')
      .set('Authorization', 'Bearer good.token')

    expect(res.status).toBe(200)
    const list = res.body.data
    expect(list.orders).toHaveLength(1)
    const order = list.orders[0]
    expect(order.id).toBe('o1')
    expect(order.orderNumber).toBe('YS-001')
    expect(order.status).toBe('active') // in_progress → active
    expect(order.consultant).toBe('Connie Consultant')
    expect(order.service).toBe('F-1 documents review') // requirements fallback
    expect(order.totalCents).toBe(2500)
    expect(order.price).toBe('$25.00')
    expect(order.progress).toBe(50)
    expect(order.fileCount).toBe(0)
    expect(list.total).toBe(1)
    expect(list.page).toBe(1)
    expect(list.page_size).toBe(25)
    expect(list.total_pages).toBe(1)
    expect(list.has_more).toBe(false)
  })

  it('respects the status filter', async () => {
    const { GET } = await import('@/app/api/mobile/orders/route')
    const res = await request(jsonServer(GET))
      .get('/api/mobile/orders?status=completed')
      .set('Authorization', 'Bearer good.token')

    // The fake `in()` filters rows by raw status; our row is in_progress,
    // so the completed filter (active/in_progress excluded) yields none.
    expect(res.status).toBe(200)
    expect(res.body.data.orders).toHaveLength(0)
  })
})

// ────────────────────────────────────────────────────────────
// GET /api/mobile/orders/[id]
// ────────────────────────────────────────────────────────────

describe('GET /api/mobile/orders/[id]', () => {
  it('returns 401 without a token', async () => {
    const { GET } = await import('@/app/api/mobile/orders/[id]/route')
    const res = await request(jsonServer(GET)).get('/api/mobile/orders/o1')

    expect(res.status).toBe(401)
    expect(res.body.signInRequired).toBe(true)
  })

  it('returns the order detail with a signed-URL file', async () => {
    db = makeDb(baseRows({
      order_files: [
        {
          id: 'f1',
          order_id: 'o1',
          name: 'report.pdf',
          size_bytes: 1024,
          mime_type: 'application/pdf',
          uploader_role: 'consultant',
          uploader_id: 'c1',
          created_at: '2026-08-02T00:00:00Z',
          storage_path: 'o1/report.pdf',
          is_sensitive: false,
          is_deleted: false,
        },
      ],
    }))
    const { GET } = await import('@/app/api/mobile/orders/[id]/route')
    const res = await request(jsonServer(GET))
      .get('/api/mobile/orders/o1')
      .set('Authorization', 'Bearer good.token')

    expect(res.status).toBe(200)
    const data = res.body.data
    expect(data.order.id).toBe('o1')
    expect(data.order.status).toBe('active')
    expect(data.order.consultant).toBe('Connie Consultant')
    expect(data.files).toHaveLength(1)
    expect(data.files[0].name).toBe('report.pdf')
    expect(data.files[0].url).toBe('https://cdn.example.com/signed?x=1')
    expect(mockMintSignedUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ bucket: 'order-files', documentId: 'f1' }),
    )
  })

  it('returns 403 for an order owned by someone else', async () => {
    db = makeDb(baseRows({
      orders: [{ id: 'o1', client_id: 'other_profile', status: 'active' }],
    }))
    const { GET } = await import('@/app/api/mobile/orders/[id]/route')
    const res = await request(jsonServer(GET))
      .get('/api/mobile/orders/o1')
      .set('Authorization', 'Bearer good.token')

    expect(res.status).toBe(403)
  })

  it('returns 404 for a missing order', async () => {
    db = makeDb(baseRows({ orders: [] }))
    const { GET } = await import('@/app/api/mobile/orders/[id]/route')
    const res = await request(jsonServer(GET))
      .get('/api/mobile/orders/o1')
      .set('Authorization', 'Bearer good.token')

    expect(res.status).toBe(404)
  })
})
