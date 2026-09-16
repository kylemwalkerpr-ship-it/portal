/**
 * Provider registration proof — RUNTIME HALF of the post-P2 non-registrability
 * guarantee (Plan Task 1; design §3.2, §11, §13 decisions 8-9).
 *
 * After the P2 commission flip the registered completer set and the registered
 * stream-candidate set must equal `COMMISSIONED_PINS` under EVERY environment:
 * the default env, `CONTENT_AI_ALL_PROVIDERS=1` break-glass, retired provider
 * keys present, and a retired `CONTENT_AI_PROVIDER=entrim-qwen-27b` literal.
 * A retired transport must not be registrable, selectable, or reachable in any
 * env — including break-glass — even while its dead module still exists.
 *
 * The introspection export named here (`registeredContentProviderPins`) is
 * produced by Plan Task 3 ("Export the runtime registration introspection used
 * by provider-registration-proof.test.ts (registered completers + stream
 * candidates)"). The import is defensive so a missing export fails as a clear
 * assertion — not a TypeError — while the contract is RED.
 */
jest.mock('@/lib/aiKeyVault', () => ({
  buildVaultEnvOverrides: jest.fn(async () => ({})),
  getAiSettings: jest.fn(async () => ({})),
  setAiSetting: jest.fn(async () => undefined),
  deleteAiSetting: jest.fn(async () => undefined),
  ensureDraftDefaultSettings: jest.fn(async () => undefined),
  ensureParasailDefaultSettings: jest.fn(async () => undefined),
}))

import * as provider from '@/lib/contentAiProvider'
import { COMMISSIONED_PINS } from '@/lib/contentAiRegistry'

type RegistrationIntrospection = { completers: string[]; streamCandidates: string[] }

const registeredContentProviderPins = (provider as unknown as {
  registeredContentProviderPins?: () => RegistrationIntrospection
}).registeredContentProviderPins

const ENV_KEYS = [
  'XAI_API_KEY',
  'DEEPSEEK_API_KEY',
  'ENTRIM_API_KEY',
  'ENTRIM_BASE_URL',
  'NVIDIA_API_KEY',
  'NVAPI_KEY',
  'BASETEN_API_KEY',
  'PARASAIL_API_KEY',
  'RUNBIOS_API_KEY',
  'AIHUBMIX_API_KEY',
  'OPENAI_API_KEY',
  'GROQ_API_KEY',
  'GEMINI_API_KEY',
  'OPENROUTER_API_KEY',
  'CONTENT_AI_ALL_PROVIDERS',
  'CONTENT_AI_PROVIDER',
] as const
const savedEnv: Record<string, string | undefined> = {}

beforeAll(() => {
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key]
})

beforeEach(() => {
  for (const key of ENV_KEYS) delete process.env[key]
})

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] == null) delete process.env[key]
    else process.env[key] = savedEnv[key]
  }
})

function registration(): RegistrationIntrospection {
  expect(typeof registeredContentProviderPins).toBe('function')
  return (registeredContentProviderPins as () => RegistrationIntrospection)()
}

function expectExactlyCommissioned(label: string) {
  const { completers, streamCandidates } = registration()
  expect({ label, completers: [...completers].sort() }).toEqual({ label, completers: [...COMMISSIONED_PINS].sort() })
  expect({ label, streamCandidates: [...streamCandidates].sort() }).toEqual({ label, streamCandidates: [...COMMISSIONED_PINS].sort() })
}

describe('runtime provider registration proof (design §3.2, §11)', () => {
  it('exports the runtime registration introspection (completers + stream candidates)', () => {
    expect(typeof registeredContentProviderPins).toBe('function')
  })

  it('default env registers exactly the two commissioned pins', () => {
    expectExactlyCommissioned('default')
  })

  it('CONTENT_AI_ALL_PROVIDERS=1 break-glass does not restore retired registrations', () => {
    process.env.CONTENT_AI_ALL_PROVIDERS = '1'
    process.env.XAI_API_KEY = 'test-xai-key'
    process.env.DEEPSEEK_API_KEY = 'test-deepseek-key'
    expectExactlyCommissioned('break-glass')
  })

  it('retired provider keys present do not register retired transports', () => {
    process.env.ENTRIM_API_KEY = 'test-entrim-key'
    process.env.NVIDIA_API_KEY = 'test-nvidia-key'
    process.env.NVAPI_KEY = 'test-nvidia-key'
    process.env.BASETEN_API_KEY = 'test-baseten-key'
    process.env.PARASAIL_API_KEY = 'test-parasail-key'
    process.env.RUNBIOS_API_KEY = 'test-runbios-key'
    process.env.AIHUBMIX_API_KEY = 'test-aihubmix-key'
    process.env.OPENAI_API_KEY = 'test-openai-key'
    process.env.GROQ_API_KEY = 'test-groq-key'
    process.env.GEMINI_API_KEY = 'test-gemini-key'
    process.env.OPENROUTER_API_KEY = 'test-openrouter-key'
    expectExactlyCommissioned('retired-keys')
  })

  it('retired CONTENT_AI_PROVIDER=entrim-qwen-27b does not register a retired executor', () => {
    process.env.CONTENT_AI_PROVIDER = 'entrim-qwen-27b'
    process.env.ENTRIM_API_KEY = 'test-entrim-key'
    process.env.XAI_API_KEY = 'test-xai-key'
    process.env.DEEPSEEK_API_KEY = 'test-deepseek-key'
    expectExactlyCommissioned('retired-provider-env')
  })

  it('a retired CONTENT_AI_PROVIDER literal cannot re-pin registration in either direction', () => {
    process.env.CONTENT_AI_PROVIDER = 'entrim-deepseek'
    process.env.ENTRIM_API_KEY = 'test-entrim-key'
    expectExactlyCommissioned('retired-provider-env-entrim-deepseek')
  })

  it('listConfiguredContentProviders returns exactly the two registry providers', () => {
    const rows = provider.listConfiguredContentProviders()
    expect(rows.map((row) => row.id).sort()).toEqual([...COMMISSIONED_PINS].sort())
    for (const row of rows) {
      expect(['grok', 'deepseek-v41-flash']).toContain(row.id)
      expect(row.label).not.toMatch(/entrim|nvidia|baseten|parasail|runbios|aihubmix/i)
      expect(typeof row.configured).toBe('boolean')
    }
    // No retired provider row may survive even when its key is present.
    process.env.ENTRIM_API_KEY = 'test-entrim-key'
    process.env.NVIDIA_API_KEY = 'test-nvidia-key'
    const withRetiredKeys = provider.listConfiguredContentProviders()
    expect(withRetiredKeys.map((row) => row.id).sort()).toEqual([...COMMISSIONED_PINS].sort())
  })
})
