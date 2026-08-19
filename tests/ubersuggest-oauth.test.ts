import {
  buildUbersuggestAuthorizeUrl,
  exchangeUbersuggestCode,
  generateOAuthState,
  generatePkceVerifier,
  pkceChallengeS256,
  portalOriginFromRequest,
  readCookieHeader,
  refreshUbersuggestToken,
  studioConfigureUrl,
  ubersuggestRedirectUri,
  UBERSUGGEST_MCP_URL,
  UBERSUGGEST_OAUTH_CLIENT_ID,
} from '@/lib/seoEngine/ubersuggestOAuth'
import { redactUbersuggestConfig, type UbersuggestConfig } from '@/lib/seoEngine/ubersuggest'

describe('Ubersuggest MCP OAuth helpers', () => {
  it('builds the Configure callback and return URLs', () => {
    const origin = 'https://portal.yousafeconsultancy.com'
    expect(ubersuggestRedirectUri(origin)).toBe(
      'https://portal.yousafeconsultancy.com/api/content-studio/ubersuggest/callback',
    )
    expect(studioConfigureUrl(origin, { uber_connected: 'true' })).toContain('tab=configure')
    expect(studioConfigureUrl(origin, { uber_connected: 'true' })).toContain('uber_connected=true')
    expect(portalOriginFromRequest({ url: 'https://portal.yousafeconsultancy.com/api/x' })).toBe(
      'https://portal.yousafeconsultancy.com',
    )
  })

  it('issues PKCE S256 challenges and authorize URLs for the public MCP client', async () => {
    const verifier = generatePkceVerifier()
    const state = generateOAuthState()
    expect(verifier.length).toBeGreaterThan(20)
    expect(state.length).toBeGreaterThan(10)
    const challenge = await pkceChallengeS256(verifier)
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(await pkceChallengeS256(verifier)).toBe(challenge)

    const authUrl = await buildUbersuggestAuthorizeUrl({
      redirectUri: 'https://portal.yousafeconsultancy.com/api/content-studio/ubersuggest/callback',
      state: 'st',
      verifier,
      clientId: UBERSUGGEST_OAUTH_CLIENT_ID,
      as: {
        issuer: 'https://ubersuggest-mcp.neilpatelapi.com/',
        authorization_endpoint: 'https://ubersuggest-mcp.neilpatelapi.com/authorize',
        token_endpoint: 'https://ubersuggest-mcp.neilpatelapi.com/token',
        registration_endpoint: 'https://ubersuggest-mcp.neilpatelapi.com/register',
        scopes_supported: ['keywords', 'domain'],
      },
    })
    const url = new URL(authUrl)
    expect(url.origin + url.pathname).toBe('https://ubersuggest-mcp.neilpatelapi.com/authorize')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('client_id')).toBe('ubersuggest-mcp')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('code_challenge')).toBe(challenge)
    expect(url.searchParams.get('resource')).toBe(UBERSUGGEST_MCP_URL)
    expect(url.searchParams.get('scope')).toContain('keywords')
  })

  it('reads PKCE cookies from a raw Cookie header', () => {
    const header = 'uber_mcp_state=abc%2B1; uber_mcp_verifier=ver_ifier'
    expect(readCookieHeader(header, 'uber_mcp_state')).toBe('abc+1')
    expect(readCookieHeader(header, 'uber_mcp_verifier')).toBe('ver_ifier')
    expect(readCookieHeader(header, 'missing')).toBeNull()
  })

  it('exchanges an authorization code as a public PKCE client', async () => {
    const fetchMock = jest.fn(async () => ({
      ok: true,
      text: async () => JSON.stringify({
        access_token: 'at-1',
        refresh_token: 'rt-1',
        expires_in: 3600,
        token_type: 'Bearer',
      }),
    }))
    const prev = global.fetch
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    global.fetch = fetchMock as any
    try {
      const tokens = await exchangeUbersuggestCode({
        code: 'code-1',
        redirectUri: 'https://portal.yousafeconsultancy.com/api/content-studio/ubersuggest/callback',
        verifier: 'ver',
        clientId: 'ubersuggest-mcp',
        as: { token_endpoint: 'https://ubersuggest-mcp.neilpatelapi.com/token' },
      })
      expect(tokens.accessToken).toBe('at-1')
      expect(tokens.refreshToken).toBe('rt-1')
      expect(tokens.expiresAt).toBeTruthy()
      const firstCall = fetchMock.mock.calls[0] as unknown as [string, { body?: string }] | undefined
      const body = String(firstCall?.[1]?.body || '')
      expect(body).toContain('grant_type=authorization_code')
      expect(body).toContain('code_verifier=ver')
      expect(body).not.toContain('client_secret')
    } finally {
      global.fetch = prev
    }
  })

  it('refreshes with the stored refresh_token and keeps it if the AS omits a new one', async () => {
    const fetchMock = jest.fn(async () => ({
      ok: true,
      text: async () => JSON.stringify({ access_token: 'at-2', expires_in: 1800 }),
    }))
    const prev = global.fetch
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    global.fetch = fetchMock as any
    try {
      const tokens = await refreshUbersuggestToken({
        refreshToken: 'rt-keep',
        as: { token_endpoint: 'https://ubersuggest-mcp.neilpatelapi.com/token' },
      })
      expect(tokens.accessToken).toBe('at-2')
      expect(tokens.refreshToken).toBe('rt-keep')
    } finally {
      global.fetch = prev
    }
  })

  it('redacts access and refresh tokens from Configure status', () => {
    const cfg: UbersuggestConfig = {
      enabled: true,
      accessToken: 'secret-at',
      refreshToken: 'secret-rt',
      oauth: true,
      mcpUrl: UBERSUGGEST_MCP_URL,
      toolCount: 37,
    }
    const redacted = redactUbersuggestConfig(cfg)
    expect(redacted.hasToken).toBe(true)
    expect(redacted.hasRefresh).toBe(true)
    expect(redacted.mode).toBe('oauth')
    expect(JSON.stringify(redacted)).not.toContain('secret-at')
    expect(JSON.stringify(redacted)).not.toContain('secret-rt')
  })
})

