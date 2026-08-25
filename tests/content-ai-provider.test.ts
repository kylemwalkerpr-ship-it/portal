import {
  canonicalizeNvidiaModelId,
  fetchStreamWithRetry,
  getNvidiaDeepseekProvider,
  getNvidiaNemotronProvider,
  listConfiguredContentProviders,
} from '@/lib/contentAiProvider'

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

  it('honors an admin model override without changing the provider ID', () => {
    process.env.NVIDIA_API_KEY = 'test-nvidia-key'
    process.env.NVIDIA_NEMOTRON_MODEL = 'nvidia/nemotron-custom-test'
    const provider = getNvidiaNemotronProvider() as unknown as { label: string; model: string }
    expect(provider.label).toBe('nvidia-nemotron')
    expect(provider.model).toBe('nvidia/nemotron-custom-test')
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

  it('NVIDIA DeepSeek provider always sends the lowercase model id even when the vault override is mixed-case', () => {
    process.env.NVIDIA_API_KEY = 'test-nvidia-key'
    // The vault can hold the Parasail/Baseten form — NVIDIA 404s on it.
    process.env.NVIDIA_DEEPSEEK_MODEL = 'deepseek-ai/DeepSeek-V4-Flash-0731'
    const provider = getNvidiaDeepseekProvider() as unknown as { label: string; model: string }
    expect(provider.label).toBe('nvidia-deepseek')
    expect(provider.model).toBe('deepseek-ai/deepseek-v4-flash-0731')
  })

  it('honors a custom NVIDIA model override but still lowercases it', () => {
    process.env.NVIDIA_API_KEY = 'test-nvidia-key'
    process.env.NVIDIA_DEEPSEEK_MODEL = 'deepseek-ai/DeepSeek-V4-Flash-Custom'
    const provider = getNvidiaDeepseekProvider() as unknown as { label: string; model: string }
    expect(provider.model).toBe('deepseek-ai/deepseek-v4-flash-custom')
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
