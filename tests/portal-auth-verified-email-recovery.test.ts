const getClerkUserId = jest.fn()
const clerkClient = jest.fn()
const getSupabaseAdminClient = jest.fn()

jest.mock('@/lib/auth', () => ({ getClerkUserId }))
jest.mock('@/lib/supabase', () => ({
  createSupabaseAdminClient: getSupabaseAdminClient,
  getSupabaseAdminClient,
}))
jest.mock('@clerk/nextjs/server', () => ({ clerkClient }))

import { requirePortalUser } from '@/lib/portalAuth'

function makeDb(
  candidate: Record<string, unknown> | null,
  linked: Record<string, unknown> | null,
  current: Record<string, unknown> | null = null,
) {
  const updates: unknown[] = []
  const emailLookup = jest.fn(async () => ({ data: candidate, error: null }))
  const ilikeSearch = jest.fn(() => ({ maybeSingle: emailLookup }))
  const initialLookup = jest.fn(async () => ({ data: current, error: null }))
  const linkedLookup = jest.fn(async () => ({ data: linked, error: null }))
  const db = {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({ single: initialLookup })),
        ilike: ilikeSearch,
      })),
      update: jest.fn((patch: unknown) => {
        updates.push(patch)
        return {
          eq: jest.fn(() => ({
            select: jest.fn(() => ({ single: linkedLookup })),
          })),
        }
      }),
    })),
  }
  return { db, updates, emailLookup, ilikeSearch }
}

describe('requirePortalUser verified email recovery', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getClerkUserId.mockResolvedValue('clerk-current')
  })

  test('relinks a verified primary email and preserves the matched role and status', async () => {
    const existing = {
      id: 'profile-admin',
      clerk_user_id: 'clerk-old',
      role: 'admin',
      status: 'active',
      email: 'admin@example.com',
      full_name: 'Admin',
      country_code: 'US',
      country_source: 'manual',
    }
    const { db, updates, emailLookup } = makeDb(existing, {
      ...existing,
      clerk_user_id: 'clerk-current',
    })
    getSupabaseAdminClient.mockReturnValue(db)
    clerkClient.mockResolvedValue({
      users: {
        getUser: jest.fn(async () => ({
          primaryEmailAddressId: 'email-primary',
          emailAddresses: [{
            id: 'email-primary',
            emailAddress: 'Admin@Example.com',
            verification: { status: 'verified' },
          }],
        })),
      },
    })

    const result = await requirePortalUser()

    expect(emailLookup).toHaveBeenCalledTimes(1)
    expect(updates).toEqual([{ clerk_user_id: 'clerk-current' }])
    expect('error' in result).toBe(false)
    if (!('error' in result)) {
      expect(result.profile.role).toBe('admin')
      expect(result.profile.status).toBe('active')
    }
  })

  test.each([
    {
      label: 'unverified primary address',
      user: {
        primaryEmailAddressId: 'email-primary',
        emailAddresses: [{ id: 'email-primary', emailAddress: 'admin@example.com', verification: { status: 'unverified' } }],
      },
    },
    {
      label: 'verified non-primary address',
      user: {
        primaryEmailAddressId: 'email-primary',
        emailAddresses: [
          { id: 'email-secondary', emailAddress: 'admin@example.com', verification: { status: 'verified' } },
          { id: 'email-primary', emailAddress: 'other@example.com', verification: { status: 'unverified' } },
        ],
      },
    },
    {
      label: 'missing primary ID with a verified fallback',
      user: {
        emailAddresses: [{ id: 'email-first', emailAddress: 'admin@example.com', verification: { status: 'verified' } }],
      },
    },
  ])('does not relink from a $label', async ({ user }) => {
    const { db, updates, emailLookup } = makeDb({
      id: 'profile-admin',
      clerk_user_id: 'clerk-old',
      role: 'admin',
      status: 'active',
      email: 'admin@example.com',
      full_name: 'Admin',
      country_code: 'US',
      country_source: 'manual',
    }, null)
    getSupabaseAdminClient.mockReturnValue(db)
    clerkClient.mockResolvedValue({ users: { getUser: jest.fn(async () => user) } })

    const result = await requirePortalUser()

    expect(emailLookup).not.toHaveBeenCalled()
    expect(updates).toEqual([])
    expect(result).toEqual({ error: 'Profile not found.', status: 404 })
  })

  test('does not relink an ilike wildcard collision', async () => {
    const collision = {
      id: 'profile-collision',
      clerk_user_id: 'clerk-old',
      role: 'admin',
      status: 'active',
      email: 'adminX@example.com',
      full_name: 'Admin',
      country_code: 'US',
      country_source: 'manual',
    }
    const { db, updates, emailLookup, ilikeSearch } = makeDb(collision, null)
    getSupabaseAdminClient.mockReturnValue(db)
    clerkClient.mockResolvedValue({
      users: {
        getUser: jest.fn(async () => ({
          primaryEmailAddressId: 'email-primary',
          emailAddresses: [{
            id: 'email-primary',
            emailAddress: 'admin_@example.com',
            verification: { status: 'verified' },
          }],
        })),
      },
    })

    const result = await requirePortalUser()

    expect(emailLookup).toHaveBeenCalledTimes(1)
    expect(ilikeSearch).toHaveBeenCalledWith('email', 'admin_@example.com')
    expect(updates).toEqual([])
    expect(result).toEqual({ error: 'Profile not found.', status: 404 })
  })

  test('does not backfill an unverified email onto the directly linked profile', async () => {
    const current = {
      id: 'profile-client',
      clerk_user_id: 'clerk-current',
      role: 'client',
      status: 'active',
      email: null,
      full_name: 'Client',
      country_code: 'US',
      country_source: 'manual',
    }
    const { db, updates } = makeDb(null, null, current)
    getSupabaseAdminClient.mockReturnValue(db)
    clerkClient.mockResolvedValue({
      users: {
        getUser: jest.fn(async () => ({
          primaryEmailAddressId: 'email-primary',
          emailAddresses: [{
            id: 'email-primary',
            emailAddress: 'client@example.com',
            verification: { status: 'unverified' },
          }],
        })),
      },
    })

    const result = await requirePortalUser()

    expect(updates).toEqual([])
    expect('error' in result).toBe(false)
    if (!('error' in result)) expect(result.profile.email).toBeNull()
  })
})
