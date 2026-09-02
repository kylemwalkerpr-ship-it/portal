jest.mock('@/lib/aiKeyVault', () => ({
  buildVaultEnvOverrides: jest.fn(async () => ({})),
  AI_PROVIDERS: jest.requireActual('@/lib/aiKeyVault').AI_PROVIDERS,
}))

import {
  canonicalizeNvidiaModelId,
  fetchStreamWithRetry,
  generateContentText,
  getNvidiaDeepseekProvider,
  getNvidiaMinimaxProvider,
  getNvidiaNemotronProvider,
  listConfiguredContentProviders,
  resolveEffectiveModel,
} from '@/lib/contentAiProvider'

describe('content AI · NVIDIA MiniMax drafting', () => {
  const originalKey = process.env.NVIDIA_API_KEY
  const originalModel = process.env.NVIDIA_MINIMAX_MODEL
  const originalTemperature = process.env.NVIDIA_TEMPERATURE

  afterEach(() => {
    if (originalKey == null) delete process.env.NVIDIA_API_KEY
    else process.env.NVIDIA_API_KEY = originalKey
    if (originalModel == null) delete process.env.NVIDIA_MINIMAX_MODEL
    else process.env.NVIDIA_MINIMAX_MODEL = originalModel
    if (originalTemperature == null) delete process.env.NVIDIA_TEMPERATURE
    else process.env.NVIDIA_TEMPERATURE = originalTemperature
    jest.restoreAllMocks()
  })

  it('exposes the exact MiniMax model on NVIDIA Integrate', () => {
    process.env.NVIDIA_API_KEY = 'test-nvidia-key'
    delete process.env.NVIDIA_MINIMAX_MODEL
    const provider = getNvidiaMinimaxProvider() as unknown as {
      label: string
      baseURL: string
      model: string
      maxTokensCap?: number
    }
    expect(provider).toMatchObject({
      label: 'nvidia-minimax',
      baseURL: 'https://integrate.api.nvidia.com/v1',
      model: 'minimaxai/minimax-m3',
      maxTokensCap: 16384,
    })
  })

  it('routes the selected drafting pin through NVIDIA with the documented payload', async () => {
    process.env.NVIDIA_API_KEY = 'test-nvidia-key'
    // Break-glass: this test validates the RETIRED NVIDIA transport payload.
    // The live Entrim-only policy would redirect the pin, so restore the
    // legacy full cascade for the duration of the test.
    process.env.CONTENT_AI_ALL_PROVIDERS = '1'
    const originalFetch = global.fetch
    let requestBody: Record<string, unknown> | null = null
    global.fetch = jest.fn(async (_input, init) => {
      requestBody = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>
      return new Response(
        JSON.stringify({ choices: [{ message: { content: 'A completed MiniMax draft.', finish_reason: 'stop' } }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }) as typeof fetch
    try {
      const result = await generateContentText({
        aiProvider: 'nvidia-minimax',
        system: 'Write a concise article.',
        prompt: 'Draft the article.',
        maxTokens: 2048,
        skipQualityContract: true,
      })
      expect(result).toMatchObject({
        provider: 'nvidia-minimax',
        model: 'minimaxai/minimax-m3',
        text: 'A completed MiniMax draft.',
      })
      expect(requestBody).toMatchObject({
        model: 'minimaxai/minimax-m3',
        stream: false,
        max_tokens: 2048,
        temperature: 1,
        top_p: 0.95,
      })
      expect(requestBody).not.toHaveProperty('max_completion_tokens')
      expect(requestBody).not.toHaveProperty('reasoning_budget')
    } finally {
      global.fetch = originalFetch
      delete process.env.CONTENT_AI_ALL_PROVIDERS
    }
  })
})

describe('content AI · NVIDIA Nemotron', () => {
  const originalKey = process.env.NVIDIA_API_KEY
  const originalModel = process.env.NVIDIA_NEMOTRON_MODEL

  afterEach(() => {
    if (originalKey == null) delete process.env.NVIDIA_API_KEY
    else process.env.NVIDIA_API_KEY = originalKey
    if (originalModel == null) delete process.env.NVIDIA_NEMOTRON_MODEL
    else process.env.NVIDIA_NEMOTRON_MODEL = originalModel
  })

  it('exposes Nemotron as a configured selectable provider with the supplied model ID', () => {
    process.env.NVIDIA_API_KEY = 'test-nvidia-key'
    delete process.env.NVIDIA_NEMOTRON_MODEL

    const provider = getNvidiaNemotronProvider() as unknown as {
      label: string
      baseURL: string
      model: string
      extraBody?: Record<string, unknown>
      maxTokensCap?: number
    }
    expect(provider.label).toBe('nvidia-nemotron')
    expect(provider.baseURL).toBe('https://integrate.api.nvidia.com/v1')
    expect(provider.model).toBe('nvidia/nemotron-3-ultra-550b-a55b')
    expect(provider.maxTokensCap).toBe(16384)
    expect(provider.extraBody).toEqual({
      chat_template_kwargs: { enable_thinking: true },
    })
    expect(listConfiguredContentProviders()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'nvidia-nemotron', configured: true }),
    ]))
  })

  it('normalizes any Nemotron model override to NVIDIA exact lowercase catalog casing', () => {
    process.env.NVIDIA_API_KEY = 'test-nvidia-key'
    process.env.NVIDIA_NEMOTRON_MODEL = 'NVIDIA/Nemotron-3-Ultra-550B-A55B'
    const provider = getNvidiaNemotronProvider() as unknown as { label: string; model: string }
    expect(provider.label).toBe('nvidia-nemotron')
    expect(provider.model).toBe('nvidia/nemotron-3-ultra-550b-a55b')
  })
})

