/**
 * marketplace-fiverr-upgrade.test.ts
 *
 * Unit tests for Phase 2–9 new marketplace functionality.
 * All DB calls are mocked — no real Supabase connection required.
 */

import http from 'http'
import request from 'supertest'

// ────────────────────────────────────────────────────────────
// Shared mutable state — reset in beforeEach
// ────────────────────────────────────────────────────────────

let clerkUserId = 'seller-clerk'
let db: any

jest.mock('@/lib/auth', () => ({
  getClerkUserId: jest.fn(() => Promise.resolve(clerkUserId)),
}))

jest.mock('@/lib/supabase', () => ({
  createSupabaseAdminClient: jest.fn(() => db),
}))

// email helper used by decline route — stub to prevent network calls
jest.mock('@/lib/email', () => ({
  sendEmail: jest.fn(() => Promise.resolve()),
  inquiryOfferDeclinedEmail: jest.fn(() => ({ subject: 'Declined', html: '<p>declined</p>' })),
}))

// ────────────────────────────────────────────────────────────
// Tiny HTTP adapter (mirrors stripe-bypass-offers.test.ts)
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
// Fake DB builder
// ────────────────────────────────────────────────────────────

class Query {
  table: string
  op: string
  _filters: Record<string, any> = {}
  payload: any
  _selected = ''

  constructor(table: string, op = 'select', payload?: any) {
    this.table = table
    this.op = op
    this.payload = payload
  }

  select(cols?: string) { this._selected = cols || ''; return this }
  eq(col: string, val: any) { this._filters[col] = val; return this }
  order() { return this }
  limit() { return this }
  in() { return this }
  maybeSingle() { return Promise.resolve({ data: fakeRead(this), error: null }) }
  single() {
    const data = this.op === 'update' || this.op === 'insert' ? fakeWrite(this) : fakeRead(this)
    return Promise.resolve({
      data,
      error: data ? null : { message: 'not found', code: 'PGRST116' },
    })
  }
  then(resolve: any) { return this.single().then(resolve) }
}

// Per-test state bag
const state: Record<string, any> = {}

function fakeRead(q: Query) {
  if (q.table === 'profiles') {
    if (q._filters.clerk_user_id === 'seller-clerk')
      return { id: 'seller-profile', role: 'consultant', status: 'active', email: 'seller@test.dev' }
    if (q._filters.clerk_user_id === 'admin-clerk')
      return { id: 'admin-profile', role: 'admin', status: 'active', email: 'admin@test.dev' }
    if (q._filters.clerk_user_id === 'client-clerk')
      return { id: 'client-profile', role: 'client', status: 'active', email: 'client@test.dev' }
    return null
  }

  if (q.table === 'gigs') {
    const gig = state.gig ?? null
    if (!gig) return null
    // attach tiers when the select includes them
    return { ...gig, tiers: state.tiers ?? [] }
  }

  if (q.table === 'saved_gigs') {
    if (q.op === 'select') return state.savedGig ?? null
    return null
  }

  if (q.table === 'offers') {
    return state.offer ?? null
  }

  return null
}

function fakeWrite(q: Query) {
  if (q.table === 'gigs' && q.op === 'update') {
    state.gig = { ...state.gig, ...q.payload }
    return { ...state.gig, tiers: state.tiers ?? [] }
  }
  if (q.table === 'saved_gigs' && q.op === 'insert') {
    if (state.duplicateSave) {
      // simulate unique-constraint violation via error path — returned below
      return null
    }
    state.savedGig = { id: 'saved-1', ...q.payload, created_at: new Date().toISOString() }
    return state.savedGig
  }
  if (q.table === 'offers' && q.op === 'update') {
    state.offer = { ...state.offer, ...q.payload }
    return state.offer
  }
  return q.payload
}

function makeDb() {
  return {
    from(table: string) {
      return {
        select: (cols?: string) => new Query(table).select(cols),
        update: (payload: any) => new Query(table, 'update', payload),
        insert: (payload: any) => {
          // Duplicate save: return error immediately from insert chain
          if (table === 'saved_gigs' && state.duplicateSave) {
            const dupErr = { code: '23505', message: 'duplicate key value' }
            // Return a chainable object whose .select().single() resolves with error
            return {
              select: () => ({
                single: () => Promise.resolve({ data: null, error: dupErr }),
              }),
            }
          }
          return new Query(table, 'insert', payload)
        },
      }
    },
    storage: { from: () => ({ upload: jest.fn() }) },
  }
}

