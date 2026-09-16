/**
 * Brief-model policy — COMMISSIONED POLICY (P2, 2026-09-15): the Research/Plan
 * brief accepts EXACTLY the two commissioned pins:
 *
 *   1. Grok 4.6 (`grok`) — the lane DEFAULT (paid SuperGrok).
 *   2. DeepSeek V4.1 Flash (`deepseek-v41-flash`, upstream model id
 *      `deepseek-flash`) — first-party api.deepseek.com only.
 *
 * Regression lock:
 *
 *  1. `resolveBriefAiProvider` keeps the two commissioned pins (and their
 *     commissioned aliases); empty/auto resolves to the recorded Grok lane
 *     default; EVERY other value — stale drafting ids, retired pins (Claude,
 *     GLM, MiniMax, GPT, Run BiOS/Baseten DeepSeek), legacy Entrim values — is
 *     a typed `ProviderSelectionRequiredError`, never a Grok coercion.
 *  2. exclusive: true means the brief can never cascade to a non-chosen
 *     backend: a pinned provider failure throws instead of returning prose
 *     drafted by another provider (no Grok<->DeepSeek cross-fallback).
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
  resolveBriefAiProvider,
  generateBriefText,
} from '@/lib/seoFactory/briefModel'
import { ProviderSelectionRequiredError } from '@/lib/contentAiRegistry'

const LEGACY_BRIEF_PINS = [
  'entrim-deepseek',
  'entrim-qwen-27b',
  'entrim',
  'qwen3.6-27b',
  'qwen',
  'nvidia-deepseek',
  'nvidia-minimax',
  'baseten-deepseek',
  'baseten-glm-fast',
  'parasail-deepseek',
  'runbios-claude-opus',
  'runbios-glm-53-flash',
  'openai',
  'gpt-5.6-terra',
  'gpt-5.6-sol',
  'zai-glm',
  'aihubmix-glm-fast',
  'claude-opus-5',
  'cloudflare-ai',
  'bios-adaptive',
  'deepseek',
  'deepseek-flash',
  'deepseek-pro',
  'deepseek-v4-flash',
] as const

const ENV_KEYS = ['OPENAI_API_KEY', 'XAI_API_KEY', 'DEEPSEEK_API_KEY', 'ENTRIM_API_KEY', 'CONTENT_AI_RETRY'] as const
const savedEnv: Record<string, string | undefined> = {}
const originalFetch = global.fetch

beforeAll(() => {
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key]
})

beforeEach(() => {
  for (const key of ENV_KEYS) delete process.env[key]
  process.env.CONTENT_AI_RETRY = '1'
})

afterEach(() => {
  global.fetch = originalFetch
  for (const key of ENV_KEYS) {
    if (savedEnv[key] == null) delete process.env[key]
    else process.env[key] = savedEnv[key]
  }
})

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  })

describe('resolveBriefAiProvider — commissioned brief pin policy', () => {
  it('empty / auto / default resolve to the recorded Grok lane default', () => {
    for (const raw of ['', '   ', 'auto', 'default', 'primary']) {
      expect({ raw, resolved: resolveBriefAiProvider(raw) }).toEqual({ raw, resolved: { aiProvider: 'grok' } })
    }
  })

  it('Grok 4.6 (and its commissioned aliases) is a brief family', () => {
    for (const raw of ['grok', 'grok-4.6', 'GROK-4.6', 'xai', 'supergrok', 'super-grok']) {
      expect({ raw, resolved: resolveBriefAiProvider(raw) }).toEqual({ raw, resolved: { aiProvider: 'grok' } })
    }
  })

  it('DeepSeek V4.1 Flash is a brief family under its stable pin only', () => {
    expect(resolveBriefAiProvider('deepseek-v41-flash')).toEqual({ aiProvider: 'deepseek-v41-flash' })
    expect(resolveBriefAiProvider('DEEPSEEK-V41-FLASH')).toEqual({ aiProvider: 'deepseek-v41-flash' })
  })

  it('every retired/legacy pin raises a typed selection-required error — never a Grok coercion', () => {
    for (const raw of LEGACY_BRIEF_PINS) {
      let caught: unknown
      try {
        resolveBriefAiProvider(raw)
      } catch (error) {
        caught = error
      }
      expect(caught).toBeInstanceOf(ProviderSelectionRequiredError)
      expect(caught as ProviderSelectionRequiredError).toMatchObject({
        code: 'selection_required',
        status: 409,
        legacyValue: raw,
      })
    }
  })
})

describe('generateBriefText — commissioned exclusivity, no cross-fallback', () => {
  it('a legacy pin rejects with ProviderSelectionRequiredError and zero outbound calls', async () => {
    process.env.XAI_API_KEY = 'test-xai-key'
    process.env.DEEPSEEK_API_KEY = 'test-deepseek-key'
    const fetchSpy = jest.fn(async () => {
      throw new Error('outbound provider request is forbidden for a legacy pin')
    })
    global.fetch = fetchSpy as unknown as typeof fetch

    let caught: unknown
    try {
      await generateBriefText({
        aiProvider: 'entrim-deepseek',
        system: 'You are the brief architect.',
        prompt: 'TOPIC: dependent visa uk',
      })
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(ProviderSelectionRequiredError)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('Grok owner briefs exclusively on api.x.ai — the Entrim/DeepSeek hosts are never contacted', async () => {
    process.env.XAI_API_KEY = 'test-xai-key'
    process.env.ENTRIM_API_KEY = 'test-entrim-key' // must NEVER be contacted
    process.env.DEEPSEEK_API_KEY = 'test-deepseek-key' // must NEVER be contacted
    const urls: string[] = []
    global.fetch = jest.fn(async (input) => {
      urls.push(String(input))
      return json({ output_text: 'GROK-BRIEF', status: 'completed' })
    }) as unknown as typeof fetch

    const result = await generateBriefText({
      aiProvider: 'grok',
      system: 'You are the brief architect.',
      prompt: 'TOPIC: dependent visa uk',
    })

    expect(result.fallbackUsed).toBe(false)
    expect(result.ai.provider).toBe('grok')
    expect(result.ai.text).toBe('GROK-BRIEF')
    expect(urls.some((url) => url.includes('api.x.ai'))).toBe(true)
    expect(urls.some((url) => url.includes('api.entrim.ai'))).toBe(false)
    expect(urls.some((url) => url.includes('api.deepseek.com'))).toBe(false)
  })

  it('DeepSeek owner briefs exclusively on api.deepseek.com with the literal deepseek-flash model', async () => {
    process.env.XAI_API_KEY = 'test-xai-key' // must NEVER be contacted
    process.env.DEEPSEEK_API_KEY = 'test-deepseek-key'
    const urls: string[] = []
    const bodies: Array<Record<string, unknown>> = []
    global.fetch = jest.fn(async (input, init) => {
      urls.push(String(input))
      try { bodies.push(JSON.parse(String(init?.body || '{}')) as Record<string, unknown>) } catch { /* ignore */ }
      return json({ choices: [{ message: { content: 'DEEPSEEK-BRIEF' }, finish_reason: 'stop' }] })
    }) as unknown as typeof fetch

    const result = await generateBriefText({
      aiProvider: 'deepseek-v41-flash',
      system: 'You are the brief architect.',
      prompt: 'TOPIC: dependent visa uk',
    })

    expect(result.fallbackUsed).toBe(false)
    expect(result.ai.provider).toBe('deepseek-v41-flash')
    expect(result.ai.text).toBe('DEEPSEEK-BRIEF')
    expect(urls.every((url) => new URL(url).hostname === 'api.deepseek.com')).toBe(true)
    expect(bodies.every((body) => body.model === 'deepseek-flash')).toBe(true)
    expect(urls.some((url) => url.includes('api.x.ai'))).toBe(false)
  })

  it('a failing Grok owner fails closed — it never falls back to DeepSeek (no cross-provider fallback)', async () => {
    process.env.XAI_API_KEY = 'test-xai-key'
    process.env.DEEPSEEK_API_KEY = 'test-deepseek-key'
    const urls: string[] = []
    global.fetch = jest.fn(async (input) => {
      urls.push(String(input))
      return json({ error: { message: 'you exceeded your current quota' } }, 402)
    }) as unknown as typeof fetch

    await expect(generateBriefText({
      aiProvider: 'grok',
      system: 'You are the brief architect.',
      prompt: 'TOPIC: dependent visa uk',
    })).rejects.toThrow()

    expect(urls.some((url) => url.includes('api.deepseek.com'))).toBe(false)
    expect(urls.some((url) => url.includes('api.entrim.ai'))).toBe(false)
  })
})
