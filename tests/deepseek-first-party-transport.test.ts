/**
 * First-party DeepSeek transport — FROZEN CONTRACT (Plan Task 1, activated at P2).
 *
 * The commissioned `deepseek-v41-flash` adapter (design §3.5) must:
 *   1. POST only to the literal host `api.deepseek.com` (`https://api.deepseek.com/v1`);
 *   2. send the upstream model id `deepseek-flash` verbatim — never the stale
 *      repo ids (`deepseek-ai/DeepSeek-V4-Flash-0731`), never an Entrim id,
 *      never a Parasail-canonicalized alias;
 *   3. ignore every `DEEPSEEK_BASE_URL` / vault `base_url` override — there is
 *      no configurable destination for this provider;
 *   4. refuse any non-`api.deepseek.com` destination with the typed
 *      `destination_violation` failure class before a request leaves the Worker;
 *   5. support both streaming and non-streaming calls on the same record.
 *
 * These cases stay RED through P1 because the adapter + registration land in
 * the P2 commission flip (plan Tasks 3-7).
 */
jest.mock('@/lib/aiKeyVault', () => ({
  buildVaultEnvOverrides: jest.fn(async () => ({})),
  getAiSettings: jest.fn(async () => ({})),
  setAiSetting: jest.fn(async () => undefined),
  deleteAiSetting: jest.fn(async () => undefined),
  ensureDraftDefaultSettings: jest.fn(async () => undefined),
  ensureParasailDefaultSettings: jest.fn(async () => undefined),
}))

import {
  generateContentText,
  generateContentTextStream,
  setVaultOverlay,
} from '@/lib/contentAiProvider'
import {
  COMMISSIONED_PROVIDERS,
  assertCommissionedDestination,
  commissionedProvider,
} from '@/lib/contentAiRegistry'

const DEEPSEEK_PIN = 'deepseek-v41-flash' as const
const DEEPSEEK_API_MODEL = 'deepseek-flash'

const ENV_KEYS = ['XAI_API_KEY', 'DEEPSEEK_API_KEY', 'DEEPSEEK_BASE_URL', 'DEEPSEEK_MODEL', 'CONTENT_AI_RETRY'] as const
const savedEnv: Record<string, string | undefined> = {}
const originalFetch = global.fetch

beforeAll(() => {
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key]
})

beforeEach(() => {
  for (const key of ENV_KEYS) delete process.env[key]
  process.env.CONTENT_AI_RETRY = '1'
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

const json = (payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })

const chatCompletion = (text: string) => json({
  choices: [{ message: { content: text }, finish_reason: 'stop' }],
})

function recordFetch(): { urls: string[]; calls: Array<{ url: string; init?: RequestInit }>; spy: jest.Mock } {
  const urls: string[] = []
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const spy = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    urls.push(String(input))
    calls.push({ url: String(input), init })
    return chatCompletion('DEEPSEEK-FIRST-PARTY-DRAFT')
  })
  global.fetch = spy as unknown as typeof fetch
  return { urls, calls, spy }
}

