/**
 * lib/seoEngine/marketplaceValue.ts
 *
 * Marketplace value lookup for the conversion economy (Phase 2a).
 *
 * Canonical source of live supply: the marketplace `public.gigs` table
 * (supabase/fiverr_gig_system.sql) joined to `public.gig_tiers` for prices
 * (cents, `is_active`), with `jurisdiction` (supabase/marketplace_gig_jurisdiction.sql)
 * as the country dimension. Gig.category / subcategory map onto the ontology's
 * per-stage `services` arrays (lib/categories.ts defines the category ids).
 *
 * IMPORTANT — no import from planner.ts or rankingModel.ts (cycle risk).
 * May import ontology and (pure) scoring.ts.
 *
 * Live reads are best-effort: any DB/network failure returns [] / the staged
 * default table, so the planner NEVER fails because the marketplace read blew
 * up. Results are cached in-module for 5 minutes.
 *
 * STAGE_VALUE_DEFAULTS — stage/country-coded USD consult price ranges used
 * when there is no live supply (or the read fails). Derived from real-world
 * immigration consult / brief pricing for these services (F-1/student-route
 * doc-prep, H-1B / skilled-worker packs, PR/citizenship filing briefs, family
 * sponsorship, settlement help) — the numbers cited by the product brief:
 *
 *   visa consult              $150–350      (attorney/migration-agent consult)
 *   citizenship / family      $200–500      (filing + evidence briefs)
 *   settlement                $100–300      (bank/health/credential guidance)
 *   schools / work            $100–250      (study-permit & work-permit prep)
 *   intent                    $0            (pure informational, no service)
 *
 * These are FALLBACKS ONLY. When `hasLiveSupply` is true the returned range
 * is the 25th–75th percentile of real gig entry prices (gig_tiers cents → USD).
 */

import { createSupabaseAdminClient } from '@/lib/supabase'
import { getStage } from './ontology'
import { CATEGORIES } from '@/lib/categories'

export { isFunnelStage } from './scoring'

export interface MarketplaceService {
  id: string
  title: string
  price?: number | null
  category?: string | null
  country?: string | null
}

export interface MarketplaceValueResult {
  /** 25th-percentile entry price USD (live supply) or defaults table min. */
  priceMin: number
  /** 75th-percentile entry price USD (live supply) or defaults table max. */
  priceMax: number
  /** Number of active marketplace listings matched to the cell (0 = none). */
  serviceCount: number
  /** True when real, priced marketplace supply exists for this cell. */
  hasLiveSupply: boolean
}

const COUNTRY_CODES: Record<string, string> = { US: 'US', UK: 'UK', CA: 'CA', AU: 'AU' }

/** Country codes the marketplace `gigs.jurisdiction` column actually supports. */
const JURISDICTION_CODES = new Set(['us', 'uk', 'ca'])

/**
 * Stage/country → USD consult price range (fallback when no live supply).
 * Country keys are uppercase ontology codes; stage keys are ontology stage
 * keys. `intent` is 0/0 — informational only, nothing purchasable.
 *
 * Ranges (see module doc for the derivation):
 *   visa 150–350 · citizenship/family 200–500 · settlement 100–300 ·
 *   schools/work 100–250 · relatives 150–400 · intent 0.
 */
export const STAGE_VALUE_DEFAULTS: Record<string, Record<string, { min: number; max: number }>> = {
  US: {
    intent: { min: 0, max: 0 },
    schools: { min: 100, max: 250 },
    work: { min: 100, max: 250 },
    housing: { min: 100, max: 300 },
    visa: { min: 200, max: 350 },
    settlement: { min: 100, max: 300 },
    citizenship: { min: 250, max: 500 },
    family: { min: 250, max: 500 },
    relatives: { min: 200, max: 400 },
  },
  UK: {
    intent: { min: 0, max: 0 },
    schools: { min: 100, max: 200 },
    work: { min: 100, max: 200 },
    housing: { min: 100, max: 250 },
    visa: { min: 150, max: 300 },
    settlement: { min: 100, max: 250 },
    citizenship: { min: 200, max: 450 },
    family: { min: 200, max: 450 },
    relatives: { min: 150, max: 350 },
  },
  CA: {
    intent: { min: 0, max: 0 },
    schools: { min: 100, max: 250 },
    work: { min: 100, max: 250 },
    housing: { min: 100, max: 300 },
    visa: { min: 150, max: 350 },
    settlement: { min: 100, max: 300 },
    citizenship: { min: 200, max: 500 },
    family: { min: 200, max: 500 },
    relatives: { min: 150, max: 400 },
  },
  AU: {
    intent: { min: 0, max: 0 },
    schools: { min: 100, max: 200 },
    work: { min: 100, max: 200 },
    housing: { min: 100, max: 250 },
    visa: { min: 150, max: 320 },
    settlement: { min: 100, max: 250 },
    citizenship: { min: 200, max: 450 },
    family: { min: 200, max: 450 },
    relatives: { min: 150, max: 350 },
  },
}

function normalizeCountry(country: string): string {
  return COUNTRY_CODES[String(country || '').toUpperCase()] || 'US'
}

// ---------------------------------------------------------------------------
// Category resolution — gigs.category is free text; the marketplace admin
// uses the lib/categories.ts ids (hubs + subcategories). Ontology services
// arrays contain a mix of hub ids ('immigration', 'settlement', 'career',
// 'credentials', 'business', 'legal') and subcategory ids ('study-permits',
// 'legal-consultation', …). We expand a stage's services to: verbatim ids,
// hub ids of subcategory services, and every subcategory of hub services.
// Best-effort — unknown/legacy category strings simply won't match, which
// only falls back to defaults for that cell.
// ---------------------------------------------------------------------------

