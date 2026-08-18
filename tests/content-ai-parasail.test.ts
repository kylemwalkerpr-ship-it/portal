import {
  getParasailDeepseekProvider,
  getParasailGlmProvider,
  isParasailConfigured,
  listConfiguredContentProviders,
  looksLikeParasailKey,
  resolveAiProviderPin,
  resolveParasailApiKey,
} from '@/lib/contentAiProvider'
import { AI_PROVIDERS } from '@/lib/aiKeyVault'

describe('content AI · Parasail (psk- keys)', () => {
  const envKeys = [
    'PARASAIL_API_KEY',
    'PARASAIL_BASE_URL',
    'PARASAIL_DEEPSEEK_MODEL',
    'PARASAIL_GLM_MODEL',
    'OPENAI_API_KEY',
    'CUSTOM_AI_API_KEY',
    'DEEPSEEK_API_KEY',
  ] as const
  const original: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const k of envKeys) {
      original[k] = process.env[k]
      delete process.env[k]
    }
  })

  afterEach(() => {
    for (const k of envKeys) {
      if (original[k] == null) delete process.env[k]
      else process.env[k] = original[k]
    }
  })

  it('recognizes the psk- key prefix', () => {
    expect(looksLikeParasailKey('psk-example')).toBe(true)
    expect(looksLikeParasailKey('PSK-EXAMPLE')).toBe(true)
    expect(looksLikeParasailKey('sk-openai')).toBe(false)
    expect(looksLikeParasailKey('')).toBe(false)
  })

  it('is configured when PARASAIL_API_KEY is set', () => {
    expect(isParasailConfigured()).toBe(false)
    process.env.PARASAIL_API_KEY = 'psk-test-dedicated'
    expect(isParasailConfigured()).toBe(true)
    expect(resolveParasailApiKey()).toBe('psk-test-dedicated')
  })

  it('treats a psk- key pasted into OPENAI_API_KEY as Parasail, not OpenAI', () => {
    process.env.OPENAI_API_KEY = 'psk-pasted-in-openai-slot'
    expect(isParasailConfigured()).toBe(true)
    expect(resolveParasailApiKey()).toBe('psk-pasted-in-openai-slot')
    const ids = listConfiguredContentProviders()
    expect(ids).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'parasail-deepseek', configured: true }),
      expect.objectContaining({ id: 'parasail-glm', configured: true }),
      expect.objectContaining({ id: 'openai', configured: false }),
    ]))
  })

  it('exposes DeepSeek V4 Flash and GLM 5.2 on api.parasail.io', () => {
    process.env.PARASAIL_API_KEY = 'psk-test-dedicated'
    const deepseek = getParasailDeepseekProvider()
    const glm = getParasailGlmProvider()
    expect(deepseek).not.toBeNull()
    expect(glm).not.toBeNull()
    expect(deepseek!.label).toBe('parasail-deepseek')
    expect(deepseek!.baseURL).toBe('https://api.parasail.io/v1')
    expect(deepseek!.model).toBe('parasail-deepseek-v4-flash')
    expect(glm!.label).toBe('parasail-glm')
    expect(glm!.model).toBe('parasail-glm-52')
  })

  it('lists Parasail in the Configure vault catalog as a grouped host', () => {
    const ids = AI_PROVIDERS.map((p) => p.id)
    expect(ids).toContain('parasail-deepseek')
    expect(ids).toContain('parasail-glm')
    const deepseek = AI_PROVIDERS.find((p) => p.id === 'parasail-deepseek')
    expect(deepseek?.vaultGroup).toBe('parasail')
    expect(deepseek?.vaultGroupLabel).toMatch(/Parasail/i)
    expect(deepseek?.keyEnv).toBe('PARASAIL_API_KEY')
    // Vault catalog order: Parasail sits with the other drafting hosts, not after the long fallback tail.
    expect(ids.indexOf('parasail-deepseek')).toBeLessThan(ids.indexOf('cloudflare-ai'))
  })

  it('resolves Parasail pins and aliases', () => {
    process.env.PARASAIL_API_KEY = 'psk-test-dedicated'
    for (const raw of ['parasail', 'parasail-deepseek', 'PARASAIL-DEEPSEEK-V4-FLASH']) {
      const { explicit, prefer } = resolveAiProviderPin(raw)
      expect({ raw, explicit, prefer }).toEqual({
        raw,
        explicit: 'parasail-deepseek',
        prefer: 'parasail-deepseek',
      })
    }
    const glm = resolveAiProviderPin('parasail-glm-52')
    expect(glm.explicit).toBe('parasail-glm')
    expect(glm.prefer).toBe('parasail-glm')
  })
})
