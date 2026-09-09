import {
  extractClientBudget,
  guardMessengerOffer,
  MIN_REFERENCE_RATIO,
  summarizePrices,
  type PricingAuthority,
} from '@/lib/messengerPricingAuthority'
import { buildGroundedConversationMemory } from '@/lib/messengerConversationMemory'

function pricing(overrides: Partial<PricingAuthority> = {}): PricingAuthority {
  return {
    status: 'ready',
    currency: 'usd',
    intent: {
      categoryId: 'education',
      categoryName: 'Education & Admissions',
      subcategoryId: 'university-admissions',
      subcategoryName: 'University Admissions',
      url: 'https://market.yousafeconsultancy.com/marketplace/categories/university-admissions/',
      score: 15,
      confidence: 'high',
    },
    budget: {
      minCents: null,
      maxCents: 120_000,
      currency: 'usd',
      sourceText: 'My budget is $1,200',
      messageId: 'm2',
      confidence: 'explicit',
    },
    market: summarizePrices([80_000, 100_000, 120_000, 140_000]),
    provider: summarizePrices([95_000, 125_000]),
    empirical: null,
    empiricalIncluded: false,
    referenceMeanCents: 110_000,
    minimumAutoOfferCents: 93_500,
    evidenceHighCents: 140_000,
    providerGigIds: ['gig-1'],
    providerRelevantGigIds: ['gig-1'],
    comparableGigIds: ['gig-1', 'gig-2'],
    comparableTitles: ['Admissions support', 'Application review'],
    platformMinimumCents: 100,
    platformMaximumCents: 500_000,
    rationale: [],
    ...overrides,
  }
}

describe('YQAA marketplace pricing authority', () => {
  test('uses 15% below mean as the automatic baseline floor policy', () => {
    expect(MIN_REFERENCE_RATIO).toBe(0.85)
  })

  test('computes robust marketplace summary statistics', () => {
    const stats = summarizePrices([100, 200, 300, 400])!
    expect(stats.count).toBe(4)
    expect(stats.meanCents).toBe(250)
    expect(stats.medianCents).toBe(250)
    expect(stats.minCents).toBe(100)
    expect(stats.maxCents).toBe(400)
    expect(stats.p90Cents).toBeGreaterThan(stats.p75Cents)
  })

  test('extracts only explicit client budgets rather than arbitrary money mentions', () => {
    const rows = [
      { id: 'm1', sender_id: 'client', body: 'The application fee is $250.' },
      { id: 'm2', sender_id: 'client', body: 'My budget is around $900.' },
    ]
    expect(extractClientBudget(rows, 'client')).toMatchObject({ maxCents: 90_000, currency: 'usd' })
  })

  test('accepts a money-only reply when YQAA directly asked for budget', () => {
    const rows = [
      { id: 'a1', sender_id: 'provider', body: 'What budget range are you working with in USD?', metadata: { ai_generated: true } },
      { id: 'm2', sender_id: 'client', body: '$750' },
    ]
    expect(extractClientBudget(rows, 'client')).toMatchObject({ maxCents: 75_000, confidence: 'reply-to-budget-question' })
  })

  test('blocks any offer before a client budget exists', () => {
    const result = guardMessengerOffer({ pricing: pricing({ status: 'need_budget', budget: null }), proposedPriceUsd: 900 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('missing_budget')
  })

  test('blocks lowball offers below the guarded floor', () => {
    const result = guardMessengerOffer({ pricing: pricing(), proposedPriceUsd: 800 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('below_guarded_floor')
  })

  test('will not quote above the client stated budget', () => {
    const result = guardMessengerOffer({ pricing: pricing(), proposedPriceUsd: 1300 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('above_client_budget')
  })

  test('allows a supported price inside the revenue-safe corridor', () => {
    const result = guardMessengerOffer({ pricing: pricing(), proposedPriceUsd: 1050, gigId: 'gig-1' })
    expect(result).toEqual({ ok: true, priceCents: 105_000, reason: 'within_authority' })
  })
})

describe('YQAA grounded conversation memory', () => {
  test('persists client-authored scope, budget, documents and country without model summaries', () => {
    const p = pricing()
    const memory = buildGroundedConversationMemory({
      clientId: 'client',
      pricing: p,
      metadata: {},
      messages: [
        { sender_id: 'client', body: 'I am applying to a university in Australia and need help with my SOP.' },
        { sender_id: 'client', body: 'I already have my passport and transcript. My deadline is next Friday.' },
        { sender_id: 'client', body: 'My budget is $1,200.' },
      ],
    })
    expect(memory.markets).toContain('Australia')
    expect(memory.budget?.maxCents).toBe(120_000)
    expect(memory.document_highlights.join(' ')).toMatch(/passport|transcript/i)
    expect(memory.deadline_highlights.join(' ')).toMatch(/deadline/i)
    expect(memory.marketplace_scope?.category_id).toBe('education')
  })
})
