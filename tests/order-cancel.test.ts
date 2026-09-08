/**
 * order-cancel.test.ts
 *
 * Regression tests for client cancellation of unstarted orders:
 *   - POST /api/orders/[id]/cancel   (server-authoritative; delegates to the
 *     client_cancel_order RPC — mocked here, no live DB)
 *   - GET  /api/orders/[id]/cancel   (shared eligibility; lib/orderCancellation)
 *   - lib/orderCancellation          (gates, aliases, marketplace/offer parity,
 *                                     financial-consistency refusals)
 *   - race guards on start/progress/status transitions (a client cancellation
 *     committed between read and write must never be resurrected)
 *
 * DB call semantics are mocked via jest.mock on portalAuth + supabase; the RPC
 * is mocked per-test so each scenario exercises the route's own mapping and
 * never touches a live database.
 */
import http from 'http'
import request from 'supertest'

// ── Mocks ────────────────────────────────────────────────────────────────────
let __currentMockDb: any
let __auth: { profileId: string; role: string } | null

jest.mock('@/lib/portalAuth', () => ({
  requirePortalUser: jest.fn(async () => {
    const auth = (globalThis as any).__auth
    if (!auth) return { error: 'Unauthorized', status: 401 }
    if (auth === 'missing') return { error: 'Profile not found.', status: 404 }
    return {
      db: (globalThis as any).__currentMockDb,
      profile: { id: auth.profileId, role: auth.role },
      profileId: auth.profileId,
      role: auth.role,
    }
  }),
}))

jest.mock('@/lib/supabase', () => ({
  createSupabaseAdminClient: jest.fn(() => (globalThis as any).__currentMockDb),
}))

jest.mock('@/lib/consultant', () => ({
  getCurrentConsultant: jest.fn(async () => {
    const auth = (globalThis as any).__consultantAuth
    if (!auth) return { error: 'Unauthorized', status: 401 }
    return { db: (globalThis as any).__currentMockDb, profile: { id: auth }, consultant: { id: auth } }
  }),
}))

jest.mock('@/lib/attorneyAuth', () => ({
  requireAttorney: jest.fn(async () => {
    const id = (globalThis as any).__attorneyAuth
    if (!id) return { ctx: null, error: 'Unauthorized', status: 401 }
    return {
      ctx: { db: (globalThis as any).__currentMockDb, profileId: id },
      error: null,
      status: 200,
    }
  }),
}))

jest.mock('@/lib/earnings', () => ({
  releaseEarningsForOrder: jest.fn(async () => []),
}))

// ── HTTP adapter ─────────────────────────────────────────────────────────────
function jsonServer(handler: (req: Request, context: any) => Promise<Response>, params: Record<string, string> = {}) {
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

// ── Order fixtures ───────────────────────────────────────────────────────────
function unstartedOrder(overrides: Record<string, any> = {}) {
  return {
    id: '00000000-0000-0000-0000-00000000aaaa',
    client_id: 'client-1',
    status: 'created',
    progress: 0,
    currency: 'usd',
    amount_paid: 5000,
    total_amount: 50,
    escrow_status: 'held',
    escrow_amount: 50,
    escrow_released_amount: 0,
    escrow_refunded_amount: 0,
    escrow_disputed_at: null,
    escrow_frozen_at: null,
    auto_release_eligible_at: null,
    cancelled_at: null,
    refunded_amount: 0,
    refund_status: null,
    payout_status: 'pending',
    ...overrides,
  }
}

// ── Mock DB builders ─────────────────────────────────────────────────────────
/** DB for POST /cancel (which only calls the RPC). */
function rpcDb(result: { data?: any; error?: any }) {
  return {
    rpc: jest.fn(async () => result),
    from: () => ({
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }),
    }),
  }
}

/** DB for GET /cancel (reads order + milestones + earnings then returns verdict). */
function eligibilityDb(order: Record<string, any> | null, overrides: { milestones?: any[]; earnings?: any[] } = {}) {
  return {
    rpc: jest.fn(async () => ({ data: null, error: null })),
    from(table: string) {
      if (table === 'orders') {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve(
                order ? { data: order, error: null } : { data: null as any, error: { message: 'not found' } },
              ),
            }),
          }),
        }
      }
      if (table === 'order_milestones') {
        return { select: () => ({ eq: () => Promise.resolve({ data: overrides.milestones ?? [], error: null }) }) }
      }
      if (table === 'provider_earnings') {
        return { select: () => ({ eq: () => Promise.resolve({ data: overrides.earnings ?? [], error: null }) }) }
      }
      return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }) }
    },
  }
}

