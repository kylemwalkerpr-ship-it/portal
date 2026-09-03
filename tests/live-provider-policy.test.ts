/**
 * LIVE PROVIDER POLICY (2026-09-02): Entrim Qwen3.6 27B + Entrim DeepSeek
 * V4 Flash are the ONLY commissioned content backends for every pipeline
 * stage. These tests lock the gate:
 *
 *  1. isLiveProviderLabel admits exactly the two Entrim labels (plus the
 *     CONTENT_AI_ALL_PROVIDERS=1 break-glass).
 *  2. A retired pin is REDIRECTED to the Entrim default with its model
 *     override stripped — a decommissioned host's model id must never reach
 *     an Entrim request (the model=grok-4.6-into-Entrim 400 class of bug).
 *  3. The cascade filter runs BEFORE the candidate cap, so a stale admin
 *     provider order crowded with retired hosts can never push both live
 *     backends out of the bounded cascade.
 */
jest.mock('@/lib/aiKeyVault', () => ({
  buildVaultEnvOverrides: jest.fn(async () => ({})),
  getAiSettings: jest.fn(async () => ({})),
  setAiSetting: jest.fn(async () => undefined),
  deleteAiSetting: jest.fn(async () => undefined),
}))

import {
  generateContentText,
  isLiveProviderLabel,
  LIVE_DEFAULT_PROVIDER,
  LIVE_PROVIDER_LABELS,
} from '@/lib/contentAiProvider'

