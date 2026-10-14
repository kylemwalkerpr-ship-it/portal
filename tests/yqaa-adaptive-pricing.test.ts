/**
 * YQAA adaptive pricing / negotiation regression pack.
 *
 * Fixtures come from PRICING-ADAPTIVE.md §5 (F1–F5, N1–N7, M1–M2, L1, J1, P1)
 * and §7.9 (W1–W6). They are generic: every fixture seeds its own provider, gig,
 * tiers and thread, and no assertion depends on a specific provider, client or
 * practice area.
 *
 * These tests run the REAL modules with a tiny in-memory DB stub (no live
 * Supabase, no network) so they also run outside Jest (see the run harness).
 */
import {
  buildAdaptivePricingDecision,
  loadProviderGigsForScope,
  classifyCounter,
  downscopeOptions,
  eligibleActions,
  estimateWorkload,
  extractAgencySignal,
  extractComplexitySignal,
  extractNegotiationSignal,
  extractScopeSignal,
  extractUrgencySignal,
  finalizeNumbers,
  priceFromWorkload,
  publicChatPricingPolicy,
  renderNegotiationAuthority,
  resolveFlexPolicy,
  resolveGigForScope,
  quoteScope,
  explainWorkloadChange,
  buildScopeSignal,
  type AdaptivePricingDecision,
  type FlexPolicy,
  type GigForScope,
  type ScopeSignal,
} from '@/lib/yqaaAdaptivePricing'
import { leaksCompanionPricingLanguage, safeApprovedPriceTemplate } from '@/lib/yqaaCompanionPolish'
import { lowBudgetEscalationReply, lowBudgetReply, type PricingAuthority } from '@/lib/messengerPricingAuthority'
import { companionJevPayload, requestCompanionJev, requestJevAdvisory } from '@/lib/jevAdvisory'
import { AUTO_ACCEPT_PCT, FLEX_PCT, APPROVAL_BAND_PCT, MIN_EFFECTIVE_HOURLY_RATE_CENTS, ROUND_TO_CENTS } from '@/lib/yqaaPricingConfig'

// ── fixtures ────────────────────────────────────────────────────────────────

const CLIENT = 'client-1'
const PROVIDER = 'provider-1'

function authority(overrides: Partial<PricingAuthority> = {}): PricingAuthority {
  return {
    status: 'ready',
    currency: 'usd',
    intent: {
      categoryId: 'legal-services',
      categoryName: 'Legal Services',
      subcategoryId: 'immigration',
      subcategoryName: 'Immigration',
      url: '',
      score: 20,
      confidence: 'high',
    } as any,
    budget: null,
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
    platformMinimumCents: 100,
    platformMaximumCents: 500_000,
    rationale: [],
    ...overrides,
  }
}

const SETTINGS = {
  primary_currency: 'usd',
  minimum_offer_amount_cents: 100,
  maximum_offer_amount_cents: 500_000,
}

function tierRow(overrides: Record<string, any> = {}) {
  return {
    id: 'tier-1',
    gig_id: 'gig-1',
    tier: 'basic',
    title: 'Basic package',
    description: null,
    price: 10_000,
    delivery_days: 3,
    revisions: 1,
    is_active: true,
    features: [],
    scope_depth: null,
    scope_units: null,
    ...overrides,
  }
}

function gigRow(overrides: Record<string, any> = {}) {
  return {
    id: 'gig-1',
    title: 'Immigration consultation',
    category: 'legal-services',
    subcategory: 'immigration',
    provider_id: PROVIDER,
    provider_type: 'attorney',
    status: 'active',
    order_count: 0,
    negotiation_enabled: null,
    negotiation_flex_pct: null,
    min_floor_cents: null,
    unit_pricing: null,
    hourly_rate_cents: null,
    tiers: [tierRow()],
    ...overrides,
  }
}

/** Minimal chainable DB stub: only the projections the adaptive layer loads. */
function makeDb(config: { gigs?: any[]; preference?: any; missingAdaptiveColumns?: boolean } = {}) {
  return {
    from(table: string) {
      const state: { select: string } = { select: '' }
      const rows = () => {
        if (table !== 'gigs') return { data: [], error: null }
        if (config.missingAdaptiveColumns && state.select.includes('negotiation_enabled')) {
          return { data: null, error: { message: 'column gigs.negotiation_enabled does not exist' } }
        }
        return { data: config.gigs || [], error: null }
      }
      const single = () => {
        if (table !== 'provider_pricing_preferences') return { data: null, error: null }
        if (config.preference === 'missing-table') {
          return { data: null, error: { message: 'relation "provider_pricing_preferences" does not exist' } }
        }
        return { data: config.preference ?? null, error: null }
      }
      const builder: any = {
        select(columns: string) { state.select = String(columns); return builder },
        eq() { return builder },
        in() { return builder },
        limit() { return builder },
        order() { return builder },
        maybeSingle: async () => single(),
        then: (resolve: any, reject: any) => Promise.resolve(rows()).then(resolve, reject),
      }
      return builder
    },
  }
}

function clientMessage(id: string, body: string, at = '2026-10-05T12:00:00.000Z') {
  return { id, sender_id: CLIENT, body, created_at: at, metadata: {} }
}

function yqaaMessage(id: string, body: string, at = '2026-10-05T12:05:00.000Z') {
  return { id, sender_id: PROVIDER, body, created_at: at, metadata: { ai_generated: true, ai_assistant: true } }
}

