/**
 * Task 6 (P2-D) — vault/settings/test/health route + panel contracts.
 *
 * The ai-keys PUT, settings, and test probes accept only the two commissioned
 * pins. DeepSeek input can never redirect the first-party transport, legacy
 * settings writes are rejected before any write, and the operator surfaces
 * carry no retired-provider or cross-provider-fallback copy.
 */
import fs from 'node:fs'
import { NextRequest } from 'next/server'

jest.mock('@/lib/portalAuth', () => ({
  requireAdminUser: jest.fn(async () => ({ profileId: 'admin-1' })),
}))

jest.mock('@/lib/aiKeyVault', () => {
  const actual = jest.requireActual('@/lib/aiKeyVault')
  return {
    ...actual,
    buildVaultEnvOverrides: jest.fn(async () => ({})),
    getAiSettings: jest.fn(async () => ({})),
    setAiSetting: jest.fn(async () => undefined),
    deleteAiSetting: jest.fn(async () => undefined),
    ensureDraftDefaultSettings: jest.fn(async () => undefined),
    ensureParasailDefaultSettings: jest.fn(async () => undefined),
    listVaultStatus: jest.fn(async () => []),
    listLegacyVaultRows: jest.fn(async () => []),
    upsertVaultKey: jest.fn(async (provider: string) => ({
      provider,
      api_key: 'sk-test-value',
      base_url: null,
      model: null,
      enabled: true,
      updated_by: 'admin',
      updated_at: 'now',
    })),
    deleteVaultKey: jest.fn(async () => undefined),
    purgeAllVaultKeys: jest.fn(async () => 0),
    purgeGroupVaultKeys: jest.fn(async () => 0),
  }
})

jest.mock('@/lib/contentAiProvider', () => {
  const actual = jest.requireActual('@/lib/contentAiProvider')
  return {
    ...actual,
    generateContentText: jest.fn(async (opts: { aiProvider?: string }) => ({
      text: 'ok',
      provider: opts?.aiProvider || 'grok',
      model: opts?.aiProvider === 'deepseek-v41-flash' ? 'deepseek-flash' : 'grok-4.6',
    })),
    refreshAiVault: jest.fn(async () => []),
    listConfiguredContentProviders: jest.fn(() => [
      { id: 'grok', label: 'Grok 4.6', configured: true, role: 'primary' as const },
      { id: 'deepseek-v41-flash', label: 'DeepSeek V4.1 Flash', configured: true, role: 'primary' as const },
    ]),
  }
})

jest.mock('@/lib/gscAuth', () => ({
  detectGscAuthMode: jest.fn(async () => null),
  getGscAccess: jest.fn(async () => null),
}))

jest.mock('@/lib/gscConfig', () => ({
  getGscConfig: jest.fn(async () => ({ clientId: '', clientSecret: '', refreshToken: '', siteUrl: null })),
}))

jest.mock('@/lib/xaiSuperGrokOAuth', () => ({
  getSuperGrokStatus: jest.fn(async () => null),
}))

jest.mock('@/lib/seoDataLoaders', () => ({
  loadStrategiesIndex: jest.fn(async () => ({ documents: [{}], ownershipRows: 1, updatedAt: 'now' })),
  loadStrategyPromptPack: jest.fn(async () => ({ standingRules: [{}] })),
}))

import { setAiSetting, upsertVaultKey } from '@/lib/aiKeyVault'
import { generateContentText } from '@/lib/contentAiProvider'

const mockFetch = jest.fn(async () => {
  throw new Error('outbound provider request is forbidden in this test')
})
global.fetch = mockFetch as unknown as typeof fetch

beforeEach(() => {
  jest.clearAllMocks()
})