jest.mock('@/lib/portalAuth', () => ({
  requireAdminUser: jest.fn(async () => ({ db: {}, profile: {}, profileId: 'p_admin', role: 'admin' })),
}))

jest.mock('@/lib/seoEngine/ubersuggest', () => {
  const actual = jest.requireActual('@/lib/seoEngine/ubersuggest') as typeof import('@/lib/seoEngine/ubersuggest')
  return {
    ...actual,
    loadUbersuggestConfig: jest.fn(async () => ({
      enabled: false,
      accessToken: '',
      refreshToken: '',
      mcpUrl: 'https://ubersuggest-mcp.neilpatelapi.com/mcp',
    })),
    persistUbersuggestConfig: jest.fn(async (next: Record<string, unknown>) => ({
      enabled: false,
      accessToken: '',
      refreshToken: '',
      mcpUrl: 'https://ubersuggest-mcp.neilpatelapi.com/mcp',
      ...next,
    })),
    probeUbersuggest: jest.fn(async () => ({ ok: false, toolCount: 0, error: 'not called' })),
    refreshUbersuggestAccessToken: jest.fn(async () => { throw new Error('Ubersuggest MCP is not authorized') }),
    redactUbersuggestConfig: actual.redactUbersuggestConfig,
    UBERSUGGEST_MCP_URL: actual.UBERSUGGEST_MCP_URL,
  }
})

describe('POST /api/content-studio/ubersuggest/connect', () => {
  it('tells Configure to start OAuth when no MCP token is stored', async () => {
    jest.resetModules()
    const { POST } = await import('@/app/api/content-studio/ubersuggest/connect/route')
    const req = { json: async () => ({ enabled: true }) } as unknown as import('next/server').NextRequest
    const res = await POST(req)
    const body = await res.json() as { ok?: boolean; needsOAuth?: boolean; error?: string }
    expect(body.ok).toBe(false)
    expect(body.needsOAuth).toBe(true)
    expect(String(body.error || '')).toMatch(/OAuth/i)
  })
})
