/**
 * P11 auth-CPU remediation — per-isolate service-role Supabase admin client reuse.
 *
 * Evidence reconfirmed: `createSupabaseAdminClient()` (lib/supabase.ts) constructs a
 * fresh supabase-js client on every call with `{ autoRefreshToken: false,
 * persistSession: false }` and env-derived keys only — no request or user mutable
 * state. `requirePortalUser` calls it per request; model-calibration builds a second
 * raw `createClient` per request; `loadVisibilityFeed` / `assembleAuditQueryPool` /
 * `runVisibilityAudits` / `loadLlmVisibilityEvidence` each build another one.
 * supabase-js client construction is real per-request CPU on the hottest Worker.
 *
 * Contract under test:
 *  1. `getSupabaseAdminClient()` returns the SAME instance for the lifetime of the
 *     isolate (cached), while `createSupabaseAdminClient()` keeps returning fresh
 *     instances for callers that legitimately need their own (behavior preserved).
 *  2. The cached instance is constructed with auth persistence/refresh disabled.
 *  3. The cache is keyed on the resolved key material: rotating
 *     `SUPABASE_SERVICE_ROLE_JWT`/`SUPABASE_SERVICE_ROLE_KEY` between calls must not
 *     pin a stale client.
 *  4. `/api/content-studio/model-calibration` no longer constructs a second raw
 *     supabase client per request.
 */

const createClient = jest.fn()

jest.mock('@supabase/supabase-js', () => ({ createClient }))

type FakeClient = { __id: number; auth: { autoRefreshToken: boolean; persistSession: boolean } }

let clientSeq = 0
/** A fake client that can answer any query with empty success data. */
function fakeClient(): FakeClient & { from: (table: string) => unknown } {
  const chain: any = {}
  for (const method of ['select', 'eq', 'like', 'gte', 'order', 'limit']) chain[method] = () => chain
  chain.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve({ data: [], error: null, count: 0 }).then(resolve)
  return { __id: ++clientSeq, auth: { autoRefreshToken: false, persistSession: false }, from: () => chain }
}

function setEnv(overrides: Record<string, string | undefined> = {}) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_JWT = overrides.SUPABASE_SERVICE_ROLE_JWT ?? 'eyJ-service-jwt'
  process.env.SUPABASE_SERVICE_ROLE_KEY = overrides.SUPABASE_SERVICE_ROLE_KEY ?? undefined
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = overrides.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? undefined
}

describe('per-isolate admin client reuse', () => {
  let supabase: typeof import('@/lib/supabase')

  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    clientSeq = 0
    createClient.mockImplementation(() => fakeClient())
    setEnv()
    // Fresh module graph per test so the isolate-level cache starts cold.
    supabase = require('@/lib/supabase')
  })

  it('returns the same client instance across repeated calls (per-isolate cache)', () => {
    const a = supabase.getSupabaseAdminClient()
    const b = supabase.getSupabaseAdminClient()
    const c = supabase.getSupabaseAdminClient()
    expect(a).toBe(b)
    expect(b).toBe(c)
    expect(createClient).toHaveBeenCalledTimes(1)
  })

  it('constructs the cached client with auth persistence and refresh disabled', () => {
    supabase.getSupabaseAdminClient()
    expect(createClient).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'eyJ-service-jwt',
      expect.objectContaining({ auth: { autoRefreshToken: false, persistSession: false } }),
    )
  })

  it('keeps createSupabaseAdminClient returning a fresh instance per call', () => {
    const a = supabase.createSupabaseAdminClient()
    const b = supabase.createSupabaseAdminClient()
    expect(a).not.toBe(b)
    expect(createClient).toHaveBeenCalledTimes(2)
  })

  it('does not pin a stale client when the service-role key material changes', () => {
    const first = supabase.getSupabaseAdminClient()
    setEnv({ SUPABASE_SERVICE_ROLE_JWT: 'eyJ-rotated-jwt' })
    const second = supabase.getSupabaseAdminClient()
    expect(second).not.toBe(first)
    expect(createClient).toHaveBeenCalledTimes(2)
    expect(createClient).toHaveBeenLastCalledWith(
      'https://example.supabase.co',
      'eyJ-rotated-jwt',
      expect.objectContaining({ auth: { autoRefreshToken: false, persistSession: false } }),
    )
  })
})

describe('/api/content-studio/model-calibration client dedup', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    clientSeq = 0
  })

  it('runs its queries on the shared admin client without constructing a second raw client', async () => {
    setEnv()
    const shared = fakeClient()
    const authDb = fakeClient()
    const routeDbSpy = jest.fn(() => shared)
    jest.doMock('@/lib/supabase', () => ({
      getSupabaseAdminClient: routeDbSpy,
      createSupabaseAdminClient: () => fakeClient(),
      isServiceRoleAchieved: () => true,
    }))
    jest.doMock('@/lib/portalAuth', () => ({
      requireAdminUser: jest.fn(async () => ({
        db: authDb,
        profile: { id: 'admin-1' },
        profileId: 'admin-1',
        role: 'admin',
      })),
    }))

    const { GET } = await import('@/app/api/content-studio/model-calibration/route')
    const res = await GET(new Request('https://portal.example/api/content-studio/model-calibration') as any)
    expect(res.status).toBe(200)

    // Auth has already resolved the admin DB. The route must reuse that exact
    // client rather than resolve the singleton a second time.
    expect(routeDbSpy).not.toHaveBeenCalled()
  })
})
