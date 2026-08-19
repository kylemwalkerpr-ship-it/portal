/**
 * mobile-auth.test.ts
 *
 * Unit tests for the native-app session surface:
 *   - lib/mobileAuth.ts — verifyMobileBearer (valid / missing / garbage)
 *   - POST /api/mobile/session — Bearer → profile envelope, 401 on bad token
 *
 * verifyToken is mocked so no live Clerk and no network runs in CI.
 */

import http from 'http'
import request from 'supertest'
import { verifyMobileBearer } from '@/lib/mobileAuth'

// ────────────────────────────────────────────────────────────
// Mocks — reset in beforeEach
// ────────────────────────────────────────────────────────────

const mockVerifyToken = jest.fn()
let db: any

jest.mock('@clerk/backend', () => ({
  verifyToken: (...args: unknown[]) => mockVerifyToken(...args),
}))

jest.mock('@/lib/supabase', () => ({
  createSupabaseAdminClient: jest.fn(() => db),
}))

// ────────────────────────────────────────────────────────────
// Tiny HTTP adapter for exercising the route handler in-process
// ────────────────────────────────────────────────────────────

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

// ────────────────────────────────────────────────────────────
// Fake Supabase builder (profiles table only)
// ────────────────────────────────────────────────────────────

function makeDb(knownUserId = 'user_known') {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: (_col: string, val: string) => ({
          single: () =>
            Promise.resolve(
              table === 'profiles' && val === knownUserId
                ? {
                    data: {
                      id: 'prof_1',
                      role: 'student',
                      status: 'active',
                      email: 'student@example.com',
                      full_name: 'Ada Student',
                      country_code: 'NG',
                      phone: null,
                    },
                    error: null,
                  }
                : { data: null, error: { message: 'no rows' } },
            ),
        }),
      }),
    }),
  }
}

beforeEach(() => {
  mockVerifyToken.mockReset()
  db = makeDb()
})

// ────────────────────────────────────────────────────────────
// Helper: verifyMobileBearer
// ────────────────────────────────────────────────────────────

describe('verifyMobileBearer', () => {
  it('returns missing when no Authorization header is present', async () => {
    const result = await verifyMobileBearer(null)
    expect(result).toEqual({ status: 'unauthenticated', reason: 'missing' })
    expect(mockVerifyToken).not.toHaveBeenCalled()
  })

  it('returns missing when the header is not a Bearer token', async () => {
    const result = await verifyMobileBearer('Basic abc123')
    expect(result).toEqual({ status: 'unauthenticated', reason: 'missing' })
    expect(mockVerifyToken).not.toHaveBeenCalled()
  })

  it('returns the Clerk user id for a valid token', async () => {
    mockVerifyToken.mockResolvedValue({ sub: 'user_123', azp: 'com.yousafeconsultancy.app' })
    const result = await verifyMobileBearer('Bearer good.token.here')
    expect(result).toEqual({ status: 'authenticated', userId: 'user_123' })
    expect(mockVerifyToken).toHaveBeenCalledWith(
      'good.token.here',
      expect.objectContaining({ authorizedParties: expect.arrayContaining(['com.yousafeconsultancy.app']) }),
    )
  })

  it('returns invalid for a garbage/expired token that fails verification', async () => {
    mockVerifyToken.mockRejectedValue(new Error('token-invalid-signature'))
    const result = await verifyMobileBearer('Bearer garbage.token')
    expect(result).toEqual({ status: 'unauthenticated', reason: 'invalid' })
  })

  it('logs only the azp claim (never the JWT) on an authorized-parties mismatch', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    mockVerifyToken.mockRejectedValue(
      Object.assign(new Error('azp not allowed'), { reason: 'token-invalid-authorized-parties' }),
    )
    const token = 'Bearer eyJhbGciOiJub25lIn0.eyJhenAiOiJzb21lLW90aGVyLWFwcCJ9.sig'

    const result = await verifyMobileBearer(token)

    expect(result).toEqual({ status: 'unauthenticated', reason: 'invalid' })
    const logged = consoleSpy.mock.calls.map((c) => c.join(' ')).join('\n')
    expect(logged).toContain('some-other-app') // azp claim only
    expect(logged).not.toContain('eyJhbGciOiJub25lIn0') // never the JWT body
    consoleSpy.mockRestore()
  })
})

// ────────────────────────────────────────────────────────────
// Route: POST /api/mobile/session
// ────────────────────────────────────────────────────────────

describe('POST /api/mobile/session', () => {
  it('returns 401 + signInRequired when the token is missing', async () => {
    const { POST } = await import('@/app/api/mobile/session/route')
    const res = await request(jsonServer(POST)).post('/api/mobile/session')

    expect(res.status).toBe(401)
    expect(res.body.signInRequired).toBe(true)
    expect(res.body.error.message).toMatch(/missing/i)
  })

  it('returns 401 + signInRequired when the token is invalid', async () => {
    mockVerifyToken.mockRejectedValue(new Error('token-invalid'))
    const { POST } = await import('@/app/api/mobile/session/route')
    const res = await request(jsonServer(POST))
      .post('/api/mobile/session')
      .set('Authorization', 'Bearer bad.token')

    expect(res.status).toBe(401)
    expect(res.body.signInRequired).toBe(true)
    expect(res.body.error.message).toMatch(/invalid/i)
  })

  it('returns the profile envelope for a valid token', async () => {
    mockVerifyToken.mockResolvedValue({ sub: 'user_known' })
    const { POST } = await import('@/app/api/mobile/session/route')
    const res = await request(jsonServer(POST))
      .post('/api/mobile/session')
      .set('Authorization', 'Bearer good.token')

    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({
      id: 'prof_1',
      role: 'student',
      status: 'active',
      email: 'student@example.com',
      full_name: 'Ada Student',
      country_code: 'NG',
    })
    expect(res.body.data.phone).toBeNull()
  })

  it('returns 404 when a valid Clerk user has no portal profile row', async () => {
    mockVerifyToken.mockResolvedValue({ sub: 'user_unknown' })
    const { POST } = await import('@/app/api/mobile/session/route')
    const res = await request(jsonServer(POST))
      .post('/api/mobile/session')
      .set('Authorization', 'Bearer good.token')

    expect(res.status).toBe(404)
    expect(res.body.error.message).toMatch(/profile not found/i)
  })
})
