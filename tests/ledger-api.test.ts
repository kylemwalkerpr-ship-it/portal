/**
 * ledger-api.test.ts
 *
 * Unit tests for the canonical ledger API endpoints:
 *   - GET  /api/admin/analytics/ledger (6 views)
 *   - POST /api/admin/ledger/refund
 *
 * All DB calls are mocked via jest.mock on the auth + supabase modules.
 */
import http from 'http'
import request from 'supertest'

// ────────────────────────────────────────────────────────────
// Shared mutable state — reset in beforeEach
// ────────────────────────────────────────────────────────────

// This test-level db will be returned by requireAdminUser and
// createSupabaseAdminClient. It gets set in beforeEach.
let __mockDb: any

// Mock portalAuth so that requireAdminUser returns a per-test db object.
// This avoids importing @clerk/nextjs/server / next/headers in Jest.
jest.mock('@/lib/portalAuth', () => ({
  requireAdminUser: jest.fn(() => {
    const db = (globalThis as any).__currentMockDb
    if (!db) return { error: 'Unauthorized', status: 401 }
    return Promise.resolve({ db, profileId: 'admin-profile' })
  }),
}))

// Mock supabase so the refund route's createSupabaseAdminClient also uses our db.
jest.mock('@/lib/supabase', () => ({
  createSupabaseAdminClient: jest.fn(() => (globalThis as any).__currentMockDb),
}))

// Mock wallet — refundToWallet() is called by the refund route. The cap is
// enforced inside the route (against order/source/deposit ceilings) before this
// is invoked, so the mock just returns a balance. walletRefundCeilingCents is
// mocked high so shape-tests aren't gated by the deposit ceiling; the dedicated
// cap tests below stub it explicitly.
jest.mock('@/lib/wallet', () => ({
  credit: jest.fn(() =>
    Promise.resolve({ balance_after_cents: (globalThis as any).__walletBalance ?? 15000 }),
  ),
  refundToWallet: jest.fn(() =>
    Promise.resolve({ balance_after_cents: (globalThis as any).__walletBalance ?? 15000 }),
  ),
  walletRefundCeilingCents: jest.fn(() =>
    Promise.resolve((globalThis as any).__refundCeilingCents ?? 100_000_000),
  ),
}))

// ────────────────────────────────────────────────────────────
// Tiny HTTP adapter (same pattern as marketplace tests)
// ────────────────────────────────────────────────────────────

function jsonServer(
  handler: (req: Request, context: any) => Promise<Response>,
  params: Record<string, string> = {},
) {
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
      const response = await handler(webReq, { params: Promise.resolve(params) })
      res.statusCode = response.status
      response.headers.forEach((v, k) => res.setHeader(k, v))
      res.end(Buffer.from(await response.arrayBuffer()))
    })
  })
}

// ────────────────────────────────────────────────────────────
// Ledger row factory
// ────────────────────────────────────────────────────────────

