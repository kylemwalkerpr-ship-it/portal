/**
 * Task 6 (P2-D) — commissioned vault/runtime contract.
 *
 * The vault exposes exactly two executable providers (`grok`,
 * `deepseek-v41-flash`), both derived from `lib/contentAiRegistry.ts`.
 * Historical `ai_provider_keys` rows are read-only audit data: they
 * contribute no credential, base URL, model, or default to execution, and
 * they are labeled dynamically from the stored row (never from a hard-coded
 * retired-provider list).
 */
jest.mock('@supabase/supabase-js', () => {
  type Row = Record<string, unknown>
  let keyRows: Row[] = []
  let settingRows: Row[] = []
  let upserts: Array<{ table: string; value: Row }> = []
  const makeBuilder = (table: string) => {
    const result = table === 'ai_provider_keys'
      ? { data: keyRows, error: null, count: keyRows.length }
      : { data: settingRows, error: null, count: settingRows.length }
    const builder: Record<string, any> = { then: (resolve: any) => Promise.resolve(resolve(result)) }
    for (const m of ['select', 'eq', 'order', 'limit', 'single', 'delete', 'in', 'neq']) {
      builder[m] = () => builder
    }
    builder.upsert = (value: Row) => { upserts.push({ table, value }); return builder }
    return builder
  }
  return {
    __setVaultRows: (rows: Row[]) => { keyRows = rows },
    __setSettingRows: (rows: Row[]) => { settingRows = rows },
    __upserts: () => upserts,
    __resetWrites: () => { upserts = [] },
    createClient: jest.fn(() => ({ from: (table: string) => makeBuilder(table) })),
  }
})

import {
  AI_PROVIDERS,
  DEFAULT_PROVIDER_ORDER,
  buildVaultEnvOverrides,
  commissionedModelIdentity,
  commissionedProviderOrder,
  ensureDraftDefaultSettings,
  isLiveDefaultProvider,
  listLegacyVaultRows,
  listVaultStatus,
  maskKey,
  providerDef,
  vaultProviderInputError,
  type VaultKeyRow,
} from '@/lib/aiKeyVault'
import { COMMISSIONED_PINS } from '@/lib/contentAiRegistry'