async function decide(args: {
  messages: any[]
  gigs?: any[]
  preference?: any
  pricing?: Partial<PricingAuthority>
  memory?: any
  channel?: 'dm' | 'public'
  missingAdaptiveColumns?: boolean
}): Promise<AdaptivePricingDecision> {
  const latest = [...args.messages].reverse().find((row) => row?.sender_id === CLIENT)?.body || ''
  const pricing = authority(args.pricing)
  return buildAdaptivePricingDecision({
    db: makeDb({
      gigs: args.gigs || [],
      preference: args.preference,
      missingAdaptiveColumns: args.missingAdaptiveColumns,
    }),
    provider: { id: PROVIDER, role: 'attorney', full_name: 'Provider One' },
    client: { id: CLIENT, full_name: 'Client One' },
    messages: args.messages,
    latestClientText: String(latest),
    pricing,
    settings: SETTINGS,
    memory: args.memory || null,
    channel: args.channel,
  })
}

function approved(decision: AdaptivePricingDecision): number {
  return Number(decision.approved_price_cents)
}

describe('adaptive pricing — scope signal', () => {
  test('live acceptance narrowed wording parses three documents as partial scope', () => {
    const scope = extractScopeSignal([clientMessage('narrow-live', 'Let us narrow the previous full request to organizing only a portion: 3 documents for a university application. Leave form completion and advice out of scope.')], { clientId: CLIENT })
    expect(scope.depth).toBe('partial')
    expect(scope.units).toEqual({ unit: 'document', qty: 3 })
  })

  test('parses the live harness supported Would you accept dollar counter as CAD cents', () => {
    const counterCents = extractNegotiationSignal([
      clientMessage('counter-1', 'The server quote record for this scope is CAD $45.00. Would you accept $40.50 CAD for the same narrowed scope?'),
    ], { clientId: CLIENT }).counter_cents
    expect(counterCents).toBe(4_050)
  })

  test('F1 parses a range budget as 50–100 and detects consult + self-serve', () => {
    const messages = [
      clientMessage('m1', 'I am in Canada on a study permit and want PR through marriage. What are my options?'),
      clientMessage('m2', 'What are the going rates for this kind of help?'),
      clientMessage('m3', 'I could maybe do $50 to $100 for a consult, happy to do the legwork myself.'),
    ]
    const scope = extractScopeSignal(messages, { clientId: CLIENT })
    const negotiation = extractNegotiationSignal(messages, { clientId: CLIENT })
    expect(scope.depth).toBe('consult')
    expect(scope.self_serve).toBe(true)
    expect(negotiation.budget).toMatchObject({ minCents: 5_000, maxCents: 10_000, currency: 'usd' })
  })

  test('F1: "50 dollars to 100" is a range, never a $50 ceiling', () => {
    const messages = [clientMessage('m1', 'I can do 50 dollars to 100 dollars for a consult.')]
    const negotiation = extractNegotiationSignal(messages, { clientId: CLIENT })
    expect(negotiation.budget?.minCents).toBe(5_000)
    expect(negotiation.budget?.maxCents).toBe(10_000)
  })

  test('F2 detects the narrowed unit count and the review depth', () => {
    const memory = {
      scope_current: { depth: 'full', units: { unit: 'page', qty: 20 }, gig_id: null, tier_id: null, scope_hash: 'x', summary: '' },
    } as any
    const scope = extractScopeSignal([clientMessage('m1', 'Can you just proofread 8 pages instead?')], {
      clientId: CLIENT,
      memory,
    })
    expect(scope.depth).toBe('review')
    expect(scope.units).toMatchObject({ unit: 'page', qty: 8 })
    expect(scope.narrowing).toBe(true)
    expect(scope.narrowing_delta).toBe(12)
  })

  test('F5 "only the cover letter" is a partial scope, not the full packet', () => {
    const scope = extractScopeSignal(
      [clientMessage('m1', 'I only want the cover letter reviewed, not the whole packet.')],
      { clientId: CLIENT },
    )
    expect(scope.depth).toBe('partial')
  })

  test('F4 word-count scope is detected from the essay request', () => {
    const scope = extractScopeSignal([clientMessage('m1', 'I need my 1,000 word essay edited.')], { clientId: CLIENT })
    expect(scope.units).toMatchObject({ unit: 'word', qty: 1_000 })
  })
})

