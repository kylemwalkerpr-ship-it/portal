jest.mock('@/lib/aiKeyVault', () => ({
  buildVaultEnvOverrides: jest.fn(async () => ({})),
}))

import {
  isReasoningOnlyTruncation,
  fetchStreamWithRetry,
  generateContentText,
} from '@/lib/contentAiProvider'

describe('content AI · empty DeepSeek continuation', () => {
  it('treats YAML-only / empty streams as reasoning-only truncation, not a real draft to continue', () => {
    expect(isReasoningOnlyTruncation('')).toBe(true)
    expect(isReasoningOnlyTruncation('---\ntitle: Hi\n---\n')).toBe(true)
    expect(isReasoningOnlyTruncation('# How to choose a college essay topic\n\n' + 'Students should '.repeat(40))).toBe(false)
  })
})

describe('content AI · stream overload retry (NVIDIA 529)', () => {
  const originalRetry = process.env.CONTENT_AI_STREAM_RETRY

  afterEach(() => {
    if (originalRetry == null) delete process.env.CONTENT_AI_STREAM_RETRY
    else process.env.CONTENT_AI_STREAM_RETRY = originalRetry
  })

  it('retries a 529 overload with backoff and succeeds on a later attempt', async () => {
    let calls = 0
    const ok = new Response('ok', { status: 200 })
    const { res, attempts } = await fetchStreamWithRetry(() => {
      calls++
      if (calls === 1) {
        return Promise.reject(new Error('nvidia-deepseek stream 529: {"message":"Service temporarily overloaded","type":"Overloaded","code":529}'))
      }
      return Promise.resolve(ok)
    })
    expect(calls).toBe(2)
    expect(attempts).toBe(2)
    expect(res.status).toBe(200)
  })

  it('propagates a non-transient 404 immediately (no retries)', async () => {
    let calls = 0
    await expect(fetchStreamWithRetry(() => {
      calls++
      return Promise.reject(new Error('nvidia-deepseek stream 404: page not found'))
    })).rejects.toThrow(/404/)
    expect(calls).toBe(1)
  })

  it('respects CONTENT_AI_STREAM_RETRY=0 as a single attempt', async () => {
    process.env.CONTENT_AI_STREAM_RETRY = '0'
    let calls = 0
    await expect(fetchStreamWithRetry(() => {
      calls++
      return Promise.reject(new Error('nvidia-deepseek stream 529: overloaded'))
    })).rejects.toThrow(/529/)
    expect(calls).toBe(1)
  })
})

