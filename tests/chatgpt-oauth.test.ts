/**
 * ChatGPT Plus OAuth — device flow, token refresh, vault injection, and the
 * OpenAI end-to-end pipeline lane presence. No live OpenAI calls.
 */

jest.mock('@/lib/aiKeyVault', () => {
  const settings: Record<string, string> = ((globalThis as { __chatgptOAuthSettings?: Record<string, string> }).__chatgptOAuthSettings ||= {})
  return {
    getAiSettings: jest.fn(async () => ({ ...settings })),
    setAiSetting: jest.fn(async (key: string, value: string) => {
      settings[key] = value
    }),
    deleteAiSetting: jest.fn(async (key: string) => {
      delete settings[key]
    }),
    buildVaultEnvOverrides: jest.fn(async () => ({})),
    AI_PROVIDERS: jest.requireActual('@/lib/aiKeyVault').AI_PROVIDERS,
    providerDef: jest.requireActual('@/lib/aiKeyVault').providerDef,
  }
})

const settings = ((globalThis as { __chatgptOAuthSettings?: Record<string, string> }).__chatgptOAuthSettings ||= {})

import {
  CHATGPT_DEFAULT_MODEL,
  CHATGPT_OAUTH_CLIENT_ID_DEFAULT,
  CHATGPT_PLUS_MODELS,
  ensureChatgptAccessToken,
  getChatgptStatus,
  isChatgptAccessTokenFresh,
  parseChatgptPendingSetting,
  pollChatgptDeviceLogin,
  startChatgptDeviceLogin,
} from '@/lib/chatgptOAuth'
import {
  isOpenaiConfigured,
  listConfiguredContentProviders,
  resolveAiProviderPin,
  setVaultOverlay,
} from '@/lib/contentAiProvider'

