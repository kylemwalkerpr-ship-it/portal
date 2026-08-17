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
  isPaymentOrQuotaFailure,
  isReasoningModelId,
} from '@/lib/contentAiProvider'
import { generateBriefText } from '@/lib/seoFactory/briefModel'

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
  })

  it('does not honor a 90s brief deadline for Grok', () => {
    expect(deadlineForProvider('grok', 90_000)).toBeGreaterThanOrEqual(180_000)
    expect(deadlineForProvider('openai', 90_000)).toBe(90_000)
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
  })

  it('Generate Full Brief on grok calls /v1/responses with grok-4.6', async () => {
    process.env.XAI_API_KEY = 'supergrok-oauth-token'
    process.env.XAI_MODEL = 'grok-4.6'
    process.env.CONTENT_AI_RETRY = '1'

    const urls: string[] = []
    global.fetch = jest.fn(async (input) => {
      urls.push(String(input))
      return new Response(JSON.stringify({
        output_text: '{"suggestedH1":"Grok brief","h2Outline":["A"]}',
        status: 'completed',
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch

    const result = await generateBriefText({
      aiProvider: 'grok',
      system: 'Return JSON.',
      prompt: 'TOPIC: opt cap',
    })

    expect(result.fallbackUsed).toBe(false)
    expect(result.ai.provider).toBe('grok')
    expect(result.ai.model).toBe('grok-4.6')
    expect(result.ai.text).toContain('suggestedH1')
    expect(urls.some((u) => u.includes('/responses'))).toBe(true)
    expect(urls.some((u) => u.includes('/chat/completions'))).toBe(false)
  })

  it('unpaid OpenAI exclusive pin falls through to SuperGrok', async () => {
    process.env.OPENAI_API_KEY = 'unpaid-openai'
    process.env.XAI_API_KEY = 'supergrok-oauth-token'
    process.env.CONTENT_AI_RETRY = '1'

    global.fetch = jest.fn(async (input) => {
      const url = String(input)
      if (url.includes('api.openai.com')) throw new Error('openai 429 insufficient_quota')
      return new Response(JSON.stringify({
        output_text: 'GROK-PAID-FALLBACK',
        status: 'completed',
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch

    const result = await generateContentText({
      aiProvider: 'openai',
      exclusive: true,
      system: 'Say ok',
      prompt: 'ok',
    })
    expect(result.provider).toBe('grok')
    expect(result.text).toBe('GROK-PAID-FALLBACK')
  })
})
