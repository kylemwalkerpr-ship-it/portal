jest.mock('@/lib/aiKeyVault', () => ({
  buildVaultEnvOverrides: jest.fn(async () => ({})),
}))

import { generateContentText } from '@/lib/contentAiProvider'

/**
 * Regression for the 2026-08 incident: GPT-5.6 Sol/Terra are reasoning
 * models. When one burned its whole completion budget on chain-of-thought and
 * returned EMPTY content, the empty-content rescue re-asked with
 * `disableThinking`, which added a top-level `enable_thinking: false` to the
 * body. OpenAI REJECTS that field (400 "Unknown parameter: enable_thinking"),
 * turning a recoverable empty-content case into a hard failure.
 *
 * This locks the fix: the OpenAI provider must NEVER send enable_thinking,
 * including (especially) in the disableThinking rescue request.
 */
// SKIPPED: OpenAI transport is retired from the live catalog (2026-09-02
// owner-model policy). This suite exists only for the retired OpenAI payload.
describe.skip('content AI · OpenAI request payload', () => {
  const originalKey = process.env.OPENAI_API_KEY
  const originalModel = process.env.OPENAI_MODEL
  const originalAll = process.env.CONTENT_AI_ALL_PROVIDERS
  const originalFetch = global.fetch

  beforeEach(() => {
    // Break-glass: this validates the RETIRED OpenAI transport payload.
    // The live Entrim-only policy would redirect the pin before OpenAI.
    process.env.CONTENT_AI_ALL_PROVIDERS = '1'
  })

  afterEach(() => {
    if (originalKey == null) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = originalKey
    if (originalModel == null) delete process.env.OPENAI_MODEL
    else process.env.OPENAI_MODEL = originalModel
    if (originalAll == null) delete process.env.CONTENT_AI_ALL_PROVIDERS
    else process.env.CONTENT_AI_ALL_PROVIDERS = originalAll
    global.fetch = originalFetch
  })

  it('never sends enable_thinking to OpenAI — even in the disableThinking rescue path', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key'
    delete process.env.OPENAI_MODEL

    const bodies: Array<Record<string, unknown>> = []
    let call = 0
    global.fetch = jest.fn(async (_input, init) => {
      call++
      bodies.push(JSON.parse(String(init?.body || '{}')) as Record<string, unknown>)
      // First call: the reasoning model emits no final prose (empty content +
      // finish_reason:length) — this is exactly what triggers the
      // disableThinking rescue. Second call: the rescue re-ask returns prose.
      const payload =
        call === 1
          ? { choices: [{ message: { content: '' }, finish_reason: 'length' }] }
          : { choices: [{ message: { content: 'Complete brief JSON here.' }, finish_reason: 'stop' }] }
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as typeof fetch

    const result = await generateContentText({
      aiProvider: 'openai',
      model: 'gpt-5.6-terra',
      system: 'Produce a JSON brief.',
      prompt: 'TOPIC: dependent visa uk',
      maxTokens: 8000,
    })

    // The rescue re-ask fired (two requests) and the recovered text returned.
    expect(call).toBe(2)
    expect(result.provider).toBe('openai')
    expect(result.model).toBe('gpt-5.6-terra')
    expect(result.text).toContain('Complete brief JSON')

    // Regression core: neither request (normal nor disableThinking re-ask)
    // may carry enable_thinking, at top level or inside chat_template_kwargs.
    for (const body of bodies) {
      expect(body).not.toHaveProperty('enable_thinking')
      expect(body).not.toHaveProperty('chat_template_kwargs')
      expect(JSON.stringify(body)).not.toContain('enable_thinking')
    }

    // The first request still uses the correct reasoning-model params.
    expect(bodies[0]).toMatchObject({
      model: 'gpt-5.6-terra',
      max_completion_tokens: 8000,
    })
  })
})
