import http from 'http'
import request from 'supertest'
import { GET } from '@/app/api/mm/[...path]/route'

function jsonServer(handler: (req: Request, ctx: any) => Promise<Response>) {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://test')
    const parts = url.pathname.replace(/^\/api\/marketplace\/media\/?/, '').split('/').filter(Boolean)
    const webReq = new Request(`http://test${req.url}`)
    const response = await handler(webReq, { params: Promise.resolve({ path: parts }) })
    res.statusCode = response.status
    response.headers.forEach((v, k) => res.setHeader(k, v))
    res.end(Buffer.from(await response.arrayBuffer()))
  })
}

describe('GET /api/mm/[...path]', () => {
  const original = process.env.NEXT_PUBLIC_SUPABASE_URL

  beforeAll(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://krggzrxxnqfsbbklatxl.supabase.co'
  })
  afterAll(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = original
  })

  it('rejects disallowed buckets', async () => {
    const res = await request(jsonServer(GET)).get('/api/mm/secret-bucket/a/b.jpg')
    expect(res.status).toBe(404)
  })

  it('rejects path traversal', async () => {
    const res = await request(jsonServer(GET)).get('/api/mm/gig-gallery/../x.jpg')
    expect(res.status).toBe(404)
  })

  it('requires bucket + object segment', async () => {
    const res = await request(jsonServer(GET)).get('/api/mm/gig-gallery')
    expect(res.status).toBe(404)
  })
})
