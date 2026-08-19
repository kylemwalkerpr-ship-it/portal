/**
 * Regression tests for the System Health GSC metric
 * (GET /api/content-studio/system-health).
 *
 * Locks the fix that the "GSC Connection" card derives its status from
 * lib/gscConfig (public.gsc_connection row + GSC_* env vars) — the same
 * source of truth as the rest of the studio — instead of the legacy
 * gsc_tokens / gsc_service_account_keys tables, which were empty and left
 * the card stuck on "Offline · no token" even with a service-account key
 * synced to the Worker.
 */
import { GET } from '@/app/api/content-studio/system-health/route'
import { getGscConfig } from '@/lib/gscConfig'

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown) => ({ status: 200, json: async () => body }),
  },
}))

jest.mock('@/lib/portalAuth', () => ({
  requireAdminUser: jest.fn(async () => ({
    db: {},
    profile: {},
    profileId: 'p_admin',
    role: 'admin',
  })),
}))

jest.mock('@/lib/gscConfig', () => ({
  getGscConfig: jest.fn(),
}))

jest.mock('@/lib/seoEngine/ga4', () => ({
  loadGa4Config: jest.fn(async () => ({ enabled: false, propertyId: '' })),
}))

jest.mock('@/lib/seoEngine/ubersuggest', () => ({
  loadUbersuggestConfig: jest.fn(async () => ({ enabled: false, accessToken: '' })),
}))

// The route still queries the other health tables (api keys, interlinks,
// content jobs) — a uniform thenable builder resolves each chain without
// hitting the network.
jest.mock('@supabase/supabase-js', () => {
  const makeBuilder = (result: unknown) => {
    const builder: Record<string, any> = { then: (resolve: any) => Promise.resolve(resolve(result)) }
    for (const m of ['select', 'eq', 'not', 'order', 'limit', 'head', 'single']) {
      builder[m] = () => builder
    }
    return builder
  }
  return {
    createClient: jest.fn(() => ({
      from: () => makeBuilder({ data: [], error: null, count: 0 }),
    })),
  }
})

const mockConfig = getGscConfig as jest.Mock

const SERVICE_ACCOUNT = {
  clientId: null,
  clientSecret: null,
  refreshToken: null,
  serviceAccountKey: '{"client_email":"gsc-reader@example.iam.gserviceaccount.com"}',
  siteUrl: 'sc-domain:yousafeconsultancy.com',
  connectedEmail: 'gsc-reader@example.iam.gserviceaccount.com',
  connectedAt: '2026-08-01T00:00:00.000Z',
}

const OAUTH = {
  clientId: 'id.apps.googleusercontent.com',
  clientSecret: 'secret',
  refreshToken: 'rt-live',
  serviceAccountKey: null,
  siteUrl: 'sc-domain:yousafeconsultancy.com',
  connectedEmail: 'ops@example.com',
  connectedAt: '2026-08-01T00:00:00.000Z',
}

const NO_CREDS = {
  clientId: null,
  clientSecret: null,
  refreshToken: null,
  serviceAccountKey: null,
  siteUrl: null,
  connectedEmail: null,
  connectedAt: null,
}

async function bodyOf(): Promise<Record<string, unknown>> {
  const res = await GET()
  return (await res.json()) as Record<string, unknown>
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('GET /api/content-studio/system-health — GSC metric', () => {
  it('reports Connected · service_account when a service-account key + site URL are configured', async () => {
    mockConfig.mockResolvedValue(SERVICE_ACCOUNT)

    const body = await bodyOf()

    expect(body.gscConnected).toBe(true)
    expect(body.gscMode).toBe('service_account')
    expect(body.gscEmail).toBe('gsc-reader@example.iam.gserviceaccount.com')
  })

  it('reports Connected · oauth when the OAuth bundle is configured', async () => {
    mockConfig.mockResolvedValue(OAUTH)

    const body = await bodyOf()

    expect(body.gscConnected).toBe(true)
    expect(body.gscMode).toBe('oauth')
    expect(body.gscEmail).toBe('ops@example.com')
  })

  it('reports Offline · no token when no credentials are configured', async () => {
    mockConfig.mockResolvedValue(NO_CREDS)

    const body = await bodyOf()

    expect(body.gscConnected).toBe(false)
    expect(body.gscMode).toBe(null)
    expect(body.gscEmail).toBe(null)
  })

  it('does NOT mark connected when a token exists but no site URL is set', async () => {
    mockConfig.mockResolvedValue({ ...SERVICE_ACCOUNT, siteUrl: null })

    const body = await bodyOf()

    expect(body.gscConnected).toBe(false)
    expect(body.gscMode).toBe('service_account')
  })
})
