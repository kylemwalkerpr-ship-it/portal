/**
 * Ubersuggest remote MCP is OAuth 2.0 + PKCE (public client), not an API key.
 *
 * Discovery (RFC 9728 + RFC 8414):
 *   GET https://ubersuggest-mcp.neilpatelapi.com/.well-known/oauth-protected-resource/mcp
 *   GET https://ubersuggest-mcp.neilpatelapi.com/.well-known/oauth-authorization-server
 *
 * Live AS: authorization_code + refresh_token, token auth method "none",
 * code_challenge S256, DCR at /register (client_id is always "ubersuggest-mcp").
 */
export const UBERSUGGEST_MCP_URL = 'https://ubersuggest-mcp.neilpatelapi.com/mcp'
export const UBERSUGGEST_OAUTH_ISSUER = 'https://ubersuggest-mcp.neilpatelapi.com/'
export const UBERSUGGEST_OAUTH_CLIENT_ID = 'ubersuggest-mcp'
export const UBERSUGGEST_OAUTH_SCOPES = [
  'profile',
  'domain',
  'keywords',
  'serp',
  'backlinks',
  'site_audit',
  'content',
  'projects',
  'utility',
] as const

export const STATE_COOKIE = 'uber_mcp_state'
export const VERIFIER_COOKIE = 'uber_mcp_verifier'
export const COOKIE_MAX_AGE = 600

export interface UbersuggestAsMeta {
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
  registration_endpoint: string
  scopes_supported: string[]
}

export const DEFAULT_AS: UbersuggestAsMeta = {
  issuer: UBERSUGGEST_OAUTH_ISSUER,
  authorization_endpoint: 'https://ubersuggest-mcp.neilpatelapi.com/authorize',
  token_endpoint: 'https://ubersuggest-mcp.neilpatelapi.com/token',
  registration_endpoint: 'https://ubersuggest-mcp.neilpatelapi.com/register',
  scopes_supported: [...UBERSUGGEST_OAUTH_SCOPES],
}

export interface UbersuggestTokenSet {
  accessToken: string
  refreshToken: string
  expiresAt: string | null
  scope?: string
  clientId: string
}

export function portalOriginFromRequest(req: { nextUrl?: { origin: string }; url: string }): string {
  const env = String(process.env.GSC_PORTAL_ORIGIN || process.env.PORTAL_ORIGIN || '').replace(/\/$/, '')
  if (env) return env
  try {
    return req.nextUrl?.origin || new URL(req.url).origin
  } catch {
    return 'https://portal.yousafeconsultancy.com'
  }
}

export function ubersuggestRedirectUri(origin: string): string {
  return `${String(origin || '').replace(/\/$/, '')}/api/content-studio/ubersuggest/callback`
}

export function studioConfigureUrl(origin: string, params: Record<string, string>): string {
  const u = new URL('/dashboard/admin/content', `${String(origin || '').replace(/\/$/, '')}/`)
  u.searchParams.set('tab', 'configure')
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v)
  return u.toString()
}

export function oauthCookieOptions(maxAge = COOKIE_MAX_AGE) {
  return {
    httpOnly: true,
    secure: true,
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  }
}

function base64Url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function generatePkceVerifier(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(32)))
}

export function generateOAuthState(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(16)))
}

export async function pkceChallengeS256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64Url(new Uint8Array(digest))
}

export function readCookieHeader(cookieHeader: string | null | undefined, name: string): string | null {
  if (!cookieHeader) return null
  const m = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))
  if (!m?.[1]) return null
  try {
    return decodeURIComponent(m[1])
  } catch {
    return m[1]
  }
}

export async function discoverUbersuggestAs(): Promise<UbersuggestAsMeta> {
  try {
    const res = await fetch(`${UBERSUGGEST_OAUTH_ISSUER}.well-known/oauth-authorization-server`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(4000),
    })
    if (!res.ok) return { ...DEFAULT_AS, scopes_supported: [...DEFAULT_AS.scopes_supported] }
    const j = (await res.json()) as Partial<UbersuggestAsMeta>
    return {
      issuer: String(j.issuer || DEFAULT_AS.issuer),
      authorization_endpoint: String(j.authorization_endpoint || DEFAULT_AS.authorization_endpoint),
      token_endpoint: String(j.token_endpoint || DEFAULT_AS.token_endpoint),
      registration_endpoint: String(j.registration_endpoint || DEFAULT_AS.registration_endpoint),
      scopes_supported: Array.isArray(j.scopes_supported) && j.scopes_supported.length
        ? j.scopes_supported.map(String)
        : [...DEFAULT_AS.scopes_supported],
    }
  } catch {
    return { ...DEFAULT_AS, scopes_supported: [...DEFAULT_AS.scopes_supported] }
  }
}

