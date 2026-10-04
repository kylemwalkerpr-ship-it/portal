import fs from 'node:fs'
import path from 'node:path'
import {
  GENERIC_ERROR,
  TOO_MANY_MESSAGE,
  looksInternal,
  matchRateRule,
  rateLimitRequest,
  redactErrorResponse,
  redactValue,
} from '@/lib/edgeGuard'

const req = (url: string, init: RequestInit = {}) => new Request(url, init)

describe('edge guard: rate limiting (Phase 5)', () => {
  test('only mutating requests to sensitive endpoints are limited', () => {
    expect(matchRateRule('POST', '/api/inquiries')?.binding).toBe('RL_FORMS')
    expect(matchRateRule('POST', '/api/provider/apply/')?.binding).toBe('RL_FORMS')
    expect(matchRateRule('POST', '/api/consultant/intake/submit')?.binding).toBe('RL_FORMS')
    expect(matchRateRule('POST', '/api/onboarding/role')?.binding).toBe('RL_FORMS')
    expect(matchRateRule('POST', '/api/chat')?.binding).toBe('RL_AI')
    expect(matchRateRule('POST', '/api/translate/batch')?.binding).toBe('RL_TRANSLATE')
    expect(matchRateRule('POST', '/api/messages/conversations/abc/attach')?.binding).toBe('RL_MESSAGES')
    expect(matchRateRule('POST', '/api/client/inquiries/abc/messages')?.binding).toBe('RL_MESSAGES')
    expect(matchRateRule('POST', '/api/attorney/chats/abc/messages')?.binding).toBe('RL_MESSAGES')
    expect(matchRateRule('GET', '/api/inquiries')).toBeNull()
    expect(matchRateRule('POST', '/api/webhooks/clerk')).toBeNull()
    expect(matchRateRule('POST', '/api/payments/charge')).toBeNull()
    expect(matchRateRule('POST', '/gigs/x')).toBeNull()
  })

  test('returns 429 with Retry-After when the binding denies, keyed by bucket and IP', async () => {
    const calls: string[] = []
    const env = { RL_FORMS: { limit: async ({ key }: { key: string }) => (calls.push(key), { success: false }) } }
    const res = await rateLimitRequest(
      req('https://portal.yousafeconsultancy.com/api/inquiries', {
        method: 'POST',
        headers: { 'cf-connecting-ip': '203.0.113.9', origin: 'https://legal.yousafeconsultancy.com' },
      }),
      env,
    )
    expect(res?.status).toBe(429)
    expect(res?.headers.get('retry-after')).toBe('60')
    expect(res?.headers.get('access-control-allow-origin')).toBe('https://legal.yousafeconsultancy.com')
    expect((await res!.json()).error).toBe(TOO_MANY_MESSAGE)
    expect(calls).toEqual(['forms:203.0.113.9'])
  })

  test('foreign origins get no CORS grant on the 429', async () => {
    const env = { RL_FORMS: { limit: async () => ({ success: false }) } }
    const res = await rateLimitRequest(
      req('https://portal.yousafeconsultancy.com/api/inquiries', { method: 'POST', headers: { origin: 'https://evil.example' } }),
      env,
    )
    expect(res?.headers.get('access-control-allow-origin')).toBeNull()
  })

  test('fails open when the binding is missing, allows, or throws', async () => {
    const r = () => req('https://market.yousafeconsultancy.com/api/chat', { method: 'POST' })
    expect(await rateLimitRequest(r(), {})).toBeNull()
    expect(await rateLimitRequest(r(), { RL_AI: { limit: async () => ({ success: true }) } })).toBeNull()
    expect(
      await rateLimitRequest(r(), {
        RL_AI: {
          limit: async () => {
            throw new Error('boom')
          },
        },
      }),
    ).toBeNull()
  })
})

