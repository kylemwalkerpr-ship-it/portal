/**
 * Master Engine / Discover helper: OpenAI primary, Grok fallback.
 */

jest.mock('@/lib/aiKeyVault', () => ({
  buildVaultEnvOverrides: jest.fn(async () => ({})),
  getAiSettings: jest.fn(async () => ({})),
  setAiSetting: jest.fn(async () => undefined),
  deleteAiSetting: jest.fn(async () => undefined),
}))

import { generateEngineText, ENGINE_FALLBACK_PROVIDER } from '@/lib/seoEngine/engineAi'

describe('generateEngineText — Grok is the default engine fallback', () => {
  const envKeys = ['OPENAI_API_KEY', 'XAI_API_KEY', 'CONTENT_AI_RETRY'] as const
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

  it('exports grok as the engine fallback', () => {
    expect(ENGINE_FALLBACK_PROVIDER).toBe('grok')
  })

  it('falls back to Grok when the OpenAI primary fails', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key'
    process.env.XAI_API_KEY = 'test-xai-key'
    process.env.CONTENT_AI_RETRY = '1'

    global.fetch = jest.fn(async (input) => {
      const url = String(input)
      if (url.includes('api.openai.com')) throw new Error('openai 429 insufficient_quota')
      return new Response(
        JSON.stringify({ choices: [{ message: { content: 'GROK-ENGINE' }, finish_reason: 'stop' }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }) as typeof fetch

    const result = await generateEngineText({
      aiProvider: 'openai',
      system: 'You summarize immigration policy.',
      prompt: 'Summarize this IRCC notice.',
    })
    expect(result.provider).toBe('grok')
    expect(result.text).toBe('GROK-ENGINE')
  })
})
