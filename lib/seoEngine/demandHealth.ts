/**
 * Demand-feed health for the copy desk / engine chips.
 *
 * Live GSC (OAuth or service account) is the authority. The committed
 * public/seo-data/snapshot.json file is only the fallback, and must never
 * paint STALE over a working Search Console connection.
 */

import { getGscAccess } from '@/lib/gscAuth'
import { loadGscSnapshot, snapshotAgeDays, isSnapshotStale } from '@/lib/seoDataLoaders'

export type DemandHealth = {
  source: 'live' | 'snapshot' | 'none'
  mode?: 'oauth' | 'service_account' | null
  siteUrl?: string | null
  ageDays: number
  stale: boolean
  generatedAt: string | null
}

export async function resolveDemandHealth(): Promise<DemandHealth> {
  try {
    const access = await getGscAccess()
    if (access?.accessToken) {
      return {
        source: 'live',
        mode: access.mode,
        siteUrl: access.siteUrl,
        ageDays: 0,
        stale: false,
        generatedAt: new Date().toISOString(),
      }
    }
  } catch {
    /* fall through to file snapshot */
  }
  try {
    const snap = await loadGscSnapshot()
    const ageDays = snapshotAgeDays(snap)
    return {
      source: snap?.topQueries?.length ? 'snapshot' : 'none',
      mode: null,
      siteUrl: null,
      ageDays,
      stale: isSnapshotStale(snap, 14),
      generatedAt: snap.generatedAt ?? null,
    }
  } catch {
    return { source: 'none', mode: null, siteUrl: null, ageDays: -1, stale: true, generatedAt: null }
  }
}
