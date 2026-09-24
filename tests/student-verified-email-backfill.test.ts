const getClerkUserId = jest.fn()
const clerkClient = jest.fn()
const createSupabaseAdminClient = jest.fn()

jest.mock('@/lib/auth', () => ({ getClerkUserId }))
jest.mock('@/lib/supabase', () => ({ createSupabaseAdminClient }))
jest.mock('@clerk/nextjs/server', () => ({ clerkClient }))

import { getCurrentStudent } from '@/lib/student'

describe('getCurrentStudent verified email backfill', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getClerkUserId.mockResolvedValue('clerk-current')
  })

  function setup(profileEmail: string | null, clerkUser: unknown) {
    const profile = {
      id: 'profile-client',
      role: 'client',
      status: 'active',
      email: profileEmail,
      full_name: 'Client',
    }
    const profileLookup = jest.fn(async () => ({ data: profile, error: null }))
    const updateEq = jest.fn(async () => ({ error: null }))
    const update = jest.fn(() => ({ eq: updateEq }))
    const db = {
      from: jest.fn(() => ({
        select: jest.fn(() => ({ eq: jest.fn(() => ({ single: profileLookup })) })),
        update,
      })),
    }
    createSupabaseAdminClient.mockReturnValue(db)
    clerkClient.mockResolvedValue({ users: { getUser: jest.fn(async () => clerkUser) } })
    return { profile, update }
  }

  test('does not backfill an unverified primary address', async () => {
    const { profile, update } = setup(null, {
      primaryEmailAddressId: 'email-primary',
      emailAddresses: [{
        id: 'email-primary',
        emailAddress: 'client@example.com',
        verification: { status: 'unverified' },
      }],
    })

    const result = await getCurrentStudent()

    expect(update).not.toHaveBeenCalled()
    expect('error' in result).toBe(false)
    expect(profile.email).toBeNull()
  })

  test('backfills only the normalized verified primary address', async () => {
    const { profile, update } = setup(null, {
      primaryEmailAddressId: 'email-primary',
      emailAddresses: [{
        id: 'email-primary',
        emailAddress: ' Client@Example.COM ',
        verification: { status: 'verified' },
      }],
    })

    await getCurrentStudent()

    expect(profile.email).toBe('client@example.com')
    expect(update).toHaveBeenCalledWith({ email: 'client@example.com' })
  })
})