describe('adaptive pricing — F1 immigration orientation replay', () => {
  const messages = [
    clientMessage('m1', 'I am in Canada on a study permit and want PR through marriage. What are my options?'),
    yqaaMessage('a1', 'Here are the realistic pathways and the documents that usually matter.'),
    clientMessage('m2', 'What are the going rates for this kind of help?'),
    clientMessage('m3', 'I could maybe do $50 to $100 for a consult, happy to do the legwork myself.'),
  ]
  const consultGig = gigRow({
    tiers: [
      tierRow({
        id: 'tier-consult',
        title: 'Orientation consult (30 min)',
        price: 15_000,
        scope_depth: 'consult',
        scope_units: null,
        features: ['30-minute call', 'Pathway overview'],
      }),
    ],
  })

  test('re-quotes the consult scope the client can actually afford and never restates full-scope math', async () => {
    const decision = await decide({ messages, gigs: [consultGig] })
    expect(decision.scope.depth).toBe('consult')
    expect(decision.scope.self_serve).toBe(true)
    expect(approved(decision)).toBeGreaterThan(0)
    // The server-authorized number fits the stated 50–100 range.
    expect(approved(decision)).toBeGreaterThanOrEqual(5_000)
    expect(approved(decision)).toBeLessThanOrEqual(10_000)
    expect(approved(decision) % ROUND_TO_CENTS).toBe(0)
    // Scoped, below the provider's own consult package — never a blended full-scope figure.
    expect(approved(decision)).toBeLessThan(15_000)
    expect(decision.status).toBe('ready')
    expect(decision.recommended_action).toBe('QUOTE')
  })

  test('F1c a budget far below the smallest consult escalates instead of inventing a cheaper scope', async () => {
    const poor = [
      ...messages.slice(0, 3),
      clientMessage('m4', 'I could maybe do $20 for a consult, happy to do the legwork myself.'),
    ]
    const decision = await decide({ messages: poor, gigs: [consultGig] })
    expect(decision.counter_class).toBe('lowball')
    expect(decision.approved_price_cents).toBeNull()
    expect(decision.recommended_action).toBe('ESCALATE_PROVIDER')
    expect(decision.approval_required).toBe(true)
    for (const option of decision.downscope_options) expect(option.price_cents).toBeGreaterThan(2_000)
  })

  test('F1d without a provider gig the scope still re-quotes as a market-p25 orientation, never an auto-offer', async () => {
    const decision = await decide({ messages, gigs: [] })
    expect(decision.quote.basis).toBe('market_p25')
    expect(decision.price.needs_provider_confirm).toBe(true)
    expect(decision.approved_price_cents).toBeNull()
    expect(decision.status).toBe('provider_approval_required')
  })

  test('the model-facing block carries only client-safe numbers', async () => {
    const decision = await decide({ messages, gigs: [consultGig] })
    const rendered = renderNegotiationAuthority(decision)
    const beforeRules = rendered.split('NEGOTIATION RULES:')[0]
    expect(rendered).toContain('SERVER-AUTHORIZED NUMBERS — use only these')
    expect(beforeRules.toLowerCase()).not.toMatch(/\bfloor\b|\bmean\b|hourly rate|multiplier|revenue-safe|\bband\b|\bweight/)
    expect(beforeRules).not.toContain(String(decision.quote.scoped_floor_cents / 100))
    expect(beforeRules).not.toContain(String(decision.price.hourly_rate_cents))
    expect(rendered).not.toContain(String(decision.quote.scoped_floor_cents))
    expect(rendered).toContain('NEGOTIATION STATE')
    expect(rendered).toContain(String(approved(decision) / 100))
  })

  test('repeats no number and re-uses the approved figure when the client accepts', async () => {
    const first = await decide({ messages, gigs: [consultGig] })
    const memory = {
      version: 2,
      negotiation: {
        scope_current: {
          depth: first.scope.depth,
          units: first.scope.units,
          gig_id: first.gig_id,
          tier_id: first.tier_id,
          scope_hash: first.scope.scope_hash,
          summary: first.scope.summary,
        },
        quotes_made: [{ cents: approved(first), scope_hash: first.scope.scope_hash, kind: 'downscope', at: 'now' }],
        concessions_used: 1,
      },
    } as any
    const accepted = await decide({
      messages: [...messages, yqaaMessage('a2', 'I can do that smaller scope for the approved number.'), clientMessage('m4', 'ok let’s do it')],
      gigs: [consultGig],
      memory,
    })
    expect(approved(accepted)).toBeLessThanOrEqual(approved(first))
    expect(accepted.status).not.toBe('budget_too_low')
    expect(approved(accepted)).toBe(approved(first))
  })
})

describe('adaptive pricing — F2/F3/F4/F5 scope re-quotes', () => {
  test('F2 per-page proofreading drops the price when the scope narrows', async () => {
    const gig = gigRow({
      title: 'Editing and proofreading',
      unit_pricing: { unit: 'page', unit_price_cents: 800, included_units: 0, min_units: 1 },
      tiers: [tierRow({ id: 'tier-proof', title: 'Proofread up to 20 pages', price: 16_000, scope_depth: 'review', scope_units: 20 })],
    })
    const full = await decide({
      messages: [clientMessage('m1', 'I need my 20 page document edited and improved. Budget is around $200.')],
      gigs: [gig],
    })
    const narrowed = await decide({
      messages: [clientMessage('m1', 'Can you just proofread 8 pages instead? Budget is around $200.')],
      gigs: [gig],
    })
    expect(narrowed.scope.depth).toBe('review')
    expect(narrowed.scope.units).toMatchObject({ unit: 'page', qty: 8 })
    expect(approved(narrowed)).toBeGreaterThan(0)
    expect(approved(narrowed)).toBeLessThan(16_000)
    expect(approved(narrowed)).toBeLessThanOrEqual(20_000)
    expect(narrowed.client_safe.includes.length).toBeGreaterThan(0)
    if (approved(full) > 0) expect(approved(narrowed)).toBeLessThan(approved(full))
  })

  test('F3 a filled-in form is a review quote, not the full-preparation price', async () => {
    const gig = gigRow({
      title: 'Application support',
      tiers: [
        tierRow({ id: 'tier-review', tier: 'basic', title: 'Form review', price: 15_000, scope_depth: 'review', scope_units: 1 }),
        tierRow({ id: 'tier-full', tier: 'premium', title: 'Full application preparation', price: 40_000, scope_depth: 'full', scope_units: 1 }),
      ],
    })
    const decision = await decide({
      messages: [clientMessage('m1', 'I already filled it out, I just need someone to check the form. My budget is around $400.')],
      gigs: [gig],
    })
    expect(decision.scope.depth).toBe('review')
    expect(decision.tier_id).toBe('tier-review')
    expect(approved(decision)).toBeGreaterThan(0)
    expect(approved(decision)).toBeLessThan(40_000)
    expect(approved(decision)).toBeLessThanOrEqual(20_000)
  })

  test('F4 a halved word count lowers the quote but never below the margin floor', async () => {
    const gig = gigRow({
      title: 'Essay editing',
      tiers: [
        tierRow({
          id: 'tier-essay',
          title: 'Essay editing up to 1,000 words',
          price: 20_000,
          scope_depth: 'full',
          scope_units: 1_000,
        }),
      ],
    })
    const long = await decide({
      messages: [clientMessage('m1', 'I need my 1,000 word essay edited. My budget is around $300.')],
      gigs: [gig],
    })
    const short = await decide({
      messages: [clientMessage('m1', 'Could you do just 500 words instead? My budget is around $300.')],
      gigs: [gig],
    })
    expect(approved(short)).toBeGreaterThan(0)
    expect(approved(short)).toBeLessThan(approved(long))
    expect(short.quote.scoped_floor_cents).toBeGreaterThan(0)
    expect(approved(short)).toBeGreaterThanOrEqual(short.quote.scoped_floor_cents)
  })

  test('F5 a single cover letter is a partial scope, never the full packet price', async () => {
    const gig = gigRow({
      title: 'Status reinstatement packet',
      tiers: [
        tierRow({ id: 'tier-letter', tier: 'basic', title: 'Cover letter review (partial)', price: 9_000, scope_depth: 'partial', scope_units: 1 }),
        tierRow({ id: 'tier-packet', tier: 'premium', title: 'Full packet preparation', price: 60_000, scope_depth: 'full', scope_units: 1 }),
      ],
    })
    const decision = await decide({
      messages: [clientMessage('m1', 'I only need the cover letter reviewed, not the whole packet. My budget is around $300.')],
      gigs: [gig],
    })
    expect(decision.scope.depth).toBe('partial')
    expect(decision.tier_id).toBe('tier-letter')
    expect(approved(decision)).toBeLessThan(60_000)
    expect(approved(decision)).toBeLessThanOrEqual(15_000)
  })
})

