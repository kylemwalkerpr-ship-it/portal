/**
 * Brief-model policy — the Research/Plan brief offers EXACTLY three model
 * families on four pins: Claude Opus 5 (Run BiOS, DEFAULT), Grok (xAI /
 * SuperGrok), and DeepSeek V4 Flash (Run BiOS + Baseten).
 *
 * Regression lock:
 *
 *  1. resolveBriefAiProvider maps each accepted brief pin to its provider,
 *     and coerces EVERY other value — 'auto', stale drafting ids, removed
 *     choices — to the Claude Opus 5 default (runbios-claude-opus).
 *  2. exclusive: true means the brief can never cascade to a non-chosen
 *     backend: if the pinned provider fails, the call throws the
 *     explicit-provider error instead of returning prose drafted by another.
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

describe('resolveBriefAiProvider — brief model policy (Claude Opus 5 + Grok + DeepSeek V4 Flash)', () => {
  it('empty / auto / default / stale pins coerce to Claude Opus 5 via Run BiOS', () => {
    expect(resolveBriefAiProvider('')).toEqual({ aiProvider: 'runbios-claude-opus' })
    for (const raw of ['auto', 'default', 'primary', 'gpt-5.6-terra', 'gpt-5.6-sol', 'gpt-5.6', 'gpt-5.6-luna', 'openai', 'nvidia-minimax', 'minimax', 'nvidia-glm', 'zai-glm', 'baseten-glm-fast', 'glm-5.2-fast', 'aihubmix-glm-fast', 'glm-fast-aihubmix', 'parasail', 'parasail-deepseek', 'parasail-deepseek-pro', 'parasail-glm', 'nvidia-deepseek', 'deepseek-pro', 'deepseek-flash', 'baseten-deepseek-pro', 'baseten-glm-53-flash', 'runbios-glm-53-flash', 'glm-5.3-flash', 'glm-5.3', 'claude-sonnet-5', 'runbios-claude-sonnet', 'runbios-glm-52', 'nvidia-nemotron', 'cloudflare-ai', 'bios-adaptive', 'runbios-kimi', 'runbios-qwen']) {
      expect({ raw, resolved: resolveBriefAiProvider(raw) }).toEqual({
        raw,
        resolved: { aiProvider: 'runbios-claude-opus' },
      })
    }
  })

  it('runbios-claude-opus is the explicit Claude Opus 5 pin', () => {
    expect(resolveBriefAiProvider('runbios-claude-opus')).toEqual({ aiProvider: 'runbios-claude-opus' })
    expect(resolveBriefAiProvider('claude-opus-5')).toEqual({ aiProvider: 'runbios-claude-opus' })
    // Case-insensitive
    expect(resolveBriefAiProvider('RUNBIOS-CLAUDE-OPUS')).toEqual({ aiProvider: 'runbios-claude-opus' })
  })

  it('grok / xai / supergrok / grok-4.6 → Grok fallback provider', () => {
    expect(resolveBriefAiProvider('grok')).toEqual({ aiProvider: 'grok' })
    expect(resolveBriefAiProvider('xai')).toEqual({ aiProvider: 'grok' })
    expect(resolveBriefAiProvider('supergrok')).toEqual({ aiProvider: 'grok' })
    expect(resolveBriefAiProvider('grok-4.6')).toEqual({ aiProvider: 'grok' })
  })

  it('DeepSeek V4 Flash is offered on both Run BiOS and Baseten', () => {
    expect(resolveBriefAiProvider('runbios-deepseek-flash')).toEqual({ aiProvider: 'runbios-deepseek-flash' })
    expect(resolveBriefAiProvider('deepseek-ai/deepseek-v4-flash')).toEqual({ aiProvider: 'runbios-deepseek-flash' })
    expect(resolveBriefAiProvider('baseten-deepseek')).toEqual({ aiProvider: 'baseten-deepseek' })
    expect(resolveBriefAiProvider('deepseek-v4-flash')).toEqual({ aiProvider: 'baseten-deepseek' })
    expect(resolveBriefAiProvider('deepseek-ai/deepseek-v4-flash-0731')).toEqual({ aiProvider: 'baseten-deepseek' })
    expect(resolveBriefAiProvider('BASETEN-DEEPSEEK')).toEqual({ aiProvider: 'baseten-deepseek' })
  })
})

describe('generateBriefText fallback — Grok (SuperGrok) when the primary fails', () => {
  const envKeys = ['OPENAI_API_KEY', 'OPENAI_MODEL', 'XAI_API_KEY', 'BASETEN_API_KEY', 'NVIDIA_API_KEY', 'RUNBIOS_API_KEY', 'CONTENT_AI_RETRY'] as const
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

  it('resolves the fallback to grok (SuperGrok)', () => {
    expect(resolveBriefFallback()).toEqual({ aiProvider: 'grok' })
    expect(BRIEF_FALLBACK_PROVIDER).toBe('grok')
  })

  it('primary path: OpenAI success returns fallbackUsed=false', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key'
    process.env.BASETEN_API_KEY = 'test-baseten-key'
    process.env.CONTENT_AI_RETRY = '1'

    global.fetch = jest.fn(async () =>
      json({ choices: [{ message: { content: 'GPT-BRIEF' }, finish_reason: 'stop' }] }),
    ) as typeof fetch

    const result = await generateBriefText({
      aiProvider: 'openai',
      model: 'gpt-5.6-terra',
      system: 'You are the brief architect.',
      prompt: 'TOPIC: dependent visa uk',
    })

    expect(result.fallbackUsed).toBe(false)
    expect(result.ai.provider).toBe('openai')
    expect(result.ai.text).toBe('GPT-BRIEF')
  })

  it('fallback path: OpenAI failure (unpaid/quota) falls back to Grok', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key'
    process.env.XAI_API_KEY = 'test-xai-key'
    process.env.CONTENT_AI_RETRY = '1'

    const urls: string[] = []
    global.fetch = jest.fn(async (input) => {
      const url = String(input)
      urls.push(url)
      if (url.includes('api.openai.com')) {
        throw new Error('openai 429 insufficient_quota')
      }
      return json({ choices: [{ message: { content: 'GROK-FALLBACK-BRIEF' }, finish_reason: 'stop' }] })
    }) as typeof fetch

    const result = await generateBriefText({
      aiProvider: 'openai',
      model: 'gpt-5.6-terra',
      system: 'You are the brief architect.',
      prompt: 'TOPIC: dependent visa uk',
    })

    expect(result.fallbackUsed).toBe(true)
    expect(result.ai.provider).toBe('grok')
    expect(result.ai.text).toBe('GROK-FALLBACK-BRIEF')
    expect(urls.some((u) => u.includes('api.openai.com'))).toBe(true)
    expect(urls.some((u) => u.includes('api.x.ai'))).toBe(true)
  })

  it('explicit GLM 5.2 Fast primary succeeds with fallbackUsed=false', async () => {
    process.env.BASETEN_API_KEY = 'test-baseten-key'
    process.env.CONTENT_AI_RETRY = '1'

    const urls: string[] = []
    global.fetch = jest.fn(async (input) => {
      const url = String(input)
      urls.push(url)
      return json({ choices: [{ message: { content: 'GLM-CHOSEN-BRIEF' }, finish_reason: 'stop' }] })
    }) as typeof fetch

    const result = await generateBriefText({
      aiProvider: 'baseten-glm-fast',
      system: 'You are the brief architect.',
      prompt: 'TOPIC: dependent visa uk',
    })

    // An explicit GLM selection is the PRIMARY leg, not a fallback.
    expect(result.fallbackUsed).toBe(false)
    expect(result.ai.provider).toBe('baseten-glm-fast')
    expect(result.ai.text).toBe('GLM-CHOSEN-BRIEF')
    // Only Baseten was contacted — OpenAI was never tried.
    expect(urls.some((u) => u.includes('inference.baseten.co'))).toBe(true)
    expect(urls.some((u) => u.includes('api.openai.com'))).toBe(false)
  })

  it('both-fail path: combined error names the primary and Grok reasons', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key'
    process.env.XAI_API_KEY = 'test-xai-key'
    process.env.CONTENT_AI_RETRY = '1'

    global.fetch = jest.fn(async (input) => {
      const url = String(input)
      if (url.includes('api.openai.com')) throw new Error('openai 429 insufficient_quota')
      throw new Error('grok 403 subscription not entitled')
    }) as typeof fetch

    await expect(
      generateBriefText({
        aiProvider: 'openai',
        model: 'gpt-5.6-terra',
        system: 'You are the brief architect.',
        prompt: 'TOPIC: dependent visa uk',
      }),
    ).rejects.toThrow(/Brief generation failed[\s\S]*Primary \(Claude Opus 5 \(Run BiOS\)\)[\s\S]*Fallback \(Grok\)/)
  })

  it('Run BiOS Claude Opus primary success returns fallbackUsed=false', async () => {
    process.env.RUNBIOS_API_KEY = 'test-runbios-key'
    process.env.XAI_API_KEY = 'test-xai-key'
    process.env.CONTENT_AI_RETRY = '1'

    const urls: string[] = []
    const bodies: Array<Record<string, unknown>> = []
    global.fetch = jest.fn(async (input, init) => {
      const url = String(input)
      urls.push(url)
      try { bodies.push(JSON.parse(String((init as RequestInit | undefined)?.body || '{}'))) } catch { /* ignore */ }
      return json({ choices: [{ message: { content: 'RUNBIOS-OPUS-BRIEF' }, finish_reason: 'stop' }] })
    }) as typeof fetch

    const result = await generateBriefText({
      aiProvider: 'runbios-claude-opus',
      system: 'You are the brief architect.',
      prompt: 'TOPIC: dependent visa uk',
    })

    expect(result.fallbackUsed).toBe(false)
    expect(result.ai.provider).toBe('runbios-claude-opus')
    expect(result.ai.text).toBe('RUNBIOS-OPUS-BRIEF')
    expect(urls.some((u) => u.includes('api.runbios.ai'))).toBe(true)
    expect(urls.some((u) => u.includes('api.x.ai'))).toBe(false)
    // The exact selected slot's API model id was sent — never the pin.
    expect(bodies.some((b) => b.model === 'claude-opus-5')).toBe(true)
  })

  it('Run BiOS Claude Opus primary hard failure still falls back to Grok', async () => {
    process.env.RUNBIOS_API_KEY = 'test-runbios-key'
    process.env.XAI_API_KEY = 'test-xai-key'
    process.env.CONTENT_AI_RETRY = '1'

    const urls: string[] = []
    global.fetch = jest.fn(async (input) => {
      const url = String(input)
      urls.push(url)
      if (url.includes('api.runbios.ai')) {
        throw new Error('runbios 401 invalid api key')
      }
      return json({ choices: [{ message: { content: 'GROK-AFTER-RUNBIOS' }, finish_reason: 'stop' }] })
    }) as typeof fetch

    const result = await generateBriefText({
      aiProvider: 'runbios-claude-opus',
      system: 'You are the brief architect.',
      prompt: 'TOPIC: dependent visa uk',
    })

    expect(result.fallbackUsed).toBe(true)
    expect(result.ai.provider).toBe('grok')
    expect(result.ai.text).toBe('GROK-AFTER-RUNBIOS')
    expect(urls.some((u) => u.includes('api.runbios.ai'))).toBe(true)
    expect(urls.some((u) => u.includes('api.x.ai'))).toBe(true)
  })
})