describe('content AI · NVIDIA model-id canonicalization', () => {
  const originalKey = process.env.NVIDIA_API_KEY
  const originalDeepseekModel = process.env.NVIDIA_DEEPSEEK_MODEL
  const originalNvidiaModel = process.env.NVIDIA_MODEL

  afterEach(() => {
    if (originalKey == null) delete process.env.NVIDIA_API_KEY
    else process.env.NVIDIA_API_KEY = originalKey
    if (originalDeepseekModel == null) delete process.env.NVIDIA_DEEPSEEK_MODEL
    else process.env.NVIDIA_DEEPSEEK_MODEL = originalDeepseekModel
    if (originalNvidiaModel == null) delete process.env.NVIDIA_MODEL
    else process.env.NVIDIA_MODEL = originalNvidiaModel
  })

  it('canonicalizes the mixed-case Baseten/Parasail id to the lowercase NVIDIA catalog id', () => {
    expect(canonicalizeNvidiaModelId('deepseek-ai/DeepSeek-V4-Flash-0731')).toBe('deepseek-ai/deepseek-v4-flash-0731')
    expect(canonicalizeNvidiaModelId('deepseek-ai/DeepSeek-V4-Flash-0731')).not.toContain('DeepSeek')
    expect(canonicalizeNvidiaModelId('')).toBe('deepseek-ai/deepseek-v4-flash-0731')
  })

  it('never sends the EOL bare deepseek-v4-pro id to NVIDIA — remaps to Flash (410 regression)', () => {
    expect(canonicalizeNvidiaModelId('deepseek-ai/deepseek-v4-pro')).toBe('deepseek-ai/deepseek-v4-flash-0731')
    expect(canonicalizeNvidiaModelId('deepseek-ai/DeepSeek-V4-Pro')).toBe('deepseek-ai/deepseek-v4-flash-0731')
    // Pro-0813 is a different checkpoint (live on Parasail/Baseten, not NVIDIA) — untouched.
    expect(canonicalizeNvidiaModelId('deepseek-ai/DeepSeek-V4-Pro-0813')).toBe('deepseek-ai/deepseek-v4-pro-0813')
    expect(canonicalizeNvidiaModelId('deepseek-ai/deepseek-v4-pro-0813')).toBe('deepseek-ai/deepseek-v4-pro-0813')
  })

  it('a stale vault/Worker NVIDIA_DEEPSEEK_MODEL holding the EOL id cannot 410 drafts either', () => {
    process.env.NVIDIA_API_KEY = 'test-nvidia-key'
    // Simulate the deployed secret/vault row that caused the original 410 Gone.
    process.env.NVIDIA_DEEPSEEK_MODEL = 'deepseek-ai/deepseek-v4-pro'
    const provider = getNvidiaDeepseekProvider() as unknown as { label: string; model: string }
    expect(provider.label).toBe('nvidia-deepseek')
    expect(provider.model).toBe('deepseek-ai/deepseek-v4-flash-0731')
  })

  it('NVIDIA DeepSeek provider always sends the lowercase model id even when the vault override is mixed-case', () => {
    process.env.NVIDIA_API_KEY = 'test-nvidia-key'
    // The vault can hold the Parasail/Baseten form — NVIDIA 404s on it.
    process.env.NVIDIA_DEEPSEEK_MODEL = 'deepseek-ai/DeepSeek-V4-Flash-0731'
    const provider = getNvidiaDeepseekProvider() as unknown as { label: string; model: string }
    expect(provider.label).toBe('nvidia-deepseek')
    expect(provider.model).toBe('deepseek-ai/deepseek-v4-flash-0731')
  })

  it('rejects a non-catalog NVIDIA DeepSeek override instead of sending an unknown deployment', () => {
    process.env.NVIDIA_API_KEY = 'test-nvidia-key'
    process.env.NVIDIA_DEEPSEEK_MODEL = 'deepseek-ai/DeepSeek-V4-Flash-Custom'
    const provider = getNvidiaDeepseekProvider() as unknown as { label: string; model: string }
    expect(provider.model).toBe('deepseek-ai/deepseek-v4-flash-0731')
  })
})