beforeEach(() => {
  clerkUserId = 'seller-clerk'
  // Reset shared state
  Object.keys(state).forEach(k => delete state[k])
  db = makeDb()
})

// ════════════════════════════════════════════════════════════
// GIG STATUS TRANSITIONS
// ════════════════════════════════════════════════════════════

test('seller: draft → active via status endpoint is blocked (must use /publish)', async () => {
  state.gig = {
    id: 'gig-1',
    status: 'draft',
    provider_id: 'seller-profile',
    provider_type: 'consultant',
  }

  const { PATCH } = await import('@/app/api/gigs/[id]/status/route')
  const res = await request(jsonServer(PATCH, { id: 'gig-1' }))
    .patch('/api/gigs/gig-1/status')
    .send({ status: 'active' })

  // Sellers must use POST /api/gigs/[id]/publish to activate a gig
  expect(res.status).toBe(422)
  expect(res.body.error.message).toMatch(/publish/)
})

test('seller: deleted → active is rejected (no allowed forward path from deleted)', async () => {
  state.gig = {
    id: 'gig-1',
    status: 'deleted',
    provider_id: 'seller-profile',
    provider_type: 'consultant',
  }

  const { PATCH } = await import('@/app/api/gigs/[id]/status/route')
  const res = await request(jsonServer(PATCH, { id: 'gig-1' }))
    .patch('/api/gigs/gig-1/status')
    .send({ status: 'active' })

  expect(res.status).toBe(422)
  // 'active' is blocked before the transition matrix check with a /publish hint
  expect(res.body.error.message).toMatch(/publish/)
})

test('admin: can move a gig from deleted → active (bypasses seller rules)', async () => {
  clerkUserId = 'admin-clerk'
  state.gig = {
    id: 'gig-1',
    status: 'deleted',
    provider_id: 'seller-profile',
    provider_type: 'consultant',
  }

  const { PATCH } = await import('@/app/api/gigs/[id]/status/route')
  const res = await request(jsonServer(PATCH, { id: 'gig-1' }))
    .patch('/api/gigs/gig-1/status')
    .send({ status: 'active' })

  expect(res.status).toBe(200)
  expect(res.body.data.gig.status).toBe('active')
})

// ════════════════════════════════════════════════════════════
// PUBLISH VALIDATION
// ════════════════════════════════════════════════════════════

function validGigBase() {
  return {
    id: 'gig-2',
    status: 'draft',
    provider_id: 'seller-profile',
    provider_type: 'consultant',
    title: 'A valid title that is long enough for publish',  // 44 chars
    pitch: 'This is a valid pitch that meets the forty-character minimum requirement here.',
    description: 'A'.repeat(350),  // ≥300 chars
    category: 'legal',
    subcategory: 'immigration',
    tags: ['visa', 'consultation', 'immigration'],
    requirements: 'Please describe your situation.',
    gallery_images: ['https://cdn.example.com/image1.jpg'],
  }
}

test('publish: title shorter than 20 chars returns field error', async () => {
  state.gig = { ...validGigBase(), title: 'Too short' }  // 9 chars
  state.tiers = [{ is_active: true, price: 5000, delivery_days: 3 }]

  const { POST } = await import('@/app/api/gigs/[id]/publish/route')
  const res = await request(jsonServer(POST, { id: 'gig-2' }))
    .post('/api/gigs/gig-2/publish')
    .send()

  expect(res.status).toBe(422)
  expect(res.body.error.fields).toHaveProperty('title')
})

test('publish: description shorter than 300 chars returns field error', async () => {
  state.gig = { ...validGigBase(), description: 'Too short description.' }
  state.tiers = [{ is_active: true, price: 5000, delivery_days: 3 }]

  const { POST } = await import('@/app/api/gigs/[id]/publish/route')
  const res = await request(jsonServer(POST, { id: 'gig-2' }))
    .post('/api/gigs/gig-2/publish')
    .send()

  expect(res.status).toBe(422)
  expect(res.body.error.fields).toHaveProperty('description')
})