/** DB for the consultant accept/progress + generic status race-guard tests. */
function raceGuardDb(opts: {
  order: Record<string, any> | null
  updateMatches?: boolean // false simulates the client cancellation committing between read and write
  consultantId?: string
}) {
  const { order, updateMatches = true, consultantId = 'provider-1' } = opts

  // Conditional update chain: any number of .eq() then .select().maybeSingle()
  const updateChain = () => {
    const select = () => ({
      maybeSingle: () =>
        updateMatches
          ? Promise.resolve({ data: order ? { ...order, status: 'in_progress' } : null, error: null })
          : Promise.resolve({ data: null, error: null }),
      single: () =>
        Promise.resolve(
          updateMatches && order
            ? { data: { ...order }, error: null }
            : { data: null as any, error: updateMatches ? null : { message: 'not found' } },
        ),
    })
    const eq = () => ({ eq, select })
    return { eq }
  }

  // Read chain: select().eq().eq().single() / select().eq().single()
  const readResult = () =>
    order ? Promise.resolve({ data: { ...order }, error: null }) : Promise.resolve({ data: null as any, error: { message: 'not found' } })

  return {
    rpc: jest.fn(async () => ({ data: null, error: null })),
    from(table: string) {
      if (table === 'orders') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({ single: readResult, maybeSingle: readResult }),
              single: readResult,
              maybeSingle: readResult,
            }),
          }),
          update: updateChain,
        }
      }
      return {
        select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }),
        insert: () => Promise.resolve({ error: null }),
      }
    },
  }
}

beforeEach(() => {
  delete (globalThis as any).__currentMockDb
  delete (globalThis as any).__auth
  delete (globalThis as any).__consultantAuth
  delete (globalThis as any).__attorneyAuth
})

// ════════════════════════════════════════════════════════════════════════
// POST /api/orders/[id]/cancel — auth
// ════════════════════════════════════════════════════════════════════════

test('cancel: unauthenticated returns 401', async () => {
  ;(globalThis as any).__auth = null
  ;(globalThis as any).__currentMockDb = rpcDb({ data: null, error: null })

  const { POST } = await import('@/app/api/orders/[id]/cancel/route')
  const res = await request(jsonServer(POST, { id: 'order-1' })).post('/api/orders/order-1/cancel').send({})

  expect(res.status).toBe(401)
})

test('cancel: non-client role returns 403', async () => {
  ;(globalThis as any).__auth = { profileId: 'provider-1', role: 'consultant' }
  ;(globalThis as any).__currentMockDb = rpcDb({ data: null, error: null })

  const { POST } = await import('@/app/api/orders/[id]/cancel/route')
  const res = await request(jsonServer(POST, { id: 'order-1' })).post('/api/orders/order-1/cancel').send({})

  expect(res.status).toBe(403)
})

// ════════════════════════════════════════════════════════════════════════
// POST /api/orders/[id]/cancel — RPC outcomes (server-authoritative)
// ════════════════════════════════════════════════════════════════════════

test('cancel: owning client cancels and RPC args carry owner + reason (financial handshake)', async () => {
  ;(globalThis as any).__auth = { profileId: 'client-1', role: 'client' }
  const db = rpcDb({
    data: { ok: true, refund_cents: 5000, refund_method: 'wallet', wallet_balance_cents: 12345, from_status: 'created' },
  })
  ;(globalThis as any).__currentMockDb = db

  const { POST } = await import('@/app/api/orders/[id]/cancel/route')
  const res = await request(jsonServer(POST, { id: 'order-1' }))
    .post('/api/orders/order-1/cancel')
    .send({ reason: 'Changed my mind' })

  expect(res.status).toBe(200)
  expect(res.body.data.refund_cents).toBe(5000)
  expect(res.body.data.refund_method).toBe('wallet')
  expect(res.body.data.wallet_balance_cents).toBe(12345)

  // Financial integrity: the route must pass the RPC the *owning client's*
  // profile id (which the RPC re-verifies against orders.client_id) — an
  // outsider or forged body can never pick the refund recipient.
  expect(db.rpc).toHaveBeenCalledWith('client_cancel_order', {
    p_order_id: 'order-1',
    p_caller_id: 'client-1',
    p_reason: 'Changed my mind',
  })
})