describe('content AI · continuation restart guard (regression)', () => {
  const originalKey = process.env.DEEPSEEK_API_KEY

  afterEach(() => {
    if (originalKey == null) delete process.env.DEEPSEEK_API_KEY
    else process.env.DEEPSEEK_API_KEY = originalKey
    jest.restoreAllMocks()
  })

  it('openAiCompatibleComplete rejects a continuation that restarts with new frontmatter', async () => {
    process.env.DEEPSEEK_API_KEY = 'test-deepseek-key'
    const originalFetch = global.fetch
    let call = 0

    global.fetch = jest.fn(async (_input, init) => {
      call++
      const body = JSON.parse(String(init?.body || '{}')) as {
        stream?: boolean
        messages?: Array<{ role: string; content?: string }>
      }
      if (body.stream) {
        // Streaming lane — send one tiny SSE body so a stray stream call
        // terminates instead of hanging.
        const sse = `data: ${JSON.stringify({ choices: [{ delta: { content: 'x' } }] })}\n\ndata: [DONE]\n\n`
        return new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } })
      }
      // Respond SEMANTICALLY on the continuation request's content, not by
      // call order — a vault/OAuth fetch would otherwise shift the sequence.
      const userMsg = body.messages?.find((m) => m.role === 'user')?.content || ''
      const isContinuation = /CONTINUE WRITING THE DRAFT BELOW/.test(userMsg)
      // OpenAI contract: finish_reason is at the CHOICE level, not inside message.
      // Initial call: partial draft that truncates at the token cap.
      // Continuation call: model restarts with new frontmatter + H1.
      const payload = isContinuation
        ? { choices: [{ message: { content: '---\ntitle: Fresh Rewrite\ncontent_type: article\n---\n\n# Fresh Rewrite\n\n## New Section' } }] }
        : { choices: [{ message: { content: 'First draft part.' }, finish_reason: 'length' }] }
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as typeof fetch

    try {
      const result = await generateContentText({
        aiProvider: 'deepseek-v41-flash',
        system: 'Write an article.',
        prompt: 'Draft the article.',
        maxTokens: 1200,
        skipQualityContract: true,
      })
      // The restart must NOT be concatenated — the first draft is kept.
      expect(result.text).toBe('First draft part.')
      expect(result.text).not.toContain('Fresh Rewrite')
      expect(result.text).not.toContain('New Section')
    } finally {
      global.fetch = originalFetch
    }
  })

  it('generateContentText accepts a genuine continuation that appends prose', async () => {
    process.env.DEEPSEEK_API_KEY = 'test-deepseek-key'
    const originalFetch = global.fetch
    let call = 0

    global.fetch = jest.fn(async (_input, init) => {
      call++
      const body = JSON.parse(String(init?.body || '{}')) as { stream?: boolean }
      if (body.stream) {
        const sse = `data: ${JSON.stringify({ choices: [{ delta: { content: 'x' } }] })}\n\ndata: [DONE]\n\n`
        return new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } })
      }
      // Genuine continuation: mid-prose append, no restart signatures.
      const payload =
        call === 1
          ? { choices: [{ message: { content: 'First half.' }, finish_reason: 'length' }] }
          : { choices: [{ message: { content: 'Second half continues naturally.' } }] }
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as typeof fetch

    try {
      const result = await generateContentText({
        aiProvider: 'deepseek-v41-flash',
        system: 'Write an article.',
        prompt: 'Draft the article.',
        maxTokens: 1200,
        skipQualityContract: true,
      })
      expect(result.text).toBe('First half.\n\nSecond half continues naturally.')
      expect(call).toBe(2)
    } finally {
      global.fetch = originalFetch
    }
  })
})

describe('content AI · provider retry budget defaults', () => {
  const originalFetch = global.fetch
  const originalRetry = process.env.CONTENT_AI_RETRY
  const originalDeepSeekKey = process.env.DEEPSEEK_API_KEY

  beforeEach(() => {
    process.env.DEEPSEEK_API_KEY = 'test-deepseek-key'
    global.fetch = originalFetch
  })

  afterEach(() => {
    global.fetch = originalFetch
    if (originalRetry == null) delete process.env.CONTENT_AI_RETRY
    else process.env.CONTENT_AI_RETRY = originalRetry
    if (originalDeepSeekKey == null) delete process.env.DEEPSEEK_API_KEY
    else process.env.DEEPSEEK_API_KEY = originalDeepSeekKey
  })

  const generation = () => generateContentText({
    aiProvider: 'deepseek-v41-flash',
    exclusive: true,
    system: 'Write one sentence.',
    prompt: 'Return a short answer.',
    skipQualityContract: true,
  })

  it('uses one attempt when CONTENT_AI_RETRY is unset', async () => {
    delete process.env.CONTENT_AI_RETRY
    let calls = 0
    global.fetch = jest.fn(async () => {
      calls++
      return new Response('temporary overload', { status: 503 })
    }) as typeof fetch

    await expect(generation()).rejects.toThrow(/503/)
    expect(calls).toBe(1)
  })

  it('CONTENT_AI_RETRY=1 opts into one retry (two attempts total)', async () => {
    process.env.CONTENT_AI_RETRY = '1'
    let calls = 0
    global.fetch = jest.fn(async () => {
      calls++
      if (calls === 1) return new Response('temporary overload', { status: 503 })
      return new Response(JSON.stringify({
        choices: [{ message: { content: 'A stable answer.' }, finish_reason: 'stop' }],
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch

    await expect(generation()).resolves.toMatchObject({ text: 'A stable answer.' })
    expect(calls).toBe(2)
  })

  it('does not retry subrequest-limit errors even when retry is enabled', async () => {
    process.env.CONTENT_AI_RETRY = '1'
    let calls = 0
    global.fetch = jest.fn(async () => {
      calls++
      throw new Error('Too many subrequests by single Worker invocation')
    }) as typeof fetch

    await expect(generation()).rejects.toThrow(/Too many subrequests/)
    expect(calls).toBe(1)
  })
})
