/**
 * AI Key Vault precedence — configurator credentials ALWAYS win.
 *
 * Locks the non-negotiable precedence rule: keys, base URLs, and models saved
 * through the AI configurator (ai_provider_keys) override process.env /
 * deployment secrets at every call site, deterministically for hosts that
 * share one credential env (RunBiOS, NVIDIA, Baseten), and without any key
 * material leaking through masks or errors.
 */
jest.mock('@supabase/supabase-js', () => {
  type Row = Record<string, unknown>
  let keyRows: Row[] = []
  let settingRows: Row[] = []
  const makeBuilder = (table: string) => {
    const result = table === 'ai_provider_keys'
      ? { data: keyRows, error: null, count: keyRows.length }
      : { data: settingRows, error: null, count: settingRows.length }
    const builder: Record<string, any> = { then: (resolve: any) => Promise.resolve(resolve(result)) }
    for (const m of ['select', 'eq', 'order', 'limit', 'single', 'upsert', 'delete', 'in', 'neq']) {
      builder[m] = () => builder
    }
    return builder
  }
  return {
    __setVaultRows: (rows: Row[]) => { keyRows = rows },
    __setSettingRows: (rows: Row[]) => { settingRows = rows },
    createClient: jest.fn(() => ({
      from: (table: string) => makeBuilder(table),
    })),
  }
})

import {
  buildVaultEnvOverrides,
  listVaultStatus,
  maskKey,
  type VaultKeyRow,
} from '@/lib/aiKeyVault'
import {
  contentAiEnv,
  getEntrimProvider,
  getEntrimQwenProvider,
  getNvidiaMinimaxProvider,
  getRunbiosProvider,
  isRunbiosConfigured,
  setVaultOverlay,
} from '@/lib/contentAiProvider'

const mockModule = jest.requireMock('@supabase/supabase-js') as {
  __setVaultRows: (rows: unknown[]) => void
  __setSettingRows: (rows: unknown[]) => void
}

const row = (partial: Partial<VaultKeyRow>): VaultKeyRow => ({
  provider: '',
  api_key: null,
  base_url: null,
  model: null,
  enabled: true,
  updated_by: 'test',
  updated_at: new Date().toISOString(),
  ...partial,
})

describe('vault precedence — configurator keys beat deployment env', () => {
  const envKeys = ['RUNBIOS_API_KEY', 'RUNBIOS_BASE_URL', 'NVIDIA_API_KEY', 'NVIDIA_BASE_URL', 'XAI_API_KEY'] as const
  const saved: Record<string, string | undefined> = {}

  beforeAll(() => {
    for (const k of envKeys) saved[k] = process.env[k]
  })

  afterEach(() => {
    setVaultOverlay(null)
    for (const k of envKeys) {
      if (saved[k] == null) delete process.env[k]
      else process.env[k] = saved[k]
    }
  })

  it('a RunBiOS vault key overrides the deployed RUNBIOS_API_KEY secret at the call site', async () => {
    process.env.RUNBIOS_API_KEY = 'env-deployed-runbios-secret'
    mockModule.__setVaultRows([
      row({ provider: 'runbios-claude-opus', api_key: 'vault-runbios-key', base_url: 'https://api.runbios.ai/v1', model: 'claude-opus-5' }),
    ])
    const overlay = await buildVaultEnvOverrides(true)
    expect(overlay.RUNBIOS_API_KEY).toBe('vault-runbios-key')
    setVaultOverlay(overlay)

    // The provider implementation resolves through the overlay first.
    expect(contentAiEnv('RUNBIOS_API_KEY')).toBe('vault-runbios-key')
    expect(isRunbiosConfigured()).toBe(true)
    const provider = getRunbiosProvider('runbios-claude-opus')
    expect(provider?.apiKey).toBe('vault-runbios-key')
    // The exact selected pin's API model is honored — never another row's.
    expect(provider?.model).toBe('claude-opus-5')
  })

  it('NVIDIA shared-host rows are deterministic: the first row wins the key/base URL, model envs stay lane-specific', async () => {
    process.env.NVIDIA_API_KEY = 'env-deployed-nvidia-secret'
    mockModule.__setVaultRows([
      row({ provider: 'nvidia-minimax', api_key: 'vault-nvidia-key', base_url: 'https://integrate.api.nvidia.com/v1', model: 'minimaxai/minimax-m3' }),
      row({ provider: 'nvidia-deepseek', api_key: 'other-row-nvidia-key', model: 'deepseek-ai/deepseek-v4-flash-0731' }),
      row({ provider: 'nvidia-glm', api_key: 'third-row-nvidia-key', model: 'z-ai/glm-5.2' }),
    ])
    const overlay = await buildVaultEnvOverrides(true)
    // One shared NVIDIA_API_KEY — no alphabetical row may overwrite it.
    expect(overlay.NVIDIA_API_KEY).toBe('vault-nvidia-key')
    expect(overlay.NVIDIA_BASE_URL).toBe('https://integrate.api.nvidia.com/v1')
    // Model envs remain per-lane so each pin keeps its own configured model.
    expect(overlay.NVIDIA_MINIMAX_MODEL).toBe('minimaxai/minimax-m3')
    expect(overlay.NVIDIA_DEEPSEEK_MODEL).toBe('deepseek-ai/deepseek-v4-flash-0731')
    expect(overlay.NVIDIA_GLM_MODEL).toBe('z-ai/glm-5.2')
    setVaultOverlay(overlay)

    const provider = getNvidiaMinimaxProvider()
    expect(provider?.apiKey).toBe('vault-nvidia-key')
    expect(provider?.model).toBe('minimaxai/minimax-m3')
  })

  it('env values remain the fallback when no usable vault row exists', async () => {
    process.env.RUNBIOS_API_KEY = 'env-deployed-runbios-secret'
    mockModule.__setVaultRows([])
    const overlay = await buildVaultEnvOverrides(true)
    expect(overlay.RUNBIOS_API_KEY).toBeUndefined()
    setVaultOverlay(overlay)
    expect(contentAiEnv('RUNBIOS_API_KEY')).toBe('env-deployed-runbios-secret')
  })

  it('an empty vault key never shadows the deployment secret', async () => {
    process.env.RUNBIOS_API_KEY = 'env-deployed-runbios-secret'
    mockModule.__setVaultRows([
      row({ provider: 'runbios-claude-opus', api_key: '  ', base_url: null, model: null }),
    ])
    const overlay = await buildVaultEnvOverrides(true)
    setVaultOverlay(overlay)
    expect(contentAiEnv('RUNBIOS_API_KEY')).toBe('env-deployed-runbios-secret')
  })

  it('Entrim families keep model envs lane-isolated — the Qwen id never overwrites ENTRIM_MODEL', async () => {
    // Both Entrim families share one ENTRIM_API_KEY row credential, but the
    // DeepSeek lane reads ENTRIM_MODEL and the Qwen lane must land its model
    // on ENTRIM_QWEN_MODEL. Without lane isolation, the later alphabetically
    // sorted Qwen row would overwrite ENTRIM_MODEL with Qwen/Qwen3.6-27B and
    // the DeepSeek pin would silently send the Qwen id.
    mockModule.__setVaultRows([
      row({ provider: 'entrim-deepseek', api_key: 'vault-entrim-key', base_url: 'https://api.entrim.ai/v1', model: 'deepseek-ai/DeepSeek-V4-Flash' }),
      row({ provider: 'entrim-qwen-27b', api_key: 'vault-entrim-key', base_url: 'https://api.entrim.ai/v1', model: 'Qwen/Qwen3.6-27B' }),
    ])
    const overlay = await buildVaultEnvOverrides(true)
    // One shared key; each model env resolves to its own family's id.
    expect(overlay.ENTRIM_API_KEY).toBe('vault-entrim-key')
    expect(overlay.ENTRIM_MODEL).toBe('deepseek-ai/DeepSeek-V4-Flash')
    expect(overlay.ENTRIM_QWEN_MODEL).toBe('Qwen/Qwen3.6-27B')
    setVaultOverlay(overlay)

    expect(getEntrimProvider()!.model).toBe('deepseek-ai/DeepSeek-V4-Flash')
    expect(getEntrimQwenProvider()!.model).toBe('Qwen/Qwen3.6-27B')
    expect(contentAiEnv('ENTRIM_MODEL')).not.toBe('Qwen/Qwen3.6-27B')
  })
})

