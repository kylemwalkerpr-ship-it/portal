/**
 * Baseten DeepSeek V4 Flash · end-to-end drafting hardening — regression suite.
 *
 * The 0731 build occasionally spends its ENTIRE token budget on
 * reasoning_content and emits zero final prose. Before hardening this killed
 * whole provider cascades with "returned empty content" (e.g. the post-depth
 * quality refine). These tests lock in the three fixes:
 *
 *  1. Empty-content → thinking-OFF rescue (complete + stream): a reasoning
 *     model that returns no prose is re-asked with enable_thinking:false so
 *     it is forced to emit the article instead of bouncing the cascade.
 *  2. Empty responses are now RETRYABLE in withRetry — a single empty reply
 *     no longer immediately cascades to the next provider.
 *  3. Per-fetch timeout (CONTENT_AI_FETCH_TIMEOUT_MS, default 120s): a hung
 *     upstream fails fast so the provider cascade moves on instead of burning
 *     the whole per-candidate budget.
 */
jest.mock('@/lib/aiKeyVault', () => ({
  buildVaultEnvOverrides: jest.fn(async () => ({})),
}))

import { generateContentText, generateContentTextStream } from '@/lib/contentAiProvider'

describe('baseten DeepSeek V4 Flash · empty-content hardening', () => {
  const envKeys = [
    'BASETEN_API_KEY',
    'BASETEN_MODEL',
    'BASETEN_BASE_URL',
    'NVIDIA_API_KEY',
    'NVIDIA_DEEPSEEK_MODEL',
    'NVIDIA_MODEL',
    'NVIDIA_BASE_URL',
    'CONTENT_AI_RETRY',
    'CONTENT_AI_FETCH_TIMEOUT_MS',
  ] as const
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

  const sse = (events: string[]) =>
    new Response(events.join('') + 'data: [DONE]\n\n', {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    })

  const json = (payload: unknown) =>
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })

  it('complete path: empty prose → re-asks with thinking OFF and succeeds', async () => {
    process.env.BASETEN_API_KEY = 'test-baseten-key'
    process.env.CONTENT_AI_RETRY = '1'
    let calls = 0
    let rescueBody: Record<string, unknown> | null = null

    global.fetch = jest.fn(async (_input, init) => {
      calls++
      const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>
      if (calls === 2) rescueBody = body
      if (calls === 1) {
        // Reasoning model burned the whole budget on chain-of-thought.
        return json({ choices: [{ message: { content: '', reasoning_content: 'thinking…' } }] })
      }
      return json({ choices: [{ message: { content: 'Final article prose.' } }] })
    }) as typeof fetch

    const res = await generateContentText({
      system: 'Write a legal guide.',
      prompt: 'Explain visa requirements.',
      aiProvider: 'baseten-deepseek',
    })

    expect(calls).toBe(2)
    expect(res.text).toBe('Final article prose.')
    expect(res.provider).toBe('baseten-deepseek')
    // The rescue re-ask forced thinking OFF on the SAME provider — it must not
    // bounce the cascade to a different model.
    expect((rescueBody?.chat_template_kwargs as Record<string, unknown>)?.enable_thinking).toBe(false)
    expect(rescueBody).not.toHaveProperty('reasoning_budget')
  })

  it('complete path: persistent empty content is RETRIED, not cascaded instantly', async () => {
    process.env.BASETEN_API_KEY = 'test-baseten-key'
    process.env.CONTENT_AI_RETRY = '2'
    let calls = 0
    global.fetch = jest.fn(async () => {
      calls++
      return json({ choices: [{ message: { content: '' } }] })
    }) as typeof fetch

    await expect(
      generateContentText({
        system: 'Write.',
        prompt: 'Draft.',
        aiProvider: 'baseten-deepseek',
      }),
    ).rejects.toThrow(/returned empty content/i)

    // 2 attempts × (initial + thinking-off rescue) = 4 upstream calls — the
    // withRetry loop absorbed the empties instead of cascading on the first.
    expect(calls).toBe(4)
  })

  it('rescue neutralizes BOTH thinking flags (DeepSeek `thinking` + `enable_thinking`)', async () => {
    // nvidia-deepseek sends chat_template_kwargs: { thinking: true } — the
    // rescue must kill that flag too, or the re-ask silently thinks again.
    process.env.NVIDIA_API_KEY = 'test-nvidia-key'
    process.env.CONTENT_AI_RETRY = '1'
    let calls = 0
    let rescueBody: Record<string, unknown> | null = null

    global.fetch = jest.fn(async (_input, init) => {
      calls++
      const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>
      if (calls === 2) rescueBody = body
      if (calls === 1) {
        return json({ choices: [{ message: { content: '', reasoning_content: 'thinking…' } }] })
      }
      return json({ choices: [{ message: { content: 'DeepSeek prose.' } }] })
    }) as typeof fetch

    const res = await generateContentText({
      system: 'Write.',
      prompt: 'Draft.',
      aiProvider: 'nvidia-deepseek',
    })

    expect(calls).toBe(2)
    expect(res.text).toBe('DeepSeek prose.')
    const kw = (rescueBody?.chat_template_kwargs ?? {}) as Record<string, unknown>
    expect(kw.thinking).toBe(false)
    expect(kw.enable_thinking).toBe(false)
  })

  it('stream path: thinking-only deltas → thinking-OFF rescue yields final prose', async () => {
    process.env.BASETEN_API_KEY = 'test-baseten-key'
    let calls = 0
    let rescueBody: Record<string, unknown> | null = null

    global.fetch = jest.fn(async (_input, init) => {
      calls++
      const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>
      if (calls === 2) rescueBody = body
      if (calls === 1) {
        // Only reasoning_content deltas — no final prose, must not become the article.
        return sse([`data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: 'chain…' } }] })}\n\n`])
      }
      return sse([`data: ${JSON.stringify({ choices: [{ delta: { content: 'Rescued prose.' } }] })}\n\n`])
    }) as typeof fetch

    const events: Array<{ type: string; text?: string; provider?: string; model?: string }> = []
    for await (const ev of generateContentTextStream({
      system: 'Write.',
      prompt: 'Draft.',
      aiProvider: 'baseten-deepseek',
    })) {
      events.push(ev as { type: string; text?: string; provider?: string; model?: string })
    }

    const done = events.find((e) => e.type === 'done') as { type: 'done'; text: string; provider: string; model: string }
    expect(done?.text).toBe('Rescued prose.')
    expect(done?.provider).toBe('baseten-deepseek')
    expect((rescueBody?.chat_template_kwargs as Record<string, unknown>)?.enable_thinking).toBe(false)
  })

  it('hung upstream fails fast via per-fetch timeout (no cascade hang)', async () => {
    process.env.BASETEN_API_KEY = 'test-baseten-key'
    process.env.CONTENT_AI_RETRY = '1'
    process.env.CONTENT_AI_FETCH_TIMEOUT_MS = '700'
    // Never settles unless aborted — upstream is hung. The per-fetch deadline
    // must win; the abort signal releases the pending handle so jest exits.
    global.fetch = jest.fn((_input, init) => {
      const signal = init?.signal as AbortSignal | undefined
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      })
    }) as typeof fetch

    const started = Date.now()
    await expect(
      generateContentText({
        system: 'Write.',
        prompt: 'Draft.',
        aiProvider: 'baseten-deepseek',
      }),
    ).rejects.toThrow(/timed out after|AbortError|aborted/i)

    // ~700ms deadline + overhead — nowhere near the old unbounded hang.
    expect(Date.now() - started).toBeLessThan(10_000)
  })
})
