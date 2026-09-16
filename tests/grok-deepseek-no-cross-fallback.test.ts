/**
 * Grok <-> DeepSeek no-cross-fallback — FROZEN CONTRACT (Plan Task 1; design
 * §3.3 invariant 6, §3.5, §13 decision 10).
 *
 * A job owned by one commissioned pin is never retried, redirected,
 * substituted, or proxied onto the other provider under any failure class:
 *
 *   - a DeepSeek-owned job (`deepseek-v41-flash`) fetches `api.deepseek.com`
 *     ONLY — never `api.x.ai` and never the retained Grok subscription proxy
 *     (`cli-chat-proxy.grok.com/v1`), across auth/quota/rate_limit/timeout/empty
 *     failures;
 *   - a Grok-owned job fetches xAI/Grok endpoints only — never
 *     `api.deepseek.com`, even with `DEEPSEEK_API_KEY` present;
 *   - the retained Grok CLI-proxy fallback stays same-provider/same-credential,
 *     selects no other model/provider, and never appears on a DeepSeek path.
 *
 * RED until the P2 commission flip registers the DeepSeek adapter (Tasks 3-7).
 */
jest.mock('@/lib/aiKeyVault', () => ({
  buildVaultEnvOverrides: jest.fn(async () => ({})),
  getAiSettings: jest.fn(async () => ({})),
  setAiSetting: jest.fn(async () => undefined),
  deleteAiSetting: jest.fn(async () => undefined),
  ensureDraftDefaultSettings: jest.fn(async () => undefined),
  ensureParasailDefaultSettings: jest.fn(async () => undefined),
}))

import { generateContentText, setVaultOverlay } from '@/lib/contentAiProvider'

const GROK_PIN = 'grok'
const DEEPSEEK_PIN = 'deepseek-v41-flash'
const GROK_HOSTS = ['api.x.ai', 'cli-chat-proxy.grok.com']

const ENV_KEYS = [
  'XAI_API_KEY',
  'XAI_BASE_URL',
  'XAI_AUTH_MODE',
  'DEEPSEEK_API_KEY',
  'DEEPSEEK_BASE_URL',
  'CONTENT_AI_RETRY',
  'CONTENT_AI_ALL_PROVIDERS',
] as const
const savedEnv: Record<string, string | undefined> = {}
const originalFetch = global.fetch

beforeAll(() => {
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key]
})

beforeEach(() => {
  for (const key of ENV_KEYS) delete process.env[key]
  process.env.CONTENT_AI_RETRY = '1'
  process.env.XAI_API_KEY = 'test-xai-key'
  process.env.DEEPSEEK_API_KEY = 'test-deepseek-key'
  setVaultOverlay(null)
})

afterEach(() => {
  global.fetch = originalFetch
  setVaultOverlay(null)
  for (const key of ENV_KEYS) {
    if (savedEnv[key] == null) delete process.env[key]
    else process.env[key] = savedEnv[key]
  }
})

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } })

const FAILURES: Array<{ name: string; make: () => Response | never }> = [
  { name: 'auth', make: () => json({ error: { message: 'invalid api key' } }, 401) },
  { name: 'quota', make: () => json({ error: { message: 'you exceeded your current quota' } }, 402) },
  { name: 'rate_limit', make: () => json({ error: { message: 'rate limit reached for requests' } }, 429) },
  {
    name: 'timeout',
    make: () => {
      throw Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })
    },
  },
  { name: 'empty', make: () => json({ choices: [{ message: { content: '' }, finish_reason: 'stop' }] }) },
]

function summarizeHost(url: string): string {
  return new URL(url).hostname
}

