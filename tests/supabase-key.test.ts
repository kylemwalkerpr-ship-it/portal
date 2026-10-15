/**
 * supabase-key.test.ts
 *
 * Locks legacy JWT / sb_secret_ detection, service-role selection, and the
 * SDK's API-key-only handling for modern secret keys.
 */
import { createClient } from '@supabase/supabase-js'
import {
  classifySupabaseKey,
  isLegacyJwtKey,
  isSecretKey,
  resolveSupabaseKey,
  supabaseAuthMode,
  type SupabaseKeyFormat,
} from '@/lib/supabaseKey'

const LEGACY_SR = 'eyJhbGciOiJIUzI1NiJ9.service_role'
const LEGACY_ANON = 'eyJhbGciOiJIUzI1NiJ9.anon'
const SECRET_SR = 'sb_secret_abc123def456'

describe('classifySupabaseKey', () => {
  const cases: Array<[string | null | undefined, SupabaseKeyFormat]> = [
    [LEGACY_SR, 'legacy-jwt'],
    [LEGACY_ANON, 'legacy-jwt'],
    [SECRET_SR, 'secret'],
    ['sb_secret_short', 'secret'],
    ['', 'missing'],
    [null, 'missing'],
    [undefined, 'missing'],
    ['some-other-format', 'unknown'],
  ]
  for (const [input, expected] of cases) {
    it(`classifies ${JSON.stringify(input)} as ${expected}`, () => {
      expect(classifySupabaseKey(input)).toBe(expected)
    })
  }
})

describe('isLegacyJwtKey / isSecretKey', () => {
  it('detects legacy eyJ JWTs (both service role and anon)', () => {
    expect(isLegacyJwtKey(LEGACY_SR)).toBe(true)
    expect(isLegacyJwtKey(LEGACY_ANON)).toBe(true)
    expect(isLegacyJwtKey(SECRET_SR)).toBe(false)
    expect(isLegacyJwtKey('')).toBe(false)
    expect(isLegacyJwtKey(undefined)).toBe(false)
  })

  it('detects the new sb_secret_ format', () => {
    expect(isSecretKey(SECRET_SR)).toBe(true)
    expect(isSecretKey(LEGACY_SR)).toBe(false)
    expect(isSecretKey(LEGACY_ANON)).toBe(false)
    expect(isSecretKey(null)).toBe(false)
  })
})

describe('resolveSupabaseKey', () => {
  const savedEnv: Record<string, string | undefined> = {}

  beforeEach(() => {
    // The resolver falls back to NEXT_PUBLIC_SUPABASE_ANON_KEY when no
    // explicit keys are passed. A developer's .env.local carries a real anon
    // key — quarantine it so the no-key tests stay hermetic.
    for (const k of ['SUPABASE_SERVICE_ROLE_JWT', 'SUPABASE_SERVICE_ROLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'] as const) {
      savedEnv[k] = process.env[k]
      delete process.env[k]
    }
  })

  afterEach(() => {
    for (const k of Object.keys(savedEnv) as Array<keyof typeof savedEnv>) {
      if (savedEnv[k] == null) delete process.env[k]
      else process.env[k] = savedEnv[k]
    }
  })

  it('prefers the legacy service-role JWT when present', () => {
    expect(resolveSupabaseKey({ serviceRoleKey: LEGACY_SR, anonKey: LEGACY_ANON })).toBe(LEGACY_SR)
  })

  it('uses a modern secret service-role key instead of downgrading to anon', () => {
    expect(resolveSupabaseKey({ serviceRoleKey: SECRET_SR, anonKey: LEGACY_ANON })).toBe(SECRET_SR)
    expect(resolveSupabaseKey({ serviceRoleKey: SECRET_SR, anonKey: LEGACY_ANON, allowAnonFallback: false })).toBe(SECRET_SR)
    expect(supabaseAuthMode({ serviceRoleKey: SECRET_SR, anonKey: LEGACY_ANON })).toBe('service-role')
  })

  it('prefers the modern key during migration when both modern and legacy keys are set', () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = SECRET_SR
    process.env.SUPABASE_SERVICE_ROLE_JWT = LEGACY_SR

    expect(resolveSupabaseKey()).toBe(SECRET_SR)
    expect(supabaseAuthMode()).toBe('service-role')
  })

  it('returns the anon key when no service-role key is set', () => {
    expect(resolveSupabaseKey({ serviceRoleKey: null, anonKey: LEGACY_ANON })).toBe(LEGACY_ANON)
    expect(resolveSupabaseKey({ serviceRoleKey: undefined, anonKey: LEGACY_ANON })).toBe(LEGACY_ANON)
  })

  it('uses the secret-format service role when no anon key is available', () => {
    expect(resolveSupabaseKey({ serviceRoleKey: SECRET_SR, anonKey: null })).toBe(SECRET_SR)
  })

  it('prefers the service-role secret over a secret-format anon key', () => {
    expect(resolveSupabaseKey({ serviceRoleKey: SECRET_SR, anonKey: 'sb_secret_anon' })).toBe(SECRET_SR)
  })

  it('returns null when no key is available', () => {
    expect(resolveSupabaseKey({ serviceRoleKey: null, anonKey: null })).toBe(null)
    expect(resolveSupabaseKey({ serviceRoleKey: '', anonKey: '' })).toBe(null)
  })

  it('accepts modern secret keys in the installed supabase-js client', async () => {
    let capturedHeaders: Headers | undefined
    const client = createClient('https://example.supabase.co', SECRET_SR, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: {
        fetch: async (_input, init) => {
          capturedHeaders = new Headers(init?.headers)
          return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } })
        },
      },
    })

    const { error } = await client.from('profiles').select('id').limit(1)

    expect(capturedHeaders?.get('apikey')).toBe(SECRET_SR)
    expect(error).toBeNull()
  })
})