describe('ChatGPT Plus OAuth helpers', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    for (const key of Object.keys(settings)) delete settings[key]
    global.fetch = originalFetch
    setVaultOverlay(null)
    for (const envKey of ['OPENAI_API_KEY', 'OPENAI_MODEL', 'OPENAI_AUTH_MODE', 'CHATGPT_OAUTH_CLIENT_ID', 'CHATGPT_OAUTH_TOKEN_URL'] as const) {
      delete process.env[envKey]
    }
  })

  afterEach(() => {
    global.fetch = originalFetch
    setVaultOverlay(null)
  })

  it('treats tokens inside the skew window as stale', () => {
    expect(isChatgptAccessTokenFresh(Date.now() + 120_000)).toBe(true)
    expect(isChatgptAccessTokenFresh(Date.now() + 10_000)).toBe(false)
    expect(isChatgptAccessTokenFresh(0)).toBe(false)
  })

  it('parses a pending device-code payload and rejects junk', () => {
    const raw = JSON.stringify({
      device_code: 'dev-1',
      user_code: 'ABCD-EFGH',
      verification_uri: 'https://auth.openai.com/verify',
      expires_at: Date.now() + 60_000,
      interval: 5,
    })
    expect(parseChatgptPendingSetting(raw)?.user_code).toBe('ABCD-EFGH')
    expect(parseChatgptPendingSetting('not-json')).toBeNull()
    expect(parseChatgptPendingSetting('{}')).toBeNull()
  })

  it('starts a device login and stores the pending challenge', async () => {
    global.fetch = jest.fn(async () =>
      new Response(JSON.stringify({
        device_code: 'device-xyz',
        user_code: 'QWER-TYUI',
        verification_uri: 'https://auth.openai.com/verify',
        verification_uri_complete: 'https://auth.openai.com/verify?user_code=QWER-TYUI',
        expires_in: 900,
        interval: 5,
      }), { status: 200, headers: { 'content-type': 'application/json' } }),
    ) as typeof fetch

    const started = await startChatgptDeviceLogin('tester')
    expect(started.userCode).toBe('QWER-TYUI')
    expect(started.verificationUri).toContain('auth.openai.com')
    expect(parseChatgptPendingSetting(settings.chatgpt_oauth_pending)?.device_code).toBe('device-xyz')

    const body = String((global.fetch as jest.Mock).mock.calls[0][1].body)
    expect(body).toContain(`client_id=${CHATGPT_OAUTH_CLIENT_ID_DEFAULT}`)
    expect(String((global.fetch as jest.Mock).mock.calls[0][0])).toContain('/oauth/device/code')
  })

  it('poll keeps waiting on authorization_pending and completes on tokens', async () => {
    settings.chatgpt_oauth_pending = JSON.stringify({
      device_code: 'device-xyz',
      user_code: 'QWER-TYUI',
      verification_uri: 'https://auth.openai.com/verify',
      expires_at: Date.now() + 120_000,
      interval: 5,
    })

    global.fetch = jest.fn(async () =>
      new Response(JSON.stringify({ error: 'authorization_pending' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      }),
    ) as typeof fetch
    await expect(pollChatgptDeviceLogin()).resolves.toEqual({ connected: false, pending: true })

    global.fetch = jest.fn(async () =>
      new Response(JSON.stringify({
        access_token: 'chatgpt-access-123',
        refresh_token: 'chatgpt-refresh-123',
        expires_in: 3600,
        token_type: 'Bearer',
      }), { status: 200, headers: { 'content-type': 'application/json' } }),
    ) as typeof fetch
    await expect(pollChatgptDeviceLogin()).resolves.toEqual({ connected: true, pending: false })
    expect(settings.chatgpt_oauth_access_token).toBe('chatgpt-access-123')
    expect(settings.chatgpt_oauth_refresh_token).toBe('chatgpt-refresh-123')
    expect(settings.chatgpt_oauth_pending).toBeUndefined()
  })

  it('ensureChatgptAccessToken returns a still-fresh stored token without refresh', async () => {
    settings.chatgpt_oauth_access_token = 'live-access'
    settings.chatgpt_oauth_refresh_token = 'live-refresh'
    settings.chatgpt_oauth_expires_at = String(Date.now() + 10 * 60_000)

    global.fetch = jest.fn() as typeof fetch
    const token = await ensureChatgptAccessToken()
    expect(token).toEqual({
      accessToken: 'live-access',
      expiresAt: Number(settings.chatgpt_oauth_expires_at),
      authMode: 'chatgpt-plus',
    })
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('status exposes the Plus model lineup and defaults to GPT-5.6 Sol', async () => {
    const status = await getChatgptStatus()
    expect(status.connected).toBe(false)
    expect(status.model).toBe(CHATGPT_DEFAULT_MODEL)
    expect(status.models).toEqual([...CHATGPT_PLUS_MODELS])
    expect(status.clientConfigured).toBe(true)
  })
})

describe('ChatGPT Plus · OpenAI chain wiring', () => {
  beforeEach(() => {
    setVaultOverlay(null)
    for (const envKey of ['OPENAI_API_KEY', 'OPENAI_MODEL', 'OPENAI_AUTH_MODE'] as const) {
      delete process.env[envKey]
    }
  })

  afterEach(() => {
    setVaultOverlay(null)
  })

  it('resolveAiProviderPin maps chatgpt / chatgpt-plus / gpt model aliases to OpenAI + model', () => {
    expect(resolveAiProviderPin('chatgpt')).toEqual({ explicit: 'openai', prefer: 'openai', model: 'gpt-5.6-sol' })
    expect(resolveAiProviderPin('chatgpt-plus')).toEqual({ explicit: 'openai', prefer: 'openai', model: 'gpt-5.6-sol' })
    expect(resolveAiProviderPin('gpt-5.6')).toEqual({ explicit: 'openai', prefer: 'openai', model: 'gpt-5.6-sol' })
    expect(resolveAiProviderPin('gpt-5.6-luna')).toEqual({ explicit: 'openai', prefer: 'openai', model: 'gpt-5.6-luna' })
  })

  it('ChatGPT Plus OAuth overlay marks OpenAI as configured and visible in the provider list', () => {
    process.env.OPENAI_AUTH_MODE = 'chatgpt-plus'
    process.env.OPENAI_API_KEY = 'chatgpt-oauth-token'
    expect(isOpenaiConfigured()).toBe(true)
    const openai = listConfiguredContentProviders().find((p) => p.id === 'openai')
    expect(openai?.configured).toBe(true)
    // A Parasail psk- key pasted into OPENAI_API_KEY is still rejected.
    process.env.OPENAI_API_KEY = 'psk-not-an-openai-key'
    expect(isOpenaiConfigured()).toBe(false)
  })

  it('vault OPENAI key wins: isOpenaiConfigured stays true without the OAuth mode flag', () => {
    process.env.OPENAI_API_KEY = 'sk-vault-key'
    expect(isOpenaiConfigured()).toBe(true)
  })
})