/**
 * Content Studio SuperGrok must use the same public api.x.ai path as YQAA.
 * The Portal /api/internal/xai-grok self-shim is not allowed on the happy path.
 */

jest.mock('@/lib/aiKeyVault', () => {
  const settings: Record<string, string> = {
    xai_oauth_access_token: 'oauth-session-token',
    xai_oauth_refresh_token: 'oauth-refresh-token',
    xai_oauth_expires_at: String(Date.now() + 60 * 60_000),
  }
  return {
    buildVaultEnvOverrides: jest.fn(async () => ({
      XAI_API_KEY: 'xai-team-console-key',
      XAI_BASE_URL: 'https://portal.yousafeconsultancy.com/api/internal/xai-grok',
      XAI_MODEL: 'grok-3',
    })),
    getAiSettings: jest.fn(async () => ({ ...settings })),
    setAiSetting: jest.fn(async (key: string, value: string) => {
      settings[key] = value
    }),
    deleteAiSetting: jest.fn(async (key: string) => {
      delete settings[key]
    }),
    ensureDraftDefaultSettings: jest.fn(async () => undefined),
    ensureParasailDefaultSettings: jest.fn(async () => undefined),
  }
})

import { overlayGrokAuth } from '@/lib/xaiSuperGrokOAuth'
import { generateContentText } from '@/lib/contentAiProvider'
import { XAI_PUBLIC_API_BASE_URL } from '@/lib/xaiGrokTransport'

describe('Content Studio SuperGrok auth parity with YQAA', () => {
  const envKeys = ['XAI_API_KEY', 'XAI_MODEL', 'XAI_AUTH_MODE', 'XAI_BASE_URL', 'ENTRIM_API_KEY', 'CONTENT_AI_RETRY'] as const
  const saved: Record<string, string | undefined> = {}
  const originalFetch = global.fetch

  beforeAll(() => {
    for (const k of envKeys) saved[k] = process.env[k]
  })

  afterEach(() => {
    global.fetch = originalFetch
    for (const k of envKeys) {
      if (saved[k] == null) delete process.env[k]
      else process.env[k] = saved[k]
    }
  })

  it('overlayGrokAuth pins SuperGrok at api.x.ai, not the Portal CLI shim', () => {
    const next = overlayGrokAuth(
      {
        XAI_API_KEY: 'xai-team-console-key',
        XAI_BASE_URL: 'https://portal.yousafeconsultancy.com/api/internal/xai-grok',
        XAI_MODEL: 'grok-3',
      },
      { accessToken: 'oauth-session-token', expiresAt: Date.now() + 60_000, authMode: 'supergrok' },
    )
    expect(next.XAI_API_KEY).toBe('oauth-session-token')
    expect(next.XAI_AUTH_MODE).toBe('supergrok')
    expect(next.XAI_BASE_URL).toBe(XAI_PUBLIC_API_BASE_URL)
    expect(next.XAI_MODEL).toBe('grok-4.6')
  })

  it('generateContentText with a live SuperGrok session hits api.x.ai/v1/responses', async () => {
    process.env.CONTENT_AI_RETRY = '1'
    delete process.env.ENTRIM_API_KEY
    delete process.env.XAI_API_KEY

    const urls: string[] = []
    const headers: string[] = []
    global.fetch = jest.fn(async (input, init) => {
      urls.push(String(input))
      const h = new Headers(init?.headers)
      headers.push(h.get('authorization') || '')
      expect(h.get('x-grok-conv-id')).toBe('yousafe-content-studio')
      return new Response(JSON.stringify({
        output_text: 'YQAA-PARITY-OK',
        status: 'completed',
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch

    const result = await generateContentText({
      aiProvider: 'grok',
      exclusive: true,
      system: 'Reply OK.',
      prompt: 'ok',
    })

    expect(result.provider).toBe('grok')
    expect(result.text).toBe('YQAA-PARITY-OK')
    expect(urls.length).toBe(1)
    expect(urls[0]).toBe('https://api.x.ai/v1/responses')
    expect(urls.some((u) => u.includes('/api/internal/xai-grok'))).toBe(false)
    expect(headers[0]).toMatch(/Bearer oauth-session-token/)
  })

  it('does not send a SuperGrok 402 usage-exhausted call to the CLI proxy', async () => {
    process.env.CONTENT_AI_RETRY = '1'
    delete process.env.ENTRIM_API_KEY

    const urls: string[] = []
    global.fetch = jest.fn(async (input) => {
      urls.push(String(input))
      return new Response(
        JSON.stringify({ message: 'API error (status 402 Payment Required): Grok Build usage balance exhausted' }),
        { status: 402, headers: { 'content-type': 'application/json' } },
      )
    }) as typeof fetch

    await expect(generateContentText({
      aiProvider: 'grok',
      exclusive: true,
      system: 'Reply OK.',
      prompt: 'ok',
    })).rejects.toThrow(/Grok Build usage balance exhausted/i)

    expect(urls.every((u) => u.startsWith('https://api.x.ai/v1/'))).toBe(true)
    expect(urls.some((u) => u.includes('cli-chat-proxy.grok.com'))).toBe(false)
  })
})
