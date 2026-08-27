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

  it('sends the MiniMax drafting payload through NVIDIA Integrate', async () => {
    process.env.NVIDIA_API_KEY = 'test-nvidia-key'
    let requestBody: Record<string, unknown> | null = null

    global.fetch = jest.fn(async (_input, init) => {
      requestBody = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>
      const chunks = [
        `data: ${JSON.stringify({ choices: [{ delta: { content: 'MiniMax draft text' } }] })}\n\n`,
        'data: [DONE]\n\n',
      ].join('')
      return new Response(chunks, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      })
    }) as typeof fetch

    const events = []
    for await (const event of generateContentTextStream({
      system: 'Write an article.',
      prompt: 'Draft the article.',
      aiProvider: 'nvidia-minimax',
      maxTokens: 1200,
    })) {
      events.push(event)
    }

    expect(requestBody).toMatchObject({
      model: 'minimaxai/minimax-m3',
      stream: true,
      max_tokens: 1200,
      temperature: 1,
      top_p: 0.95,
    })
    expect(requestBody).not.toHaveProperty('max_completion_tokens')
    expect(events).toContainEqual({ type: 'delta', text: 'MiniMax draft text' })
    expect(events.at(-1)).toMatchObject({
      type: 'done',
      provider: 'nvidia-minimax',
      model: 'minimaxai/minimax-m3',
      text: 'MiniMax draft text',
    })
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
    // Nemotron uses NVIDIA's documented `max_tokens` contract; do not send
    // the unsupported generic reasoning_budget field.
    expect(bodies[0].max_tokens).toBe(1200)
    expect(bodies[0]).not.toHaveProperty('reasoning_budget')
    // Both parts stream (with a clean paragraph break) and the done payload
    // carries the recovered full text.
    const texts = events.filter((e) => e.type === 'delta').map((e) => (e as { text: string }).text)
    expect(texts).toEqual(['Part one of the draft.', '\n\n', 'Part two continues.'])
    expect(events.at(-1)).toMatchObject({ type: 'done', text: 'Part one of the draft.\n\nPart two continues.', provider: 'nvidia-nemotron', model: 'nvidia/nemotron-3-ultra-550b-a55b' })
  })

  it('falls through from a MiniMax 429 to configured Baseten Flash before the provider cap', async () => {
    process.env.NVIDIA_API_KEY = 'test-nvidia-key'
    process.env.BASETEN_API_KEY = 'test-baseten-key'
    process.env.CONTENT_AI_STREAM_RETRY = '0'
    const originalFetch = global.fetch
    const urls: string[] = []
    global.fetch = jest.fn(async (input, init) => {
      const url = String(input)
      urls.push(url)
      const request = JSON.parse(String(init?.body || '{}')) as { model?: string }
      if (url.includes('integrate.api.nvidia.com') && request.model === 'minimaxai/minimax-m3') {
        return new Response(JSON.stringify({ status: 429, title: 'Too Many Requests' }), {
          status: 429,
          headers: { 'content-type': 'application/json' },
        })
      }
      if (url.includes('inference.baseten.co')) {
        const chunks = [
          `data: ${JSON.stringify({ choices: [{ delta: { content: 'Baseten fallback draft.' } }] })}`,
          'data: [DONE]',
          '',
        ].join('\n\n') + '\n'
        return new Response(chunks, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        })
      }
      return new Response(JSON.stringify({ error: 'unexpected provider' }), { status: 500 })
    }) as typeof fetch

    try {
      const events = []
      for await (const event of generateContentTextStream({
        system: 'Write an article.',
        prompt: 'Draft the article.',
        aiProvider: 'nvidia-minimax',
        maxTokens: 1200,
      })) {
        events.push(event)
      }
      expect(urls[0]).toContain('integrate.api.nvidia.com')
      expect(urls.some((url) => url.includes('inference.baseten.co'))).toBe(true)
      expect(events.at(-1)).toMatchObject({
        type: 'done',
        provider: 'baseten-deepseek',
        model: 'deepseek-ai/DeepSeek-V4-Flash-0731',
        text: 'Baseten fallback draft.',
      })
    } finally {
      global.fetch = originalFetch
      delete process.env.BASETEN_API_KEY
      delete process.env.CONTENT_AI_STREAM_RETRY
    }
  })

  it('cancels the upstream body when the consumer abandons the stream (no memory leak)', async () => {
    process.env.NVIDIA_API_KEY = 'test-nvidia-key'
    delete process.env.NVIDIA_NEMOTRON_MODEL

    const cancelSpy = jest.fn()
    const encoder = new TextEncoder()
    // A provider body that keeps streaming forever — like a long draft.
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: 'Part one.' } }] })}\n\n`))
        // Intentionally never close — a real provider would keep sending.
      },
      cancel: cancelSpy,
    })

    global.fetch = jest.fn(async () => new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })) as typeof fetch

    const gen = generateContentTextStream({
      system: 'Write a concise factual answer.',
      prompt: 'Explain the topic.',
      aiProvider: 'nvidia-nemotron',
      maxTokens: 1200,
    })

    // Abandon mid-stream — exactly what a closed tab / regenerated article does.
    for await (const event of gen) {
      if (event.type === 'delta') break
    }

    // reader.cancel() must propagate to the fetch body so the socket is
    // released immediately instead of buffering the rest of the generation.
    expect(cancelSpy).toHaveBeenCalledTimes(1)
  })

  it('aborts the in-flight provider fetch when the caller signal fires', async () => {
    process.env.NVIDIA_API_KEY = 'test-nvidia-key'
    delete process.env.NVIDIA_NEMOTRON_MODEL
    let fetchSignal: AbortSignal | null = null

    global.fetch = jest.fn(async (_input, init) => {
      fetchSignal = (init?.signal as AbortSignal) ?? null
      const encoder = new TextEncoder()
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: 'one' } }] })}\n\n`))
        },
      })
      return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
    }) as typeof fetch

    const controller = new AbortController()
    const gen = generateContentTextStream({
      system: 'Write a concise factual answer.',
      prompt: 'Explain the topic.',
      aiProvider: 'nvidia-nemotron',
      maxTokens: 1200,
      signal: controller.signal,
    })

    for await (const event of gen) {
      if (event.type === 'delta') break
    }
    expect(fetchSignal).not.toBeNull()
    expect(fetchSignal!.aborted).toBe(false)

    controller.abort()
    // The caller's abort must bridge to the provider fetch's own signal so
    // the upstream request is torn down (openAiCompatibleStream wires it).
    expect(fetchSignal!.aborted).toBe(true)
  })
})
