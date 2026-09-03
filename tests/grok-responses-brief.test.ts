/**
 * Grok 4.6 Full Brief transport: Responses API + unpaid-fallback.
 */

jest.mock('@/lib/aiKeyVault', () => ({
  buildVaultEnvOverrides: jest.fn(async () => ({})),
  getAiSettings: jest.fn(async () => ({})),
  setAiSetting: jest.fn(async () => undefined),
  deleteAiSetting: jest.fn(async () => undefined),
}))

import {
  deadlineForProvider,
  extractResponsesText,
  generateContentText,
  grokModelId,
  grokRequestLimits,
  isPaymentOrQuotaFailure,
  isReasoningModelId,
} from '@/lib/contentAiProvider'

describe('Grok 4.6 Responses transport', () => {
  const envKeys = ['XAI_API_KEY', 'XAI_MODEL', 'OPENAI_API_KEY', 'CONTENT_AI_RETRY'] as const
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

  it('treats grok-4.6 as a reasoning model', () => {
    expect(isReasoningModelId('grok-4.6')).toBe(true)
    expect(isReasoningModelId('grok-4.5')).toBe(true)
    expect(isReasoningModelId('glm-5.3-flash')).toBe(true)
  })

  it('never sends the reviewer alias "grok" as an xAI model id', () => {
    delete process.env.XAI_MODEL
    expect(grokModelId({ model: 'grok' })).toBe('grok-4.6')
    expect(grokModelId({ model: 'SuperGrok' })).toBe('grok-4.6')
    expect(grokModelId({ model: 'xai' })).toBe('grok-4.6')
    expect(grokModelId({ model: 'grok-4.6' })).toBe('grok-4.6')
    expect(grokModelId({ model: 'grok-4-1-fast' })).toBe('grok-4-1-fast')
  })

  it('does not honor a 90s brief deadline for Grok', () => {
    expect(deadlineForProvider('grok', 90_000)).toBeGreaterThanOrEqual(180_000)
    expect(deadlineForProvider('runbios-glm-53-flash', 90_000)).toBeGreaterThanOrEqual(600_000)
    expect(deadlineForProvider('openai', 90_000)).toBe(90_000)
  })

  it('honors a strict short deadline for visibility-audit pings', () => {
    expect(deadlineForProvider('grok', 14_000, true)).toBe(14_000)
    expect(deadlineForProvider('parasail-deepseek', 14_000, true)).toBe(14_000)
  })

  it('caps draft token budget and uses low reasoning so Grok can finish', () => {
    expect(grokRequestLimits(16384)).toEqual({ maxOutputTokens: 8192, reasoningEffort: 'low' })
    expect(grokRequestLimits(2500)).toEqual({ maxOutputTokens: 2500, reasoningEffort: 'medium' })
  })

  it('honors an explicit high-effort override for the Master Engine pair', () => {
    expect(grokRequestLimits(16384, 'high')).toEqual({ maxOutputTokens: 4096, reasoningEffort: 'high' })
  })

  it('extracts output_text and output[].content[].text', () => {
    expect(extractResponsesText({ output_text: '  HELLO  ' })).toBe('HELLO')
    expect(extractResponsesText({
      output: [{ type: 'message', content: [{ type: 'output_text', text: '{"ok":true}' }] }],
    })).toBe('{"ok":true}')
  })

  it('detects unpaid / quota failures', () => {
    expect(isPaymentOrQuotaFailure(new Error('openai 429 insufficient_quota'))).toBe(true)
    expect(isPaymentOrQuotaFailure(new Error('You exceeded your current quota'))).toBe(true)
    expect(isPaymentOrQuotaFailure(new Error('timeout'))).toBe(false)
    expect(isPaymentOrQuotaFailure(new Error(
      'grok 403: {"code":"permission-denied","error":"Your team 4f1b898f-d114-41b9-b8ef-136fbbf33005 has either used all available credits or reached its monthly spending limit. To continue making API requests, please purchase more credits or raise yo"}',
    ))).toBe(true)
  })

  it('a grok pin calls /v1/responses with grok-4.6 (live transport)', async () => {
    process.env.XAI_API_KEY = 'supergrok-oauth-token'
    process.env.XAI_MODEL = 'grok-4.6'
    process.env.CONTENT_AI_RETRY = '1'
    delete process.env.CONTENT_AI_ALL_PROVIDERS

    const urls: string[] = []
    global.fetch = jest.fn(async (input) => {
      urls.push(String(input))
      return new Response(JSON.stringify({
        output_text: '{"suggestedH1":"Grok brief","h2Outline":["A"]}',
        status: 'completed',
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch

    const result = await generateContentText({
      aiProvider: 'grok',
      system: 'Return JSON.',
      prompt: 'TOPIC: opt cap',
    })

    expect(result.provider).toBe('grok')
    expect(result.model).toBe('grok-4.6')
    expect(result.text).toContain('suggestedH1')
    expect(urls.some((u) => u.includes('/responses'))).toBe(true)
    expect(urls.some((u) => u.includes('/chat/completions'))).toBe(false)
  })

  it('an exclusive grok owner failing hard does NOT silently draft on another backend', async () => {
    process.env.XAI_API_KEY = 'supergrok-oauth-token'
    process.env.ENTRIM_API_KEY = 'entrim-key'
    process.env.CONTENT_AI_RETRY = '1'
    delete process.env.CONTENT_AI_ALL_PROVIDERS

    const urls: string[] = []
    global.fetch = jest.fn(async (input) => {
      urls.push(String(input))
      return new Response(JSON.stringify({
        output_text: 'GROK-ONLY',
        status: 'completed',
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch

    const result = await generateContentText({
      aiProvider: 'grok',
      exclusive: true,
      system: 'Say ok',
      prompt: 'ok',
    })
    expect(result.provider).toBe('grok')
    expect(result.text).toBe('GROK-ONLY')
    // Exclusive owner: the Entrim backend was never invoked.
    expect(urls.every((u) => u.includes('api.x.ai'))).toBe(true)
  })
})
