/**
 * First-party Marketplace demand feeder.
 * Search counts are submitted-query demand, not GSC impressions.
 * A zero-row conversion stream is coverage-unknown, not measured-zero revenue.
 */

import type { DemandSourceId, GscSignalInput } from './planner'
import type { FeederResult } from './demandFeeders'

export function marketplaceRowToSignal(row: {
  normalized_query: string
  search_count?: number | null
  unique_sessions?: number | null
  click_count?: number | null
  conversion_count?: number | null
  measured_search_count?: number | null
}): GscSignalInput {
  return {
    term: String(row.normalized_query || '').trim(),
    clicks: Number(row.click_count || 0),
    impressions: 0,
    volume: Number(row.search_count || 0),
    source: 'marketplace' as DemandSourceId,
  }
}

export function conversionCoverage(row: { conversion_count?: number | null; measured_search_count?: number | null }): {
  conversions: number
  coverage: 'observed' | 'unknown'
} {
  const conversions = Number(row.conversion_count || 0)
  const measured = row.measured_search_count
  if (measured == null) return { conversions, coverage: 'unknown' }
  return { conversions, coverage: 'observed' }
}

export async function pullMarketplaceDemandSignals(opts?: {
  load?: () => Promise<Array<Record<string, unknown>>>
}): Promise<GscSignalInput[]> {
  const rows = opts?.load ? await opts.load() : []
  return rows
    .map((row) => marketplaceRowToSignal({
      normalized_query: String(row.normalized_query || ''),
      search_count: Number(row.search_count || 0),
      click_count: Number(row.click_count || 0),
      conversion_count: row.conversion_count == null ? null : Number(row.conversion_count),
      measured_search_count: row.measured_search_count == null ? null : Number(row.measured_search_count),
    }))
    .filter((signal) => signal.term.length >= 2)
}

export async function pullMarketplaceFeeder(opts?: {
  load?: () => Promise<Array<Record<string, unknown>>>
}): Promise<FeederResult> {
  try {
    const signals = await pullMarketplaceDemandSignals(opts)
    if (!opts?.load && signals.length === 0) {
      return {
        source: 'marketplace' as DemandSourceId,
        signals: [],
        ok: true,
        skipped: true,
        reason: 'marketplace_search_intelligence not queried in this process — zero rows is unknown coverage, not zero demand',
      }
    }
    return {
      source: 'marketplace' as DemandSourceId,
      signals,
      ok: true,
      skipped: false,
    }
  } catch (err) {
    return {
      source: 'marketplace' as DemandSourceId,
      signals: [],
      ok: false,
      skipped: true,
      reason: err instanceof Error ? err.message.slice(0, 180) : 'marketplace feeder failed',
    }
  }
}