describe('DeepSeek-owned jobs never cross to Grok (design §3.3 invariant 6)', () => {
  it('never fetches api.x.ai or the Grok proxy under any failure class', async () => {
    for (const failure of FAILURES) {
      const urls: string[] = []
      global.fetch = jest.fn(async (input) => {
        urls.push(String(input))
        return failure.make()
      }) as unknown as typeof fetch

      await expect(generateContentText({
        aiProvider: DEEPSEEK_PIN,
        exclusive: true,
        system: 'Write.',
        prompt: 'Write an article.',
        maxTokens: 64,
        timeoutMs: 5_000,
        skipQualityContract: true,
      })).rejects.toThrow()

      expect(urls.length).toBeGreaterThan(0)
      for (const url of urls) {
        expect({ failure: failure.name, host: summarizeHost(url) }).toEqual({
          failure: failure.name,
          host: 'api.deepseek.com',
        })
      }
      expect(urls.some((url) => GROK_HOSTS.some((host) => url.includes(host)))).toBe(false)
    }
  })

  it('a DeepSeek auth failure with both keys present fails on DeepSeek — no Grok substitution', async () => {
    const urls: string[] = []
    global.fetch = jest.fn(async (input) => {
      urls.push(String(input))
      return json({ error: { message: 'invalid api key' } }, 401)
    }) as unknown as typeof fetch

    await expect(generateContentText({
      aiProvider: DEEPSEEK_PIN,
      exclusive: true,
      system: 'Write.',
      prompt: 'Write an article.',
      maxTokens: 64,
      skipQualityContract: true,
    })).rejects.toThrow()

    expect(urls.some((url) => url.includes('api.deepseek.com'))).toBe(true)
    expect(urls.some((url) => GROK_HOSTS.some((host) => url.includes(host)))).toBe(false)
  })
})

describe('Grok-owned jobs never cross to DeepSeek (design §13 decision 10)', () => {
  it('never fetches api.deepseek.com under any failure class, even with DEEPSEEK_API_KEY set', async () => {
    for (const failure of FAILURES) {
      const urls: string[] = []
      global.fetch = jest.fn(async (input) => {
        urls.push(String(input))
        return failure.make()
      }) as unknown as typeof fetch

      await expect(generateContentText({
        aiProvider: GROK_PIN,
        exclusive: true,
        system: 'Write.',
        prompt: 'Write an article.',
        maxTokens: 64,
        timeoutMs: 5_000,
        skipQualityContract: true,
      })).rejects.toThrow()

      expect(urls.length).toBeGreaterThan(0)
      expect(urls.some((url) => url.includes('api.deepseek.com'))).toBe(false)
      for (const url of urls) {
        expect({ failure: failure.name, grokHost: GROK_HOSTS.some((host) => url.includes(host)) }).toEqual({
          failure: failure.name,
          grokHost: true,
        })
      }
    }
  })

  it('a Grok quota failure with a DeepSeek key present never falls through to DeepSeek', async () => {
    const urls: string[] = []
    global.fetch = jest.fn(async (input) => {
      urls.push(String(input))
      return json({ error: { message: 'you exceeded your current quota' } }, 402)
    }) as unknown as typeof fetch

    await expect(generateContentText({
      aiProvider: GROK_PIN,
      exclusive: true,
      system: 'Write.',
      prompt: 'Write an article.',
      maxTokens: 64,
      skipQualityContract: true,
    })).rejects.toThrow()

    expect(urls.some((url) => url.includes('api.x.ai'))).toBe(true)
    expect(urls.some((url) => url.includes('api.deepseek.com'))).toBe(false)
  })
})

describe('retained Grok CLI-proxy fallback is same-provider/same-credential (design §3.1)', () => {
  it('uses the Grok credential only, keeps the Grok model, and never appears on a DeepSeek path', async () => {
    process.env.XAI_AUTH_MODE = 'supergrok'
    process.env.XAI_API_KEY = 'supergrok-session-token'
    const calls: Array<{ url: string; headers: Record<string, string> }> = []
    global.fetch = jest.fn(async (input, init) => {
      const url = String(input)
      const headers = (init?.headers || {}) as Record<string, string>
      calls.push({ url, headers })
      if (url.includes('api.x.ai')) {
        return json({ error: { message: 'personal-team-blocked: personal accounts cannot use metered team keys' } }, 403)
      }
      return json({ output_text: 'GROK-PROXY-BRIEF', status: 'completed' })
    }) as unknown as typeof fetch

    const result = await generateContentText({
      aiProvider: GROK_PIN,
      exclusive: true,
      system: 'Write.',
      prompt: 'Write an article.',
      maxTokens: 256,
      skipQualityContract: true,
    })

    expect(result.provider).toBe('grok')
    expect(result.text).toBe('GROK-PROXY-BRIEF')

    const proxyCall = calls.find((call) => call.url.includes('cli-chat-proxy.grok.com'))
    expect(proxyCall).toBeDefined()
    expect(proxyCall!.headers.Authorization).toBe('Bearer supergrok-session-token')
    expect(proxyCall!.headers['x-grok-model-override']).toBe('grok-4.6')
    expect(calls.some((call) => call.url.includes('api.deepseek.com'))).toBe(false)
  })
})
