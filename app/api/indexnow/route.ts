/**
 * GET/POST /api/indexnow?key=<INDEXNOW_KEY>[&host=<single host>]
 *
 * Submits every URL from each site's sitemap to IndexNow (Bing, Yandex,
 * Seznam, Naver — Google reads the same signals via crawl scheduling).
 * Each host serves its verification file at https://<host>/<key>.txt,
 * committed to the corresponding repo's public/ directory.
 *
 * Execution model: the submission loop is network-bound (sitemap fetches +
 * one POST per host, with backoff sleeps for 429/503) and can run for a few
 * minutes. It is handed to ctx.waitUntil() so it completes in the background
 * regardless of whether the HTTP caller stays connected — the endpoint
 * returns 202 immediately and the run logs to public.indexnow_log when done.
 * Verify a run by polling that table, NOT by reading the HTTP response body.
 */
import { getCloudflareContext } from '@opennextjs/cloudflare'

const INDEXNOW_KEY = '647bf2aebddc03fc34c265f475f8a3a3'

// portal.yousafeconsultancy.com is intentionally NOT submitted: it is the
// authenticated app and has no public sitemap of its own. app/sitemap.ts
// emits only market.* URLs, so the portal host always produced zero URLs
// ("no sitemap urls") — a permanent false alarm, now removed. Re-add it only
// if a portal-specific public sitemap is introduced.
const HOSTS = [
  'market.yousafeconsultancy.com',
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

// All POSTs leave from the same shared Cloudflare egress IP, so IndexNow's
// per-IP throttle returns 429 (and 503 when its backend is briefly busy).
// A single 10s retry was not enough — the whole 2026-06-12 run came back
// 429/503. Retry up to 3 times with exponential backoff (10s, 20s, 40s);
// since the run is in waitUntil() the extra wall-clock time is harmless.
const TRANSIENT = new Set([429, 502, 503, 504])

async function submitHost(host: string): Promise<{ host: string; urls: number; status: number | string }> {
  const urlList = await urlsForHost(host)
  if (!urlList.length) return { host, urls: 0, status: 'no sitemap urls' }
  let status = await postIndexNow(host, urlList)
  let delay = 10000
  for (let attempt = 0; attempt < 3 && typeof status === 'number' && TRANSIENT.has(status); attempt++) {
    await sleep(delay)
    delay *= 2
    status = await postIndexNow(host, urlList)
  }
  return { host, urls: urlList.length, status }
}

async function runSubmission(hosts: string[]) {
  const results = []
  for (const h of hosts) {
    results.push(await submitHost(h))
    // Space per-host submissions — all POSTs come from the same worker
    // egress IP, and back-to-back requests tripped IndexNow's 429s. Widened
    // from 2s to 6s after the 2026-06-12 run was rate-limited across hosts.
    if (h !== hosts[hosts.length - 1]) await sleep(6000)
  }
  try {
    const { createSupabaseAdminClient } = await import('@/lib/supabase')
    await createSupabaseAdminClient().from('indexnow_log').insert({ results })
  } catch { /* non-blocking */ }
  return results
}

async function run(req: Request) {
  const url = new URL(req.url)
  if (url.searchParams.get('key') !== INDEXNOW_KEY) {
    return Response.json({ error: 'not found' }, { status: 404 })
  }
  const only = url.searchParams.get('host')
  const hosts = only ? HOSTS.filter(h => h === only) : HOSTS

  // Run in the background so the submission completes and logs even when the
  // caller disconnects. The previous "inline" version was cancelled mid-loop
  // by the Cloudflare runtime as soon as the client (e.g. a 30s-capped fetch)
  // went away, so the per-host POSTs and the indexnow_log insert never ran —
  // every recent trigger left no row. next/server after() does not fire under
  // this OpenNext setup; getCloudflareContext().ctx.waitUntil() does.
  const work = runSubmission(hosts)
  try {
    getCloudflareContext().ctx.waitUntil(work)
  } catch {
    // No Cloudflare context (e.g. local dev) — fall back to awaiting inline.
    await work
  }

  return Response.json(
    { accepted: true, hosts, note: 'Submission runs in the background; verify via public.indexnow_log.' },
    { status: 202 },
  )
}

export async function GET(req: Request) { return run(req) }
export async function POST(req: Request) { return run(req) }
