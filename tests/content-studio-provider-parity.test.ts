/**
 * Content Studio provider parity — FROZEN CONTRACT (Plan Task 1, activated at P2).
 *
 * This suite pins the target-state contract from
 * docs/superpowers/specs/2026-09-15-content-studio-deepseek-provider-parity-design.md
 * (§3.1, §3.2, §3.6, §7, §13) and docs/superpowers/plans/
 * 2026-09-15-content-studio-deepseek-provider-parity.md (Task 1):
 *
 *   1. Exactly two commissioned pins exist: `grok` and `deepseek-v41-flash`
 *      (display `DeepSeek V4.1 Flash`, upstream API model id `deepseek-flash`).
 *   2. The bare string `deepseek-flash` is the upstream MODEL id only — it is
 *      never a selectable/executable PIN.
 *   3. Every historical/retired value is a legacy pin: `needs_selection`,
 *      typed `ProviderSelectionRequiredError` (`code:'selection_required'`,
 *      status 409), and ZERO outbound provider requests.
 *   4. No hidden defaults for legacy persisted values and no Grok<->DeepSeek
 *      cross-fallback.
 *   5. The Discover engine pair is `grok` + `deepseek-v41-flash` and requires
 *      BOTH providers (no single-lead degradation).
 *   6. The configurator catalog exposes exactly two models/hosts in all four
 *      lanes after P2.
 *
 * P1 (Task 2) only creates the registry: the registry/selector/destination
 * cases in this file are expected to go GREEN with P1, while the
 * execution-level cases (generateContentText gate, engine pair, catalog/UI)
 * stay RED until the P2 commission flip activates them together (Tasks 3-7).
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
  COMMISSIONED_PINS,
  COMMISSIONED_PROVIDERS,
  ProviderSelectionRequiredError,
  assertCommissionedPin,
  assertCommissionedDestination,
  commissionedProvider,
  isCommissionedPin,
  resolveExecutionProvider,
} from '@/lib/contentAiRegistry'
import {
  DEFAULT_BRIEF_PIN,
  DEFAULT_DRAFT_PIN,
  DEFAULT_REVIEW_PIN,
  LANE_HOSTS,
  STUDIO_MODELS,
  hostsForModel,
  modelsForLane,
  parseStudioPin,
} from '@/lib/contentAiCatalog'
import type { StudioModelId } from '@/lib/contentAiCatalog'
import { generateContentText, setVaultOverlay } from '@/lib/contentAiProvider'
import {
  ENGINE_COMPLEMENT_PROVIDER,
  ENGINE_LEAD_PROVIDER,
  enginePairReady,
} from '@/lib/seoEngine/engineAi'
import { resetEnginePairBreaker } from '@/lib/seoEngine/enginePairBreaker'

const P2_FLASH_MODEL_ID = 'deepseek-v41-flash' as unknown as StudioModelId

/** Retirement matrix (design §7) — every non-commissioned value is legacy. */
const LEGACY_PINS = [
  // Entrim families
  'entrim',
  'entrim-deepseek',
  'entrim-deepseek-v4-flash',
  'entrim-deepseek-v4-flash-0731',
  'entrim-qwen-27b',
  'qwen3.6-27b',
  'qwen3.8-27b',
  'qwen',
  // NVIDIA / Baseten / Parasail / Run BiOS
  'nvidia-minimax',
  'nvidia-nemotron',
  'nvidia-glm',
  'nvidia-deepseek',
  'baseten-deepseek',
  'baseten-deepseek-pro',
  'baseten-glm-fast',
  'baseten-glm-53-flash',
  'parasail',
  'parasail-deepseek',
  'parasail-deepseek-pro',
  'parasail-glm',
  'runbios-glm-53-flash',
  'runbios-glm-52',
  'runbios-claude-opus',
  'runbios-claude-sonnet',
  'runbios-kimi',
  'runbios-qwen',
  // Zai / AIHubmix / GLM aliases
  'zai-glm',
  'aihubmix-glm-fast',
  'glm-fast-aihubmix',
  'glm-5.2-fast',
  'glm-5.3-flash',
  'glm-5.3',
  // OpenAI / GPT aliases / other hosts
  'openai',
  'gpt-5.6',
  'gpt-5.6-terra',
  'gpt-5.6-sol',
  'gpt-5.6-luna',
  'cloudflare-ai',
  'groq',
  'gemini',
  'openrouter',
  'custom',
  'chatProvider-bridge',
  'bios-adaptive',
  'claude-opus-5',
  'claude-sonnet-5',
  'minimax',
  'minimax-m3',
  'nemotron-3-ultra',
  // DeepSeek historical pin/selector values (the upstream MODEL id
  // `deepseek-flash` is deliberately in this list — it is never a pin)
  'deepseek',
  'deepseek-flash',
  'deepseek-pro',
  'deepseek-official',
  'deepseek-official-flash',
  'deepseek-v4-flash',
  'deepseek-v4-pro',
] as const