test('publish: no tags returns field error', async () => {
  state.gig = { ...validGigBase(), tags: [] }
  state.tiers = [{ is_active: true, price: 5000, delivery_days: 3 }]

  const { POST } = await import('@/app/api/gigs/[id]/publish/route')
  const res = await request(jsonServer(POST, { id: 'gig-2' }))
    .post('/api/gigs/gig-2/publish')
    .send()

  expect(res.status).toBe(422)
  expect(res.body.error.fields).toHaveProperty('tags')
})

test('publish: fully valid gig transitions to active', async () => {
  state.gig = validGigBase()
  state.tiers = [{ is_active: true, price: 5000, delivery_days: 3 }]

  const { POST } = await import('@/app/api/gigs/[id]/publish/route')
  const res = await request(jsonServer(POST, { id: 'gig-2' }))
    .post('/api/gigs/gig-2/publish')
    .send()

  expect(res.status).toBe(200)
  expect(res.body.data.gig.status).toBe('active')
})

// ════════════════════════════════════════════════════════════
// SAVED GIGS
// ════════════════════════════════════════════════════════════

test('saved gigs: POST returns 201 with correct shape', async () => {
  clerkUserId = 'client-clerk'

  const { POST } = await import('@/app/api/saved-gigs/route')
  const res = await request(jsonServer(POST))
    .post('/api/saved-gigs')
    .send({ gig_id: 'gig-abc' })

  expect(res.status).toBe(201)
  expect(res.body.data.saved).toMatchObject({
    id: 'saved-1',
    gig_id: 'gig-abc',
  })
})

test('saved gigs: duplicate save returns 409', async () => {
  clerkUserId = 'client-clerk'
  state.duplicateSave = true

  const { POST } = await import('@/app/api/saved-gigs/route')
  const res = await request(jsonServer(POST))
    .post('/api/saved-gigs')
    .send({ gig_id: 'gig-abc' })

  expect(res.status).toBe(409)
  expect(res.body.error.message).toMatch(/Already saved/i)
})

// ════════════════════════════════════════════════════════════
// OFFER STATUS (decline)
// ════════════════════════════════════════════════════════════

test('offer decline: offer in paid status cannot be declined (returns 409)', async () => {
  clerkUserId = 'client-clerk'
  state.offer = {
    id: 'offer-1',
    status: 'paid',
    recipient_id: 'client-profile',
    provider_id: 'seller-profile',
  }

  const { PATCH } = await import('@/app/api/offers/[id]/decline/route')
  const res = await request(jsonServer(PATCH, { id: 'offer-1' }))
    .patch('/api/offers/offer-1/decline')
    .send()

  expect(res.status).toBe(409)
  expect(res.body.error.message).toMatch(/pending/i)
})

test('offer decline: buyer can decline a pending offer', async () => {
  clerkUserId = 'client-clerk'
  state.offer = {
    id: 'offer-1',
    status: 'pending',
    recipient_id: 'client-profile',
    provider_id: 'seller-profile',
    inquiry_id: 'chat-1',
  }

  // Override the db so that every table is handled correctly:
  // - profiles → auth lookup (client-profile)
  // - offers → returns the pending offer, then accepts update
  // - inquiry_messages → no-op insert
  db.from = (table: string) => {
    if (table === 'profiles') {
      return {
        select: () => ({
          eq: (_col: string, val: any) => ({
            single: () => {
              if (val === 'client-clerk') {
                return Promise.resolve({ data: { id: 'client-profile', role: 'client', status: 'active', email: 'client@test.dev' }, error: null })
              }
              // attorney profile lookup for email notification — return null to skip
              return Promise.resolve({ data: null, error: null })
            },
          }),
        }),
      }
    }
    if (table === 'offers') {
      return {
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: state.offer, error: null }),
          }),
        }),
        update: (payload: any) => ({
          eq: () => ({
            select: () => ({
              single: () => {
                state.offer = { ...state.offer, ...payload }
                return Promise.resolve({ data: state.offer, error: null })
              },
            }),
          }),
        }),
      }
    }
    if (table === 'inquiry_messages') {
      return {
        insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: {}, error: null }) }) }),
      }
    }
    // fallback
    return makeDb().from(table)
  }

  const { PATCH } = await import('@/app/api/offers/[id]/decline/route')
  const res = await request(jsonServer(PATCH, { id: 'offer-1' }))
    .patch('/api/offers/offer-1/decline')
    .send()

  expect(res.status).toBe(200)
  expect(res.body.data.offer.status).toBe('declined')
})
