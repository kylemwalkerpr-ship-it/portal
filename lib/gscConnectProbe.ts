/**
 * GSC connect probe — can an access token be minted right now?
 *
 * Lives in its own module so the connect route stays a pure Next.js route
 * (route modules may only export HTTP handlers + a few known options) and so
 * the probe's 10s cache can be unit-tested without network calls.
 */
import { getGscAccess } from '@/lib/gscAuth'

export interface GscProbeResult {
  live: boolean
  error: string | null
}

// Short TTL keeps the Systems card / composer polls cheap — a mint is a
// network call, so we don't want one per 2–15s poll.
let probeCache: { at: number; live: boolean; error: string | null } | null = null

export async function probeLiveGsc(): Promise<GscProbeResult> {
  if (probeCache && Date.now() - probeCache.at < 10_000) {
    return { live: probeCache.live, error: probeCache.error }
  }
  let live = false
  let error: string | null = null
  try {
    const access = await getGscAccess()
    if (access?.accessToken && access.siteUrl) live = true
    else {
      error = access?.accessToken
        ? 'Access token minted but no site URL configured'
        : 'No credentials available to mint an access token'
    }
  } catch (e) {
    error = e instanceof Error ? e.message : 'GSC token probe failed'
  }
  probeCache = { at: Date.now(), live, error }
  return { live, error }
}

/**
 * Test hook — clears the module-level probe cache so unit tests start clean
 * (the cache has a 10s TTL; tests run faster than that).
 */
export function __resetGscProbeCache(): void {
  probeCache = null
}
