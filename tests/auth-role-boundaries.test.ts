const mockRequirePortalUser = jest.fn()
jest.mock('@/lib/portalAuth', () => ({ requirePortalUser: mockRequirePortalUser }))

import { POST as syncLanePost } from '@/app/api/profile/sync-lane/route'
import { dashboardRedirectFor, resolveProvisionedSelfServiceLane } from '@/lib/dashboardRolePolicy'

type ProfileRow = { id: string; role: string; status: string }

function makeDb(options: {
  profile?: ProfileRow
  counts?: Record<string, number>
  errors?: Record<string, string>
  roleChangeBeforePromotion?: ProfileRow
} = {}) {
  const row = { ...(options.profile ?? { id: 'profile-1', role: 'client', status: 'active' }) }
  const updates: Record<string, unknown>[] = []
  const counts = options.counts ?? {}
  const errors = options.errors ?? {}
  let promotionUpdateCount = 0
  const db = {
    from: jest.fn((table: string) => {
      if (table === 'profiles') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({ maybeSingle: async () => ({ data: row, error: null }) })),
          })),
          update: jest.fn((patch: Record<string, unknown>) => {
            const filters: Array<[string, unknown]> = []
            const query = {
              eq: jest.fn((column: string, value: unknown) => {
                filters.push([column, value])
                return query
              }),
              select: jest.fn(() => query),
              maybeSingle: jest.fn(async () => {
                promotionUpdateCount += 1
                if (promotionUpdateCount === 1 && options.roleChangeBeforePromotion) {
                  Object.assign(row, options.roleChangeBeforePromotion)
                }
                const matches = filters.every(([column, value]) => row[column as keyof ProfileRow] === value)
                if (!matches) return { data: null, error: null }
                updates.push(patch)
                Object.assign(row, patch)
                return { data: { id: row.id }, error: null }
              }),
            }
            return query
          }),
        }
      }
      return {
        select: jest.fn(() => ({
          eq: jest.fn(async () => ({ count: counts[table] ?? 0, error: errors[table] ? { message: errors[table] } : null })),
        })),
      }
    }),
  }
  return { db, row, updates }
}

function request(lane: string) {
  return new Request('https://portal.example/api/profile/sync-lane', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ lane }),
  })
}

describe('profile lane synchronization role boundary', () => {
  beforeEach(() => mockRequirePortalUser.mockReset())

  test('does not allow an active client to promote itself to support', async () => {
    const { db, row, updates } = makeDb()
    mockRequirePortalUser.mockResolvedValue({ db, profileId: row.id })

    const response = await syncLanePost(request('support'))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ promoted: false, reason: 'lane_not_allowed' })
    expect(updates).toEqual([])
    expect(row).toMatchObject({ role: 'client', status: 'active' })
  })

  test('preserves first-time attorney signup promotion', async () => {
    const { db, row, updates } = makeDb()
    mockRequirePortalUser.mockResolvedValue({ db, profileId: row.id })

    const response = await syncLanePost(request('attorney'))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      promoted: true,
      role: 'attorney',
      status: 'incomplete',
    })
    expect(updates).toEqual([{ role: 'attorney', status: 'incomplete' }])
  })

  test.each(['orders', 'inquiries', 'offers', 'consultant_offers', 'attorney_offers'])(
    'blocks promotion when the client already has activity in %s',
    async (table) => {
      const { db, row, updates } = makeDb({ counts: { [table]: 1 } })
      mockRequirePortalUser.mockResolvedValue({ db, profileId: row.id })

      const response = await syncLanePost(request('consultant'))

      await expect(response.json()).resolves.toMatchObject({
        promoted: false,
        role: 'client',
        reason: 'existing_activity',
      })
      expect(updates).toEqual([])
    })

  test.each(['orders', 'inquiries', 'offers', 'consultant_offers', 'attorney_offers'])(
    'fails closed when the activity guard cannot read %s',
    async (table) => {
      const { db, row, updates } = makeDb({ errors: { [table]: 'temporary read failure' } })
      mockRequirePortalUser.mockResolvedValue({ db, profileId: row.id })

      const response = await syncLanePost(request('consultant'))

      expect(response.status).toBe(503)
      expect(updates).toEqual([])
    })
  test('does not report promotion when another request changes the profile role first', async () => {
    const { db, row, updates } = makeDb({
      roleChangeBeforePromotion: { id: 'profile-1', role: 'support', status: 'active' },
    })
    mockRequirePortalUser.mockResolvedValue({ db, profileId: row.id })

    const response = await syncLanePost(request('attorney'))

    await expect(response.json()).resolves.toMatchObject({
      promoted: false,
      reason: 'profile_changed',
    })
    expect(updates).toEqual([])
    expect(row).toMatchObject({ role: 'support', status: 'active' })
  })
})

describe('dashboard role policy', () => {
  const roleLanes = require('@/lib/roleLanes') as Record<string, unknown>

  test('maps only public signup roles and rejects privileged roles', () => {
    const normalize = roleLanes.normalizeSelfServiceLane
    expect(normalize).toEqual(expect.any(Function))
    const lane = normalize as (value: unknown) => string | null
    expect(lane('student')).toBe('client')
    expect(lane('client')).toBe('client')
    expect(lane('attorney')).toBe('attorney')
    expect(lane('consultant')).toBe('consultant')
    expect(lane('support')).toBeNull()
    expect(lane('admin')).toBeNull()
    expect(lane('unknown')).toBeNull()
  })

  test('selects only self-service roles from metadata, cookie, and URL signals', () => {
    expect(resolveProvisionedSelfServiceLane({ metadataRole: 'attorney', cookieLane: 'consultant', urlLane: 'client' }))
      .toBe('attorney')
    expect(resolveProvisionedSelfServiceLane({ metadataRole: 'support', cookieLane: 'consultant', urlLane: 'attorney' }))
      .toBe('consultant')
    expect(resolveProvisionedSelfServiceLane({ metadataRole: 'admin', cookieLane: 'support', urlLane: 'attorney' }))
      .toBe('attorney')
    expect(resolveProvisionedSelfServiceLane({ metadataRole: 'admin', cookieLane: 'support', urlLane: 'admin' }))
      .toBe('client')
  })

  test('preserves existing privileged dashboard access rules', () => {
    expect(dashboardRedirectFor({ role: 'support', status: 'active', laneIntent: 'client' })).toBe('support')
    expect(dashboardRedirectFor({ role: 'support', status: 'pending', laneIntent: 'support' })).toBeNull()
    expect(dashboardRedirectFor({ role: 'admin', status: 'active', laneIntent: 'admin' })).toBeNull()
    expect(dashboardRedirectFor({ role: 'client', status: 'active', laneIntent: 'admin' })).toBe('admin-sign-in')
  })
})
