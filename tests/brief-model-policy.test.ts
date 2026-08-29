/**
 * Brief-model policy — the Research/Plan brief runs ONLY on an explicitly
 * selectable model: GPT-5.6 Sol/Terra (OpenAI), GLM 5.2 Fast (Baseten /
 * AIHubmix), or DeepSeek V4 Flash 0731 (Baseten).
 *
 * 2026-08 regression: the suggest-brief route forwarded body.aiProvider
 * verbatim, so a stray 'auto' or a stale drafting provider id ('nvidia-glm'…)
 * silently sent the brief through the open-source drafting cascade instead of
 * a chosen brief model. These tests lock:
 *
 *  1. resolveBriefAiProvider maps each accepted brief model to its provider,
 *     and coerces EVERY other value to OpenAI/Terra — only an explicit
 *     gpt-5.6-sol request gets Sol; anything else (including 'auto' and any
 *     unrecognized provider id) becomes OpenAI + gpt-5.6-terra.
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

describe('resolveBriefAiProvider — brief model policy (GPT Sol/Terra + GLM 5.2 Fast + DeepSeek V4 Flash)', () => {
  it('gpt-5.6-terra and gpt-5.6 default to OpenAI + Terra', () => {
    expect(resolveBriefAiProvider('gpt-5.6-terra')).toEqual({
      aiProvider: 'openai',
      model: 'gpt-5.6-terra',
    })
    expect(resolveBriefAiProvider('')).toEqual({
      aiProvider: 'runbios-glm-53-flash',
    })
  })

  it('gpt-5.6-sol (and bare gpt-5.6 alias) → OpenAI + Sol', () => {
    expect(resolveBriefAiProvider('gpt-5.6-sol')).toEqual({
      aiProvider: 'openai',
      model: 'gpt-5.6-sol',
    })
    expect(resolveBriefAiProvider('gpt-5.6')).toEqual({
      aiProvider: 'openai',
      model: 'gpt-5.6-sol',
    })
    // Case-insensitive
    expect(resolveBriefAiProvider('GPT-5.6-SOL')).toEqual({
      aiProvider: 'openai',
      model: 'gpt-5.6-sol',
    })
  })

  it('grok / xai / supergrok / grok-4.6 → Grok fallback provider', () => {
    expect(resolveBriefAiProvider('grok')).toEqual({ aiProvider: 'grok' })
    expect(resolveBriefAiProvider('xai')).toEqual({ aiProvider: 'grok' })
    expect(resolveBriefAiProvider('supergrok')).toEqual({ aiProvider: 'grok' })
    expect(resolveBriefAiProvider('grok-4.6')).toEqual({ aiProvider: 'grok' })
  })

  it('baseten-glm-fast (and glm-5.2-fast alias) → GLM 5.2 Fast', () => {
    expect(resolveBriefAiProvider('baseten-glm-fast')).toEqual({
      aiProvider: 'baseten-glm-fast',
    })
    expect(resolveBriefAiProvider('glm-5.2-fast')).toEqual({
      aiProvider: 'baseten-glm-fast',
    })
    // Case-insensitive
    expect(resolveBriefAiProvider('BASETEN-GLM-FAST')).toEqual({
      aiProvider: 'baseten-glm-fast',
    })
  })

  it('aihubmix-glm-fast (and aliases) → GLM 5.2 Fast via AIHubmix', () => {
    expect(resolveBriefAiProvider('aihubmix-glm-fast')).toEqual({
      aiProvider: 'aihubmix-glm-fast',
    })
    expect(resolveBriefAiProvider('aihubmix-glm')).toEqual({
      aiProvider: 'aihubmix-glm-fast',
    })
    expect(resolveBriefAiProvider('glm-fast-aihubmix')).toEqual({
      aiProvider: 'aihubmix-glm-fast',
    })
    // Case-insensitive
    expect(resolveBriefAiProvider('AIHUBMIX-GLM-FAST')).toEqual({
      aiProvider: 'aihubmix-glm-fast',
    })
  })

  it('parasail DeepSeek on Research maps to Pro-0813; Flash pin stays Flash', () => {
    expect(resolveBriefAiProvider('parasail')).toEqual({ aiProvider: 'parasail-deepseek-pro' })
    expect(resolveBriefAiProvider('parasail-deepseek-pro')).toEqual({ aiProvider: 'parasail-deepseek-pro' })
    expect(resolveBriefAiProvider('deepseek-ai/DeepSeek-V4-Pro-0813')).toEqual({
      aiProvider: 'parasail-deepseek-pro',
    })
    expect(resolveBriefAiProvider('parasail-deepseek')).toEqual({ aiProvider: 'parasail-deepseek' })
    expect(resolveBriefAiProvider('parasail-glm')).toEqual({ aiProvider: 'parasail-glm' })
  })

  it('baseten-deepseek (and aliases) → DeepSeek V4 Flash 0731 via Baseten', () => {
    expect(resolveBriefAiProvider('baseten-deepseek')).toEqual({
      aiProvider: 'baseten-deepseek',
    })
    expect(resolveBriefAiProvider('deepseek-v4-flash')).toEqual({
      aiProvider: 'baseten-deepseek',
    })
    expect(resolveBriefAiProvider('deepseek-ai/deepseek-v4-flash-0731')).toEqual({
      aiProvider: 'baseten-deepseek',
    })
    // Case-insensitive
    expect(resolveBriefAiProvider('BASETEN-DEEPSEEK')).toEqual({
      aiProvider: 'baseten-deepseek',
    })
  })

  it('auto / empty / unknown coerce to Run BiOS GLM 5.3 Flash', () => {
    expect(resolveBriefAiProvider('nvidia-glm')).toEqual({ aiProvider: 'nvidia-glm' })
    expect(resolveBriefAiProvider('zai-glm')).toEqual({ aiProvider: 'zai-glm' })
    expect(resolveBriefAiProvider('baseten-deepseek-pro')).toEqual({ aiProvider: 'baseten-deepseek-pro' })
    expect(resolveBriefAiProvider('deepseek-pro')).toEqual({ aiProvider: 'deepseek-pro' })
    expect(resolveBriefAiProvider('deepseek-flash')).toEqual({ aiProvider: 'deepseek-flash' })
    expect(resolveBriefAiProvider('nvidia-deepseek')).toEqual({ aiProvider: 'nvidia-deepseek' })

    expect(resolveBriefAiProvider('glm-fast')).toEqual({ aiProvider: 'baseten-glm-fast' })
    expect(resolveBriefAiProvider('openai')).toEqual({
      aiProvider: 'openai',
      model: 'gpt-5.6-terra',
    })
    expect(resolveBriefAiProvider('gpt-5.6-terra')).toEqual({
      aiProvider: 'openai',
      model: 'gpt-5.6-terra',
    })

    const leaks = [
      'auto',
      '',
      'default',
      'nvidia-nemotron',
      'cloudflare-ai',
      'gpt-5.6-luna',
    ]
    for (const raw of leaks) {
      const resolved = resolveBriefAiProvider(raw)
      expect({ raw, resolved }).toEqual({
        raw,
        resolved: { aiProvider: 'runbios-glm-53-flash' },
      })
    }
  })
})

describe('generateBriefText fallback — Grok (SuperGrok) when GPT fails', () => {
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

  it('both-fail path: combined error names GPT and Grok reasons', async () => {
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
    ).rejects.toThrow(/Brief generation failed[\s\S]*Primary \(GPT\)[\s\S]*Fallback \(Grok\)/)
  })

  it('Run BiOS GLM primary success returns fallbackUsed=false', async () => {
    process.env.RUNBIOS_API_KEY = 'test-runbios-key'
    process.env.XAI_API_KEY = 'test-xai-key'
    process.env.CONTENT_AI_RETRY = '1'

    const urls: string[] = []
    global.fetch = jest.fn(async (input) => {
      const url = String(input)
      urls.push(url)
      return json({ choices: [{ message: { content: 'RUNBIOS-BRIEF' }, finish_reason: 'stop' }] })
    }) as typeof fetch

    const result = await generateBriefText({
      aiProvider: 'runbios-glm-53-flash',
      system: 'You are the brief architect.',
      prompt: 'TOPIC: dependent visa uk',
    })

    expect(result.fallbackUsed).toBe(false)
    expect(result.ai.provider).toBe('runbios-glm-53-flash')
    expect(result.ai.text).toBe('RUNBIOS-BRIEF')
    expect(urls.some((u) => u.includes('api.runbios.ai'))).toBe(true)
    expect(urls.some((u) => u.includes('api.x.ai'))).toBe(false)
  })

  it('Run BiOS GLM primary hard failure still falls back to Grok', async () => {
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
      aiProvider: 'runbios-glm-53-flash',
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
