jest.mock('@/lib/aiKeyVault', () => ({
  buildVaultEnvOverrides: jest.fn(async () => ({})),
}))

import { generateContentTextStream } from '@/lib/contentAiProvider'

describe('content AI · NVIDIA Nemotron streaming', () => {
  const originalKey = process.env.NVIDIA_API_KEY
  const originalModel = process.env.NVIDIA_NEMOTRON_MODEL
  const originalFetch = global.fetch

  afterEach(() => {
    if (originalKey == null) delete process.env.NVIDIA_API_KEY
    else process.env.NVIDIA_API_KEY = originalKey
    if (originalModel == null) delete process.env.NVIDIA_NEMOTRON_MODEL
    else process.env.NVIDIA_NEMOTRON_MODEL = originalModel
    global.fetch = originalFetch
  })

  it('sends the Nemotron reasoning payload and emits answer deltas only', async () => {
    process.env.NVIDIA_API_KEY = 'test-nvidia-key'
    delete process.env.NVIDIA_NEMOTRON_MODEL
    let requestBody: Record<string, unknown> | null = null

    global.fetch = jest.fn(async (_input, init) => {
      requestBody = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>
      const chunks = [
        `data: ${JSON.stringify({ choices: [{ delta: { content: 'Visible answer' } }] })}\n\n`,
        'data: [DONE]\n\n',
      ].join('')
      return new Response(chunks, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      })
    }) as typeof fetch

    const events = []
    for await (const event of generateContentTextStream({
      system: 'Write a concise factual answer.',
      prompt: 'Explain the topic.',
      aiProvider: 'nvidia-nemotron',
      maxTokens: 1200,
    })) {
      events.push(event)
    }

    expect(requestBody).toMatchObject({
      model: 'nvidia/nemotron-3-ultra-550b-a55b',
      stream: true,
      max_tokens: 1200,
      top_p: 0.95,
      chat_template_kwargs: { enable_thinking: true },
    })
    expect(events).toContainEqual({ type: 'delta', text: 'Visible answer' })
    expect(events.some((event) => event.type === 'delta' && event.text.includes('private reasoning'))).toBe(false)
    expect(events.at(-1)).toMatchObject({ type: 'done', text: 'Visible answer', provider: 'nvidia-nemotron', model: 'nvidia/nemotron-3-ultra-550b-a55b' })
  })

  it('skips reasoning_content deltas — only final prose is streamed to the draft', async () => {
    process.env.NVIDIA_API_KEY = 'test-nvidia-key'
    delete process.env.NVIDIA_NEMOTRON_MODEL

    global.fetch = jest.fn(async (_input, init) => {
      const chunks = [
        `data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: 'private chain-of-thought' } }] })}\n\n`,
        `data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: 'still thinking...' } }] })}\n\n`,
        `data: ${JSON.stringify({ choices: [{ delta: { content: 'The real answer.' } }] })}\n\n`,
        'data: [DONE]\n\n',
      ].join('')
      return new Response(chunks, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      })
    }) as typeof fetch

    const events = []
    for await (const event of generateContentTextStream({
      system: 'Write a concise factual answer.',
      prompt: 'Explain the topic.',
      aiProvider: 'nvidia-nemotron',
      maxTokens: 1200,
    })) {
      events.push(event)
    }

    const texts = events.filter((e) => e.type === 'delta').map((e) => (e as { text: string }).text)
    expect(texts).toEqual(['The real answer.'])
    expect(texts.join('').includes('private chain-of-thought')).toBe(false)
    expect(texts.join('').includes('still thinking')).toBe(false)
    expect(events.at(-1)).toMatchObject({ type: 'done', text: 'The real answer.', provider: 'nvidia-nemotron', model: 'nvidia/nemotron-3-ultra-550b-a55b' })
  })
})
