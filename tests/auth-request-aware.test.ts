const auth = jest.fn()
const getAuth = jest.fn()

jest.mock('@clerk/nextjs/server', () => ({
  auth,
  getAuth,
}))

import { getClerkUserId } from '@/lib/auth'

describe('request-aware Clerk auth', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('uses getAuth(request) instead of App Router auth() when a request is supplied', async () => {
    const request = { headers: new Headers() }
    getAuth.mockReturnValue({ userId: 'request-user' })
    auth.mockResolvedValue({ userId: 'legacy-user' })

    const userId = await (getClerkUserId as any)(request)

    expect(userId).toBe('request-user')
    expect(getAuth).toHaveBeenCalledWith(request)
    expect(auth).not.toHaveBeenCalled()
  })

  test('keeps the existing auth() path when no request is supplied', async () => {
    auth.mockResolvedValue({ userId: 'legacy-user' })

    const userId = await getClerkUserId()

    expect(userId).toBe('legacy-user')
    expect(auth).toHaveBeenCalledTimes(1)
    expect(getAuth).not.toHaveBeenCalled()
  })
})