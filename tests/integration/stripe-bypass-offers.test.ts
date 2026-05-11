import http from 'http'
import request from 'supertest'

let clerkUserId = 'admin-clerk'
let db: any

jest.mock('@/lib/auth', () => ({
  getClerkUserId: jest.fn(() => Promise.resolve(clerkUserId)),
}))

jest.mock('@/lib/supabase', () => ({
  createSupabaseAdminClient: jest.fn(() => db),
}))

jest.mock('@/lib/platformConfig', () => ({
  getPlatformSettings: jest.fn(() => Promise.resolve({
    platform_fee_percent: 20,
    consultant_fee_percent: 80,
    attorney_platform_fee_percent: 25,
    minimum_offer_amount_cents: 100,
    maximum_offer_amount_cents: 500000,
    primary_currency: 'usd',
    allowed_currencies: ['usd'],
  })),
}))

function jsonServer(handler: (req: Request, context: any) => Promise<Response>, params: Record<string, string>) {
  const server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', async () => {
      const body = Buffer.concat(chunks)
      const webReq = new Request(`http://test${req.url}`, {
        method: req.method,
        headers: req.headers as HeadersInit,
        body: body.length ? body : undefined,
      })
      const response = await handler(webReq, { params: Promise.resolve(params) })
      res.statusCode = response.status
      response.headers.forEach((value, key) => res.setHeader(key, value))
      res.end(Buffer.from(await response.arrayBuffer()))
    })
  })
  return server
}

class Query {
  table: string
  op: string
  filters: Record<string, any> = {}
  payload: any
  selected = ''

  constructor(table: string, op = 'select', payload?: any) {
    this.table = table
    this.op = op
    this.payload = payload
  }

  select(columns?: string) { this.selected = columns || ''; return this }
  eq(column: string, value: any) { this.filters[column] = value; return this }
  order() { return this }
  limit() { return this }
  in() { return this }
  maybeSingle() { return Promise.resolve({ data: fakeRead(this), error: null }) }
  single() {
    const data = this.op === 'update' || this.op === 'insert' ? fakeWrite(this) : fakeRead(this)
    return Promise.resolve({ data, error: data ? null : { message: 'not found', code: 'PGRST116' } })
  }
  then(resolve: any) { return this.single().then(resolve) }
}

const state: any = {}

function fakeRead(q: Query) {
  if (q.table === 'profiles') {
    if (q.filters.clerk_user_id === 'admin-clerk') return { id: 'admin-profile', role: 'admin', status: 'active', email: 'admin@test.dev' }
    if (q.filters.clerk_user_id === 'client-clerk') return { id: 'client-profile', role: 'client', status: 'active', email: 'client@test.dev' }
    if (q.filters.clerk_user_id === 'attorney-clerk') return { id: 'attorney-profile', role: 'attorney', status: 'active', email: 'attorney@test.dev', full_name: 'Ada Attorney' }
    return null
  }
  if (q.table === 'attorneys') {
    if (q.filters.id === 'attorney-record' || q.filters.profile_id === 'attorney-profile') {
      return { id: 'attorney-record', profile_id: 'attorney-profile', stripe_account_id: null, stripe_onboarding_complete: false, stripe_bypass: state.attorneyBypass ?? true }
    }
  }
  if (q.table === 'consultants') {
    if (q.filters.id === 'consultant-record' || q.filters.profile_id === 'consultant-profile') {
      return { id: 'consultant-record', profile_id: 'consultant-profile', stripe_account_id: null, stripe_onboarding_complete: false, stripe_bypass: state.consultantBypass ?? false }
    }
  }
  if (q.table === 'inquiries') return { id: 'chat-1', client_profile_id: 'client-profile', status: 'open', target_attorney_profile_id: 'attorney-profile' }
  return null
}

function fakeWrite(q: Query) {
  if (q.table === 'attorneys' && q.op === 'update') {
    state.attorneyBypass = q.payload.stripe_bypass
    return { id: 'attorney-record', profile_id: 'attorney-profile', stripe_bypass: state.attorneyBypass }
  }
  if (q.table === 'consultants' && q.op === 'update') {
    state.consultantBypass = q.payload.stripe_bypass
    return { id: 'consultant-record', profile_id: 'consultant-profile', stripe_bypass: state.consultantBypass }
  }
  if (q.table === 'offers' && q.op === 'insert') {
    return { id: 'offer-1', status: 'pending', ...q.payload }
  }
  if (q.table === 'inquiry_messages' && q.op === 'insert') return { id: 'message-1', ...q.payload }
  return q.payload
}

beforeEach(() => {
  state.attorneyBypass = true
  state.consultantBypass = false
  db = {
    from(table: string) {
      return {
        select: (columns?: string) => new Query(table).select(columns),
        update: (payload: any) => new Query(table, 'update', payload),
        insert: (payload: any) => new Query(table, 'insert', payload),
      }
    },
    storage: { from: () => ({ upload: jest.fn() }) },
  }
})

test('admin can toggle attorney stripe_bypass', async () => {
  clerkUserId = 'admin-clerk'
  const { PATCH } = await import('@/app/api/attorneys/[id]/route')
  const res = await request(jsonServer(PATCH, { id: 'attorney-record' }))
    .patch('/api/attorneys/attorney-record')
    .send({ stripe_bypass: true })
    .expect(200)

  expect(res.body).toEqual(expect.objectContaining({
    data: { attorney: expect.objectContaining({ stripe_bypass: true }) },
    error: null,
  }))
})

test('non-admin cannot toggle attorney stripe_bypass', async () => {
  clerkUserId = 'client-clerk'
  const { PATCH } = await import('@/app/api/attorneys/[id]/route')
  const res = await request(jsonServer(PATCH, { id: 'attorney-record' }))
    .patch('/api/attorneys/attorney-record')
    .send({ stripe_bypass: false })
    .expect(403)

  expect(res.body.error.message).toBe('Forbidden')
})

test('offer creation succeeds when attorney bypass is active and no Stripe account exists', async () => {
  clerkUserId = 'attorney-clerk'
  state.attorneyBypass = true
  const { POST } = await import('@/app/api/offers/route')
  const res = await request(jsonServer(POST, {}))
    .post('/api/offers')
    .send({
      chat_id: 'chat-1',
      title: 'Immigration consultation package',
      description: 'A focused consultation with written next steps and document review guidance.',
      price: 25000,
      delivery_days: 3,
      revisions: 1,
      expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    })
    .expect(201)

  expect(res.body.data).toEqual(expect.objectContaining({
    offer_id: 'offer-1',
    status: 'pending',
  }))
})