describe('exclusive pin — the brief never cascades to open-source backends', () => {
  const envKeys = ['OPENAI_API_KEY', 'OPENAI_MODEL', 'BASETEN_API_KEY', 'NVIDIA_API_KEY', 'CONTENT_AI_RETRY'] as const
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

  it('complete path: OpenAI failure throws the explicit-provider error — baseten/nvidia never called', async () => {
    // OpenAI + BOTH fallbacks configured: without `exclusive`, a failing
    // OpenAI would cascade to nvidia and "succeed". With `exclusive` it must
    // refuse to hand the brief to a non-OpenAI backend.
    process.env.OPENAI_API_KEY = 'test-openai-key'
    process.env.BASETEN_API_KEY = 'test-baseten-key'
    process.env.NVIDIA_API_KEY = 'test-nvidia-key'
    process.env.CONTENT_AI_RETRY = '1'

    const urls: string[] = []
    global.fetch = jest.fn(async (input, init) => {
      const url = String(input)
      urls.push(url)
      if (url.includes('api.openai.com')) {
        throw new Error('openai upstream 500')
      }
      // Any non-OpenAI backend would "succeed" — reaching this branch is the bug.
      return json({ choices: [{ message: { content: 'FALLBACK-DRAFTED-BRIEF' }, finish_reason: 'stop' }] })
    }) as typeof fetch

    await expect(
      generateContentText({
        aiProvider: 'gpt-5.6-terra',
        system: 'You are the brief architect.',
        prompt: 'TOPIC: dependent visa uk',
        exclusive: true,
      }),
    ).rejects.toThrow(/explicit ai provider "openai" failed|openai upstream 500/i)

    // Only the OpenAI endpoint was hit — zero fallback calls.
    expect(urls.filter((u) => !u.includes('api.openai.com')).length).toBe(0)
    expect(urls.some((u) => u.includes('api.openai.com'))).toBe(true)
  })

  it('complete path: unconfigured OpenAI with exclusive throws "not configured" — no silent auto-pick', async () => {
    // No OPENAI_API_KEY, but baseten/nvidia ARE configured. Auto mode would
    // pick one of them and draft the brief — exclusive must refuse.
    delete process.env.OPENAI_API_KEY
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
    ).rejects.toThrow(/not configured/i)

    // No upstream call at all — the early-fail fired before any provider.
    expect(global.fetch).toHaveBeenCalledTimes(0)
  })

  it('stream path: OpenAI is the only provider attempted with exclusive', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key'
    process.env.BASETEN_API_KEY = 'test-baseten-key'
    process.env.NVIDIA_API_KEY = 'test-nvidia-key'

    const urls: string[] = []
    global.fetch = jest.fn(async (input) => {
      const url = String(input)
      urls.push(url)
      if (url.includes('api.openai.com')) {
        throw new Error('openai stream down')
      }
      return new Response('data: [DONE]\n\n', {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      })
    }) as typeof fetch

    const events: Array<{ type: string; provider?: string; model?: string; text?: string }> = []
    await expect(async () => {
      for await (const ev of generateContentTextStream({
        aiProvider: 'gpt-5.6-terra',
        system: 'You are the brief architect.',
        prompt: 'TOPIC: dependent visa uk',
        exclusive: true,
      })) {
        events.push(ev as { type: string; provider?: string; model?: string; text?: string })
      }
    }).rejects.toThrow(/openai|explicit/i)

    // Only OpenAI was contacted — the cascade never reached baseten/nvidia.
    expect(urls.filter((u) => !u.includes('api.openai.com')).length).toBe(0)
    expect(urls.some((u) => u.includes('api.openai.com'))).toBe(true)
  })
})
