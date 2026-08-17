/**
 * SuperGrok OAuth helpers — no live xAI calls.
 */

jest.mock('@/lib/aiKeyVault', () => {
  const settings: Record<string, string> = ((globalThis as { __xaiOAuthSettings?: Record<string, string> }).__xaiOAuthSettings ||= {})
  return {
    getAiSettings: jest.fn(async () => ({ ...settings })),
    setAiSetting: jest.fn(async (key: string, value: string) => {
      settings[key] = value
    }),
    deleteAiSetting: jest.fn(async (key: string) => {
      delete settings[key]
    }),
  }
})

const settings = ((globalThis as { __xaiOAuthSettings?: Record<string, string> }).__xaiOAuthSettings ||= {})

import {
  isAccessTokenFresh,
  parsePendingSetting,
  startSuperGrokDeviceLogin,
  pollSuperGrokDeviceLogin,
  ensureSuperGrokAccessToken,
  XAI_OAUTH_CLIENT_ID_DEFAULT,
} from '@/lib/xaiSuperGrokOAuth'

describe('SuperGrok OAuth helpers', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    for (const key of Object.keys(settings)) delete settings[key]
    global.fetch = originalFetch
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('treats tokens inside the skew window as stale', () => {
    expect(isAccessTokenFresh(Date.now() + 120_000)).toBe(true)
    expect(isAccessTokenFresh(Date.now() + 10_000)).toBe(false)
    expect(isAccessTokenFresh(0)).toBe(false)
  })

  it('parses a pending device-code payload and rejects junk', () => {
    const raw = JSON.stringify({
      device_code: 'dev-1',
      user_code: 'ABCD-EFGH',
      verification_uri: 'https://auth.x.ai/device',
      expires_at: Date.now() + 60_000,
      interval: 5,
    })
    expect(parsePendingSetting(raw)?.user_code).toBe('ABCD-EFGH')
    expect(parsePendingSetting('not-json')).toBeNull()
    expect(parsePendingSetting('{}')).toBeNull()
  })

  it('starts a device login and stores the pending challenge', async () => {
    global.fetch = jest.fn(async () =>
      new Response(JSON.stringify({
        device_code: 'device-xyz',
        user_code: 'QWER-TYUI',
        verification_uri: 'https://auth.x.ai/device',
        verification_uri_complete: 'https://auth.x.ai/device?user_code=QWER-TYUI',
        expires_in: 900,
        interval: 5,
      }), { status: 200, headers: { 'content-type': 'application/json' } }),
    ) as typeof fetch

    const started = await startSuperGrokDeviceLogin('tester')
    expect(started.userCode).toBe('QWER-TYUI')
    expect(started.verificationUri).toBe('https://auth.x.ai/device')
    expect(parsePendingSetting(settings.xai_oauth_pending)?.device_code).toBe('device-xyz')

    const body = String((global.fetch as jest.Mock).mock.calls[0][1].body)
    expect(body).toContain(`client_id=${XAI_OAUTH_CLIENT_ID_DEFAULT}`)
    expect(String((global.fetch as jest.Mock).mock.calls[0][0])).toContain('/oauth2/device/code')
  })

  it('poll keeps waiting on authorization_pending and completes on tokens', async () => {
    settings.xai_oauth_pending = JSON.stringify({
      device_code: 'device-xyz',
      user_code: 'QWER-TYUI',
      verification_uri: 'https://auth.x.ai/device',
      expires_at: Date.now() + 120_000,
      interval: 5,
    })

    global.fetch = jest.fn(async () =>
      new Response(JSON.stringify({ error: 'authorization_pending' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      }),
    ) as typeof fetch
    await expect(pollSuperGrokDeviceLogin()).resolves.toEqual({ connected: false, pending: true })

    global.fetch = jest.fn(async () =>
      new Response(JSON.stringify({
        access_token: 'access-123',
        refresh_token: 'refresh-123',
        expires_in: 3600,
        token_type: 'Bearer',
      }), { status: 200, headers: { 'content-type': 'application/json' } }),
    ) as typeof fetch
    await expect(pollSuperGrokDeviceLogin()).resolves.toEqual({ connected: true, pending: false })
    expect(settings.xai_oauth_access_token).toBe('access-123')
    expect(settings.xai_oauth_refresh_token).toBe('refresh-123')
    expect(settings.xai_oauth_pending).toBeUndefined()
  })

  it('ensureSuperGrokAccessToken returns a still-fresh stored token without refresh', async () => {
    settings.xai_oauth_access_token = 'live-access'
    settings.xai_oauth_refresh_token = 'live-refresh'
    settings.xai_oauth_expires_at = String(Date.now() + 10 * 60_000)

    global.fetch = jest.fn() as typeof fetch
    const token = await ensureSuperGrokAccessToken()
    expect(token).toEqual({
      accessToken: 'live-access',
      expiresAt: Number(settings.xai_oauth_expires_at),
      authMode: 'supergrok',
    })
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
