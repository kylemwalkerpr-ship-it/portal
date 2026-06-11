/**
 * GET/POST /api/indexnow?key=<INDEXNOW_KEY>[&host=<single host>]
 *
 * Submits every URL from each site's sitemap to IndexNow (Bing, Yandex,
 * Seznam, Naver — Google reads the same signals via crawl scheduling).
 * Each host serves its verification file at https://<host>/<key>.txt,
 * committed to the corresponding repo's public/ directory.
 *
 * CPU profile: a handful of sitemap fetches + one POST per host — all
 * network-bound (fetch await), negligible CPU, no 1102 exposure. Run it
 * after content deploys; safe to call repeatedly (IndexNow dedupes).
 */

const INDEXNOW_KEY = '647bf2aebddc03fc34c265f475f8a3a3'

const HOSTS = [
  'market.yousafeconsultancy.com',
  'portal.yousafeconsultancy.com',
  'legal.yousafeconsultancy.com',
  'usa.yousafeconsultancy.com',
  'uk.yousafeconsultancy.com',
  'ca.yousafeconsultancy.com',
  'au.yousafeconsultancy.com',
]

function extractLocs(xml: string): string[] {
  const out: string[] = []
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) out.push(m[1])
  return out
}

async function urlsForHost(host: string): Promise<string[]> {
  try {
    const r = await fetch(`https://${host}/sitemap.xml`, { signal: AbortSignal.timeout(10000) })
    if (!r.ok) return []
    const xml = await r.text()
    let locs = extractLocs(xml)
    // Sitemap index? Resolve one level of child sitemaps.
    if (xml.includes('<sitemapindex')) {
      const children = locs.slice(0, 20)
      locs = []
      for (const child of children) {
        try {
          const cr = await fetch(child, { signal: AbortSignal.timeout(10000) })
          if (cr.ok) locs.push(...extractLocs(await cr.text()))
        } catch { /* skip child */ }
      }
    }
    // Keep only same-host URLs; IndexNow rejects cross-host lists.
    return locs.filter(u => { try { return new URL(u).host === host } catch { return false } }).slice(0, 10000)
  } catch {
    return []
  }
}

async function submitHost(host: string): Promise<{ host: string; urls: number; status: number | string }> {
  const urlList = await urlsForHost(host)
  if (!urlList.length) return { host, urls: 0, status: 'no sitemap urls' }
  try {
    const r = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host,
        key: INDEXNOW_KEY,
        keyLocation: `https://${host}/${INDEXNOW_KEY}.txt`,
        urlList,
      }),
      signal: AbortSignal.timeout(15000),
    })
    return { host, urls: urlList.length, status: r.status }
  } catch (e: any) {
    return { host, urls: urlList.length, status: String(e?.message || 'fetch failed') }
  }
}

async function run(req: Request) {
  const url = new URL(req.url)
  if (url.searchParams.get('key') !== INDEXNOW_KEY) {
    return Response.json({ error: 'not found' }, { status: 404 })
  }
  const only = url.searchParams.get('host')
  const hosts = only ? HOSTS.filter(h => h === only) : HOSTS
  const results = []
  for (const h of hosts) results.push(await submitHost(h))
  return Response.json({ submitted: results })
}

export async function GET(req: Request) { return run(req) }
export async function POST(req: Request) { return run(req) }
