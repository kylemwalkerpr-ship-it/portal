/**
 * supabase-key.test.ts
 *
 * Locks the legacy-eyJ / sb_secret_ key detection + the safe anon fallback so
 * supabase reads work with either key format (the newer sb_secret_ service
 * role is rejected by supabase-js v2, so callers fall back to the legacy anon
 * JWT against open-RLS tables).
 */
import {
  classifySupabaseKey,
  isLegacyJwtKey,
  isSecretKey,
  resolveSupabaseKey,
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
  it('prefers the legacy service-role JWT when present', () => {
    expect(resolveSupabaseKey({ serviceRoleKey: LEGACY_SR, anonKey: LEGACY_ANON })).toBe(LEGACY_SR)
  })

  it('falls back to the legacy anon key when the service role is the new sb_secret_ format', () => {
    expect(resolveSupabaseKey({ serviceRoleKey: SECRET_SR, anonKey: LEGACY_ANON })).toBe(LEGACY_ANON)
  })

  it('returns the anon key when no service-role key is set', () => {
    expect(resolveSupabaseKey({ serviceRoleKey: null, anonKey: LEGACY_ANON })).toBe(LEGACY_ANON)
    expect(resolveSupabaseKey({ serviceRoleKey: undefined, anonKey: LEGACY_ANON })).toBe(LEGACY_ANON)
  })

  it('returns the secret-format service role as a last resort (so the caller surfaces the real error)', () => {
    expect(resolveSupabaseKey({ serviceRoleKey: SECRET_SR, anonKey: null })).toBe(SECRET_SR)
  })

  it('prefers the secret-format service role over a secret-format anon as a last resort', () => {
    // Neither is a legacy JWT, so the service role wins (it is the more
    // privileged key; the caller surfaces the real supabase-js error).
    expect(resolveSupabaseKey({ serviceRoleKey: SECRET_SR, anonKey: 'sb_secret_anon' })).toBe(SECRET_SR)
  })

  it('returns null when no key is available', () => {
    expect(resolveSupabaseKey({ serviceRoleKey: null, anonKey: null })).toBe(null)
    expect(resolveSupabaseKey({ serviceRoleKey: '', anonKey: '' })).toBe(null)
  })
})
