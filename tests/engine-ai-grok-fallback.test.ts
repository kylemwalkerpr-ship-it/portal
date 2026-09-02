/**
 * Discover / Master Engine AI harmonization — LIVE POLICY (2026-09-02):
 * the deterministic SEO engine stays authoritative; the harmonization pair
 * is Entrim Qwen3.6 27B (lead) + Entrim DeepSeek V4 Flash (complement), both
 * on api.entrim.ai/v1 with the single ENTRIM vault key. Grok / Claude /
 * Run BiOS are out of commission — without ENTRIM_API_KEY the engine fails
 * closed with the live-policy error.
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
  generateEngineText,
  generateEnginePairText,
  extractEngineJsonObject,
  ENGINE_FALLBACK_PROVIDER,
  ENGINE_PAIR,
  resolveEngineAiProvider,
} from '@/lib/seoEngine/engineAi'
import { resetEnginePairBreaker } from '@/lib/seoEngine/enginePairBreaker'

describe('resolveEngineAiProvider — live pin mapping', () => {
  const envKeys = ['OPENAI_API_KEY', 'XAI_API_KEY', 'ENTRIM_API_KEY'] as const
  const saved: Record<string, string | undefined> = {}

  beforeAll(() => {
    for (const k of envKeys) saved[k] = process.env[k]
  })

  afterEach(() => {
    for (const k of envKeys) {
      if (saved[k] == null) delete process.env[k]
      else process.env[k] = saved[k]
    }
  })

  it('exports the Entrim DeepSeek family as the engine fallback (Grok retired)', () => {
    expect(ENGINE_FALLBACK_PROVIDER).toBe('entrim-deepseek')
  })

  it('routes an OpenAI pin without a key to the Entrim lead (Grok redirect retired)', () => {
    delete process.env.OPENAI_API_KEY
    delete process.env.ENTRIM_API_KEY
    delete process.env.XAI_API_KEY
    expect(resolveEngineAiProvider('openai')).toBe('entrim-qwen-27b')
    process.env.OPENAI_API_KEY = 'sk-test'
    expect(resolveEngineAiProvider('openai')).toBe('openai')
  })

  it('defaults an empty pin to the engine pair', () => {
    expect(resolveEngineAiProvider()).toBe(ENGINE_PAIR)
    expect(resolveEngineAiProvider('auto')).toBe(ENGINE_PAIR)
    expect(resolveEngineAiProvider('engine-pair')).toBe(ENGINE_PAIR)
  })
})

describe('Master Engine pair — Entrim Qwen lead + Entrim DeepSeek complement (Entrim-only live policy)', () => {
  const envKeys = ['XAI_API_KEY', 'RUNBIOS_API_KEY', 'ENTRIM_API_KEY', 'OPENAI_API_KEY', 'CONTENT_AI_RETRY'] as const
  const saved: Record<string, string | undefined> = {}
  const originalFetch = global.fetch

  beforeAll(() => {
    for (const k of envKeys) saved[k] = process.env[k]
  })

  afterEach(() => {
    global.fetch = originalFetch
    resetEnginePairBreaker()
    for (const k of envKeys) {
      if (saved[k] == null) delete process.env[k]
      else process.env[k] = saved[k]
    }
  })

  it('runs the pair — Entrim Qwen lead + Entrim DeepSeek complement on one vault key', async () => {
    process.env.ENTRIM_API_KEY = 'test-entrim-key'
    process.env.XAI_API_KEY = 'test-xai-key' // retired host — must never be contacted
    process.env.CONTENT_AI_RETRY = '1'

    const seen: Array<{ url: string; model?: string }> = []
    global.fetch = jest.fn(async (input, init) => {
      const url = String(input)
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : {}
      seen.push({ url, model: (body.model as string | undefined) || (body as { input?: string }).input as string | undefined })
      const prompt = JSON.stringify(body)
      // Both legs share the Entrim endpoint — distinguish them by model id.
      // The complement drafts a DIFFERENT text so the pair disagrees and the
      // harmony (merge) pass fires; its prompt carries 'COMPLEMENT DRAFT'.
      const text = prompt.includes('COMPLEMENT DRAFT')
        ? 'MERGED-ENGINE with extra statute INA 214'
        : body.model === 'deepseek-ai/DeepSeek-V4-Flash'
          ? 'DEEPSEEK-COMPLEMENT-ENGINE-DRAFT'
          : 'QWEN-LEAD-ENGINE-DRAFT'
      return new Response(
        JSON.stringify({ choices: [{ message: { content: text }, finish_reason: 'stop' }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }) as typeof fetch

    const result = await generateEnginePairText({
      system: 'Score this cluster.',
      prompt: 'TOPIC: f1 visa',
    })

    expect(result.provider).toBe('entrim-qwen-27b')
    expect(result.text).toContain('MERGED-ENGINE')
    // Both legs hit Entrim — one endpoint, one vault key.
    expect(seen.every((s) => s.url.includes('api.entrim.ai'))).toBe(true)
    expect(seen.some((s) => s.model === 'Qwen/Qwen3.6-27B')).toBe(true)
    expect(seen.some((s) => s.model === 'deepseek-ai/DeepSeek-V4-Flash')).toBe(true)
    // Retired hosts are never contacted.
    expect(seen.some((s) => s.url.includes('api.x.ai'))).toBe(false)
    expect(seen.some((s) => s.url.includes('api.runbios.ai'))).toBe(false)
    expect(result.pair?.merged || result.pair?.leadOnly).toBe(true)
  })

  it('generateEngineText with no pin uses the pair — OpenAI/Run BiOS never fire', async () => {
    process.env.ENTRIM_API_KEY = 'test-entrim-key'
    process.env.OPENAI_API_KEY = 'sk-should-not-be-called'
    process.env.RUNBIOS_API_KEY = 'test-runbios-key'
    process.env.CONTENT_AI_RETRY = '1'
    const urls: string[] = []
    global.fetch = jest.fn(async (input) => {
      const url = String(input)
      urls.push(url)
      return new Response(
        JSON.stringify({ choices: [{ message: { content: 'PAIR-LEAD' }, finish_reason: 'stop' }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }) as typeof fetch

    const result = await generateEngineText({
      system: 'Summarize.',
      prompt: 'IRCC notice',
    })
    expect(result.text).toBe('PAIR-LEAD')
    expect(urls.some((u) => u.includes('api.openai.com'))).toBe(false)
    expect(urls.some((u) => u.includes('api.runbios.ai'))).toBe(false) // Claude out of commission
    expect(urls.some((u) => u.includes('api.entrim.ai'))).toBe(true)
  })

  it('fails CLOSED without ENTRIM_API_KEY — no retired host is contacted', async () => {
    delete process.env.ENTRIM_API_KEY
    delete process.env.XAI_API_KEY
    process.env.RUNBIOS_API_KEY = 'test-runbios-key'
    process.env.CONTENT_AI_RETRY = '1'

    const urls: string[] = []
    global.fetch = jest.fn(async (input) => {
      urls.push(String(input))
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: 'SHOULD-NOT-HAPPEN' }, finish_reason: 'stop' }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }) as typeof fetch

    await expect(
      generateEnginePairText({
        system: 'Score this cluster.',
        prompt: 'TOPIC: f1 visa',
      }),
    ).rejects.toThrow(/Engine pair failed/)
    // No retired host fired — the pair is Entrim-only.
    expect(urls.some((u) => u.includes('api.runbios.ai'))).toBe(false)
    expect(urls.some((u) => u.includes('api.x.ai'))).toBe(false)
  })

  it('degraded pair: when the complement fails the Qwen lead still carries the result (lead-only)', async () => {
    process.env.ENTRIM_API_KEY = 'test-entrim-key'
    process.env.CONTENT_AI_RETRY = '1'

    global.fetch = jest.fn(async (_input, init) => {
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) as { model?: string } : {}
      if (body.model === 'deepseek-ai/DeepSeek-V4-Flash') {
        throw new Error('entrim 429 service overloaded')
      }
      return new Response(
        JSON.stringify({ choices: [{ message: { content: 'QWEN-LEAD-ONLY' }, finish_reason: 'stop' }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }) as typeof fetch

    const result = await generateEnginePairText({
      system: 'Score this cluster.',
      prompt: 'TOPIC: f1 visa',
    })
    expect(result.text).toBe('QWEN-LEAD-ONLY')
    expect(result.pair?.leadOnly).toBe(true)
  })

  it('extractEngineJsonObject recovers fenced JSON and rejects prose', () => {
    expect(extractEngineJsonObject('```json\n{"summary":"ok"}\n```')).toEqual({ summary: 'ok' })
    expect(extractEngineJsonObject('no json here')).toBeNull()
  })
})
