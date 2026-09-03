/**
 * Entrim (api.entrim.ai) — first-class OpenAI-compatible host for DeepSeek V4
 * Flash. Provider id / pin `entrim-deepseek`, label "DeepSeek V4 Flash ·
 * Entrim", key ENTRIM_API_KEY, exact model `deepseek-ai/DeepSeek-V4-Flash`
 * (no -0731 suffix — never canonicalized). Explicit Entrim selection fails
 * closed with a clear provider error and never silently executes another host.
 * Vault credentials win over env (existing vault-overlay contract).
 */
jest.mock('@/lib/aiKeyVault', () => ({
  buildVaultEnvOverrides: jest.fn(async () => ({})),
  AI_PROVIDERS: jest.requireActual('@/lib/aiKeyVault').AI_PROVIDERS,
  providerDef: jest.requireActual('@/lib/aiKeyVault').providerDef,
}))

import {
  pinFor,
  parseStudioPin,
  modelsForLane,
  hostsForModel,
  LANE_HOSTS,
  STUDIO_HOST_ORDER,
  canonicalizePin,
} from '@/lib/contentAiCatalog'
import {
  getEntrimProvider,
  isEntrimConfigured,
  listConfiguredContentProviders,
  resolveAiProviderPin,
  setVaultOverlay,
  generateContentText,
} from '@/lib/contentAiProvider'
import { AI_PROVIDERS, providerDef } from '@/lib/aiKeyVault'

const ENV_KEYS = ['ENTRIM_API_KEY', 'ENTRIM_BASE_URL', 'ENTRIM_MODEL'] as const
const original: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const k of ENV_KEYS) {
    original[k] = process.env[k]
    delete process.env[k]
  }
  setVaultOverlay(null)
})

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (original[k] == null) delete process.env[k]
    else process.env[k] = original[k]
  }
  setVaultOverlay(null)
})

describe('Entrim · Draft lane + Command/Configurator catalog', () => {
  it('deepseek-v4-flash carries the Entrim host in Draft and Command', () => {
    const flash = modelsForLane('draft').find((m) => m.id === 'deepseek-v4-flash')
    expect(flash).toBeDefined()
    const entrimHost = flash!.hosts.find((h) => h.id === 'entrim')
    expect(entrimHost).toMatchObject({ id: 'entrim', label: 'Entrim', pin: 'entrim-deepseek' })
    // Selectable in the Draft and Command lanes; pinned exactly.
    expect(hostsForModel('deepseek-v4-flash', 'draft').some((h) => h.id === 'entrim')).toBe(true)
    expect(hostsForModel('deepseek-v4-flash', 'command').some((h) => h.id === 'entrim')).toBe(true)
    expect(pinFor('deepseek-v4-flash', 'entrim')).toBe('entrim-deepseek')
    expect(parseStudioPin('entrim-deepseek').host.id).toBe('entrim')
    expect(parseStudioPin('entrim-deepseek').model.id).toBe('deepseek-v4-flash')
    expect(canonicalizePin('entrim')).toBe('entrim-deepseek')
    expect(canonicalizePin('entrim-deepseek')).toBe('entrim-deepseek')
  })

  it('Entrim is in the Draft lane allowlist and host picker order', () => {
    expect(LANE_HOSTS.draft).toContain('entrim')
    expect(LANE_HOSTS.command).toContain('entrim')
    expect(STUDIO_HOST_ORDER).toContain('entrim')
    expect(STUDIO_HOST_ORDER).toContain('xai')
  })

  it('appears in the Command/Configurator provider + vault lists as "DeepSeek V4 Flash · Entrim"', () => {
    const inConfigured = listConfiguredContentProviders().find((p) => p.id === 'entrim-deepseek')
    expect(inConfigured).toBeDefined()
    expect(inConfigured!.configured).toBe(false)
    expect(inConfigured!.label).toContain('Entrim')
    const vault = providerDef('entrim-deepseek')
    expect(vault).toEqual(expect.objectContaining({
      label: 'DeepSeek V4 Flash · Entrim (api.entrim.ai/v1)',
      keyEnv: 'ENTRIM_API_KEY',
      baseUrlEnv: 'ENTRIM_BASE_URL',
      modelEnv: 'ENTRIM_MODEL',
      fixedBaseUrl: 'https://api.entrim.ai/v1',
      defaultModel: 'deepseek-ai/DeepSeek-V4-Flash',
    }))
    expect(AI_PROVIDERS.some((p) => p.id === 'entrim-deepseek')).toBe(true)
  })
})

