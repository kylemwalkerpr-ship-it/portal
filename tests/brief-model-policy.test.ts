/**
 * Brief-model policy — LIVE POLICY (2026-09-02): the Research/Plan brief
 * offers EXACTLY three model families:
 *
 *   1. Entrim Qwen3.6 27B (`entrim-qwen-27b`) — the DEFAULT.
 *   2. Entrim DeepSeek V4 Flash (`entrim-deepseek`) — the fallback family.
 *   3. Grok 4.6 (`grok`) — xAI / SuperGrok, the third live brief family.
 *
 * Regression lock:
 *
 *  1. resolveBriefAiProvider keeps the three live pins and coerces EVERY
 *     other value — 'auto', stale drafting ids, retired pins (Claude, GLM,
 *     MiniMax, GPT, Run BiOS/Baseten DeepSeek) — to the Entrim Qwen default.
 *  2. exclusive: true means the brief can never cascade to a non-chosen
 *     backend: if the pinned provider fails, the call throws the
 *     explicit-provider error instead of returning prose drafted by another.
 *  3. The fallback leg is the Entrim family — a Grok owner falls back to the
 *     Entrim default, never to a second Grok leg.
 */
jest.mock('@/lib/aiKeyVault', () => ({
  buildVaultEnvOverrides: jest.fn(async () => ({})),
  getAiSettings: jest.fn(async () => ({})),
  setAiSetting: jest.fn(async () => undefined),
  deleteAiSetting: jest.fn(async () => undefined),
}))

import {
  resolveBriefAiProvider,
  resolveBriefFallback,
  BRIEF_FALLBACK_PROVIDER,
  generateBriefText,
} from '@/lib/seoFactory/briefModel'
import { generateContentText, generateContentTextStream } from '@/lib/contentAiProvider'

describe('resolveBriefAiProvider — brief model policy (three live families)', () => {
  it('empty / auto / default / stale pins coerce to Entrim Qwen3.6 27B', () => {
    expect(resolveBriefAiProvider('')).toEqual({ aiProvider: 'entrim-qwen-27b' })
    for (const raw of ['auto', 'default', 'primary', 'gpt-5.6-terra', 'gpt-5.6-sol', 'gpt-5.6', 'gpt-5.6-luna', 'openai', 'nvidia-minimax', 'minimax', 'nvidia-glm', 'zai-glm', 'baseten-glm-fast', 'glm-5.2-fast', 'aihubmix-glm-fast', 'glm-fast-aihubmix', 'parasail', 'parasail-deepseek', 'parasail-deepseek-pro', 'parasail-glm', 'nvidia-deepseek', 'deepseek-pro', 'deepseek-flash', 'baseten-deepseek-pro', 'baseten-glm-53-flash', 'runbios-glm-53-flash', 'glm-5.3-flash', 'glm-5.3', 'claude-sonnet-5', 'runbios-claude-sonnet', 'runbios-glm-52', 'nvidia-nemotron', 'cloudflare-ai', 'bios-adaptive', 'runbios-kimi', 'runbios-qwen']) {
      expect({ raw, resolved: resolveBriefAiProvider(raw) }).toEqual({
        raw,
        resolved: { aiProvider: 'entrim-qwen-27b' },
      })
    }
  })

  it('retired premium pins coerce to the Entrim Qwen default (Claude / Run BiOS / Baseten DeepSeek)', () => {
    // Claude Opus 5 via Run BiOS — out of commission.
    expect(resolveBriefAiProvider('runbios-claude-opus')).toEqual({ aiProvider: 'entrim-qwen-27b' })
    expect(resolveBriefAiProvider('claude-opus-5')).toEqual({ aiProvider: 'entrim-qwen-27b' })
    // Run BiOS / Baseten DeepSeek hosts — out of commission.
    expect(resolveBriefAiProvider('runbios-deepseek-flash')).toEqual({ aiProvider: 'entrim-qwen-27b' })
    expect(resolveBriefAiProvider('deepseek-ai/deepseek-v4-flash')).toEqual({ aiProvider: 'entrim-qwen-27b' })
    expect(resolveBriefAiProvider('baseten-deepseek')).toEqual({ aiProvider: 'entrim-qwen-27b' })
    expect(resolveBriefAiProvider('deepseek-v4-flash')).toEqual({ aiProvider: 'entrim-qwen-27b' })
  })

  it('Entrim Qwen3.6 27B is the default brief family (never coerced)', () => {
    expect(resolveBriefAiProvider('entrim-qwen-27b')).toEqual({ aiProvider: 'entrim-qwen-27b' })
    expect(resolveBriefAiProvider('qwen3.6-27b')).toEqual({ aiProvider: 'entrim-qwen-27b' })
    expect(resolveBriefAiProvider('qwen')).toEqual({ aiProvider: 'entrim-qwen-27b' })
    expect(resolveBriefAiProvider('ENTRIM-QWEN-27B')).toEqual({ aiProvider: 'entrim-qwen-27b' })
  })

  it('Entrim DeepSeek V4 Flash is a live brief family (never coerced)', () => {
    expect(resolveBriefAiProvider('entrim-deepseek')).toEqual({ aiProvider: 'entrim-deepseek' })
    expect(resolveBriefAiProvider('ENTRIM-DEEPSEEK')).toEqual({ aiProvider: 'entrim-deepseek' })
  })

  it('Grok 4.6 is a live brief family (never coerced)', () => {
    expect(resolveBriefAiProvider('grok')).toEqual({ aiProvider: 'grok' })
    expect(resolveBriefAiProvider('grok-4.6')).toEqual({ aiProvider: 'grok' })
    expect(resolveBriefAiProvider('xai')).toEqual({ aiProvider: 'grok' })
    expect(resolveBriefAiProvider('supergrok')).toEqual({ aiProvider: 'grok' })
  })

  it('the brief fallback leg is an Entrim family — never Grok', () => {
    expect(resolveBriefFallback()).toEqual({ aiProvider: 'entrim-deepseek' })
    expect(BRIEF_FALLBACK_PROVIDER).toBe('entrim-deepseek')
  })
})

