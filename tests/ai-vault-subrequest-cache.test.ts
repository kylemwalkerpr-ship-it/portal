jest.mock('@supabase/supabase-js', () => {
  const state = (globalThis as typeof globalThis & {
    __aiVaultSubrequestDb?: {
      vaultRows: Array<Record<string, unknown>>
      settingRows: Array<Record<string, unknown>>
      reads: Record<string, number>
      writes: Record<string, number>
    }
  }).__aiVaultSubrequestDb ||= {
    vaultRows: [],
    settingRows: [],
    reads: {},
    writes: {},
  }

  const builderFor = (table: string) => {
    let deleting = false
    let updating = false
    let updatePatch: Record<string, unknown> = {}
    const filters: Array<{ field: string; values: unknown[] }> = []
    const builder: Record<string, any> = {
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
        const rows = table === 'ai_provider_keys' ? state.vaultRows : state.settingRows
        if (deleting) {
          const matches = (row: Record<string, unknown>) =>
            filters.every(({ field, values }) => values.includes(row[field]))
          const removed = rows.filter(matches)
          const kept = rows.filter((row) => !matches(row))
          if (table === 'ai_provider_keys') state.vaultRows = kept
          else state.settingRows = kept
          return Promise.resolve({ data: removed, error: null }).then(resolve, reject)
        }
        if (updating) {
          const matched = rows.filter((row) => filters.every(({ field, values }) => values.includes(row[field])))
          for (const row of matched) Object.assign(row, updatePatch)
          return Promise.resolve({ data: matched, error: null }).then(resolve, reject)
        }
        const data = rows
        return Promise.resolve({ data, error: null }).then(resolve, reject)
      },
    }
    builder.select = () => {
      if (!deleting && !updating) state.reads[table] = (state.reads[table] || 0) + 1
      return builder
    }
    builder.eq = (field: string, value: unknown) => {
      if (deleting || updating) filters.push({ field, values: [value] })
      return builder
    }
    builder.in = (field: string, values: unknown[]) => {
      if (deleting || updating) filters.push({ field, values })
      return builder
    }
    for (const method of ['order', 'single', 'neq']) builder[method] = () => builder
    builder.upsert = (input: Array<Record<string, unknown>> | Record<string, unknown>) => {
      state.writes[table] = (state.writes[table] || 0) + 1
      const rows = Array.isArray(input) ? input : [input]
      if (table === 'ai_settings') {
        for (const row of rows) {
          const key = String(row.key)
          state.settingRows = state.settingRows.filter((current) => current.key !== key)
          state.settingRows.push(row)
        }
      }
      return builder
    }
    builder.delete = () => {
      state.writes[table] = (state.writes[table] || 0) + 1
      deleting = true
      return builder
    }
    builder.update = (input: Record<string, unknown>) => {
      state.writes[table] = (state.writes[table] || 0) + 1
      updating = true
      updatePatch = input
      return builder
    }
    return builder
  }

  return {
    __state: state,
    createClient: jest.fn(() => ({ from: (table: string) => builderFor(table) })),
  }
})

type MockDb = {
  vaultRows: Array<Record<string, unknown>>
  settingRows: Array<Record<string, unknown>>
  reads: Record<string, number>
  writes: Record<string, number>
}

const db = (jest.requireMock('@supabase/supabase-js') as { __state: MockDb }).__state
const originalEnv = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  serviceKey: process.env.SUPABASE_SERVICE_ROLE_JWT,
  anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  xaiKey: process.env.XAI_API_KEY,
  deepseekKey: process.env.DEEPSEEK_API_KEY,
}
const originalFetch = global.fetch
let testScope = 0

function resetDb() {
  db.vaultRows = []
  db.settingRows = [{ key: 'provider_order', value: '["grok","deepseek-v41-flash"]' }]
  db.reads = {}
  db.writes = {}
}

function count(table: string): number {
  return db.reads[table] || 0
}

