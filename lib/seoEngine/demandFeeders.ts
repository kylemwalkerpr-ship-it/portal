/**
 * Isolated demand feeders for the Master Engine.
 *
 * Every source is pulled independently. A timeout, 401, quota miss, or
 * thrown artefact never aborts the run — that feeder is skipped and the
 * others still score. Ubersuggest is first-class market demand; GSC/GA4
 * overlay owned-site rank and engagement when they match.
 */
import type { DemandSourceId, GscSignalInput } from './planner'

export interface FeederResult {
  source: DemandSourceId
  signals: GscSignalInput[]
  ok: boolean
  skipped: boolean
  reason?: string
  usedCache?: boolean
}

export async function safePull(
  source: DemandSourceId,
  fn: () => Promise<GscSignalInput[]>,
): Promise<FeederResult> {
  try {
    const signals = await fn()
    return { source, signals: Array.isArray(signals) ? signals : [], ok: true, skipped: false }
  } catch (err) {
    const reason = err instanceof Error ? err.message.slice(0, 180) : `${source} failed`
    console.warn(`[demand:${source}] skipped`, reason)
    return { source, signals: [], ok: false, skipped: true, reason }
  }
}

export function tagSource(signals: GscSignalInput[], source: DemandSourceId): GscSignalInput[] {
  return signals.map((s) => (s.source ? s : { ...s, source }))
}

export async function pullAllDemand(onProgress?: (phase: string, message: string, detail?: string) => void): Promise<{
  signals: GscSignalInput[]
  feeders: FeederResult[]
}> {
  const { pullGscSignals } = await import('./planner')
  const gsc = await safePull('gsc', async () => tagSource(await pullGscSignals(), 'gsc'))
  onProgress?.('signals', `GSC ${gsc.skipped ? 'skipped' : `${gsc.signals.length} signals`}`, gsc.reason)

  const ga4Mod = await import('./ga4')
  const ga4 = await safePull('ga4', async () => tagSource(await ga4Mod.pullGa4Signals(), 'ga4'))
  if (!ga4.reason && ga4Mod.lastGa4Pull?.reason) ga4.reason = ga4Mod.lastGa4Pull.reason
  onProgress?.('signals', `GA4 ${ga4.skipped ? 'skipped' : `${ga4.signals.length} signals`}`, ga4.reason)

  const uberMod = await import('./ubersuggest')
  const uber = await safePull('ubersuggest', () => uberMod.pullUbersuggestSignals({ full: true }))
  if (uberMod.lastUbersuggestPull?.usedCache) uber.usedCache = true
  if (uberMod.lastUbersuggestPull?.reason) uber.reason = uber.reason || uberMod.lastUbersuggestPull.reason
  const uberIntel = uberMod.lastUbersuggestPull
  onProgress?.(
    'signals',
    `Ubersuggest ${uber.skipped ? 'skipped' : `${uber.signals.length} signals`}${uber.usedCache ? ' (last-good cache)' : uberIntel?.calls ? ` (live · ${uberIntel.calls} MCP calls)` : ' (live)'}`,
    uber.reason,
  )

  const ads = await safePull('ads', async () => {
    const { loadKeywordDemandSignals } = await import('./keywordDemand')
    return tagSource(await loadKeywordDemandSignals(), 'ads')
  })
  onProgress?.('signals', `Ads ${ads.skipped ? 'skipped' : `${ads.signals.length} signals`}`, ads.reason)

  const { mergeDemandSignals } = await import('./keywordDemand')
  // Ubersuggest first — its volume is the opportunity surface. GSC/GA4 then
  // overlay live rank and engagement without erasing market size.
  const signals = mergeDemandSignals(uber.signals, gsc.signals, ga4.signals, ads.signals)
  return { signals, feeders: [uber, gsc, ga4, ads] }
}