function ledgerRow(overrides: Record<string, any> = {}) {
  return {
    id: '00000000-0000-0000-0000-000000000000',
    profile_id: null,
    counterparty_id: null,
    amount_cents: 10000,
    currency: 'usd',
    balance_after_cents: 10000,
    entry_type: 'purchase',
    direction: 'debit',
    source_table: 'orders',
    source_id: 'order-1',
    order_id: null,
    description: 'Test entry',
    metadata: {},
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

// ────────────────────────────────────────────────────────────
// Mock DB builders
// ────────────────────────────────────────────────────────────

/** Creates a mock Supabase chain that returns the given `data` array. */
function mockLedgerDb(ledgerData: any[], ledgerError?: string | null) {
  return {
    from(table: string) {
      if (table === 'canonical_ledger') {
        return {
          select: () => ({
            gte: () => ({
              lte: () => ({
                order: () => ({
                  // in() filter is called when typeFilter is set
                  in: () => ({
                    range: () => Promise.resolve({
                      data: ledgerData,
                      error: ledgerError ? { message: ledgerError } : null,
                      count: ledgerData.length,
                    }),
                  }),
                  // No in() — go straight to range
                  range: () => Promise.resolve({
                    data: ledgerData,
                    error: ledgerError ? { message: ledgerError } : null,
                    count: ledgerData.length,
                  }),
                }),
              }),
            }),
          }),
          // Used by the refund endpoint's ledger insert
          insert: () => Promise.resolve({ error: null }),
        }
      }
      // Fallback for other tables
      return {
        select: () => ({ single: () => Promise.resolve({ data: null, error: null }) }),
        insert: () => Promise.resolve({ error: null }),
        update: () => ({ eq: () => Promise.resolve({ error: null }) }),
      }
    },
    rpc: () => Promise.resolve({ data: [{ balance_cents: 5000 }], error: null }),
  }
}

/** Refund-specific DB that also handles orders / refund_ledger / admin_audit_log tables. */
function mockRefundDb(overrides: {
  orderClientId?: string | null
  insertError?: string | null
  balanceCents?: number
  orderAmountPaidCents?: number
  orderRefundedAmount?: number
} = {}) {
  const { orderClientId = 'student-1', insertError = null, balanceCents = 5000, orderAmountPaidCents, orderRefundedAmount } = overrides
  return {
    from(table: string) {
      if (table === 'canonical_ledger') {
        return {
          select: () => ({
            gte: () => ({
              lte: () => ({
                order: () => ({
                  range: () => Promise.resolve({ data: [], error: null, count: 0 }),
                }),
              }),
            }),
          }),
          insert: () => {
            if (insertError) return Promise.resolve({ error: { message: insertError } })
            return Promise.resolve({ error: null })
          },
        }
      }
      if (table === 'orders') {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({
                data: orderClientId
                  ? {
                      id: 'order-1',
                      client_id: orderClientId,
                      amount_paid: orderAmountPaidCents,
                      refunded_amount: orderRefundedAmount,
                    }
                  : null,
                error: orderClientId ? null : { message: 'not found' },
              }),
            }),
          }),
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        }
      }
      if (table === 'refund_ledger') {
        return { insert: () => Promise.resolve({ error: null }) }
      }
      if (table === 'admin_audit_log') {
        return { insert: () => Promise.resolve({ error: null }) }
      }
      return {
        select: () => ({ single: () => Promise.resolve({ data: null, error: null }) }),
        insert: () => Promise.resolve({ error: null }),
        update: () => ({ eq: () => Promise.resolve({ error: null }) }),
      }
    },
    rpc: () => Promise.resolve({ data: [{ balance_cents: balanceCents }], error: null }),
  }
}

beforeEach(() => {
  // Reset mock state
  delete (globalThis as any).__currentMockDb
  delete (globalThis as any).__walletBalance
})

// ════════════════════════════════════════════════════════════
// GET /api/admin/analytics/ledger — Auth
// ════════════════════════════════════════════════════════════

test('ledger: unauthenticated returns 401', async () => {
  (globalThis as any).__currentMockDb = null

  const { GET } = await import('@/app/api/admin/analytics/ledger/route')
  const res = await request(jsonServer(GET)).get('/api/admin/analytics/ledger')

  expect(res.status).toBe(401)
})

test('ledger: invalid view returns 400', async () => {
  (globalThis as any).__currentMockDb = mockLedgerDb([])

  const { GET } = await import('@/app/api/admin/analytics/ledger/route')
  const res = await request(jsonServer(GET)).get('/api/admin/analytics/ledger?view=nonexistent')

  expect(res.status).toBe(400)
  expect(res.body.error.message).toMatch(/Invalid view/)
})

test('ledger: DB table missing returns 503', async () => {
  (globalThis as any).__currentMockDb = mockLedgerDb([], 'relation "public.canonical_ledger" does not exist')

  const { GET } = await import('@/app/api/admin/analytics/ledger/route')
  const res = await request(jsonServer(GET)).get('/api/admin/analytics/ledger')

  expect(res.status).toBe(503)
})

// ════════════════════════════════════════════════════════════
// GET /api/admin/analytics/ledger — Overview
// ════════════════════════════════════════════════════════════

