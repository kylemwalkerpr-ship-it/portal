/**
 * AI Key Vault precedence — configurator credentials ALWAYS win.
 *
 * COMMISSIONED VAULT (P2-D, 2026-09-15): AI_PROVIDERS holds exactly two rows —
 * xAI Grok 4.6 (SuperGrok OAuth or XAI_API_KEY) and DeepSeek V4.1 Flash
 * (first-party api.deepseek.com, DEEPSEEK_API_KEY). Every other host is a
 * historical, non-executable row that contributes no credential or override.
 *
 * Locks the non-negotiable precedence rule: keys saved through the AI
 * configurator (ai_provider_keys) override process.env / deployment secrets
 * at every call site, deterministically, and without any key material leaking
 * through masks or errors.
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
  listLegacyVaultRows,
  listVaultStatus,
  maskKey,
  type VaultKeyRow,
} from '@/lib/aiKeyVault'
import {
  contentAiEnv,
  isGrokConfigured,
  setVaultOverlay,
} from '@/lib/contentAiProvider'
import { resolveDeepseekFirstPartyApiKey } from '@/lib/contentAiRegistry'

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

describe('vault precedence — configurator keys beat deployment env (Grok + DeepSeek only)', () => {
  const envKeys = ['RUNBIOS_API_KEY', 'RUNBIOS_BASE_URL', 'NVIDIA_API_KEY', 'NVIDIA_BASE_URL', 'XAI_API_KEY', 'DEEPSEEK_API_KEY', 'ENTRIM_API_KEY', 'ENTRIM_BASE_URL'] as const
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

  it('a DeepSeek vault key reaches the first-party resolver and never sets a base URL', async () => {
    mockModule.__setVaultRows([
      row({ provider: 'deepseek-v41-flash', api_key: 'vault-deepseek-key', base_url: 'https://api.entrim.ai/v1', model: 'deepseek-flash' }),
    ])
    const overlay = await buildVaultEnvOverrides(true)
    expect(overlay.DEEPSEEK_API_KEY).toBe('vault-deepseek-key')
    expect(overlay.DEEPSEEK_BASE_URL).toBeUndefined()
    expect(overlay.DEEPSEEK_MODEL).toBeUndefined()
    setVaultOverlay(overlay)

    expect(resolveDeepseekFirstPartyApiKey()).toBe('vault-deepseek-key')
    expect(contentAiEnv('DEEPSEEK_API_KEY')).toBe('vault-deepseek-key')
  })

  it('an xAI Grok vault key overrides the deployed XAI_API_KEY secret at the call site', async () => {
    process.env.XAI_API_KEY = 'env-deployed-xai-secret'
    mockModule.__setVaultRows([
      row({ provider: 'grok', api_key: 'vault-xai-key', base_url: 'https://api.x.ai/v1', model: 'grok-4.6' }),
    ])
    const overlay = await buildVaultEnvOverrides(true)
    expect(overlay.XAI_API_KEY).toBe('vault-xai-key')
    expect(overlay.XAI_MODEL).toBe('grok-4.6')
    setVaultOverlay(overlay)

    expect(contentAiEnv('XAI_API_KEY')).toBe('vault-xai-key')
    expect(contentAiEnv('XAI_MODEL')).toBe('grok-4.6')
    expect(isGrokConfigured()).toBe(true)
  })

  it('without a Grok vault key the console XAI_API_KEY remains the fallback', async () => {
    process.env.XAI_API_KEY = 'xai-subscription-key'
    mockModule.__setVaultRows([])
    const overlay = await buildVaultEnvOverrides(true)
    expect(overlay.XAI_API_KEY).toBeUndefined()
    setVaultOverlay(overlay)
    expect(contentAiEnv('XAI_API_KEY')).toBe('xai-subscription-key')
  })

  it('env values remain the fallback when no usable vault row exists', async () => {
    process.env.XAI_API_KEY = 'env-deployed-xai-secret'
    mockModule.__setVaultRows([])
    const overlay = await buildVaultEnvOverrides(true)
    expect(overlay.XAI_API_KEY).toBeUndefined()
    setVaultOverlay(overlay)
    expect(contentAiEnv('XAI_API_KEY')).toBe('env-deployed-xai-secret')
    expect(isGrokConfigured()).toBe(true)
  })

  it('an empty vault key never shadows the deployment secret', async () => {
    process.env.XAI_API_KEY = 'env-deployed-xai-secret'
    mockModule.__setVaultRows([
      row({ provider: 'grok', api_key: '  ', base_url: null, model: null }),
    ])
    const overlay = await buildVaultEnvOverrides(true)
    setVaultOverlay(overlay)
    expect(contentAiEnv('XAI_API_KEY')).toBe('env-deployed-xai-secret')
  })

  it('retired vault rows (Entrim / Run BiOS / NVIDIA) are ignored — no overlay for their envs', async () => {
    process.env.ENTRIM_API_KEY = 'env-deployed-entrim-secret'
    process.env.RUNBIOS_API_KEY = 'env-deployed-runbios-secret'
    process.env.NVIDIA_API_KEY = 'env-deployed-nvidia-secret'
    mockModule.__setVaultRows([
      row({ provider: 'entrim-deepseek', api_key: 'vault-entrim-key', base_url: 'https://api.entrim.ai/v1', model: 'deepseek-ai/DeepSeek-V4-Flash' }),
      row({ provider: 'runbios-claude-opus', api_key: 'vault-runbios-key', base_url: 'https://api.runbios.ai/v1', model: 'claude-opus-5' }),
      row({ provider: 'nvidia-minimax', api_key: 'vault-nvidia-key', base_url: 'https://integrate.api.nvidia.com/v1', model: 'minimaxai/minimax-m3' }),
    ])
    const overlay = await buildVaultEnvOverrides(true)
    expect(overlay.ENTRIM_API_KEY).toBeUndefined()
    expect(overlay.RUNBIOS_API_KEY).toBeUndefined()
    expect(overlay.NVIDIA_API_KEY).toBeUndefined()
    setVaultOverlay(overlay)
    expect(contentAiEnv('ENTRIM_API_KEY')).toBe('env-deployed-entrim-secret')
    expect(contentAiEnv('RUNBIOS_API_KEY')).toBe('env-deployed-runbios-secret')
    expect(contentAiEnv('NVIDIA_API_KEY')).toBe('env-deployed-nvidia-secret')
  })
})

describe('vault status — masking does not regress', () => {
  afterEach(() => {
    setVaultOverlay(null)
    delete process.env.XAI_API_KEY
  })

  it('masks keys, reports vault-over-env shadowing, and never exposes full key material', async () => {
    process.env.XAI_API_KEY = 'env-deployed-xai-secret-long'
    mockModule.__setVaultRows([
      row({ provider: 'grok', api_key: 'vault-xai-key-abcdef', base_url: 'https://api.x.ai/v1', model: 'grok-4.6' }),
    ])
    const status = await listVaultStatus()
    const grok = status.find((s) => s.id === 'grok')!
    expect(grok.source).toBe('vault')
    expect(grok.envShadowed).toBe(true)
    expect(grok.maskedKey).toMatch(/^vaul…cdef$/)
    expect(grok.envMasked).toMatch(/^env-…long$/)
    const serialized = JSON.stringify(status)
    expect(serialized).not.toContain('vault-xai-key-abcdef')
    expect(serialized).not.toContain('env-deployed-xai-secret-long')
  })

  it('maskKey never returns the full key', () => {
    expect(maskKey('sk-1234567890abcdef')).toBe('sk-1…cdef')
    expect(maskKey('short')).toBe('••••••')
    expect(maskKey('')).toBe('')
    expect(maskKey('sk-1234567890abcdef')).not.toBe('sk-1234567890abcdef')
  })

  it('status lists exactly the two commissioned providers — retired hosts are absent', async () => {
    mockModule.__setVaultRows([
      row({ provider: 'entrim-deepseek', api_key: 'vault-entrim-key' }),
    ])
    const status = await listVaultStatus()
    const ids = status.map((s) => s.id).sort()
    expect(ids).toEqual(['deepseek-v41-flash', 'grok'])
    for (const retired of ['entrim-deepseek', 'entrim-qwen-27b', 'nvidia-minimax', 'runbios-glm-53-flash', 'baseten-deepseek', 'parasail-deepseek', 'openai', 'groq', 'gemini']) {
      expect(status.some((s) => s.id === retired)).toBe(false)
    }
  })

  it('historical rows stay visible for audit, masked, and marked non-executable by absence from status', async () => {
    mockModule.__setVaultRows([
      row({ provider: 'entrim-deepseek', api_key: 'vault-entrim-key-abcdef', model: 'deepseek-ai/DeepSeek-V4-Flash' }),
      row({ provider: 'nvidia-minimax', api_key: 'vault-nvidia-key-abcdef', model: 'minimaxai/minimax-m3' }),
    ])
    const legacy = await listLegacyVaultRows()
    expect(legacy.map((l) => l.provider).sort()).toEqual(['entrim-deepseek', 'nvidia-minimax'])
    const serialized = JSON.stringify(legacy)
    expect(serialized).not.toContain('vault-entrim-key-abcdef')
    expect(serialized).not.toContain('vault-nvidia-key-abcdef')
  })
})

describe('auto default — commissioned pins only, legacy values never emitted', () => {
  afterEach(() => {
    setVaultOverlay(null)
    mockModule.__setSettingRows([])
  })

  it('empty default resolves CONTENT_AI_PROVIDER to the lane default (grok)', async () => {
    mockModule.__setSettingRows([])
    const overlay = await buildVaultEnvOverrides(true)
    expect(overlay.CONTENT_AI_PROVIDER).toBe('grok')
  })

  it('a persisted Grok default is honored', async () => {
    mockModule.__setSettingRows([
      { key: 'default_provider', value: 'grok' },
    ])
    const overlay = await buildVaultEnvOverrides(true)
    expect(overlay.CONTENT_AI_PROVIDER).toBe('grok')
  })

  it('a persisted DeepSeek default is honored as the commissioned pin', async () => {
    mockModule.__setSettingRows([
      { key: 'default_provider', value: 'deepseek-v41-flash' },
    ])
    const overlay = await buildVaultEnvOverrides(true)
    expect(overlay.CONTENT_AI_PROVIDER).toBe('deepseek-v41-flash')
  })

  it('a persisted retired default is never emitted or silently rewritten', async () => {
    mockModule.__setSettingRows([
      { key: 'default_provider', value: 'nvidia-minimax' },
    ])
    const overlay = await buildVaultEnvOverrides(true)
    expect(overlay.CONTENT_AI_PROVIDER).toBeUndefined()
    expect(JSON.stringify(overlay)).not.toContain('nvidia-minimax')
  })
})
