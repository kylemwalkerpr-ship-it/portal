// Google Search Console — live keyword signals.
//
// When the gig-draft path needs evidence-backed keywords (not just
// taxonomy-curated terms or strategy-doc targets), it asks this module
// for the top queries Search Console has logged for the relevant
// (category × jurisdiction) slice. Results outrank static category
// terms in the priority list because they reflect REAL buyer queries
// with REAL impressions, not editorial guesses.
//
// Runs on the Cloudflare Workers runtime — uses Web Crypto (subtle)
// for JWT signing + plain fetch for the REST call. No googleapis dep
// (that package is Node-only and ~12MB; doesn't fit on the edge).
//
// Two auth modes are supported — the module auto-detects which env
// vars are configured and dispatches accordingly. ONE of these
// credential bundles is required, plus GSC_SITE_URL:
//
// Mode A — OAuth refresh token (works for personal-Gmail-owned
// properties; this is the working path for yousafeconsultancy.com):
//   GSC_OAUTH_REFRESH_TOKEN   — long-lived refresh token tied to the
//                               property-owner Google account, scoped
//                               to webmasters.readonly.
//   GSC_OAUTH_CLIENT_ID       — OAuth 2.0 Web client ID from the
//                               yousafe-gsc-reader Cloud project.
//   GSC_OAUTH_CLIENT_SECRET   — paired client secret.
//
// Mode B — Service account JWT (works for Google Workspace properties
// or URL-prefix properties that accept service accounts):
//   GSC_SERVICE_ACCOUNT_JSON  — JSON key with "Restricted" or "Owner"
//                               role on each Search Console property.
//
// Common to both modes:
//   GSC_SITE_URL              — the canonical property URL, e.g.
//                               "sc-domain:yousafeconsultancy.com" or
//                               "https://yousafeconsultancy.com/".
//
// When neither credential bundle is set OR GSC_SITE_URL is missing,
// this module returns null — the downstream code (lib/seoResearch.ts)
// treats null as "no live signals" and falls back to the static path.
// That's the "flip the env vars and it just works" contract.
//
// Caching: results are cached in a module-level Map for 24 hours per
// (category × jurisdiction) key. GSC quota is generous (~1200 req/min)
// but the latency of a cold call is ~500ms — caching keeps the gig-
// draft flow snappy and protects the daily quota across the workspace.

import type { Jurisdiction } from './seoResearch'
import { parseServiceAccountJson } from './gscAuth'

export interface LiveKeywordSignal {
  term: string
  // Impressions in the last 28 days for this query on the property.
  impressions: number
  // Average position on the SERP for this query (lower = better).
  position: number
  // Source of the signal — always 'gsc' today. Reserved for future
  // expansion (e.g. Bing Webmaster Tools).
  source: 'gsc'
}

interface CacheEntry {
  signals: LiveKeywordSignal[]
  expiresAt: number
}

const CACHE: Map<string, CacheEntry> = new Map()
const TTL_MS = 24 * 60 * 60 * 1000

function cacheKey(category: string, jx: Jurisdiction): string {
  return `${category}::${jx}`
}

export interface FetchGscKeywordSignalsOpts {
  // Category id from lib/categories.ts — used to build the dimension
  // filter (page contains category id or one of its source labels).
  category: string
  // Jurisdiction — 'us' / 'uk' / 'ca'. The query filter restricts to
  // pages under the matching property subpath (/us/, /uk/, /ca/).
  jurisdiction: Jurisdiction
  // Max number of queries to return. Default 8 — enough to influence
  // ranking without crowding out taxonomy terms.
  limit?: number
}

// --- JWT signing (Web Crypto, edge-runtime compatible) ---------------

function base64UrlEncode(input: ArrayBuffer | Uint8Array | string): string {
  const bytes = typeof input === 'string'
    ? new TextEncoder().encode(input)
    : input instanceof Uint8Array ? input : new Uint8Array(input)
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

interface ServiceAccount {
  client_email: string
  private_key: string
  token_uri?: string
}

// --- Mode A: OAuth refresh-token exchange ---------------------------
// Exchanges a long-lived refresh token for a short-lived access token
// at Google's OAuth endpoint. The refresh token was minted by the
// property owner (kylemwalker.pr@gmail.com) via the OAuth Playground;
// the resulting access tokens carry that owner's GSC permissions.
async function getAccessTokenFromRefreshToken(
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
    throw new Error(`GSC refresh-token exchange failed (${res.status}): ${text.slice(0, 200)}`)
  }
  const json = await res.json() as { access_token?: string }
  if (!json.access_token) throw new Error('GSC refresh-token exchange missing access_token')
  return json.access_token
}