describe('live provider policy — Entrim-only gate', () => {
  const envKeys = [
    'ENTRIM_API_KEY', 'XAI_API_KEY', 'OPENAI_API_KEY', 'BASETEN_API_KEY',
    'NVIDIA_API_KEY', 'CONTENT_AI_RETRY', 'CONTENT_AI_ALL_PROVIDERS',
    'CONTENT_AI_PROVIDER_ORDER', 'CONTENT_AI_MAX_PROVIDERS',
  ] as const
  const saved: Record<string, string | undefined> = {}
  const originalFetch = global.fetch

  beforeAll(() => {
    for (const k of envKeys) saved[k] = process.env[k]
  })

  beforeEach(() => {
    for (const k of envKeys) delete process.env[k]
    process.env.ENTRIM_API_KEY = 'test-entrim-key'
    process.env.CONTENT_AI_RETRY = '1'
  })

  afterEach(() => {
    global.fetch = originalFetch
    for (const k of envKeys) {
      if (saved[k] == null) delete process.env[k]
      else process.env[k] = saved[k]
    }
  })

  it('admits exactly the two live Entrim labels', () => {
    expect(LIVE_PROVIDER_LABELS).toEqual(['entrim-qwen-27b', 'entrim-deepseek'])
    expect(LIVE_DEFAULT_PROVIDER).toBe('entrim-qwen-27b')
    expect(isLiveProviderLabel('entrim-qwen-27b')).toBe(true)
    expect(isLiveProviderLabel('entrim-deepseek')).toBe(true)
    // Every decommissioned host is refused.
    for (const retired of ['nvidia-minimax', 'nvidia-nemotron', 'nvidia-glm', 'nvidia-deepseek', 'grok', 'openai', 'baseten-deepseek', 'baseten-glm-fast', 'parasail-deepseek', 'runbios-glm-53-flash', 'cloudflare-ai', 'groq', 'zai-glm', 'aihubmix-glm-fast', 'openrouter', 'gemini', 'chatProvider-bridge', 'custom']) {
      expect({ retired, live: isLiveProviderLabel(retired) }).toEqual({ retired, live: false })
    }
  })

  it('CONTENT_AI_ALL_PROVIDERS=1 admits retired labels (break-glass, diagnostics only)', () => {
    process.env.CONTENT_AI_ALL_PROVIDERS = '1'
    expect(isLiveProviderLabel('nvidia-minimax')).toBe(true)
    expect(isLiveProviderLabel('grok')).toBe(true)
    // Live labels stay live regardless.
    expect(isLiveProviderLabel('entrim-qwen-27b')).toBe(true)
  })

  it('a retired pin redirects to the Entrim default with the model override stripped', async () => {
    process.env.XAI_API_KEY = 'test-xai-key' // retired host with a local key
    const bodies: Array<Record<string, unknown>> = []
    const urls: string[] = []
    global.fetch = jest.fn(async (input, init) => {
      urls.push(String(input))
      try { bodies.push(JSON.parse(String(init?.body || '{}')) as Record<string, unknown>) } catch { /* ignore */ }
      return new Response(
        JSON.stringify({ choices: [{ message: { content: 'ENTRIM-DRAFT', finish_reason: 'stop' } }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }) as typeof fetch

    const result = await generateContentText({
      aiProvider: 'grok',
      model: 'grok-4.6',
      system: 'Write an article.',
      prompt: 'Draft the article.',
      skipQualityContract: true,
    })

    // The retired host was never contacted; Entrim served the request.
    expect(urls.some((u) => u.includes('api.x.ai'))).toBe(false)
    expect(urls.some((u) => u.includes('api.entrim.ai'))).toBe(true)
    expect(result.provider).toBe(LIVE_DEFAULT_PROVIDER)
    // The retired model id never leaked into the Entrim request.
    expect(bodies.every((b) => b.model !== 'grok-4.6')).toBe(true)
    expect(bodies[0]?.model).toBe('Qwen/Qwen3.6-27B')
  })

  it('the cascade contains only live providers even when retired hosts have keys', async () => {
    process.env.XAI_API_KEY = 'test-xai-key'
    process.env.OPENAI_API_KEY = 'test-openai-key'
    process.env.BASETEN_API_KEY = 'test-baseten-key'
    process.env.NVIDIA_API_KEY = 'test-nvidia-key'

    const urls: string[] = []
    global.fetch = jest.fn(async (input) => {
      urls.push(String(input))
      // Both Entrim legs "fail" so the cascade would run dry — proving no
      // retired host is reachable even on total live failure.
      if (String(input).includes('api.entrim.ai')) {
        return new Response(JSON.stringify({ error: 'upstream gateway timeout' }), {
          status: 524, headers: { 'content-type': 'application/json' },
        })
      }
      return new Response(
        JSON.stringify({ choices: [{ message: { content: 'RETIRED-HOST-REACHED' }, finish_reason: 'stop' }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }) as typeof fetch

    await expect(
      generateContentText({
        aiProvider: 'entrim-qwen-27b',
        system: 'Write an article.',
        prompt: 'Draft the article.',
        skipQualityContract: true,
      }),
    ).rejects.toThrow(/All content AI providers failed/)

    expect(urls.some((u) => u.includes('api.entrim.ai'))).toBe(true)
    expect(urls.filter((u) => !u.includes('api.entrim.ai')).length).toBe(0)
  })

  it('a stale crowded admin order cannot crowd the live pair out of the bounded cascade', async () => {
    // Retired hosts lead the saved order; the live pair trails. With a cap of
    // 2 candidates, the pre-cap filter is what keeps Entrim in the cascade.
    process.env.XAI_API_KEY = 'test-xai-key'
    process.env.OPENAI_API_KEY = 'test-openai-key'
    process.env.BASETEN_API_KEY = 'test-baseten-key'
    process.env.NVIDIA_API_KEY = 'test-nvidia-key'
    process.env.CONTENT_AI_MAX_PROVIDERS = '2'
    process.env.CONTENT_AI_PROVIDER_ORDER = JSON.stringify([
      'grok', 'openai', 'baseten-deepseek', 'nvidia-minimax', 'nvidia-glm',
      'entrim-qwen-27b', 'entrim-deepseek',
    ])

    const urls: string[] = []
    global.fetch = jest.fn(async (input) => {
      urls.push(String(input))
      if (String(input).includes('api.entrim.ai')) {
        return new Response(JSON.stringify({ error: 'upstream gateway timeout' }), {
          status: 524, headers: { 'content-type': 'application/json' },
        })
      }
      return new Response(
        JSON.stringify({ choices: [{ message: { content: 'RETIRED-HOST-REACHED' }, finish_reason: 'stop' }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }) as typeof fetch

    await expect(
      generateContentText({
        aiProvider: 'entrim-qwen-27b',
        system: 'Write an article.',
        prompt: 'Draft the article.',
        skipQualityContract: true,
      }),
    ).rejects.toThrow(/All content AI providers failed/)

    // Both live legs were attempted (cap = 2, both slots went to Entrim) and
    // no retired host was contacted.
    expect(urls.filter((u) => u.includes('api.entrim.ai')).length).toBeGreaterThanOrEqual(2)
    expect(urls.filter((u) => !u.includes('api.entrim.ai')).length).toBe(0)
  })

  it('an Entrim payment/quota failure never calls the Grok sidecar under the live policy', async () => {
    // Grok IS configured — but the payment/quota sidecar is break-glass only.
    // An Entrim quota failure must fail loudly, not bounce to grokComplete.
    process.env.XAI_API_KEY = 'test-xai-key'
    const urls: string[] = []
    global.fetch = jest.fn(async (input) => {
      const url = String(input)
      urls.push(url)
      if (url.includes('api.entrim.ai')) {
        return new Response(JSON.stringify({ error: 'you exceeded your current quota' }), {
          status: 429, headers: { 'content-type': 'application/json' },
        })
      }
      return new Response(
        JSON.stringify({ output_text: 'GROK-SIDECAR-REACHED', status: 'completed' }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }) as typeof fetch

    await expect(
      generateContentText({
        aiProvider: 'entrim-qwen-27b',
        exclusive: true,
        system: 'Write an article.',
        prompt: 'Draft the article.',
        skipQualityContract: true,
      }),
    ).rejects.toThrow(/Explicit AI provider "entrim-qwen-27b" failed/)

    expect(urls.some((u) => u.includes('api.entrim.ai'))).toBe(true)
    expect(urls.some((u) => u.includes('api.x.ai'))).toBe(false)
  })

  it('CONTENT_AI_ALL_PROVIDERS=1 restores the Grok payment/quota sidecar (break-glass)', async () => {
    process.env.XAI_API_KEY = 'test-xai-key'
    process.env.CONTENT_AI_ALL_PROVIDERS = '1'
    const urls: string[] = []
    global.fetch = jest.fn(async (input) => {
      const url = String(input)
      urls.push(url)
      if (url.includes('api.entrim.ai')) {
        return new Response(JSON.stringify({ error: 'you exceeded your current quota' }), {
          status: 429, headers: { 'content-type': 'application/json' },
        })
      }
      return new Response(
        JSON.stringify({ output_text: 'GROK-SIDECAR-REACHED', status: 'completed' }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }) as typeof fetch

    const result = await generateContentText({
      aiProvider: 'entrim-qwen-27b',
      exclusive: true,
      system: 'Write an article.',
      prompt: 'Draft the article.',
      skipQualityContract: true,
    })
    expect(result.provider).toBe('grok')
    expect(result.text).toBe('GROK-SIDECAR-REACHED')
    expect(urls.some((u) => u.includes('api.x.ai'))).toBe(true)
    expect(urls.some((u) => u.includes('api.openai.com'))).toBe(false)
  })
})