const jsonRequest = (url: string, body: Record<string, unknown>) =>
  new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('ai-keys PUT — commissioned providers only, hard-pinned input', () => {
  it('rejects a DeepSeek base-URL override before any vault write', async () => {
    const { PUT } = await import('@/app/api/seo-factory/ai-keys/route')
    const response = await PUT(jsonRequest('http://localhost/api/seo-factory/ai-keys', {
      provider: 'deepseek-v41-flash',
      apiKey: 'sk-deepseek',
      baseUrl: 'https://api.entrim.ai/v1',
    }))
    expect(response.status).toBe(400)
    expect(upsertVaultKey).not.toHaveBeenCalled()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('rejects a DeepSeek model override before any vault write', async () => {
    const { PUT } = await import('@/app/api/seo-factory/ai-keys/route')
    const response = await PUT(jsonRequest('http://localhost/api/seo-factory/ai-keys', {
      provider: 'deepseek-v41-flash',
      apiKey: 'sk-deepseek',
      model: 'deepseek-flash',
    }))
    expect(response.status).toBe(400)
    expect(upsertVaultKey).not.toHaveBeenCalled()
  })

  it('rejects a Grok base-URL redirect before any vault write', async () => {
    const { PUT } = await import('@/app/api/seo-factory/ai-keys/route')
    const response = await PUT(jsonRequest('http://localhost/api/seo-factory/ai-keys', {
      provider: 'grok',
      apiKey: 'xai-key',
      baseUrl: 'https://api.entrim.ai/v1',
    }))
    expect(response.status).toBe(400)
    expect(upsertVaultKey).not.toHaveBeenCalled()
  })

  it('accepts the commissioned Grok model only', async () => {
    const { PUT } = await import('@/app/api/seo-factory/ai-keys/route')
    const rejected = await PUT(jsonRequest('http://localhost/api/seo-factory/ai-keys', {
      provider: 'grok',
      apiKey: 'xai-key',
      model: 'grok-4',
    }))
    expect(rejected.status).toBe(400)

    const accepted = await PUT(jsonRequest('http://localhost/api/seo-factory/ai-keys', {
      provider: 'grok',
      apiKey: 'xai-key',
      model: 'grok-4.6',
    }))
    expect(accepted.status).toBe(200)
    expect(upsertVaultKey).toHaveBeenCalledWith('grok', expect.objectContaining({ model: 'grok-4.6' }))
  })
})

describe('ai-keys settings — commissioned pins only, zero partial writes', () => {
  it('accepts the two commissioned pins, canonicalizes aliases, and dedupes the order', async () => {
    const { POST } = await import('@/app/api/seo-factory/ai-keys/settings/route')
    const response = await POST(jsonRequest('http://localhost/api/seo-factory/ai-keys/settings', {
      defaultProvider: 'deepseek-v41-flash',
      providerOrder: ['deepseek-v41-flash', 'grok', 'deepseek-v41-flash'],
    }))
    expect(response.status).toBe(200)
    expect(setAiSetting).toHaveBeenCalledWith('default_provider', 'deepseek-v41-flash')
    const orderCall = (setAiSetting as jest.Mock).mock.calls.find((call) => call[0] === 'provider_order')
    expect(JSON.parse(orderCall![1])).toEqual(['deepseek-v41-flash', 'grok'])
  })

  it('rejects a legacy order entry without writing any setting from the same request', async () => {
    const { POST } = await import('@/app/api/seo-factory/ai-keys/settings/route')
    const response = await POST(jsonRequest('http://localhost/api/seo-factory/ai-keys/settings', {
      defaultProvider: 'grok',
      defaultModel: 'grok-4.6',
      providerOrder: ['grok', 'nvidia-minimax'],
    }))
    expect(response.status).toBe(400)
    expect(setAiSetting).not.toHaveBeenCalled()
  })

  it('rejects the bare deepseek-flash model id as a default provider (not a pin)', async () => {
    const { POST } = await import('@/app/api/seo-factory/ai-keys/settings/route')
    const response = await POST(jsonRequest('http://localhost/api/seo-factory/ai-keys/settings', {
      defaultProvider: 'deepseek-flash',
    }))
    expect(response.status).toBe(400)
    expect(setAiSetting).not.toHaveBeenCalled()
  })
})

describe('ai-keys test probe — commissioned pin only, DeepSeek cannot be redirected', () => {
  it('rejects a DeepSeek base/model override with zero probes', async () => {
    const { POST } = await import('@/app/api/seo-factory/ai-keys/test/route')
    const response = await POST(jsonRequest('http://localhost/api/seo-factory/ai-keys/test', {
      provider: 'deepseek-v41-flash',
      baseUrl: 'https://api.deepseek.com/v1',
    }))
    expect(response.status).toBe(400)
    expect(generateContentText).not.toHaveBeenCalled()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('probes the selected commissioned provider exclusively', async () => {
    const { POST } = await import('@/app/api/seo-factory/ai-keys/test/route')
    const response = await POST(jsonRequest('http://localhost/api/seo-factory/ai-keys/test', {
      provider: 'deepseek-v41-flash',
      apiKey: 'sk-deepseek',
    }))
    expect(response.status).toBe(200)
    expect(generateContentText).toHaveBeenCalledWith(expect.objectContaining({ aiProvider: 'deepseek-v41-flash' }))
    const body = await response.json() as Record<string, unknown>
    expect(body).toMatchObject({ provider: 'deepseek-v41-flash', model: 'deepseek-flash' })
  })
})

describe('ai-keys GET — editable default-model options exclude hard-pinned models', () => {
  it('exposes only the override-capable commissioned model ids', async () => {
    const { GET } = await import('@/app/api/seo-factory/ai-keys/route')
    const response = await GET()
    expect(response.status).toBe(200)
    const body = await response.json() as { defaultModelOptions: string[] }
    // DeepSeek has no model override surface: its upstream model id never
    // appears as an editable choice.
    expect(body.defaultModelOptions).toEqual(['grok-4.6'])
    expect(body.defaultModelOptions).not.toContain('deepseek-flash')
  })
})

describe('operator surfaces carry no retired-provider or fallback-chain copy', () => {
  it('vault panel exposes only commissioned choices and an explicit legacy reselection state', () => {
    const source = fs.readFileSync('components/design/ai-key-vault-panel.tsx', 'utf8')
    expect(source).toContain('Reselect provider')
    expect(source).toContain('Reselect model')
    expect(source).toContain('Legacy vault rows')
    expect(source).not.toMatch(/entrim|api\.entrim\.ai|ENTRIM_API_KEY/i)
    expect(source).not.toMatch(/Grok → OpenAI|gpt-5\.6/i)
    // The default-model control is provider-scoped: it never renders the
    // global editable list, and a hard-pinned provider is labeled as such
    // instead of exposing an impossible model choice.
    expect(source).not.toContain('defaultModelOptions.map')
    expect(source).toContain('effectiveModelOptions.map')
    expect(source).toContain('hard-pinned')
  })

  it('health lists exactly the two commissioned provider checks with no retired label or cross-provider copy', async () => {
    const { GET } = await import('@/app/api/seo-factory/health/route')
    const response = await GET()
    const body = await response.json() as {
      checks: Array<{ id: string; label: string; detail: string; ok: boolean }>
    }

    const providerChecks = body.checks.filter((check) => check.id.startsWith('ai_') && check.id !== 'ai_fallbacks')
    expect(providerChecks.map((check) => check.id).sort()).toEqual(['ai_deepseek-v41-flash', 'ai_grok'])
    for (const check of providerChecks) {
      expect(check.ok).toBe(true)
      expect(`${check.id} ${check.label} ${check.detail}`).not.toMatch(/entrim|nvidia|baseten|parasail|runbios|aihubmix|openai|cloudflare/i)
      expect(check.detail).not.toMatch(/fallback|cascade after|primary\s*(?:→|->)|→\s*fallback/i)
    }

    // The legacy aggregate id may remain for UI shape, but its content must not
    // claim retired Content Studio providers are executable.
    const aggregate = body.checks.find((check) => check.id === 'ai_fallbacks')
    expect(aggregate).toBeDefined()
    expect(`${aggregate!.label} ${aggregate!.detail}`).not.toMatch(/entrim|nvidia|baseten|parasail|runbios|aihubmix|openai|cloudflare|gig/i)
    expect(aggregate!.detail).toMatch(/commissioned/i)
  })

  it('health route source contains no stale cascade copy or retired provider guidance', () => {
    const source = fs.readFileSync('app/api/seo-factory/health/route.ts', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:\\])\/\/[^\n]*/g, '$1')
    const lower = source.toLowerCase()
    for (const stale of ['grok → openai', 'deepseek (nvidia) primary', 'cloudflare fallback', 'fallback chain', 'gig chain', 'free tier']) {
      expect({ stale, present: lower.includes(stale) }).toEqual({ stale, present: false })
    }
    // No human-facing copy may advertise a cross-provider execution cascade.
    expect(source).not.toContain('→')
  })
})

describe('default model is a commissioned registry model, never a free-form override', () => {
  it('rejects stale/non-commissioned default models when the default provider is commissioned', async () => {
    const { POST } = await import('@/app/api/seo-factory/ai-keys/settings/route')
    for (const model of ['gpt-5.6-terra', 'grok-4']) {
      const response = await POST(jsonRequest('http://localhost/api/seo-factory/ai-keys/settings', {
        defaultProvider: 'grok',
        defaultModel: model,
      }))
      expect(response.status).toBe(400)
    }
    expect(setAiSetting).not.toHaveBeenCalled()
  })

  it('rejects a stale default model submitted with no provider (binds to the lane default)', async () => {
    const { POST } = await import('@/app/api/seo-factory/ai-keys/settings/route')
    const response = await POST(jsonRequest('http://localhost/api/seo-factory/ai-keys/settings', {
      defaultModel: 'gpt-5.6-terra',
    }))
    expect(response.status).toBe(400)
    expect(setAiSetting).not.toHaveBeenCalled()
  })

  it('accepts the commissioned Grok model and clears the model with empty/auto', async () => {
    const { POST } = await import('@/app/api/seo-factory/ai-keys/settings/route')
    const accepted = await POST(jsonRequest('http://localhost/api/seo-factory/ai-keys/settings', {
      defaultProvider: 'grok',
      defaultModel: 'grok-4.6',
    }))
    expect(accepted.status).toBe(200)
    expect(setAiSetting).toHaveBeenCalledWith('default_model', 'grok-4.6')

    const cleared = await POST(jsonRequest('http://localhost/api/seo-factory/ai-keys/settings', {
      defaultModel: '',
    }))
    expect(cleared.status).toBe(200)
    expect(setAiSetting).toHaveBeenCalledWith('default_model', '')
  })

  it('rejects the DeepSeek model id as a Grok default model (cross-provider)', async () => {
    const { POST } = await import('@/app/api/seo-factory/ai-keys/settings/route')
    const response = await POST(jsonRequest('http://localhost/api/seo-factory/ai-keys/settings', {
      defaultProvider: 'grok',
      defaultModel: 'deepseek-flash',
    }))
    expect(response.status).toBe(400)
    expect(setAiSetting).not.toHaveBeenCalled()
  })

  it('rejects any explicit model for the hard-pinned DeepSeek provider (no override surface)', async () => {
    const { POST } = await import('@/app/api/seo-factory/ai-keys/settings/route')
    const response = await POST(jsonRequest('http://localhost/api/seo-factory/ai-keys/settings', {
      defaultProvider: 'deepseek-v41-flash',
      defaultModel: 'deepseek-flash',
    }))
    expect(response.status).toBe(400)
    expect(setAiSetting).not.toHaveBeenCalled()
  })
})

describe('provider settings use exact commissioned pins only (no alias/case normalization)', () => {
  it('rejects alias/model-id/mixed-case provider values without writing anything', async () => {
    const { POST } = await import('@/app/api/seo-factory/ai-keys/settings/route')
    for (const defaultProvider of ['grok-4.6', 'xai', 'GROK', 'DeepSeek-V41-Flash', 'deepseek-v41-Flash', 'deepseek-flash']) {
      const response = await POST(jsonRequest('http://localhost/api/seo-factory/ai-keys/settings', { defaultProvider }))
      expect({ defaultProvider, status: response.status }).toEqual({ defaultProvider, status: 400 })
    }
    expect(setAiSetting).not.toHaveBeenCalled()
  })

  it('rejects a non-exact provider-order entry without writing any setting', async () => {
    const { POST } = await import('@/app/api/seo-factory/ai-keys/settings/route')
    for (const order of [['grok', 'xai'], ['GROK'], ['DeepSeek-V41-Flash']]) {
      const response = await POST(jsonRequest('http://localhost/api/seo-factory/ai-keys/settings', {
        defaultProvider: 'grok',
        providerOrder: order,
      }))
      expect({ order, status: response.status }).toEqual({ order, status: 400 })
    }
    expect(setAiSetting).not.toHaveBeenCalled()
  })

  it('accepts exactly the two commissioned pins and dedupes the order', async () => {
    const { POST } = await import('@/app/api/seo-factory/ai-keys/settings/route')
    const response = await POST(jsonRequest('http://localhost/api/seo-factory/ai-keys/settings', {
      defaultProvider: 'grok',
      providerOrder: ['deepseek-v41-flash', 'grok', 'deepseek-v41-flash'],
    }))
    expect(response.status).toBe(200)
    expect(setAiSetting).toHaveBeenCalledWith('default_provider', 'grok')
    const orderCall = (setAiSetting as jest.Mock).mock.calls.find((call) => call[0] === 'provider_order')
    expect(JSON.parse(orderCall![1])).toEqual(['deepseek-v41-flash', 'grok'])
  })
})