describe('generateBriefText — live resilience (Qwen / DeepSeek / Grok owners)', () => {
  const envKeys = ['OPENAI_API_KEY', 'XAI_API_KEY', 'BASETEN_API_KEY', 'NVIDIA_API_KEY', 'ENTRIM_API_KEY', 'CONTENT_AI_RETRY'] as const
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

  const json = (payload: unknown) =>
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })

  it('primary path: Entrim Qwen success returns fallbackUsed=false', async () => {
    process.env.ENTRIM_API_KEY = 'test-entrim-key'
    process.env.CONTENT_AI_RETRY = '1'

    const bodies: Array<Record<string, unknown>> = []
    global.fetch = jest.fn(async (_input, init) => {
      try { bodies.push(JSON.parse(String(init?.body || '{}')) as Record<string, unknown>) } catch { /* ignore */ }
      return json({ choices: [{ message: { content: 'QWEN-BRIEF' }, finish_reason: 'stop' }] })
    }) as typeof fetch

    const result = await generateBriefText({
      aiProvider: 'entrim-qwen-27b',
      system: 'You are the brief architect.',
      prompt: 'TOPIC: dependent visa uk',
    })

    expect(result.fallbackUsed).toBe(false)
    expect(result.ai.provider).toBe('entrim-qwen-27b')
    expect(result.ai.text).toBe('QWEN-BRIEF')
    expect(bodies.some((b) => b.model === 'Qwen/Qwen3.6-27B')).toBe(true)
  })

  it('primary path: Grok owner briefs on grok exclusively (never Qwen)', async () => {
    process.env.ENTRIM_API_KEY = 'test-entrim-key'
    process.env.XAI_API_KEY = 'test-xai-key'
    process.env.CONTENT_AI_RETRY = '1'

    const urls: string[] = []
    const bodies: Array<Record<string, unknown>> = []
    global.fetch = jest.fn(async (input, init) => {
      urls.push(String(input))
      try { bodies.push(JSON.parse(String(init?.body || '{}')) as Record<string, unknown>) } catch { /* ignore */ }
      return json({ output_text: 'GROK-BRIEF', status: 'completed' })
    }) as typeof fetch

    const result = await generateBriefText({
      aiProvider: 'grok',
      system: 'You are the brief architect.',
      prompt: 'TOPIC: dependent visa uk',
    })

    expect(result.fallbackUsed).toBe(false)
    expect(result.ai.provider).toBe('grok')
    expect(result.ai.text).toBe('GROK-BRIEF')
    // Only api.x.ai was contacted — the Entrim owner was never invoked.
    expect(urls.some((u) => u.includes('api.x.ai'))).toBe(true)
    expect(urls.some((u) => u.includes('api.entrim.ai'))).toBe(false)
  })

  it('a retired primary pin (gpt-5.6-terra) routes to the Entrim Qwen primary', async () => {
    process.env.ENTRIM_API_KEY = 'test-entrim-key'
    process.env.CONTENT_AI_RETRY = '1'

    const urls: string[] = []
    global.fetch = jest.fn(async (input) => {
      urls.push(String(input))
      return json({ choices: [{ message: { content: 'QWEN-AFTER-STALE-PIN' }, finish_reason: 'stop' }] })
    }) as typeof fetch

    const result = await generateBriefText({
      aiProvider: 'gpt-5.6-terra',
      system: 'You are the brief architect.',
      prompt: 'TOPIC: dependent visa uk',
    })

    expect(result.fallbackUsed).toBe(false)
    expect(result.ai.provider).toBe('entrim-qwen-27b')
    expect(urls.some((u) => u.includes('api.entrim.ai'))).toBe(true)
    expect(urls.some((u) => u.includes('api.openai.com'))).toBe(false)
  })

  it('fallback path: Grok failure falls back to Entrim Qwen (same live set)', async () => {
    process.env.ENTRIM_API_KEY = 'test-entrim-key'
    process.env.XAI_API_KEY = 'test-xai-key'
    process.env.CONTENT_AI_RETRY = '1'

    const urls: string[] = []
    global.fetch = jest.fn(async (input, init) => {
      const url = String(input)
      urls.push(url)
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) as { model?: string } : {}
      if (url.includes('api.x.ai')) {
        throw new Error('grok 429 rate limit')
      }
      return json({ choices: [{ message: { content: 'QWEN-ENTRIM-BRIEF' }, finish_reason: 'stop' }] })
    }) as typeof fetch

    const result = await generateBriefText({
      aiProvider: 'grok',
      system: 'You are the brief architect.',
      prompt: 'TOPIC: dependent visa uk',
    })

    expect(result.fallbackUsed).toBe(true)
    expect(result.ai.provider).toBe('entrim-qwen-27b')
    expect(result.ai.text).toBe('QWEN-ENTRIM-BRIEF')
  })

  it('fallback path: Qwen failure falls back to Entrim DeepSeek (same vault key)', async () => {
    process.env.ENTRIM_API_KEY = 'test-entrim-key'
    process.env.XAI_API_KEY = 'test-xai-key' // must NEVER be contacted
    process.env.CONTENT_AI_RETRY = '1'

    const urls: string[] = []
    global.fetch = jest.fn(async (input, init) => {
      const url = String(input)
      urls.push(url)
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) as { model?: string } : {}
      if (url.includes('api.entrim.ai') && body.model === 'Qwen/Qwen3.6-27B') {
        throw new Error('entrim 524 upstream gateway timeout')
      }
      return json({ choices: [{ message: { content: 'DEEPSEEK-ENTRIM-BRIEF' }, finish_reason: 'stop' }] })
    }) as typeof fetch

    const result = await generateBriefText({
      aiProvider: 'entrim-qwen-27b',
      system: 'You are the brief architect.',
      prompt: 'TOPIC: dependent visa uk',
    })

    expect(result.fallbackUsed).toBe(true)
    expect(result.ai.provider).toBe('entrim-deepseek')
    expect(result.ai.text).toBe('DEEPSEEK-ENTRIM-BRIEF')
    expect(urls.some((u) => u.includes('api.x.ai'))).toBe(false)
  })

  it('DeepSeek-primary with no second leg: combined error names the primary reason', async () => {
    process.env.ENTRIM_API_KEY = 'test-entrim-key'
    process.env.CONTENT_AI_RETRY = '1'

    global.fetch = jest.fn(async () => {
      throw new Error('entrim 524 upstream gateway timeout')
    }) as typeof fetch

    await expect(
      generateBriefText({
        aiProvider: 'entrim-deepseek',
        system: 'You are the brief architect.',
        prompt: 'TOPIC: dependent visa uk',
      }),
    ).rejects.toThrow(/Brief generation failed \(DeepSeek V4 Flash on Entrim\)[\s\S]*524/)
  })

  it('both Entrim families fail: combined error names the primary and the fallback leg', async () => {
    process.env.ENTRIM_API_KEY = 'test-entrim-key'
    process.env.XAI_API_KEY = 'test-xai-key' // must NEVER be contacted
    process.env.CONTENT_AI_RETRY = '1'

    global.fetch = jest.fn(async (_input, init) => {
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) as { model?: string } : {}
      if (body.model === 'Qwen/Qwen3.6-27B') {
        throw new Error('entrim 524 upstream gateway timeout')
      }
      throw new Error('entrim 429 service overloaded')
    }) as typeof fetch

    await expect(
      generateBriefText({
        aiProvider: 'entrim-qwen-27b',
        system: 'You are the brief architect.',
        prompt: 'TOPIC: dependent visa uk',
      }),
    ).rejects.toThrow(/Brief generation failed[\s\S]*Primary \(Qwen3\.6 27B \(Entrim\)\)[\s\S]*Fallback \(DeepSeek V4 Flash \(Entrim\)\)/)
  })
})

