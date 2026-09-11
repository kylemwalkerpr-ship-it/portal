import { NextRequest } from 'next/server'
import { POST } from '@/app/api/internal/xai-grok/[...path]/route'

describe('xAI Grok transport router streaming bridge', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    jest.restoreAllMocks()
  })

  it('promotes a non-stream SuperGrok Responses request to SSE and returns normal JSON', async () => {
    const fetchMock = jest.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const sent = JSON.parse(String(init?.body || '{}')) as { stream?: boolean }
      expect(sent.stream).toBe(true)
      const headers = new Headers(init?.headers)
      expect(headers.get('accept')).toBe('text/event-stream')
      expect(headers.get('x-xai-token-auth')).toBe('xai-grok-cli')
      expect(headers.get('x-grok-model-override')).toBe('grok-4.6')

      const sse = [
        'data: {"type":"response.output_text.delta","delta":"O"}',
        '',
        'data: {"type":"response.output_text.delta","delta":"K"}',
        '',
        'data: {"type":"response.completed","response":{"status":"completed"}}',
        '',
        'data: [DONE]',
        '',
      ].join('\n')
      return new Response(sse, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      })
    })
    global.fetch = fetchMock as typeof fetch

    const request = new NextRequest(
      'https://portal.yousafeconsultancy.com/api/internal/xai-grok/responses',
      {
        method: 'POST',
        headers: {
          authorization: 'Bearer oauth-session-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'grok-4.6',
          input: [{ role: 'user', content: 'Reply OK' }],
        }),
      },
    )

    const response = await POST(request, {
      params: Promise.resolve({ path: ['responses'] }),
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('x-yousafe-xai-stream-bridge')).toBe('responses')
    await expect(response.json()).resolves.toMatchObject({
      output_text: 'OK',
      status: 'completed',
      model: 'grok-4.6',
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('https://cli-chat-proxy.grok.com/v1/responses')
  })

  it('does not rewrite developer API-key requests', async () => {
    const fetchMock = jest.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const sent = JSON.parse(String(init?.body || '{}')) as { stream?: boolean }
      expect(sent.stream).toBeUndefined()
      const headers = new Headers(init?.headers)
      expect(headers.get('x-xai-token-auth')).toBeNull()
      return Response.json({ output_text: 'OK', status: 'completed', model: 'grok-4.6' })
    })
    global.fetch = fetchMock as typeof fetch

    const request = new NextRequest(
      'https://portal.yousafeconsultancy.com/api/internal/xai-grok/responses',
      {
        method: 'POST',
        headers: {
          authorization: 'Bearer xai-developer-key-placeholder',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ model: 'grok-4.6', input: 'Reply OK' }),
      },
    )

    const response = await POST(request, {
      params: Promise.resolve({ path: ['responses'] }),
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('x-yousafe-xai-stream-bridge')).toBeNull()
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('https://api.x.ai/v1/responses')
  })
})
