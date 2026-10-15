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
    jest.useRealTimers()
  })

  it('uses one settings read and only the connected SuperGrok session', async () => {
    process.env.XAI_API_KEY = 'synthetic-metered-worker-key'
    process.env.GROK_API_KEY = 'synthetic-metered-alias-key'

    const settings = {
      xai_oauth_access_token: 'synthetic-stored-token',
      xai_oauth_expires_at: String(Date.now() + 60_000),
    }
    const getAiSettings = jest.fn(async () => settings)
    const buildVaultEnvOverrides = jest.fn(async () => ({ XAI_API_KEY: 'synthetic-vault-key' }))
    jest.doMock('@/lib/aiKeyVault', () => ({ getAiSettings, buildVaultEnvOverrides }))
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
    expect(auth.baseURL).toBe('https://api.x.ai/v1')
    expect(auth.model).toBe('grok-4.6')
    expect(getAiSettings).toHaveBeenCalledTimes(1)
    expect(buildVaultEnvOverrides).not.toHaveBeenCalled()
  })

  it('fails closed when SuperGrok is absent, even if metered keys are present', async () => {
    process.env.XAI_API_KEY = 'synthetic-metered-worker-key'
    process.env.GROK_API_KEY = 'synthetic-metered-alias-key'
    const buildVaultEnvOverrides = jest.fn(async () => ({ XAI_API_KEY: 'synthetic-vault-key' }))
    jest.doMock('@/lib/aiKeyVault', () => ({ getAiSettings: jest.fn(async () => ({})), buildVaultEnvOverrides }))
    jest.doMock('@/lib/xaiSuperGrokOAuth', () => ({
      ensureSuperGrokAccessToken: jest.fn(async () => null),
      XAI_API_BASE_DEFAULT: 'https://api.x.ai/v1',
      XAI_DEFAULT_MODEL: 'grok-4.6',
    }))

    const { resolveMessengerGrokAuth } = await import('@/lib/messengerAi')
    await expect(resolveMessengerGrokAuth()).rejects.toMatchObject({ name: 'MessengerAuthResolutionError' })
    expect(buildVaultEnvOverrides).not.toHaveBeenCalled()
  })

  it('classifies a settings-pool failure as auth resolution, without key fallback', async () => {
    process.env.XAI_API_KEY = 'synthetic-metered-worker-key'
    const buildVaultEnvOverrides = jest.fn(async () => ({ XAI_API_KEY: 'synthetic-vault-key' }))
    jest.doMock('@/lib/aiKeyVault', () => ({ getAiSettings: jest.fn(async () => { throw new Error('synthetic settings pool timeout') }), buildVaultEnvOverrides }))
    jest.doMock('@/lib/xaiSuperGrokOAuth', () => ({
      ensureSuperGrokAccessToken: jest.fn(),
      XAI_API_BASE_DEFAULT: 'https://api.x.ai/v1',
      XAI_DEFAULT_MODEL: 'grok-4.6',
    }))

    const { resolveMessengerGrokAuth } = await import('@/lib/messengerAi')
    await expect(resolveMessengerGrokAuth()).rejects.toMatchObject({ name: 'MessengerAuthResolutionError' })
    expect(buildVaultEnvOverrides).not.toHaveBeenCalled()
  })

  it('aborts a hanging settings read within the bounded auth allowance', async () => {
    jest.useFakeTimers()
    let settingsSignal: AbortSignal | undefined
    jest.doMock('@/lib/aiKeyVault', () => ({
      getAiSettings: jest.fn(async (_force: boolean, options: { signal?: AbortSignal }) => {
        settingsSignal = options.signal
        return new Promise(() => {})
      }),
    }))
    jest.doMock('@/lib/xaiSuperGrokOAuth', () => ({ ensureSuperGrokAccessToken: jest.fn() }))

    const { resolveMessengerGrokAuth } = await import('@/lib/messengerAi')
    const work = resolveMessengerGrokAuth({ timeoutMs: 25 })
    const rejected = expect(work).rejects.toMatchObject({ name: 'MessengerAuthResolutionError' })
    await jest.advanceTimersByTimeAsync(25)
    await rejected
    expect(settingsSignal?.aborted).toBe(true)
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