describe('adaptive pricing — N-series negotiation bands', () => {
  const policy: FlexPolicy = resolveFlexPolicy({})
  const list = 20_000

  test('N1 a counter 8% below the scoped price is accepted (band defaults intact)', () => {
    expect(AUTO_ACCEPT_PCT).toBe(0.1)
    const counter = Math.round(list * 0.92)
    expect(classifyCounter({ counterCents: counter, listPriceCents: list, policy })).toBe('reasonable')
    expect(eligibleActions({ counterClass: 'reasonable', policy, hasDownscopeOption: false })).toEqual(['ACCEPT'])
    const finalized = finalizeNumbers({
      action: 'ACCEPT',
      listPriceCents: list,
      floorCents: 8_000,
      policy,
      counterCents: counter,
      clientBudgetMaxCents: 25_000,
      scopeHash: 'scope-a',
    })
    // ACCEPT honours the counter, rounded to the platform $5 grid (§3.6).
    expect(finalized.price_cents).toBeLessThanOrEqual(counter)
    expect(finalized.price_cents! % ROUND_TO_CENTS).toBe(0)
    expect(finalized.action).toBe('ACCEPT')
  })

  test('N2 a counter 13% below meets in the middle at or above the floor', () => {
    const counter = Math.round(list * 0.87)
    expect(classifyCounter({ counterCents: counter, listPriceCents: list, policy })).toBe('reasonable_meet')
    expect(eligibleActions({ counterClass: 'reasonable_meet', policy, hasDownscopeOption: false })).toEqual(['MEET_MIDDLE'])
    const finalized = finalizeNumbers({
      action: 'MEET_MIDDLE',
      listPriceCents: list,
      floorCents: 16_000,
      policy,
      counterCents: counter,
      clientBudgetMaxCents: 25_000,
      scopeHash: 'scope-a',
    })
    expect(finalized.price_cents).toBeGreaterThanOrEqual(16_000)
    expect(finalized.price_cents).toBeLessThan(list)
  })

  test('M3 a prior lower quote cannot push the final number below the current floor', () => {
    const finalized = finalizeNumbers({
      action: 'ACCEPT',
      listPriceCents: 20_000,
      floorCents: 12_000,
      policy,
      counterCents: 11_000,
      clientBudgetMaxCents: 25_000,
      scopeHash: 'scope-current',
      previousQuotes: [{ cents: 10_000, scope_hash: 'scope-current' }],
    })
    expect(finalized).toMatchObject({ action: 'ESCALATE_PROVIDER', price_cents: null })
    expect(finalized.reason_codes).toContain('monotonic_below_current_floor')
  })

  test('N3 a 50% lowball downscopes to a scope that fits, and never prices below the floor', async () => {
    expect(APPROVAL_BAND_PCT).toBe(0.35)
    const gig = gigRow({
      title: 'Document editing',
      tiers: [tierRow({ id: 'tier-edit', title: 'Edit up to 20 pages', price: 40_000, scope_depth: 'full', scope_units: 20 })],
    })
    const decision = await decide({
      messages: [clientMessage('m1', 'Please edit my 20 pages. Could you do it for $200?')],
      gigs: [gig],
    })
    expect(decision.counter_class).toBe('lowball')
    expect(decision.recommended_action).toBe('DOWNSCOPE')
    expect(approved(decision)).toBeGreaterThanOrEqual(decision.downscope_options[0].floor_cents)
    expect(approved(decision)).toBeLessThanOrEqual(20_000)
  })

  test('N3b a lowball with no fitting scope escalates and offers nothing below the floor', () => {
    const listPrice = 40_000
    const options = downscopeOptions({
      scope: buildScopeSignal({ depth: 'full', units: { unit: 'page', qty: 2 } }),
      match: { gig: null, tier: null, relevant: null, basis: 'market_p25', includes: [], needsProviderConfirm: false },
      policy,
      budgetMaxCents: 2_000,
      platformMinimumCents: 100,
    })
    expect(options.length).toBe(0)
    expect(eligibleActions({ counterClass: 'lowball', policy, hasDownscopeOption: false })).toEqual([
      'HOLD_VALUE',
      'ESCALATE_PROVIDER',
    ])
    const finalized = finalizeNumbers({
      action: 'HOLD_VALUE',
      listPriceCents: listPrice,
      floorCents: 30_000,
      policy,
      counterCents: 2_000,
      clientBudgetMaxCents: 2_000,
      scopeHash: 'scope-b',
    })
    expect(finalized.price_cents).toBeNull()
  })

  test('N4 three counters escalate to the provider instead of conceding again', () => {
    const actions = eligibleActions({
      counterClass: 'stretch',
      policy,
      hasDownscopeOption: true,
      counterCount: 3,
    })
    expect(actions).toEqual(['ESCALATE_PROVIDER', 'HOLD_VALUE'])
    const beforeLimit = eligibleActions({ counterClass: 'stretch', policy, hasDownscopeOption: true, counterCount: 2 })
    expect(beforeLimit).toContain('DOWNSCOPE')
  })

  test('N4b the third counter in a real thread escalates once, with no offer', async () => {
    const gig = gigRow({
      tiers: [tierRow({ id: 'tier-20', title: 'Full preparation up to 20 pages', price: 40_000, scope_depth: 'full', scope_units: 20 })],
    })
    const messages = [
      clientMessage('m1', 'Please prepare my 20 pages. Can you do $380?'),
      clientMessage('m2', 'What about $360?'),
      clientMessage('m3', 'I can only do $340.'),
    ]
    const decision = await decide({ messages, gigs: [gig] })
    expect(decision.recommended_action).toBe('ESCALATE_PROVIDER')
    expect(decision.approved_price_cents).toBeNull()
    expect(decision.approval_required).toBe(true)
  })

  test('N5 an abusive counter gets no concession at all', async () => {
    const gig = gigRow({
      tiers: [tierRow({ id: 'tier-20', title: 'Full preparation up to 20 pages', price: 40_000, scope_depth: 'full', scope_units: 20 })],
    })
    const decision = await decide({
      messages: [clientMessage('m1', 'This is a ripoff. Do it for free or I will report you. Budget $400.')],
      gigs: [gig],
    })
    expect(decision.counter_class).toBe('abusive')
    expect(decision.approved_price_cents).toBeNull()
    expect(decision.eligible_actions).toEqual(['HOLD_VALUE', 'ESCALATE_PROVIDER'])
  })

  test('N6 provider opt-out (negotiation disabled / flex 0) means no price moves', async () => {
    const gig = gigRow({
      negotiation_enabled: false,
      tiers: [tierRow({ id: 'tier-20', title: 'Full preparation up to 20 pages', price: 40_000, scope_depth: 'full', scope_units: 20 })],
    })
    const decision = await decide({
      messages: [clientMessage('m1', 'Please prepare my 20 pages. Could you do $380?')],
      gigs: [gig],
    })
    expect(decision.policy.negotiation_enabled).toBe(false)
    expect(decision.eligible_actions.every((action) => action !== 'ACCEPT' && action !== 'MEET_MIDDLE')).toBe(true)
    expect(decision.eligible_actions).toEqual(['HOLD_VALUE'])
    expect(decision.approved_price_cents).toBeNull()

    const disabledPolicy = resolveFlexPolicy({ gig: { ...gig, negotiation_enabled: null, negotiation_flex_pct: 0 } as GigForScope })
    expect(disabledPolicy.flex_pct).toBe(0)
    const finalized = finalizeNumbers({
      action: 'MEET_MIDDLE',
      listPriceCents: 40_000,
      floorCents: 30_000,
      policy: disabledPolicy,
      counterCents: 38_000,
      clientBudgetMaxCents: 45_000,
      scopeHash: 'scope-c',
    })
    expect(finalized.price_cents).toBeNull()
    expect(finalized.action).toBe('HOLD_VALUE')
  })

  test('N7 a provider flex override widens the band', () => {
    const base = resolveFlexPolicy({})
    const widened = resolveFlexPolicy({ gig: { ...gigRow({ negotiation_flex_pct: 25 }) } as GigForScope })
    expect(base.flex_pct).toBe(FLEX_PCT)
    expect(widened.flex_pct).toBe(0.25)
    expect(widened.source.flex_pct).toBe('gig')
    const counter = Math.round(20_000 * 0.8)
    expect(classifyCounter({ counterCents: counter, listPriceCents: 20_000, policy: base })).toBe('stretch')
    expect(classifyCounter({ counterCents: counter, listPriceCents: 20_000, policy: widened })).toBe('reasonable_meet')
  })
})

