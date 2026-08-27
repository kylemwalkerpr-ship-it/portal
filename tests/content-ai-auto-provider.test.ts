import { resolveAiProviderPin, isAihubmixGlmFastConfigured, getAihubmixGlmFastProvider } from '@/lib/contentAiProvider'

/**
 * 2026-08 regression: suggest-keywords (and factory routes) pass
 * aiProvider:'auto'. Both generateContentText and generateContentTextStream
 * previously did `const prefer = explicit || preferProvider()` — the literal
 * 'auto' became prefer and the early-fail check threw
 * `Selected AI provider "auto" is not configured` even when providers WERE
 * configured. resolveAiProviderPin now normalizes auto-mode so 'auto'
 * resolves through preferProvider().
 */

describe('content AI · auto provider pin', () => {
  const originalProvider = process.env.CONTENT_AI_PROVIDER
  const originalOrder = process.env.CONTENT_AI_PROVIDER_ORDER
  const originalNvidia = process.env.NVIDIA_API_KEY
  const originalOpenAi = process.env.OPENAI_API_KEY

  afterEach(() => {
    for (const [name, value] of [
      ['CONTENT_AI_PROVIDER', originalProvider],
      ['CONTENT_AI_PROVIDER_ORDER', originalOrder],
      ['NVIDIA_API_KEY', originalNvidia],
      ['OPENAI_API_KEY', originalOpenAi],
    ] as const) {
      if (value == null) delete process.env[name]
      else process.env[name] = value
    }
  })

  it("'auto' clears the explicit pin and never resolves to the literal string 'auto'", () => {
    process.env.NVIDIA_API_KEY = 'test-nvidia-key'
    const { explicit, prefer } = resolveAiProviderPin('auto')
    expect(explicit).toBe('')
    expect(prefer).not.toBe('auto')
    expect(prefer.length).toBeGreaterThan(0)
  })

  it("treats 'default', 'primary', and empty as auto mode (no literal pin)", () => {
    process.env.NVIDIA_API_KEY = 'test-nvidia-key'
    for (const raw of [undefined, '', 'auto', 'default', 'primary']) {
      const { explicit, prefer } = resolveAiProviderPin(raw)
      expect(explicit).toBe('')
      expect(prefer).not.toBe(raw || '')
      expect(prefer.length).toBeGreaterThan(0)
    }
  })

  it('preserves a real provider pin like openai (explicit stays, prefer matches)', () => {
    process.env.OPENAI_API_KEY = 'test-openai-key'
    const { explicit, prefer } = resolveAiProviderPin('openai')
    expect(explicit).toBe('openai')
    expect(prefer).toBe('openai')
  })

  it("resolves 'auto' to NVIDIA MiniMax even when a stale saved order leads with Baseten", () => {
    process.env.CONTENT_AI_PROVIDER_ORDER = JSON.stringify([
      'baseten-deepseek',
      'nvidia-nemotron',
      'nvidia-glm',
    ])
    process.env.NVIDIA_API_KEY = 'test-nvidia-key'
    const { explicit, prefer } = resolveAiProviderPin('auto')
    expect(explicit).toBe('')
    expect(prefer).toBe('nvidia-minimax')
  })

  it("routes a raw DeepSeek V4 Flash model id to NVIDIA (never 'not configured')", () => {
    process.env.NVIDIA_API_KEY = 'test-nvidia-key'
    // The studio picker labels the model with its dated checkpoint id and the
    // pipeline can forward it as the provider pin. Both cases must resolve to
    // the nvidia-deepseek pin instead of falling through as an unknown label.
    for (const raw of ['deepseek-ai/deepseek-v4-flash-0731', 'deepseek-ai/DeepSeek-V4-Flash-0731']) {
      const { explicit, prefer } = resolveAiProviderPin(raw)
      expect(explicit).toBe('nvidia-deepseek')
      expect(prefer).toBe('nvidia-deepseek')
    }
  })

  it("routes the lowercase Pro-0813 model id to the Parasail Pro pin", () => {
    process.env.NVIDIA_API_KEY = 'test-nvidia-key'
    const { explicit } = resolveAiProviderPin('deepseek-ai/deepseek-v4-pro-0813')
    expect(explicit).toBe('parasail-deepseek-pro')
  })

  it("is case/whitespace insensitive ('  AUTO ' behaves like auto)", () => {
    process.env.NVIDIA_API_KEY = 'test-nvidia-key'
    const { explicit, prefer } = resolveAiProviderPin('  AUTO ')
    expect(explicit).toBe('')
    expect(prefer).not.toBe('auto')
    expect(prefer.length).toBeGreaterThan(0)
  })

  it("a real pin is normalized to lowercase ('OpenAI' → 'openai')", () => {
    process.env.OPENAI_API_KEY = 'test-openai-key'
    const { explicit, prefer } = resolveAiProviderPin('  OpenAI ')
    expect(explicit).toBe('openai')
    expect(prefer).toBe('openai')
  })

  it("maps GPT model aliases to the openai provider with a model override ('gpt-5.6-terra')", () => {
    process.env.OPENAI_API_KEY = 'test-openai-key'
    const { explicit, prefer, model } = resolveAiProviderPin('gpt-5.6-terra')
    expect(explicit).toBe('openai')
    expect(prefer).toBe('openai')
    expect(model).toBe('gpt-5.6-terra')
  })

  it("maps 'gpt-5.6-sol' to openai + sol model override", () => {
    process.env.OPENAI_API_KEY = 'test-openai-key'
    const { explicit, prefer, model } = resolveAiProviderPin('gpt-5.6-sol')
    expect(explicit).toBe('openai')
    expect(prefer).toBe('openai')
    expect(model).toBe('gpt-5.6-sol')
  })

  it("maps bare 'gpt-5.6' to openai + flagship sol model (alias per GPT-5.6 naming scheme)", () => {
    process.env.OPENAI_API_KEY = 'test-openai-key'
    const { explicit, prefer, model } = resolveAiProviderPin('gpt-5.6')
    expect(explicit).toBe('openai')
    expect(prefer).toBe('openai')
    expect(model).toBe('gpt-5.6-sol')
  })

  it("maps 'gpt-5.6-luna' to openai + luna model override", () => {
    process.env.OPENAI_API_KEY = 'test-openai-key'
    const { explicit, prefer, model } = resolveAiProviderPin('gpt-5.6-luna')
    expect(explicit).toBe('openai')
    expect(prefer).toBe('openai')
    expect(model).toBe('gpt-5.6-luna')
  })

  it("keeps the drafting default 'nvidia-minimax' on MiniMax M3 — never GPT", () => {
    process.env.OPENAI_API_KEY = 'test-openai-key'
    process.env.NVIDIA_API_KEY = 'test-nvidia-key'
    const { explicit, prefer, model } = resolveAiProviderPin('nvidia-minimax')
    expect(explicit).toBe('nvidia-minimax')
    expect(prefer).toBe('nvidia-minimax')
    expect(model || '').not.toMatch(/^gpt-/)
  })

  it("maps MiniMax model aliases to the NVIDIA MiniMax provider", () => {
    process.env.NVIDIA_API_KEY = 'test-nvidia-key'
    for (const raw of ['minimax', 'minimax-m3', 'minimaxai/minimax-m3']) {
      const { explicit, prefer } = resolveAiProviderPin(raw)
      expect(explicit).toBe('nvidia-minimax')
      expect(prefer).toBe('nvidia-minimax')
    }
  })

  it("maps the 'glm-fast' alias to baseten-glm-fast (drafting quick-select)", () => {
    const { explicit, prefer } = resolveAiProviderPin('glm-fast')
    expect(explicit).toBe('baseten-glm-fast')
    expect(prefer).toBe('baseten-glm-fast')
  })

  it("maps 'aihubmix-glm-fast' and aliases to the AIHubmix GLM 5.2 Fast provider", () => {
    process.env.AIHUBMIX_API_KEY = 'test-aihubmix-key'
    for (const raw of ['aihubmix-glm-fast', 'aihubmix-glm', 'glm-fast-aihubmix', 'AIHUBMIX-GLM-FAST']) {
      const { explicit, prefer, model } = resolveAiProviderPin(raw)
      expect({ raw, explicit }).toEqual({ raw, explicit: 'aihubmix-glm-fast' })
      expect(prefer).toBe('aihubmix-glm-fast')
      expect(model || '').not.toMatch(/^gpt-/)
    }
  })

  it('exposes the AIHubmix GLM 5.2 Fast provider when the key is present', () => {
    delete process.env.AIHUBMIX_API_KEY
    expect(isAihubmixGlmFastConfigured()).toBe(false)
    process.env.AIHUBMIX_API_KEY = 'test-aihubmix-key'
    expect(isAihubmixGlmFastConfigured()).toBe(true)
    const p = getAihubmixGlmFastProvider()
    expect(p).not.toBeNull()
    expect(p!.label).toBe('aihubmix-glm-fast')
    expect(p!.model).toBe('glm-5.2-fast-preview')
    expect(p!.baseURL).toContain('aihubmix.com')
  })

  it("auto-mode with no saved order never resolves to openai/gpt for drafting", () => {
    // Clean env: no CONTENT_AI_PROVIDER / ORDER pins, no GPT-leaning keys.
    delete process.env.CONTENT_AI_PROVIDER
    delete process.env.CONTENT_AI_PROVIDER_ORDER
    delete process.env.OPENAI_API_KEY
    process.env.NVIDIA_API_KEY = 'test-nvidia-key'
    process.env.BASETEN_API_KEY = 'test-baseten-key'
    const { explicit, prefer } = resolveAiProviderPin('auto')
    expect(explicit).toBe('')
    expect(prefer).not.toBe('openai')
    expect(prefer).not.toMatch(/^gpt-/) // open-source lead only
  })
})