test('ledger overview: aggregates correctly', async () => {
  const rows = [
    ledgerRow({ entry_type: 'purchase', direction: 'debit', amount_cents: 50000 }),
    ledgerRow({ entry_type: 'purchase', direction: 'debit', amount_cents: 30000 }),
    ledgerRow({ entry_type: 'fee', direction: 'credit', amount_cents: 8000 }),
    ledgerRow({ entry_type: 'payout', direction: 'credit', amount_cents: 42000 }),
    ledgerRow({ entry_type: 'refund', direction: 'debit', amount_cents: 5000 }),
    ledgerRow({ entry_type: 'topup', direction: 'credit', amount_cents: 20000 }),
  ]
  ;(globalThis as any).__currentMockDb = mockLedgerDb(rows)

  const { GET } = await import('@/app/api/admin/analytics/ledger/route')
  const res = await request(jsonServer(GET)).get('/api/admin/analytics/ledger?view=overview')

  expect(res.status).toBe(200)
  const d = res.body.data
  expect(d.gross_30d_cents).toBe(80000)       // 50000 + 30000 purchases
  expect(d.net_take_30d_cents).toBe(8000)      // fee credits
  expect(d.payouts_30d_cents).toBe(42000)      // payout credits
  expect(d.outstanding_escrow_cents).toBe(0)   // no escrow rows
  expect(d.refund_rate_30d_pct).toBeGreaterThan(0)
})

test('ledger overview: empty ledger returns all zeros', async () => {
  ;(globalThis as any).__currentMockDb = mockLedgerDb([])

  const { GET } = await import('@/app/api/admin/analytics/ledger/route')
  const res = await request(jsonServer(GET)).get('/api/admin/analytics/ledger?view=overview')

  expect(res.status).toBe(200)
  expect(res.body.data.gross_30d_cents).toBe(0)
  expect(res.body.data.net_take_30d_cents).toBe(0)
  expect(res.body.data.payouts_30d_cents).toBe(0)
})

// ════════════════════════════════════════════════════════════
// GET /api/admin/analytics/ledger — Revenue
// ════════════════════════════════════════════════════════════

test('ledger revenue: returns totals and monthly breakdown', async () => {
  const rows = [
    ledgerRow({ entry_type: 'purchase', direction: 'debit', amount_cents: 10000, created_at: '2026-01-15T00:00:00Z' }),
    ledgerRow({ entry_type: 'purchase', direction: 'debit', amount_cents: 20000, created_at: '2026-02-15T00:00:00Z' }),
    ledgerRow({ entry_type: 'fee', direction: 'credit', amount_cents: 3000, created_at: '2026-01-15T00:00:00Z' }),
  ]
  ;(globalThis as any).__currentMockDb = mockLedgerDb(rows)

  const { GET } = await import('@/app/api/admin/analytics/ledger/route')
  const res = await request(jsonServer(GET)).get('/api/admin/analytics/ledger?view=revenue')

  expect(res.status).toBe(200)
  const d = res.body.data
  expect(d.totals.purchase.total_cents).toBe(30000)
  expect(d.totals.fee.total_cents).toBe(3000)
  expect(d.monthly_breakdown).toHaveLength(2)
  expect(d.monthly_breakdown[0].month).toBe('2026-01')
  expect(d.monthly_breakdown[1].month).toBe('2026-02')
})

// ════════════════════════════════════════════════════════════
// GET /api/admin/analytics/ledger — Liabilities
// ════════════════════════════════════════════════════════════

