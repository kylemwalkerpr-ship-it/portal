import { getGscConfig } from '@/lib/gscConfig'
import { createSupabaseAdminClient } from '@/lib/supabase'

jest.mock('@/lib/supabase', () => ({ createSupabaseAdminClient: jest.fn() }))

const originalEnv = { ...process.env }
afterEach(() => { process.env = { ...originalEnv }; jest.resetAllMocks() })

it('reads the protected GSC connection using a modern server secret', async () => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_gsc_test'
  delete process.env.SUPABASE_SERVICE_ROLE_JWT
  const maybeSingle = jest.fn().mockResolvedValue({ data: { site_url: 'sc-domain:example.com', refresh_token: 'test-refresh' } })
  const eq = jest.fn().mockReturnValue({ maybeSingle })
  const select = jest.fn().mockReturnValue({ eq })
  const from = jest.fn().mockReturnValue({ select })
  jest.mocked(createSupabaseAdminClient).mockReturnValue({ from } as any)

  expect(await getGscConfig()).toMatchObject({ siteUrl: 'sc-domain:example.com', refreshToken: 'test-refresh' })
  expect(from).toHaveBeenCalledWith('gsc_connection')
})

it('does not query a protected connection with only anonymous authority', async () => {
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
  delete process.env.SUPABASE_SERVICE_ROLE_JWT
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'eyJ.test-anon'
  process.env.GSC_SITE_URL = 'sc-domain:fallback.example'

  expect(await getGscConfig()).toMatchObject({ siteUrl: 'sc-domain:fallback.example' })
  expect(createSupabaseAdminClient).not.toHaveBeenCalled()
})
