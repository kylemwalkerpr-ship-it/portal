/**
 * Load SEO factory data from static assets (public/seo-data/*).
 *
 * These files used to be statically imported into the Worker bundle, which
 * pushed gzip size over Cloudflare Free's 3 MiB limit. Serving them via
 * ASSETS / same-origin fetch keeps them out of the script upload.
 */

export type GscSnapshot = {
  generatedAt?: string
  source?: string
  totals?: Record<string, number>
  topQueries: Array<{
    term: string
    clicks: number
    impressions: number
    ctr: number
    position: number
  }>
  topPages: Array<{
    url: string
    clicks: number
    impressions: number
    ctr: number
    position: number
  }>
  opportunities?: {
    highImpressionLowCtr?: GscSnapshot['topQueries']
    highImpressionDeepRank?: GscSnapshot['topQueries']
  }
}

export type OwnershipRegistryFile = {
  version?: string
  updatedAt?: string
  rows: Array<{
    id: number
    primary_keyword: string
    intent_class: string
    owner_host: string
    owner_url: string
    supporting_urls: string[]
    action: string
    market_destination: string | null
    status: string
    notes: string
  }>
}

const EMPTY_SNAPSHOT: GscSnapshot = {
  topQueries: [],
  topPages: [],
  opportunities: { highImpressionLowCtr: [], highImpressionDeepRank: [] },
}

let snapshotCache: GscSnapshot | null = null
let registryCache: OwnershipRegistryFile | null = null
let snapshotInflight: Promise<GscSnapshot> | null = null
let registryInflight: Promise<OwnershipRegistryFile> | null = null

function siteOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_PORTAL_URL ||
    process.env.PORTAL_PUBLIC_URL ||
    'https://portal.yousafeconsultancy.com'
  ).replace(/\/$/, '')
}

async function fetchJson<T>(path: string): Promise<T | null> {
  // 1) Cloudflare ASSETS binding (OpenNext / Workers)
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = globalThis as any
    const env = g[Symbol.for('__cloudflare-context__')]?.env || g.__env__
    const assets = env?.ASSETS
    if (assets?.fetch) {
      const res = await assets.fetch(new Request(`https://assets.local${path}`))
      if (res.ok) return (await res.json()) as T
    }
  } catch {
    /* fall through */
  }

  // 2) Same-origin / absolute public URL
  try {
    const res = await fetch(`${siteOrigin()}${path}`, {
      // edge cache friendly
      headers: { Accept: 'application/json' },
    })
    if (res.ok) return (await res.json()) as T
  } catch {
    /* fall through */
  }

  // 3) Local filesystem (next dev / node test)
  try {
    const { readFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const filePath = join(process.cwd(), 'public', path.replace(/^\//, ''))
    const text = await readFile(filePath, 'utf8')
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

export async function loadGscSnapshot(): Promise<GscSnapshot> {
  if (snapshotCache) return snapshotCache
  if (!snapshotInflight) {
    snapshotInflight = (async () => {
      const data = await fetchJson<GscSnapshot>('/seo-data/snapshot.json')
      snapshotCache = data ?? EMPTY_SNAPSHOT
      return snapshotCache
    })()
  }
  return snapshotInflight
}

export async function loadOwnershipRegistry(): Promise<OwnershipRegistryFile> {
  if (registryCache) return registryCache
  if (!registryInflight) {
    registryInflight = (async () => {
      const data = await fetchJson<OwnershipRegistryFile>('/seo-data/ownership-registry.json')
      registryCache = data ?? { rows: [] }
      return registryCache
    })()
  }
  return registryInflight
}