test('ledger liabilities: computes escrow + wallet liabilities', async () => {
  const rows = [
    ledgerRow({ entry_type: 'escrow_deposit', direction: 'debit', amount_cents: 50000 }),
    ledgerRow({ entry_type: 'escrow_release', direction: 'credit', amount_cents: 20000 }),
    ledgerRow({ entry_type: 'topup', direction: 'credit', amount_cents: 30000, profile_id: 'student-1' }),
    ledgerRow({ entry_type: 'topup', direction: 'debit', amount_cents: 5000, profile_id: 'student-1' }),
    ledgerRow({ entry_type: 'refund', direction: 'debit', amount_cents: 10000 }),
  ]
  ;(globalThis as any).__currentMockDb = mockLedgerDb(rows)

  const { GET } = await import('@/app/api/admin/analytics/ledger/route')
  const res = await request(jsonServer(GET)).get('/api/admin/analytics/ledger?view=liabilities')

  expect(res.status).toBe(200)
  const d = res.body.data
  expect(d.escrow_outstanding_cents).toBe(30000)     // 50000 - 20000
  expect(d.wallet_liability_cents).toBe(25000)        // 30000 - 5000
  expect(d.total_liability_cents).toBe(55000)         // 30000 + 25000
  expect(d.refund_total_cents).toBe(10000)
})

// ════════════════════════════════════════════════════════════
// GET /api/admin/analytics/ledger — Projections
// ════════════════════════════════════════════════════════════

test('ledger projections: computes run rate and forward estimates', async () => {
  const rows = [
    ledgerRow({ entry_type: 'purchase', direction: 'debit', amount_cents: 50000, created_at: new Date(Date.now() - 5 * 86400_000).toISOString() }),
    ledgerRow({ entry_type: 'purchase', direction: 'debit', amount_cents: 30000, created_at: new Date(Date.now() - 10 * 86400_000).toISOString() }),
  ]
  ;(globalThis as any).__currentMockDb = mockLedgerDb(rows)

  const { GET } = await import('@/app/api/admin/analytics/ledger/route')
  const res = await request(jsonServer(GET)).get('/api/admin/analytics/ledger?view=projections')

  expect(res.status).toBe(200)
  const d = res.body.data
  expect(d.run_rate_30d_cents).toBeGreaterThan(0)
  expect(d.forward_3m).toHaveLength(3)
  expect(d.forward_3m[0]).toHaveProperty('month')
  expect(d.forward_3m[0]).toHaveProperty('point_cents')
  expect(d.forward_3m[0]).toHaveProperty('lo_cents')
  expect(d.forward_3m[0]).toHaveProperty('hi_cents')
})

// ════════════════════════════════════════════════════════════
// GET /api/admin/analytics/ledger — Risk
// ════════════════════════════════════════════════════════════

test('ledger risk: computes refund rate and disputed orders', async () => {
  const rows = [
    ledgerRow({ entry_type: 'purchase', direction: 'debit', amount_cents: 10000, created_at: '2026-01-15T00:00:00Z' }),
    ledgerRow({ entry_type: 'purchase', direction: 'debit', amount_cents: 20000, created_at: '2026-01-20T00:00:00Z' }),
    ledgerRow({ entry_type: 'refund', direction: 'debit', amount_cents: 5000, created_at: '2026-01-25T00:00:00Z' }),
    ledgerRow({ entry_type: 'escrow_deposit', direction: 'debit', amount_cents: 10000, metadata: { event_type: 'dispute_opened' }, created_at: '2026-02-01T00:00:00Z' }),
  ]
  ;(globalThis as any).__currentMockDb = mockLedgerDb(rows)

  const { GET } = await import('@/app/api/admin/analytics/ledger/route')
  const res = await request(jsonServer(GET)).get('/api/admin/analytics/ledger?view=risk')

  expect(res.status).toBe(200)
  const d = res.body.data
  expect(d.disputed_count).toBe(1)
  expect(d.disputed_dollar_cents).toBe(10000)
  expect(d.refund_rate_trend).toBeInstanceOf(Array)
  expect(d.refund_rate_current_month_pct).toBeDefined()
})

// ════════════════════════════════════════════════════════════
// GET /api/admin/analytics/ledger — Daily Series
// ════════════════════════════════════════════════════════════

