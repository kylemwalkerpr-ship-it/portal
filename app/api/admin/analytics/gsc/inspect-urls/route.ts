/**
 * GET /api/admin/analytics/gsc/inspect-urls
 *
 * Calls the Google Search Console URL Inspection API (urlInspection.index:inspect)
 * for every enriched /guide/* and /compare/* page to check whether Google has
 * indexed them since the content improvements were deployed.
 *
 * The Inspection API is READ-ONLY — it returns the CURRENT index status but
 * CANNOT request re-indexing. Use IndexNow (triggered separately) for that.
 *
 * Requires an active GSC OAuth connection (the in-app "Connect Search Console"
 * flow at /api/admin/analytics/gsc/connect). Returns a JSON array of results
 * with one entry per URL.
 */
import { NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { getGscConfig } from '@/lib/gscConfig'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const INSPECT_URL = 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect'

// All enriched pages we want to check — guide + compare pages with new content.
const ENRICHED_PAGES = [
  // Guide pages (5 entries)
  'https://legal.yousafeconsultancy.com/guide/marquette-university-international-student-guide/',
  'https://legal.yousafeconsultancy.com/guide/kansas-state-university-international-student-guide/',
  'https://legal.yousafeconsultancy.com/guide/university-of-massachusetts-amherst-student-housing/',
  'https://legal.yousafeconsultancy.com/guide/student-housing-liverpool-uk/',
  'https://legal.yousafeconsultancy.com/guide/student-housing-new-york-us/',
  // Compare pages (4 entries)
  'https://legal.yousafeconsultancy.com/compare/airport-experience-guide/',
  'https://legal.yousafeconsultancy.com/compare/insurance-comparison/',
  'https://legal.yousafeconsultancy.com/compare/mental-health-resources/',
  'https://legal.yousafeconsultancy.com/compare/best-country-students-2026/',
]

/** Exchange the stored refresh token for a live access token. */
async function getAccessToken(cfg: {
  refreshToken: string | null
  clientId: string | null
  clientSecret: string | null
}): Promise<string | null> {
  const { refreshToken, clientId, clientSecret } = cfg
  if (!refreshToken || !clientId || !clientSecret) return null
  try {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
    })
    if (!res.ok) return null
    const json = (await res.json()) as { access_token?: string }
    return json.access_token ?? null
  } catch {
    return null
  }
}

/** Call the URL Inspection API for a single URL. */
async function inspectUrl(
  token: string,
  siteUrl: string,
  inspectionUrl: string,
): Promise<{ url: string; status: string; coverageState?: string; crawlingTime?: string; warning?: string }> {
  try {
    const res = await fetch(INSPECT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inspectionUrl,
        siteUrl,
        languageCode: 'en-US',
      }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return { url: inspectionUrl, status: 'ERROR', warning: `HTTP ${res.status}: ${body.slice(0, 200)}` }
    }
    const json = (await res.json()) as {
      inspectionResult?: {
        indexStatusResult?: {
          verdict: string
          coverageState: string
          crawlingTime?: string
          pageFetchState?: string
          robotsTxtState?: string
        }
        ampIndexResult?: unknown
      }
    }
    const idx = json.inspectionResult?.indexStatusResult
    if (!idx) {
      return { url: inspectionUrl, status: 'UNKNOWN', warning: 'No indexStatusResult in response' }
    }
    return {
      url: inspectionUrl,
      status: idx.verdict,
      coverageState: idx.coverageState,
      crawlingTime: idx.crawlingTime,
    }
  } catch (e: any) {
    return { url: inspectionUrl, status: 'ERROR', warning: String(e?.message || 'fetch failed') }
  }
}

export async function GET(req: Request) {
  // 1. Admin gate — same as other GSC admin routes.
  const auth = await requireAdminUser()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  // 2. Resolve GSC config (refresh token, client id, site URL).
  const cfg = await getGscConfig()
  const token = await getAccessToken(cfg)
  if (!token) {
    return NextResponse.json(
      { error: 'GSC OAuth not configured. Connect via /api/admin/analytics/gsc/connect first.' },
      { status: 400 },
    )
  }
  const siteUrl = cfg.siteUrl
  if (!siteUrl) {
    return NextResponse.json({ error: 'GSC site URL not configured.' }, { status: 400 })
  }

  // 3. Parse optional ?urls= param for ad-hoc checks, or use the default list.
  const urlParam = new URL(req.url).searchParams.get('urls')
  const urls = urlParam ? urlParam.split(',').map((u) => u.trim()).filter(Boolean) : ENRICHED_PAGES

  // 4. Inspect each URL sequentially (gentle on quota).
  const results = []
  for (const url of urls) {
    const r = await inspectUrl(token, siteUrl, url)
    results.push(r)
  }

  // 5. Summarise.
  const indexed = results.filter((r) => r.status === 'PASS')
  const notIndexed = results.filter((r) => r.status !== 'PASS')

  return NextResponse.json({
    inspected: results.length,
    indexed: indexed.length,
    notIndexed: notIndexed.length,
    results,
    note: 'URL Inspection API is read-only — it reports current index status but cannot request indexing. Use IndexNow (already triggered) for crawl requests.',
  })
}
