jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }))

import { createClient } from '@supabase/supabase-js'
import { createSupabaseAdminClient } from '@/lib/supabase'

const mockCreateClient = createClient as unknown as jest.Mock
const URL_A = 'https://project-a.supabase.co'
const URL_B = 'https://project-b.supabase.co'
const KEY_A = 'eyJhbGciOiJIUzI1NiJ9.service-role-a'
const KEY_B = 'eyJhbGciOiJIUzI1NiJ9.service-role-b'

const savedEnv = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  jwt: process.env.SUPABASE_SERVICE_ROLE_JWT,
  key: process.env.SUPABASE_SERVICE_ROLE_KEY,
  anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
}

function setConfig(url: string, key: string) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = url
  process.env.SUPABASE_SERVICE_ROLE_JWT = key
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
}
let testConfigId = 0

beforeEach(() => {
  mockCreateClient.mockReset()
  mockCreateClient.mockImplementation(() => ({ instance: Symbol('supabase') }))
  testConfigId += 1
  setConfig(URL_A, `${KEY_A}-${testConfigId}`)
})

afterAll(() => {
  if (savedEnv.url == null) delete process.env.NEXT_PUBLIC_SUPABASE_URL
  else process.env.NEXT_PUBLIC_SUPABASE_URL = savedEnv.url
  if (savedEnv.jwt == null) delete process.env.SUPABASE_SERVICE_ROLE_JWT
  else process.env.SUPABASE_SERVICE_ROLE_JWT = savedEnv.jwt
  if (savedEnv.key == null) delete process.env.SUPABASE_SERVICE_ROLE_KEY
  else process.env.SUPABASE_SERVICE_ROLE_KEY = savedEnv.key
  if (savedEnv.anon == null) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = savedEnv.anon
})

test('reuses one admin client for the same URL and resolved key', () => {
  const first = createSupabaseAdminClient()
  const second = createSupabaseAdminClient()
  expect(second).toBe(first)
  expect(mockCreateClient).toHaveBeenCalledTimes(1)
})

test('does not reuse a client after the URL or resolved key changes', () => {
  const first = createSupabaseAdminClient()
  setConfig(URL_B, KEY_A)
  const second = createSupabaseAdminClient()
  setConfig(URL_B, KEY_B)
  const third = createSupabaseAdminClient()

  expect(second).not.toBe(first)
  expect(third).not.toBe(second)
  expect(mockCreateClient).toHaveBeenCalledTimes(3)
})

test('a failed client construction does not poison a later retry', () => {
  const recovered = { instance: Symbol('recovered') }
  mockCreateClient
    .mockImplementationOnce(() => { throw new Error('constructor failed') })
    .mockReturnValueOnce(recovered)

  expect(() => createSupabaseAdminClient()).toThrow('constructor failed')
  expect(createSupabaseAdminClient()).toBe(recovered)
  expect(mockCreateClient).toHaveBeenCalledTimes(2)
})
