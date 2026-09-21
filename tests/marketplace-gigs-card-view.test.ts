/**
 * /api/marketplace/gigs?view=card — narrow projection contract.
 *
 * MARKET-ROOT-TRANSFER-LATENCY: the landing grid appends later inventory on
 * demand, and it needs 13 card fields per brief. The default response must stay
 * byte-for-byte what existing consumers get (full rows + tiers + provider
 * contact), while `view=card` returns the card fields only, keeps the same
 * filters/pagination/total semantics, and never names the optional
 * `cover_image_url` column (PostgREST 42703 would empty the page).
 */

import http from 'http'
import request from 'supertest'
import { GET } from '@/app/api/marketplace/gigs/route'

const mockGetCached = jest.fn(async () => null)
const mockSetCached = jest.fn(async () => {})
let db: any
let selects: string[] = []
let ranges: Array<[number, number]> = []
let orders: string[] = []

jest.mock('@/lib/cache', () => ({
  getCached: () => mockGetCached(),
  setCached: () => mockSetCached(),
  generateVersionedCacheKey: jest.fn(async () => 'test-cache-key'),
}))

jest.mock('@/lib/portalAuth', () => ({
  getOptionalPortalUser: jest.fn(async () => null),
}))

jest.mock('@/lib/supabase', () => ({
  createSupabaseAdminClient: jest.fn(() => db),
}))

const FULL_ROW = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'i-485-evidence-package',
  title: 'I-485 evidence package',
  pitch: 'A long pitch that must not reach the landing grid.',
  description: 'An even longer description that must not reach the landing grid.',
  category: 'green_card',
  provider_type: 'attorney',
  provider_id: 'p1',
  jurisdiction: 'US',
  avg_rating: 4.8,
  review_count: 11,
  rank_score: 0.42,
  order_count: 2,
  cover_image_url: 'https://cdn.example/cover.jpg',
  gallery_images: [{ url: 'https://cdn.example/cover.jpg' }],
  tiers: [{ price: 49000, delivery_days: 5, is_active: true }],
  provider: { id: 'p1', full_name: 'Jane Doe', email: 'jane@example.com', username: 'jane', country: 'US' },
}

class Query {
  table: string
  constructor(table: string) {
    this.table = table
  }
  select(columns: string) {
    selects.push(columns)
    return this
  }
  eq() {
    return this
  }
  in() {
    return this
  }
  or() {
    return this
  }
  not() {
    return this
  }
  gte() {
    return this
  }
  order(column: string) {
    orders.push(column)
    return this
  }
  range(from: number, to: number) {
    ranges.push([from, to])
    return this
  }
  then<T>(onFulfilled: (v: { data: any[]; error: null; count: number }) => T) {
    const rows = this.table === 'gigs' ? [FULL_ROW] : []
    return Promise.resolve({ data: rows, error: null, count: 217 }).then(onFulfilled)
  }
}

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

beforeEach(() => {
  jest.clearAllMocks()
  selects = []
  ranges = []
  orders = []
  db = {
    rpc: jest.fn(async () => ({ data: null, error: { message: 'function unavailable' } })),
    from: (table: string) => new Query(table),
  }
})

describe('GET /api/marketplace/gigs — view=card', () => {
  it('returns exactly the landing card fields (no pitch/description/provider email)', async () => {
    const res = await request(jsonServer(GET)).get(
      '/api/marketplace/gigs?view=card&sort=trending&limit=48&page=2',
    )
    expect(res.status).toBe(200)
    const gig = res.body.data.gigs[0]
    expect(Object.keys(gig).sort()).toEqual(
      [
        'avg_rating',
        'category',
        'cover_image_url',
        'delivery_days',
        'id',
        'jx',
        'order_count',
        'provider_country',
        'provider_headshot_url',
        'provider_name',
        'provider_type',
        'rank_score',
        'review_count',
        'slug',
        'starting_price',
        'title',
      ].sort(),
    )
    expect(gig.provider_name).toBe('Jane Doe')
    expect(gig.jx).toBe('us')
    expect(gig.starting_price).toBe(49000)
    expect(gig.delivery_days).toBe(5)
    expect(gig.cover_image_url).toBe('https://cdn.example/cover.jpg')
    expect(gig.pitch).toBeUndefined()
    expect(gig.description).toBeUndefined()
    expect(gig.provider).toBeUndefined()
    // Pagination/total semantics are shared with the default response.
    expect(res.body.data).toMatchObject({ total: 217, page: 2, limit: 48, hasMore: true })
    expect(ranges).toEqual([[48, 95]])
  })

  it('never names the optional cover_image_url column in the select', async () => {
    await request(jsonServer(GET)).get('/api/marketplace/gigs?view=card&limit=48&page=1')
    const gigSelect = selects.find((s) => s.includes('gig_tiers')) || ''
    expect(gigSelect).not.toMatch(/(^|,\s*)cover_image_url(,|\s*$)/)
    expect(gigSelect).toContain('gallery_images')
    expect(gigSelect).toContain('rank_score')
    expect(gigSelect).toContain('tiers:gig_tiers(price, delivery_days, is_active)')
  })

  it('keeps the default response unchanged (full rows + provider contact)', async () => {
    const res = await request(jsonServer(GET)).get('/api/marketplace/gigs?limit=20&page=1')
    expect(res.status).toBe(200)
    const gig = res.body.data.gigs[0]
    expect(gig.pitch).toContain('must not reach the landing grid')
    expect(gig.description).toBeDefined()
    expect(gig.provider.email).toBe('jane@example.com')
    expect(selects.some((s) => s.startsWith('*, tiers:gig_tiers(*)')))
  })

  it('treats any other view value as the default response', async () => {
    const res = await request(jsonServer(GET)).get('/api/marketplace/gigs?view=full&limit=20&page=1')
    expect(res.body.data.gigs[0].provider.email).toBe('jane@example.com')
  })
})
