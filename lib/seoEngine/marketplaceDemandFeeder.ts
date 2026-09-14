/**
 * First-party Marketplace demand feeder.
 * Search counts are submitted-query demand, not monthly keyword-research volume.
 * A zero-row conversion stream is coverage-unknown, not measured-zero revenue.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { GscSignalInput } from './planner'
import type { FeederResult } from './demandFeeders'

export type MarketplaceDemandRow = {
  normalized_query: string
  search_count?: number | null
  unique_sessions?: number | null
  click_count?: number | null
  conversion_count?: number | null
  measured_search_count?: number | null
  /**
   * Explicit coverage supplied by a trusted server-side instrumentation probe
   * for the same observation window. Historical conversion rows do NOT set it.
   */
  conversion_instrumented?: boolean | null
}

export function marketplaceRowToSignal(row: MarketplaceDemandRow): GscSignalInput {
  const conversionsInstrumented = row.conversion_instrumented === true
  return {
    term: String(row.normalized_query || '').trim(),
    clicks: Number(row.click_count || 0),
    impressions: 0,
    volume: undefined,
    source: 'marketplace',
    marketplaceSearchCount: Number(row.search_count || 0),
    marketplaceUniqueSessions: row.unique_sessions == null ? null : Number(row.unique_sessions),
    marketplaceConversionCount: conversionsInstrumented
      ? Number(row.conversion_count || 0)
      : null,
    conversionCoverage: conversionsInstrumented ? 'instrumented' : 'unknown',
  }
}

export function conversionCoverage(row: MarketplaceDemandRow): {
  conversions: number | null
  coverage: 'instrumented' | 'unknown'
} {
  if (row.conversion_instrumented !== true) {
    return { conversions: null, coverage: 'unknown' }
  }
  return { conversions: Number(row.conversion_count || 0), coverage: 'instrumented' }
}

export async function defaultLoadMarketplaceIntelligence(db?: SupabaseClient): Promise<{
  rows: MarketplaceDemandRow[]
  conversionInstrumented: boolean
}> {
  const client = db || createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('marketplace feeder missing service-role supabase credentials')
  }
  const { data, error } = await client
    .from('marketplace_search_intelligence')
    .select('normalized_query,search_count,unique_sessions,click_count,conversion_count')
    .order('search_count', { ascending: false })
    .limit(500)
  if (error) throw new Error(error.message)

  // The aggregate view contains search/click/conversion observations, but it
  // does not prove that the trusted conversion emitter covered the same
  // window for every query. In particular, "some conversion happened at some
  // time" is not instrumentation coverage. Default to unknown until a trusted
  // server-side coverage probe explicitly supplies the fact.
  return {
    rows: Array.isArray(data) ? (data as MarketplaceDemandRow[]) : [],
    conversionInstrumented: false,
  }
}

export async function pullMarketplaceDemandSignals(opts?: {
  load?: () => Promise<MarketplaceDemandRow[]>
  loadBundle?: () => Promise<{ rows: MarketplaceDemandRow[]; conversionInstrumented: boolean }>
}): Promise<GscSignalInput[]> {
  const bundle = opts?.loadBundle
    ? await opts.loadBundle()
    : opts?.load
      ? { rows: await opts.load(), conversionInstrumented: false }
      : await defaultLoadMarketplaceIntelligence()
  return bundle.rows
    .map((row) => marketplaceRowToSignal({
      ...row,
      conversion_instrumented: bundle.conversionInstrumented,
    }))
    .filter((signal) => signal.term.length >= 2)
}

export async function pullMarketplaceFeeder(opts?: {
  load?: () => Promise<MarketplaceDemandRow[]>
  loadBundle?: () => Promise<{ rows: MarketplaceDemandRow[]; conversionInstrumented: boolean }>
}): Promise<FeederResult> {
  try {
    const signals = await pullMarketplaceDemandSignals(opts)
    return {
      source: 'marketplace',
      signals,
      ok: true,
      skipped: false,
      reason: signals.length
        ? undefined
        : 'marketplace_search_intelligence returned zero rows — coverage unknown, not zero demand',
    }
  } catch (err) {
    return {
      source: 'marketplace',
      signals: [],
      ok: false,
      skipped: true,
      reason: err instanceof Error ? err.message.slice(0, 180) : 'marketplace feeder failed',
    }
  }
}