describe('vault status — masking does not regress', () => {
  afterEach(() => {
    setVaultOverlay(null)
    delete process.env.RUNBIOS_API_KEY
  })

  it('masks keys, reports vault-over-env shadowing, and never exposes full key material', async () => {
    process.env.RUNBIOS_API_KEY = 'env-deployed-runbios-secret-long'
    mockModule.__setVaultRows([
      row({ provider: 'runbios-claude-opus', api_key: 'vault-runbios-key-abcdef', base_url: 'https://api.runbios.ai/v1', model: 'claude-opus-5' }),
    ])
    const status = await listVaultStatus()
    const runbios = status.find((s) => s.id === 'runbios-claude-opus')!
    expect(runbios.source).toBe('vault')
    expect(runbios.envShadowed).toBe(true)
    expect(runbios.maskedKey).toMatch(/^vaul…cdef$/)
    expect(runbios.envMasked).toMatch(/^env-…long$/)
    const serialized = JSON.stringify(status)
    expect(serialized).not.toContain('vault-runbios-key-abcdef')
    expect(serialized).not.toContain('env-deployed-runbios-secret-long')
  })

  it('maskKey never returns the full key', () => {
    expect(maskKey('sk-1234567890abcdef')).toBe('sk-1…cdef')
    expect(maskKey('short')).toBe('••••••')
    expect(maskKey('')).toBe('')
    expect(maskKey('sk-1234567890abcdef')).not.toBe('sk-1234567890abcdef')
  })
})

describe('auto-cascade default — graduated Entrim fallback, never stale MiniMax', () => {
  it('empty/stale default_provider resolves CONTENT_AI_PROVIDER to entrim-qwen-27b', async () => {
    process.env.ENTRIM_API_KEY = 'test-entrim-key'
    // Empty settings (no default_provider) → the overlay must NOT fall back
    // to the pre-graduation hardcoded nvidia-minimax (whose 429 killed drafts).
    const overlay = await buildVaultEnvOverrides(true)
    expect(overlay.CONTENT_AI_PROVIDER).toBe('entrim-qwen-27b')
  })

  it('a persisted nvidia-minimax default is treated as stale → entrim qwen', async () => {
    process.env.ENTRIM_API_KEY = 'test-entrim-key'
    const overlay = await buildVaultEnvOverrides(true)
    expect(overlay.CONTENT_AI_PROVIDER).not.toBe('nvidia-minimax')
  })
})