test('ledger daily_series: returns daily aggregate over date range', async () => {
  const rows = [
    ledgerRow({ entry_type: 'purchase', direction: 'debit', amount_cents: 10000, created_at: '2026-01-15T00:00:00Z' }),
    ledgerRow({ entry_type: 'fee', direction: 'credit', amount_cents: 1500, created_at: '2026-01-15T00:00:00Z' }),
    ledgerRow({ entry_type: 'purchase', direction: 'debit', amount_cents: 20000, created_at: '2026-01-16T00:00:00Z' }),
  ]
  ;(globalThis as any).__currentMockDb = mockLedgerDb(rows)

  const { GET } = await import('@/app/api/admin/analytics/ledger/route')
  const res = await request(jsonServer(GET)).get('/api/admin/analytics/ledger?view=daily_series&from=2026-01-14T00:00:00Z&to=2026-01-18T00:00:00Z')

  expect(res.status).toBe(200)
  const d = res.body.data
  expect(d.daily_series).toBeInstanceOf(Array)
  expect(d.daily_series).toHaveLength(5) // 14th through 18th

  const jan15 = d.daily_series.find((s: any) => s.date === '2026-01-15')
  expect(jan15).toBeDefined()
  expect(jan15.gross).toBe(10000)
  expect(jan15.net).toBe(1500)

  const jan16 = d.daily_series.find((s: any) => s.date === '2026-01-16')
  expect(jan16).toBeDefined()
  expect(jan16.gross).toBe(20000)
})

test('ledger daily_series: defaults to 30 days when no from/to provided', async () => {
  ;(globalThis as any).__currentMockDb = mockLedgerDb([ledgerRow({ entry_type: 'purchase', direction: 'debit', amount_cents: 10000 })])

  const { GET } = await import('@/app/api/admin/analytics/ledger/route')
  const res = await request(jsonServer(GET)).get('/api/admin/analytics/ledger?view=daily_series')

  expect(res.status).toBe(200)
  // The route uses an inclusive range: (to - from) / 86400000 + 1 = 31
  expect(res.body.data.daily_series).toHaveLength(31)
})

test('ledger daily_series: empty ledger returns zero-filled days', async () => {
  ;(globalThis as any).__currentMockDb = mockLedgerDb([])

  const { GET } = await import('@/app/api/admin/analytics/ledger/route')
  const res = await request(jsonServer(GET)).get('/api/admin/analytics/ledger?view=daily_series&from=2026-01-01T00:00:00Z&to=2026-01-03T00:00:00Z')

  expect(res.status).toBe(200)
  expect(res.body.data.daily_series).toHaveLength(3)
  for (const day of res.body.data.daily_series) {
    expect(day.gross).toBe(0)
    expect(day.net).toBe(0)
    expect(day.payouts).toBe(0)
    expect(day.refunds).toBe(0)
  }
})

// ════════════════════════════════════════════════════════════
// GET /api/admin/analytics/ledger — Type + Profile filtering
// ════════════════════════════════════════════════════════════

test('ledger overview: filtered by type returns only matching rows', async () => {
  const rows = [
    ledgerRow({ entry_type: 'purchase', direction: 'debit', amount_cents: 50000 }),
    ledgerRow({ entry_type: 'topup', direction: 'credit', amount_cents: 20000 }),
  ]
  ;(globalThis as any).__currentMockDb = mockLedgerDb(rows)

  const { GET } = await import('@/app/api/admin/analytics/ledger/route')
  const res = await request(jsonServer(GET)).get('/api/admin/analytics/ledger?view=overview&type=purchase,refund')

  expect(res.status).toBe(200)
  expect(res.body.data.gross_30d_cents).toBe(50000)
})

// ════════════════════════════════════════════════════════════
// POST /api/admin/ledger/refund — Auth
// ════════════════════════════════════════════════════════════

test('refund: unauthenticated returns 401', async () => {
  ;(globalThis as any).__currentMockDb = null

  const { POST } = await import('@/app/api/admin/ledger/refund/route')
  const res = await request(jsonServer(POST))
    .post('/api/admin/ledger/refund')
    .send({ profile_id: 'student-1', amount_cents: 5000 })

  expect(res.status).toBe(401)
})

// ════════════════════════════════════════════════════════════
// POST /api/admin/ledger/refund — Validation
// ════════════════════════════════════════════════════════════

