/**
 * Regression tests for the service-account connect path
 * (POST /api/content-studio/gsc/connect with a pasted SA JSON key).
 *
 * Teams without a Google OAuth client paste the service-account JSON key +
 * site URL from the modal's "Service account" tab. The route must: mint a
 * token from the *pasted* key (not just env), verify the property with a
 * live Search Analytics query, persist the key server-side, and return a
 * connected payload. getGscConfig / getGscAccessToken / saveGscConnection
 * and the Search Analytics verification fetch are all mocked.
 */
import { POST } from '@/app/api/content-studio/gsc/connect/route'
import { __resetGscProbeCache } from '@/lib/gscConnectProbe'
import { getGscAccessToken } from '@/lib/gsc-service-account'
import { saveGscConnection } from '@/lib/gscConfig'
import { parseServiceAccountJson } from '@/lib/gscAuth'

jest.mock('next/server', () => ({
  NextRequest: class {
    body: string
    constructor(_url: string | URL, init?: { body?: string }) {
      this.body = init?.body ?? '{}'
    }
    async json(): Promise<Record<string, unknown>> {
      return JSON.parse(this.body)
    }
  },
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}))

jest.mock('@/lib/gscConfig', () => ({
  getGscConfig: jest.fn(),
  saveGscConnection: jest.fn(),
}))

jest.mock('@/lib/gsc-service-account', () => ({
  getGscAccessToken: jest.fn(),
}))

jest.mock('@/lib/portalAuth', () => ({
  requireAdminUser: jest.fn().mockResolvedValue({
    db: {},
    profile: { role: 'admin' },
    profileId: 'test-admin',
    role: 'admin',
  }),
}))

const mockAccessToken = getGscAccessToken as jest.Mock
const mockSave = saveGscConnection as jest.Mock

const SA_KEY_JSON = JSON.stringify({
  type: 'service_account',
  project_id: 'yousafe-gsc-reader',
  private_key: '-----BEGIN PRIVATE KEY-----\nMIIB\n-----END PRIVATE KEY-----\n',
  client_email: 'gsc-reader@yousafe-gsc-reader.iam.gserviceaccount.com',
})

/** Mock the Search Analytics verification fetch the route performs. */
function mockVerifyFetch(ok: boolean, bodyText = ''): jest.SpyInstance {
  return jest.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok,
    text: async () => bodyText,
  } as unknown as Response)
}

