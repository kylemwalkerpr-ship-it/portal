/**
 * P11 auth-CPU remediation — request-aware requireAdminUser + no floating
 * promise in requirePortalUser's email backfill.
 *
 * Evidence reconfirmed (PR #281 parity, generalized only where handlers provably
 * receive a NextRequest):
 *  - `getAuth(NextRequest)` verifies Clerk's middleware AuthSignature + session
 *    JWT via getSessionAuthDataFromRequest — strictly less work than App Router
 *    `auth()`, which traverses extra request-data decryptions.
 *  - `/api/content-studio/model-calibration` and `/api/seo-engine/status` both
 *    receive a real NextRequest but pass nothing to requireAdminUser → requirePortalUser,
 *    so they pay the expensive `auth()` path on every admin hit.
 *  - requirePortalUser's Clerk email backfill is issued as `void db...update()`
 *    — a floating promise. On Workers the invocation may be frozen when the
 *    response is returned, so the backfill can be dropped mid-flight. Await it.
 *
 * Constraints honored: no weakening of Clerk middleware, authorizedParties,
 * pending-session behavior, handoff handling, or profile status/role checks.
 * Client headers are never trusted directly — resolution stays inside Clerk's
 * verified request context.
 */

const getClerkUserId = jest.fn()
const clerkClient = jest.fn()

const profile = {
  id: 'profile-1',
  clerk_user_id: 'clerk-1',
  role: 'admin',
  status: 'active',
  email: 'admin@example.com',
  full_name: 'Admin',
  country_code: 'US',
  country_source: 'ip',
}

const single = jest.fn(async () => ({ data: profile, error: null }))
const updateEq = jest.fn(() => ({ single }))
const update = jest.fn(() => ({ eq: updateEq }))
const eq = jest.fn(() => ({ single }))
const select = jest.fn(() => ({ eq }))
const from = jest.fn(() => ({ select, update }))
const createSupabaseAdminClient = jest.fn(() => ({ from }))
const getSupabaseAdminClient = jest.fn(() => ({ from }))

jest.mock('@/lib/auth', () => ({ getClerkUserId }))
jest.mock('@/lib/supabase', () => ({
  createSupabaseAdminClient,
  getSupabaseAdminClient,
}))
jest.mock('@clerk/nextjs/server', () => ({ clerkClient }))

import { requireAdminUser, requirePortalUser } from '@/lib/portalAuth'

describe('request-aware requireAdminUser', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getClerkUserId.mockResolvedValue('clerk-1')
  })

  test('forwards a supplied request through to Clerk resolution (getAuth path)', async () => {
    const request = { headers: new Headers() }

    const ctx = await (requireAdminUser as any)(request)

    expect('error' in ctx).toBe(false)
    expect(getClerkUserId).toHaveBeenCalledWith(request)
  })

  test('still resolves without a request (server-component parity)', async () => {
    const ctx = await (requireAdminUser as any)()
    expect('error' in ctx).toBe(false)
    expect(getClerkUserId).toHaveBeenCalledWith(undefined)
  })
})

describe('requirePortalUser email backfill is not a floating promise', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getClerkUserId.mockResolvedValue('clerk-1')
  })

  test('awaits the Clerk email backfill update before returning the context', async () => {
    // Profile row exists but has no email → the backfill branch runs.
    const noEmailProfile = { ...profile, email: null as string | null }
    let settleUpdate: (() => void) | null = null
    const updatePromise = new Promise<void>((resolve) => { settleUpdate = resolve })

    const backfillSingle = jest.fn(async () => {
      // The UPDATE promise must be observed before requirePortalUser returns.
      await updatePromise
      return { data: null, error: null }
    })
    // supabase-js query builders are thenables — the awaited value must be the
    // builder's own promise, not a plain object, or `await` would be a no-op.
    const backfillEq = jest.fn(() => backfillSingle())
    const backfillUpdate = jest.fn(() => ({ eq: backfillEq }))
    const db = {
      from(table: string) {
        if (table === 'profiles') {
          return {
            select: () => ({ eq: () => ({ single: jest.fn(async () => ({ data: noEmailProfile, error: null })) }) }),
            update: backfillUpdate,
          }
        }
        return {}
      },
    }
    createSupabaseAdminClient.mockReturnValue(db as any)
    getSupabaseAdminClient.mockReturnValue(db as any)

    clerkClient.mockResolvedValue({
      users: {
        getUser: jest.fn(async () => ({
          primaryEmailAddressId: 'e1',
          emailAddresses: [{ id: 'e1', emailAddress: 'Admin@Example.com' }],
        })),
      },
    })

    const pending = requirePortalUser()
    let settled = false
    void pending.then(() => { settled = true })

    // Yield macrotasks until the backfill UPDATE is issued (bounded so a broken
    // path fails the test instead of hanging).
    for (let i = 0; i < 50 && backfillUpdate.mock.calls.length === 0; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    // Casing is preserved exactly as Clerk reports the primary email (same
    // semantics as before — the recovery path lowercases; this backfill does not).
    expect(backfillUpdate).toHaveBeenCalledWith({ email: 'Admin@Example.com' })

    // The update is still in flight: requirePortalUser must NOT have resolved.
    // A `void db...` floating promise would have returned the context here.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(settled).toBe(false)

    settleUpdate!()
    const ctx = await pending
    expect('error' in ctx).toBe(false)
  })
})
