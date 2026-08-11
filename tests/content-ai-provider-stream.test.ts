jest.mock('@/lib/aiKeyVault', () => ({
  buildVaultEnvOverrides: jest.fn(async () => ({})),
}))

import { generateContentTextStream, NVIDIA_NEMOTRON_REASONING_BUDGET_DEFAULT } from '@/lib/contentAiProvider'

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

  it('resumes the SAME provider when a stream truncates at the token limit — no cascade bounce', async () => {
    process.env.NVIDIA_API_KEY = 'test-nvidia-key'
    delete process.env.NVIDIA_NEMOTRON_MODEL
    const bodies: Array<Record<string, unknown>> = []
    let call = 0

    global.fetch = jest.fn(async (_input, init) => {
      call++
      bodies.push(JSON.parse(String(init?.body || '{}')) as Record<string, unknown>)
      const chunks =
        call === 1
          ? [
              `data: ${JSON.stringify({ choices: [{ delta: { content: 'Part one of the draft.' } }] })}\n\n`,
              // The signal that the model hit its token cap mid-article.
              `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'length' }] })}\n\n`,
              'data: [DONE]\n\n',
            ].join('')
          : [
              `data: ${JSON.stringify({ choices: [{ delta: { content: 'Part two continues.' } }] })}\n\n`,
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
      prompt: 'Explain the topic fully.',
      aiProvider: 'nvidia-nemotron',
      maxTokens: 1200,
    })) {
      events.push(event)
    }

    // One continuation, not a bounce to another provider.
    expect(call).toBe(2)
    // The second request is the continuation prompt carrying the partial draft.
    const secondUser =
      (bodies[1].messages as Array<{ role: string; content: string }>)?.find((m) => m.role === 'user')?.content || ''
    expect(secondUser).toContain('CONTINUE WRITING THE DRAFT')
    expect(secondUser).toContain('Part one of the draft.')
    // The separate reasoning budget is sent so thinking stays ON without
    // starving content (NVIDIA NIM `reasoning_budget` from the operator example).
    expect(bodies[0].reasoning_budget).toBe(NVIDIA_NEMOTRON_REASONING_BUDGET_DEFAULT)
    // Both parts stream (with a clean paragraph break) and the done payload
    // carries the recovered full text.
    const texts = events.filter((e) => e.type === 'delta').map((e) => (e as { text: string }).text)
    expect(texts).toEqual(['Part one of the draft.', '\n\n', 'Part two continues.'])
    expect(events.at(-1)).toMatchObject({ type: 'done', text: 'Part one of the draft.\n\nPart two continues.', provider: 'nvidia-nemotron', model: 'nvidia/nemotron-3-ultra-550b-a55b' })
  })
})