describe('adaptive pricing — memory guards (M1, M2)', () => {
  test('M1 a downscope quote is honoured when the client accepts, not replaced by a stale figure', async () => {
    const gig = gigRow({
      tiers: [tierRow({ id: 'tier-consult', title: 'Orientation consult', price: 15_000, scope_depth: 'consult', scope_units: null })],
    })
    const messages = [clientMessage('m1', 'I could maybe do $50 to $100 for a consult, happy to do the legwork.')]
    const scope = extractScopeSignal(messages, { clientId: CLIENT })
    const memory = {
      version: 2,
      negotiation: {
        scope_current: { depth: 'consult', units: null, gig_id: 'gig-1', tier_id: 'tier-consult', scope_hash: scope.scope_hash, summary: 'short orientation consult' },
        quotes_made: [{ cents: 15_000, scope_hash: scope.scope_hash, kind: 'downscope', at: 'now' }],
        concessions_used: 1,
      },
    } as any
    const decision = await decide({ messages, gigs: [gig], memory })
    expect(approved(decision)).toBeLessThanOrEqual(15_000)
    expect(approved(decision)).not.toBe(50_000)
  })

  test('M2 the price for the same scope never goes up', async () => {
    const gig = gigRow({
      tiers: [tierRow({ id: 'tier-consult', title: 'Orientation consult', price: 15_000, scope_depth: 'consult', scope_units: null })],
    })
    const messages = [clientMessage('m1', 'I could maybe do $50 to $100 for a consult, happy to do the legwork.')]
    const scope = extractScopeSignal(messages, { clientId: CLIENT })
    const memory = {
      version: 2,
      negotiation: {
        scope_current: { depth: scope.depth, units: null, gig_id: 'gig-1', tier_id: 'tier-consult', scope_hash: scope.scope_hash, summary: scope.summary },
        quotes_made: [{ cents: 5_000, scope_hash: scope.scope_hash, kind: 'quote', at: 'now' }],
        concessions_used: 1,
      },
    } as any
    const decision = await decide({ messages, gigs: [gig], memory })
    expect(approved(decision)).toBeLessThanOrEqual(5_000)
    // Monotonic per scope hash, via the pure finalizer with an unchanged workload.
    const finalized = finalizeNumbers({
      action: 'QUOTE',
      listPriceCents: 16_500,
      floorCents: 3_000,
      policy: resolveFlexPolicy({}),
      clientBudgetMaxCents: 100_000,
      scopeHash: scope.scope_hash,
      previousQuotes: [{ cents: 15_000, scope_hash: scope.scope_hash }],
      concessionsUsed: 0,
    })
    expect(finalized.price_cents).toBe(15_000)
    expect(finalized.reason_codes).toContain('monotonic_per_scope')
  })
})

