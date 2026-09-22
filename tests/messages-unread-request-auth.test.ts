const requirePortalUser = jest.fn()

jest.mock('@/lib/portalAuth', () => ({
  requirePortalUser,
}))

import { GET } from '@/app/api/messages/unread/route'

describe('messages unread request-aware auth', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('passes the actual route request into requirePortalUser', async () => {
    const request = { headers: new Headers() }
    requirePortalUser.mockResolvedValue({ error: 'Unauthorized', status: 401 })

    const response = await (GET as any)(request)

    expect(response.status).toBe(401)
    expect(requirePortalUser).toHaveBeenCalledWith(request)
  })
})