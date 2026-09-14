import { describe, expect, it, jest } from '@jest/globals'
import {
  forwardXaiRequest,
  type XaiTransportDependencies,
} from '@/lib/xaiGrokServerTransport'

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

function sseResponse(events: unknown[]): Response {
  const payload = events
    .map((event) => `data: ${JSON.stringify(event)}\n\n`)
    .join('') + 'data: [DONE]\n\n'
  return new Response(payload, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  })
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

  it('forces streaming upstream and bridges blocking OAuth responses into JSON', async () => {
    const fetchImpl = jest.fn(async () => sseResponse([
      { type: 'response.output_text.delta', delta: 'o' },
      { type: 'response.output_text.delta', delta: 'k' },
      { type: 'response.completed', response: { status: 'completed' } },
    ])) as typeof fetch

    const response = await forwardXaiRequest({
      method: 'POST',
      path: 'responses',
      token: jwtWithSubject('user-stream'),
      body: JSON.stringify({ model: 'grok-4.6', input: 'ok' }),
    }, { fetchImpl })

    const [, init] = (fetchImpl as jest.Mock).mock.calls[0] as [RequestInfo | URL, RequestInit]
    const sentBody = JSON.parse(String(init.body)) as { stream?: boolean }
    expect(sentBody.stream).toBe(true)
    expect(new Headers(init.headers).get('accept')).toBe('text/event-stream')
    expect(response.headers.get('x-yousafe-xai-stream-bridge')).toBe('responses')
    expect(response.headers.get('content-type')).toContain('application/json')
    await expect(response.json()).resolves.toMatchObject({
      output_text: 'ok',
      status: 'completed',
      model: 'grok-4.6',
    })
  })

  it('bridges blocking OAuth chat completions into the existing JSON shape', async () => {
    const fetchImpl = jest.fn(async () => sseResponse([
      { choices: [{ delta: { content: 'o' }, finish_reason: null }] },
      { choices: [{ delta: { content: 'k' }, finish_reason: 'stop' }] },
    ])) as typeof fetch

    const response = await forwardXaiRequest({
      method: 'POST',
      path: 'chat/completions',
      token: jwtWithSubject('user-chat'),
      body: JSON.stringify({
        model: 'grok-4.6',
        messages: [{ role: 'user', content: 'ok' }],
      }),
    }, { fetchImpl })

    const [, init] = (fetchImpl as jest.Mock).mock.calls[0] as [RequestInfo | URL, RequestInit]
    expect((JSON.parse(String(init.body)) as { stream?: boolean }).stream).toBe(true)
    expect(response.headers.get('x-yousafe-xai-stream-bridge')).toBe('chat/completions')
    await expect(response.json()).resolves.toMatchObject({
      choices: [{
        message: { role: 'assistant', content: 'ok' },
        finish_reason: 'stop',
      }],
      model: 'grok-4.6',
    })
  })

  it('passes explicit OAuth streaming through without bridging it again', async () => {
    const fetchImpl = jest.fn(async () => sseResponse([
      { type: 'response.output_text.delta', delta: 'ok' },
    ])) as typeof fetch

    const response = await forwardXaiRequest({
      method: 'POST',
      path: 'responses',
      token: jwtWithSubject('user-live-stream'),
      body: JSON.stringify({ model: 'grok-4.6', input: 'ok', stream: true }),
    }, { fetchImpl })

    const [, init] = (fetchImpl as jest.Mock).mock.calls[0] as [RequestInfo | URL, RequestInit]
    expect((JSON.parse(String(init.body)) as { stream?: boolean }).stream).toBe(true)
    expect(response.headers.get('x-yousafe-xai-stream-bridge')).toBeNull()
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    expect(await response.text()).toContain('response.output_text.delta')
  })

  it('refreshes once and replays once after an OAuth 401', async () => {
    const refreshedToken = jwtWithSubject('new-user')
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(new Response('{"error":"Unauthorized"}', { status: 401 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 })) as unknown as typeof fetch
    const forceRefresh = jest.fn(async () => ({
      accessToken: refreshedToken,
      expiresAt: Date.now() + 3_600_000,
      authMode: 'supergrok' as const,
    })) as unknown as NonNullable<XaiTransportDependencies['forceRefresh']>

    await forwardXaiRequest({
      method: 'POST',
      path: 'responses',
      token: jwtWithSubject('old-user'),
      body: JSON.stringify({ model: 'grok-4.6', input: 'ok', stream: true }),
    }, { fetchImpl, forceRefresh })

    expect(forceRefresh).toHaveBeenCalledTimes(1)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    const replayHeaders = new Headers(
      ((fetchImpl as unknown as jest.Mock).mock.calls[1][1] as RequestInit).headers,
    )
    expect(replayHeaders.get('authorization')).toBe(`Bearer ${refreshedToken}`)
    expect(replayHeaders.get('x-userid')).toBe('new-user')
    expect(replayHeaders.get('x-grok-user-id')).toBe('new-user')
  })

  it('does not replay when OAuth refresh cannot produce a token', async () => {
    const fetchImpl = jest.fn(async () =>
      new Response('{"error":"Unauthorized"}', { status: 401 }),
    ) as typeof fetch
    const forceRefresh = jest.fn(async () => null) as unknown as NonNullable<XaiTransportDependencies['forceRefresh']>

    const response = await forwardXaiRequest({
      method: 'POST',
      path: 'responses',
      token: jwtWithSubject('old-user'),
      body: JSON.stringify({ model: 'grok-4.6', input: 'ok', stream: true }),
    }, { fetchImpl, forceRefresh })

    expect(response.status).toBe(401)
    expect(forceRefresh).toHaveBeenCalledTimes(1)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('never refreshes more than once when the replay is also 401', async () => {
    const fetchImpl = jest.fn(async () =>
      new Response('{"error":"Unauthorized"}', { status: 401 }),
    ) as typeof fetch
    const forceRefresh = jest.fn(async () => ({
      accessToken: jwtWithSubject('still-rejected'),
      expiresAt: Date.now() + 3_600_000,
      authMode: 'supergrok' as const,
    })) as unknown as NonNullable<XaiTransportDependencies['forceRefresh']>

    const response = await forwardXaiRequest({
      method: 'POST',
      path: 'responses',
      token: jwtWithSubject('old-user'),
      body: JSON.stringify({ model: 'grok-4.6', input: 'ok', stream: true }),
    }, { fetchImpl, forceRefresh })

    expect(response.status).toBe(401)
    expect(forceRefresh).toHaveBeenCalledTimes(1)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('does not force-refresh OAuth on a 403', async () => {
    const fetchImpl = jest.fn(async () =>
      new Response('{"error":"Forbidden"}', { status: 403 }),
    ) as typeof fetch
    const forceRefresh = jest.fn(async () => null) as unknown as NonNullable<XaiTransportDependencies['forceRefresh']>

    const response = await forwardXaiRequest({
      method: 'POST',
      path: 'responses',
      token: jwtWithSubject('policy-user'),
      body: JSON.stringify({ model: 'grok-4.6', input: 'ok', stream: true }),
    }, { fetchImpl, forceRefresh })

    expect(response.status).toBe(403)
    expect(forceRefresh).not.toHaveBeenCalled()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('does not force-refresh developer-key 401 responses', async () => {
    const fetchImpl = jest.fn(async () =>
      new Response('{"error":"Unauthorized"}', { status: 401 }),
    ) as typeof fetch
    const forceRefresh = jest.fn(async () => null) as unknown as NonNullable<XaiTransportDependencies['forceRefresh']>

    const response = await forwardXaiRequest({
      method: 'POST',
      path: 'responses',
      token: 'xai-developer-key',
      body: JSON.stringify({ model: 'grok-4.6', input: 'ok' }),
    }, { fetchImpl, forceRefresh })

    expect(response.status).toBe(401)
    expect(forceRefresh).not.toHaveBeenCalled()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('removes stale user-id headers when a refreshed token has no JWT subject', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(new Response('{"error":"Unauthorized"}', { status: 401 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 })) as unknown as typeof fetch
    const forceRefresh = jest.fn(async () => ({
      accessToken: 'opaque-refreshed-token',
      expiresAt: Date.now() + 3_600_000,
      authMode: 'supergrok' as const,
    })) as unknown as NonNullable<XaiTransportDependencies['forceRefresh']>

    await forwardXaiRequest({
      method: 'POST',
      path: 'responses',
      token: jwtWithSubject('old-user'),
      body: JSON.stringify({ model: 'grok-4.6', input: 'ok', stream: true }),
    }, { fetchImpl, forceRefresh })

    const replayHeaders = new Headers(
      ((fetchImpl as unknown as jest.Mock).mock.calls[1][1] as RequestInit).headers,
    )
    expect(replayHeaders.get('authorization')).toBe('Bearer opaque-refreshed-token')
    expect(replayHeaders.get('x-userid')).toBeNull()
    expect(replayHeaders.get('x-grok-user-id')).toBeNull()
  })
})
