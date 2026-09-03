/**
 * Shared GSC access-token resolution for Cloudflare Workers (Web Crypto only).
 *
 * Priority:
 *   1. OAuth refresh token (GSC_OAUTH_* / gsc_connection row) — works for
 *      personal-Gmail-owned properties once the owner has authorized.
 *   2. Service account JWT (GSC_SERVICE_ACCOUNT_JSON) — works after the SA
 *      email is added as a user on each Search Console property.
 *
 * Returns null when neither credential bundle is configured.
 */

import { getGscConfig } from '@/lib/gscConfig'
import { resolveGscSiteUrl } from '@/lib/gscSites'

export type GscAuthMode = 'oauth' | 'service_account' | null

export interface GscAccess {
  accessToken: string
  mode: Exclude<GscAuthMode, null>
  siteUrl: string | null
}

function base64UrlEncode(input: ArrayBuffer | Uint8Array | string): string {
  const bytes =
    typeof input === 'string'
      ? new TextEncoder().encode(input)
      : input instanceof Uint8Array
        ? input
        : new Uint8Array(input)
  let bin = ''
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '')
  const bin = atob(body)
  const buf = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
  return buf.buffer
}

export interface ServiceAccount {
  client_email: string
  private_key: string
  token_uri?: string
}

/**
 * Parse a GSC service-account key from env / pasted JSON.
 * Wrangler, .env UIs, and secret stores often wrap the object in extra
 * quotes (`'{...}'`) which makes JSON.parse throw `Unexpected token '''`.
 */
export function parseServiceAccountJson(raw: string): ServiceAccount {
  let s = String(raw || '').trim().replace(/^\uFEFF/, '')
  if (!s) throw new Error('GSC service account JSON is empty')
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start >= 0 && end > start) s = s.slice(start, end + 1)
  let parsed: ServiceAccount
  try {
    parsed = JSON.parse(s) as ServiceAccount
  } catch (err) {
    try {
      parsed = JSON.parse(s.replace(/'/g, '"')) as ServiceAccount
    } catch {
      throw err instanceof Error ? err : new Error('GSC service account JSON is invalid')
    }
  }
  if (!parsed?.client_email || !parsed?.private_key) {
    throw new Error('GSC service account JSON missing client_email or private_key')
  }
  if (parsed.private_key.includes('\\n')) {
    parsed = { ...parsed, private_key: parsed.private_key.replace(/\\n/g, '\n') }
  }
  return parsed
}

export async function mintServiceAccountToken(
  sa: ServiceAccount,
  scope = 'https://www.googleapis.com/auth/webmasters.readonly',
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const claim = {
    iss: sa.client_email,
    scope,
    aud: sa.token_uri || 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }
  const header = { alg: 'RS256', typ: 'JWT' }
  const unsigned = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(claim))}`
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(unsigned),
  )
  const jwt = `${unsigned}.${base64UrlEncode(sig)}`

  const tokenRes = await fetch(claim.aud, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }).toString(),
  })
  if (!tokenRes.ok) {
    const text = await tokenRes.text().catch(() => '')
    throw new Error(`GSC SA token exchange failed (${tokenRes.status}): ${text.slice(0, 200)}`)
  }
  const json = (await tokenRes.json()) as { access_token?: string }
  if (!json.access_token) throw new Error('GSC SA token exchange missing access_token')
  return json.access_token
}

async function tokenFromRefresh(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`GSC OAuth refresh failed (${res.status}): ${text.slice(0, 200)}`)
  }
  const json = (await res.json()) as { access_token?: string }
  if (!json.access_token) throw new Error('GSC OAuth refresh missing access_token')
  return json.access_token
}

/** Detect which auth mode is available (without minting a token). */
export async function detectGscAuthMode(): Promise<GscAuthMode> {
  const cfg = await getGscConfig()
  if (cfg.refreshToken && cfg.clientId && cfg.clientSecret) return 'oauth'
  if (cfg.serviceAccountKey) return 'service_account'
  return null
}

/**
 * Mint a short-lived access token for Search Console API calls.
 * Prefer OAuth when fully configured (personal-Gmail properties); else SA.
 */
async function withSite(accessToken: string, mode: Exclude<GscAuthMode, null>, configured: string | null): Promise<GscAccess> {
  const siteUrl = await resolveGscSiteUrl(accessToken, configured)
  return { accessToken, mode, siteUrl }
}

export async function getGscAccess(): Promise<GscAccess | null> {
  const cfg = await getGscConfig()
  const configured = cfg.siteUrl || process.env.GSC_SITE_URL || null

  if (cfg.refreshToken && cfg.clientId && cfg.clientSecret) {
    try {
      const accessToken = await tokenFromRefresh(cfg.refreshToken, cfg.clientId, cfg.clientSecret)
      return withSite(accessToken, 'oauth', configured)
    } catch (err) {
      console.warn('[gscAuth] OAuth failed, trying service account', err instanceof Error ? err.message : err)
    }
  }

  // Stored pasted key first, then either secret name (Content Studio vs
  // concurrent SA wiring)
  const saJson =
    cfg.serviceAccountKey ||
    process.env.GSC_SERVICE_ACCOUNT_JSON ||
    process.env.GSC_SERVICE_ACCOUNT_KEY
  if (saJson) {
    try {
      const sa = parseServiceAccountJson(saJson)
      const accessToken = await mintServiceAccountToken(sa)
      return withSite(accessToken, 'service_account', configured)
    } catch (err) {
      console.warn('[gscAuth] Service account failed', err instanceof Error ? err.message : err)
      return null
    }
  }

  return null
}

export async function serviceAccountEmail(): Promise<string | null> {
  try {
    const cfg = await getGscConfig()
    const raw =
      cfg.serviceAccountKey ||
      process.env.GSC_SERVICE_ACCOUNT_JSON ||
      process.env.GSC_SERVICE_ACCOUNT_KEY
    if (!raw) return null
    const sa = parseServiceAccountJson(raw)
    return sa.client_email ?? null
  } catch {
    return null
  }
}