async function postOf(body: Record<string, unknown>): Promise<{ status: number; body: Record<string, unknown> }> {
  const req = new (jest.requireMock('next/server').NextRequest)('http://localhost/api/content-studio/gsc/connect', {
    body: JSON.stringify(body),
  })
  const res = await POST(req as never)
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

beforeEach(() => {
  __resetGscProbeCache()
  jest.clearAllMocks()
  // Default: verification succeeds.
  mockVerifyFetch(true)
})

describe('POST /api/content-studio/gsc/connect (service account)', () => {
  it('connects with a pasted key: mints token, verifies access, persists key + site URL', async () => {
    mockAccessToken.mockResolvedValue('tok-live')

    const { status, body } = await postOf({ siteUrl: 'https://example.com/', serviceAccountKey: SA_KEY_JSON })

    expect(status).toBe(200)
    expect(body).toMatchObject({
      connected: true,
      siteUrl: 'https://example.com/',
      email: 'gsc-reader@yousafe-gsc-reader.iam.gserviceaccount.com',
      mode: 'service_account',
    })
    // Token minted from the *pasted* key (not env).
    expect(mockAccessToken).toHaveBeenCalledWith(SA_KEY_JSON)
    // Key + site persisted server-side for the runtime auth resolver.
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({
        site_url: 'https://example.com/',
        connected_email: 'gsc-reader@yousafe-gsc-reader.iam.gserviceaccount.com',
        service_account_key: SA_KEY_JSON,
      }),
    )
    // Verification query ran against the property.
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('webmasters/v3/sites/https%3A%2F%2Fexample.com%2F/searchAnalytics/query'),
      expect.any(Object),
    )
  })

  it('trims whitespace around a pasted key and site URL', async () => {
    mockAccessToken.mockResolvedValue('tok-live')

    const { status } = await postOf({
      siteUrl: '  sc-domain:example.com  ',
      serviceAccountKey: `\n${SA_KEY_JSON}\n`,
    })

    expect(status).toBe(200)
    expect(mockAccessToken).toHaveBeenCalledWith(SA_KEY_JSON)
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({ site_url: 'sc-domain:example.com' }),
    )
  })

  it('rejects a missing siteUrl with 400 before touching the token', async () => {
    const { status, body } = await postOf({ serviceAccountKey: SA_KEY_JSON })

    expect(status).toBe(400)
    expect(String(body.error)).toContain('siteUrl is required')
    expect(mockAccessToken).not.toHaveBeenCalled()
    expect(mockSave).not.toHaveBeenCalled()
  })

  it('rejects a missing key with 400 (nothing pasted, nothing in env)', async () => {
    const savedKey = process.env.GSC_SERVICE_ACCOUNT_KEY
    const savedJson = process.env.GSC_SERVICE_ACCOUNT_JSON
    delete process.env.GSC_SERVICE_ACCOUNT_KEY
    delete process.env.GSC_SERVICE_ACCOUNT_JSON
    try {
      const { status, body } = await postOf({ siteUrl: 'https://example.com/' })

      expect(status).toBe(400)
      expect(String(body.error)).toContain('No service account key available')
      expect(mockAccessToken).not.toHaveBeenCalled()
    } finally {
      if (savedKey !== undefined) process.env.GSC_SERVICE_ACCOUNT_KEY = savedKey
      else delete process.env.GSC_SERVICE_ACCOUNT_KEY
      if (savedJson !== undefined) process.env.GSC_SERVICE_ACCOUNT_JSON = savedJson
      else delete process.env.GSC_SERVICE_ACCOUNT_JSON
    }
  })

  it('surfaces an access-denied error with the GSC user hint when verification is 403', async () => {
    mockAccessToken.mockResolvedValue('tok-live')
    mockVerifyFetch(false, '403 Forbidden')

    const { status, body } = await postOf({ siteUrl: 'https://example.com/', serviceAccountKey: SA_KEY_JSON })

    expect(status).toBe(400)
    expect(String(body.error)).toContain('Cannot access GSC property')
    expect(String(body.error)).toMatch(/Add gsc-reader/)
    expect(mockSave).not.toHaveBeenCalled()
  })

  it('surfaces the invalid-grant style error when the token exchange throws', async () => {
    mockAccessToken.mockRejectedValue(new Error('invalid_grant: bad private key'))

    const { status, body } = await postOf({ siteUrl: 'https://example.com/', serviceAccountKey: SA_KEY_JSON })

    expect(status).toBe(500)
    expect(String(body.error)).toContain('invalid_grant')
    expect(mockSave).not.toHaveBeenCalled()
  })

  it('reports a persistence failure instead of claiming connected', async () => {
    mockAccessToken.mockResolvedValue('tok-live')
    mockSave.mockRejectedValue(new Error('db down'))

    const { status, body } = await postOf({ siteUrl: 'https://example.com/', serviceAccountKey: SA_KEY_JSON })

    expect(status).toBe(500)
    expect(String(body.error)).toContain('Failed to store config')
    expect(body.connected).toBeUndefined()
  })
})

describe('parseServiceAccountJson', () => {
  it('unwraps extra quotes that make JSON.parse throw Unexpected token \'\'\'', () => {
    const inner = JSON.stringify({
      client_email: 'gsc-reader@yousafe-gsc-reader.iam.gserviceaccount.com',
      private_key: '-----BEGIN PRIVATE KEY-----\\nMIIB\\n-----END PRIVATE KEY-----\\n',
    })
    const sa = parseServiceAccountJson(`'${inner}'`)
    expect(sa.client_email).toContain('gsc-reader@')
    expect(sa.private_key).toContain('BEGIN PRIVATE KEY')
    expect(sa.private_key).toContain('\n')
  })
})
