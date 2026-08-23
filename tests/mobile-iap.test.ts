import http from 'http'
import request from 'supertest'

const mockVerifyToken = jest.fn()
jest.mock('@clerk/backend', () => ({ verifyToken: (...a: unknown[]) => mockVerifyToken(...a) }))

let db: any
jest.mock('@/lib/supabase', () => ({ createSupabaseAdminClient: jest.fn(() => db) }))

const mockUserOwnsSlug = jest.fn().mockResolvedValue(false)
jest.mock('@/lib/templateEntitlements', () => ({ userOwnsSlug: (...a: unknown[]) => mockUserOwnsSlug(...a) }))

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
  contains(_col: string, vals: any[]) {
    this.rows = this.rows.filter((r: any) => {
      const arr = r.slugs || r[_col] || []
      return vals.every((v: any) => arr.includes(v))
    })
    return this
  }
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

// ── Set ALLOW_STOREKIT_LOCAL_TESTING=true so that LocalTesting tests
//    pass in the jest (NODE_ENV=test) environment. Without this env var,
//    LocalTesting JWS tokens would be rejected (503) — that's tested below.
const OLD_ENV = { ...process.env }

beforeEach(() => {
  mockVerifyToken.mockReset()
  mockVerifyToken.mockResolvedValue({ sub: 'u1' })
  mockUserOwnsSlug.mockResolvedValue(false)
  // @ts-ignore
  process.env.ALLOW_STOREKIT_LOCAL_TESTING = 'true'
  // @ts-ignore
  process.env.NODE_ENV = 'test' // ensures not 'production'
  db = makeDb({
    profiles: [PROFILE],
    template_orders: [
      { id: 't1', email: 's@t.com', gateway: 'apple_iap', status: 'paid', slugs: ['us-f1-student-visa-ds160-i20-pack'] },
    ],
    template_pdf_renders: [],
    gigs: [GIG],
    gig_tiers: [TIER],
    orders: [],
    wallets: [],
    wallet_ledger: [],
  })
})

afterEach(() => {
  // @ts-ignore
  process.env.NODE_ENV = OLD_ENV.NODE_ENV
  // @ts-ignore
  process.env.ALLOW_STOREKIT_LOCAL_TESTING = OLD_ENV.ALLOW_STOREKIT_LOCAL_TESTING
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

  it('returns 201 for valid LocalTesting IAP (ALLOW_STOREKIT_LOCAL_TESTING=true, NODE_ENV=test)', async () => {
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

  it('returns 503 for LocalTesting JWS when ALLOW_STOREKIT_LOCAL_TESTING is not set', async () => {
    // @ts-ignore
    delete process.env.ALLOW_STOREKIT_LOCAL_TESTING
    const { POST } = await import('@/app/api/mobile/iap/verify/route')
    const res = await request(jsonServer(POST)).post('/verify').set('Authorization', 'Bearer t').send({
      productId: 'com.yousafeconsultancy.app.template.us-f1-student-visa-ds160-i20-pack',
      slug: 'us-f1-student-visa-ds160-i20-pack',
      receipt: 'eyJhbGci.eyJ0cmFuc2FjdGlvbklkIjoiMTAwMDAwMDEiLCJlbnZpcm9ubWVudCI6IkxvY2FsVGVzdGluZyJ9.sig',
    })
    // LocalTesting w/o ALLOW_STOREKIT_LOCAL_TESTING → same as Production → verifyWithApple returns null → 503
    expect(res.status).toBe(503)
  })

  it('returns 503 for LocalTesting JWS when NODE_ENV=production', async () => {
    // @ts-ignore
    process.env.NODE_ENV = 'production'
    const { POST } = await import('@/app/api/mobile/iap/verify/route')
    const res = await request(jsonServer(POST)).post('/verify').set('Authorization', 'Bearer t').send({
      productId: 'com.yousafeconsultancy.app.template.us-f1-student-visa-ds160-i20-pack',
      slug: 'us-f1-student-visa-ds160-i20-pack',
      receipt: 'eyJhbGci.eyJ0cmFuc2FjdGlvbklkIjoiMTAwMDAwMDEiLCJlbnZpcm9ubWVudCI6IkxvY2FsVGVzdGluZyJ9.sig',
    })
    // Even with ALLOW_STOREKIT_LOCAL_TESTING=true, NODE_ENV=production blocks LocalTesting
    expect(res.status).toBe(503)
  })

  it('returns 503 for LocalTesting JWS when NODE_ENV is unset', async () => {
    // @ts-ignore
    delete process.env.NODE_ENV
    const { POST } = await import('@/app/api/mobile/iap/verify/route')
    const res = await request(jsonServer(POST)).post('/verify').set('Authorization', 'Bearer t').send({
      productId: 'com.yousafeconsultancy.app.template.us-f1-student-visa-ds160-i20-pack',
      slug: 'us-f1-student-visa-ds160-i20-pack',
      receipt: 'eyJhbGci.eyJ0cmFuc2FjdGlvbklkIjoiMTAwMDAwMDEiLCJlbnZpcm9ubWVudCI6IkxvY2FsVGVzdGluZyJ9.sig',
    })
    // NODE_ENV unset → not 'test' or 'development' → same as production → 503
    expect(res.status).toBe(503)
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
    db = makeDb({ profiles: [PROFILE], template_orders: [], template_pdf_renders: [] })
    const { POST } = await import('@/app/api/mobile/iap/restore/route')
    const res = await request(jsonServer(POST)).post('/restore').set('Authorization', 'Bearer t').send({ productIds: [] })
    expect(res.status).toBe(200)
    expect(res.body.slugs).toEqual([])
  })

  // LEFTOVER B: owning pack A must NOT restore pack B
  it('restores only slugs the user actually owns', async () => {
    const ownSlug = 'us-f1-student-visa-ds160-i20-pack'
    const otherSlug = 'canada-study-permit-complete-pack'

    // Mock: userOwnsSlug returns true only for the owned slug
    mockUserOwnsSlug.mockImplementation((_db: any, _email: string, slug: string) =>
      Promise.resolve(slug === ownSlug)
    )

    const { POST } = await import('@/app/api/mobile/iap/restore/route')
    const res = await request(jsonServer(POST)).post('/restore').set('Authorization', 'Bearer t').send({
      productIds: [
        `com.yousafeconsultancy.app.template.${ownSlug}`,
        `com.yousafeconsultancy.app.template.${otherSlug}`,
      ],
    })
    expect(res.status).toBe(200)
    // Only the owned slug should be restored
    expect(res.body.slugs).toEqual([ownSlug])
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
    expect(res.body.success).toBeFalsy()
  })

  it('gig with valid ID does not get gig-only rejection', async () => {
    const { POST } = await import('@/app/api/mobile/checkout/order/route')
    const res = await request(jsonServer(POST)).post('/order')
      .set('Authorization', 'Bearer t')
      .set('Idempotency-key', 'ik-gig-1')
      .send({
        sourceType: 'gig',
        sourceId: 'gig_1',
        tierId: 'tier_1',
        paymentMethod: 'wallet',
      })
    if (res.body.error?.message) {
      expect(res.body.error.message).not.toMatch(/gig.only|Invalid checkout source/i)
    }
  })
})