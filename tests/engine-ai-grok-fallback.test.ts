/**
 * Discover / Master Engine AI harmonization: the deterministic SEO engine
 * stays authoritative; Claude Opus 5 via Run BiOS is the lead harmonizer and
 * Grok (xAI) is the bounded paired complement + fallback. No other model
 * silently joins the pair.
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

describe('Master Engine pair — Entrim Qwen lead + Entrim DeepSeek complement; Grok single-lead legacy (Claude out of commission)', () => {
  const envKeys = ['XAI_API_KEY', 'PARASAIL_API_KEY', 'RUNBIOS_API_KEY', 'CONTENT_AI_RETRY', 'XAI_BASE_URL'] as const
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

  it('defaults an empty pin to the engine pair when Run BiOS or Grok is configured', () => {
    process.env.XAI_API_KEY = 'test-xai-key'
    expect(resolveEngineAiProvider()).toBe(ENGINE_PAIR)
    expect(resolveEngineAiProvider('auto')).toBe(ENGINE_PAIR)
    expect(resolveEngineAiProvider('engine-pair')).toBe(ENGINE_PAIR)
  })

  it('runs the pair lead and merges — Entrim Qwen lead with Entrim DeepSeek complement (Claude out of commission)', async () => {
    process.env.RUNBIOS_API_KEY = 'test-runbios-key'
    process.env.XAI_API_KEY = 'test-xai-key'
    process.env.CONTENT_AI_RETRY = '1'

    const seen: Array<{ url: string; model?: string }> = []
    global.fetch = jest.fn(async (input, init) => {
      const url = String(input)
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : {}
      seen.push({ url, model: (body.model as string | undefined) || (body as { input?: string }).input as string | undefined })
      const prompt = JSON.stringify(body)
      // Graduated pair: Entrim lead when the vault carries ENTRIM_API_KEY;
      // legacy vaults degrade to a single Grok lead (never Run BiOS Claude).
      const text = url.includes('api.entrim.ai')
        ? (prompt.includes('COMPLEMENT DRAFT') ? 'MERGED-ENGINE' : 'RUNBIOS-OPUS-LEAD-ENGINE-DRAFT')
        : 'GROK-COMPLEMENT-ENGINE-DRAFT with extra statute INA 214'
      if (url.includes('api.x.ai')) {
        return new Response(JSON.stringify({ output_text: text, status: 'completed' }), {
          status: 200, headers: { 'content-type': 'application/json' },
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
    // With the vault hydrated (dev DB carries ENTRIM) the lead is Qwen; on a
    // bare env (no entrim) the pair degrades to the Grok lead. Never Claude.
    expect(['entrim-qwen-27b', 'grok']).toContain(result.provider)
    expect(result.text).toMatch(/MERGED-ENGINE|RUNBIOS-OPUS-LEAD|GROK-COMPLEMENT/)
    expect(seen.some((s) => s.url.includes('api.entrim.ai') || s.url.includes('api.x.ai'))).toBe(true)
    // The complement leg runs on a distinct host from the lead (Entrim
    // DeepSeek for the graduated pair; none for the grok-only legacy case).
    expect(seen.some((s) => s.url.includes('parasail.io'))).toBe(false)
    expect(['runbios.ai', 'entrim.ai'].some((h) => seen.some((s) => s.url.includes(h))) || result.provider === 'grok').toBe(true)
    expect(result.pair?.merged || result.pair?.leadOnly).toBe(true)
  })

  it('generateEngineText with no pin uses the pair (not OpenAI) when Entrim or Grok are set — Claude never fires', async () => {
    process.env.RUNBIOS_API_KEY = 'test-runbios-key'
    process.env.XAI_API_KEY = 'test-xai-key'
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
    expect(urls.some((u) => u.includes('api.runbios.ai'))).toBe(false) // Claude out of commission
    // Graduated pair: Entrim (Qwen + DeepSeek) when the key is present; a
    // bare env degrades to the Grok lead. Either way Qwen/Grok carry it.
    expect(urls.some((u) => u.includes('api.entrim.ai')) || urls.some((u) => u.includes('api.x.ai'))).toBe(true)
  })

  it('runs lead-only when Grok is not configured — complement leg never fired', async () => {
    process.env.RUNBIOS_API_KEY = 'test-runbios-key'
    delete process.env.XAI_API_KEY
    delete process.env.ENTRIM_API_KEY
    process.env.CONTENT_AI_RETRY = '1'

    const urls: string[] = []
    global.fetch = jest.fn(async (input) => {
      const url = String(input)
      urls.push(url)
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: 'RUNBIOS-LEAD-ONLY-DRAFT' }, finish_reason: 'stop' }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }) as typeof fetch

    // Claude Opus is out of commission: with ONLY a Run BiOS key (no Entrim,
    // no Grok) the pair cannot run — it must fail CLOSED with a clear reason
    // instead of firing a dead Run BiOS Claude leg.
    await expect(
      generateEnginePairText({
        system: 'Score this cluster.',
        prompt: 'TOPIC: f1 visa',
      }),
    ).rejects.toThrow(/Engine pair failed/)
    // The Run BiOS (Claude) host is never contacted.
    expect(urls.some((u) => u.includes('api.runbios.ai'))).toBe(false)
  })

  it('Grok single-lead legacy: without Entrim, the pair degrades to a Grok lead (never Claude)', async () => {
    delete process.env.RUNBIOS_API_KEY
    delete process.env.ENTRIM_API_KEY
    process.env.XAI_API_KEY = 'test-xai-key'
    process.env.CONTENT_AI_RETRY = '1'

    const urls: string[] = []
    global.fetch = jest.fn(async (input) => {
      const url = String(input)
      urls.push(url)
      return new Response(
        JSON.stringify({ output_text: 'GROK-LEAD-ONLY', status: 'completed' }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }) as typeof fetch

    const result = await generateEnginePairText({
      system: 'Score this cluster.',
      prompt: 'TOPIC: f1 visa',
    })
    expect(result.text).toBe('GROK-LEAD-ONLY')
    expect(result.provider).toBe('grok')
    expect(result.pair?.leadOnly).toBe(true)
    expect(urls.some((u) => u.includes('api.runbios.ai'))).toBe(false)
    expect(urls.some((u) => u.includes('api.x.ai'))).toBe(true)
  })

  it('extractEngineJsonObject recovers fenced JSON and rejects prose', () => {
    expect(extractEngineJsonObject('```json\n{"summary":"ok"}\n```')).toEqual({ summary: 'ok' })
    expect(extractEngineJsonObject('no json here')).toBeNull()
  })
})