describe('DeepSeek first-party transport — literal destination + model (design §3.5)', () => {
  it('freezes the registry destination: api.deepseek.com/v1 only', () => {
    const provider = commissionedProvider(DEEPSEEK_PIN)
    expect(provider.baseUrl).toBe('https://api.deepseek.com/v1')
    expect(provider.baseUrlHost).toBe('api.deepseek.com')
    expect(COMMISSIONED_PROVIDERS.find((p) => p.pin === DEEPSEEK_PIN)?.apiModel).toBe(DEEPSEEK_API_MODEL)
  })

  it('non-stream: sends the literal deepseek-flash model to api.deepseek.com/v1 only', async () => {
    process.env.DEEPSEEK_API_KEY = 'test-deepseek-key'
    process.env.XAI_API_KEY = 'test-xai-key' // must never be contacted
    const { urls, calls } = recordFetch()

    const result = await generateContentText({
      aiProvider: DEEPSEEK_PIN,
      exclusive: true,
      system: 'Write.',
      prompt: 'Write an article.',
      maxTokens: 256,
      skipQualityContract: true,
    })

    expect(result.provider).toBe(DEEPSEEK_PIN)
    expect(result.model).toBe(DEEPSEEK_API_MODEL)
    expect(result.text).toBe('DEEPSEEK-FIRST-PARTY-DRAFT')

    expect(calls.length).toBeGreaterThan(0)
    for (const call of calls) {
      const url = new URL(call.url)
      expect(url.hostname).toBe('api.deepseek.com')
      expect(url.pathname).toBe('/v1/chat/completions')
      const body = JSON.parse(String(call.init?.body || '{}')) as Record<string, unknown>
      expect(body.model).toBe(DEEPSEEK_API_MODEL)
      expect(body.model).not.toBe('deepseek-v41-flash')
      expect(body.model).not.toContain('0731')
      expect(body.model).not.toContain('Entrim')
      expect(String(body.model).toLowerCase()).not.toContain('parasail')
    }
    expect(urls.some((url) => url.includes('api.x.ai') || url.includes('cli-chat-proxy.grok.com'))).toBe(false)
  })

  it('ignores a DEEPSEEK_BASE_URL override — the literal host is the only destination', async () => {
    process.env.DEEPSEEK_API_KEY = 'test-deepseek-key'
    process.env.DEEPSEEK_BASE_URL = 'https://api.entrim.ai/v1'
    const { calls } = recordFetch()

    await generateContentText({
      aiProvider: DEEPSEEK_PIN,
      exclusive: true,
      system: 'Write.',
      prompt: 'Write an article.',
      maxTokens: 256,
      skipQualityContract: true,
    })

    expect(calls.length).toBeGreaterThan(0)
    expect(calls.every((call) => new URL(call.url).hostname === 'api.deepseek.com')).toBe(true)
  })

  it('ignores a vault base_url overlay — the commissioned pin has no override surface', async () => {
    setVaultOverlay({
      DEEPSEEK_API_KEY: 'vault-deepseek-key',
      DEEPSEEK_BASE_URL: 'https://api.entrim.ai/v1',
    })
    process.env.DEEPSEEK_BASE_URL = 'https://api.nvidia.com/v1'
    const { calls } = recordFetch()

    await generateContentText({
      aiProvider: DEEPSEEK_PIN,
      exclusive: true,
      system: 'Write.',
      prompt: 'Write an article.',
      maxTokens: 256,
      skipQualityContract: true,
    })

    expect(calls.length).toBeGreaterThan(0)
    expect(calls.every((call) => new URL(call.url).hostname === 'api.deepseek.com')).toBe(true)
    // Vault credential precedence (existing vault-overlay contract) still wins.
    expect(String(calls[0].init?.headers && (calls[0].init!.headers as Record<string, string>).Authorization))
      .toBe('Bearer vault-deepseek-key')
  })

  it('ignores a stale Parasail/Entrim model override — the literal deepseek-flash is always sent', async () => {
    process.env.DEEPSEEK_API_KEY = 'test-deepseek-key'
    const { calls } = recordFetch()

    await generateContentText({
      aiProvider: DEEPSEEK_PIN,
      model: 'deepseek-ai/DeepSeek-V4-Flash-0731',
      exclusive: true,
      system: 'Write.',
      prompt: 'Write an article.',
      maxTokens: 256,
      skipQualityContract: true,
    })

    expect(calls.length).toBeGreaterThan(0)
    const body = JSON.parse(String(calls[0].init?.body || '{}')) as Record<string, unknown>
    expect(body.model).toBe(DEEPSEEK_API_MODEL)
  })

  it('stream: both transport modes send the literal deepseek-flash to api.deepseek.com', async () => {
    process.env.DEEPSEEK_API_KEY = 'test-deepseek-key'
    process.env.XAI_API_KEY = 'test-xai-key'
    const urls: string[] = []
    let streamBody: Record<string, unknown> | null = null
    global.fetch = jest.fn(async (input, init) => {
      urls.push(String(input))
      streamBody = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>
      const sse = [
        'data: {"choices":[{"delta":{"content":"DEEPSEEK-STREAM-DRAFT"}}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
        'data: [DONE]\n\n',
      ].join('')
      return new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } })
    }) as unknown as typeof fetch

    const events: Array<{ type: string; provider?: string; model?: string; text?: string }> = []
    for await (const event of generateContentTextStream({
      aiProvider: DEEPSEEK_PIN,
      exclusive: true,
      system: 'Write.',
      prompt: 'Write an article.',
      maxTokens: 256,
      skipQualityContract: true,
    })) {
      events.push(event as { type: string; provider?: string; model?: string; text?: string })
    }

    expect(urls.length).toBeGreaterThan(0)
    expect(urls.every((url) => new URL(url).hostname === 'api.deepseek.com')).toBe(true)
    expect(urls.some((url) => url.includes('api.x.ai') || url.includes('cli-chat-proxy.grok.com'))).toBe(false)
    expect(streamBody?.model).toBe(DEEPSEEK_API_MODEL)
    const streamed = events.filter((event) => event.type === 'delta').map((event) => event.text || '').join('')
    expect(streamed).toContain('DEEPSEEK-STREAM-DRAFT')
  })

  it('a non-deepseek destination raises destination_violation BEFORE any fetch', async () => {
    // The assertion is the transport's pre-fetch guard; a fetch spy proves the
    // bad destination can never produce a request.
    const { spy } = recordFetch()
    for (const badUrl of ['https://api.entrim.ai/v1', 'https://api.nvidia.com/v1', 'https://api.x.ai/v1']) {
      let caught: unknown
      try {
        assertCommissionedDestination(badUrl, 'api.deepseek.com')
      } catch (error) {
        caught = error
      }
      expect(caught).toBeDefined()
      expect((caught as { code?: string }).code).toBe('destination_violation')
      expect((caught as { failureClass?: string }).failureClass || (caught as { code?: string }).code)
        .toBe('destination_violation')
    }
    expect(spy).not.toHaveBeenCalled()
  })
})
