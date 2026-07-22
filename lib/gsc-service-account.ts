/**
 * GSC Service Account Auth Utility
 *
 * Creates a signed JWT from a Google service account JSON key and exchanges it
 * for an OAuth 2.0 access token. Works in both Cloudflare Workers (WebCrypto)
 * and Node.js runtimes via the `jose` library.
 *
 * Usage:
 *   const token = await getGscAccessToken(serviceAccountKey)
 *   fetch('https://www.googleapis.com/webmasters/v3/sites/...', {
 *     headers: { Authorization: `Bearer ${token}` }
 *   })
 */

// Token cache — service account JWTs are valid for 1 hour. We cache for 50 min.
let cachedToken: { access_token: string; expires_at: number } | null = null

export async function getGscAccessToken(serviceAccountKeyJson: string): Promise<string> {
  // Return cached token if still valid (with 5min buffer)
  if (cachedToken && Date.now() < cachedToken.expires_at - 300_000) {
    return cachedToken.access_token
  }

  let key: {
    client_email: string
    private_key: string
    token_uri?: string
  }

  try {
    key = JSON.parse(serviceAccountKeyJson)
  } catch {
    throw new Error('GSC_SERVICE_ACCOUNT_KEY is not valid JSON')
  }

  if (!key.client_email || !key.private_key) {
    throw new Error('Service account key missing client_email or private_key')
  }

  const tokenUri = key.token_uri ?? 'https://oauth2.googleapis.com/token'
  const scope = 'https://www.googleapis.com/auth/webmasters.readonly'

  // Dynamically import `jose` — works in both Next.js and Cloudflare Workers
  const { SignJWT } = await import('jose')

  // Create JWT
  const now = Math.floor(Date.now() / 1000)
  const signedJwt = await new SignJWT({
    iss: key.client_email,
    sub: key.client_email,
    scope,
    aud: tokenUri,
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuedAt(now)
    .setExpirationTime(now + 3600) // 1 hour
    .sign(await importPrivateKey(key.private_key))

  // Exchange JWT for access token
  const tokenRes = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: signedJwt,
    }),
  })

  if (!tokenRes.ok) {
    const err = await tokenRes.text()
    throw new Error(`GSC token exchange failed (${tokenRes.status}): ${err.slice(0, 300)}`)
  }

  const data = (await tokenRes.json()) as { access_token: string; expires_in: number }
  cachedToken = {
    access_token: data.access_token,
    expires_at: Date.now() + (data.expires_in ?? 3600) * 1000,
  }

  return cachedToken.access_token
}

/** Convert a PEM-formatted private key to a CryptoKey (WebCrypto / jose). */
async function importPrivateKey(pem: string) {
  const { importPKCS8 } = await import('jose')
  // The private_key from Google JSON is PKCS#8 PEM format
  const pemContent = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '')

  const binaryKey = Uint8Array.from(atob(pemContent), (c) => c.charCodeAt(0))

  return importPKCS8(binaryKey, 'RS256')
}
