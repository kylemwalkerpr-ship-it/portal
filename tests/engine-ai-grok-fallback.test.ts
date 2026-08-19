/**
 * Master Engine / Discover helper: OpenAI primary, Grok fallback.
 */

jest.mock('@/lib/aiKeyVault', () => ({
  buildVaultEnvOverrides: jest.fn(async () => ({})),
  getAiSettings: jest.fn(async () => ({})),
  setAiSetting: jest.fn(async () => undefined),
  deleteAiSetting: jest.fn(async () => undefined),
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

describe('generateEngineText — Grok is the default engine fallback', () => {
  const envKeys = ['OPENAI_API_KEY', 'XAI_API_KEY', 'CONTENT_AI_RETRY'] as const
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

  it('exports grok as the engine fallback', () => {
    expect(ENGINE_FALLBACK_PROVIDER).toBe('grok')
  })

  it('skips OpenAI and pins Grok when no OPENAI_API_KEY is present', () => {
    delete process.env.OPENAI_API_KEY
    process.env.XAI_API_KEY = 'test-xai-key'
    expect(resolveEngineAiProvider('openai')).toBe('grok')
    process.env.OPENAI_API_KEY = 'sk-test'
    expect(resolveEngineAiProvider('openai')).toBe('openai')
  })

  it('falls back to Grok when the OpenAI primary fails', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key'
    process.env.XAI_API_KEY = 'test-xai-key'
    process.env.CONTENT_AI_RETRY = '1'

    global.fetch = jest.fn(async (input) => {
      const url = String(input)
      if (url.includes('api.openai.com')) throw new Error('openai 429 insufficient_quota')
      return new Response(
        JSON.stringify({ choices: [{ message: { content: 'GROK-ENGINE' }, finish_reason: 'stop' }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }) as typeof fetch

    const result = await generateEngineText({
      aiProvider: 'openai',
      system: 'You summarize immigration policy.',
      prompt: 'Summarize this IRCC notice.',
    })
    expect(result.provider).toBe('grok')
    expect(result.text).toBe('GROK-ENGINE')
  })
})

describe('Master Engine pair — Grok 4.6 high + Parasail GLM 5.2 medium', () => {
  const envKeys = ['XAI_API_KEY', 'PARASAIL_API_KEY', 'CONTENT_AI_RETRY'] as const
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

  it('defaults an empty pin to the engine pair when Grok or Parasail is configured', () => {
    process.env.XAI_API_KEY = 'test-xai-key'
    expect(resolveEngineAiProvider()).toBe(ENGINE_PAIR)
    expect(resolveEngineAiProvider('auto')).toBe(ENGINE_PAIR)
  })

  it('runs Grok high + GLM medium in parallel and returns a Grok-led merge', async () => {
    process.env.XAI_API_KEY = 'test-xai-key'
    process.env.PARASAIL_API_KEY = 'psk-test'
    process.env.CONTENT_AI_RETRY = '1'

    const seen: Array<{ url: string; effort?: string; model?: string }> = []
    global.fetch = jest.fn(async (input, init) => {
      const url = String(input)
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : {}
      const reasoning = body.reasoning as { effort?: string } | undefined
      seen.push({
        url,
        effort: reasoning?.effort || (body.reasoning_effort as string | undefined),
        model: body.model as string | undefined,
      })
      const text = url.includes('api.x.ai')
        ? (String(body.prompt || body.input || '').includes('GLM 5.2 DRAFT') ? 'MERGED-ENGINE' : 'GROK-LEAD-ENGINE-DRAFT')
        : 'GLM-COMPLEMENT-ENGINE-DRAFT with extra statute INA 214'
      if (url.includes('api.x.ai')) {
        return new Response(JSON.stringify({ output_text: text, status: 'completed' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      return new Response(
        JSON.stringify({ choices: [{ message: { content: text }, finish_reason: 'stop' }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }) as typeof fetch

    const result = await generateEnginePairText({
      system: 'Score this cluster.',
      prompt: 'TOPIC: f1 visa',
    })
    expect(result.provider).toBe('grok')
    expect(result.text).toMatch(/MERGED-ENGINE|GROK-LEAD/)
    expect(seen.some((s) => s.url.includes('api.x.ai') && s.effort === 'high')).toBe(true)
    expect(seen.some((s) => s.url.includes('parasail.io') && (s.effort === 'medium' || s.model === 'z-ai/glm-5.2'))).toBe(true)
    expect(result.pair?.disagreed).toBe(true)
  })

  it('generateEngineText with no pin uses the pair (not OpenAI) when Grok + Parasail are set', async () => {
    process.env.XAI_API_KEY = 'test-xai-key'
    process.env.PARASAIL_API_KEY = 'psk-test'
    process.env.OPENAI_API_KEY = 'sk-should-not-be-called'
    process.env.CONTENT_AI_RETRY = '1'
    const urls: string[] = []
    global.fetch = jest.fn(async (input) => {
      const url = String(input)
      urls.push(url)
      if (url.includes('api.x.ai')) {
        return new Response(JSON.stringify({ output_text: 'PAIR-LEAD', status: 'completed' }), {
          status: 200, headers: { 'content-type': 'application/json' },
        })
      }
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
    expect(urls.some((u) => u.includes('api.x.ai'))).toBe(true)
    expect(urls.some((u) => u.includes('parasail.io'))).toBe(true)
  })

  it('extractEngineJsonObject recovers fenced JSON and rejects prose', () => {
    expect(extractEngineJsonObject('```json\n{"summary":"ok"}\n```')).toEqual({ summary: 'ok' })
    expect(extractEngineJsonObject('no json here')).toBeNull()
  })
})
