import { describe, expect, it, jest } from '@jest/globals'

describe('SuperGrok configurator health route contract', () => {
  it('exposes separate OAuth connection and inference health fields', async () => {
    jest.resetModules()
    jest.doMock('@/lib/portalAuth', () => ({
      requireAdminUser: jest.fn(async () => ({ user: { id: 'admin' } })),
    }))
    jest.doMock('@/lib/aiKeyVault', () => ({
      AI_PROVIDERS: [],
      getAiSettings: jest.fn(async () => ({})),
      listVaultStatus: jest.fn(async () => []),
      upsertVaultKey: jest.fn(),
      deleteVaultKey: jest.fn(),
      purgeAllVaultKeys: jest.fn(),
      purgeGroupVaultKeys: jest.fn(),
      maskKey: jest.fn(),
    }))
    jest.doMock('@/lib/contentAiProvider', () => ({
      refreshAiVault: jest.fn(async () => ['XAI_API_KEY']),
      probeSuperGrokInference: jest.fn(async () => ({ ok: false, error: '522' })),
    }))
    jest.doMock('@/lib/xaiSuperGrokOAuth', () => ({
      getSuperGrokStatus: jest.fn(async () => ({
        connected: true,
        pending: false,
        expiresAt: Date.now() + 60_000,
        userCode: null,
        verificationUri: null,
        verificationUriComplete: null,
        interval: null,
        model: 'grok-4.6',
        clientConfigured: true,
      })),
      superGrokOperationalState: jest.fn(() => 'degraded'),
    }))

    const { GET } = await import('@/app/api/seo-factory/ai-keys/route')
    const response = await GET()
    const body = await response.json() as Record<string, any>

    expect(body.grokOAuth.connected).toBe(true)
    expect(body.grokInference).toEqual(expect.objectContaining({ ok: false }))
    expect(body.grokOperationalState).toBe('degraded')
  })
})
