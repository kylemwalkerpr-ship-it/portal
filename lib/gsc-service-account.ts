/**
 * GSC service-account token helper (edge-safe, no jose).
 *
 * Thin wrapper over lib/gscAuth so concurrent Content Studio routes that
 * import getGscAccessToken(serviceAccountKeyJson) keep working.
 */

import { getGscAccess } from '@/lib/gscAuth'

// Token cache for explicit JSON key argument
let cached: { key: string; access_token: string; expires_at: number } | null = null

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

/**
 * Exchange a service-account JSON key for an access token.
 * Prefer env-based getGscAccess() for new code.
 */
export async function getGscAccessToken(serviceAccountKeyJson: string): Promise<string> {
  if (cached && cached.key === serviceAccountKeyJson && Date.now() < cached.expires_at - 300_000) {
    return cached.access_token
  }

  let key: { client_email: string; private_key: string; token_uri?: string }
  try {
    key = JSON.parse(serviceAccountKeyJson)
  } catch {
    throw new Error('GSC service account key is not valid JSON')
  }
  if (!key.client_email || !key.private_key) {
    throw new Error('Service account key missing client_email or private_key')
  }

  const now = Math.floor(Date.now() / 1000)
  const claim = {
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/webmasters.readonly',
    aud: key.token_uri || 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }
  const header = { alg: 'RS256', typ: 'JWT' }
  const unsigned = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(claim))}`
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(key.private_key),
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
    const err = await tokenRes.text()
    throw new Error(`GSC token exchange failed (${tokenRes.status}): ${err.slice(0, 300)}`)
  }
  const data = (await tokenRes.json()) as { access_token: string; expires_in?: number }
  cached = {
    key: serviceAccountKeyJson,
    access_token: data.access_token,
    expires_at: Date.now() + (data.expires_in ?? 3600) * 1000,
  }
  return data.access_token
}

/** Env-based token (GSC_SERVICE_ACCOUNT_JSON | KEY or OAuth). */
export async function getGscAccessTokenFromEnv(): Promise<string | null> {
  const access = await getGscAccess()
  return access?.accessToken ?? null
}
