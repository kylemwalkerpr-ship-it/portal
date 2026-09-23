import type { NextRequest } from 'next/server'
import { NextRequest as NodeNextRequest } from 'next/server'

const getClerkUserId = jest.fn()
const requireAdminUser = jest.fn()
const requirePortalUser = jest.fn()
const single = jest.fn()
const eq = jest.fn(() => ({ single }))
const select = jest.fn(() => ({ eq }))
const from = jest.fn(() => ({ select }))
const createSupabaseAdminClient = jest.fn(() => ({ from }))

jest.mock('@/lib/auth', () => ({ getClerkUserId }))
jest.mock('@/lib/portalAuth', () => ({ requireAdminUser, requirePortalUser }))
jest.mock('@/lib/supabase', () => ({ createSupabaseAdminClient }))

import { GET as profileGet, PATCH as profilePatch } from '@/app/api/profile/route'
import { GET as themeGet, PATCH as themePatch } from '@/app/api/profile/theme/route'
import { GET as overviewGet } from '@/app/api/admin/analytics/overview/route'
import { GET as providersGet } from '@/app/api/admin/analytics/providers/route'
import { GET as revenueGet } from '@/app/api/admin/analytics/revenue/route'
import { GET as gigsGet } from '@/app/api/admin/gigs/route'
import { GET as gigsStatsGet } from '@/app/api/admin/gigs/stats/route'
import { GET as gigsModqueueGet } from '@/app/api/admin/gigs/modqueue/route'
import { GET as ordersGet } from '@/app/api/admin/orders/route'
import { GET as payoutsGet, POST as payoutsPost } from '@/app/api/admin/payouts/route'
import { GET as escrowGet } from '@/app/api/admin/escrow/route'
import { GET as attorneyApplicationsGet } from '@/app/api/admin/attorney-applications/route'
import { GET as adminDataGet } from '@/app/api/admin/data/route'
import { GET as inviteGet, POST as invitePost } from '@/app/api/admin/invite/route'

type RouteHandler = (request: NextRequest) => Promise<Response>

function request(path: string): NextRequest {
  return new NodeNextRequest(`https://portal.example${path}`)
}

describe('hot protected API route request auth', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getClerkUserId.mockResolvedValue(null)
    requireAdminUser.mockResolvedValue({ error: 'Forbidden', status: 403 })
    requirePortalUser.mockResolvedValue({ error: 'Forbidden', status: 403 })
    single.mockResolvedValue({ data: { id: 'profile-1', role: 'client' }, error: null })
  })

  test.each([
    ['analytics overview', overviewGet],
    ['analytics providers', providersGet],
    ['analytics revenue', revenueGet],
    ['gigs list', gigsGet],
    ['gigs stats', gigsStatsGet],
    ['gigs moderation queue', gigsModqueueGet],
    ['orders list', ordersGet],
    ['payouts list', payoutsGet],
    ['payouts update', payoutsPost],
    ['escrow list', escrowGet],
  ] as Array<[string, RouteHandler]>)('%s forwards the request and preserves the 403', async (_name, handler) => {
    const req = request('/api/admin/protected')

    const response = await handler(req)

    expect(requireAdminUser).toHaveBeenCalledWith(req)
    expect(response.status).toBe(403)
    const body = await response.json()
    expect(body.error?.message ?? body.error).toBe('Forbidden')
  })

  test.each([
    ['profile theme GET', themeGet],
    ['profile theme PATCH', themePatch],
  ] as Array<[string, RouteHandler]>)('%s forwards the request and preserves the 403', async (_name, handler) => {
    const req = request('/api/profile/theme')

    const response = await handler(req)

    expect(requirePortalUser).toHaveBeenCalledWith(req)
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'Forbidden' })
  })

  test.each([
    ['profile PATCH', '/api/profile', profilePatch],
  ] as Array<[string, string, RouteHandler]>)('%s forwards the request and preserves the unauthenticated status', async (name, path, handler) => {
    const req = request(path)

    const response = await handler(req)

    expect(getClerkUserId).toHaveBeenCalledWith(req)
    expect(response.status).toBe(401)
    const body = await response.json()
    expect(body.error).toBe(name === 'profile PATCH' ? 'Unauthenticated.' : 'Unauthorized')
  })

  test.each([
    ['attorney applications', attorneyApplicationsGet],
    ['admin data', adminDataGet],
    ['invite list', inviteGet],
    ['invite create', invitePost],
  ] as Array<[string, RouteHandler]>)('%s keeps denying non-admin profiles with 403', async (_name, handler) => {
    getClerkUserId.mockResolvedValue('clerk-user')
    const req = request('/api/admin/bespoke-guard')

    const response = await handler(req)

    expect(getClerkUserId).toHaveBeenCalledWith(req)
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'Forbidden' })
  })

  test('profile GET forwards the request and keeps its anonymous response', async () => {
    const req = request('/api/profile')

    const response = await profileGet(req)

    expect(getClerkUserId).toHaveBeenCalledWith(req)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ profile: null })
  })
})
