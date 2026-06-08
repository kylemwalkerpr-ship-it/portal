/**
 * Defensive CPU guard for Cloudflare Workers.
 *
 * Wraps expensive operations with KV caching and execution-time monitoring.
 * The Workers Free plan has a 10ms CPU time limit per request — values above
 * 8ms are logged as warnings so you can catch issues before they cause 1102
 * errors.
 *
 * Usage:
 *   const data = await withCacheGuard('featured-gigs', fetchGigs, 300)
 */

import { getCached, setCached } from './cache'

const WARN_THRESHOLD_MS = 8

/**
 * Execute `fetcher` and cache the result in KV for `ttlSeconds`.
 *
 * - Cache hit  → returns immediately, zero CPU cost.
 * - Cache miss → runs `fetcher`, measures duration, warns if slow, caches result.
 *
 * @param key    KV cache key (namespace prefix is added automatically).
 * @param fetcher  Async function that produces the value to cache.
 * @param ttlSeconds  How long to cache the result (default 5 minutes).
 */
export async function withCacheGuard<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds: number = 300,
): Promise<T> {
  // 1. Check KV cache first
  const cached = await getCached<T>(key, ttlSeconds)
  if (cached !== null) return cached

  // 2. Fetch with timing
  const start = Date.now()
  const data = await fetcher()
  const duration = Date.now() - start

  // 3. Warn if approaching the 10ms Free Plan limit
  if (duration > WARN_THRESHOLD_MS) {
    console.warn(
      `[CPU WARNING] ${key} took ${duration}ms (threshold: ${WARN_THRESHOLD_MS}ms)`,
    )
  }

  // 4. Cache result (fire-and-forget; never blocks the response)
  setCached(key, data, ttlSeconds).catch(() => {})

  return data
}