describe('adaptive pricing — workload model (W1–W6)', () => {
  const fullScope = buildScopeSignal({ depth: 'full', units: { unit: 'page', qty: 20 } })
  const policy = resolveFlexPolicy({})

  const signalsFor = (text: string) => {
    const messages = [clientMessage('m1', text)]
    const context = { clientId: CLIENT }
    const urgency = extractUrgencySignal(messages, context)
    return {
      urgency,
      complexity: extractComplexitySignal(messages, context, urgency),
      agency: extractAgencySignal(messages, context),
    }
  }

  test('live continuous fixture stays below the range handoff threshold', () => {
    const fs = require('node:fs'), path = require('node:path')
    const harness = fs.readFileSync(path.join(__dirname, '../scripts/yqaa-live-acceptance.mjs'), 'utf8')
    const fullRequests = [...harness.matchAll(/fullRequest: '([^']+)'/g)].map((match: any) => match[1])
    expect(fullRequests).toHaveLength(3)
    for (const text of fullRequests) {
      const messages = [clientMessage('m-fixture', text)]
      const scope = extractScopeSignal(messages, { clientId: CLIENT })
      expect(scope.units).toEqual({ unit: 'document', qty: 6 })
      const estimate = estimateWorkload(scope, signalsFor(text))
      const quote = priceFromWorkload(estimate, policy, { hourlyRateCents: 4500 })
      expect(quote.needs_provider_confirm).toBe(false)
      expect(quote.price_cents).toBeLessThanOrEqual(45000)
    }
    const oversized = estimateWorkload(buildScopeSignal({ depth: 'full', units: { unit: 'document', qty: 12 } }), signalsFor('organizing the full application across 12 documents'))
    expect(priceFromWorkload(oversized, policy, { hourlyRateCents: 4500 }).needs_provider_confirm).toBe(true)
  })

  test('W1 a 45-day deadline costs less than a 5-day deadline, and the rush is reflected', () => {
    const relaxed = signalsFor('Please prepare my 20 pages, the deadline is in 45 days. Budget is around $2,000.')
    const rushing = signalsFor('Please prepare my 20 pages, the deadline is in 5 days. Budget is around $2,000.')
    expect(relaxed.urgency.multiplier).toBe(1)
    expect(rushing.urgency.multiplier).toBe(1.4)
    const relaxedPrice = priceFromWorkload(estimateWorkload(fullScope, relaxed), policy, { hourlyRateCents: 10_000 })
    const rushingPrice = priceFromWorkload(estimateWorkload(fullScope, rushing), policy, { hourlyRateCents: 10_000 })
    expect(rushingPrice.price_cents).toBeGreaterThan(relaxedPrice.price_cents)
  })

  test('W2 the client taking on the legwork removes hours and lowers the price, explained in words', () => {
    const beforeScope = buildScopeSignal({ depth: 'full', units: { unit: 'page', qty: 10 } })
    const afterScope = buildScopeSignal({ depth: 'full', units: { unit: 'page', qty: 10 }, selfServe: true })
    const before = estimateWorkload(beforeScope, signalsFor('Please prepare my 10 pages. Budget is around $2,000.'))
    const after = estimateWorkload(
      afterScope,
      signalsFor("I'll do the legwork and gather the documents myself. Please prepare my 10 pages. Budget is around $2,000."),
    )
    expect(after.total_hours).toBeLessThan(before.total_hours)
    expect(after.agency.self_serve).toBe(true)
    const beforePrice = priceFromWorkload(before, policy, { hourlyRateCents: 10_000 })
    const afterPrice = priceFromWorkload(after, policy, { hourlyRateCents: 10_000 })
    expect(afterPrice.price_cents).toBeLessThan(beforePrice.price_cents)
    const explanation = explainWorkloadChange(before, after)
    expect(explanation).toBeTruthy()
    expect(explanation!).toMatch(/fewer hours/i)
    expect(explanation!).not.toMatch(/\$|\bfloor\b|\brate\b|multiplier/i)
  })

  test('W3 a newly revealed prior refusal adds research hours and raises the price', () => {
    const base = estimateWorkload(fullScope, signalsFor('Please prepare my 20 pages. Budget is around $3,000.'))
    const revealed = estimateWorkload(
      fullScope,
      signalsFor('Please prepare my 20 pages — I had a prior refusal and there is now an RFE. Budget is around $3,000.'),
    )
    expect(revealed.research_hours).toBeGreaterThan(base.research_hours)
    expect(revealed.complexity.flags).toEqual(expect.arrayContaining(['prior_denial', 'rfe_noid']))
    const basePrice = priceFromWorkload(base, policy, { hourlyRateCents: 10_000 })
    const revealedPrice = priceFromWorkload(revealed, policy, { hourlyRateCents: 10_000 })
    expect(revealedPrice.price_cents).toBeGreaterThan(basePrice.price_cents)
  })

  test('W4 a smaller scope shrinks the breakdown and a bigger scope grows it', () => {
    const small = estimateWorkload(buildScopeSignal({ depth: 'full', units: { unit: 'page', qty: 5 } }), signalsFor('edit 5 pages'))
    const big = estimateWorkload(buildScopeSignal({ depth: 'full', units: { unit: 'page', qty: 25 } }), signalsFor('edit 25 pages'))
    const draftHours = (estimate: typeof small) => estimate.breakdown.find((row) => row.component === 'drafting')?.hours || 0
    expect(draftHours(small)).toBeLessThan(draftHours(big))
    expect(small.total_hours).toBeLessThan(big.total_hours)
  })

  test('W5 the breakdown is deterministic (same input, identical output)', () => {
    const signals = signalsFor('Please prepare my 20 pages. Budget is around $2,000.')
    const a = estimateWorkload(fullScope, signals)
    const b = estimateWorkload(fullScope, signalsFor('Please prepare my 20 pages. Budget is around $2,000.'))
    expect(a).toEqual(b)
  })

  test('W6 high complexity / low confidence yields a range + provider confirm and no firm offer', async () => {
    const gig = gigRow({
      tiers: [tierRow({ id: 'tier-full', title: 'Full preparation', price: 60_000, scope_depth: 'full', scope_units: 30 })],
    })
    const decision = await decide({
      messages: [
        clientMessage(
          'm1',
          'I have a criminal record, a prior refusal, an RFE, out of status gaps and both the US and Canada involved. Please prepare my 30 pages. Budget is around $5,000.',
        ),
      ],
      gigs: [gig],
    })
    expect(decision.workload.complexity.multiplier).toBeGreaterThan(1.4)
    expect(decision.price.range).not.toBeNull()
    expect(decision.price.needs_provider_confirm).toBe(true)
    expect(decision.status).toBe('provider_approval_required')
    expect(decision.approved_price_cents).toBeNull()
    expect(decision.approval_required).toBe(true)
  })
})

