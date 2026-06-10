/**
 * KV-based page cache for Next.js on Cloudflare Workers.
 * Caches rendered data to avoid repeated expensive computation on cold starts.
 *
 * KV bindings are available via process.env.<BINDING_NAME> in OpenNext's
 * Cloudflare Workers runtime. The PAGE_CACHE binding must be configured in
 * wrangler.toml under [kv_namespaces].
 */

export interface CacheEntry<T> {
  data: T
  expiresAt: number
}

/** Safely retrieve the PAGE_CACHE KV namespace binding. */
function getKv(): KVNamespace | undefined {
  try {
    return (process.env as any).PAGE_CACHE as KVNamespace | undefined
  } catch {
    return undefined
  }
}

/**
 * Retrieve a cached value from KV if it exists and hasn't expired.
 * Returns `null` on cache miss, expired entry, or any error (fail-open).
 */
export async function getCached<T>(
  key: string,
  ttlSeconds: number = 60,
): Promise<T | null> {
  try {
    const kv = getKv()
    if (!kv) return null

    const cached = await kv.get<CacheEntry<T>>(key, 'json')
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data
    }
    return null
  } catch {
    return null
  }
}

/**
 * Store a value in KV with the given TTL.
 * Errors are silently caught so a cache write failure never breaks the request.
 */
export async function setCached<T>(
  key: string,
  data: T,
  ttlSeconds: number = 60,
): Promise<void> {
  try {
    const kv = getKv()
    if (!kv) return

    const entry: CacheEntry<T> = {
      data,
      expiresAt: Date.now() + ttlSeconds * 1000,
    }
    await kv.put(key, JSON.stringify(entry), {
      expirationTtl: ttlSeconds,
    })
  } catch (err) {
    console.error('[cache] write failed:', err)
  }
}

/**
 * Generate a consistent cache key from a path and optional query string.
 */
export function generateCacheKey(path: string, query?: string): string {
  return `page:${path}${query ? `?${query}` : ''}`
}

/**
 * ── Version-stamped invalidation ─────────────────────────────────────────
 * KV has no tag-based purge, so we stamp keys with a per-namespace version.
 * Writers call bumpCacheVersion('gigs') after a successful mutation; readers
 * include the version in their key, so stale entries become unreachable
 * instantly and expire naturally via their TTL.
 */
export async function getCacheVersion(namespace: string): Promise<string> {
  try {
    const kv = getKv()
    if (!kv) return '0'
    return (await kv.get(`ver:${namespace}`)) || '0'
  } catch {
    return '0'
  }
}

export async function bumpCacheVersion(namespace: string): Promise<void> {
  try {
    const kv = getKv()
    if (!kv) return
    await kv.put(`ver:${namespace}`, String(Date.now()))
  } catch (err) {
    console.error('[cache] version bump failed:', err)
  }
}

/** generateCacheKey + namespace version stamp, for invalidatable caches. */
export async function generateVersionedCacheKey(namespace: string, path: string, query?: string): Promise<string> {
  const ver = await getCacheVersion(namespace)
  return `page:v${ver}:${path}${query ? `?${query}` : ''}`
}
