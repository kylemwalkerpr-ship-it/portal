import { matchMarketplaceIntent, type MarketplaceIntentMatch } from '@/lib/assistantMarketplaceIntent'
import { getPaymentSettingsForApi } from '@/lib/fiverr'

/**
 * Revenue-safe pricing authority for YQAA Messenger offers.
 *
 * The model never owns the price. It receives evidence assembled here and any
 * proposed offer is checked again here before it can be inserted into `offers`.
 *
 * User policy: a budget more than 15% below the calculated comparable mean is
 * outside the automatic offer corridor. In other words, 85% of the calculated
 * mean is the baseline floor before provider-specific / platform floors apply.
 */
export const MIN_REFERENCE_RATIO = 0.85
const MIN_EMPIRICAL_SAMPLE = 5
const MAX_COMPARABLE_GIGS = 240
const MAX_EMPIRICAL_ROWS = 500

const PAID_ORDER_STATUSES = [
  'created',
  'in_progress',
  'under_review',
  'revision_requested',
  'completed',
  'released',
]

type TierRow = {
  id?: string
  gig_id?: string
  tier?: string
  title?: string
  price?: number
  delivery_days?: number
  revisions?: number
  is_active?: boolean
}

type GigRow = {
  id: string
  title?: string
  category?: string | null
  subcategory?: string | null
  provider_id?: string
  provider_type?: 'attorney' | 'consultant' | string
  status?: string
  order_count?: number
  tiers?: TierRow[]
}

export type BudgetEvidence = {
  minCents: number | null
  maxCents: number
  currency: string
  sourceText: string
  messageId: string | null
  confidence: 'explicit' | 'reply-to-budget-question'
}

export type PriceStats = {
  count: number
  minCents: number
  meanCents: number
  medianCents: number
  p25Cents: number
  p75Cents: number
  p90Cents: number
  maxCents: number
}

export type PricingAuthority = {
  status: 'ready' | 'need_budget' | 'insufficient_scope' | 'budget_too_low' | 'insufficient_market_data'
  currency: string
  intent: MarketplaceIntentMatch | null
  budget: BudgetEvidence | null
  market: PriceStats | null
  provider: PriceStats | null
  empirical: PriceStats | null
  empiricalIncluded: boolean
  referenceMeanCents: number | null
  minimumAutoOfferCents: number | null
  evidenceHighCents: number | null
  providerGigIds: string[]
  providerRelevantGigIds: string[]
  comparableGigIds: string[]
  comparableTitles: string[]
  platformMinimumCents: number
  platformMaximumCents: number
  rationale: string[]
}

export type OfferGuardResult =
  | {
      ok: true
      priceCents: number
      reason: 'within_authority'
      // Optional on the success arm so callers can inspect a guard result
      // uniformly even when TypeScript does not narrow boolean discriminants
      // under this repo's non-strict compiler settings. They remain absent at
      // runtime, preserving the existing success payload shape.
      reply?: string
      needsProviderReview?: boolean
    }
  | {
      ok: false
      reason:
        | 'missing_budget'
        | 'insufficient_scope'
        | 'insufficient_market_data'
        | 'budget_too_low'
        | 'below_guarded_floor'
        | 'above_client_budget'
        | 'above_platform_limit'
        | 'above_evidence_requires_provider_review'
        | 'invalid_price'
      reply: string
      needsProviderReview?: boolean
    }

