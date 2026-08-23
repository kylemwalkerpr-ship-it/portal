/**
 * mobile-checkout.test.ts
 */
import http from 'http'
import request from 'supertest'

const mockVerifyToken = jest.fn()

jest.mock('@clerk/backend', () => ({
  verifyToken: (...args: unknown[]) => mockVerifyToken(...args),
}))

let db: any
jest.mock('@/lib/supabase', () => ({
  createSupabaseAdminClient: jest.fn(() => db),
}))

jest.mock('@/lib/wallet', () => ({
  getOrCreateWallet: jest.fn().mockResolvedValue({ balance_cents: 50000, currency: 'usd' }),
  debit: jest.fn().mockResolvedValue({ id: 'tx_1' }),
  credit: jest.fn(),
}))
jest.mock('@/lib/earnings', () => ({ creditEarning: jest.fn() }))
jest.mock('@/lib/payments', () => ({
  getPaymentProvider: jest.fn(() => ({
    chargeVaulted: jest.fn(),
    charge: jest.fn(),
  })),
  getDefaultGatewayId: jest.fn(() => 'nmi'),
}))
jest.mock('@/lib/payment-methods', () => ({ listCards: jest.fn().mockResolvedValue([]) }))
jest.mock('@/lib/platformConfig', () => ({ getPlatformSettings: jest.fn().mockResolvedValue({ wallet_topup_enabled: true }) }))
jest.mock('@/lib/idempotency', () => ({
  extractIdempotencyKey: jest.fn().mockReturnValue('idem-test-key-12345678'),
  claimIdempotencyKey: jest.fn().mockResolvedValue({ kind: 'fresh' }),
  completeIdempotencyKey: jest.fn(),
  recordPaymentIncident: jest.fn(),
}))
jest.mock('@/lib/fiverr', () => ({
  computeNetPayoutCents: (subtotal: number) => Math.round(subtotal * 0.85),
  computePlatformFeeCents: (subtotal: number, providerType: string) => providerType === 'attorney' ? Math.round(subtotal * 0.15) : 0,
  getPaymentSettingsForApi: () => Promise.resolve({ primary_currency: 'usd' }),
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
  rows: any[] = []
  constructor(rows: any[]) { this.rows = [...rows] }
  select() { return this }
  eq(col: string, val: any) { this.rows = this.rows.filter((r: any) => r[col] === val); return this }
  order() { return this }
  single() { return this.rows.length > 0 ? Promise.resolve({ data: this.rows[0], error: null }) : Promise.resolve({ data: null, error: { message: 'no rows' } }) }
}

function makeDb(tables: Record<string, any[]>) {
  return { from: (t: string) => new Query(tables[t] ?? []) }
}

const STUDENT = { id: 'p1', clerk_user_id: 'u_ok', role: 'client', status: 'active', email: 's@t.com', full_name: 'Student' }
const ATTORNEY = { id: 'p2', clerk_user_id: 'u_att', role: 'attorney', status: 'active', email: 'a@t.com', full_name: 'Attorney' }
const SUSPENDED = { id: 'p3', clerk_user_id: 'u_sus', role: 'client', status: 'suspended', email: 'x@t.com', full_name: 'Sus' }

beforeEach(() => {
  mockVerifyToken.mockReset()
  mockVerifyToken.mockResolvedValue({ sub: 'u_ok' })
  db = makeDb({ profiles: [STUDENT, ATTORNEY, SUSPENDED] })
})

// ═══════ CHECKOUT ORDER ═══════

describe('POST /api/mobile/checkout/order', () => {
  it('401 without token', async () => {
    const { POST } = await import('@/app/api/mobile/checkout/order/route')
    const res = await request(jsonServer(POST)).post('/checkout/order').send({})
    expect(res.status).toBe(401)
    expect(res.body.signInRequired).toBe(true)
  })

  it('401 for invalid token', async () => {
    mockVerifyToken.mockRejectedValue(new Error('bad'))
    const { POST } = await import('@/app/api/mobile/checkout/order/route')
    const res = await request(jsonServer(POST)).post('/checkout/order').set('Authorization', 'Bearer bad').send({})
    expect(res.status).toBe(401)
  })

  it('403 for non-buyer', async () => {
    mockVerifyToken.mockResolvedValue({ sub: 'u_att' })
    const { POST } = await import('@/app/api/mobile/checkout/order/route')
    const res = await request(jsonServer(POST)).post('/checkout/order').set('Authorization', 'Bearer t').send({})
    expect(res.status).toBe(403)
  })

  it('403 for suspended', async () => {
    mockVerifyToken.mockResolvedValue({ sub: 'u_sus' })
    const { POST } = await import('@/app/api/mobile/checkout/order/route')
    const res = await request(jsonServer(POST)).post('/checkout/order').set('Authorization', 'Bearer t').send({})
    expect(res.status).toBe(403)
  })

  it('400 non-gig sourceType', async () => {
    const { POST } = await import('@/app/api/mobile/checkout/order/route')
    const res = await request(jsonServer(POST)).post('/checkout/order').set('Authorization', 'Bearer t').send({ sourceType: 'offer' })
    expect(res.status).toBe(400)
  })

  it('400 missing Idempotency-Key', async () => {
    const { extractIdempotencyKey } = await import('@/lib/idempotency')
    ;(extractIdempotencyKey as jest.Mock).mockReturnValueOnce(null)
    const { POST } = await import('@/app/api/mobile/checkout/order/route')
    const res = await request(jsonServer(POST)).post('/checkout/order').set('Authorization', 'Bearer t').send({ sourceType: 'gig', sourceId: 'g1', tierId: 't1' })
    expect(res.status).toBe(400)
  })

  it('409 in-flight idempotency', async () => {
    const { claimIdempotencyKey } = await import('@/lib/idempotency')
    ;(claimIdempotencyKey as jest.Mock).mockResolvedValueOnce({ kind: 'in_flight' })
    const { POST } = await import('@/app/api/mobile/checkout/order/route')
    const res = await request(jsonServer(POST)).post('/checkout/order').set('Authorization', 'Bearer t').send({ sourceType: 'gig', sourceId: 'g1', tierId: 't1' })
    expect(res.status).toBe(409)
  })

  it('replays idempotency', async () => {
    const { claimIdempotencyKey } = await import('@/lib/idempotency')
    ;(claimIdempotencyKey as jest.Mock).mockResolvedValueOnce({ kind: 'replay', response: { success: true, orderId: 'dup' }, statusCode: 200 })
    const { POST } = await import('@/app/api/mobile/checkout/order/route')
    const res = await request(jsonServer(POST)).post('/checkout/order').set('Authorization', 'Bearer t').send({ sourceType: 'gig', sourceId: 'g1', tierId: 't1' })
    expect(res.status).toBe(200)
    expect(res.body.orderId).toBe('dup')
  })
})

// ═══════ WALLET BALANCE ═══════

describe('GET /api/mobile/wallet/balance', () => {
  it('401 without token', async () => {
    const { GET } = await import('@/app/api/mobile/wallet/balance/route')
    const res = await request(jsonServer(GET)).get('/wallet/balance')
    expect(res.status).toBe(401)
  })

  it('200 with balance', async () => {
    const { GET } = await import('@/app/api/mobile/wallet/balance/route')
    const res = await request(jsonServer(GET)).get('/wallet/balance').set('Authorization', 'Bearer t')
    expect(res.status).toBe(200)
    expect(typeof res.body.balanceCents).toBe('number')
  })
})

// ═══════ PAYMENT METHODS ═══════

describe('GET /api/mobile/wallet/payment-methods', () => {
  it('401 without token', async () => {
    const { GET } = await import('@/app/api/mobile/wallet/payment-methods/route')
    const res = await request(jsonServer(GET)).get('/payment-methods')
    expect(res.status).toBe(401)
  })

  it('200 cards no vault_id', async () => {
    const { listCards } = await import('@/lib/payment-methods')
    ;(listCards as jest.Mock).mockResolvedValueOnce([{ id: 'c1', vault_id: 'v_sec', brand: 'visa', last4: '4242', exp_month: 12, exp_year: 2028, is_default: true }])
    const { GET } = await import('@/app/api/mobile/wallet/payment-methods/route')
    const res = await request(jsonServer(GET)).get('/payment-methods').set('Authorization', 'Bearer t')
    expect(res.status).toBe(200)
    expect(res.body.cards[0].id).toBe('c1')
    expect(res.body.cards[0].vault_id).toBeUndefined()
  })
})

// ── PAYMENT SPLIT: templates must NOT succeed on the NMI/wallet checkout route ──
describe('Payment split guard', () => {
  it('rejects sourceType:"template" with 400', async () => {
    const { POST } = await import('@/app/api/mobile/checkout/order/route')
    const res = await request(jsonServer(POST)).post('/checkout/order')
      .set('Authorization', 'Bearer t')
      .send({
        sourceType: 'template',
        sourceId: 'us-f1-student-visa-ds160-i20-pack',
        tierId: 'any',
        paymentMethod: 'wallet',
      })
    expect(res.status).toBe(400)
    expect(res.body.error.message).toMatch(/gig/i)
  })

  it('rejects sourceType omitted with 400', async () => {
    const { POST } = await import('@/app/api/mobile/checkout/order/route')
    const res = await request(jsonServer(POST)).post('/checkout/order')
      .set('Authorization', 'Bearer t')
      .send({
        sourceId: 'us-f1-student-visa-ds160-i20-pack',
        tierId: 'any',
        paymentMethod: 'wallet',
      })
    expect(res.status).toBe(400)
  })

  it('rejects sourceType:"iap" with 400', async () => {
    const { POST } = await import('@/app/api/mobile/checkout/order/route')
    const res = await request(jsonServer(POST)).post('/checkout/order')
      .set('Authorization', 'Bearer t')
      .send({
        sourceType: 'iap',
        sourceId: 'us-f1-student-visa-ds160-i20-pack',
        tierId: 'any',
        paymentMethod: 'wallet',
      })
    expect(res.status).toBe(400)
  })
})