test('cancel: ownership denial from RPC maps to 403', async () => {
  ;(globalThis as any).__auth = { profileId: 'intruder', role: 'client' }
  ;(globalThis as any).__currentMockDb = rpcDb({
    data: { ok: false, code: 'forbidden', message: 'Only the owning client can cancel this order.' },
  })

  const { POST } = await import('@/app/api/orders/[id]/cancel/route')
  const res = await request(jsonServer(POST, { id: 'order-1' })).post('/api/orders/order-1/cancel').send({})

  expect(res.status).toBe(403)
  expect(res.body.error.code).toBe('forbidden')
})

test('cancel: not_found maps to 404', async () => {
  ;(globalThis as any).__auth = { profileId: 'client-1', role: 'client' }
  ;(globalThis as any).__currentMockDb = rpcDb({ data: { ok: false, code: 'not_found', message: 'Order not found.' } })

  const { POST } = await import('@/app/api/orders/[id]/cancel/route')
  const res = await request(jsonServer(POST, { id: 'order-1' })).post('/api/orders/order-1/cancel').send({})

  expect(res.status).toBe(404)
})

test('cancel: started order denial maps to 409 work_started', async () => {
  ;(globalThis as any).__auth = { profileId: 'client-1', role: 'client' }
  ;(globalThis as any).__currentMockDb = rpcDb({
    data: { ok: false, code: 'work_started', message: 'Work has started on this order, so it cannot be cancelled.' },
  })

  const { POST } = await import('@/app/api/orders/[id]/cancel/route')
  const res = await request(jsonServer(POST, { id: 'order-1' })).post('/api/orders/order-1/cancel').send({})

  expect(res.status).toBe(409)
})

test('cancel: terminal denial (already_cancelled) maps to 409', async () => {
  ;(globalThis as any).__auth = { profileId: 'client-1', role: 'client' }
  ;(globalThis as any).__currentMockDb = rpcDb({
    data: { ok: false, code: 'already_cancelled', message: 'Order is already cancelled and cannot be cancelled.' },
  })

  const { POST } = await import('@/app/api/orders/[id]/cancel/route')
  const res = await request(jsonServer(POST, { id: 'order-1' })).post('/api/orders/order-1/cancel').send({})

  expect(res.status).toBe(409)
})

test('cancel: inconsistent monetary state maps to 422 (never fabricate a refund)', async () => {
  ;(globalThis as any).__auth = { profileId: 'client-1', role: 'client' }
  ;(globalThis as any).__currentMockDb = rpcDb({
    data: {
      ok: false,
      code: 'inconsistent_money',
      message: 'Escrow balance does not match the captured amount — refusing to fabricate a refund.',
    },
  })

  const { POST } = await import('@/app/api/orders/[id]/cancel/route')
  const res = await request(jsonServer(POST, { id: 'order-1' })).post('/api/orders/order-1/cancel').send({})

  expect(res.status).toBe(422)
  expect(res.body.error.code).toBe('inconsistent_money')
})

test('cancel: financial-consistency denial codes map to 422', async () => {
  ;(globalThis as any).__auth = { profileId: 'client-1', role: 'client' }

  const { POST } = await import('@/app/api/orders/[id]/cancel/route')

  for (const code of ['invalid_escrow', 'escrow_mismatch', 'currency_unknown', 'unsupported_currency', 'wallet_currency_mismatch']) {
    ;(globalThis as any).__currentMockDb = rpcDb({
      data: { ok: false, code, message: `denied (${code})` },
    })
    const res = await request(jsonServer(POST, { id: 'order-1' })).post('/api/orders/order-1/cancel').send({})
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe(code)
  }
})

test('cancel: repeated cancellation is refused on the second attempt', async () => {
  ;(globalThis as any).__auth = { profileId: 'client-1', role: 'client' }

  // First call: success. Second call: the order is now terminal in the DB.
  let calls = 0
  const db = {
    rpc: jest.fn(async () => {
      calls += 1
      return calls === 1
        ? { data: { ok: true, refund_cents: 5000, refund_method: 'wallet', wallet_balance_cents: 0, from_status: 'created' }, error: null }
        : { data: { ok: false, code: 'already_cancelled', message: 'Order is already cancelled and cannot be cancelled.' }, error: null }
    }),
    from: () => ({ select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }) }),
  }
  ;(globalThis as any).__currentMockDb = db

  const { POST } = await import('@/app/api/orders/[id]/cancel/route')
  const server = jsonServer(POST, { id: 'order-1' })

  const first = await request(server).post('/api/orders/order-1/cancel').send({})
  expect(first.status).toBe(200)
  expect(first.body.data.refund_cents).toBe(5000)

  const second = await request(server).post('/api/orders/order-1/cancel').send({})
  expect(second.status).toBe(409)
  expect(second.body.error.code).toBe('already_cancelled')
})

