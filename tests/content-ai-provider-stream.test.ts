jest.mock('@/lib/aiKeyVault', () => ({
  buildVaultEnvOverrides: jest.fn(async () => ({})),
}))

import { generateContentTextStream } from '@/lib/contentAiProvider'

describe('content AI · NVIDIA Nemotron streaming', () => {
  const originalKey = process.env.NVIDIA_API_KEY
  const originalModel = process.env.NVIDIA_NEMOTRON_MODEL
  const originalFetch = global.fetch

  beforeEach(() => {
    // Break-glass: this suite validates the RETIRED NVIDIA streaming
    // transports. Under the live Entrim-only policy those pins redirect to
    // Entrim, so restore the legacy full cascade for the suite.
    process.env.CONTENT_AI_ALL_PROVIDERS = '1'
  })

  afterEach(() => {
    if (originalKey == null) delete process.env.NVIDIA_API_KEY
    else process.env.NVIDIA_API_KEY = originalKey
    if (originalModel == null) delete process.env.NVIDIA_NEMOTRON_MODEL
    else process.env.NVIDIA_NEMOTRON_MODEL = originalModel
    delete process.env.CONTENT_AI_ALL_PROVIDERS
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

  it('rejects a model restart in a continuation response — keeps the prior draft', async () => {
    process.env.NVIDIA_API_KEY = 'test-nvidia-key'
    delete process.env.NVIDIA_NEMOTRON_MODEL
    let call = 0

    global.fetch = jest.fn(async (_input, init) => {
      call++
      const chunks =
        call === 1
          ? [
              // First attempt: partial draft that hits the token cap.
              `data: ${JSON.stringify({ choices: [{ delta: { content: 'Part one of the draft.' } }] })}\n\n`,
              `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'length' }] })}\n\n`,
              'data: [DONE]\n\n',
            ].join('')
          : [
              // Continuation response: model IGNORED the CONTINUE prompt and
              // wrote a FRESH article with new frontmatter + H1. This must be
              // rejected — the prior draft is kept, continuation stops.
              `data: ${JSON.stringify({ choices: [{ delta: { content: '---' } }] })}\n\n`,
              `data: ${JSON.stringify({ choices: [{ delta: { content: 'title: Fresh Article Title' } }] })}\n\n`,
              `data: ${JSON.stringify({ choices: [{ delta: { content: 'content_type: article' } }] })}\n\n`,
              `data: ${JSON.stringify({ choices: [{ delta: { content: '---' } }] })}\n\n`,
              `data: ${JSON.stringify({ choices: [{ delta: { content: '' } }] })}\n\n`,
              `data: ${JSON.stringify({ choices: [{ delta: { content: '# Fresh Article Title' } }] })}\n\n`,
              `data: ${JSON.stringify({ choices: [{ delta: { content: '## New Section From Restart' } }] })}\n\n`,
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
      aiProvider: 'nvidia-nemotron',
      maxTokens: 1200,
    })) {
      events.push(event)
    }

    // Two calls: initial attempt + one continuation attempt that was rejected.
    expect(call).toBe(2)
    // The first part must survive — the restart was NOT appended.
    const texts = events.filter((e) => e.type === 'delta').map((e) => (e as { text: string }).text)
    expect(texts).toEqual(['Part one of the draft.', '\n\n'])
    // A restart-rejection marker must appear.
    expect(events.some((e) =>
      e.type === 'provider' &&
      String((e as { provider?: string }).provider || '').includes('restart detected')
    )).toBe(true)
    // Final text is ONLY the prior draft — no fresh article appended.
    expect(events.at(-1)).toMatchObject({
      type: 'done',
      text: 'Part one of the draft.',
      provider: 'nvidia-nemotron',
    })
    // The done text does NOT contain the restarted article's content.
    const doneEvent = events.at(-1)
    const doneText = doneEvent && 'text' in doneEvent ? String((doneEvent as { text?: string }).text || '') : ''
    expect(doneText).not.toContain('Fresh Article Title')
    expect(doneText).not.toContain('New Section From Restart')
  })

  it('rejects a model restart that opens with a new H1 (no frontmatter)', async () => {
    process.env.NVIDIA_API_KEY = 'test-nvidia-key'
    delete process.env.NVIDIA_NEMOTRON_MODEL
    let call = 0

    global.fetch = jest.fn(async (_input, init) => {
      call++
      const chunks =
        call === 1
          ? [
              `data: ${JSON.stringify({ choices: [{ delta: { content: 'Existing draft content.' } }] })}\n\n`,
              `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'length' }] })}\n\n`,
              'data: [DONE]\n\n',
            ].join('')
          : [
              // Continuation opens with a new H1 — classic restart signature.
              `data: ${JSON.stringify({ choices: [{ delta: { content: '# Completely New Article' } }] })}\n\n`,
              `data: ${JSON.stringify({ choices: [{ delta: { content: '## Replacement Section' } }] })}\n\n`,
              'data: [DONE]\n\n',
            ].join('')
      return new Response(chunks, {
        status: 200,
        headers: { 'content-type': 'text-event-stream' },
      })
    }) as typeof fetch

    const events = []
    for await (const event of generateContentTextStream({
      system: 'Write an article.',
      prompt: 'Draft the article.',
      aiProvider: 'nvidia-nemotron',
      maxTokens: 1200,
    })) {
      events.push(event)
    }

    expect(call).toBe(2)
    const texts = events.filter((e) => e.type === 'delta').map((e) => (e as { text: string }).text)
    expect(texts).toEqual(['Existing draft content.', '\n\n'])
    expect(events.some((e) =>
      e.type === 'provider' &&
      String((e as { provider?: string }).provider || '').includes('restart detected')
    )).toBe(true)
    const doneEvent = events.at(-1)
    const doneText = doneEvent && 'text' in doneEvent ? String((doneEvent as { text?: string }).text || '') : ''
    expect(doneText).not.toContain('Completely New Article')
  })

  it('accepts a genuine continuation that appends prose (no restart)', async () => {
    process.env.NVIDIA_API_KEY = 'test-nvidia-key'
    delete process.env.NVIDIA_NEMOTRON_MODEL
    let call = 0

    global.fetch = jest.fn(async (_input, init) => {
      call++
      const chunks =
        call === 1
          ? [
              `data: ${JSON.stringify({ choices: [{ delta: { content: 'First half of the article.' } }] })}\n\n`,
              `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'length' }] })}\n\n`,
              'data: [DONE]\n\n',
            ].join('')
          : [
              // Genuine continuation: mid-prose, no frontmatter, no new H1.
              `data: ${JSON.stringify({ choices: [{ delta: { content: 'Second half continues the article naturally.' } }] })}\n\n`,
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
      aiProvider: 'nvidia-nemotron',
      maxTokens: 1200,
    })) {
      events.push(event)
    }

    expect(call).toBe(2)
    const texts = events.filter((e) => e.type === 'delta').map((e) => (e as { text: string }).text)
    expect(texts).toEqual(['First half of the article.', '\n\n', 'Second half continues the article naturally.'])
    const doneEvent = events.at(-1)
    const doneText = doneEvent && 'text' in doneEvent ? String((doneEvent as { text?: string }).text || '') : ''
    expect(doneText).toBe('First half of the article.\n\nSecond half continues the article naturally.')
    // No restart rejection — the continuation was accepted.
    expect(events.every((e) =>
      !(e.type === 'provider' && String((e as { provider?: string }).provider || '').includes('restart detected'))
    )).toBe(true)
  })

  it('streams a draft that OPENS with frontmatter — the opening fence must not be flagged as a restart (2026-09-02 production regression)', async () => {
    process.env.NVIDIA_API_KEY = 'test-nvidia-key'
    delete process.env.NVIDIA_NEMOTRON_MODEL
    let call = 0

    // Production signature: the model's FIRST SSE chunk carries the opening
    // frontmatter (--- + title: …) in one big block. The old ungated
    // ---+title check flagged the draft's own opening as a restart, dropped
    // every delta, and failed the stream with "returned empty content".
    global.fetch = jest.fn(async () => {
      call++
      const chunks = [
        `data: ${JSON.stringify({ choices: [{ delta: { content: '---\ntitle: Student Living Costs in the UK: Monthly Budget Guide for 2026\ncontent_type: blog_post\nprimary_keyword: student living costs uk\n---\n' } }] })}\n\n`,
        `data: ${JSON.stringify({ choices: [{ delta: { content: '# Student Living Costs in the UK: Monthly Budget Guide for 2026\n\n' } }] })}\n\n`,
        `data: ${JSON.stringify({ choices: [{ delta: { content: 'Moving to the UK as a student means budgeting for rent, food, transport, and study materials from day one.\n\n' } }] })}\n\n`,
        `data: ${JSON.stringify({ choices: [{ delta: { content: '## In 60 seconds\n\nRent dominates the monthly budget for most students.\n\n' } }] })}\n\n`,
        `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\n`,
        'data: [DONE]\n\n',
      ].join('')
      return new Response(chunks, { status: 200, headers: { 'content-type': 'text/event-stream' } })
    }) as typeof fetch

    const events = []
    for await (const event of generateContentTextStream({
      system: 'Write an article.',
      prompt: 'Draft the article.',
      aiProvider: 'nvidia-nemotron',
      maxTokens: 1200,
    })) {
      events.push(event)
    }

    expect(call).toBe(1)
    expect(events.some((e) =>
      e.type === 'provider' && String((e as { provider?: string }).provider || '').includes('restart detected')
    )).toBe(false)
    const doneEvent = events.at(-1)
    const doneText = doneEvent && 'text' in doneEvent ? String((doneEvent as { text?: string }).text || '') : ''
    expect(doneEvent).toMatchObject({ type: 'done', provider: 'nvidia-nemotron' })
    expect(doneText).toContain('title: Student Living Costs in the UK')
    expect(doneText).toContain('Rent dominates the monthly budget')
  })

  it('keeps the restart guard armed when frontmatter arrives in split deltas — closing fence is not a restart', async () => {
    process.env.NVIDIA_API_KEY = 'test-nvidia-key'
    delete process.env.NVIDIA_NEMOTRON_MODEL
    let call = 0

    // Split-chunk signature: --- / title: … / --- arrive as separate deltas.
    // YAML key lines must not flip sawProse (they are scaffolding), or the
    // CLOSING fence reads as a frontmatter restart.
    global.fetch = jest.fn(async () => {
      call++
      const chunks = [
        `data: ${JSON.stringify({ choices: [{ delta: { content: '---' } }] })}\n\n`,
        `data: ${JSON.stringify({ choices: [{ delta: { content: 'title: Split Frontmatter Draft' } }] })}\n\n`,
        `data: ${JSON.stringify({ choices: [{ delta: { content: 'content_type: blog_post' } }] })}\n\n`,
        `data: ${JSON.stringify({ choices: [{ delta: { content: '---' } }] })}\n\n`,
        `data: ${JSON.stringify({ choices: [{ delta: { content: '# Split Frontmatter Draft\n\n' } }] })}\n\n`,
        `data: ${JSON.stringify({ choices: [{ delta: { content: 'Body prose begins here and continues past the scaffolding.\n\n' } }] })}\n\n`,
        `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\n`,
        'data: [DONE]\n\n',
      ].join('')
      return new Response(chunks, { status: 200, headers: { 'content-type': 'text/event-stream' } })
    }) as typeof fetch

    const events = []
    for await (const event of generateContentTextStream({
      system: 'Write an article.',
      prompt: 'Draft the article.',
      aiProvider: 'nvidia-nemotron',
      maxTokens: 1200,
    })) {
      events.push(event)
    }

    expect(call).toBe(1)
    const doneEvent = events.at(-1)
    const doneText = doneEvent && 'text' in doneEvent ? String((doneEvent as { text?: string }).text || '') : ''
    expect(doneEvent).toMatchObject({ type: 'done' })
    expect(doneText).toContain('Body prose begins here')
    // All deltas survived — nothing was dropped by a misfired restart flag.
    // (Mock deltas carry no newlines, so the fences/keys join without separators.)
    expect(doneText).toContain('---title: Split Frontmatter Draft')
  })

  it('still rejects a frontmatter restart after real prose has streamed (guard remains armed)', async () => {
    process.env.NVIDIA_API_KEY = 'test-nvidia-key'
    delete process.env.NVIDIA_NEMOTRON_MODEL
    let call = 0

    global.fetch = jest.fn(async () => {
      call++
      const chunks =
        call === 1
          ? [
              `data: ${JSON.stringify({ choices: [{ delta: { content: '---\ntitle: Original Draft\n---\n\n# Original Draft\n\nReal opening prose that establishes the article body.\n\n' } }] })}\n\n`,
              `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'length' }] })}\n\n`,
              'data: [DONE]\n\n',
            ].join('')
          : [
              // Continuation attempt that instead restarts the article —
              // with prose already streamed, this MUST still be flagged.
              `data: ${JSON.stringify({ choices: [{ delta: { content: '---\ntitle: Restarted Article\n---\n\n# Restarted Article\n\nFresh restart prose.\n\n' } }] })}\n\n`,
              'data: [DONE]\n\n',
            ].join('')
      return new Response(chunks, { status: 200, headers: { 'content-type': 'text/event-stream' } })
    }) as typeof fetch

    const events = []
    for await (const event of generateContentTextStream({
      system: 'Write an article.',
      prompt: 'Draft the article.',
      aiProvider: 'nvidia-nemotron',
      maxTokens: 1200,
    })) {
      events.push(event)
    }

    expect(call).toBe(2)
    expect(events.some((e) =>
      e.type === 'provider' && String((e as { provider?: string }).provider || '').includes('restart detected')
    )).toBe(true)
    const doneEvent = events.at(-1)
    const doneText = doneEvent && 'text' in doneEvent ? String((doneEvent as { text?: string }).text || '') : ''
    expect(doneText).toContain('Original Draft')
    expect(doneText).not.toContain('Restarted Article')
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
