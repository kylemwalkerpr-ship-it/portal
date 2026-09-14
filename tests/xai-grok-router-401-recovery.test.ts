jest.mock('@/lib/aiKeyVault', () => ({
  getAiSettings: jest.fn(async () => ({
    xai_oauth_access_token: 'server-rejected-access-token',
    xai_oauth_refresh_token: 'still-valid-refresh-token',
    xai_oauth_expires_at: String(Date.now() + 60 * 60 * 1000),
  })),
  setAiSetting: jest.fn(async () => undefined),
  deleteAiSetting: jest.fn(async () => undefined),
}))

import { NextRequest } from 'next/server'
import { POST } from '@/app/api/internal/xai-grok/[...path]/route'

describe('xAI Grok router 401 recovery', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    jest.clearAllMocks()
  })

  function requestForResponses() {
    return new NextRequest('https://portal.yousafeconsultancy.com/api/internal/xai-grok/responses', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer server-rejected-access-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'grok-4.6',
        input: [{ role: 'user', content: 'ok' }],
        max_output_tokens: 8,
      }),
    })
  }

  it('refreshes a rejected SuperGrok bearer once and replays the request with the replacement token', async () => {
    let proxyCalls = 0
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url

      if (url === 'https://auth.x.ai/oauth2/token') {
        return new Response(JSON.stringify({
          access_token: 'replacement-access-token',
          refresh_token: 'replacement-refresh-token',
          expires_in: 3600,
          token_type: 'Bearer',
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }

      if (url === 'https://cli-chat-proxy.grok.com/v1/responses') {
        proxyCalls += 1
        if (proxyCalls === 1) {
          return new Response(JSON.stringify({ error: 'Unauthorized', signInRequired: true }), {
            status: 401,
            headers: { 'content-type': 'application/json' },
          })
        }

        const headers = new Headers(init?.headers)
        expect(headers.get('authorization')).toBe('Bearer replacement-access-token')
        return new Response(
          'data: {"type":"response.output_text.delta","delta":"ok"}\n\n' +
          'data: {"type":"response.completed","response":{"status":"completed","output_text":"ok"}}\n\n' +
          'data: [DONE]\n\n',
          {
            status: 200,
            headers: { 'content-type': 'text/event-stream' },
          },
        )
      }

      throw new Error(`Unexpected fetch: ${url}`)
    }) as typeof fetch

    const response = await POST(requestForResponses(), {
      params: Promise.resolve({ path: ['responses'] }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ output_text: 'ok', status: 'completed' })
    expect(proxyCalls).toBe(2)
    expect(global.fetch).toHaveBeenCalledTimes(3)
  })

  it('does not refresh or replay a 403 permission response', async () => {
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url
      expect(url).toBe('https://cli-chat-proxy.grok.com/v1/responses')
      return new Response(JSON.stringify({
        code: 'permission_denied',
        error: 'usage or permission denied',
      }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      })
    }) as typeof fetch

    const response = await POST(requestForResponses(), {
      params: Promise.resolve({ path: ['responses'] }),
    })

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({ code: 'permission_denied' })
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })
})
