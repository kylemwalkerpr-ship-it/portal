import { shouldBypassClerkForAuthIndependentApiRequest } from '@/lib/authIndependentApiBypass'
import * as authIndependentApiBypass from '@/lib/authIndependentApiBypass'

describe('auth-independent API Clerk bypass', () => {
  const search = (value = '') => new URLSearchParams(value)

  test('bypasses only the exact public payment-config GET', () => {
    expect(shouldBypassClerkForAuthIndependentApiRequest('GET', '/api/payments/config', search(), [])).toBe(true)
    expect(shouldBypassClerkForAuthIndependentApiRequest('POST', '/api/payments/config', search(), [])).toBe(false)
    expect(shouldBypassClerkForAuthIndependentApiRequest('GET', '/api/payments/config/other', search(), [])).toBe(false)
  })

  test('bypasses only the anonymous attribution collector methods', () => {
    expect(shouldBypassClerkForAuthIndependentApiRequest('GET', '/api/attribution/session', search(), [])).toBe(true)
    expect(shouldBypassClerkForAuthIndependentApiRequest('POST', '/api/attribution/session', search(), [])).toBe(true)
    expect(shouldBypassClerkForAuthIndependentApiRequest('POST', '/api/attribution/events', search(), [])).toBe(true)

    expect(shouldBypassClerkForAuthIndependentApiRequest('PATCH', '/api/attribution/session', search(), [])).toBe(false)
    expect(shouldBypassClerkForAuthIndependentApiRequest('GET', '/api/attribution/events', search(), [])).toBe(false)
    expect(shouldBypassClerkForAuthIndependentApiRequest('POST', '/api/attribution/events/other', search(), [])).toBe(false)
  })

  test('attribution bypass still fails closed for Clerk protocol and handoff state', () => {
    expect(
      shouldBypassClerkForAuthIndependentApiRequest(
        'POST', '/api/attribution/session', search('__clerk_ticket=abc'), [],
      ),
    ).toBe(false)
    expect(
      shouldBypassClerkForAuthIndependentApiRequest(
        'POST', '/api/attribution/events', search(), [{ name: '__clerk_handshake', value: 'jwt' }],
      ),
    ).toBe(false)
  })

  test('a normal signed-in session does not make an auth-independent response require Clerk', () => {
    expect(
      shouldBypassClerkForAuthIndependentApiRequest(
        'GET',
        '/api/payments/config',
        search(),
        [
          { name: '__session', value: 'signed-session-jwt' },
          { name: '__client_uat', value: '1790080000' },
        ],
      ),
    ).toBe(true)
  })

  test('Clerk protocol and handoff state always fail closed into Clerk', () => {
    expect(
      shouldBypassClerkForAuthIndependentApiRequest(
        'GET', '/api/payments/config', search('__clerk_ticket=abc'), [],
      ),
    ).toBe(false)
    expect(
      shouldBypassClerkForAuthIndependentApiRequest(
        'GET', '/api/payments/config', search(), [{ name: '__clerk_handshake', value: 'jwt' }],
      ),
    ).toBe(false)
  })

  test('cookie snapshot reader is lazy and memoized', () => {
    type Cookie = { name: string; value?: string | null }
    type LazyFactory = (readCookies: () => readonly Cookie[]) => () => readonly Cookie[]
    const createLazyRequestCookieSnapshot = (
      authIndependentApiBypass as unknown as {
        createLazyRequestCookieSnapshot?: LazyFactory
      }
    ).createLazyRequestCookieSnapshot

    expect(createLazyRequestCookieSnapshot).toBeDefined()
    const readCookies = jest.fn<readonly Cookie[], []>(() => [
      { name: '__clerk_handshake', value: 'jwt' },
    ])
    const getCookies = createLazyRequestCookieSnapshot!(readCookies)

    expect(readCookies).not.toHaveBeenCalled()
    expect(getCookies()).toEqual([{ name: '__clerk_handshake', value: 'jwt' }])
    expect(getCookies()).toEqual([{ name: '__clerk_handshake', value: 'jwt' }])
    expect(readCookies).toHaveBeenCalledTimes(1)
  })

})