let hubOf: Record<string, string> | null = null
let subsOf: Record<string, string[]> | null = null

function buildCategoryIndex(): void {
  if (hubOf && subsOf) return
  hubOf = {}
  subsOf = {}
  for (const c of CATEGORIES) {
    subsOf[c.id] = (subsOf[c.id] || []).concat(c.subcategories.map((s) => s.id))
    for (const sub of c.subcategories) hubOf![sub.id] = c.id
  }
}

function serviceCategoryIdsFor(stage: string): string[] | null {
  const def = getStage(stage)
  if (!def) return null
  buildCategoryIndex()
  const out = new Set<string>()
  for (const service of def.services) {
    out.add(service)
    const hub = hubOf![service]
    if (hub) {
      out.add(hub)
      for (const sib of subsOf![hub] || []) out.add(sib)
    }
    for (const sub of subsOf![service] || []) out.add(sub)
  }
  return [...out]
}

/**
 * Live (best-effort) read of active marketplace gigs, optionally filtered by
 * lifecycle stage (via the ontology services → category expansion above) and
 * country (via gigs.jurisdiction; note the DB constraint only covers
 * us/uk/ca, so AU supply is not resolvable via jurisdiction yet and falls
 * back to defaults — see gov migration `marketplace_gig_jurisdiction.sql`).
 * Entry price = lowest ACTIVE tier price (cents → USD). Returns [] on any
 * failure — never throws.
 */
export async function loadMarketplaceServices(stage?: string, country?: string): Promise<MarketplaceService[]> {
  try {
    const supabase = createSupabaseAdminClient()
    const c = country ? normalizeCountry(country) : null
    if (c && !JURISDICTION_CODES.has(c.toLowerCase())) return [] // AU: no jurisdiction rows yet
    let query = supabase
      .from('gigs')
      .select('id, title, category, jurisdiction')
      .eq('status', 'active')
    if (c) query = query.eq('jurisdiction', c.toLowerCase())
    const categoryIds = stage ? serviceCategoryIdsFor(stage) : null
    if (categoryIds?.length) query = query.in('category', categoryIds)
    const { data } = await query.limit(500)
    const gigs = ((data as Array<Record<string, unknown>> | null) || []).map((g) => ({
      id: String(g.id || ''),
      title: String(g.title || ''),
      category: g.category != null ? String(g.category) : null,
      jurisdiction: g.jurisdiction != null ? String(g.jurisdiction) : null,
    }))
    if (!gigs.length) return []

    const ids = gigs.map((g) => g.id)
    const { data: tiers } = await supabase
      .from('gig_tiers')
      .select('gig_id, price')
      .eq('is_active', true)
      .in('gig_id', ids)

    const entryPrice = new Map<string, number>()
    for (const t of ((tiers as Array<Record<string, unknown>> | null) || []) as Array<{ gig_id: string; price: number }>) {
      const priceUsd = Math.max(0, Number(t.price) || 0) / 100
      const prev = entryPrice.get(t.gig_id)
      if (prev === undefined || priceUsd < prev) entryPrice.set(t.gig_id, priceUsd)
    }

    return gigs.map((g) => ({
      id: g.id,
      title: g.title,
      price: entryPrice.get(g.id) ?? null,
      category: g.category,
      country: g.jurisdiction,
    }))
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Per-cell value resolution with a 5-minute in-module cache.
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 5 * 60_000
const valueCache = new Map<string, { expires: number; value: MarketplaceValueResult }>()

/** Test/ops utility — clears the 5-minute marketplace value cache. */
export function resetMarketplaceValueCache(): void {
  valueCache.clear()
}

function defaultsResult(stage: string, country: string): MarketplaceValueResult {
  const c = normalizeCountry(country)
  const range = STAGE_VALUE_DEFAULTS[c]?.[String(stage || '')] || { min: 0, max: 0 }
  return { priceMin: range.min, priceMax: range.max, serviceCount: 0, hasLiveSupply: false }
}

/**
 * Value of the marketplace service attached to a (stage, country) cell.
 * Uses live prices (25th–75th percentile of gig entry prices) when priced
 * supply exists; otherwise the STAGE_VALUE_DEFAULTS ranges with
 * serviceCount 0 / hasLiveSupply false. Cached in-module for 5 minutes.
 */
export async function marketplaceValue(stage: string, country: string): Promise<MarketplaceValueResult> {
  const c = normalizeCountry(country)
  const key = `${String(stage || '')}|${c}`
  const hit = valueCache.get(key)
  if (hit && Date.now() < hit.expires) return hit.value

  let result: MarketplaceValueResult | null = null
  try {
    const services = await loadMarketplaceServices(stage, c)
    const prices = services
      .map((s) => s.price)
      .filter((p): p is number => typeof p === 'number' && p > 0)
      .sort((a, b) => a - b)
    if (services.length && prices.length) {
      // Median-ish bounds: 25th–75th percentile of entry prices keeps one
      // outlier gig from skewing the whole cell range.
      const p25 = prices[Math.floor((prices.length - 1) * 0.25)]
      const p75 = prices[Math.floor((prices.length - 1) * 0.75)]
      result = { priceMin: p25, priceMax: p75, serviceCount: services.length, hasLiveSupply: true }
    }
  } catch {
    // fall through to defaults — planner must never fail on marketplace reads
  }

  if (!result) result = defaultsResult(stage, c)
  valueCache.set(key, { expires: Date.now() + CACHE_TTL_MS, value: result })
  return result
}

/** Default-implied check: does this stage list a purchasable service? */
export function stageHasPurchasableService(stage: string, country: string): boolean {
  const c = normalizeCountry(country)
  const range = STAGE_VALUE_DEFAULTS[c]?.[String(stage || '')]
  if (!range) return false
  return range.max > 0
}