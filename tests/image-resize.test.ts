/**
 * image-resize.test.ts
 *
 * Unit tests for the POST /api/images/resize endpoint.
 * All storage calls are mocked — no real file processing.
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

// Mock sharp to avoid actual image processing in tests
jest.mock('sharp', () => {
  return jest.fn().mockImplementation(() => ({
    resize: jest.fn().mockReturnThis(),
    webp: jest.fn().mockReturnThis(),
    toBuffer: jest.fn().mockResolvedValue(Buffer.from('fake-webp-buffer')),
  }))
})

// ────────────────────────────────────────────────────────────
// Tiny HTTP adapter for exercising route handlers in-process
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

  constructor(table: string, op = 'select', payload?: any) {
    this.table = table
    this.op = op
    this.payload = payload
  }

  select() { return this }
  eq(col: string, val: any) { this._filters[col] = val; return this }
  single() {
    if (this.table === 'profiles') {
      return Promise.resolve({
        data: this._filters.clerk_user_id === 'seller-clerk'
          ? { id: 'seller-profile', role: 'consultant', status: 'active' }
          : null,
        error: null,
      })
    }
    return Promise.resolve({ data: null, error: null })
  }
  maybeSingle() { return this.single() }
  order() { return this }
  limit() { return this }
}

const uploadedPaths: string[] = []

function makeDb() {
  return {
    from: (table: string) => ({
      select: () => new Query(table),
      update: (payload: any) => ({
        eq: () => ({
          select: () => ({ single: () => Promise.resolve({ data: payload, error: null }) }),
        }),
      }),
    }),
    storage: {
      getBucket: jest.fn(() => Promise.resolve({ data: { public: true }, error: null })),
      createBucket: jest.fn(),
      updateBucket: jest.fn(),
      from: () => ({
        upload: jest.fn((path: string) => {
          uploadedPaths.push(path)
          return Promise.resolve({ data: { path }, error: null })
        }),
        getPublicUrl: jest.fn((path: string) => ({
          data: { publicUrl: `https://cdn.example.com/${path}` },
        })),
      }),
    },
  }
}

beforeEach(() => {
  clerkUserId = 'seller-clerk'
  uploadedPaths.length = 0
  db = makeDb()
})

describe('GET /api/images/resize', () => {
  it('returns supported presets', async () => {
    const { GET } = await import('@/app/api/images/resize/route')
    const res = await request(jsonServer(GET)).get('/api/images/resize')

    expect(res.status).toBe(200)
    expect(res.body.data.presets).toBeDefined()
    expect(res.body.data.presets.card).toMatchObject({ width: 1200, height: 800 })
    expect(res.body.data.presets.square).toMatchObject({ width: 800, height: 800 })
    expect(res.body.data.allowed_formats).toContain('image/jpeg')
    expect(res.body.data.max_file_size).toBe(10 * 1024 * 1024)
  })
})

describe('POST /api/images/resize', () => {
  it('rejects requests without a file', async () => {
    const { POST } = await import('@/app/api/images/resize/route')
    const res = await request(jsonServer(POST))
      .post('/api/images/resize')
      .send()

    expect(res.status).toBe(400)
    expect(res.body.error.message).toMatch(/multipart/i)
  })

  it('rejects requests from unauthenticated users', async () => {
    clerkUserId = ''
    const { POST } = await import('@/app/api/images/resize/route')
    const res = await request(jsonServer(POST))
      .post('/api/images/resize')
      .attach('file', Buffer.from('fake-image'), 'test.jpg')

    expect(res.status).toBe(401)
  })

  it('rejects large files over 10 MB', async () => {
    const { POST } = await import('@/app/api/images/resize/route')
    const largeBuffer = Buffer.alloc(11 * 1024 * 1024) // 11 MB
    const res = await request(jsonServer(POST))
      .post('/api/images/resize')
      .attach('file', largeBuffer, 'large.jpg')

    expect(res.status).toBe(422)
    expect(res.body.error.message).toMatch(/10 MB|less/)
  })

  it('rejects unsupported file types', async () => {
    const { POST } = await import('@/app/api/images/resize/route')
    const res = await request(jsonServer(POST))
      .post('/api/images/resize')
      .attach('file', Buffer.from('fake-gif'), 'test.gif')

    expect(res.status).toBe(422)
    expect(res.body.error.message).toMatch(/JPG|PNG|WEBP/)
  })

  it('resizes with default card preset', async () => {
    const { POST } = await import('@/app/api/images/resize/route')
    const res = await request(jsonServer(POST))
      .post('/api/images/resize')
      .attach('file', Buffer.from('fake-image'), 'test.jpg')

    expect(res.status).toBe(201)
    expect(res.body.data.url).toContain('cdn.example.com')
    expect(res.body.data.width).toBe(1200)
    expect(res.body.data.height).toBe(800)
    expect(res.body.data.format).toBe('webp')
    expect(res.body.data.preset).toBe('card')
    expect(uploadedPaths.length).toBe(1)
    expect(uploadedPaths[0]).toContain('seller-profile/resized/')
    expect(uploadedPaths[0]).toContain('1200x800')
  })

  it('accepts custom dimensions via preset parameter', async () => {
    const { POST } = await import('@/app/api/images/resize/route')
    const res = await request(jsonServer(POST))
      .post('/api/images/resize')
      .field('preset', 'square')
      .attach('file', Buffer.from('fake-image'), 'test.jpg')

    expect(res.status).toBe(201)
    expect(res.body.data.width).toBe(800)
    expect(res.body.data.height).toBe(800)
    expect(res.body.data.preset).toBe('square')
    expect(uploadedPaths[0]).toContain('800x800')
  })

  it('accepts custom width/height overrides', async () => {
    const { POST } = await import('@/app/api/images/resize/route')
    const res = await request(jsonServer(POST))
      .post('/api/images/resize')
      .field('width', '400')
      .field('height', '300')
      .attach('file', Buffer.from('fake-image'), 'test.jpg')

    expect(res.status).toBe(201)
    expect(res.body.data.width).toBe(400)
    expect(res.body.data.height).toBe(300)
    expect(res.body.data.preset).toBe('custom')
  })

  it('clamps dimensions to 2560 maximum', async () => {
    const { POST } = await import('@/app/api/images/resize/route')
    const res = await request(jsonServer(POST))
      .post('/api/images/resize')
      .field('width', '5000')
      .field('height', '5000')
      .attach('file', Buffer.from('fake-image'), 'test.jpg')

    expect(res.status).toBe(201)
    expect(res.body.data.width).toBe(2560)
    expect(res.body.data.height).toBe(2560)
  })

  it('uploads the processed image to storage', async () => {
    const { POST } = await import('@/app/api/images/resize/route')
    const res = await request(jsonServer(POST))
      .post('/api/images/resize')
      .attach('file', Buffer.from('fake-image'), 'test.jpg')

    expect(res.status).toBe(201)
    expect(uploadedPaths.length).toBe(1)
    expect(uploadedPaths[0]).toContain('resized')
    expect(uploadedPaths[0]).toContain('webp')
  })
})
