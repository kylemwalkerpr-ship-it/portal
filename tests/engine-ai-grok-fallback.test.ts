/**
 * Discover / Master Engine AI harmonization — COMMISSIONED PAIR (P2,
 * 2026-09-15, design §13 decision 3).
 *
 * The deterministic SEO engine stays authoritative; the harmonization pair is
 * exactly:
 *
 *   LEAD        — Grok 4.6 (`grok`) on the retained xAI transport.
 *   COMPLEMENT  — DeepSeek V4.1 Flash (`deepseek-v41-flash`) on first-party
 *                 `api.deepseek.com` with upstream model `deepseek-flash`.
 *
 * Regression lock:
 *
 *  1. `enginePairReady()` requires BOTH commissioned keys — one key alone is
 *     not the pair and there is NO single-lead degradation.
 *  2. A legacy/unknown explicit pin is a typed `ProviderSelectionRequiredError`
 *     with zero outbound calls — never a redirect.
 *  3. No Grok<->DeepSeek cross-fallback: each leg touches only its own literal
 *     host, and a failing single-pin leg throws instead of drafting on the
 *     other provider. Retired Entrim/OpenAI/Run BiOS hosts never appear.
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
  ENGINE_COMPLEMENT_PROVIDER,
  ENGINE_LEAD_PROVIDER,
  ENGINE_PAIR,
  enginePairReady,
  resolveEngineAiProvider,
} from '@/lib/seoEngine/engineAi'
import { resetEnginePairBreaker } from '@/lib/seoEngine/enginePairBreaker'
import { ProviderSelectionRequiredError } from '@/lib/contentAiRegistry'

const LEGACY_ENGINE_PINS = [
  'entrim-deepseek',
  'entrim-qwen-27b',
  'qwen',
  'nvidia-deepseek',
  'baseten-deepseek',
  'parasail-deepseek',
  'runbios-claude-opus',
  'openai',
  'gpt-5.6-sol',
  'deepseek',
  'deepseek-flash',
] as const

describe('commissioned engine pair identity', () => {
  it('exports the commissioned pair — Grok lead + first-party DeepSeek complement', () => {
    expect(ENGINE_LEAD_PROVIDER).toBe('grok')
    expect(ENGINE_COMPLEMENT_PROVIDER).toBe('deepseek-v41-flash')
    expect(ENGINE_PAIR).toBe('engine-pair')
  })

  it('resolveEngineAiProvider resolves the pair sentinel and commissioned pins only', () => {
    expect(resolveEngineAiProvider()).toBe(ENGINE_PAIR)
    expect(resolveEngineAiProvider('auto')).toBe(ENGINE_PAIR)
    expect(resolveEngineAiProvider('engine-pair')).toBe(ENGINE_PAIR)
    expect(resolveEngineAiProvider('grok')).toBe('grok')
    expect(resolveEngineAiProvider('grok-4.6')).toBe('grok')
    expect(resolveEngineAiProvider('deepseek-v41-flash')).toBe('deepseek-v41-flash')
  })

  it('every legacy/retired pin is a typed selection-required failure — never a redirect', () => {
    for (const pin of LEGACY_ENGINE_PINS) {
      let caught: unknown
      try {
        resolveEngineAiProvider(pin)
      } catch (error) {
        caught = error
      }
      expect(caught).toBeInstanceOf(ProviderSelectionRequiredError)
      expect(caught as ProviderSelectionRequiredError).toMatchObject({
        code: 'selection_required',
        status: 409,
        legacyValue: pin,
      })
    }
  })

  it('enginePairReady requires BOTH commissioned providers — no single-lead degradation', () => {
    const envKeys = ['XAI_API_KEY', 'DEEPSEEK_API_KEY'] as const
    const saved: Record<string, string | undefined> = {}
    for (const k of envKeys) saved[k] = process.env[k]
    try {
      delete process.env.XAI_API_KEY
      delete process.env.DEEPSEEK_API_KEY
      expect(enginePairReady()).toBe(false)

      process.env.XAI_API_KEY = 'test-xai-key'
      expect(enginePairReady()).toBe(false) // Grok alone is not the pair

      process.env.DEEPSEEK_API_KEY = 'test-deepseek-key'
      expect(enginePairReady()).toBe(true)

      delete process.env.XAI_API_KEY
      expect(enginePairReady()).toBe(false) // DeepSeek alone is not the pair either
    } finally {
      for (const k of envKeys) {
        if (saved[k] == null) delete process.env[k]
        else process.env[k] = saved[k]
      }
    }
  })
})

describe('Master Engine pair — Grok 4.6 + DeepSeek V4.1 Flash', () => {
  const envKeys = ['XAI_API_KEY', 'DEEPSEEK_API_KEY', 'RUNBIOS_API_KEY', 'ENTRIM_API_KEY', 'OPENAI_API_KEY', 'CONTENT_AI_RETRY'] as const
  const saved: Record<string, string | undefined> = {}
  const originalFetch = global.fetch

  beforeAll(() => {
    for (const k of envKeys) saved[k] = process.env[k]
  })

  beforeEach(() => {
    for (const k of envKeys) delete process.env[k]
    process.env.CONTENT_AI_RETRY = '1'
  })

  afterEach(() => {
    global.fetch = originalFetch
    resetEnginePairBreaker()
    for (const k of envKeys) {
      if (saved[k] == null) delete process.env[k]
      else process.env[k] = saved[k]
    }
  })

  function pairFetch(seen: Array<{ url: string; model?: string }>) {
    return jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : {}
      seen.push({ url, model: (body.model as string | undefined) })
      const prompt = JSON.stringify(body)
      const text = url.includes('api.deepseek.com')
        ? 'DEEPSEEK-COMPLEMENT-ENGINE-DRAFT'
        : prompt.includes('COMPLEMENT DRAFT')
          ? 'MERGED-ENGINE with extra statute INA 214'
          : 'GROK-LEAD-ENGINE-DRAFT'
      if (url.includes('api.deepseek.com')) {
        return new Response(JSON.stringify({ choices: [{ message: { content: text }, finish_reason: 'stop' }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ output_text: text, status: 'completed' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as unknown as typeof fetch
  }

  it('runs both legs — Grok lead on api.x.ai + DeepSeek complement on api.deepseek.com with deepseek-flash', async () => {
    process.env.XAI_API_KEY = 'test-xai-key'
    process.env.DEEPSEEK_API_KEY = 'test-deepseek-key'
    const seen: Array<{ url: string; model?: string }> = []
    global.fetch = pairFetch(seen)

    const result = await generateEnginePairText({
      system: 'Score this cluster.',
      prompt: 'TOPIC: f1 visa',
    })

    expect(result.provider).toBe('grok')
    expect(result.text).toContain('MERGED-ENGINE')
    expect(result.pair?.leadModel).toContain('grok-4.6')
    expect(result.pair?.complementModel).toContain('deepseek-flash')
    expect(result.pair?.merged).toBe(true)

    const deepseekCalls = seen.filter((s) => s.url.includes('api.deepseek.com'))
    expect(deepseekCalls.length).toBeGreaterThan(0)
    expect(deepseekCalls.every((s) => s.url.startsWith('https://api.deepseek.com/v1/'))).toBe(true)
    expect(deepseekCalls.every((s) => s.model === 'deepseek-flash')).toBe(true)
    expect(seen.some((s) => s.url.includes('api.x.ai'))).toBe(true)
    // Retired hosts are never contacted.
    expect(seen.some((s) => s.url.includes('api.entrim.ai'))).toBe(false)
    expect(seen.some((s) => s.url.includes('api.runbios.ai'))).toBe(false)
    expect(seen.some((s) => s.url.includes('api.openai.com'))).toBe(false)
  })

  it('generateEngineText with no pin uses the pair — no retired host fires', async () => {
    process.env.XAI_API_KEY = 'test-xai-key'
    process.env.DEEPSEEK_API_KEY = 'test-deepseek-key'
    process.env.OPENAI_API_KEY = 'sk-should-not-be-called'
    process.env.RUNBIOS_API_KEY = 'test-runbios-key'
    const seen: Array<{ url: string; model?: string }> = []
    global.fetch = pairFetch(seen)

    const result = await generateEngineText({
      system: 'Summarize.',
      prompt: 'IRCC notice',
    })
    expect(result.text).toBeTruthy()
    expect(result.provider).toBe('grok')
    expect(seen.some((u) => u.url.includes('api.deepseek.com'))).toBe(true)
    expect(seen.some((u) => u.url.includes('api.x.ai'))).toBe(true)
    expect(seen.some((u) => u.url.includes('api.openai.com'))).toBe(false)
    expect(seen.some((u) => u.url.includes('api.runbios.ai'))).toBe(false)
    expect(seen.some((u) => u.url.includes('api.entrim.ai'))).toBe(false)
  })

  it('fails CLOSED without the DeepSeek key — the pair is not degraded to a Grok-only lead', async () => {
    process.env.XAI_API_KEY = 'test-xai-key'
    delete process.env.DEEPSEEK_API_KEY
    const seen: Array<{ url: string; model?: string }> = []
    global.fetch = pairFetch(seen)

    await expect(
      generateEnginePairText({
        system: 'Score this cluster.',
        prompt: 'TOPIC: f1 visa',
      }),
    ).rejects.toThrow(/Engine pair failed/)
    expect(seen.length).toBe(0)
    expect(seen.some((u) => u.url.includes('api.entrim.ai'))).toBe(false)
  })

  it('fails CLOSED without the Grok key — never complement-only output', async () => {
    delete process.env.XAI_API_KEY
    process.env.DEEPSEEK_API_KEY = 'test-deepseek-key'
    const seen: Array<{ url: string; model?: string }> = []
    global.fetch = pairFetch(seen)

    await expect(
      generateEnginePairText({
        system: 'Score this cluster.',
        prompt: 'TOPIC: f1 visa',
      }),
    ).rejects.toThrow(/Engine pair failed/)
    expect(seen.length).toBe(0)
  })

  it('an explicit DeepSeek pin runs a single exclusive leg — api.x.ai is never contacted', async () => {
    process.env.XAI_API_KEY = 'test-xai-key'
    process.env.DEEPSEEK_API_KEY = 'test-deepseek-key'
    const seen: Array<{ url: string; model?: string }> = []
    global.fetch = pairFetch(seen)

    const result = await generateEngineText({
      aiProvider: 'deepseek-v41-flash',
      system: 'Summarize.',
      prompt: 'IRCC notice',
    })

    expect(result.provider).toBe('deepseek-v41-flash')
    expect(result.text).toBe('DEEPSEEK-COMPLEMENT-ENGINE-DRAFT')
    expect(seen.every((s) => s.url.includes('api.deepseek.com'))).toBe(true)
    expect(seen.every((s) => s.model === 'deepseek-flash')).toBe(true)
    expect(seen.some((u) => u.url.includes('api.x.ai'))).toBe(false)
  })

  it('a failing explicit Grok leg fails closed — it never falls back to DeepSeek', async () => {
    process.env.XAI_API_KEY = 'test-xai-key'
    process.env.DEEPSEEK_API_KEY = 'test-deepseek-key'
    const seen: Array<{ url: string; model?: string }> = []
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      seen.push({ url: String(input) })
      return new Response(JSON.stringify({ error: { message: 'quota exhausted' } }), { status: 402 })
    }) as unknown as typeof fetch

    await expect(generateEngineText({
      aiProvider: 'grok',
      system: 'Summarize.',
      prompt: 'IRCC notice',
    })).rejects.toThrow()

    expect(seen.some((u) => u.url.includes('api.deepseek.com'))).toBe(false)
  })

  it('a legacy explicit pin rejects with zero outbound calls', async () => {
    process.env.XAI_API_KEY = 'test-xai-key'
    process.env.DEEPSEEK_API_KEY = 'test-deepseek-key'
    const fetchSpy = jest.fn(async () => {
      throw new Error('outbound provider request is forbidden for a legacy pin')
    })
    global.fetch = fetchSpy as unknown as typeof fetch

    let caught: unknown
    try {
      await generateEngineText({
        aiProvider: 'entrim-qwen-27b',
        system: 'Summarize.',
        prompt: 'IRCC notice',
      })
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(ProviderSelectionRequiredError)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('extractEngineJsonObject recovers fenced JSON and rejects prose', () => {
    expect(extractEngineJsonObject('```json\n{"summary":"ok"}\n```')).toEqual({ summary: 'ok' })
    expect(extractEngineJsonObject('no json here')).toBeNull()
  })
})