export async function registerUbersuggestClient(
  redirectUri: string,
  as: Pick<UbersuggestAsMeta, 'registration_endpoint' | 'scopes_supported'> = DEFAULT_AS,
): Promise<{ clientId: string }> {
  const res = await fetch(as.registration_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_name: 'YouSafe Content Studio',
      client_uri: 'https://portal.yousafeconsultancy.com',
      redirect_uris: [redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: (as.scopes_supported || UBERSUGGEST_OAUTH_SCOPES).join(' '),
      application_type: 'web',
    }),
    signal: AbortSignal.timeout(8000),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Ubersuggest MCP register ${res.status}: ${text.slice(0, 180)}`)
  let parsed: { client_id?: string } = {}
  try {
    parsed = JSON.parse(text) as { client_id?: string }
  } catch {
    /* DCR always returned JSON in live probes; fall through to default id */
  }
  return { clientId: String(parsed.client_id || UBERSUGGEST_OAUTH_CLIENT_ID).trim() || UBERSUGGEST_OAUTH_CLIENT_ID }
}

export async function buildUbersuggestAuthorizeUrl(opts: {
  redirectUri: string
  state: string
  verifier: string
  clientId?: string
  as?: UbersuggestAsMeta
}): Promise<string> {
  const as = opts.as || await discoverUbersuggestAs()
  const challenge = await pkceChallengeS256(opts.verifier)
  const url = new URL(as.authorization_endpoint)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', opts.clientId || UBERSUGGEST_OAUTH_CLIENT_ID)
  url.searchParams.set('redirect_uri', opts.redirectUri)
  url.searchParams.set('scope', (as.scopes_supported || UBERSUGGEST_OAUTH_SCOPES).join(' '))
  url.searchParams.set('state', opts.state)
  url.searchParams.set('code_challenge', challenge)
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('resource', UBERSUGGEST_MCP_URL)
  return url.toString()
}

function parseTokenPayload(raw: unknown): UbersuggestTokenSet {
  const rec = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  const accessToken = String(rec.access_token || '').trim()
  if (!accessToken) throw new Error('Ubersuggest MCP token response had no access_token')
  const expiresIn = Number(rec.expires_in) || 0
  return {
    accessToken,
    refreshToken: String(rec.refresh_token || '').trim(),
    expiresAt: expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
    scope: rec.scope ? String(rec.scope) : undefined,
    clientId: String(rec.client_id || UBERSUGGEST_OAUTH_CLIENT_ID),
  }
}

async function tokenRequest(
  as: Pick<UbersuggestAsMeta, 'token_endpoint'>,
  body: Record<string, string>,
): Promise<UbersuggestTokenSet> {
  const res = await fetch(as.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams(body).toString(),
    signal: AbortSignal.timeout(12_000),
  })
  const text = await res.text()
  let parsed: unknown = {}
  try {
    parsed = JSON.parse(text)
  } catch {
    parsed = { error_description: text.slice(0, 180) }
  }
  if (!res.ok) {
    const rec = parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {}
    throw new Error(String(rec.error_description || rec.error || `Ubersuggest token ${res.status}: ${text.slice(0, 160)}`))
  }
  return parseTokenPayload(parsed)
}

export async function exchangeUbersuggestCode(opts: {
  code: string
  redirectUri: string
  verifier: string
  clientId?: string
  as?: Pick<UbersuggestAsMeta, 'token_endpoint'>
}): Promise<UbersuggestTokenSet> {
  const as = opts.as || await discoverUbersuggestAs()
  return tokenRequest(as, {
    grant_type: 'authorization_code',
    code: opts.code,
    redirect_uri: opts.redirectUri,
    client_id: opts.clientId || UBERSUGGEST_OAUTH_CLIENT_ID,
    code_verifier: opts.verifier,
    resource: UBERSUGGEST_MCP_URL,
  })
}

export async function refreshUbersuggestToken(opts: {
  refreshToken: string
  clientId?: string
  as?: Pick<UbersuggestAsMeta, 'token_endpoint'>
}): Promise<UbersuggestTokenSet> {
  const as = opts.as || await discoverUbersuggestAs()
  const tokens = await tokenRequest(as, {
    grant_type: 'refresh_token',
    refresh_token: opts.refreshToken,
    client_id: opts.clientId || UBERSUGGEST_OAUTH_CLIENT_ID,
    resource: UBERSUGGEST_MCP_URL,
  })
  if (!tokens.refreshToken) tokens.refreshToken = opts.refreshToken
  return tokens
}