test('cancel: migration not deployed -> 501 deploy_required (never unsafe fallback)', async () => {
  ;(globalThis as any).__auth = { profileId: 'client-1', role: 'client' }
  ;(globalThis as any).__currentMockDb = rpcDb({
    data: null,
    error: { message: 'Could not find the function public.client_cancel_order(uuid, uuid, text) in the schema cache' },
  })

  const { POST } = await import('@/app/api/orders/[id]/cancel/route')
  const res = await request(jsonServer(POST, { id: 'order-1' })).post('/api/orders/order-1/cancel').send({})

  expect(res.status).toBe(501)
  expect(res.body.error.deploy_required).toBe(true)
})

test('cancel: unexpected RPC failure -> 500 with atomic_refund flag', async () => {
  ;(globalThis as any).__auth = { profileId: 'client-1', role: 'client' }
  ;(globalThis as any).__currentMockDb = rpcDb({ data: null, error: { message: 'connection refused' } })

  const { POST } = await import('@/app/api/orders/[id]/cancel/route')
  const res = await request(jsonServer(POST, { id: 'order-1' })).post('/api/orders/order-1/cancel').send({})

  expect(res.status).toBe(500)
  expect(res.body.error.atomic_refund).toBe(true)
})

// ════════════════════════════════════════════════════════════════════════
// GET /api/orders/[id]/cancel — shared eligibility
// ════════════════════════════════════════════════════════════════════════

test('eligibility: unauthenticated returns 401', async () => {
  ;(globalThis as any).__auth = null
  ;(globalThis as any).__currentMockDb = eligibilityDb(unstartedOrder())

  const { GET } = await import('@/app/api/orders/[id]/cancel/route')
  const res = await request(jsonServer(GET, { id: 'order-1' })).get('/api/orders/order-1/cancel')

  expect(res.status).toBe(401)
})

test('eligibility: non-owner cannot read another client order', async () => {
  ;(globalThis as any).__auth = { profileId: 'other-client', role: 'client' }
  ;(globalThis as any).__currentMockDb = eligibilityDb(unstartedOrder({ client_id: 'client-1' }))

  const { GET } = await import('@/app/api/orders/[id]/cancel/route')
  const res = await request(jsonServer(GET, { id: 'order-1' })).get('/api/orders/order-1/cancel')

  expect(res.status).toBe(403)
})

test('eligibility: unstarted held order is cancellable with full captured refund', async () => {
  ;(globalThis as any).__auth = { profileId: 'client-1', role: 'client' }
  ;(globalThis as any).__currentMockDb = eligibilityDb(unstartedOrder({ amount_paid: 5000, escrow_amount: 50 }))

  const { GET } = await import('@/app/api/orders/[id]/cancel/route')
  const res = await request(jsonServer(GET, { id: 'order-1' })).get('/api/orders/order-1/cancel')

  expect(res.status).toBe(200)
  expect(res.body.data.cancellable).toBe(true)
  expect(res.body.data.refundCents).toBe(5000)
  expect(res.body.data.refundMethod).toBe('wallet')
})

test('eligibility: legacy unstarted aliases (queued/pending/new) are all cancellable', async () => {
  ;(globalThis as any).__auth = { profileId: 'client-1', role: 'client' }

  const { GET } = await import('@/app/api/orders/[id]/cancel/route')

  for (const status of ['queued', 'pending', 'new']) {
    ;(globalThis as any).__currentMockDb = eligibilityDb(unstartedOrder({ status }))
    const res = await request(jsonServer(GET, { id: 'order-1' })).get('/api/orders/order-1/cancel')
    expect(res.status).toBe(200)
    expect(res.body.data.cancellable).toBe(true)
  }
})

test('eligibility: started/terminal statuses are refused', async () => {
  ;(globalThis as any).__auth = { profileId: 'client-1', role: 'client' }

  const { GET } = await import('@/app/api/orders/[id]/cancel/route')

  for (const status of ['in_progress', 'under_review', 'completed', 'cancelled', 'refunded', 'released']) {
    ;(globalThis as any).__currentMockDb = eligibilityDb(unstartedOrder({ status }))
    const res = await request(jsonServer(GET, { id: 'order-1' })).get('/api/orders/order-1/cancel')
    expect(res.status).toBe(200)
    expect(res.body.data.cancellable).toBe(false)
  }
})

