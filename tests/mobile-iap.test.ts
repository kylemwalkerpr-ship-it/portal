import http from 'http'
import request from 'supertest'

const mockVerifyToken = jest.fn()
jest.mock('@clerk/backend', () => ({ verifyToken: (...a: unknown[]) => mockVerifyToken(...a) }))

let db: any
jest.mock('@/lib/supabase', () => ({ createSupabaseAdminClient: jest.fn(() => db) }))

jest.mock('@/lib/templateEntitlements', () => ({ userOwnsSlug: jest.fn().mockResolvedValue(false) }))

function jsonServer(h: (req: Request, ctx?: any) => Promise<Response>) {
  return http.createServer(async (req, res) => {
    const chunks: Buffer[] = []
    req.on('data', c => chunks.push(c))
    req.on('end', async () => {
      const body = Buffer.concat(chunks)
      const webReq = new Request(`http://test${req.url}`, { method: req.method, headers: req.headers as HeadersInit, body: body.length ? body : undefined })
      const match = req.url?.match(/\/([^/?]+)$/)
      const resp = await h(webReq, { params: Promise.resolve(match ? { slug: match[1] } : {}) })
      res.statusCode = resp.status
      resp.headers.forEach((v, k) => res.setHeader(k, v))
      res.end(Buffer.from(await resp.arrayBuffer()))
    })
  })
}

class Query {
  rows: any[] = []
  constructor(t: string, rows: any[]) { this.rows = [...rows] }
  select() { return this }
  eq(k: string, v: any) { this.rows = this.rows.filter((r: any) => r[k] === v); return this }
  in() { return this }
  contains() { return this }
  order() { return this }
  limit() { return this }
  single() { return this.rows.length ? Promise.resolve({ data: this.rows[0], error: null }) : Promise.resolve({ data: null, error: { message: 'none' } }) }
  maybeSingle() { return this.single() }
  insert(rows: any) {
    const arr = Array.isArray(rows) ? rows : [rows]
    arr.forEach((r: any) => { this.rows = [{ id: 'gen-' + Math.random().toString(36).slice(2, 8), ...r }] })
    return this
  }
  upload() {
    return Promise.resolve({ error: null } as any)
  }
}

function makeDb(tables: Record<string, any[]>) {
  const from = (t: string) => new Query(t, tables[t] ?? [])
  const storage = { from: () => ({ createSignedUrl: jest.fn().mockResolvedValue({ signedUrl: 'https://cdn.example.com/signed', error: null }) }) }
  return { from, storage }
}

const PROFILE = { id: 'p1', clerk_user_id: 'u1', role: 'client', status: 'active', email: 's@t.com', full_name: 'Student' }

const GIG = {
  id: 'gig_1',
  status: 'active',
  title: 'Test Gig',
  provider_id: 'prov_1',
  provider_type: 'consultant',
}
const TIER = {
  id: 'tier_1',
  gig_id: 'gig_1',
  tier: 'Basic',
  price: 5000,
  is_active: true,
}

beforeEach(() => {
  mockVerifyToken.mockReset()
  mockVerifyToken.mockResolvedValue({ sub: 'u1' })
  db = makeDb({
    profiles: [PROFILE],
    template_orders: [],
    template_pdf_renders: [],
    gigs: [GIG],
    gig_tiers: [TIER],
    orders: [],
    wallets: [],
    wallet_ledger: [],
  })
})

describe('GET /api/mobile/templates/catalogue', () => {
  it('returns 16 packs', async () => {
    const { GET } = await import('@/app/api/mobile/templates/catalogue/route')
    const res = await request(jsonServer(GET)).get('/catalogue')
    expect(res.status).toBe(200)
    expect(res.body.packs.length).toBe(16)
  })
})