describe('edge guard: public error redaction (Phase 6)', () => {
  test.each([
    'invalid input syntax for type uuid: "not-a-uuid"',
    'duplicate key value violates unique constraint "gigs_slug_key"',
    'relation "public.foo" does not exist',
    'column profiles.country does not exist',
    "Could not find the 'x' column of 'gigs' in the schema cache",
    'JSON object requested, multiple (or no) rows returned',
    "TypeError: Cannot read properties of undefined (reading 'id')",
    'Error: boom\n    at handler (/var/task/.open-next/server-functions/default/index.mjs:12:5)',
    'new row violates row-level security policy for table "orders"',
    'fetch failed',
  ])('flags internal diagnostic: %s', (msg) => {
    expect(looksInternal(msg)).toBe(true)
  })

  test.each(['Gig not found.', 'Unauthorized', 'Valid email required.', 'Too many requests. Please wait a minute and try again.', 'Could not update gig.'])(
    'keeps user-facing message: %s',
    (msg) => {
      expect(looksInternal(msg)).toBe(false)
    },
  )

  test('redacts nested strings, drops stack/hint and Postgres codes, keeps shape', () => {
    const [out, changed] = redactValue({
      data: null,
      error: { message: 'invalid input syntax for type uuid: "x"', code: '22P02', hint: 'h', stack: 's' },
      meta: {},
    })
    expect(changed).toBe(true)
    expect(out).toEqual({ data: null, error: { message: GENERIC_ERROR }, meta: {} })
  })

  test('rewrites an /api error response body and leaves safe ones byte-identical', async () => {
    const leaky = new Response(JSON.stringify({ error: 'relation "x" does not exist', code: '42P01' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })
    const fixed = await redactErrorResponse(req('https://portal.yousafeconsultancy.com/api/gigs/x'), leaky)
    expect(fixed.status).toBe(500)
    expect(await fixed.json()).toEqual({ error: GENERIC_ERROR })

    const safeBody = JSON.stringify({ data: null, error: { message: 'Gig not found.' }, meta: {} })
    const safe = await redactErrorResponse(
      req('https://portal.yousafeconsultancy.com/api/gigs/x'),
      new Response(safeBody, { status: 404, headers: { 'content-type': 'application/json' } }),
    )
    expect(await safe.text()).toBe(safeBody)
  })

  test('never touches successes, non-API paths, HTML or streams', async () => {
    const ok = new Response('{"error":"fetch failed"}', { status: 200, headers: { 'content-type': 'application/json' } })
    expect(await redactErrorResponse(req('https://x.yousafeconsultancy.com/api/a'), ok)).toBe(ok)
    const page = new Response('TypeError', { status: 500, headers: { 'content-type': 'text/html' } })
    expect(await redactErrorResponse(req('https://x.yousafeconsultancy.com/api/a'), page)).toBe(page)
    const nonApi = new Response('TypeError', { status: 500, headers: { 'content-type': 'text/plain' } })
    expect(await redactErrorResponse(req('https://x.yousafeconsultancy.com/dashboard'), nonApi)).toBe(nonApi)
  })

  test('plain-text internal errors are replaced', async () => {
    const res = await redactErrorResponse(
      req('https://x.yousafeconsultancy.com/api/a'),
      new Response('TypeError: x is not a function', { status: 500, headers: { 'content-type': 'text/plain' } }),
    )
    expect(await res.text()).toBe(GENERIC_ERROR)
  })
})

describe('edge guard wiring', () => {
  const root = path.join(__dirname, '..')
  test('wrangler main is the guarded entry and declares the four rate limit bindings', () => {
    const toml = fs.readFileSync(path.join(root, 'wrangler.toml'), 'utf8')
    expect(toml).toMatch(/^main = "edge-worker\.mjs"$/m)
    for (const name of ['RL_FORMS', 'RL_MESSAGES', 'RL_AI', 'RL_TRANSLATE']) {
      expect(toml).toContain(`name = "${name}"`)
    }
    expect(toml).not.toMatch(/^\[limits\]/m) // Free plan rejects [limits]
  })

  test('entry wraps the OpenNext handler and re-exports its Durable Object classes', () => {
    const entry = fs.readFileSync(path.join(root, 'edge-worker.mjs'), 'utf8')
    expect(entry).toContain("export * from './.open-next/worker.js'")
    expect(entry).toContain('rateLimitRequest(request, env)')
    expect(entry).toContain('redactErrorResponse(request, response)')
  })
})
