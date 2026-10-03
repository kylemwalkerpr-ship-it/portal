import {
  createSupabaseServiceRoleClient,
  resolveSupabaseServiceRoleJwt,
} from '@/lib/supabase'

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ from: jest.fn() })),
}))

import { createClient } from '@supabase/supabase-js'

function jwt(role: unknown, header: unknown = { alg: 'HS256', typ: 'JWT' }) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode(header)}.${encode({ role })}.signature`
}

const ENV_KEYS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_JWT',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
] as const
const originalEnv = new Map(ENV_KEYS.map((key) => [key, process.env[key]]))

beforeEach(() => {
  jest.mocked(createClient).mockClear()
  for (const key of ENV_KEYS) delete process.env[key]
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co'
})

afterAll(() => {
  for (const key of ENV_KEYS) {
    const value = originalEnv.get(key)
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

describe('strict Supabase service-role credential', () => {
  it.each([undefined, '', 'not-a-jwt', 'eyJ.bad.signature', 'eyJ.e30.signature', 'sb_secret_unsupported']) (
    'rejects malformed or missing credential %s', (credential) => {
      process.env.SUPABASE_SERVICE_ROLE_JWT = credential
      expect(resolveSupabaseServiceRoleJwt()).toBeNull()
      expect(createSupabaseServiceRoleClient()).toBeNull()
      expect(createClient).not.toHaveBeenCalled()
    },
  )

  it.each(['anon', 'authenticated', 'postgres', 'service-role', null, 42])(
    'rejects a JWT with unsupported role claim %s', (role) => {
      process.env.SUPABASE_SERVICE_ROLE_JWT = jwt(role)
      expect(resolveSupabaseServiceRoleJwt()).toBeNull()
      expect(createSupabaseServiceRoleClient()).toBeNull()
      expect(createClient).not.toHaveBeenCalled()
    },
  )

  it('rejects a JWT without a role claim and a malformed header', () => {
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
    process.env.SUPABASE_SERVICE_ROLE_JWT = `${encode({ alg: 'HS256' })}.${encode({ sub: 'x' })}.sig`
    expect(resolveSupabaseServiceRoleJwt()).toBeNull()

    process.env.SUPABASE_SERVICE_ROLE_JWT = jwt('service_role', { alg: 'none' })
    expect(resolveSupabaseServiceRoleJwt()).toBeNull()
  })

  it('uses supported service-role precedence and never falls back to anon', () => {
    const preferred = jwt('service_role')
    const secondary = jwt('service_role')
    process.env.SUPABASE_SERVICE_ROLE_JWT = preferred
    process.env.SUPABASE_SERVICE_ROLE_KEY = secondary
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = jwt('anon')

    expect(resolveSupabaseServiceRoleJwt()).toBe(preferred)
    expect(createSupabaseServiceRoleClient()).not.toBeNull()
    expect(createClient).toHaveBeenCalledWith(
      'https://project.supabase.co', preferred,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    process.env.SUPABASE_SERVICE_ROLE_JWT = jwt('authenticated')
    expect(resolveSupabaseServiceRoleJwt()).toBe(secondary)
    delete process.env.SUPABASE_SERVICE_ROLE_JWT
    expect(resolveSupabaseServiceRoleJwt()).toBe(secondary)
  })

  it('tries the legacy key when the preferred JWT is malformed or has the wrong role', () => {
    const secondary = jwt('service_role')
    process.env.SUPABASE_SERVICE_ROLE_KEY = secondary

    process.env.SUPABASE_SERVICE_ROLE_JWT = 'not-a-jwt'
    expect(resolveSupabaseServiceRoleJwt()).toBe(secondary)

    process.env.SUPABASE_SERVICE_ROLE_JWT = jwt('authenticated')
    expect(resolveSupabaseServiceRoleJwt()).toBe(secondary)
  })

  it('rejects new secret keys for this supabase-js legacy-JWT client path', () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_not-supported-by-current-client-path'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = jwt('anon')
    expect(resolveSupabaseServiceRoleJwt()).toBeNull()
    expect(createSupabaseServiceRoleClient()).toBeNull()
    expect(createClient).not.toHaveBeenCalled()
  })
})
