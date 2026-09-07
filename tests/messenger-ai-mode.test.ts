import {
  hasNonEmptySiteKnowledge,
  loadCuratedKbChunks,
  rankChunks,
  resetMessengerKbCache,
  tokenizeQuery,
} from '@/lib/messengerSiteKnowledge'
import path from 'path'

describe('messengerAi mode helpers', () => {
  it('normalizes known modes', async () => {
    const { normalizeAiMode, readAiMode } = await import('@/lib/messengerAi')
    expect(normalizeAiMode('auto')).toBe('auto')
    expect(normalizeAiMode('PAUSED')).toBe('paused')
    expect(normalizeAiMode('off')).toBe('off')
    expect(normalizeAiMode('')).toBe('auto')
    expect(normalizeAiMode(null)).toBe('auto')
    expect(normalizeAiMode('weird')).toBe('auto')
    expect(readAiMode({ ai_mode: 'paused' })).toBe('paused')
    expect(readAiMode({})).toBe('auto')
    expect(readAiMode(null)).toBe('auto')
  })
})

describe('resolveMessengerGrokAuth preference', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    jest.resetModules()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    jest.resetModules()
    jest.clearAllMocks()
  })

  it('prefers SuperGrok OAuth over vault and env keys', async () => {
    process.env.XAI_API_KEY = 'env-should-not-win'
    process.env.GROK_API_KEY = 'env-alias-should-not-win'

    jest.doMock('@/lib/aiKeyVault', () => ({
      buildVaultEnvOverrides: jest.fn(async () => ({
        XAI_API_KEY: 'vault-should-not-win',
        XAI_MODEL: 'grok-from-vault',
      })),
    }))
    jest.doMock('@/lib/xaiSuperGrokOAuth', () => ({
      ensureSuperGrokAccessToken: jest.fn(async () => ({
        accessToken: 'oauth-token-mock',
        expiresAt: Date.now() + 60_000,
        authMode: 'supergrok',
      })),
      XAI_API_BASE_DEFAULT: 'https://api.x.ai/v1',
      XAI_DEFAULT_MODEL: 'grok-4.6',
    }))

    const { resolveMessengerGrokAuth } = await import('@/lib/messengerAi')
    const auth = await resolveMessengerGrokAuth()
    expect(auth.authMode).toBe('supergrok')
    expect(auth.apiKey).toBe('oauth-token-mock')
  })

  it('falls back to vault key when OAuth is absent', async () => {
    delete process.env.XAI_API_KEY
    delete process.env.GROK_API_KEY

    jest.doMock('@/lib/aiKeyVault', () => ({
      buildVaultEnvOverrides: jest.fn(async () => ({
        XAI_API_KEY: 'vault-key-mock',
        XAI_BASE_URL: 'https://api.x.ai/v1',
      })),
    }))
    jest.doMock('@/lib/xaiSuperGrokOAuth', () => ({
      ensureSuperGrokAccessToken: jest.fn(async () => null),
      XAI_API_BASE_DEFAULT: 'https://api.x.ai/v1',
      XAI_DEFAULT_MODEL: 'grok-4.6',
    }))

    const { resolveMessengerGrokAuth } = await import('@/lib/messengerAi')
    const auth = await resolveMessengerGrokAuth()
    expect(auth.authMode).toBe('vault')
    expect(auth.apiKey).toBe('vault-key-mock')
  })

  it('falls back to env only when OAuth and vault are empty', async () => {
    process.env.XAI_API_KEY = 'env-key-mock'
    delete process.env.GROK_API_KEY

    jest.doMock('@/lib/aiKeyVault', () => ({
      buildVaultEnvOverrides: jest.fn(async () => ({})),
    }))
    jest.doMock('@/lib/xaiSuperGrokOAuth', () => ({
      ensureSuperGrokAccessToken: jest.fn(async () => null),
      XAI_API_BASE_DEFAULT: 'https://api.x.ai/v1',
      XAI_DEFAULT_MODEL: 'grok-4.6',
    }))

    const { resolveMessengerGrokAuth } = await import('@/lib/messengerAi')
    const auth = await resolveMessengerGrokAuth()
    expect(auth.authMode).toBe('env')
    expect(auth.apiKey).toBe('env-key-mock')
  })
})

describe('messenger site knowledge loader', () => {
  const kbDir = path.join(process.cwd(), 'content', 'messenger-kb')

  beforeEach(() => {
    resetMessengerKbCache()
  })

  it('loads non-empty curated KB from content/messenger-kb', () => {
    const chunks = loadCuratedKbChunks(kbDir)
    expect(chunks.length).toBeGreaterThan(0)
    expect(chunks.some((c) => /escrow|platform|YouSafe|payment/i.test(c.body))).toBe(true)
    expect(hasNonEmptySiteKnowledge(kbDir)).toBe(true)
  })

  it('ranks escrow-related chunks higher for escrow questions', () => {
    const chunks = loadCuratedKbChunks(kbDir)
    const ranked = rankChunks(chunks, 'How does escrow payment work on YouSafe?', 4)
    expect(ranked.length).toBeGreaterThan(0)
    const blob = ranked.map((c) => `${c.title}\n${c.body}`).join('\n')
    expect(/escrow|payment|offer/i.test(blob)).toBe(true)
  })

  it('tokenizes queries without stopwords', () => {
    expect(tokenizeQuery('How does the escrow work for my offer?')).toEqual(
      expect.arrayContaining(['escrow', 'work', 'offer']),
    )
  })
})