const mockModule = jest.requireMock('@supabase/supabase-js') as {
  __setVaultRows: (rows: unknown[]) => void
  __setSettingRows: (rows: unknown[]) => void
  __upserts: () => Array<{ table: string; value: Record<string, unknown> }>
  __resetWrites: () => void
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

const RETIRED_SAMPLE = [
  'entrim-deepseek',
  'entrim-qwen-27b',
  'nvidia-minimax',
  'baseten-deepseek',
  'parasail-deepseek',
  'runbios-glm-53-flash',
  'openai',
  'cloudflare-ai',
  'groq',
  'deepseek',
  'deepseek-flash',
] as const

describe('commissioned vault catalog — two pins only', () => {
  it('exposes exactly the two commissioned pins as vault providers', () => {
    expect(AI_PROVIDERS.map((p) => p.id)).toEqual([...COMMISSIONED_PINS])
    expect(DEFAULT_PROVIDER_ORDER).toEqual([...COMMISSIONED_PINS])
    for (const retired of RETIRED_SAMPLE) {
      expect({ retired, def: providerDef(retired) }).toEqual({ retired, def: undefined })
    }
  })

  it('derives identity/model/base URL/key env from the registry', () => {
    const grok = providerDef('grok')!
    expect(grok.keyEnv).toBe('XAI_API_KEY')
    expect(grok.fixedBaseUrl).toBe('https://api.x.ai/v1')
    expect(grok.defaultModel).toBe('grok-4.6')
    expect(grok.modelOptions).toEqual(['grok-4.6'])

    const deepseek = providerDef('deepseek-v41-flash')!
    expect(deepseek.keyEnv).toBe('DEEPSEEK_API_KEY')
    expect(deepseek.fixedBaseUrl).toBe('https://api.deepseek.com/v1')
    expect(deepseek.defaultModel).toBe('deepseek-flash')
    // The DeepSeek row has no base-URL/model override surface at all.
    expect(deepseek.baseUrlEnv).toBeUndefined()
    expect(deepseek.modelEnv).toBeUndefined()
  })

  it('live-default checks accept only exact commissioned pins (model ids/aliases are NOT pins)', () => {
    expect(isLiveDefaultProvider('grok')).toBe(true)
    expect(isLiveDefaultProvider('deepseek-v41-flash')).toBe(true)
    // Upstream model ids and aliases are provider-input values, never pins.
    expect(isLiveDefaultProvider('grok-4.6')).toBe(false)
    expect(isLiveDefaultProvider('deepseek-flash')).toBe(false)
    expect(isLiveDefaultProvider('xai')).toBe(false)
    expect(isLiveDefaultProvider('supergrok')).toBe(false)
    expect(isLiveDefaultProvider('')).toBe(false)
    expect(isLiveDefaultProvider('auto')).toBe(false)
    // Mixed-case spellings are non-exact: no case folding into a pin.
    expect(isLiveDefaultProvider('GROK')).toBe(false)
    expect(isLiveDefaultProvider('DeepSeek-V41-Flash')).toBe(false)
    expect(isLiveDefaultProvider('deepseek-v41-Flash')).toBe(false)
    for (const retired of RETIRED_SAMPLE) {
      expect({ retired, live: isLiveDefaultProvider(retired) }).toEqual({ retired, live: false })
    }
  })

  it('commissioned model identity stays exact and provider-bound (no case folding, no cross-provider)', () => {
    expect(commissionedModelIdentity('grok-4.6', 'grok')).toBe('grok-4.6')
    expect(commissionedModelIdentity('GROK', 'grok')).toBeNull()
    expect(commissionedModelIdentity('GroK-4.6', 'grok')).toBeNull()
    // A non-exact pin never binds a model identity.
    expect(commissionedModelIdentity('grok-4.6', 'GROK')).toBeNull()
    expect(commissionedModelIdentity('grok-4.6', 'DeepSeek-V41-Flash')).toBeNull()
    // DeepSeek has no model override surface: even its hard-pin model id is
    // not an editable override, and Auto/blank means the registry model.
    expect(commissionedModelIdentity('deepseek-flash', 'deepseek-v41-flash')).toBeNull()
    expect(commissionedModelIdentity('auto', 'grok')).toBeNull()
    expect(commissionedModelIdentity('AUTO', 'grok')).toBeNull()
  })

  it('rejects base-URL and model overrides that would redirect the commissioned transports', () => {
    const grok = providerDef('grok')!
    const deepseek = providerDef('deepseek-v41-flash')!

    expect(vaultProviderInputError(grok, { baseUrl: 'https://api.x.ai/v1' })).toBeNull()
    expect(vaultProviderInputError(grok, { model: 'grok-4.6' })).toBeNull()
    expect(vaultProviderInputError(grok, { baseUrl: 'https://api.entrim.ai/v1' })).toBeTruthy()
    expect(vaultProviderInputError(grok, { baseUrl: 'not-a-url' })).toBeTruthy()
    expect(vaultProviderInputError(grok, { model: 'grok-4' })).toBeTruthy()

    expect(vaultProviderInputError(deepseek, { baseUrl: 'https://api.deepseek.com/v1' })).toBeTruthy()
    expect(vaultProviderInputError(deepseek, { baseUrl: 'https://api.deepseek.com' })).toBeTruthy()
    expect(vaultProviderInputError(deepseek, { model: 'deepseek-flash' })).toBeTruthy()
  })
})

describe('buildVaultEnvOverrides — commissioned rows only', () => {
  const envKeys = ['XAI_API_KEY', 'XAI_BASE_URL', 'XAI_MODEL', 'DEEPSEEK_API_KEY', 'DEEPSEEK_BASE_URL', 'DEEPSEEK_MODEL', 'ENTRIM_API_KEY', 'NVIDIA_API_KEY', 'RUNBIOS_API_KEY'] as const
  const savedEnv: Record<string, string | undefined> = {}

  beforeAll(() => {
    for (const key of envKeys) savedEnv[key] = process.env[key]
  })

  beforeEach(() => {
    for (const key of envKeys) delete process.env[key]
    mockModule.__setVaultRows([])
    mockModule.__setSettingRows([])
    mockModule.__resetWrites()
  })

  afterEach(() => {
    for (const key of envKeys) {
      if (savedEnv[key] == null) delete process.env[key]
      else process.env[key] = savedEnv[key]
    }
  })

  it('overlays the Grok vault key/model and keeps the base URL on api.x.ai only', async () => {
    mockModule.__setVaultRows([
      row({ provider: 'grok', api_key: 'vault-xai-key', base_url: 'https://api.x.ai/v1', model: 'grok-4.6' }),
    ])
    const overlay = await buildVaultEnvOverrides(true)
    expect(overlay.XAI_API_KEY).toBe('vault-xai-key')
    expect(overlay.XAI_MODEL).toBe('grok-4.6')
    expect(overlay.XAI_BASE_URL).toBe('https://api.x.ai/v1')
  })

  it('ignores a Grok row that points at a non-xAI host or an uncommissioned model', async () => {
    mockModule.__setVaultRows([
      row({ provider: 'grok', api_key: 'vault-xai-key', base_url: 'https://api.entrim.ai/v1', model: 'grok-4' }),
    ])
    const overlay = await buildVaultEnvOverrides(true)
    expect(overlay.XAI_API_KEY).toBe('vault-xai-key')
    expect(overlay.XAI_BASE_URL).toBeUndefined()
    expect(overlay.XAI_MODEL).toBeUndefined()
  })

  it('overlays only the DeepSeek credential — never a base URL or model override', async () => {
    mockModule.__setVaultRows([
      row({
        provider: 'deepseek-v41-flash',
        api_key: 'vault-deepseek-key',
        base_url: 'https://api.entrim.ai/v1',
        model: 'deepseek-ai/DeepSeek-V4-Flash-0731',
      }),
    ])
    const overlay = await buildVaultEnvOverrides(true)
    expect(overlay.DEEPSEEK_API_KEY).toBe('vault-deepseek-key')
    expect(overlay.DEEPSEEK_BASE_URL).toBeUndefined()
    expect(overlay.DEEPSEEK_MODEL).toBeUndefined()
    expect(overlay.CONTENT_AI_PROVIDER).toBe('grok')
  })

  it('legacy historical rows contribute no credential or override to execution', async () => {
    mockModule.__setVaultRows([
      row({ provider: 'entrim-deepseek', api_key: 'vault-entrim-key', base_url: 'https://api.entrim.ai/v1', model: 'deepseek-ai/DeepSeek-V4-Flash' }),
      row({ provider: 'nvidia-minimax', api_key: 'vault-nvidia-key', base_url: 'https://integrate.api.nvidia.com/v1', model: 'minimaxai/minimax-m3' }),
      row({ provider: 'runbios-glm-53-flash', api_key: 'vault-runbios-key', base_url: 'https://api.runbios.ai/v1', model: 'glm-5.3-flash' }),
    ])
    const overlay = await buildVaultEnvOverrides(true)
    expect(overlay.ENTRIM_API_KEY).toBeUndefined()
    expect(overlay.NVIDIA_API_KEY).toBeUndefined()
    expect(overlay.RUNBIOS_API_KEY).toBeUndefined()
    expect(JSON.stringify(overlay)).not.toMatch(/entrim|nvidia|runbios|minimax/i)
  })

  it('empty/auto defaults use the lane default; a legacy saved default is never emitted or rewritten', async () => {
    expect((await buildVaultEnvOverrides(true)).CONTENT_AI_PROVIDER).toBe('grok')

    mockModule.__setSettingRows([{ key: 'default_provider', value: 'deepseek-v41-flash' }])
    expect((await buildVaultEnvOverrides(true)).CONTENT_AI_PROVIDER).toBe('deepseek-v41-flash')

    mockModule.__setSettingRows([{ key: 'default_provider', value: 'nvidia-minimax' }])
    const overlay = await buildVaultEnvOverrides(true)
    expect(overlay.CONTENT_AI_PROVIDER).toBeUndefined()
    expect(JSON.stringify(overlay)).not.toMatch(/nvidia-minimax/)
  })

  it('sanitizes a saved provider order to the two commissioned pins, deduped and complete', async () => {
    expect(commissionedProviderOrder(JSON.stringify(['grok', 'entrim-qwen-27b', 'grok', 'deepseek-v41-flash'])))
      .toBe(JSON.stringify(['grok', 'deepseek-v41-flash']))
    // Aliases and upstream model ids are never canonicalized into the order.
    expect(commissionedProviderOrder(JSON.stringify(['grok-4.6', 'xai', 'deepseek-flash', 'deepseek-v41-flash'])))
      .toBe(JSON.stringify(['deepseek-v41-flash', 'grok']))
    // Mixed-case persisted values are dropped, never lowercased into a pin.
    expect(commissionedProviderOrder(JSON.stringify(['GROK', 'DeepSeek-V41-Flash'])))
      .toBe(JSON.stringify(['grok', 'deepseek-v41-flash']))
    expect(commissionedProviderOrder(JSON.stringify(['GROK', 'deepseek-v41-flash'])))
      .toBe(JSON.stringify(['deepseek-v41-flash', 'grok']))

    mockModule.__setSettingRows([{
      key: 'provider_order',
      value: JSON.stringify(['openai', 'deepseek-v41-flash', 'grok', 'deepseek-v41-flash', 'nvidia-minimax']),
    }])
    const overlay = await buildVaultEnvOverrides(true)
    expect(JSON.parse(overlay.CONTENT_AI_PROVIDER_ORDER)).toEqual(['deepseek-v41-flash', 'grok'])
  })

  it('never folds mixed-case persisted values into an executable pin or model', async () => {
    mockModule.__setSettingRows([{ key: 'default_provider', value: 'GROK' }])
    expect((await buildVaultEnvOverrides(true)).CONTENT_AI_PROVIDER).toBeUndefined()

    mockModule.__setSettingRows([
      { key: 'default_provider', value: 'DeepSeek-V41-Flash' },
      { key: 'provider_order', value: JSON.stringify(['GROK', 'deepseek-v41-flash']) },
      { key: 'default_model', value: 'GROK' },
    ])
    const overlay = await buildVaultEnvOverrides(true)
    expect(overlay.CONTENT_AI_PROVIDER).toBeUndefined()
    expect(overlay.CONTENT_AI_DEFAULT_MODEL).toBeUndefined()
    expect(overlay.XAI_MODEL).toBeUndefined()
    expect(JSON.parse(overlay.CONTENT_AI_PROVIDER_ORDER)).toEqual(['deepseek-v41-flash', 'grok'])
  })

  it('preserves vault-over-env precedence for commissioned credentials', async () => {
    process.env.XAI_API_KEY = 'env-deployed-xai-secret'
    mockModule.__setVaultRows([
      row({ provider: 'grok', api_key: 'vault-xai-key-abcdef', base_url: 'https://api.x.ai/v1', model: 'grok-4.6' }),
    ])
    const overlay = await buildVaultEnvOverrides(true)
    expect(overlay.XAI_API_KEY).toBe('vault-xai-key-abcdef')
  })

  it('never emits a stale/arbitrary default_model as an execution model', async () => {
    for (const stale of ['gpt-5.6-terra', 'grok-4', 'deepseek-ai/DeepSeek-V4-Flash']) {
      mockModule.__setSettingRows([
        { key: 'default_provider', value: 'grok' },
        { key: 'default_model', value: stale },
      ])
      const overlay = await buildVaultEnvOverrides(true)
      expect({ stale, xaiModel: overlay.XAI_MODEL, globalModel: overlay.CONTENT_AI_DEFAULT_MODEL })
        .toEqual({ stale, xaiModel: undefined, globalModel: undefined })
    }
  })

  it('emits only the selected provider’s commissioned model identity', async () => {
    mockModule.__setSettingRows([
      { key: 'default_provider', value: 'grok' },
      { key: 'default_model', value: 'grok-4.6' },
    ])
    const overlay = await buildVaultEnvOverrides(true)
    expect(overlay.XAI_MODEL).toBe('grok-4.6')
    expect(overlay.CONTENT_AI_DEFAULT_MODEL).toBe('grok-4.6')

    // A cross-provider model never leaks into the DeepSeek lane.
    mockModule.__setSettingRows([
      { key: 'default_provider', value: 'deepseek-v41-flash' },
      { key: 'default_model', value: 'grok-4.6' },
    ])
    const deepseekOverlay = await buildVaultEnvOverrides(true)
    expect(deepseekOverlay.DEEPSEEK_MODEL).toBeUndefined()
    expect(deepseekOverlay.DEEPSEEK_BASE_URL).toBeUndefined()
    expect(deepseekOverlay.CONTENT_AI_DEFAULT_MODEL).toBeUndefined()
    expect(deepseekOverlay.CONTENT_AI_PROVIDER).toBe('deepseek-v41-flash')
  })
})

describe('ensureDraftDefaultSettings — legacy defaults stay reselection-required', () => {
  beforeEach(() => {
    mockModule.__setVaultRows([])
    mockModule.__resetWrites()
  })

  it('does not rewrite a persisted legacy default but normalizes the order to commissioned pins', async () => {
    mockModule.__setSettingRows([
      { key: 'default_provider', value: 'baseten-deepseek' },
      { key: 'provider_order', value: JSON.stringify(['openai', 'grok']) },
    ])
    // The fixture changes persisted settings directly. Refresh the TTL cache
    // as a separate isolate or force-read would after an external edit.
    await buildVaultEnvOverrides(true)
    await ensureDraftDefaultSettings('test')

    const writes = mockModule.__upserts().filter((u) => u.table === 'ai_settings')
    expect(writes.some((w) => w.value.key === 'default_provider')).toBe(false)
    const orderWrite = writes.find((w) => w.value.key === 'provider_order')
    expect(orderWrite).toBeDefined()
    expect(JSON.parse(String(orderWrite!.value.value))).toEqual(['grok', 'deepseek-v41-flash'])
  })
})

describe('legacy vault visibility — labeled dynamically from stored rows', () => {
  it('lists only the commissioned providers in status, and masks legacy rows for audit', async () => {
    mockModule.__setVaultRows([
      row({ provider: 'grok', api_key: 'vault-xai-key-abcdef', model: 'grok-4.6' }),
      row({ provider: 'entrim-deepseek', api_key: 'vault-entrim-key-abcdef', model: 'deepseek-ai/DeepSeek-V4-Flash' }),
      row({ provider: 'nvidia-minimax', api_key: 'vault-nvidia-key-abcdef', model: 'minimaxai/minimax-m3' }),
    ])
    const status = await listVaultStatus()
    expect(status.map((s) => s.id).sort()).toEqual(['deepseek-v41-flash', 'grok'])

    const legacy = await listLegacyVaultRows()
    expect(legacy.map((l) => l.provider).sort()).toEqual(['entrim-deepseek', 'nvidia-minimax'])
    for (const entry of legacy) {
      expect(entry.maskedKey).toBeTruthy()
      expect(entry.maskedKey).not.toContain('vault-entrim-key-abcdef')
      expect(entry.maskedKey).not.toContain('vault-nvidia-key-abcdef')
    }
    expect(JSON.stringify(legacy)).not.toContain('vault-')
  })

  it('maskKey never returns full key material', () => {
    expect(maskKey('sk-1234567890abcdef')).toBe('sk-1…cdef')
    expect(maskKey('short')).toBe('••••••')
    expect(maskKey('')).toBe('')
  })
})