describe('Entrim · pin resolution → exact endpoint/model', () => {
  it('entrim pin resolves to the exact provider, never an alias host', () => {
    expect(resolveAiProviderPin('entrim-deepseek')).toEqual({ explicit: 'entrim-deepseek', prefer: 'entrim-deepseek' })
    expect(resolveAiProviderPin('entrim')).toEqual({ explicit: 'entrim-deepseek', prefer: 'entrim-deepseek' })
  })

  it('exposes the exact Entrim endpoint + model, uncanonicalized', () => {
    process.env.ENTRIM_API_KEY = 'test-entrim-key'
    const provider = getEntrimProvider() as unknown as { label: string; baseURL: string; model: string; maxTokensCap?: number }
    expect(provider).toEqual({
      label: 'entrim-deepseek',
      baseURL: 'https://api.entrim.ai/v1',
      apiKey: 'test-entrim-key',
      model: 'deepseek-ai/DeepSeek-V4-Flash',
      maxTokensCap: 16384,
    })
    expect(provider.model).not.toContain('0731')
    expect(isEntrimConfigured()).toBe(true)
    expect(listConfiguredContentProviders().find((p) => p.id === 'entrim-deepseek')!.configured).toBe(true)
  })

  it('a non-URL Entrim base-URL override falls back to the fixed endpoint', () => {
    process.env.ENTRIM_API_KEY = 'test-entrim-key'
    process.env.ENTRIM_BASE_URL = 'sk-not-a-url'
    expect(getEntrimProvider()!.baseURL).toBe('https://api.entrim.ai/v1')
  })

  it('vault credentials take precedence over env (vault-overlay contract)', () => {
    process.env.ENTRIM_API_KEY = 'env-entrim-key'
    setVaultOverlay({ ENTRIM_API_KEY: 'vault-entrim-key' })
    const provider = getEntrimProvider()
    expect(provider).not.toBeNull()
    expect((provider as unknown as { apiKey?: string }).apiKey).toBe('vault-entrim-key')
  })
})

describe('Entrim · explicit selection fails closed', () => {
  it('explicit entrim pin with NO key throws a clear provider error and never executes another host', async () => {
    // A fallback IS configured (openai) — but the explicit Entrim pick must not
    // silently run it.
    const otherKey = process.env.OPENAI_API_KEY
    process.env.OPENAI_API_KEY = 'sk-another-provider'
    const originalFetch = global.fetch
    const fetchMock = jest.fn(async () => new Response('not reached', { status: 200 }))
    global.fetch = fetchMock as typeof fetch
    try {
      await expect(generateContentText({
        aiProvider: 'entrim-deepseek',
        system: 'Write.',
        prompt: 'Write an article.',
        maxTokens: 256,
        skipQualityContract: true,
      })).rejects.toThrow(/Selected AI provider "entrim-deepseek" is not configured/)
      expect(fetchMock).not.toHaveBeenCalled()
    } finally {
      global.fetch = originalFetch
      if (otherKey == null) delete process.env.OPENAI_API_KEY
      else process.env.OPENAI_API_KEY = otherKey
    }
  })

  it('a configured Entrim that fails on the request hard-fails (exclusive) — no silent fallback', async () => {
    process.env.ENTRIM_API_KEY = 'test-entrim-key'
    process.env.OPENAI_API_KEY = 'sk-another-provider'
    const originalFetch = global.fetch
    const fetchedHosts: string[] = []
    global.fetch = jest.fn(async (input) => {
      fetchedHosts.push(String(input))
      if (String(input).includes('api.entrim.ai')) {
        return new Response(
          JSON.stringify({ error: { message: 'invalid api key' } }),
          { status: 401, headers: { 'content-type': 'application/json' } },
        )
      }
      return new Response(
        JSON.stringify({ choices: [{ message: { content: 'fallback', finish_reason: 'stop' } }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }) as typeof fetch
    try {
      await expect(generateContentText({
        aiProvider: 'entrim-deepseek',
        exclusive: true,
        system: 'Write.',
        prompt: 'Write an article.',
        maxTokens: 256,
        skipQualityContract: true,
      })).rejects.toThrow(/Explicit AI provider "entrim-deepseek" failed/)
      // Only Entrim was contacted — openai was never silently executed.
      expect(fetchedHosts.some((h) => h.includes('api.openai.com'))).toBe(false)
    } finally {
      global.fetch = originalFetch
    }
  })

  it('exact request body routed to api.entrim.ai with the uncanonicalized model', async () => {
    process.env.ENTRIM_API_KEY = 'test-entrim-key'
    const originalFetch = global.fetch
    let requestUrl = ''
    let requestBody: Record<string, unknown> | null = null
    global.fetch = jest.fn(async (input, init) => {
      requestUrl = String(input)
      requestBody = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>
      return new Response(
        JSON.stringify({ choices: [{ message: { content: 'Entrim draft done.', finish_reason: 'stop' } }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }) as typeof fetch
    try {
      const result = await generateContentText({
        aiProvider: 'entrim-deepseek',
        system: 'Write.',
        prompt: 'Write an article.',
        maxTokens: 256,
        skipQualityContract: true,
      })
      expect(requestUrl).toBe('https://api.entrim.ai/v1/chat/completions')
      expect(requestBody!.model).toBe('deepseek-ai/DeepSeek-V4-Flash')
      expect(result.provider).toBe('entrim-deepseek')
      expect(result.model).toBe('deepseek-ai/DeepSeek-V4-Flash')
    } finally {
      global.fetch = originalFetch
    }
  })
})