describe('POST /api/mobile/iap/verify', () => {
  it('returns 401 without token', async () => {
    const { POST } = await import('@/app/api/mobile/iap/verify/route')
    const res = await request(jsonServer(POST)).post('/verify').send({})
    expect(res.status).toBe(401)
  })

  it('returns 400 missing receipt', async () => {
    const { POST } = await import('@/app/api/mobile/iap/verify/route')
    const res = await request(jsonServer(POST)).post('/verify').set('Authorization', 'Bearer t').send({ productId: 'x' })
    expect(res.status).toBe(400)
  })

  it('returns 404 unknown product', async () => {
    const { POST } = await import('@/app/api/mobile/iap/verify/route')
    const res = await request(jsonServer(POST)).post('/verify').set('Authorization', 'Bearer t').send({
      productId: 'com.yousafeconsultancy.app.template.NOEXIST',
      receipt: 'eyJhbGci.eyJ0cmFuc2FjdGlvbklkIjoiMTAwMDAwMDEiLCJlbnZpcm9ubWVudCI6IkxvY2FsVGVzdGluZyJ9.sig',
    })
    expect(res.status).toBe(404)
  })

  it('returns 400 when productId does not match slug', async () => {
    const { POST } = await import('@/app/api/mobile/iap/verify/route')
    const res = await request(jsonServer(POST)).post('/verify').set('Authorization', 'Bearer t').send({
      productId: 'com.yousafeconsultancy.app.template.us-f1-student-visa-ds160-i20-pack',
      slug: 'canada-study-permit-complete-pack',
      receipt: 'eyJhbGci.eyJ0cmFuc2FjdGlvbklkIjoiMTAwMDAwMDEiLCJlbnZpcm9ubWVudCI6IkxvY2FsVGVzdGluZyJ9.sig',
    })
    expect(res.status).toBe(400)
  })

  it('returns 201 for valid LocalTesting IAP', async () => {
    const { POST } = await import('@/app/api/mobile/iap/verify/route')
    const res = await request(jsonServer(POST)).post('/verify').set('Authorization', 'Bearer t').send({
      productId: 'com.yousafeconsultancy.app.template.us-f1-student-visa-ds160-i20-pack',
      slug: 'us-f1-student-visa-ds160-i20-pack',
      receipt: 'eyJhbGci.eyJ0cmFuc2FjdGlvbklkIjoiMTAwMDAwMDEiLCJlbnZpcm9ubWVudCI6IkxvY2FsVGVzdGluZyJ9.sig',
    })
    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
  })

  it('returns 503 for Production environment with no Apple verification', async () => {
    const { POST } = await import('@/app/api/mobile/iap/verify/route')
    const res = await request(jsonServer(POST)).post('/verify').set('Authorization', 'Bearer t').send({
      productId: 'com.yousafeconsultancy.app.template.us-f1-student-visa-ds160-i20-pack',
      slug: 'us-f1-student-visa-ds160-i20-pack',
      receipt: 'eyJhbGci.eyJ0cmFuc2FjdGlvbklkIjoiMTAwMDAwMDEiLCJlbnZpcm9ubWVudCI6IlByb2R1Y3Rpb24ifQ.sig',
    })
    expect(res.status).toBe(503)
    expect(res.body.error.retryable).toBe(true)
  })

  it('rejects JWS without transactionId even in LocalTesting', async () => {
    const { POST } = await import('@/app/api/mobile/iap/verify/route')
    const res = await request(jsonServer(POST)).post('/verify').set('Authorization', 'Bearer t').send({
      productId: 'com.yousafeconsultancy.app.template.us-f1-student-visa-ds160-i20-pack',
      slug: 'us-f1-student-visa-ds160-i20-pack',
      receipt: 'eyJhbGci.eyJlbnZpcm9ubWVudCI6IkxvY2FsVGVzdGluZyJ9.sig',
    })
    expect(res.status).toBe(400)
  })
})