describe('content AI · request-level model override (reviewer path)', () => {
  const nvidiaProvider = {
    label: 'nvidia-deepseek',
    baseURL: 'https://integrate.api.nvidia.com/v1',
    apiKey: 'test-nvidia-key',
    model: 'deepseek-ai/deepseek-v4-pro', // stale EOL secret, as deployed
  } as unknown as Parameters<typeof resolveEffectiveModel>[0]

  it('a real API id (mixed-case Flash) overrides the stale env secret and is canonicalized lowercase', () => {
    expect(resolveEffectiveModel(nvidiaProvider, { model: 'deepseek-ai/DeepSeek-V4-Flash-0731' } as never)).toBe(
      'deepseek-ai/deepseek-v4-flash-0731',
    )
  })

  it('a bare pin is never sent as the model — the provider default wins', () => {
    expect(resolveEffectiveModel(nvidiaProvider, { model: 'nvidia-deepseek' } as never)).toBe(
      'deepseek-ai/deepseek-v4-pro',
    )
  })

  it('no request model → provider default', () => {
    expect(resolveEffectiveModel(nvidiaProvider, {} as never)).toBe('deepseek-ai/deepseek-v4-pro')
  })

  it('canonicalizes GLM/Nemotron ids for their NVIDIA pins too', () => {
    const glm = { ...nvidiaProvider, label: 'nvidia-glm' } as Parameters<typeof resolveEffectiveModel>[0]
    expect(resolveEffectiveModel(glm, { model: 'z-ai/GLM-5.2' } as never)).toBe('z-ai/glm-5.2')
  })
})

