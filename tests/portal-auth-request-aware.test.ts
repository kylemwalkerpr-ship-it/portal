const getClerkUserId = jest.fn()
const clerkClient = jest.fn()

const profile = {
  id: 'profile-1',
  clerk_user_id: 'clerk-1',
  role: 'client',
  status: 'active',
  email: 'client@example.com',
  full_name: 'Client',
  country_code: 'US',
  country_source: 'ip',
}

const single = jest.fn(async () => ({ data: profile, error: null }))
const eq = jest.fn(() => ({ single }))
const select = jest.fn(() => ({ eq }))
const from = jest.fn(() => ({ select }))
const createSupabaseAdminClient = jest.fn(() => ({ from }))

jest.mock('@/lib/auth', () => ({ getClerkUserId }))
jest.mock('@/lib/supabase', () => ({ createSupabaseAdminClient, getSupabaseAdminClient: createSupabaseAdminClient }))
jest.mock('@clerk/nextjs/server', () => ({ clerkClient }))

import { requirePortalUser } from '@/lib/portalAuth'

describe('request-aware portal auth', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getClerkUserId.mockResolvedValue('clerk-1')
  })

  test('forwards an supplied request to getClerkUserId', async () => {
    const request = { headers: new Headers() }

    const result = await (requirePortalUser as any)(request)

    expect('error' in result).toBe(false)
    expect(getClerkUserId).toHaveBeenCalledWith(request)
  })
})