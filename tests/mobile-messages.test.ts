/**
 * mobile-messages.test.ts
 *
 * Unit tests for the Bearer-verified messages surface:
 *   - GET /api/mobile/messages/conversations — list (401/200, filters, counts)
 *   - GET /api/mobile/messages/conversations/[id] — thread (401/403/404/200)
 *   - POST /api/mobile/messages/conversations/[id] — send text (401/400/422/200)
 *
 * verifyToken and the safety guard are mocked — no live Clerk/network in CI.
 */

import http from 'http'
import request from 'supertest'

// ────────────────────────────────────────────────────────────
// Mocks — reset in beforeEach
// ────────────────────────────────────────────────────────────

const mockVerifyToken = jest.fn()
let db: { from: (table: string) => unknown }

jest.mock('@clerk/backend', () => ({
  verifyToken: (...args: unknown[]) => mockVerifyToken(...args),
}))

jest.mock('@/lib/supabase', () => ({
  createSupabaseAdminClient: jest.fn(() => db),
}))

jest.mock('@/lib/safety', () => ({
  safetyGuard: (text: string) => {
    if (/blocked-word/.test(text)) return { ok: false, error: 'Blocked', violations: ['blocked-word'] }
    return { ok: true, violations: [] }
  },
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
      const match = path.match(/\/api\/mobile\/messages\/conversations\/([^/]+)$/)
      const response = await handler(webReq, { params: Promise.resolve(match ? { id: decodeURIComponent(match[1]) } : {}) })
      res.statusCode = response.status
      response.headers.forEach((v, k) => res.setHeader(k, v))
      res.end(Buffer.from(await response.arrayBuffer()))
    })
  })
}

// ────────────────────────────────────────────────────────────
// Fake Supabase chain (extended for messages: neq + insert)
// ────────────────────────────────────────────────────────────

let insertedMessages: any[] = []

class Query {
  table: string
  rows: any[]
  insertRows: any[] | null = null

  constructor(table: string, rows: any[]) {
    this.table = table
    this.rows = [...rows]
  }