test('eligibility: milestone work evidence denies (do not trust status alias alone)', async () => {
  ;(globalThis as any).__auth = { profileId: 'client-1', role: 'client' }
  ;(globalThis as any).__currentMockDb = eligibilityDb(unstartedOrder(), {
    milestones: [{ id: 'm1', status: 'in_progress' }],
  })

  const { GET } = await import('@/app/api/orders/[id]/cancel/route')
  const res = await request(jsonServer(GET, { id: 'order-1' })).get('/api/orders/order-1/cancel')

  expect(res.status).toBe(200)
  expect(res.body.data.cancellable).toBe(false)
  expect(res.body.data.code).toBe('work_started')
})

test('eligibility: provider earning already releasable denies', async () => {
  ;(globalThis as any).__auth = { profileId: 'client-1', role: 'client' }
  ;(globalThis as any).__currentMockDb = eligibilityDb(unstartedOrder(), {
    earnings: [{ id: 'e1', status: 'releasable' }],
  })

  const { GET } = await import('@/app/api/orders/[id]/cancel/route')
  const res = await request(jsonServer(GET, { id: 'order-1' })).get('/api/orders/order-1/cancel')

  expect(res.status).toBe(200)
  expect(res.body.data.cancellable).toBe(false)
})

// ════════════════════════════════════════════════════════════════════════
// lib/orderCancellation — unit gates (aliases, parity, financial integrity)
// ════════════════════════════════════════════════════════════════════════

test('lib: marketplace gig order and accepted offer order have identical eligibility (parity)', () => {
  const { getClientCancellationEligibility } = require('@/lib/orderCancellation')

  const base = {
    status: 'created',
    progress: 0,
    currency: 'usd',
    amount_paid: 25000,
    total_amount: 250,
    escrow_status: 'held',
    escrow_amount: 250,
    escrow_released_amount: 0,
    escrow_refunded_amount: 0,
    payout_status: 'pending',
    refunded_amount: 0,
    refund_status: null,
    cancelled_at: null,
    escrow_disputed_at: null,
    escrow_frozen_at: null,
    auto_release_eligible_at: null,
  }
  // Marketplace order came from a gig purchase; the offer order came from an
  // accepted message offer. Same order state -> same verdict, because the
  // cancellation contract is order-state based, not source-based.
  const gigOrder = { id: 'gig-order', gig_id: 'gig-1', ...base }
  const offerOrder = { id: 'offer-order', offer_id: 'offer-1', source_offer_id: null, ...base }

  const gigVerdict = getClientCancellationEligibility(gigOrder, { callerId: 'client-1' })
  const offerVerdict = getClientCancellationEligibility(offerOrder, { callerId: 'client-1' })

  expect(gigVerdict).toEqual(offerVerdict)
  expect(gigVerdict).toEqual({ cancellable: true, refundCents: 25000, refundMethod: 'wallet' })
})

test('lib: financial integrity — escrow mismatch and missing amount_paid never fabricate a refund', () => {
  const { getClientCancellationEligibility } = require('@/lib/orderCancellation')

  // escrow_amount $200 vs amount_paid 5000c ($50) -> exact-match refusal.
  const mismatch = getClientCancellationEligibility({
    status: 'created', progress: 0, currency: 'usd', amount_paid: 5000, total_amount: 50,
    escrow_status: 'held', escrow_amount: 200, payout_status: 'pending',
  })
  expect(mismatch).toMatchObject({ cancellable: false, code: 'escrow_mismatch' })

  // amount_paid missing but total_amount > 0 -> refuse.
  const missing = getClientCancellationEligibility({
    status: 'created', progress: 0, currency: 'usd', amount_paid: null, total_amount: 50,
    escrow_status: 'held', escrow_amount: 50, payout_status: 'pending',
  })
  expect(missing).toMatchObject({ cancellable: false, code: 'inconsistent_money' })

  // No money at all -> refuse (no_funds).
  const noFunds = getClientCancellationEligibility({
    status: 'created', progress: 0, currency: 'usd', amount_paid: 0, total_amount: 0,
    escrow_status: 'held', payout_status: 'pending',
  })
  expect(noFunds).toMatchObject({ cancellable: false, code: 'no_funds' })
})

