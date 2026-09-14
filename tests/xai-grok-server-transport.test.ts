import { describe, expect, it, jest } from '@jest/globals'
import { forwardXaiRequest } from '@/lib/xaiGrokServerTransport'

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value))
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function jwtWithSubject(sub: string): string {
  return `${base64UrlJson({ alg: 'none', typ: 'JWT' })}.${base64UrlJson({ sub })}.signature`
}

describe('xAI shared server transport', () => {
  it('routes SuperGrok OAuth directly to the CLI proxy and adds subscription headers', async () => {
    const fetchImpl = jest.fn(async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'x-request-id': 'req-1',
        },
      }),
    ) as typeof fetch

    const token = jwtWithSubject('user-123')
    const response = await forwardXaiRequest({
      method: 'POST',
      path: 'responses',
      token,
      headers: { accept: 'application/json' },
      body: JSON.stringify({ model: 'grok-4.6', input: 'ok', stream: true }),
    }, { fetchImpl })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = (fetchImpl as jest.Mock).mock.calls[0] as [RequestInfo | URL, RequestInit]
    expect(String(url)).toBe('https://cli-chat-proxy.grok.com/v1/responses')
    const headers = new Headers(init.headers)
    expect(headers.get('authorization')).toBe(`Bearer ${token}`)
    expect(headers.get('x-xai-token-auth')).toBe('xai-grok-cli')
    expect(headers.get('x-grok-client-version')).toBeTruthy()
    expect(headers.get('x-userid')).toBe('user-123')
    expect(headers.get('x-grok-user-id')).toBe('user-123')
    expect(response.headers.get('x-yousafe-xai-transport')).toBe('supergrok-oauth')
    expect(response.headers.get('x-request-id')).toBe('req-1')
  })

  it('routes developer keys to api.x.ai without subscription-only headers', async () => {
    const fetchImpl = jest.fn(async () =>
      new Response('{}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ) as typeof fetch

    const response = await forwardXaiRequest({
      method: 'GET',
      path: 'models',
      token: 'xai-developer-key',
    }, { fetchImpl })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = (fetchImpl as jest.Mock).mock.calls[0] as [RequestInfo | URL, RequestInit]
    expect(String(url)).toBe('https://api.x.ai/v1/models')
    const headers = new Headers(init.headers)
    expect(headers.get('authorization')).toBe('Bearer xai-developer-key')
    expect(headers.get('x-xai-token-auth')).toBeNull()
    expect(headers.get('x-grok-client-version')).toBeNull()
    expect(headers.get('x-userid')).toBeNull()
    expect(headers.get('x-grok-user-id')).toBeNull()
    expect(response.headers.get('x-yousafe-xai-transport')).toBe('developer-api')
  })

  it('preserves caller Grok correlation headers for OAuth traffic', async () => {
    const fetchImpl = jest.fn(async () => new Response('{}', { status: 200 })) as typeof fetch

    await forwardXaiRequest({
      method: 'POST',
      path: 'responses',
      token: jwtWithSubject('user-456'),
      headers: {
        'x-grok-conv-id': 'conv-existing',
        'x-grok-req-id': 'req-existing',
        'x-grok-session-id': 'session-existing',
        'x-grok-agent-id': 'agent-existing',
      },
      body: JSON.stringify({ model: 'grok-4.6', input: 'ok', stream: true }),
    }, { fetchImpl })

    const [, init] = (fetchImpl as jest.Mock).mock.calls[0] as [RequestInfo | URL, RequestInit]
    const headers = new Headers(init.headers)
    expect(headers.get('x-grok-conv-id')).toBe('conv-existing')
    expect(headers.get('x-grok-req-id')).toBe('req-existing')
    expect(headers.get('x-grok-session-id')).toBe('session-existing')
    expect(headers.get('x-grok-agent-id')).toBe('agent-existing')
  })
})
