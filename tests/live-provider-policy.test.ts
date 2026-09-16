/**
 * Commissioned provider policy (P2, 2026-09-15) — replaces the 2026-09-02
 * "Entrim + Grok" live-policy gate.
 *
 * The ONLY commissioned content backends are `grok` (Grok 4.6 via xAI) and
 * `deepseek-v41-flash` (DeepSeek V4.1 Flash, first-party api.deepseek.com).
 * There is no break-glass that restores a retired host: retired provider
 * values are legacy pins that fail closed with a typed selection-required
 * error and zero outbound requests, in every environment.
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
  listConfiguredContentProviders,
} from '@/lib/contentAiProvider'
import {
  COMMISSIONED_PINS,
  ProviderSelectionRequiredError,
  isCommissionedPin,
} from '@/lib/contentAiRegistry'

const RETIRED_PINS = [
  'entrim-qwen-27b',
  'entrim-deepseek',
  'nvidia-minimax',
  'nvidia-nemotron',
  'nvidia-deepseek',
  'openai',
  'baseten-deepseek',
  'parasail-deepseek',
  'runbios-glm-53-flash',
  'cloudflare-ai',
  'groq',
  'zai-glm',
  'aihubmix-glm-fast',
  'openrouter',
  'gemini',
  'custom',
] as const

const ENV_KEYS = [
  'ENTRIM_API_KEY', 'XAI_API_KEY', 'DEEPSEEK_API_KEY', 'OPENAI_API_KEY',
  'BASETEN_API_KEY', 'NVIDIA_API_KEY', 'PARASAIL_API_KEY', 'RUNBIOS_API_KEY',
  'AIHUBMIX_API_KEY', 'GROQ_API_KEY', 'GEMINI_API_KEY', 'OPENROUTER_API_KEY',
  'CONTENT_AI_RETRY', 'CONTENT_AI_ALL_PROVIDERS', 'CONTENT_AI_PROVIDER_ORDER',
  'CONTENT_AI_MAX_PROVIDERS',
] as const
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

describe('commissioned provider policy — Grok + first-party DeepSeek only', () => {
  it('admits exactly the two commissioned pins', () => {
    expect(COMMISSIONED_PINS).toEqual(['grok', 'deepseek-v41-flash'])
    expect(isCommissionedPin('grok')).toBe(true)
    expect(isCommissionedPin('deepseek-v41-flash')).toBe(true)
    for (const retired of RETIRED_PINS) {
      expect({ retired, commissioned: isCommissionedPin(retired) }).toEqual({ retired, commissioned: false })
    }
  })

  it('CONTENT_AI_ALL_PROVIDERS=1 break-glass does NOT restore retired hosts', () => {
    process.env.CONTENT_AI_ALL_PROVIDERS = '1'
    for (const retired of RETIRED_PINS) {
      expect({ retired, commissioned: isCommissionedPin(retired) }).toEqual({ retired, commissioned: false })
    }
  })

  it('a retired pin fails closed with a typed selection-required error and zero outbound calls — even at break-glass', async () => {
    process.env.CONTENT_AI_ALL_PROVIDERS = '1'
    process.env.XAI_API_KEY = 'test-xai-key'
    process.env.DEEPSEEK_API_KEY = 'test-deepseek-key'
    process.env.ENTRIM_API_KEY = 'test-entrim-key'
    process.env.OPENAI_API_KEY = 'test-openai-key'
    process.env.NVIDIA_API_KEY = 'test-nvidia-key'
    const fetchSpy = jest.fn(async () => {
      throw new Error('outbound provider request is forbidden for a retired pin')
    })
    global.fetch = fetchSpy as unknown as typeof fetch

    for (const retired of ['openai', 'entrim-qwen-27b', 'nvidia-deepseek'] as const) {
      let caught: unknown
      try {
        await generateContentText({
          aiProvider: retired,
          system: 'Write an article.',
          prompt: 'Draft the article.',
          skipQualityContract: true,
        })
      } catch (error) {
        caught = error
      }
      expect(caught).toBeInstanceOf(ProviderSelectionRequiredError)
      expect(caught as ProviderSelectionRequiredError).toMatchObject({ code: 'selection_required', status: 409 })
    }
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('a stale crowded admin order can never restore a retired host to the cascade', async () => {
    process.env.CONTENT_AI_MAX_PROVIDERS = '4'
    process.env.CONTENT_AI_PROVIDER_ORDER = JSON.stringify([
      'grok', 'openai', 'baseten-deepseek', 'nvidia-minimax', 'nvidia-glm',
      'entrim-qwen-27b', 'entrim-deepseek',
    ])
    const urls: string[] = []
    global.fetch = jest.fn(async (input) => {
      urls.push(String(input))
      return new Response(JSON.stringify({ error: 'upstream gateway timeout' }), {
        status: 524,
        headers: { 'content-type': 'application/json' },
      })
    }) as unknown as typeof fetch

    await expect(generateContentText({
      aiProvider: 'entrim-qwen-27b',
      system: 'Write an article.',
      prompt: 'Draft the article.',
      skipQualityContract: true,
    })).rejects.toBeInstanceOf(ProviderSelectionRequiredError)

    expect(urls).toEqual([])
  })

  it('listConfiguredContentProviders exposes exactly the two registry providers with no Entrim labels', () => {
    process.env.ENTRIM_API_KEY = 'test-entrim-key'
    process.env.XAI_API_KEY = 'test-xai-key'
    const rows = listConfiguredContentProviders()
    expect(rows.map((row) => row.id).sort()).toEqual([...COMMISSIONED_PINS].sort())
    for (const row of rows) {
      expect(row.label).not.toMatch(/entrim/i)
    }
  })
})