  select() { return this }
  eq(col: string, val: any) { this.rows = this.rows.filter(r => r[col] === val); return this }
  neq(col: string, val: any) { this.rows = this.rows.filter(r => r[col] !== val); return this }
  in(col: string, vals: any[]) { this.rows = this.rows.filter(r => vals.includes(r[col])); return this }
  or() { return this }
  order() { return this }
  range() { return this }
  limit() { return this }
  insert(rows: any) {
    const toInsert = Array.isArray(rows) ? rows : [rows]
    const created: any[] = []
    for (const r of toInsert) {
      const row = { ...r, id: `new_${insertedMessages.length + 1}` }
      insertedMessages.push(row)
      created.push(row)
    }
    // Post-insert chaining (select().single()) must see only the new rows.
    this.rows = created
    this.insertRows = [...insertedMessages]
    return this
  }
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

const CONV = {
  id: 'conv_1',
  participant_a: 'prof_1',
  participant_b: 'c1',
  context_kind: 'general',
  context_id: null,
  status: 'active',
  type: 'direct',
  last_message_at: '2026-08-10T10:00:00Z',
  last_message_id: 'msg_2',
  created_at: '2026-08-01T00:00:00Z',
}

const MSG_1 = {
  id: 'msg_1',
  conversation_id: 'conv_1',
  sender_id: 'c1',
  type: 'text',
  body: 'Hello, how can I help?',
  attachment_url: null,
  attachment_name: null,
  ref_offer_id: null,
  reply_to_id: null,
  metadata: null,
  created_at: '2026-08-10T09:00:00Z',
}

const MSG_2 = {
  id: 'msg_2',
  conversation_id: 'conv_1',
  sender_id: 'prof_1',
  type: 'text',
  body: 'Hi! I need help with my F-1 application.',
  attachment_url: null,
  attachment_name: null,
  ref_offer_id: null,
  reply_to_id: null,
  metadata: null,
  created_at: '2026-08-10T10:00:00Z',
}

function baseRows(overrides: Record<string, any[]> = {}) {
  return {
    profiles: [STUDENT_PROFILE, CONSULTANT],
    conversations: [CONV],
    conversation_messages: [MSG_1, MSG_2],
    conversation_participants: [],
    // Read cursor after MSG_1 (09:00) — so the base list has 0 unread.
    conversation_reads: [{ conversation_id: 'conv_1', profile_id: 'prof_1', last_read_at: '2026-08-10T09:30:00Z' }],
    conversation_message_reactions: [],
    ...overrides,
  }
}

beforeEach(() => {
  mockVerifyToken.mockReset()
  insertedMessages = []
  mockVerifyToken.mockResolvedValue({ sub: 'user_known' })
  db = makeDb(baseRows())
})

// ────────────────────────────────────────────────────────────
// GET /api/mobile/messages/conversations
// ────────────────────────────────────────────────────────────

describe('GET /api/mobile/messages/conversations', () => {
  it('returns 401 + signInRequired without a token', async () => {
    const { GET } = await import('@/app/api/mobile/messages/conversations/route')
    const res = await request(jsonServer(GET)).get('/api/mobile/messages/conversations')

    expect(res.status).toBe(401)
    expect(res.body.signInRequired).toBe(true)
  })

  it('returns 401 + signInRequired for an invalid token', async () => {
    mockVerifyToken.mockRejectedValue(new Error('token-invalid'))
    const { GET } = await import('@/app/api/mobile/messages/conversations/route')
    const res = await request(jsonServer(GET))
      .get('/api/mobile/messages/conversations')
      .set('Authorization', 'Bearer bad.token')

    expect(res.status).toBe(401)
    expect(res.body.signInRequired).toBe(true)
  })

  it('returns 404 when the Clerk user has no profile row', async () => {
    db = makeDb(baseRows({ profiles: [] }))
    const { GET } = await import('@/app/api/mobile/messages/conversations/route')
    const res = await request(jsonServer(GET))
      .get('/api/mobile/messages/conversations')
      .set('Authorization', 'Bearer good.token')

    expect(res.status).toBe(404)
  })

  it('returns the conversation list with counts', async () => {
    const { GET } = await import('@/app/api/mobile/messages/conversations/route')
    const res = await request(jsonServer(GET))
      .get('/api/mobile/messages/conversations')
      .set('Authorization', 'Bearer good.token')

    expect(res.status).toBe(200)
    const list = res.body.data
    expect(list.conversations).toHaveLength(1)
    const conv = list.conversations[0]
    expect(conv.id).toBe('conv_1')
    expect(conv.counterpart.name).toBe('Connie Consultant')
    expect(conv.last_message).toBe('Hi! I need help with my F-1 application.')
    expect(conv.last_from_me).toBe(true)
    expect(conv.unread).toBe(0)
    expect(list.total).toBe(1)
    expect(list.page_size).toBe(50)
    expect(list.total_pages).toBe(1)
    expect(list.has_more).toBe(false)
    expect(list.counts.all).toBe(1)
    expect(list.counts.totalUnread).toBe(0)
  })

  it('marks unread when the counterpart has newer messages', async () => {
    db = makeDb(baseRows({
      conversation_messages: [
        MSG_1,
        { ...MSG_2, id: 'msg_3', sender_id: 'c1', created_at: '2026-08-11T00:00:00Z', body: 'Newer message from consultant' },
      ],
      conversations: [{ ...CONV, last_message_id: 'msg_3', last_message_at: '2026-08-11T00:00:00Z' }],
    }))
    const { GET } = await import('@/app/api/mobile/messages/conversations/route')
    const res = await request(jsonServer(GET))
      .get('/api/mobile/messages/conversations')
      .set('Authorization', 'Bearer good.token')

    expect(res.status).toBe(200)
    const conv = res.body.data.conversations[0]
    expect(conv.unread).toBe(1)
    expect(conv.last_from_me).toBe(false)
    expect(res.body.data.counts.totalUnread).toBe(1)
  })

  it('returns an empty list when the profile has no conversations', async () => {
    db = makeDb(baseRows({ conversations: [] }))
    const { GET } = await import('@/app/api/mobile/messages/conversations/route')
    const res = await request(jsonServer(GET))
      .get('/api/mobile/messages/conversations')
      .set('Authorization', 'Bearer good.token')

    expect(res.status).toBe(200)
    expect(res.body.data.conversations).toEqual([])
    expect(res.body.data.counts.all).toBe(0)
  })
})

// ────────────────────────────────────────────────────────────
// GET /api/mobile/messages/conversations/[id]
// ────────────────────────────────────────────────────────────

describe('GET /api/mobile/messages/conversations/[id]', () => {
  it('returns 401 without a token', async () => {
    const { GET } = await import('@/app/api/mobile/messages/conversations/[id]/route')
    const res = await request(jsonServer(GET)).get('/api/mobile/messages/conversations/conv_1')

    expect(res.status).toBe(401)
    expect(res.body.signInRequired).toBe(true)
  })

  it('returns the thread with counterpart + messages', async () => {
    const { GET } = await import('@/app/api/mobile/messages/conversations/[id]/route')
    const res = await request(jsonServer(GET))
      .get('/api/mobile/messages/conversations/conv_1')
      .set('Authorization', 'Bearer good.token')

    expect(res.status).toBe(200)
    const data = res.body.data
    expect(data.conversation.id).toBe('conv_1')
    expect(data.conversation.counterpart.name).toBe('Connie Consultant')
    expect(data.messages).toHaveLength(2)
    // Oldest → newest
    expect(data.messages[0].id).toBe('msg_1')
    expect(data.messages[1].id).toBe('msg_2')
    // Mine get derived delivered/read timestamps
    expect(data.messages[1].sender_id).toBe('prof_1')
    expect(data.messages[1].delivered_at).toBe('2026-08-10T10:00:00Z')
    expect(data.messages[1].read_at).toBeNull()
  })

  it('returns 403 for a conversation I am not part of', async () => {
    db = makeDb(baseRows({
      conversations: [{ ...CONV, participant_a: 'other', participant_b: 'c1' }],
    }))
    const { GET } = await import('@/app/api/mobile/messages/conversations/[id]/route')
    const res = await request(jsonServer(GET))
      .get('/api/mobile/messages/conversations/conv_1')
      .set('Authorization', 'Bearer good.token')

    expect(res.status).toBe(403)
  })

  it('returns 404 for a missing conversation', async () => {
    db = makeDb(baseRows({ conversations: [] }))
    const { GET } = await import('@/app/api/mobile/messages/conversations/[id]/route')
    const res = await request(jsonServer(GET))
      .get('/api/mobile/messages/conversations/conv_missing')
      .set('Authorization', 'Bearer good.token')

    expect(res.status).toBe(404)
  })
})

// ────────────────────────────────────────────────────────────
// POST /api/mobile/messages/conversations/[id]
// ────────────────────────────────────────────────────────────

describe('POST /api/mobile/messages/conversations/[id]', () => {
  it('returns 401 without a token', async () => {
    const { POST } = await import('@/app/api/mobile/messages/conversations/[id]/route')
    const res = await request(jsonServer(POST))
      .post('/api/mobile/messages/conversations/conv_1')
      .send({ body: 'hello' })

    expect(res.status).toBe(401)
    expect(res.body.signInRequired).toBe(true)
  })

  it('sends a text message and returns the created message', async () => {
    const { POST } = await import('@/app/api/mobile/messages/conversations/[id]/route')
    const res = await request(jsonServer(POST))
      .post('/api/mobile/messages/conversations/conv_1')
      .set('Authorization', 'Bearer good.token')
      .send({ body: 'Thanks for the help!' })

    expect(res.status).toBe(200)
    const data = res.body.data
    expect(data.message.sender_id).toBe('prof_1')
    expect(data.message.body).toBe('Thanks for the help!')
    expect(data.message.type).toBe('text')
    expect(insertedMessages).toHaveLength(1)
    expect(insertedMessages[0].conversation_id).toBe('conv_1')
  })

  it('returns 400 for an empty body', async () => {
    const { POST } = await import('@/app/api/mobile/messages/conversations/[id]/route')
    const res = await request(jsonServer(POST))
      .post('/api/mobile/messages/conversations/conv_1')
      .set('Authorization', 'Bearer good.token')
      .send({ body: '   ' })

    expect(res.status).toBe(400)
    expect(res.body.error.message).toBe('body is required')
  })

  it('returns 422 when the safety guard blocks the message', async () => {
    const { POST } = await import('@/app/api/mobile/messages/conversations/[id]/route')
    const res = await request(jsonServer(POST))
      .post('/api/mobile/messages/conversations/conv_1')
      .set('Authorization', 'Bearer good.token')
      .send({ body: 'contact me at blocked-word' })

    expect(res.status).toBe(422)
    expect(res.body.violations).toContain('blocked-word')
  })

  it('returns 404 for a missing conversation', async () => {
    db = makeDb(baseRows({ conversations: [] }))
    const { POST } = await import('@/app/api/mobile/messages/conversations/[id]/route')
    const res = await request(jsonServer(POST))
      .post('/api/mobile/messages/conversations/conv_missing')
      .set('Authorization', 'Bearer good.token')
      .send({ body: 'hello' })

    expect(res.status).toBe(404)
  })
})
