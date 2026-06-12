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

// Hosts served by THIS worker. A Cloudflare Worker cannot fetch() its own
// zone (error 1042), so https://<own host>/sitemap.xml always throws from
// inside the worker — observed as "no sitemap urls" on every run while the
// same URL worked fine from a browser. Source those URLs by invoking the
// sitemap module directly instead of going over HTTP.
const OWN_HOSTS = new Set([
  'market.yousafeconsultancy.com',
  'portal.yousafeconsultancy.com',
])

async function urlsForOwnHost(host: string): Promise<string[]> {
  try {
    const { default: sitemap } = await import('@/app/sitemap')
    const entries = await sitemap()
    return entries
      .map(e => e.url)
      .filter(u => { try { return new URL(u).host === host } catch { return false } })
      .slice(0, 10000)
  } catch {
    return []
  }
}

async function urlsForHost(host: string): Promise<string[]> {
  if (OWN_HOSTS.has(host)) return urlsForOwnHost(host)
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

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function postIndexNow(host: string, urlList: string[]): Promise<number | string> {
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
    return r.status
  } catch (e: any) {
    return String(e?.message || 'fetch failed')
  }
}

async function submitHost(host: string): Promise<{ host: string; urls: number; status: number | string }> {
  const urlList = await urlsForHost(host)
  if (!urlList.length) return { host, urls: 0, status: 'no sitemap urls' }
  let status = await postIndexNow(host, urlList)
  // 429 = rate limited, 503 = IndexNow busy — both transient. One bounded
  // retry after a pause recovers most of them (observed on 2026-06-12 run).
  if (status === 429 || status === 503) {
    await sleep(10000)
    status = await postIndexNow(host, urlList)
  }
  return { host, urls: urlList.length, status }
}

async function run(req: Request) {
  const url = new URL(req.url)
  if (url.searchParams.get('key') !== INDEXNOW_KEY) {
    return Response.json({ error: 'not found' }, { status: 404 })
  }
  const only = url.searchParams.get('host')
  const hosts = only ? HOSTS.filter(h => h === only) : HOSTS

  // Runs INLINE deliberately. next/server after() never fires under this
  // OpenNext setup (verified 2026-06-12: after()-wrapped runs left no log
  // rows; the synchronous version completed and logged even when the
  // client disconnected early). All waits are network/timer — no CPU.
  const results = []
  for (const h of hosts) {
    results.push(await submitHost(h))
    // Space per-host submissions — all POSTs come from the same worker
    // egress IP, and back-to-back requests tripped IndexNow's 429s.
    if (h !== hosts[hosts.length - 1]) await sleep(2000)
  }
  try {
    const { createSupabaseAdminClient } = await import('@/lib/supabase')
    await createSupabaseAdminClient().from('indexnow_log').insert({ results })
  } catch { /* non-blocking */ }

  return Response.json({ submitted: results })
}

export async function GET(req: Request) { return run(req) }
export async function POST(req: Request) { return run(req) }