test('refund: missing profile_id and order_id returns 400', async () => {
  ;(globalThis as any).__currentMockDb = mockRefundDb({ orderClientId: null })

  const { POST } = await import('@/app/api/admin/ledger/refund/route')
  const res = await request(jsonServer(POST))
    .post('/api/admin/ledger/refund')
    .send({ amount_cents: 5000 })

  expect(res.status).toBe(400)
  expect(res.body.error.message).toMatch(/profile_id/)
})

test('refund: negative amount_cents returns 400', async () => {
  ;(globalThis as any).__currentMockDb = mockRefundDb()

  const { POST } = await import('@/app/api/admin/ledger/refund/route')
  const res = await request(jsonServer(POST))
    .post('/api/admin/ledger/refund')
    .send({ profile_id: 'student-1', amount_cents: -100 })

  expect(res.status).toBe(400)
  expect(res.body.error.message).toMatch(/positive integer/)
})

test('refund: non-integer amount_cents returns 400', async () => {
  ;(globalThis as any).__currentMockDb = mockRefundDb()

  const { POST } = await import('@/app/api/admin/ledger/refund/route')
  const res = await request(jsonServer(POST))
    .post('/api/admin/ledger/refund')
    .send({ profile_id: 'student-1', amount_cents: 50.99 })

  expect(res.status).toBe(400)
  expect(res.body.error.message).toMatch(/positive integer/)
})

test('refund: zero amount_cents returns 400', async () => {
  ;(globalThis as any).__currentMockDb = mockRefundDb()

  const { POST } = await import('@/app/api/admin/ledger/refund/route')
  const res = await request(jsonServer(POST))
    .post('/api/admin/ledger/refund')
    .send({ profile_id: 'student-1', amount_cents: 0 })

  expect(res.status).toBe(400)
  expect(res.body.error.message).toMatch(/positive integer/)
})

// ════════════════════════════════════════════════════════════
// POST /api/admin/ledger/refund — Success
// ════════════════════════════════════════════════════════════

test('refund: successful wallet refund returns correct shape', async () => {
  ;(globalThis as any).__currentMockDb = mockRefundDb()
  ;(globalThis as any).__walletBalance = 15000

  const { POST } = await import('@/app/api/admin/ledger/refund/route')
  const res = await request(jsonServer(POST))
    .post('/api/admin/ledger/refund')
    .send({ profile_id: 'student-1', amount_cents: 5000, reason: 'Customer satisfaction' })

  expect(res.status).toBe(200)
  const d = res.body.data
  expect(d.refunded_cents).toBe(5000)
  expect(d.method).toBe('wallet')
  expect(d.profile_id).toBe('student-1')
  expect(d.wallet_balance_cents).toBe(15000)
  expect(d.warnings).toBeUndefined()
})

test('refund: resolves profile_id from order when not provided', async () => {
  ;(globalThis as any).__currentMockDb = mockRefundDb({ orderClientId: 'student-from-order' })

  const { POST } = await import('@/app/api/admin/ledger/refund/route')
  const res = await request(jsonServer(POST))
    .post('/api/admin/ledger/refund')
    .send({ amount_cents: 2500, order_id: 'order-123' })

  expect(res.status).toBe(200)
  expect(res.body.data.profile_id).toBe('student-from-order')
  expect(res.body.data.refunded_cents).toBe(2500)
})

test('refund: handles duplicate key gracefully (no crash)', async () => {
  ;(globalThis as any).__currentMockDb = mockRefundDb({ insertError: 'duplicate key value violates unique constraint' })

  const { POST } = await import('@/app/api/admin/ledger/refund/route')
  const res = await request(jsonServer(POST))
    .post('/api/admin/ledger/refund')
    .send({ profile_id: 'student-1', amount_cents: 5000, source_table: 'orders', source_id: 'order-1' })

  expect(res.status).toBe(200)
  // Duplicate key errors are silently ignored (expected for idempotent retries)
  expect(res.body.data.warnings).toBeUndefined()
})

// ════════════════════════════════════════════════════════════
// POST /api/admin/ledger/refund — Refund cap (never exceed paid-in)
// ════════════════════════════════════════════════════════════

