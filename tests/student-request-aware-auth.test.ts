import { NextRequest } from 'next/server'

const mockAuth = jest.fn()
const mockGetAuth = jest.fn()
const mockClerkClient = jest.fn()
const mockGetSupabaseAdminClient = jest.fn()
const mockCreateSupabaseAdminClient = jest.fn()
const mockGetPlatformSettings = jest.fn()
const mockGetPaymentSettingsForApi = jest.fn()
const mockComputePlatformFeeCents = jest.fn()
const mockComputeNetPayoutCents = jest.fn()

jest.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
  getAuth: mockGetAuth,
  clerkClient: mockClerkClient,
}))

jest.mock('@/lib/supabase', () => ({
  createSupabaseAdminClient: mockCreateSupabaseAdminClient,
  getSupabaseAdminClient: mockGetSupabaseAdminClient,
}))

jest.mock('@/lib/platformConfig', () => ({ getPlatformSettings: mockGetPlatformSettings }))

jest.mock('@/lib/fiverr', () => ({
  getPaymentSettingsForApi: mockGetPaymentSettingsForApi,
  computePlatformFeeCents: mockComputePlatformFeeCents,
  computeNetPayoutCents: mockComputeNetPayoutCents,
}))

import { getCurrentStudent } from '@/lib/student'
import { GET as getReceipt } from '@/app/api/student/billing/receipt/route'
import {
  GET as getMessages,
  POST as postMessage,
} from '@/app/api/student/messages/route'

const studentProfile = {
  id: 'profile-student',
  clerk_user_id: 'clerk-student',
  role: 'client',
  status: 'active',
  email: 'student@example.com',
  full_name: 'Student',
  country_code: 'US',
}

type QueryRecord = {
  table: string
  filters: Array<[string, unknown]>
  inserted?: unknown
}

let queryRecords: QueryRecord[]
let activeDb: { from: (table: string) => any }

function createDb() {
  const db = {
    from(table: string) {
      const query: QueryRecord = { table, filters: [] }
      queryRecords.push(query)
      const chain: any = {
        select: () => chain,
        order: () => chain,
        eq: (key: string, value: unknown) => {
          query.filters.push([key, value])
          return chain
        },
        insert: (value: unknown) => {
          query.inserted = value
          return chain
        },
        single: async () => {
          if (table === 'profiles') return { data: studentProfile, error: null }

          if (table === 'orders') {
            const foreignOrder = {
              id: 'order-foreign',
              client_id: 'profile-another-student',
              consultant_id: 'consultant-1',
            }
            const matches = query.filters.every(([key, value]) =>
              foreignOrder[key as keyof typeof foreignOrder] === value,
            )
            return { data: matches ? foreignOrder : null, error: null }
          }

          return { data: null, error: null }
        },
      }
      return chain
    },
  }
  return db
}

function expectRequestAuth(request: NextRequest) {
  expect(mockGetAuth).toHaveBeenCalledWith(request)
  expect(mockAuth).not.toHaveBeenCalled()
}

function expectForeignOrderWasScoped() {
  const orderQuery = queryRecords.find((query) => query.table === 'orders')
  expect(orderQuery?.filters).toContainEqual(['id', 'order-foreign'])
  expect(orderQuery?.filters).toContainEqual(['client_id', studentProfile.id])
}

type RouteCase = {
  name: string
  run: (request: NextRequest) => Promise<Response>
  url: string
}

const routeCases: RouteCase[] = [
  {
    name: 'receipt GET',
    run: (request) => getReceipt(request),
    url: 'https://portal.test/api/student/billing/receipt?tx=order-foreign-purchase',
  },
  {
    name: 'messages GET',
    run: (request) => getMessages(request),
    url: 'https://portal.test/api/student/messages?orderId=order-foreign',
  },
  {
    name: 'messages POST',
    run: (request) => postMessage(request),
    url: 'https://portal.test/api/student/messages',
  },
]

beforeEach(() => {
  jest.clearAllMocks()
  queryRecords = []
  activeDb = createDb()
  mockGetSupabaseAdminClient.mockImplementation(() => activeDb)
  mockCreateSupabaseAdminClient.mockImplementation(() => activeDb)
  mockGetAuth.mockImplementation((request?: NextRequest) => ({
    userId: request?.headers.get('x-test-unauthorized') === '1' ? null : 'clerk-student',
  }))
  // The fallback remains valid so regressions fail on using auth() itself,
  // rather than only because the mocked fallback happens to be unauthenticated.
  mockAuth.mockResolvedValue({ userId: 'clerk-fallback' })
  mockClerkClient.mockReset()
  mockGetPlatformSettings.mockResolvedValue({})
  mockGetPaymentSettingsForApi.mockResolvedValue({
    platform_fee_percent: 20,
    consultant_fee_percent: 80,
  })
  mockComputePlatformFeeCents.mockReturnValue(0)
  mockComputeNetPayoutCents.mockReturnValue(0)
})

describe('request-aware student authentication for billing and messages', () => {
  it('uses the shared admin accessor and passes the request to Clerk from getCurrentStudent', async () => {
    const request = new NextRequest('https://portal.test/api/student/messages')

    const result = await (getCurrentStudent as (request: NextRequest) => Promise<unknown>)(request)

    expect('error' in (result as object)).toBe(false)
    expectRequestAuth(request)
    expect(mockGetSupabaseAdminClient).toHaveBeenCalledTimes(1)
    expect(mockCreateSupabaseAdminClient).not.toHaveBeenCalled()
  })

  it.each(routeCases)('$name forwards its request and does not use Clerk auth() fallback', async ({ name, run, url }) => {
    const request = name === 'messages POST'
      ? new NextRequest(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ orderId: 'order-foreign', body: 'hello' }),
        })
      : new NextRequest(url)

    const response = await run(request)

    expect(response.status).toBe(404)
    expectRequestAuth(request)
    expectForeignOrderWasScoped()
  })

  it.each(routeCases)('$name rejects an unauthenticated request before a database read', async ({ name, run, url }) => {
    const request = name === 'messages POST'
      ? new NextRequest(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-test-unauthorized': '1' },
          body: JSON.stringify({ orderId: 'order-foreign', body: 'hello' }),
        })
      : new NextRequest(url, { headers: { 'x-test-unauthorized': '1' } })

    const response = await run(request)

    expect(response.status).toBe(401)
    expectRequestAuth(request)
    expect(mockGetSupabaseAdminClient).not.toHaveBeenCalled()
    expect(mockCreateSupabaseAdminClient).not.toHaveBeenCalled()
    expect(queryRecords).toEqual([])
  })

  it('does not construct or read from a database when the current student is unauthorized', async () => {
    const request = new NextRequest('https://portal.test/api/student/messages', {
      headers: { 'x-test-unauthorized': '1' },
    })

    const result = await (getCurrentStudent as (request: NextRequest) => Promise<unknown>)(request)

    expect(result).toEqual({ error: 'Unauthorized', status: 401 })
    expectRequestAuth(request)
    expect(mockGetSupabaseAdminClient).not.toHaveBeenCalled()
    expect(mockCreateSupabaseAdminClient).not.toHaveBeenCalled()
    expect(queryRecords).toEqual([])
  })

  it('does not insert a message for an order owned by another student', async () => {
    const request = new NextRequest('https://portal.test/api/student/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ orderId: 'order-foreign', body: 'hello' }),
    })

    const response = await postMessage(request)

    expect(response.status).toBe(404)
    expectForeignOrderWasScoped()
    expect(queryRecords.some((query) => query.table === 'order_messages' && query.inserted)).toBe(false)
  })
})
