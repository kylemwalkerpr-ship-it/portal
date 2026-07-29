/**
 * lib/indexNow.ts — IndexNow submission helpers.
 *
 * IndexNow is an open protocol that lets websites notify search engines
 * (Bing, Yandex, Seznam, Naver, Yep) about content changes in real time.
 * Google does not support IndexNow directly but reads the same signals
 * via crawl scheduling.
 *
 * The verification key file is served at:
 *   https://<host>/647bf2aebddc03fc34c265f475f8a3a3.txt
 *
 * Key file contents (public/647bf2aebddc03fc34c265f475f8a3a3.txt):
 *   647bf2aebddc03fc34c265f475f8a3a3
 */

import { createSupabaseAdminClient } from '@/lib/supabase'

export const INDEXNOW_KEY = '647bf2aebddc03fc34c265f475f8a3a3'

/**
 * Submit a list of specific URLs to IndexNow for one host.
 *
 * This is the lightweight path — used after shipContent deploys a new page.
 * Posts directly to the global IndexNow endpoint; the participating search
 * engines share submissions internally.
 *
 * Returns the HTTP status or an error message string.
 */
export async function submitUrlsToIndexNow(urls: string[]): Promise<{
  host: string
  urls: number
  status: number | string
}> {
  if (!urls.length) return { host: '', urls: 0, status: 'no urls provided' }

  // Group by host — IndexNow rejects cross-host lists
  const byHost = new Map<string, string[]>()
  for (const url of urls) {
    try {
      const host = new URL(url).host
      const list = byHost.get(host) || []
      list.push(url)
      byHost.set(host, list)
    } catch {
      // Skip malformed URLs
    }
  }

  // Submit each host's URLs separately
  const allResults: Array<{ host: string; urls: number; status: number | string }> = []
  for (const [host, hostUrls] of byHost) {
    try {
      const r = await fetch('https://api.indexnow.org/indexnow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          host,
          key: INDEXNOW_KEY,
          keyLocation: `https://${host}/${INDEXNOW_KEY}.txt`,
          urlList: hostUrls.slice(0, 10000),
        }),
        signal: AbortSignal.timeout(15000),
      })
      allResults.push({ host, urls: hostUrls.length, status: r.status })
    } catch (e: any) {
      allResults.push({ host, urls: hostUrls.length, status: String(e?.message || 'fetch failed') })
    }
  }

  // Log to indexnow_log table for observability
  try {
    const db = createSupabaseAdminClient()
    await db.from('indexnow_log').insert({
      results: allResults,
      source: 'auto_submit',
    })
  } catch {
    // Non-blocking
  }

  return allResults[0] || { host: '', urls: 0, status: 'no results' }
}

/**
 * Extract <loc> values from sitemap XML.
 */
export function extractLocs(xml: string): string[] {
  const out: string[] = []
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) out.push(m[1])
  return out
}