const ENV_KEYS = ['XAI_API_KEY', 'DEEPSEEK_API_KEY', 'ENTRIM_API_KEY', 'CONTENT_AI_RETRY', 'CONTENT_AI_ALL_PROVIDERS'] as const
const savedEnv: Record<string, string | undefined> = {}
const originalFetch = global.fetch

beforeAll(() => {
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key]
})

beforeEach(() => {
  for (const key of ENV_KEYS) delete process.env[key]
  process.env.CONTENT_AI_RETRY = '1'
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

describe('commissioned provider registry (design §3.1-3.2)', () => {
  it('COMMISSIONED_PINS is exactly grok + deepseek-v41-flash', () => {
    expect(COMMISSIONED_PINS).toEqual(['grok', 'deepseek-v41-flash'])
    expect(COMMISSIONED_PROVIDERS.map((p) => p.pin)).toEqual(['grok', 'deepseek-v41-flash'])
  })

  it('deepseek-v41-flash keeps pin, display label, and upstream model id distinct', () => {
    const deepseek = commissionedProvider('deepseek-v41-flash')
    expect(deepseek).toMatchObject({
      pin: 'deepseek-v41-flash',
      label: 'DeepSeek V4.1 Flash',
      hostId: 'deepseek',
      apiModel: 'deepseek-flash',
      lanes: ['draft', 'brief', 'review', 'command'],
      streaming: true,
      transport: 'openai-compatible',
      baseUrl: 'https://api.deepseek.com/v1',
      baseUrlHost: 'api.deepseek.com',
      keyEnvs: ['DEEPSEEK_API_KEY'],
    })
    expect(typeof deepseek.isConfigured).toBe('function')
  })

  it('grok keeps the retained xAI transport identity and the grok-4.6 model', () => {
    const grok = commissionedProvider('grok')
    expect(grok).toMatchObject({
      pin: 'grok',
      hostId: 'xai',
      apiModel: 'grok-4.6',
      lanes: ['draft', 'brief', 'review', 'command'],
      streaming: true,
      transport: 'xai-responses',
      baseUrl: 'https://api.x.ai/v1',
      baseUrlHost: 'api.x.ai',
      keyEnvs: ['XAI_API_KEY'],
    })
  })

  it('the bare upstream model id deepseek-flash is NOT a commissioned pin', () => {
    expect(commissionedProvider('deepseek-v41-flash').apiModel).toBe('deepseek-flash')
    expect(isCommissionedPin('deepseek-flash')).toBe(false)
    expect(isCommissionedPin('deepseek')).toBe(false)
    expect(isCommissionedPin('deepseek-pro')).toBe(false)
  })

  it('isCommissionedPin accepts only the two pins', () => {
    expect(isCommissionedPin('grok')).toBe(true)
    expect(isCommissionedPin('deepseek-v41-flash')).toBe(true)
    for (const pin of LEGACY_PINS) {
      expect({ pin, commissioned: isCommissionedPin(pin) }).toEqual({ pin, commissioned: false })
    }
  })

  it('assertCommissionedPin throws a typed selection-required error for every legacy value', () => {
    expect(assertCommissionedPin('grok')).toBe('grok')
    expect(assertCommissionedPin('deepseek-v41-flash')).toBe('deepseek-v41-flash')
    for (const pin of LEGACY_PINS) {
      let caught: unknown
      try {
        assertCommissionedPin(pin)
      } catch (error) {
        caught = error
      }
      expect(caught).toBeInstanceOf(ProviderSelectionRequiredError)
      expect(caught as ProviderSelectionRequiredError).toMatchObject({
        code: 'selection_required',
        status: 409,
        legacyValue: pin,
      })
    }
  })

  it('destination assertion rejects any non-literal host with destination_violation', () => {
    expect(() => assertCommissionedDestination('https://api.deepseek.com/v1', 'api.deepseek.com')).not.toThrow()
    for (const url of ['https://api.entrim.ai/v1', 'https://api.deepseek.com.evil.example/v1', 'https://api.x.ai/v1']) {
      let caught: unknown
      try {
        assertCommissionedDestination(url, 'api.deepseek.com')
      } catch (error) {
        caught = error
      }
      expect(caught).toBeDefined()
      expect((caught as { code?: string }).code).toBe('destination_violation')
      expect(String((caught as Error).message)).toMatch(/destination/i)
    }
  })
})

describe('resolveExecutionProvider (design §3.6)', () => {
  it('explicit commissioned pins resolve exclusively with pinSource explicit', () => {
    expect(resolveExecutionProvider({ requestedPin: 'grok', lane: 'draft' })).toMatchObject({
      kind: 'commissioned',
      pin: 'grok',
      model: 'grok-4.6',
      pinSource: 'explicit',
    })
    expect(resolveExecutionProvider({ requestedPin: 'deepseek-v41-flash', lane: 'review' })).toMatchObject({
      kind: 'commissioned',
      pin: 'deepseek-v41-flash',
      model: 'deepseek-flash',
      pinSource: 'explicit',
    })
  })

  it('missing/auto pins resolve to the Grok lane default with pinSource lane_default', () => {
    for (const requestedPin of [undefined, null, '', 'auto']) {
      expect(resolveExecutionProvider({ requestedPin, lane: 'brief' })).toMatchObject({
        kind: 'commissioned',
        pin: 'grok',
        model: 'grok-4.6',
        pinSource: 'lane_default',
      })
    }
  })

  it('never returns a non-commissioned pin and never defaults a persisted legacy value', () => {
    for (const pin of LEGACY_PINS) {
      const resolved = resolveExecutionProvider({ requestedPin: pin, lane: 'draft' })
      expect(resolved).toMatchObject({ kind: 'needs_selection', legacyValue: pin })
      expect(resolved).not.toMatchObject({ kind: 'commissioned' })
      // A job holding any persisted legacy value must not fall through to the
      // lane default even when the request itself carries no pin.
      expect(resolveExecutionProvider({
        requestedPin: undefined,
        lane: 'draft',
        existingJob: { ai_provider: pin },
      })).toMatchObject({ kind: 'needs_selection', legacyValue: pin })
    }
  })

  it('a persisted commissioned job pin resolves from the job, not a default', () => {
    expect(resolveExecutionProvider({
      requestedPin: undefined,
      lane: 'draft',
      existingJob: { ai_provider: 'deepseek-v41-flash' },
    })).toMatchObject({ kind: 'commissioned', pin: 'deepseek-v41-flash', model: 'deepseek-flash' })
  })
})

describe('generateContentText execution gate (P2)', () => {
  it('a legacy pin rejects with ProviderSelectionRequiredError and makes zero outbound calls', async () => {
    process.env.XAI_API_KEY = 'test-xai-key'
    process.env.DEEPSEEK_API_KEY = 'test-deepseek-key'
    const fetchSpy = jest.fn(async () => {
      throw new Error('outbound provider request is forbidden for a legacy pin')
    })
    global.fetch = fetchSpy as unknown as typeof fetch

    let caught: unknown
    try {
      await generateContentText({
        aiProvider: 'entrim-deepseek',
        system: 'Write.',
        prompt: 'Write an article.',
        maxTokens: 128,
        skipQualityContract: true,
      })
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(ProviderSelectionRequiredError)
    expect(caught as ProviderSelectionRequiredError).toMatchObject({
      code: 'selection_required',
      status: 409,
      legacyValue: 'entrim-deepseek',
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('legacy pins near the old cascade never reach either commissioned host', async () => {
    process.env.XAI_API_KEY = 'test-xai-key'
    process.env.DEEPSEEK_API_KEY = 'test-deepseek-key'
    const urls: string[] = []
    global.fetch = jest.fn(async (input) => {
      urls.push(String(input))
      return new Response(JSON.stringify({ output_text: 'SHOULD-NOT-HAPPEN', status: 'completed' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as unknown as typeof fetch

    for (const pin of ['nvidia-deepseek', 'openai', 'deepseek-flash', 'entrim-qwen-27b'] as const) {
      await expect(generateContentText({
        aiProvider: pin,
        system: 'Write.',
        prompt: 'Write an article.',
        maxTokens: 128,
        skipQualityContract: true,
      })).rejects.toBeInstanceOf(ProviderSelectionRequiredError)
    }
    expect(urls).toEqual([])
  })

  it('a Grok-owned single-pin job never calls the DeepSeek host even with DEEPSEEK_API_KEY present', async () => {
    process.env.XAI_API_KEY = 'test-xai-key'
    process.env.DEEPSEEK_API_KEY = 'test-deepseek-key'
    const urls: string[] = []
    global.fetch = jest.fn(async (input) => {
      urls.push(String(input))
      return new Response(JSON.stringify({ output_text: 'GROK-ONLY-DRAFT', status: 'completed' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as unknown as typeof fetch

    const result = await generateContentText({
      aiProvider: 'grok',
      exclusive: true,
      system: 'Write.',
      prompt: 'Write an article.',
      maxTokens: 256,
      skipQualityContract: true,
    })

    expect(result.provider).toBe('grok')
    expect(result.text).toBe('GROK-ONLY-DRAFT')
    expect(urls.some((url) => url.includes('api.x.ai'))).toBe(true)
    expect(urls.some((url) => url.includes('api.deepseek.com'))).toBe(false)
  })
})

describe('Discover engine pair (design §13 decision 3)', () => {
  it('the engine pair is grok + deepseek-v41-flash', () => {
    expect(ENGINE_LEAD_PROVIDER).toBe('grok')
    expect(ENGINE_COMPLEMENT_PROVIDER).toBe('deepseek-v41-flash')
  })

  it('requires BOTH commissioned providers — no single-lead degradation', () => {
    resetEnginePairBreaker()
    delete process.env.XAI_API_KEY
    delete process.env.DEEPSEEK_API_KEY
    expect(enginePairReady()).toBe(false)

    process.env.XAI_API_KEY = 'test-xai-key'
    expect(enginePairReady()).toBe(false) // Grok alone is not the pair

    process.env.DEEPSEEK_API_KEY = 'test-deepseek-key'
    expect(enginePairReady()).toBe(true)

    delete process.env.XAI_API_KEY
    expect(enginePairReady()).toBe(false) // DeepSeek alone is not the pair either
  })
})

describe('Catalog UI parity (P2)', () => {
  it('every lane offers exactly the two commissioned models', () => {
    for (const lane of ['draft', 'brief', 'review', 'command'] as const) {
      expect({ lane, models: modelsForLane(lane).map((m) => m.id).sort() })
        .toEqual({ lane, models: ['deepseek-v41-flash', 'grok-4.6'] })
    }
    const flash = modelsForLane('brief').find((m) => m.id === P2_FLASH_MODEL_ID)
    expect(flash?.apiModel).toBe('deepseek-flash')
    expect(flash?.hosts.map((host) => host.id)).toEqual(['deepseek'])
    expect(flash?.hosts.map((host) => host.pin)).toEqual(['deepseek-v41-flash'])
  })

  it('every lane allows exactly the two commissioned hosts and no Entrim host survives', () => {
    for (const lane of ['draft', 'brief', 'review', 'command'] as const) {
      expect({ lane, hosts: LANE_HOSTS[lane] }).toEqual({ lane, hosts: ['xai', 'deepseek'] })
    }
    expect(hostsForModel('grok-4.6').map((host) => host.id)).toEqual(['xai'])
    expect(hostsForModel(P2_FLASH_MODEL_ID).map((host) => host.id)).toEqual(['deepseek'])
    expect(STUDIO_MODELS.every((model) => model.hosts.every((host) => host.id !== 'entrim'))).toBe(true)
  })

  it('legacy saved pins parse to needs_selection — never a Grok coercion', () => {
    for (const pin of ['entrim-deepseek', 'entrim-qwen-27b', 'parasail-deepseek', 'openai', 'deepseek-flash'] as const) {
      expect(parseStudioPin(pin)).toMatchObject({ kind: 'needs_selection', legacyValue: pin })
    }
    expect(parseStudioPin('totally-unknown-pin')).toMatchObject({ kind: 'needs_selection' })
    expect(parseStudioPin('grok')).toMatchObject({
      kind: 'commissioned',
      model: { id: 'grok-4.6' },
      host: { id: 'xai' },
    })
    expect(parseStudioPin('deepseek-v41-flash')).toMatchObject({
      kind: 'commissioned',
      model: { id: 'deepseek-v41-flash' },
      host: { id: 'deepseek' },
    })
  })

  it('defaults remain Grok 4.6 for a job with no requested provider', () => {
    expect(DEFAULT_DRAFT_PIN).toBe('grok')
    expect(DEFAULT_BRIEF_PIN).toBe('grok')
    expect(DEFAULT_REVIEW_PIN).toBe('grok')
  })
})