test('refund: order refund within captured amount succeeds', async () => {
  ;(globalThis as any).__currentMockDb = mockRefundDb({ orderAmountPaidCents: 5000 })

  const { POST } = await import('@/app/api/admin/ledger/refund/route')
  const res = await request(jsonServer(POST))
    .post('/api/admin/ledger/refund')
    .send({ profile_id: 'student-1', amount_cents: 5000, order_id: 'order-1' })

  expect(res.status).toBe(200)
  expect(res.body.data.refunded_cents).toBe(5000)
})

test('refund: order refund exceeding captured amount is rejected (422)', async () => {
  ;(globalThis as any).__currentMockDb = mockRefundDb({ orderAmountPaidCents: 5000 })

  const { POST } = await import('@/app/api/admin/ledger/refund/route')
  const res = await request(jsonServer(POST))
    .post('/api/admin/ledger/refund')
    .send({ profile_id: 'student-1', amount_cents: 5001, order_id: 'order-1' })

  expect(res.status).toBe(422)
  expect(res.body.error.message).toMatch(/exceeds the refundable ceiling/i)
  expect(res.body.error.maxRefundCents).toBe(5000)
})

test('refund: order refund cap accounts for prior refunds', async () => {
  // Captured $50.00, already refunded $30.00 → only $20.00 left.
  ;(globalThis as any).__currentMockDb = mockRefundDb({ orderAmountPaidCents: 5000, orderRefundedAmount: 30 })

  const { POST } = await import('@/app/api/admin/ledger/refund/route')
  const res = await request(jsonServer(POST))
    .post('/api/admin/ledger/refund')
    .send({ profile_id: 'student-1', amount_cents: 2500, order_id: 'order-1' })

  expect(res.status).toBe(422)
  expect(res.body.error.maxRefundCents).toBe(2000)
})

test('refund: orphan wallet refund is capped by lifetime deposits', async () => {
  ;(globalThis as any).__currentMockDb = mockRefundDb()
  ;(globalThis as any).__refundCeilingCents = 1000 // only $10 ever deposited

  const { POST } = await import('@/app/api/admin/ledger/refund/route')
  const res = await request(jsonServer(POST))
    .post('/api/admin/ledger/refund')
    .send({ profile_id: 'student-1', amount_cents: 5000, reason: 'goodwill' })

  delete (globalThis as any).__refundCeilingCents
  expect(res.status).toBe(422)
  expect(res.body.error.maxRefundCents).toBe(1000)
})

// ════════════════════════════════════════════════════════════
// POST /api/admin/ledger/refund — Method
// ════════════════════════════════════════════════════════════

test('refund: original_payment method skips wallet credit', async () => {
  ;(globalThis as any).__currentMockDb = mockRefundDb()
  ;(globalThis as any).__walletBalance = 15000

  const { POST } = await import('@/app/api/admin/ledger/refund/route')
  const res = await request(jsonServer(POST))
    .post('/api/admin/ledger/refund')
    .send({ profile_id: 'student-1', amount_cents: 5000, method: 'original_payment' })

  expect(res.status).toBe(200)
  expect(res.body.data.method).toBe('original_payment')
})

// ════════════════════════════════════════════════════════════
// POST /api/admin/ledger/refund — Non-critical side effects
// ════════════════════════════════════════════════════════════

test('refund: succeeds even when refund_ledger insert fails (non-critical)', async () => {
  // Make refund_ledger insert fail
  const db = mockRefundDb()
  db.from = (table: string) => {
    const base = mockRefundDb().from(table)
    if (table === 'refund_ledger') {
      return { insert: () => Promise.resolve({ error: { message: 'insert failed' } }) }
    }
    return base
  }
  ;(globalThis as any).__currentMockDb = db

  const { POST } = await import('@/app/api/admin/ledger/refund/route')
  const res = await request(jsonServer(POST))
    .post('/api/admin/ledger/refund')
    .send({ profile_id: 'student-1', amount_cents: 5000, order_id: 'order-123' })

  expect(res.status).toBe(200)
  expect(res.body.data.refunded_cents).toBe(5000)
})