function money(cents: number | null | undefined, currency = 'usd') {
  if (!Number.isFinite(Number(cents))) return '—'
  const value = Number(cents) / 100
  const symbol = currency.toLowerCase() === 'usd' ? '$' : `${currency.toUpperCase()} `
  return `${symbol}${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

function clampInt(value: unknown) {
  const n = Number(value)
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0
}

function percentile(sorted: number[], p: number) {
  if (!sorted.length) return 0
  if (sorted.length === 1) return sorted[0]
  const index = (sorted.length - 1) * p
  const lo = Math.floor(index)
  const hi = Math.ceil(index)
  if (lo === hi) return sorted[lo]
  const weight = index - lo
  return Math.round(sorted[lo] * (1 - weight) + sorted[hi] * weight)
}

export function summarizePrices(values: number[]): PriceStats | null {
  const clean = values.map(clampInt).filter((n) => n > 0).sort((a, b) => a - b)
  if (!clean.length) return null
  const mean = Math.round(clean.reduce((sum, n) => sum + n, 0) / clean.length)
  return {
    count: clean.length,
    minCents: clean[0],
    meanCents: mean,
    medianCents: percentile(clean, 0.5),
    p25Cents: percentile(clean, 0.25),
    p75Cents: percentile(clean, 0.75),
    p90Cents: percentile(clean, 0.9),
    maxCents: clean[clean.length - 1],
  }
}

function parseNumeric(raw: string, suffix?: string) {
  const normalized = raw.replace(/,/g, '').trim()
  const n = Number(normalized)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n * (suffix?.toLowerCase() === 'k' ? 1000 : 1) * 100)
}

function extractMoneyValues(text: string): Array<{ cents: number; currency: string }> {
  const source = String(text || '')
  const out: Array<{ cents: number; currency: string }> = []
  const seen = new Set<string>()

  const push = (raw: string, suffix: string | undefined, currencyRaw: string | undefined) => {
    const cents = parseNumeric(raw, suffix)
    if (!cents) return
    const currency = String(currencyRaw || 'usd').toLowerCase() === 'cad' ? 'cad' : 'usd'
    const key = `${currency}:${cents}`
    if (seen.has(key)) return
    seen.add(key)
    out.push({ cents, currency })
  }

  const prefixed = /(?:\b(usd|cad)\b\s*|\$\s*)(\d[\d,]*(?:\.\d{1,2})?)\s*(k)?\b/gi
  let m: RegExpExecArray | null
  while ((m = prefixed.exec(source))) push(m[2], m[3], m[1] || 'usd')

  const suffixed = /\b(\d[\d,]*(?:\.\d{1,2})?)\s*(k)?\s*(usd|cad|dollars?)\b/gi
  while ((m = suffixed.exec(source))) push(m[1], m[2], /^cad$/i.test(m[3]) ? 'cad' : 'usd')

  // Allow a bare number only when it is explicitly attached to budget language.
  const budgetNumber = /\b(?:budget(?:\s+is|\s+of|\s+around|\s+about)?|spend|afford|pay|maximum|max|up\s+to)\s*(?:is|of|around|about|roughly|approximately|=|:)?\s*(\d[\d,]*(?:\.\d{1,2})?)\s*(k)?\b/i.exec(source)
  if (budgetNumber) push(budgetNumber[1], budgetNumber[2], 'usd')

  return out
}

function hasBudgetCue(text: string) {
  return /\b(budget|spend|afford|can\s+pay|could\s+pay|willing\s+to\s+pay|price\s+range|my\s+range|maximum|max\s+budget|up\s+to)\b/i.test(text)
}

function askedForBudget(text: string) {
  return /\b(budget|what\s+(?:range|amount).*comfortable|how\s+much.*(?:spend|budget)|rough\s+number.*currency)\b/i.test(text)
}

/**
 * Extract only client-stated budget evidence. Random fees or dollar amounts in
 * the thread do not become a budget unless budget language is present, or the
 * amount is a direct response to YQAA asking for budget.
 */
export function extractClientBudget(messages: any[], clientId: string): BudgetEvidence | null {
  const rows = Array.isArray(messages) ? messages : []
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i]
    if (row?.sender_id !== clientId) continue
    const text = String(row?.body || '').trim()
    if (!text) continue

    const previous = rows[i - 1]
    const directBudgetReply = Boolean(previous?.metadata?.ai_generated && askedForBudget(String(previous?.body || '')))
    if (!hasBudgetCue(text) && !directBudgetReply) continue

    const values = extractMoneyValues(text)
    if (!values.length) continue

    // Use a single currency per budget statement. If mixed, prefer the final
    // stated currency because conversational corrections commonly come last.
    const currency = values[values.length - 1].currency
    const sameCurrency = values.filter((v) => v.currency === currency).map((v) => v.cents).sort((a, b) => a - b)
    if (!sameCurrency.length) continue
    return {
      minCents: sameCurrency.length > 1 ? sameCurrency[0] : null,
      maxCents: sameCurrency[sameCurrency.length - 1],
      currency,
      sourceText: text.slice(0, 500),
      messageId: row?.id || null,
      confidence: hasBudgetCue(text) ? 'explicit' : 'reply-to-budget-question',
    }
  }
  return null
}

function activeTierPrices(gigs: GigRow[]) {
  const prices: number[] = []
  for (const gig of gigs || []) {
    for (const tier of gig?.tiers || []) {
      if (tier?.is_active === false) continue
      const price = clampInt(tier?.price)
      if (price > 0) prices.push(price)
    }
  }
  return prices
}

function relevantProviderGigs(gigs: GigRow[], intent: MarketplaceIntentMatch | null) {
  if (!intent) return []
  return (gigs || []).filter((gig) => {
    if (gig.category !== intent.categoryId) return false
    if (intent.subcategoryId && gig.subcategory) return gig.subcategory === intent.subcategoryId
    return true
  })
}

async function loadComparableGigs(db: any, intent: MarketplaceIntentMatch): Promise<GigRow[]> {
  const select = 'id,title,category,subcategory,provider_id,provider_type,status,order_count,tiers:gig_tiers(id,gig_id,tier,title,price,delivery_days,revisions,is_active)'

  const run = async (useSubcategory: boolean) => {
    let q = db
      .from('gigs')
      .select(select)
      .eq('status', 'active')
      .eq('category', intent.categoryId)
      .limit(MAX_COMPARABLE_GIGS)
    if (useSubcategory && intent.subcategoryId) q = q.eq('subcategory', intent.subcategoryId)
    const { data, error } = await q
    if (error) throw error
    return (data || []) as GigRow[]
  }

  if (intent.subcategoryId) {
    const exact = await run(true).catch(() => [])
    if (activeTierPrices(exact).length >= 3) return exact
  }
  return run(false).catch(() => [])
}

async function loadProviderGigs(db: any, providerId: string): Promise<GigRow[]> {
  const { data, error } = await db
    .from('gigs')
    .select('id,title,category,subcategory,provider_id,provider_type,status,order_count,tiers:gig_tiers(id,gig_id,tier,title,price,delivery_days,revisions,is_active)')
    .eq('provider_id', providerId)
    .in('status', ['active', 'paused'])
    .limit(50)
  if (error) return []
  return (data || []) as GigRow[]
}

async function loadEmpiricalSoldPrices(db: any, comparable: GigRow[]) {
  const gigIds = comparable.map((g) => g.id).filter(Boolean).slice(0, MAX_COMPARABLE_GIGS)
  if (!gigIds.length) return [] as number[]
  const providerType = new Map(comparable.map((g) => [g.id, g.provider_type]))

  try {
    const { data, error } = await db
      .from('orders')
      .select('id,gig_id,amount_paid,platform_fee_amount,status')
      .in('gig_id', gigIds)
      .in('status', PAID_ORDER_STATUSES)
      .gt('amount_paid', 0)
      .order('created_at', { ascending: false })
      .limit(MAX_EMPIRICAL_ROWS)
    if (error) throw error
    return (data || []).map((row: any) => {
      const paid = clampInt(row.amount_paid)
      const fee = clampInt(row.platform_fee_amount)
      return providerType.get(row.gig_id) === 'attorney' ? Math.max(0, paid - fee) : paid
    }).filter((n: number) => n > 0)
  } catch {
    // Older deployments may not expose platform_fee_amount. Empirical data is
    // optional; marketplace tiers remain the pricing source of truth.
    return [] as number[]
  }
}

function weightedReferenceMean(market: PriceStats, provider: PriceStats | null, empirical: PriceStats | null) {
  let weighted = market.meanCents * 0.7
  let weight = 0.7
  if (provider) {
    weighted += provider.meanCents * 0.3
    weight += 0.3
  }
  let mean = Math.round(weighted / weight)

  if (empirical && empirical.count >= MIN_EMPIRICAL_SAMPLE) {
    // Actual paid evidence matters, but cannot overwhelm the currently-live
    // marketplace because old transactions may represent outdated scope.
    mean = Math.round(mean * 0.8 + empirical.meanCents * 0.2)
  }
  return mean
}

export async function buildMessengerPricingAuthority(args: {
  db: any
  provider: any
  client: any
  messages: any[]
  latestClientText: string
}): Promise<PricingAuthority> {
  const settings = await getPaymentSettingsForApi()
  const currency = String(settings.primary_currency || 'usd').toLowerCase()
  const clientTexts = (args.messages || [])
    .filter((m: any) => m?.sender_id === args.client?.id && m?.body)
    .slice(-12)
    .map((m: any) => String(m.body))
  const intentQuery = [...clientTexts, String(args.latestClientText || '')].join('\n')
  const intent = matchMarketplaceIntent(intentQuery)
  const budget = extractClientBudget(args.messages || [], args.client?.id)
  const platformMinimumCents = clampInt(settings.minimum_offer_amount_cents)
  const platformMaximumCents = clampInt(settings.maximum_offer_amount_cents)

  const base: PricingAuthority = {
    status: 'insufficient_scope',
    currency,
    intent,
    budget,
    market: null,
    provider: null,
    empirical: null,
    empiricalIncluded: false,
    referenceMeanCents: null,
    minimumAutoOfferCents: null,
    evidenceHighCents: null,
    providerGigIds: [],
    providerRelevantGigIds: [],
    comparableGigIds: [],
    comparableTitles: [],
    platformMinimumCents,
    platformMaximumCents,
    rationale: [],
  }

  if (!intent) {
    base.rationale.push('No reliable Marketplace category/subcategory match yet; ask one concise scope question before pricing.')
    return base
  }

  const [comparable, providerGigs] = await Promise.all([
    loadComparableGigs(args.db, intent),
    loadProviderGigs(args.db, args.provider.id),
  ])
  const providerRelevant = relevantProviderGigs(providerGigs, intent)
  const market = summarizePrices(activeTierPrices(comparable))
  const providerStats = summarizePrices(activeTierPrices(providerRelevant))
  const empiricalValues = await loadEmpiricalSoldPrices(args.db, comparable)
  const empirical = summarizePrices(empiricalValues)

  base.comparableGigIds = comparable.map((g) => g.id)
  base.comparableTitles = comparable.slice(0, 12).map((g) => String(g.title || '')).filter(Boolean)
  base.providerGigIds = providerGigs.map((g) => g.id)
  base.providerRelevantGigIds = providerRelevant.map((g) => g.id)
  base.market = market
  base.provider = providerStats
  base.empirical = empirical
  base.empiricalIncluded = Boolean(empirical && empirical.count >= MIN_EMPIRICAL_SAMPLE)

  if (!market || market.count < 1) {
    base.status = 'insufficient_market_data'
    base.rationale.push('Matched Marketplace scope has no active tier prices; do not invent a quote.')
    return base
  }

  const referenceMeanCents = weightedReferenceMean(market, providerStats, empirical)
  // Revenue floor: 15% below reference mean at most, then respect the
  // provider's lowest live same-scope tier and platform minimum.
  const meanFloor = Math.ceil(referenceMeanCents * MIN_REFERENCE_RATIO)
  const providerFloor = providerStats?.minCents || 0
  const minimumAutoOfferCents = Math.max(meanFloor, providerFloor, platformMinimumCents)
  const evidenceHighCents = Math.max(
    market.p90Cents,
    market.maxCents,
    providerStats?.maxCents || 0,
    empirical && empirical.count >= MIN_EMPIRICAL_SAMPLE ? empirical.p90Cents : 0,
  )

  base.referenceMeanCents = referenceMeanCents
  base.minimumAutoOfferCents = minimumAutoOfferCents
  base.evidenceHighCents = evidenceHighCents
  base.rationale.push(
    `Marketplace ${intent.subcategoryName || intent.categoryName}: ${market.count} live tier prices; mean ${money(market.meanCents, currency)}, median ${money(market.medianCents, currency)}.`,
  )
  if (providerStats) {
    base.rationale.push(`This provider has ${providerStats.count} same-scope tier prices; range ${money(providerStats.minCents, currency)}–${money(providerStats.maxCents, currency)}.`)
  }
  if (base.empiricalIncluded && empirical) {
    base.rationale.push(`${empirical.count} non-refunded paid Marketplace orders are included as empirical evidence.`)
  } else {
    base.rationale.push('Paid-history sample is too small to influence the reference price; live Marketplace prices carry the calculation.')
  }
  base.rationale.push(`Automatic revenue floor is ${money(minimumAutoOfferCents, currency)} (15% below calculated mean at most, never below the provider same-scope floor).`)
  base.rationale.push('There is no statistical upper price cap; unusually high quotes must still be supported by live provider/market evidence or be confirmed by the provider.')

  if (!budget) {
    base.status = 'need_budget'
    return base
  }

  if (budget.currency !== currency) {
    base.status = 'need_budget'
    base.rationale.push(`Client stated ${budget.currency.toUpperCase()}, while offers are priced in ${currency.toUpperCase()}; ask them to confirm a ${currency.toUpperCase()} budget before quoting.`)
    return base
  }

  if (budget.maxCents < minimumAutoOfferCents) {
    base.status = 'budget_too_low'
    return base
  }

  base.status = 'ready'
  return base
}

export function renderPricingAuthority(pricing: PricingAuthority) {
  const lines = [
    '# YQAA PRICING AUTHORITY — SERVER-CALCULATED, NON-NEGOTIABLE',
    `Status: ${pricing.status}`,
    pricing.intent ? `Matched scope: ${pricing.intent.subcategoryName || pricing.intent.categoryName} (${pricing.intent.categoryId}${pricing.intent.subcategoryId ? `/${pricing.intent.subcategoryId}` : ''})` : 'Matched scope: not yet reliable',
    pricing.budget ? `Client-stated budget: ${pricing.budget.minCents ? `${money(pricing.budget.minCents, pricing.budget.currency)}–` : ''}${money(pricing.budget.maxCents, pricing.budget.currency)} ${pricing.budget.currency.toUpperCase()}` : 'Client-stated budget: NOT YET PROVIDED',
    pricing.referenceMeanCents ? `Calculated reference mean: ${money(pricing.referenceMeanCents, pricing.currency)} ${pricing.currency.toUpperCase()}` : null,
    pricing.market ? `Marketplace sample: n=${pricing.market.count}; mean=${money(pricing.market.meanCents, pricing.currency)}; median=${money(pricing.market.medianCents, pricing.currency)}; p25=${money(pricing.market.p25Cents, pricing.currency)}; p75=${money(pricing.market.p75Cents, pricing.currency)}; p90=${money(pricing.market.p90Cents, pricing.currency)}` : null,
    pricing.provider ? `Provider same-scope tiers: n=${pricing.provider.count}; range=${money(pricing.provider.minCents, pricing.currency)}–${money(pricing.provider.maxCents, pricing.currency)}; mean=${money(pricing.provider.meanCents, pricing.currency)}` : 'Provider same-scope tiers: none found',
    pricing.empiricalIncluded && pricing.empirical ? `Empirical paid sample: n=${pricing.empirical.count}; mean=${money(pricing.empirical.meanCents, pricing.currency)}; median=${money(pricing.empirical.medianCents, pricing.currency)}` : 'Empirical paid sample: insufficient to influence pricing',
    pricing.minimumAutoOfferCents ? `Minimum price YQAA may auto-send for current matched scope: ${money(pricing.minimumAutoOfferCents, pricing.currency)}` : null,
    pricing.evidenceHighCents ? `Highest current evidence point (not a hard price cap): ${money(pricing.evidenceHighCents, pricing.currency)}` : null,
    '',
    'MANDATORY PRICING BEHAVIOR:',
    '1. NEVER suggest a price or create an offer before the client has stated a budget estimate/range in the offer currency.',
    '2. The server validates every offer after your response. Never try to bypass the calculated floor, client budget, provider-gig ownership, or evidence checks.',
    '3. If status=need_budget, do not mention a proposed price. Ask one short, natural budget question.',
    '4. If status=budget_too_low, explain respectfully and briefly that the budget sits more than 15% below the guarded comparable mean / provider floor; offer to narrow scope or revisit budget.',
    '5. If status=ready, choose price based on actual scope and evidence. Do NOT simply consume a high budget. A higher budget is not permission to overquote.',
    '6. There is no statistical upper cap. However, a quote materially above live evidence must be supported by a provider-owned gig/value or will require human provider review before sending.',
    '7. Never reveal internal fee percentages, guard formulas, or seller revenue calculations unless the user specifically asks about platform pricing mechanics.',
    '',
    'Evidence notes:',
    ...pricing.rationale.map((x) => `- ${x}`),
    '',
    pricing.providerRelevantGigIds.length ? `Provider-owned relevant gig IDs allowed for attachment: ${pricing.providerRelevantGigIds.join(', ')}` : 'Provider-owned relevant gig IDs allowed for attachment: none',
  ].filter((x): x is string => typeof x === 'string')
  return lines.join('\n')
}

function budgetQuestion(currency: string) {
  return `Before I price this, what budget range are you working with in ${currency.toUpperCase()}? A rough number is perfectly fine — I’ll compare it with this provider’s live gigs and similar Marketplace services so the offer stays fair. 🙂`
}

function lowBudgetReply(pricing: PricingAuthority) {
  const budget = pricing.budget?.maxCents || 0
  const mean = pricing.referenceMeanCents || 0
  const floor = pricing.minimumAutoOfferCents || 0
  return `Thanks — that gives me something concrete to work with. For this scope, comparable YouSafe Marketplace pricing centers around **${money(mean, pricing.currency)}**, and the lowest revenue-safe offer I can send automatically is about **${money(floor, pricing.currency)}**. Your **${money(budget, pricing.currency)}** budget is below that range, so I can’t responsibly send an offer at that amount. We can either narrow the scope or adjust the budget — whichever works better for you.`
}

export function guardMessengerOffer(args: {
  pricing: PricingAuthority
  proposedPriceUsd?: number
  proposedPrice?: number
  gigId?: string | null
}): OfferGuardResult {
  const p = args.pricing
  if (p.status === 'insufficient_scope') {
    return { ok: false, reason: 'insufficient_scope', reply: 'I can price this once I understand the exact service you need. What would you like the provider to handle for you?' }
  }
  if (p.status === 'insufficient_market_data') {
    return { ok: false, reason: 'insufficient_market_data', reply: 'I don’t have enough verified Marketplace pricing for this exact scope to send a safe quote yet. I’ll keep the scope here and have the provider confirm the price rather than guessing.', needsProviderReview: true }
  }
  if (p.status === 'need_budget' || !p.budget) {
    return { ok: false, reason: 'missing_budget', reply: budgetQuestion(p.currency) }
  }
  if (p.status === 'budget_too_low') {
    return { ok: false, reason: 'budget_too_low', reply: lowBudgetReply(p) }
  }

  const raw = args.proposedPriceUsd ?? args.proposedPrice
  const priceCents = Number.isFinite(Number(raw)) ? Math.round(Number(raw) * 100) : 0
  if (priceCents <= 0) {
    return { ok: false, reason: 'invalid_price', reply: 'I have the scope and budget, but the offer price did not validate cleanly. I’ll recalculate it rather than send a questionable quote.' }
  }

  const floor = p.minimumAutoOfferCents || p.platformMinimumCents
  if (priceCents < floor) {
    return {
      ok: false,
      reason: 'below_guarded_floor',
      reply: `I can’t send that figure because it would undercut the current evidence for this scope. The lowest guarded offer is about **${money(floor, p.currency)}**. If that is above your comfort range, we can narrow what’s included instead.`,
    }
  }
  if (priceCents > p.budget.maxCents) {
    return {
      ok: false,
      reason: 'above_client_budget',
      reply: `The scope points to a price above the **${money(p.budget.maxCents, p.currency)}** budget you gave me. I won’t send an offer above your stated budget without checking with you first. Is your budget flexible, or should we reduce the scope?`,
    }
  }
  if (p.platformMaximumCents > 0 && priceCents > p.platformMaximumCents) {
    return {
      ok: false,
      reason: 'above_platform_limit',
      reply: 'This looks like a high-value custom scope. I’m keeping the details here, but the provider needs to confirm the commercial terms before an offer at that level can be sent.',
      needsProviderReview: true,
    }
  }

  const attachedToRelevantProviderGig = Boolean(args.gigId && p.providerRelevantGigIds.includes(args.gigId))
  const materiallyAboveEvidence = Boolean(p.evidenceHighCents && priceCents > Math.round(p.evidenceHighCents * 1.15))
  if (materiallyAboveEvidence && !attachedToRelevantProviderGig) {
    return {
      ok: false,
      reason: 'above_evidence_requires_provider_review',
      reply: 'Your scope may justify a premium custom quote, but it sits above the current live Marketplace evidence I can verify automatically. I’ll keep the details and have the provider confirm that higher figure rather than risk overquoting you.',
      needsProviderReview: true,
    }
  }

  return { ok: true, priceCents, reason: 'within_authority' }
}

export function pricingAuditSnapshot(pricing: PricingAuthority) {
  return {
    status: pricing.status,
    currency: pricing.currency,
    intent: pricing.intent ? {
      category_id: pricing.intent.categoryId,
      subcategory_id: pricing.intent.subcategoryId,
      score: pricing.intent.score,
    } : null,
    budget: pricing.budget ? {
      min_cents: pricing.budget.minCents,
      max_cents: pricing.budget.maxCents,
      currency: pricing.budget.currency,
      confidence: pricing.budget.confidence,
    } : null,
    reference_mean_cents: pricing.referenceMeanCents,
    guarded_floor_cents: pricing.minimumAutoOfferCents,
    market: pricing.market,
    provider: pricing.provider,
    empirical: pricing.empiricalIncluded ? pricing.empirical : null,
    evidence_high_cents: pricing.evidenceHighCents,
    comparable_gig_count: pricing.comparableGigIds.length,
    provider_relevant_gig_ids: pricing.providerRelevantGigIds,
  }
}