describe('AI vault runtime subrequest cache', () => {
  beforeEach(() => {
    testScope++
    process.env.NEXT_PUBLIC_SUPABASE_URL = `https://vault-scope-${testScope}.supabase.co`
    process.env.SUPABASE_SERVICE_ROLE_JWT = `eyJ.scope-${testScope}`
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    delete process.env.XAI_API_KEY
    delete process.env.DEEPSEEK_API_KEY
    global.fetch = originalFetch
    resetDb()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  afterAll(() => {
    if (originalEnv.url == null) delete process.env.NEXT_PUBLIC_SUPABASE_URL
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalEnv.url
    if (originalEnv.serviceKey == null) delete process.env.SUPABASE_SERVICE_ROLE_JWT
    else process.env.SUPABASE_SERVICE_ROLE_JWT = originalEnv.serviceKey
    if (originalEnv.anonKey == null) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalEnv.anonKey
    if (originalEnv.xaiKey == null) delete process.env.XAI_API_KEY
    else process.env.XAI_API_KEY = originalEnv.xaiKey
    if (originalEnv.deepseekKey == null) delete process.env.DEEPSEEK_API_KEY
    else process.env.DEEPSEEK_API_KEY = originalEnv.deepseekKey
  })

  it('cold-fills vault and settings once for concurrent pair legs, then serves warm generations without reads', async () => {
    const vault = await import('@/lib/aiKeyVault')

    // The pair legs both enter the refresh path before either cold read settles.
    const [left, right] = await Promise.all([
      Promise.all([vault.getVaultKeys(), vault.getAiSettings()]),
      Promise.all([vault.getVaultKeys(), vault.getAiSettings()]),
    ])

    expect(left[0]).toEqual(right[0])
    expect(left[1]).toEqual(right[1])
    expect(count('ai_provider_keys')).toBe(1)
    expect(count('ai_settings')).toBe(1)

    await Promise.all([
      vault.buildVaultEnvOverrides(),
      vault.buildVaultEnvOverrides(),
    ])
    expect(count('ai_provider_keys')).toBe(1)
    expect(count('ai_settings')).toBe(1)
  })

  it('bounds external-change staleness to the documented 45-second TTL', async () => {
    const vault = await import('@/lib/aiKeyVault')
    const now = jest.spyOn(Date, 'now').mockReturnValue(10_000)
    try {
      await Promise.all([vault.getVaultKeys(), vault.getAiSettings()])
      now.mockReturnValue(54_999)
      await Promise.all([vault.getVaultKeys(), vault.getAiSettings()])
      expect(count('ai_provider_keys')).toBe(1)
      expect(count('ai_settings')).toBe(1)

      now.mockReturnValue(55_000)
      await Promise.all([vault.getVaultKeys(), vault.getAiSettings()])
      expect(count('ai_provider_keys')).toBe(2)
      expect(count('ai_settings')).toBe(2)
    } finally {
      now.mockRestore()
    }
  })

  it('force bypasses warm values, coalesces concurrent force reads, and setters invalidate immediately', async () => {
    const vault = await import('@/lib/aiKeyVault')
    await vault.buildVaultEnvOverrides()

    await Promise.all([
      vault.buildVaultEnvOverrides(true),
      vault.buildVaultEnvOverrides(true),
    ])
    expect(count('ai_provider_keys')).toBe(2)
    expect(count('ai_settings')).toBe(2)

    db.settingRows.push({ key: 'default_provider', value: 'grok' })
    await vault.setAiSetting('default_provider', 'deepseek-v41-flash')
    const settings = await vault.getAiSettings()
    expect(settings.default_provider).toBe('deepseek-v41-flash')
    expect(count('ai_settings')).toBe(3)

    await vault.deleteVaultKey('grok')
    await vault.getVaultKeys()
    expect(count('ai_provider_keys')).toBe(3)
  })

  it('shares a cold read between normal and force callers while force still bypasses warm values', async () => {
    const vault = await import('@/lib/aiKeyVault')
    await Promise.all([vault.getVaultKeys(), vault.getVaultKeys(true)])
    await Promise.all([vault.getAiSettings(), vault.getAiSettings(true)])
    expect(count('ai_provider_keys')).toBe(1)
    expect(count('ai_settings')).toBe(1)

    await vault.getVaultKeys(true)
    await vault.getAiSettings(true)
    expect(count('ai_provider_keys')).toBe(2)
    expect(count('ai_settings')).toBe(2)
  })

  it('keeps warm credentials and settings isolated by project URL and resolved key', async () => {
    const vault = await import('@/lib/aiKeyVault')
    const scopeAUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const scopeAKey = process.env.SUPABASE_SERVICE_ROLE_JWT!
    await vault.getVaultKeys()
    await vault.getAiSettings()

    process.env.SUPABASE_SERVICE_ROLE_JWT = 'eyJ.scope-b'
    await vault.getVaultKeys()
    await vault.getAiSettings()
    expect(count('ai_provider_keys')).toBe(2)
    expect(count('ai_settings')).toBe(2)

    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://vault-scope-b.supabase.co'
    await vault.getVaultKeys()
    await vault.getAiSettings()
    expect(count('ai_provider_keys')).toBe(3)
    expect(count('ai_settings')).toBe(3)

    // Returning to an earlier identity can only see its own scoped cache.
    process.env.NEXT_PUBLIC_SUPABASE_URL = scopeAUrl
    process.env.SUPABASE_SERVICE_ROLE_JWT = scopeAKey
    await vault.getVaultKeys()
    await vault.getAiSettings()
    expect(count('ai_provider_keys')).toBe(3)
    expect(count('ai_settings')).toBe(3)
  })

  it('does not expose an injected overlay after the Supabase identity changes', async () => {
    const { contentAiEnv, setVaultOverlay } = await import('@/lib/contentAiProviderCore')
    setVaultOverlay({ DEEPSEEK_API_KEY: 'scope-a-only-key' })
    expect(contentAiEnv('DEEPSEEK_API_KEY')).toBe('scope-a-only-key')

    process.env.SUPABASE_SERVICE_ROLE_JWT = 'eyJ.scope-other'
    expect(contentAiEnv('DEEPSEEK_API_KEY')).toBe('')
    setVaultOverlay(null)
  })

  it('uses two cold Supabase reads for a content refresh and zero on a warm refresh', async () => {
    const { refreshAiVault } = await import('@/lib/contentAiProviderCore')

    // Concurrent pair legs enter the same cold refresh window.
    await Promise.all([refreshAiVault(), refreshAiVault()])
    expect(count('ai_provider_keys')).toBe(1)
    expect(count('ai_settings')).toBe(1)

    await refreshAiVault()
    expect(count('ai_provider_keys')).toBe(1)
    expect(count('ai_settings')).toBe(1)
  })

  it('accounts for the one-time provider-order normalization write and settings reread', async () => {
    db.settingRows = []
    const { refreshAiVault } = await import('@/lib/contentAiProviderCore')
    await refreshAiVault()

    expect(count('ai_provider_keys')).toBe(1)
    expect(count('ai_settings')).toBe(2)
    expect(db.writes.ai_settings).toBe(1)
    expect(db.settingRows.find((row) => row.key === 'provider_order')?.value)
      .toBe('["grok","deepseek-v41-flash"]')
  })

  it('does not add vault/settings reads across engine pair legs after the engine refresh', async () => {
    db.vaultRows = [
      { provider: 'grok', api_key: 'test-xai-key', base_url: null, model: null, enabled: true },
      { provider: 'deepseek-v41-flash', api_key: 'test-deepseek-key', base_url: null, model: null, enabled: true },
    ]

    try {
      await jest.isolateModulesAsync(async () => {
        jest.doMock('@/lib/contentAiProvider', () => {
          const core = jest.requireActual('@/lib/contentAiProviderCore') as {
            refreshAiVault: () => Promise<string[]>
          }
          return {
            refreshAiVault: core.refreshAiVault,
            generateContentText: async (opts: { aiProvider?: string }) => {
              // Model the real content entrypoint's vault refresh, while
              // keeping every upstream provider transport out of this test.
              await core.refreshAiVault()
              return { text: 'Same deterministic pair draft.', provider: opts.aiProvider || 'grok', model: 'mock-model' }
            },
          }
        })

        const { generateEngineText } = await import('@/lib/seoEngine/engineAi')
        const result = await generateEngineText({ system: 'Review this draft.', prompt: 'Draft.' })
        expect(result.pair?.disagreed).toBe(false)
      })
    } finally {
      jest.dontMock('@/lib/contentAiProvider')
    }

    expect(count('ai_provider_keys')).toBe(1)
    expect(count('ai_settings')).toBe(1)
  })

  it('reuses a fresh OAuth credential without an endpoint call or warm-cache reread', async () => {
    db.settingRows = [
      { key: 'provider_order', value: '["grok","deepseek-v41-flash"]' },
      { key: 'xai_oauth_access_token', value: 'fresh-access' },
      { key: 'xai_oauth_refresh_token', value: 'fresh-refresh' },
      { key: 'xai_oauth_expires_at', value: String(Date.now() + 10 * 60_000) },
    ]
    global.fetch = jest.fn() as typeof fetch

    const { refreshAiVault } = await import('@/lib/contentAiProviderCore')
    await refreshAiVault()
    await refreshAiVault()

    expect(count('ai_provider_keys')).toBe(1)
    expect(count('ai_settings')).toBe(1)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('uses two cold reads for the first content generation and none on a warm repeat before provider dispatch', async () => {
    const { generateContentText } = await import('@/lib/contentAiProvider')
    const generate = () => generateContentText({
      aiProvider: 'deepseek-v41-flash',
      system: 'Write a short answer.',
      prompt: 'Return one sentence.',
      skipQualityContract: true,
    })

    // No credentials are configured, so both calls fail closed before any
    // upstream provider transport can run.
    await expect(generate()).rejects.toThrow(/not configured/i)
    expect(count('ai_provider_keys')).toBe(1)
    expect(count('ai_settings')).toBe(1)
    await expect(generate()).rejects.toThrow(/not configured/i)
    expect(count('ai_provider_keys')).toBe(1)
    expect(count('ai_settings')).toBe(1)
  })

  it('refreshes an expired OAuth token once for concurrent pair legs and never reuses it stale', async () => {
    db.settingRows = [
      { key: 'provider_order', value: '["grok","deepseek-v41-flash"]' },
      { key: 'xai_oauth_access_token', value: 'expired-access' },
      { key: 'xai_oauth_refresh_token', value: 'refresh-once' },
      { key: 'xai_oauth_expires_at', value: String(Date.now() - 60_000) },
    ]
    global.fetch = jest.fn(async () => new Response(JSON.stringify({
      access_token: 'fresh-access',
      refresh_token: 'fresh-refresh',
      expires_in: 3600,
      token_type: 'Bearer',
    }), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch

    const { refreshAiVault } = await import('@/lib/contentAiProviderCore')
    await Promise.all([refreshAiVault(), refreshAiVault()])

    expect(count('ai_provider_keys')).toBe(1)
    expect(count('ai_settings')).toBe(2)
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(db.writes.ai_settings).toBe(5) // access, refresh, expiry, type, pending delete
    expect(db.settingRows.find((row) => row.key === 'xai_oauth_access_token')?.value).toBe('fresh-access')

    // The OAuth setters invalidated settings immediately. One later read sees
    // the persisted fresh credential; its following warm refresh is local.
    await refreshAiVault()
    expect(count('ai_settings')).toBe(3)
    await refreshAiVault()
    expect(count('ai_settings')).toBe(3)
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })


})
