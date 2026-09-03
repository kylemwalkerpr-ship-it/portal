/**
 * Pick a Search Console property URL from the live sites list when
 * GSC_SITE_URL / gsc_connection.site_url is empty. Live GSC is otherwise
 * skipped (planner requires siteUrl) and the desk falls through to the
 * 42-day-old committed snapshot.json.
 */

const ESTATE_HINTS = [
  'sc-domain:yousafeconsultancy.com',
  'sc-domain:legal.yousafeconsultancy.com',
  'https://yousafeconsultancy.com/',
  'https://www.yousafeconsultancy.com/',
  'https://legal.yousafeconsultancy.com/',
]

export function pickGscSiteUrl(siteEntryUrls: string[]): string | null {
  const sites = siteEntryUrls.map((s) => String(s || '').trim()).filter(Boolean)
  if (!sites.length) return null
  for (const preferred of ESTATE_HINTS) {
    const hit = sites.find((s) => s.toLowerCase() === preferred.toLowerCase())
    if (hit) return hit
  }
  const estate = sites.find((s) => /yousafeconsultancy\.com/i.test(s))
  return estate || sites[0] || null
}

export async function listGscSiteUrls(accessToken: string): Promise<string[]> {
  const res = await fetch('https://searchconsole.googleapis.com/webmasters/v3/sites', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return []
  const json = (await res.json()) as { siteEntry?: Array<{ siteUrl?: string }> }
  return (json.siteEntry || []).map((e) => String(e.siteUrl || '')).filter(Boolean)
}

let listedSiteCache: { at: number; url: string | null } | null = null
const LIST_TTL_MS = 10 * 60_000

export async function resolveGscSiteUrl(accessToken: string, configured: string | null): Promise<string | null> {
  if (configured) return configured
  if (listedSiteCache && Date.now() - listedSiteCache.at < LIST_TTL_MS) return listedSiteCache.url
  try {
    const url = pickGscSiteUrl(await listGscSiteUrls(accessToken))
    listedSiteCache = { at: Date.now(), url }
    return url
  } catch {
    return null
  }
}