// --- Mode B: Service-account JWT signing ----------------------------
// Sign a service-account JWT for the webmasters.readonly scope.
// Returns the access_token string the REST call uses as Bearer.
async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const claim = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/webmasters.readonly',
    aud: sa.token_uri || 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }
  const header = { alg: 'RS256', typ: 'JWT' }
  const unsigned = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(claim))}`

  const keyData = pemToArrayBuffer(sa.private_key)
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyData,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(unsigned))
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
    throw new Error(`GSC token exchange failed (${tokenRes.status}): ${text.slice(0, 200)}`)
  }
  const json = await tokenRes.json() as { access_token?: string }
  if (!json.access_token) throw new Error('GSC token exchange missing access_token')
  return json.access_token
}

// --- public API ------------------------------------------------------

// Returns null when GSC isn't configured for this environment. Callers
// MUST handle the null case by falling back to the static keyword
// path — this module is a progressive-enhancement layer, not a hard
// dependency.
export async function fetchGscKeywordSignals(
  opts: FetchGscKeywordSignalsOpts,
): Promise<LiveKeywordSignal[] | null> {
  const siteUrl = process.env.GSC_SITE_URL
  if (!siteUrl) return null
  if (!opts.category || !opts.jurisdiction) return null

  // Detect which auth mode is configured. OAuth refresh-token has
  // higher priority because it's the working path for personal-Gmail
  // properties (Search Console refuses service-account emails on
  // those). SA JWT is the fallback for future Workspace setups.
  const refreshToken = process.env.GSC_OAUTH_REFRESH_TOKEN
  const oauthClientId = process.env.GSC_OAUTH_CLIENT_ID
  const oauthClientSecret = process.env.GSC_OAUTH_CLIENT_SECRET
  const saJson = process.env.GSC_SERVICE_ACCOUNT_JSON
  const hasOAuth = refreshToken && oauthClientId && oauthClientSecret
  const hasSA = !!saJson
  if (!hasOAuth && !hasSA) return null

  const key = cacheKey(opts.category, opts.jurisdiction)
  const cached = CACHE.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.signals

  try {
    const accessToken = hasOAuth
      ? await getAccessTokenFromRefreshToken(refreshToken, oauthClientId, oauthClientSecret)
      : await getAccessToken(parseServiceAccountJson(saJson as string))

    // 28-day window matches GSC default.
    const endDate = new Date().toISOString().slice(0, 10)
    const startDate = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const pageSubpath = `/${opts.jurisdiction}/`

    const endpoint = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        startDate,
        endDate,
        dimensions: ['query'],
        rowLimit: opts.limit ?? 8,
        dimensionFilterGroups: [
          {
            filters: [
              { dimension: 'page', operator: 'contains', expression: pageSubpath },
              // Loose category filter — pages that contain the
              // category id in their path. Falls through harmlessly
              // when the property doesn't structure URLs that way.
              { dimension: 'page', operator: 'contains', expression: opts.category },
            ],
          },
        ],
      }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`GSC searchAnalytics.query failed (${res.status}): ${text.slice(0, 200)}`)
    }

    const json = await res.json() as { rows?: Array<{ keys?: string[]; impressions?: number; position?: number }> }
    const signals: LiveKeywordSignal[] = (json.rows ?? [])
      .map((r) => ({
        term: (r.keys?.[0] ?? '').trim(),
        impressions: r.impressions ?? 0,
        position: r.position ?? 100,
        source: 'gsc' as const,
      }))
      .filter((s) => s.term.length > 0 && s.impressions > 0)

    CACHE.set(key, { signals, expiresAt: Date.now() + TTL_MS })
    return signals
  } catch (err) {
    // Never throw out — the gig-draft path must remain responsive even
    // when GSC is misconfigured or rate-limited. Log to stderr (the
    // CF Worker tail surfaces this) and fall back to null.
    // eslint-disable-next-line no-console
    console.warn('[gscKeywordSignals] fetch failed; falling back to static keywords', err instanceof Error ? err.message : err)
    return null
  }
}

// Test/dev helper — flush the in-memory cache. Not exported via
// barrel; callers reach for this name only in tests.
export function __resetGscCache(): void {
  CACHE.clear()
}