test('lib: escrow must be verified held with a positive, exact-cent balance', () => {
  const { getClientCancellationEligibility } = require('@/lib/orderCancellation')

  // Null escrow_amount (legacy, never initialized) fails safely.
  expect(getClientCancellationEligibility(unstartedOrder({ escrow_amount: null }))).toMatchObject({
    cancellable: false,
    code: 'invalid_escrow',
  })
  // Zero escrow_amount fails safely.
  expect(getClientCancellationEligibility(unstartedOrder({ escrow_amount: 0 }))).toMatchObject({
    cancellable: false,
    code: 'invalid_escrow',
  })
  // Negative escrow_amount fails safely.
  expect(getClientCancellationEligibility(unstartedOrder({ escrow_amount: -50 }))).toMatchObject({
    cancellable: false,
    code: 'invalid_escrow',
  })
  // escrow_status refunded (legacy) is not verified held.
  expect(getClientCancellationEligibility(unstartedOrder({ escrow_status: 'refunded', escrow_amount: 50 }))).toMatchObject({
    cancellable: false,
    code: 'escrow_not_held',
  })
  // One-cent drift is refused (exact match required).
  expect(getClientCancellationEligibility(unstartedOrder({ amount_paid: 5000, escrow_amount: 50.01 }))).toMatchObject({
    cancellable: false,
    code: 'escrow_mismatch',
  })
  // Exact match still cancels.
  expect(getClientCancellationEligibility(unstartedOrder({ amount_paid: 5000, escrow_amount: 50 }))).toEqual({
    cancellable: true,
    refundCents: 5000,
    refundMethod: 'wallet',
  })
})

test('lib: currency guards — unknown and non-USD orders are refused', () => {
  const { getClientCancellationEligibility } = require('@/lib/orderCancellation')

  // NULL order currency is ambiguous (the 'usd' DB default cannot certify
  // legacy provenance) -> refused.
  expect(getClientCancellationEligibility(unstartedOrder({ currency: null }))).toMatchObject({
    cancellable: false,
    code: 'currency_unknown',
  })
  // Known non-USD order cannot be refunded through the USD wallet ledger.
  expect(getClientCancellationEligibility(unstartedOrder({ currency: 'cad' }))).toMatchObject({
    cancellable: false,
    code: 'unsupported_currency',
  })
  // Uppercase is normalized to lowercase.
  expect(getClientCancellationEligibility(unstartedOrder({ currency: 'USD' }))).toMatchObject({
    cancellable: true,
    refundCents: 5000,
  })
})

test('lib: ownership is enforced by callerId', () => {
  const { getClientCancellationEligibility } = require('@/lib/orderCancellation')
  const verdict = getClientCancellationEligibility(
    unstartedOrder({ client_id: 'someone-else' }),
    { callerId: 'client-1' },
  )
  expect(verdict).toMatchObject({ cancellable: false, code: 'forbidden' })
})

test('lib: prior refund indicators deny (repeated/partial refund protection)', () => {
  const { getClientCancellationEligibility } = require('@/lib/orderCancellation')
  for (const over of [
    { escrow_refunded_amount: 10 },
    { refunded_amount: 5 },
    { refund_status: 'succeeded' },
    { cancelled_at: '2026-01-01T00:00:00Z' },
  ]) {
    expect(getClientCancellationEligibility(unstartedOrder(over))).toMatchObject({
      cancellable: false,
      code: 'already_refunded',
    })
  }
})

// ════════════════════════════════════════════════════════════════════════
// Race guards — conditional status updates must refuse a resurrect
// ════════════════════════════════════════════════════════════════════════

test('race: consultant accept refuses when client cancelled between read and write', async () => {
  ;(globalThis as any).__consultantAuth = 'provider-1'
  // updateMatches=false => the conditional update matches zero rows, the exact
  // state after a client cancellation committed concurrently.
  ;(globalThis as any).__currentMockDb = raceGuardDb({
    order: { id: 'order-1', status: 'created', consultant_id: 'provider-1' },
    updateMatches: false,
    consultantId: 'provider-1',
  })

  const { POST } = await import('@/app/api/consultant/orders/[id]/accept/route')
  const res = await request(jsonServer(POST, { id: 'order-1' })).post('/api/consultant/orders/order-1/accept')

  expect(res.status).toBe(409)
})

test('race: consultant accept succeeds when order is still unstarted', async () => {
  ;(globalThis as any).__consultantAuth = 'provider-1'
  ;(globalThis as any).__currentMockDb = raceGuardDb({
    order: { id: 'order-1', status: 'created', consultant_id: 'provider-1' },
    updateMatches: true,
    consultantId: 'provider-1',
  })

  const { POST } = await import('@/app/api/consultant/orders/[id]/accept/route')
  const res = await request(jsonServer(POST, { id: 'order-1' })).post('/api/consultant/orders/order-1/accept')

  expect(res.status).toBe(200)
  expect(res.body.order.status).toBe('in_progress')
})