describe('adaptive pricing — leaks, Jev payload and public surface (L1, J1, P1)', () => {
  test('L1 no server template leaks internal pricing language and every dollar is server-allowed', () => {
    const reply = lowBudgetReply(authority({ status: 'budget_too_low' }))
    const escalation = lowBudgetEscalationReply('Provider One')
    const template = safeApprovedPriceTemplate({ approvedPriceCents: 5_000, includes: ['30-minute call'] })
    for (const text of [reply, escalation, template]) {
      expect(leaksCompanionPricingLanguage(text)).toBe(false)
      expect(text).not.toMatch(/\bleaks?\b/i)
    }
    expect(template).toContain('$50')
    expect(escalation).not.toMatch(/\$\s*\d/)
  })

  test('L1b the extended lexicons catch floors, bands, means, rates, weights and % off talk', () => {
    const leaks = [
      'The floor for this scope is $200.',
      'The lowest I can do is $180.',
      'Our band allows 15% off.',
      'That is below the Marketplace average.',
      'The reference mean says $300.',
      'It is revenue-safe for the provider.',
      'My hourly rate is $250.',
      'The complexity multiplier is 1.4.',
      'The weighted score says $400.',
    ]
    for (const text of leaks) expect(leaksCompanionPricingLanguage(text)).toBe(true)
  })

  test('J1 Jev never receives cents and malformed out-of-set picks are rejected', async () => {
    let sentBody = ''
    const fetcher = (async (_url: any, init: any) => {
      sentBody = String(init?.body || '')
      return new Response(
        JSON.stringify({
          answers: {
            posture: { type: 'choice', choice: 'HANDOFF_SUPPORT', confidence: 0.9, probabilities: { EDUCATE: 0.1, NEGOTIATE: 0.9 } },
            negotiation_posture: { type: 'choice', choice: 'MEET_MIDDLE', confidence: 0.9, probabilities: { ACCEPT: 0.1, DOWNSCOPE: 0.9 } },
            sufficient: { type: 'noul', noul: 0.9 },
            needs_handoff: { type: 'noul', noul: 0.1 },
            market: { type: 'choice', choice: 'canada', confidence: 1, probabilities: { usa: 0, canada: 1, uk: 0, australia: 0, global: 0, unknown: 0 } },
          },
        }),
        { status: 200 },
      )
    }) as unknown as typeof fetch
    const result = await requestCompanionJev(
      {
        query: 'I could do $50 for the consult',
        channel: 'dm',
        postureOptions: ['EDUCATE', 'NEGOTIATE'],
        negotiationOptions: ['ACCEPT', 'DOWNSCOPE'],
      },
      fetcher,
      { apiKey: 'test-key' },
    )
    expect(sentBody).not.toMatch(/\$\s*\d|\d+\s*cents|5000/)
    expect(sentBody).toContain('posture')
    expect(sentBody).toContain('negotiation_posture')
    expect(result).toEqual({ available: false, reason: 'invalid_response' })
    const payload = companionJevPayload({
      query: 'budget $50 to $100 for a consult',
      channel: 'dm',
      postureOptions: ['EDUCATE'],
      negotiationOptions: [],
    })
    const serialized = JSON.stringify(payload)
    expect(serialized).not.toMatch(/cents|5000|10000|\$\d/)
    expect(serialized).not.toContain('negotiation_posture')
  })

  test('J1c a sole eligible negotiation action is deterministic and omitted from Jev Choice', async () => {
    const payload = companionJevPayload({
      query: 'Can you meet me in the middle?',
      postureOptions: ['NEGOTIATE'],
      negotiationOptions: ['MEET_MIDDLE', 'MEET_MIDDLE'],
    })
    expect(payload.questions).not.toHaveProperty('negotiation_posture')

    const fetcher = (async (_url: any, init: any) => {
      const body = JSON.parse(String(init?.body || '{}'))
      expect(body.questions).not.toHaveProperty('negotiation_posture')
      return new Response(JSON.stringify({ answers: {
        sufficient: { type: 'noul', noul: 0.9 },
        needs_handoff: { type: 'noul', noul: 0.1 },
        market: { type: 'choice', choice: 'usa', confidence: 1, probabilities: { usa: 1, canada: 0, uk: 0, australia: 0, global: 0, unknown: 0 } },
      } }), { status: 200 })
    }) as unknown as typeof fetch
    const result = await requestCompanionJev({
      query: 'Can you meet me in the middle?',
      postureOptions: ['NEGOTIATE'],
      negotiationOptions: ['MEET_MIDDLE', 'MEET_MIDDLE'],
    }, fetcher, { apiKey: 'test-key' })

    expect(result.available).toBe(true)
    if (result.available) expect(result.negotiationPosture).toBe('MEET_MIDDLE')
  })

  test('J1b a Jev timeout never throws and reports the reason', async () => {
    const timeoutFetcher = (async () => {
      const error = new Error('timed out')
      error.name = 'AbortError'
      throw error
    }) as unknown as typeof fetch
    const result = await requestCompanionJev(
      { query: 'hello', postureOptions: ['EDUCATE'] },
      timeoutFetcher,
      { apiKey: 'test-key' },
    )
    expect(result).toEqual({ available: false, reason: 'timeout' })
    const notConfigured = await requestJevAdvisory(
      { query: 'hello', evidence: [] },
      timeoutFetcher,
      { workerEnv: {} },
    )
    expect(notConfigured.available).toBe(false)
  })

  test('P1 public chat never offers or negotiates', async () => {
    const decision = await decide({
      messages: [clientMessage('m1', 'How much does a consultation cost? Could you do $50?')],
      gigs: [gigRow({ tiers: [tierRow({ title: 'Orientation consult', price: 15_000, scope_depth: 'consult' })] })],
      channel: 'public',
    })
    expect(decision.status).toBe('public_no_negotiation')
    expect(decision.approved_price_cents).toBeNull()
    expect(decision.eligible_actions).toEqual([])
    const policy = publicChatPricingPolicy()
    expect(policy.allow_offers).toBe(false)
    expect(policy.allow_negotiation).toBe(false)
    expect(policy.allow_public_tier_list_prices).toBe(true)
  })
})