describe('exclusive pin — the brief never cascades to a non-chosen backend', () => {
  const envKeys = ['OPENAI_API_KEY', 'OPENAI_MODEL', 'BASETEN_API_KEY', 'NVIDIA_API_KEY', 'ENTRIM_API_KEY', 'CONTENT_AI_RETRY'] as const
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

  const json = (payload: unknown) =>
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })

  it('complete path: unconfigured Entrim with an exclusive retired pin throws the live-policy error — no silent auto-pick', async () => {
    // No ENTRIM_API_KEY. A retired pin (gpt-5.6-terra) must not silently
    // draft on any decommissioned backend that happens to have a local key.
    process.env.BASETEN_API_KEY = 'test-baseten-key'
    process.env.NVIDIA_API_KEY = 'test-nvidia-key'

    global.fetch = jest.fn(async () =>
      json({ choices: [{ message: { content: 'SHOULD-NEVER-HAPPEN' }, finish_reason: 'stop' }] }),
    ) as typeof fetch

    await expect(
      generateContentText({
        aiProvider: 'gpt-5.6-terra',
        system: 'You are the brief architect.',
        prompt: 'TOPIC: dependent visa uk',
        exclusive: true,
      }),
    ).rejects.toThrow(/No live content AI provider configured|ENTRIM_API_KEY/i)

    // Zero upstream calls — nothing outside the live policy executed.
    expect(global.fetch).toHaveBeenCalledTimes(0)
  })

  it('stream path: Entrim DeepSeek is the only provider attempted with an exclusive entrim-deepseek pin', async () => {
    process.env.ENTRIM_API_KEY = 'test-entrim-key'
    process.env.BASETEN_API_KEY = 'test-baseten-key'
    process.env.NVIDIA_API_KEY = 'test-nvidia-key'

    const urls: string[] = []
    global.fetch = jest.fn(async (input) => {
      const url = String(input)
      urls.push(url)
      if (url.includes('api.entrim.ai')) {
        throw new Error('entrim stream down')
      }
      return new Response('data: [DONE]\n\n', {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      })
    }) as typeof fetch

    const events: Array<{ type: string; provider?: string; model?: string; text?: string }> = []
    await expect(async () => {
      for await (const ev of generateContentTextStream({
        aiProvider: 'entrim-deepseek',
        system: 'You are the brief architect.',
        prompt: 'TOPIC: dependent visa uk',
        exclusive: true,
      })) {
        events.push(ev as { type: string; provider?: string; model?: string; text?: string })
      }
    }).rejects.toThrow(/entrim|explicit/i)

    // Only Entrim was contacted — the cascade never reached baseten/nvidia.
    expect(urls.filter((u) => !u.includes('api.entrim.ai')).length).toBe(0)
    expect(urls.some((u) => u.includes('api.entrim.ai'))).toBe(true)
  })
})