test('race: consultant progress refuses when cancelled between read and write', async () => {
  ;(globalThis as any).__consultantAuth = 'provider-1'
  ;(globalThis as any).__currentMockDb = raceGuardDb({
    order: { id: 'order-1', status: 'created', consultant_id: 'provider-1' },
    updateMatches: false,
  })

  const { PATCH } = await import('@/app/api/consultant/orders/[id]/progress/route')
  const res = await request(jsonServer(PATCH, { id: 'order-1' }))
    .patch('/api/consultant/orders/order-1/progress')
    .send({ progress: 20 })

  expect(res.status).toBe(409)
})

test('race: generic provider status start refuses when cancelled between read and write', async () => {
  ;(globalThis as any).__auth = { profileId: 'provider-1', role: 'consultant' }
  const db = raceGuardDb({ order: { id: 'order-1', status: 'created', consultant_id: 'provider-1' }, updateMatches: false })
  ;(globalThis as any).__currentMockDb = db

  const { PATCH } = await import('@/app/api/orders/[id]/status/route')
  const res = await request(jsonServer(PATCH, { id: 'order-1' }))
    .patch('/api/orders/order-1/status')
    .send({ status: 'in_progress' })

  expect(res.status).toBe(409)
})

test('race: generic provider status marks cancelled (legitimate provider workflow preserved)', async () => {
  ;(globalThis as any).__auth = { profileId: 'provider-1', role: 'consultant' }
  ;(globalThis as any).__currentMockDb = raceGuardDb({
    order: { id: 'order-1', status: 'created', consultant_id: 'provider-1' },
    updateMatches: true,
  })

  const { PATCH } = await import('@/app/api/orders/[id]/status/route')
  const res = await request(jsonServer(PATCH, { id: 'order-1' }))
    .patch('/api/orders/order-1/status')
    .send({ status: 'cancelled' })

  // PROVIDER_TRANSITIONS: created -> ['in_progress','cancelled'] — allowed; the
  // conditional update still applies and returns the updated order.
  expect(res.status).toBe(200)
})

test('race: consultant complete refuses on a never-started order (no flip to released)', async () => {
  ;(globalThis as any).__consultantAuth = 'provider-1'
  ;(globalThis as any).__currentMockDb = raceGuardDb({
    // Status 'created' — cannot be completed even if the consultant races.
    order: { id: 'order-1', status: 'created', consultant_id: 'provider-1' },
    updateMatches: true,
  })

  const { POST } = await import('@/app/api/consultant/orders/[id]/complete/route')
  const res = await request(jsonServer(POST, { id: 'order-1' })).post('/api/consultant/orders/order-1/complete')

  // Not in COMPLETABLE -> rejected before any write.
  expect(res.status).toBe(409)
})

// ════════════════════════════════════════════════════════════════════════
// createPaidOrder — initialized checkout monetary fields
// ════════════════════════════════════════════════════════════════════════

function checkoutDb(firstInsertResult?: { data?: any; error?: any }) {
  const insertCalls: Array<Record<string, unknown>> = []
  let insertCount = 0
  const db: any = {
    insertCalls,
    from(table: string) {
      if (table === 'orders') {
        return {
          insert: (o: Record<string, unknown>) => {
            insertCalls.push(o)
            return {
              select: () => ({
                single: () => {
                  insertCount += 1
                  if (firstInsertResult && insertCount === 1) return Promise.resolve(firstInsertResult)
                  return Promise.resolve({ data: { id: 'order-1' }, error: null })
                },
              }),
            }
          },
          // nextOrderIdentity read: select().order().limit().maybeSingle()
          select: () => ({
            order: () => ({ limit: () => ({ maybeSingle: () => Promise.resolve({ data: { order_sequence: 3 }, error: null }) }) }),
          }),
        }
      }
      if (table === 'profiles') {
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { full_name: 'Joe', email: 'j@x.com' }, error: null }) }) }) }
      }
      if (table === 'gigs') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { order_count: 2 }, error: null }) }) }),
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        }
      }
      return { insert: () => Promise.resolve({ error: null }) }
    },
  }
  return db
}

const checkoutItem = {
  sourceType: 'gig' as const,
  sourceId: 'gig-1',
  title: 'Consult',
  description: 'Work with a consultant',
  currency: 'cad',
  subtotalCents: 10000,
  platformFeeCents: 2000,
  totalCents: 12000,
  netPayoutCents: 10000,
  providerProfileId: 'prov-1',
  providerType: 'consultant' as const,
  clientProfileId: 'cli-1',
  deliveryDays: 3,
  gigId: 'gig-1',
  tierId: 'tier-1',
}