describe('adaptive pricing — migration tolerance', () => {
  test('preserves deployed unit pricing and tier scope when per-gig override columns are missing', async () => {
    const db = {
      from: () => {
        let selection = ''
        const builder: any = {
          select(columns: string) { selection = columns; return builder },
          eq() { return builder },
          in() { return builder },
          limit() { return builder },
          then(resolve: any, reject: any) {
            if (selection.includes('negotiation_enabled')) {
              return Promise.resolve({ data: null, error: { message: 'column gigs.negotiation_enabled does not exist' } }).then(resolve, reject)
            }
            const deployedFields = selection.includes('unit_pricing') && selection.includes('scope_units')
            const row = {
              id: 'gig-deployed',
              ...(deployedFields ? {
                unit_pricing: { unit: 'page', unit_price_cents: 1200 },
                hourly_rate_cents: 9000,
                tiers: [{ id: 'tier-deployed', tier: 'basic', title: 'Review 4 pages', price: 8000, is_active: true, scope_depth: 'review', scope_units: 4 }],
              } : { tiers: [{ id: 'tier-deployed', tier: 'basic', title: 'Review 4 pages', price: 8000, is_active: true }] }),
            }
            return Promise.resolve({ data: [row], error: null }).then(resolve, reject)
          },
        }
        return builder
      },
    }

    const [gig] = await loadProviderGigsForScope(db, PROVIDER)

    expect(gig).toMatchObject({
      id: 'gig-deployed',
      unit_pricing: { unit: 'page', unit_price_cents: 1200 },
      hourly_rate_cents: 9000,
      tiers: [{ scope_depth: 'review', scope_units: 4 }],
    })
  })

  test('works when the additive migration has not been applied', async () => {
    const decision = await decide({
      messages: [clientMessage('m1', 'I could maybe do $50 to $100 for a consult, happy to do the legwork.')],
      gigs: [gigRow()],
      preference: 'missing-table',
      missingAdaptiveColumns: true,
    })
    expect(decision.currency).toBe('usd')
    expect(decision.policy.source.flex_pct).toBe('constant')
    expect(decision.reason_codes.length).toBeGreaterThan(0)
  })

  test('scoped floor defaults to the platform margin floor', () => {
    const policy = resolveFlexPolicy({})
    const match = resolveGigForScope({ gigs: [], scope: buildScopeSignal({ depth: 'review', units: { unit: 'page', qty: 4 } }) })
    const quote = quoteScope({ scope: buildScopeSignal({ depth: 'review', units: { unit: 'page', qty: 4 } }), match, policy })
    const expectedHours = quote.workload.total_hours
    expect(quote.scoped_floor_cents).toBeGreaterThanOrEqual(Math.ceil(expectedHours * MIN_EFFECTIVE_HOURLY_RATE_CENTS) - ROUND_TO_CENTS)
    expect(quote.needs_provider_confirm).toBe(true)
  })
})
