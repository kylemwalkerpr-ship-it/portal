/**
 * Entrim provider — REJECTION PROOF (P2, 2026-09-15).
 *
 * Entrim (`api.entrim.ai/v1`, `entrim-deepseek` / `entrim-qwen-27b`) is a
 * retired host: its pin is a legacy value that is non-selectable and
 * non-executable. Selecting it fails closed with a typed
 * `ProviderSelectionRequiredError` and makes ZERO outbound requests — no
 * `api.entrim.ai` call, no silent execution of another host, no vault/base-URL
 * resurrection.
 */
jest.mock('@/lib/aiKeyVault', () => ({
  buildVaultEnvOverrides: jest.fn(async () => ({})),
  getAiSettings: jest.fn(async () => ({})),
  setAiSetting: jest.fn(async () => undefined),
  deleteAiSetting: jest.fn(async () => undefined),
  ensureDraftDefaultSettings: jest.fn(async () => undefined),
  ensureParasailDefaultSettings: jest.fn(async () => undefined),
  AI_PROVIDERS: jest.requireActual('@/lib/aiKeyVault').AI_PROVIDERS,
  providerDef: jest.requireActual('@/lib/aiKeyVault').providerDef,
}))

import { generateContentText, setVaultOverlay } from '@/lib/contentAiProvider'
import {
  ProviderSelectionRequiredError,
  assertCommissionedPin,
  isCommissionedPin,
  resolveExecutionProvider,
} from '@/lib/contentAiRegistry'
import { parseStudioPin } from '@/lib/contentAiCatalog'

const ENTRIM_PINS = ['entrim-deepseek', 'entrim-qwen-27b', 'entrim'] as const
const ENV_KEYS = ['ENTRIM_API_KEY', 'ENTRIM_BASE_URL', 'ENTRIM_MODEL', 'XAI_API_KEY', 'DEEPSEEK_API_KEY'] as const
const savedEnv: Record<string, string | undefined> = {}
const originalFetch = global.fetch

beforeAll(() => {
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key]
})

beforeEach(() => {
  for (const key of ENV_KEYS) delete process.env[key]
  setVaultOverlay(null)
})

afterEach(() => {
  global.fetch = originalFetch
  setVaultOverlay(null)
  for (const key of ENV_KEYS) {
    if (savedEnv[key] == null) delete process.env[key]
    else process.env[key] = savedEnv[key]
  }
})

describe('Entrim is a non-commissioned legacy host', () => {
  it('is not a commissioned pin and cannot be asserted as one', () => {
    for (const pin of ENTRIM_PINS) {
      expect(isCommissionedPin(pin)).toBe(false)
      expect(() => assertCommissionedPin(pin)).toThrow(ProviderSelectionRequiredError)
      expect(resolveExecutionProvider({ requestedPin: pin, lane: 'draft' })).toMatchObject({
        kind: 'needs_selection',
        legacyValue: pin,
      })
      expect(parseStudioPin(pin)).toMatchObject({ kind: 'needs_selection' })
    }
  })

  it('an explicit Entrim pin with ENTRIM_API_KEY configured rejects typed and makes no api.entrim.ai request', async () => {
    process.env.ENTRIM_API_KEY = 'test-entrim-key'
    process.env.XAI_API_KEY = 'test-xai-key'
    process.env.DEEPSEEK_API_KEY = 'test-deepseek-key'
    const urls: string[] = []
    global.fetch = jest.fn(async (input) => {
      urls.push(String(input))
      return new Response(
        JSON.stringify({ choices: [{ message: { content: 'SHOULD-NEVER-HAPPEN' }, finish_reason: 'stop' }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }) as unknown as typeof fetch

    let caught: unknown
    try {
      await generateContentText({
        aiProvider: 'entrim-deepseek',
        exclusive: true,
        system: 'Write.',
        prompt: 'Write an article.',
        maxTokens: 256,
        skipQualityContract: true,
      })
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(ProviderSelectionRequiredError)
    expect(caught as ProviderSelectionRequiredError).toMatchObject({ code: 'selection_required', status: 409 })
    expect(urls.some((url) => url.includes('api.entrim.ai'))).toBe(false)
    expect(urls).toEqual([])
  })

  it('vault keys and base-URL overrides cannot resurrect the Entrim host', async () => {
    setVaultOverlay({
      ENTRIM_API_KEY: 'vault-entrim-key',
      ENTRIM_BASE_URL: 'https://api.entrim.ai/v1',
      ENTRIM_MODEL: 'deepseek-ai/DeepSeek-V4-Flash',
    })
    const urls: string[] = []
    global.fetch = jest.fn(async (input) => {
      urls.push(String(input))
      return new Response('SHOULD-NEVER-HAPPEN', { status: 200 })
    }) as unknown as typeof fetch

    await expect(generateContentText({
      aiProvider: 'entrim-qwen-27b',
      exclusive: true,
      system: 'Write.',
      prompt: 'Write an article.',
      maxTokens: 256,
      skipQualityContract: true,
    })).rejects.toBeInstanceOf(ProviderSelectionRequiredError)

    expect(urls).toEqual([])
  })
})