test('checkout: createPaidOrder initializes currency, escrow_amount, and money units', async () => {
  const { createPaidOrder } = await import('@/lib/checkoutOrders')
  const db = checkoutDb()
  const order = await createPaidOrder(db, checkoutItem, { paymentMethod: 'wallet', actorId: 'cli-1', skipSourceUpdate: true })

  expect(order.id).toBe('order-1')
  // Captured insert carries the actual resolved currency and a dollars
  // escrow_amount + cents amount_paid, so cancellation can reconcile later.
  expect(db.insertCalls[0]).toMatchObject({
    client_id: 'cli-1',
    status: 'created',
    escrow_status: 'held',
    currency: 'cad',
    escrow_amount: 120,
    total_amount: 120,
    amount_paid: 12000,
    platform_fee_amount: 2000,
    consultant_payout_amount: 10000,
  })
})

test('checkout: a schema missing currency/escrow_amount fails loudly (never silently strips)', async () => {
  const { createPaidOrder } = await import('@/lib/checkoutOrders')

  for (const col of ['currency', 'escrow_amount']) {
    const db = checkoutDb({ data: null, error: { message: `Could not find the '${col}' column or '${col}' in the schema` } })
    await expect(
      createPaidOrder(db, checkoutItem, { paymentMethod: 'wallet', actorId: 'cli-1', skipSourceUpdate: true }),
    ).rejects.toThrow(/currency|escrow_amount/)
  }
})

test('checkout: legacy USD orders initialised through createPaidOrder reconcile (exact cents)', async () => {
  const { createPaidOrder } = await import('@/lib/checkoutOrders')
  const { getClientCancellationEligibility } = require('@/lib/orderCancellation')

  const db = checkoutDb()
  const item = { ...checkoutItem, currency: 'usd' }
  await createPaidOrder(db, item, { paymentMethod: 'wallet', actorId: 'cli-1', skipSourceUpdate: true })
  const insert = db.insertCalls[0] as any
  const verdict = getClientCancellationEligibility({
    status: insert.status,
    client_id: insert.client_id,
    currency: insert.currency,
    amount_paid: insert.amount_paid,
    total_amount: insert.total_amount,
    escrow_status: insert.escrow_status,
    escrow_amount: insert.escrow_amount,
    payout_status: 'pending',
  })
  expect(verdict).toEqual({ cancellable: true, refundCents: 12000, refundMethod: 'wallet' })
})

// ════════════════════════════════════════════════════════════════════════
// Attorney progress — terminal/resurrection guards
// ════════════════════════════════════════════════════════════════════════

test('race: attorney progress refuses when cancelled between read and write', async () => {
  ;(globalThis as any).__attorneyAuth = 'provider-1'
  ;(globalThis as any).__currentMockDb = raceGuardDb({
    order: { id: 'order-1', status: 'in_progress', consultant_id: 'provider-1' },
    updateMatches: false,
  })

  const { PATCH } = await import('@/app/api/attorney/orders/[id]/progress/route')
  const res = await request(jsonServer(PATCH, { id: 'order-1' }))
    .patch('/api/attorney/orders/order-1/progress')
    .send({ progress: 60 })

  expect(res.status).toBe(409)
})

test('race: attorney progress cannot push a never-started order to review', async () => {
  ;(globalThis as any).__attorneyAuth = 'provider-1'
  ;(globalThis as any).__currentMockDb = raceGuardDb({
    order: { id: 'order-1', status: 'created', consultant_id: 'provider-1' },
    updateMatches: true,
  })

  const { PATCH } = await import('@/app/api/attorney/orders/[id]/progress/route')
  const res = await request(jsonServer(PATCH, { id: 'order-1' }))
    .patch('/api/attorney/orders/order-1/progress')
    .send({ status: 'review' })

  expect(res.status).toBe(409)
})

test('race: attorney progress on an in-progress order still works', async () => {
  ;(globalThis as any).__attorneyAuth = 'provider-1'
  ;(globalThis as any).__currentMockDb = raceGuardDb({
    order: { id: 'order-1', status: 'in_progress', consultant_id: 'provider-1' },
    updateMatches: true,
  })

  const { PATCH } = await import('@/app/api/attorney/orders/[id]/progress/route')
  const res = await request(jsonServer(PATCH, { id: 'order-1' }))
    .patch('/api/attorney/orders/order-1/progress')
    .send({ progress: 75 })

  expect(res.status).toBe(200)
})