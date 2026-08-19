jest.mock('@/lib/aiKeyVault', () => ({
  buildVaultEnvOverrides: jest.fn(async () => ({})),
  AI_PROVIDERS: jest.requireActual('@/lib/aiKeyVault').AI_PROVIDERS,
}))

import {
  canonicalizeDeepseekModelId,
  canonicalizeParasailGlmModelId,
  generateContentText,
  generateContentTextStream,
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
      expect.objectContaining({ id: 'parasail-deepseek-pro', configured: true }),
      expect.objectContaining({ id: 'parasail-glm', configured: true }),
      expect.objectContaining({ id: 'openai', configured: false }),
    ]))
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

  it('lists Parasail in the Configure vault catalog as a grouped host', () => {
    const ids = AI_PROVIDERS.map((p) => p.id)
    expect(ids).toContain('parasail-deepseek')
    expect(ids).toContain('parasail-deepseek-pro')
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
    expect(resolveAiProviderPin('nvidia/GLM-5.2-NVFP4').prefer).toBe('parasail-glm')
    expect(canonicalizeParasailGlmModelId('nvidia/GLM-5.2-NVFP4')).toBe('z-ai/glm-5.2')
    expect(canonicalizeParasailGlmModelId('')).toBe('z-ai/glm-5.2')
    const pro = resolveAiProviderPin('deepseek-ai/DeepSeek-V4-Pro-0813')
    expect(pro.explicit).toBe('parasail-deepseek-pro')
    expect(pro.prefer).toBe('parasail-deepseek-pro')
  })

  it('reviewer exclusive pin skips the drafter quality contract', async () => {
    process.env.PARASAIL_API_KEY = 'psk-test-dedicated'
    const originalFetch = global.fetch
    const bodies: Array<Record<string, unknown>> = []
    global.fetch = jest.fn(async (_input, init) => {
      bodies.push(JSON.parse(String(init?.body || '{}')) as Record<string, unknown>)
      return new Response(
        JSON.stringify({ choices: [{ message: { content: '## Fixed\n\nDisclaimer added.' }, finish_reason: 'stop' }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }) as typeof fetch
    try {
      await generateContentText({
        aiProvider: 'parasail-deepseek-pro',
        exclusive: true,
        skipQualityContract: true,
        system: 'You are a master SEO content editor. Return ONLY the complete fixed article.',
        prompt: 'Fix missing_disclaimer',
        maxTokens: 2048,
      })
      const system = String((bodies[0].messages as Array<{ role: string; content: string }>)[0].content)
      expect(system).toContain('master SEO content editor')
      expect(system).not.toContain('MANDATORY QUALITY RULES')
      expect(bodies[0].model).toBe('deepseek-ai/DeepSeek-V4-Pro-0813')
    } finally {
      global.fetch = originalFetch
    }
  })

  it('remaps a retired NVFP4 env onto the live Parasail GLM id', () => {
    process.env.PARASAIL_API_KEY = 'psk-test-dedicated'
    process.env.PARASAIL_GLM_MODEL = 'nvidia/GLM-5.2-NVFP4'
    expect(getParasailGlmProvider()!.model).toBe('z-ai/glm-5.2')
    expect(isUnavailableDeploymentError(new Error('parasail-glm stream 404: Deployment nvidia/GLM-5.2-NVFP4 doesn\'t exist or isn\'t accessible.'))).toBe(true)
  })

  it('draft picker 404 on GLM cascades to the next Parasail model instead of closing the job', async () => {
    process.env.PARASAIL_API_KEY = 'psk-test-dedicated'
    const originalFetch = global.fetch
    const models: string[] = []
    global.fetch = jest.fn(async (_input, init) => {
      const payload = JSON.parse(String(init?.body || '{}')) as { model?: string }
      models.push(String(payload.model || ''))
      if (payload.model === 'z-ai/glm-5.2') {
        return new Response(
          JSON.stringify({ error: { message: "Deployment nvidia/GLM-5.2-NVFP4 doesn't exist or isn't accessible.", type: 'invalid_request_error' } }),
          { status: 404, headers: { 'content-type': 'application/json' } },
        )
      }
      const chunks = [
        `data: ${JSON.stringify({ choices: [{ delta: { content: 'Fallback draft body' } }] })}\n\n`,
        'data: [DONE]\n\n',
      ].join('')
      return new Response(chunks, { status: 200, headers: { 'content-type': 'text/event-stream' } })
    }) as typeof fetch
    try {
      const events: Array<{ type: string; text?: string; model?: string }> = []
      for await (const ev of generateContentTextStream({
        system: 'Write.',
        prompt: 'Hello',
        aiProvider: 'parasail-glm',
        maxTokens: 400,
      })) {
        events.push(ev)
      }
      expect(models[0]).toBe('z-ai/glm-5.2')
      expect(events.some((e) => e.type === 'provider' && String(e.model || '').includes('FAILED'))).toBe(true)
      expect(events.some((e) => e.type === 'delta' && String(e.text || '').includes('Fallback draft body'))).toBe(true)
      expect(events.at(-1)).toMatchObject({ type: 'done', text: 'Fallback draft body' })
    } finally {
      global.fetch = originalFetch
    }
  })

  it('exclusive GLM pin still fail-closes (Research brief)', async () => {
    process.env.PARASAIL_API_KEY = 'psk-test-dedicated'
    const originalFetch = global.fetch
    global.fetch = jest.fn(async () => new Response(
      JSON.stringify({ error: { message: "Deployment doesn't exist or isn't accessible." } }),
      { status: 404 },
    )) as typeof fetch
    try {
      await expect((async () => {
        for await (const _ev of generateContentTextStream({
          system: 'Write.',
          prompt: 'Hello',
          aiProvider: 'parasail-glm',
          exclusive: true,
          maxTokens: 200,
        })) { /* drain */ }
      })()).rejects.toThrow(/Explicit AI provider "parasail-glm" failed/)
    } finally {
      global.fetch = originalFetch
    }
  })
})