describe('POST /api/mobile/iap/restore', () => {
  it('returns 401 without token', async () => {
    const { POST } = await import('@/app/api/mobile/iap/restore/route')
    const res = await request(jsonServer(POST)).post('/restore').send({})
    expect(res.status).toBe(401)
  })

  it('returns empty slugs when nothing purchased', async () => {
    const { POST } = await import('@/app/api/mobile/iap/restore/route')
    const res = await request(jsonServer(POST)).post('/restore').set('Authorization', 'Bearer t').send({ productIds: [] })
    expect(res.status).toBe(200)
    expect(res.body.slugs).toEqual([])
  })
})

describe('GET /api/mobile/templates/download/[slug]', () => {
  it('returns 401 without token', async () => {
    const { GET } = await import('@/app/api/mobile/templates/download/[slug]/route')
    const res = await request(jsonServer(GET as any)).get('/download/x')
    expect(res.status).toBe(401)
  })
})

// ── PAYMENT SPLIT: template purchases must NOT succeed on the NMI/wallet checkout route ──
describe('Payment split guard', () => {
  it('rejects sourceType:"template" with 400', async () => {
    const { POST } = await import('@/app/api/mobile/checkout/order/route')
    const res = await request(jsonServer(POST)).post('/order')
      .set('Authorization', 'Bearer t')
      .set('Idempotency-Key', 'ik-template-1')
      .send({
        sourceType: 'template',
        sourceId: 'us-f1-student-visa-ds160-i20-pack',
        tierId: 'any',
        paymentMethod: 'wallet',
      })
    expect(res.status).toBe(400)
    // Must say gig-only
    expect(res.body.error.message).toMatch(/gig/i)
  })

  it('rejects sourceType omitted with 400', async () => {
    const { POST } = await import('@/app/api/mobile/checkout/order/route')
    const res = await request(jsonServer(POST)).post('/order')
      .set('Authorization', 'Bearer t')
      .set('Idempotency-Key', 'ik-empty-1')
      .send({
        sourceId: 'us-f1-student-visa-ds160-i20-pack',
        tierId: 'any',
        paymentMethod: 'wallet',
      })
    expect(res.status).toBe(400)
  })

  it('rejects sourceType:"iap" with 400', async () => {
    const { POST } = await import('@/app/api/mobile/checkout/order/route')
    const res = await request(jsonServer(POST)).post('/order')
      .set('Authorization', 'Bearer t')
      .set('Idempotency-Key', 'ik-iap-1')
      .send({
        sourceType: 'iap',
        sourceId: 'us-f1-student-visa-ds160-i20-pack',
        tierId: 'any',
        paymentMethod: 'wallet',
      })
    expect(res.status).toBe(400)
  })

  it('rejects template slug as sourceId with sourceType:"gig" (404 — not a gig)', async () => {
    const { POST } = await import('@/app/api/mobile/checkout/order/route')
    const res = await request(jsonServer(POST)).post('/order')
      .set('Authorization', 'Bearer t')
      .set('Idempotency-Key', 'ik-slug-1')
      .send({
        sourceType: 'gig',
        sourceId: 'us-f1-student-visa-ds160-i20-pack',
        tierId: 'any',
        paymentMethod: 'wallet',
      })
    expect(res.status).not.toBe(200)
    // Must NOT succeed with a template purchase
    expect(res.body.success).toBeFalsy()
  })

  it('gig with valid ID does not get gig-only rejection', async () => {
    const { POST } = await import('@/app/api/mobile/checkout/order/route')
    // node http lowercases all headers, so su replicatet passes idempotency-key
    const res = await request(jsonServer(POST)).post('/order')
      .set('Authorization', 'Bearer t')
      .set('Idempotency-key', 'ik-gig-1')
      .send({
        sourceType: 'gig',
        sourceId: 'gig_1',
        tierId: 'tier_1',
        paymentMethod: 'wallet',
      })
    // Should NOT be the generic "gig-only" rejection (that's the split-guard error)
    // It may fail on wallet/mock — that's a different kind of failure
    if (res.body.error?.message) {
      expect(res.body.error.message).not.toMatch(/gig.only|Invalid checkout source/i)
    }
  })
})