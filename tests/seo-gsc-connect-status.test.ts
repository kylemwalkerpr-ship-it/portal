/**
 * Regression tests for the GSC connect status endpoint
 * (GET /api/content-studio/gsc/connect).
 *
 * Locks the payload shape the Systems card and the Quick Create composer
 * poll every few seconds: connected / live / mode / email / siteUrl /
 * connectedAt / missing / error. getGscConfig + getGscAccess are mocked so
 * no network or Supabase calls happen.
 */
import { GET } from '@/app/api/content-studio/gsc/connect/route'
import { __resetGscProbeCache } from '@/lib/gscConnectProbe'
import { getGscConfig } from '@/lib/gscConfig'
import { getGscAccess } from '@/lib/gscAuth'

jest.mock('next/server', () => ({
  NextRequest: class {
    url: string
    constructor(url: string | URL) {
      this.url = String(url)
    }
  },
  NextResponse: {
    json: (body: unknown) => ({ status: 200, json: async () => body }),
  },
}))

jest.mock('@/lib/gscConfig', () => ({
  getGscConfig: jest.fn(),
  saveGscConnection: jest.fn(),
}))

jest.mock('@/lib/gscAuth', () => ({
  getGscAccess: jest.fn(),
}))

jest.mock('@/lib/portalAuth', () => ({
  requireAdminUser: jest.fn().mockResolvedValue({
    db: {},
    profile: { role: 'admin' },
    profileId: 'test-admin',
    role: 'admin',
  }),
}))

const mockConfig = getGscConfig as jest.Mock
const mockAccess = getGscAccess as jest.Mock

const NO_CREDS = {
  clientId: null,
  clientSecret: null,
  refreshToken: null,
  siteUrl: null,
  connectedEmail: null,
  connectedAt: null,
}

const OAUTH_OK = {
  clientId: 'id.apps.googleusercontent.com',
  clientSecret: 'secret',
  refreshToken: 'rt-live',
  siteUrl: 'sc-domain:example.com',
  connectedEmail: 'ops@example.com',
  connectedAt: '2026-08-01T00:00:00.000Z',
}

async function bodyOf(): Promise<Record<string, unknown>> {
  const res = await GET()
  return (await res.json()) as Record<string, unknown>
}

beforeEach(() => {
  __resetGscProbeCache()
  jest.clearAllMocks()
})

describe('GET /api/content-studio/gsc/connect', () => {
  it('reports NOT CONNECTED + every missing credential when nothing is configured', async () => {
    mockConfig.mockResolvedValue(NO_CREDS)
    mockAccess.mockResolvedValue(null)

    const body = await bodyOf()

    expect(body).toMatchObject({
      connected: false,
      live: false,
      mode: null,
      email: null,
      siteUrl: null,
      connectedAt: null,
      error: 'No credentials available to mint an access token',
    })
    expect(body.missing).toEqual(['client_id', 'client_secret', 'refresh_token', 'site_url'])
  })

  it('reports CONNECTED · oauth + live when the token mints and the property is set', async () => {
    mockConfig.mockResolvedValue(OAUTH_OK)
    mockAccess.mockResolvedValue({ accessToken: 'tok', mode: 'oauth', siteUrl: OAUTH_OK.siteUrl })

    const body = await bodyOf()

    expect(body).toMatchObject({
      connected: true,
      live: true,
      mode: 'oauth',
      email: 'ops@example.com',
      siteUrl: 'sc-domain:example.com',
      connectedAt: '2026-08-01T00:00:00.000Z',
      error: null,
    })
    expect(body.missing).toEqual([])
  })

  it('keeps CONNECTED but flags live=false when the refresh token is revoked', async () => {
    mockConfig.mockResolvedValue({ ...OAUTH_OK, refreshToken: 'rt-revoked' })
    mockAccess.mockResolvedValue(null)

    const body = await bodyOf()

    expect(body).toMatchObject({
      connected: true,
      live: false,
      mode: 'oauth',
      error: 'No credentials available to mint an access token',
    })
  })

  it('surfaces the probe error when the token exchange throws (e.g. invalid_grant)', async () => {
    mockConfig.mockResolvedValue(OAUTH_OK)
    mockAccess.mockRejectedValue(new Error('invalid_grant'))

    const body = await bodyOf()

    expect(body).toMatchObject({ connected: true, live: false, mode: 'oauth', error: 'invalid_grant' })
  })

  it('labels service-account mode and lists only the truly missing env fields', async () => {
    mockConfig.mockResolvedValue({
      clientId: 'id.apps.googleusercontent.com',
      clientSecret: null,
      refreshToken: null,
      siteUrl: 'https://example.com/',
      connectedEmail: 'gsc-reader@example.iam.gserviceaccount.com',
      connectedAt: null,
    })
    mockAccess.mockResolvedValue({ accessToken: 'tok', mode: 'service_account', siteUrl: 'https://example.com/' })

    const body = await bodyOf()

    expect(body).toMatchObject({
      connected: true,
      live: true,
      mode: 'service_account',
      email: 'gsc-reader@example.iam.gserviceaccount.com',
    })
    expect(body.missing).toEqual(['client_secret', 'refresh_token'])
  })

  it('distinguishes "token minted but no site URL" from no-credentials', async () => {
    mockConfig.mockResolvedValue(OAUTH_OK)
    mockAccess.mockResolvedValue({ accessToken: 'tok', mode: 'oauth', siteUrl: null })

    const body = await bodyOf()

    expect(body).toMatchObject({
      connected: true,
      live: false,
      error: 'Access token minted but no site URL configured',
    })
  })

  it('returns the fallback shape when getGscConfig itself throws', async () => {
    mockConfig.mockRejectedValue(new Error('db down'))

    const body = await bodyOf()

    expect(body).toEqual({
      connected: false,
      live: false,
      mode: null,
      email: null,
      siteUrl: null,
      connectedAt: null,
      missing: [],
      error: 'db down',
    })
  })

  it('serves the 10s probe cache, and the reset hook clears it', async () => {
    mockConfig.mockResolvedValue(OAUTH_OK)
    mockAccess.mockResolvedValue({ accessToken: 'tok', mode: 'oauth', siteUrl: OAUTH_OK.siteUrl })

    const first = await bodyOf()
    expect(first.live).toBe(true)

    // Token now broken — the cache still serves the fresh probe within 10s.
    mockAccess.mockResolvedValue(null)
    const cached = await bodyOf()
    expect(cached.live).toBe(true)

    // After the reset hook, the next probe reflects the broken token.
    __resetGscProbeCache()
    const afterReset = await bodyOf()
    expect(afterReset.live).toBe(false)
  })
})
