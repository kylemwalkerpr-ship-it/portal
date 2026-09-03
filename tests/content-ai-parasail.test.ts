jest.mock('@/lib/aiKeyVault', () => ({
  buildVaultEnvOverrides: jest.fn(async () => ({})),
  AI_PROVIDERS: jest.requireActual('@/lib/aiKeyVault').AI_PROVIDERS,
}))

import {
  canonicalizeDeepseekModelId,
  canonicalizeParasailGlmModelId,
  getParasailDeepseekProProvider,
  getParasailDeepseekProvider,
  getParasailGlmProvider,
  isParasailConfigured,
  isUnavailableDeploymentError,
  listConfiguredContentProviders,
  looksLikeParasailKey,
  parasailProReasoningEffort,
  resolveAiProviderPin,
  resolveParasailApiKey,
} from '@/lib/contentAiProvider'
import { AI_PROVIDERS } from '@/lib/aiKeyVault'

describe('content AI · Parasail (psk- keys)', () => {
  const envKeys = [
    'PARASAIL_API_KEY',
    'PARASAIL_BASE_URL',
    'PARASAIL_DEEPSEEK_MODEL',
    'PARASAIL_DEEPSEEK_PRO_MODEL',
    'PARASAIL_PRO_REASONING_EFFORT',
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
    // Break-glass: this suite validates the RETIRED Parasail transports.
    // The live Entrim-only policy would redirect its pins, so restore the
    // legacy full cascade for the whole suite.
    process.env.CONTENT_AI_ALL_PROVIDERS = '1'
  })

  afterEach(() => {
    for (const k of envKeys) {
      if (original[k] == null) delete process.env[k]
      else process.env[k] = original[k]
    }
    if (original.CONTENT_AI_ALL_PROVIDERS == null) delete process.env.CONTENT_AI_ALL_PROVIDERS
    else process.env.CONTENT_AI_ALL_PROVIDERS = original.CONTENT_AI_ALL_PROVIDERS
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
    // Live provider reporting lists only the three live backends — Parasail
    // is retired from the catalog even though the resolver still recognizes a
    // pasted psk- key for itself.
    const ids = listConfiguredContentProviders()
    expect(ids.some((p) => p.id === 'parasail-deepseek')).toBe(false)
    expect(ids.some((p) => p.id === 'parasail-deepseek-pro')).toBe(false)
    expect(ids.some((p) => p.id === 'parasail-glm')).toBe(false)
    expect(ids.some((p) => p.id === 'openai')).toBe(false)
  })

  it('never sends an undated DeepSeek V4 base id — only Flash-0731 / Pro-0813', () => {
    expect(canonicalizeDeepseekModelId('deepseek-ai/DeepSeek-V4-Flash')).toBe('deepseek-ai/DeepSeek-V4-Flash-0731')
    expect(canonicalizeDeepseekModelId('deepseek-v4-flash')).toBe('deepseek-ai/DeepSeek-V4-Flash-0731')
    expect(canonicalizeDeepseekModelId('deepseek-chat')).toBe('deepseek-ai/DeepSeek-V4-Flash-0731')
    expect(canonicalizeDeepseekModelId('DeepSeek-V4-Flash-0731')).toBe('deepseek-ai/DeepSeek-V4-Flash-0731')
    expect(canonicalizeDeepseekModelId('deepseek-ai/DeepSeek-V4-Pro', 'pro')).toBe('deepseek-ai/DeepSeek-V4-Pro-0813')
    expect(canonicalizeDeepseekModelId('deepseek-v4-pro')).toBe('deepseek-ai/DeepSeek-V4-Pro-0813')
    expect(canonicalizeDeepseekModelId('deepseek-ai/DeepSeek-V4-Pro-0813', 'pro')).toBe('deepseek-ai/DeepSeek-V4-Pro-0813')
  })

  it('uses Flash-0731 for draft and Pro-0813 at low effort for research/review', () => {
    process.env.PARASAIL_API_KEY = 'psk-test-dedicated'
    const flash = getParasailDeepseekProvider()
    const pro = getParasailDeepseekProProvider()
    const glm = getParasailGlmProvider()
    expect(flash!.model).toBe('deepseek-ai/DeepSeek-V4-Flash-0731')
    expect(pro!.model).toBe('deepseek-ai/DeepSeek-V4-Pro-0813')
    expect(glm!.model).toBe('z-ai/glm-5.2')
    expect(pro!.extraBody).toEqual({ reasoning_effort: 'low' })
    expect(parasailProReasoningEffort()).toBe('low')
    process.env.PARASAIL_PRO_REASONING_EFFORT = 'medium'
    expect(parasailProReasoningEffort()).toBe('medium')
    process.env.PARASAIL_PRO_REASONING_EFFORT = 'high'
    expect(parasailProReasoningEffort()).toBe('low')
    expect(glm!.label).toBe('parasail-glm')
  })

  it('Parasail is removed from the Configure vault catalog (retired host)', () => {
    const ids = AI_PROVIDERS.map((p) => p.id)
    expect(ids).not.toContain('parasail-deepseek')
    expect(ids).not.toContain('parasail-deepseek-pro')
    expect(ids).not.toContain('parasail-glm')
    expect(ids).toEqual(expect.arrayContaining(['entrim-deepseek', 'entrim-qwen-27b', 'grok']))
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
    expect(resolveAiProviderPin('nvidia/GLM-5.2-NVFP4').prefer).toBe('parasail-glm')
    expect(canonicalizeParasailGlmModelId('nvidia/GLM-5.2-NVFP4')).toBe('z-ai/glm-5.2')
    expect(canonicalizeParasailGlmModelId('')).toBe('z-ai/glm-5.2')
    const pro = resolveAiProviderPin('deepseek-ai/DeepSeek-V4-Pro-0813')
    expect(pro.explicit).toBe('parasail-deepseek-pro')
    expect(pro.prefer).toBe('parasail-deepseek-pro')
  })

  it('remaps a retired NVFP4 env onto the live Parasail GLM id', () => {
    process.env.PARASAIL_API_KEY = 'psk-test-dedicated'
    process.env.PARASAIL_GLM_MODEL = 'nvidia/GLM-5.2-NVFP4'
    expect(getParasailGlmProvider()!.model).toBe('z-ai/glm-5.2')
    expect(isUnavailableDeploymentError(new Error('parasail-glm stream 404: Deployment nvidia/GLM-5.2-NVFP4 doesn\'t exist or isn\'t accessible.'))).toBe(true)
  })
})
