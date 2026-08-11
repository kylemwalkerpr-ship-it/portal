import {
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