describe('content AI · reviewer regression — EOL Pro secret must not reach NVIDIA', () => {
  const envKeys = ['NVIDIA_API_KEY', 'NVIDIA_DEEPSEEK_MODEL', 'NVIDIA_MODEL'] as const
  const original: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const k of envKeys) {
      original[k] = process.env[k]
      delete process.env[k]
    }
    // Break-glass: validates the RETIRED NVIDIA reviewer transport. The live
    // Entrim-only policy would redirect this pin before it reached NVIDIA.
    process.env.CONTENT_AI_ALL_PROVIDERS = '1'
  })

  afterEach(() => {
    for (const k of envKeys) {
      if (original[k] == null) delete process.env[k]
      else process.env[k] = original[k]
    }
    delete process.env.CONTENT_AI_ALL_PROVIDERS
  })

  it('reviewer pinned to nvidia-deepseek sends the Flash id even when the env secret is EOL Pro (410 regression)', async () => {
    process.env.NVIDIA_API_KEY = 'test-nvidia-key'
    // Simulate the stale deployed secret that caused the 410 Gone.
    process.env.NVIDIA_DEEPSEEK_MODEL = 'deepseek-ai/deepseek-v4-pro'
    const originalFetch = global.fetch
    const bodies: Array<{ model?: string; stream?: boolean }> = []
    global.fetch = jest.fn(async (_input, init) => {
      bodies.push(JSON.parse(String(init?.body || '{}')) as { model?: string })
      return new Response(
        JSON.stringify({ choices: [{ message: { content: 'Fixed.', finish_reason: 'stop' } }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }) as typeof fetch
    try {
      await generateContentText({
        aiProvider: 'nvidia-deepseek',
        // What callAiFix now sends: the Flash API id from the catalog pin.
        model: 'deepseek-ai/DeepSeek-V4-Flash-0731',
        exclusive: true,
        skipQualityContract: true,
        system: 'Review.',
        prompt: 'Fix it',
        maxTokens: 2048,
      })
      expect(bodies.length).toBeGreaterThan(0)
      expect(bodies[0].model).toBe('deepseek-ai/deepseek-v4-flash-0731')
      expect(bodies[0].stream).toBe(false)
      expect(bodies[0].model).not.toContain('v4-pro')
    } finally {
      global.fetch = originalFetch
    }
  })
})

describe('content AI · reviewer cascade on transient infra errors (cascadeOnCapacity)', () => {
  const envKeys = ['BASETEN_API_KEY', 'PARASAIL_API_KEY', 'NVIDIA_API_KEY', 'NVIDIA_BASE_URL', 'NVIDIA_DEEPSEEK_MODEL', 'CONTENT_AI_RETRY', 'CONTENT_AI_PROVIDER_ORDER', 'XAI_API_KEY'] as const
  const original: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const k of envKeys) {
      original[k] = process.env[k]
      delete process.env[k]
    }
    process.env.CONTENT_AI_RETRY = '1' // one attempt per provider — keep the test fast
    // Break-glass: these tests validate the RETIRED multi-host cascade
    // (Baseten → Parasail → NVIDIA). Under the live Entrim-only policy every
    // one of those hosts is filtered out, so restore the legacy cascade.
    process.env.CONTENT_AI_ALL_PROVIDERS = '1'
    // Hermetic order: a developer's .env.local CONTENT_AI_PROVIDER_ORDER
    // (e.g. groq first) must not change which fallback the cascade reaches.
    process.env.CONTENT_AI_PROVIDER_ORDER = JSON.stringify(['baseten-deepseek', 'parasail-deepseek', 'nvidia-deepseek', 'nvidia-nemotron'])
  })

  afterEach(() => {
    for (const k of envKeys) {
      if (original[k] == null) delete process.env[k]
      else process.env[k] = original[k]
    }
    delete process.env.CONTENT_AI_ALL_PROVIDERS
  })

  const REVIEW_OPTS = {
    system: 'Review.',
    prompt: 'Fix it',
    maxTokens: 2048,
    skipQualityContract: true,
    aiProvider: 'baseten-deepseek',
    exclusive: true,
  } as const

  it('an NVIDIA chat deployment 404 cascades to the next provider instead of hard-failing Fix All', async () => {
    process.env.NVIDIA_API_KEY = 'test-nvidia-key'
    process.env.PARASAIL_API_KEY = 'psk-test-fallback'
    // NVIDIA lanes must precede Parasail so the cascade proves the NVIDIA
    // fallback (nemotron SSE) rather than a generic JSON fallback host.
    process.env.CONTENT_AI_PROVIDER_ORDER = JSON.stringify(['nvidia-deepseek', 'nvidia-nemotron', 'parasail-deepseek'])
    const originalFetch = global.fetch
    global.fetch = jest.fn(async (input, init) => {
      const url = String(input)
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) as { model?: string } : {}
      // Every NVIDIA lane shares the host credential. Fail only the pinned
      // DeepSeek lane, then let the next NVIDIA lane prove the cascade.
      if (url.includes('integrate.api.nvidia.com') && body.model !== 'nvidia/nemotron-3-ultra-550b-a55b') {
        return new Response(
          JSON.stringify({ detail: "Function id 'test' version 'null': Specified function in account 'test' is not found" }),
          { status: 404, headers: { 'content-type': 'application/json' } },
        )
      }
      if (url.includes('integrate.api.nvidia.com')) {
        const sse = [
          `data: ${JSON.stringify({ choices: [{ delta: { content: 'Fixed via NVIDIA fallback.' } }] })}`,
          'data: [DONE]',
          '',
        ].join('\n\n') + '\n'
        return new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } })
      }
      return new Response(
        JSON.stringify({ choices: [{ message: { content: 'Fixed via fallback.', finish_reason: 'stop' } }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }) as typeof fetch
    try {
      const res = await generateContentText({
        system: 'Review.', prompt: 'Fix it', maxTokens: 2048,
        skipQualityContract: true, aiProvider: 'nvidia-deepseek',
        exclusive: true, cascadeOnCapacity: true,
      })
      expect(res.provider).toBe('nvidia-nemotron')
      expect(res.text).toContain('Fixed via NVIDIA fallback')
    } finally {
      global.fetch = originalFetch
    }
  })

  it('an AbortError on the pinned Baseten host cascades to the next provider (never "The operation was aborted")', async () => {
    process.env.BASETEN_API_KEY = 'test-baseten-key'
    process.env.PARASAIL_API_KEY = 'psk-test-fallback'
    const originalFetch = global.fetch
    global.fetch = jest.fn(async (input) => {
      if (String(input).includes('inference.baseten.co')) {
        const err = new Error('The operation was aborted')
        err.name = 'AbortError'
        throw err
      }
      return new Response(
        JSON.stringify({ choices: [{ message: { content: 'Fixed via fallback.', finish_reason: 'stop' } }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }) as typeof fetch
    try {
      const res = await generateContentText({ ...REVIEW_OPTS, cascadeOnCapacity: true })
      expect(res.provider).toBe('parasail-deepseek')
      expect(res.text).toContain('Fixed via fallback')
    } finally {
      global.fetch = originalFetch
    }
  })

  it('a 529 overload on the pinned Baseten host cascades to the next provider', async () => {
    process.env.BASETEN_API_KEY = 'test-baseten-key'
    process.env.PARASAIL_API_KEY = 'psk-test-fallback'
    const originalFetch = global.fetch
    global.fetch = jest.fn(async (input) => {
      if (String(input).includes('inference.baseten.co')) {
        return new Response(
          JSON.stringify({ message: 'Service temporarily overloaded', type: 'Overloaded', code: 529 }),
          { status: 529, headers: { 'content-type': 'application/json' } },
        )
      }
      return new Response(
        JSON.stringify({ choices: [{ message: { content: 'Fixed via fallback.', finish_reason: 'stop' } }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }) as typeof fetch
    try {
      const res = await generateContentText({ ...REVIEW_OPTS, cascadeOnCapacity: true })
      expect(res.provider).toBe('parasail-deepseek')
    } finally {
      global.fetch = originalFetch
    }
  })

  it('a 402 billing failure on the pinned Baseten host cascades to the next provider (Baseten out-of-credits)', async () => {
    process.env.BASETEN_API_KEY = 'test-baseten-key'
    process.env.PARASAIL_API_KEY = 'psk-test-fallback'
    const originalFetch = global.fetch
    global.fetch = jest.fn(async (input) => {
      if (String(input).includes('inference.baseten.co')) {
        return new Response(
          JSON.stringify({ error: 'please check your current payment status.' }),
          { status: 402, headers: { 'content-type': 'application/json' } },
        )
      }
      return new Response(
        JSON.stringify({ choices: [{ message: { content: 'Fixed via fallback.', finish_reason: 'stop' } }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }) as typeof fetch
    try {
      const res = await generateContentText({ ...REVIEW_OPTS, cascadeOnCapacity: true })
      expect(res.provider).toBe('parasail-deepseek')
      expect(res.text).toContain('Fixed via fallback')
    } finally {
      global.fetch = originalFetch
    }
  })

  it('without cascadeOnCapacity an exclusive reviewer still hard-fails (existing behavior) and the abort is a readable timeout', async () => {
    process.env.BASETEN_API_KEY = 'test-baseten-key'
    process.env.PARASAIL_API_KEY = 'psk-test-fallback'
    const originalFetch = global.fetch
    global.fetch = jest.fn(async (input) => {
      if (String(input).includes('inference.baseten.co')) {
        const err = new Error('The operation was aborted')
        err.name = 'AbortError'
        throw err
      }
      return new Response(
        JSON.stringify({ choices: [{ message: { content: 'Fixed via fallback.', finish_reason: 'stop' } }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }) as typeof fetch
    try {
      await expect(
        generateContentText({ ...REVIEW_OPTS, cascadeOnCapacity: false }),
      ).rejects.toThrow(/Explicit AI provider "baseten-deepseek" failed.*timed out after/)
    } finally {
      global.fetch = originalFetch
    }
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
  const originalKey = process.env.NVIDIA_API_KEY
  const originalEntrimKey = process.env.ENTRIM_API_KEY

  afterEach(() => {
    if (originalKey == null) delete process.env.NVIDIA_API_KEY
    else process.env.NVIDIA_API_KEY = originalKey
    if (originalEntrimKey == null) delete process.env.ENTRIM_API_KEY
    else process.env.ENTRIM_API_KEY = originalEntrimKey
    jest.restoreAllMocks()
  })

  it('openAiCompatibleComplete rejects a continuation that restarts with new frontmatter', async () => {
    process.env.ENTRIM_API_KEY = 'test-entrim-key'
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
        aiProvider: 'entrim-qwen-27b',
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
    process.env.ENTRIM_API_KEY = 'test-entrim-key'
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
        aiProvider: 'entrim-qwen-27b',
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
