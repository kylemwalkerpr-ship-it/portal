/**
 * Demand-feed health for the copy desk / engine chips.
 *
 * Live GSC (OAuth or service account) is the authority. The committed
 * public/seo-data/snapshot.json file is the fallback, while configured
 * credentials without a probe are explicitly unverified.
 */

import { getGscAccess } from '@/lib/gscAuth'
import { getGscConfig } from '@/lib/gscConfig'
import { loadGscSnapshot, snapshotAgeDays, isSnapshotStale } from '@/lib/seoDataLoaders'

export type DemandHealth = {
  source: 'live' | 'snapshot' | 'configured' | 'none'
  mode?: 'oauth' | 'service_account' | null
  siteUrl?: string | null
  ageDays: number
  stale: boolean
  generatedAt: string | null
  /** False when the status path reports configured credentials without probing Google. */
  liveVerified?: boolean
}

export async function resolveDemandHealth(opts: { probeLive?: boolean } = {}): Promise<DemandHealth> {
  if (opts.probeLive !== false) {
    try {
      const access = await getGscAccess()
      if (access?.accessToken) {
        return {
          source: 'live',
          mode: access.mode,
          siteUrl: access.siteUrl,
          ageDays: 0,
          stale: false,
          liveVerified: true,
          generatedAt: new Date().toISOString(),
        }
      }
    } catch {
      /* fall through to file snapshot */
    }
  }

  let configured: DemandHealth | null = null
  if (opts.probeLive === false) {
    try {
      const config = await getGscConfig()
      const mode = config.refreshToken && config.clientId && config.clientSecret
        ? 'oauth'
        : config.serviceAccountKey
          ? 'service_account'
          : null
      if (mode) {
        configured = {
          source: 'configured',
          mode,
          siteUrl: config.siteUrl,
          ageDays: -1,
          stale: true,
          liveVerified: false,
          generatedAt: config.connectedAt ?? null,
        }
      }
    } catch {
      /* fall through to file snapshot */
    }
  }
  try {
    const snap = await loadGscSnapshot()
    const ageDays = snapshotAgeDays(snap)
    if (snap?.topQueries?.length) {
      return {
        source: 'snapshot',
        mode: null,
        siteUrl: null,
        ageDays,
        stale: isSnapshotStale(snap, 14),
        generatedAt: snap.generatedAt ?? null,
      }
    }
    return configured ?? { source: 'none', mode: null, siteUrl: null, ageDays: -1, stale: true, generatedAt: null, liveVerified: false }
  } catch {
    return configured ?? { source: 'none', mode: null, siteUrl: null, ageDays: -1, stale: true, generatedAt: null, liveVerified: false }
  }
}
