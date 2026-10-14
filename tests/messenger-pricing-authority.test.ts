jest.mock('@/lib/fiverr', () => ({ getPaymentSettingsForApi: async () => ({primary_currency:'usd',minimum_offer_amount_cents:100,maximum_offer_amount_cents:500000}) }))
import {
  buildMessengerPricingAuthority,
  budgetGapReplyAlreadySent,
  clientFrustrationOrExit,
  extractClientBudget,
  guardMessengerOffer,
  isNearDuplicateReply,
  leaksInternalFloorLanguage,
  lowBudgetReply,
  frustratedBudgetHandoffReply,
  MIN_REFERENCE_RATIO,
  pricingAuditSnapshot,
  renderPricingAuthority,
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
  test('keeps an explicitly requested study-planning checklist in document memory', () => {
    const body = 'My budget is USD 450 for help organizing a student study planning checklist.'
    const memory = buildGroundedConversationMemory({messages:[{sender_id:'client',body}],clientId:'client',pricing:pricing()})
    expect(memory.document_highlights).toContain(body)
  })
  function ownTierDb(category = 'mentorship', subcategory = 'student-mentorship') {
    const gig = {id:'own-gig',provider_id:'provider',status:'paused',category,subcategory,tiers:[{price:2500,is_active:true},{price:5000,is_active:true}]}
    return {from(table: string) {
      const conditions: Array<(row: any) => boolean> = []
      const query: any = {
        select: () => query, limit: () => query, order: () => query, gt: () => query,
        eq: (key: string, value: unknown) => { conditions.push(row => row[key] === value); return query },
        in: (key: string, values: unknown[]) => { conditions.push(row => values.includes(row[key])); return query },
        then: (resolve: any) => Promise.resolve({data:(table === 'gigs' ? [gig] : []).filter(row => conditions.every(condition => condition(row))),error:null}).then(resolve),
      }
      return query
    }}
  }
  test('verified owner same-scope tiers support pricing when no other listings exist, retaining the floor and budget guard', async () => {
    const message = {id:'budget',sender_id:'client',body:'My budget is USD 450 for student study planning.'}
    const authority = await buildMessengerPricingAuthority({db:ownTierDb(),provider:{id:'provider'},client:{id:'client'},messages:[message],latestClientText:message.body})
    expect(authority).toMatchObject({status:'ready',market:null,referenceMeanCents:3750,minimumAutoOfferCents:3188,providerRelevantGigIds:['own-gig']})
    expect(guardMessengerOffer({pricing:authority,proposedPriceUsd:50,gigId:'own-gig'}).ok).toBe(true)
    expect(guardMessengerOffer({pricing:authority,proposedPriceUsd:30,gigId:'own-gig'})).toMatchObject({ok:false,reason:'below_guarded_floor'})
    expect(guardMessengerOffer({pricing:authority,proposedPriceUsd:451,gigId:'own-gig'})).toMatchObject({ok:false,reason:'above_client_budget'})
  })
  test('unrelated provider tiers cannot replace missing scope evidence', async () => {
    const message = {id:'budget',sender_id:'client',body:'My budget is USD 450 for student study planning.'}
    const authority = await buildMessengerPricingAuthority({db:ownTierDb('business','tax-advisory'),provider:{id:'provider'},client:{id:'client'},messages:[message],latestClientText:message.body})
    expect(authority.status).toBe('insufficient_market_data')
    expect(authority.referenceMeanCents).toBeNull()
  })
  test('a frustrated budget handoff explains scope limits and the pending next step without inventing approval', () => {
    const reply = frustratedBudgetHandoffReply('the provider')
    expect(reply).toContain('cannot approve the requested scope')
    expect(reply).toContain('explain what can be included')
    expect(reply).toContain('pending until they reply')
    expect(leaksInternalFloorLanguage(reply)).toBe(false)
  })
  test('uses 15% below mean as the automatic baseline floor policy', () => {
    expect(MIN_REFERENCE_RATIO).toBe(0.85)
  })

  test('a scoped negotiation decision validates against the workload floor, not the blended floor', () => {
    const low = pricing({ status: 'budget_too_low', budget: { ...pricing().budget!, maxCents: 12_000 } })
    // Without a scoped decision the blended floor still blocks and the template is used.
    const blended = guardMessengerOffer({ pricing: low, proposedPriceUsd: 55 })
    expect(blended.ok).toBe(false)

    // With a scoped floor + server-approved number, the workload floor governs.
    const scoped = guardMessengerOffer({
      pricing: low,
      proposedPriceUsd: 55,
      negotiation: { scopedFloorCents: 4_500, approvedPriceCents: 5_500, scoped: true },
    })
    expect(scoped).toMatchObject({ ok: true, priceCents: 5_500 })
  })

  test('a generated approval token cannot substitute for provider approval below the scoped floor', () => {
    const p = pricing()
    const blocked = guardMessengerOffer({
      pricing: p,
      proposedPriceUsd: 30,
      negotiation: { scopedFloorCents: 4_500, approvedPriceCents: null, scoped: true },
    })
    expect(blocked.ok).toBe(false)
    if (!blocked.ok) {
      expect(blocked.reason).toBe('below_guarded_floor')
      expect(blocked.needsProviderReview).toBe(true)
      expect(blocked.reply.toLowerCase()).not.toContain('floor')
      expect(blocked.reply).not.toContain('revenue-safe')
    }
    const tokenIsNotApproval = guardMessengerOffer({
      pricing: p,
      proposedPriceUsd: 30,
      negotiation: { scopedFloorCents: 4_500, approvedPriceCents: null, approvalToken: 'tok-1', scoped: true },
    })
    expect(tokenIsNotApproval).toMatchObject({ ok: false, reason: 'below_guarded_floor', needsProviderReview: true })
  })

  test('the guard refuses a model figure that is not the server-approved one', () => {
    const result = guardMessengerOffer({
      pricing: pricing(),
      proposedPriceUsd: 1_100,
      negotiation: { scopedFloorCents: 90_000, approvedPriceCents: 105_000, scoped: true },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('invalid_price')
  })

  test('the model-facing pricing block is client-safe: no floors, means or evidence highs', () => {
    const p = pricing({ rationale: ['Marketplace sample mean $1,100 and automatic floor $935.'] })
    const rendered = renderPricingAuthority(p)
    expect(rendered).toContain('SERVER-AUTHORIZED NUMBERS — use only these')
    expect(rendered).not.toMatch(/NON-NEGOTIABLE/)
    expect(rendered).not.toContain('$935')
    expect(rendered).not.toContain('$1,100')
    expect(rendered.toLowerCase()).not.toContain('reference mean')
    const audit = pricingAuditSnapshot(p)
    expect(audit.guarded_floor_cents).toBe(93_500)
    expect(audit.reference_mean_cents).toBe(110_000)
  })

  test('leaksInternalFloorLanguage stays the shared base lexicon for the polish stage', () => {
    expect(leaksInternalFloorLanguage('The lowest revenue-safe offer for this scope average is $250.')).toBe(true)
    expect(leaksInternalFloorLanguage('Happy to narrow the scope so it fits.')).toBe(false)
  })

  test('parses BOTH ends of a client-stated budget range', () => {
    const rows = [
      { id: 'm1', sender_id: 'client', body: 'My budget is $50 to $100 for a consult.' },
    ]
    expect(extractClientBudget(rows, 'client')).toMatchObject({
      minCents: 5_000,
      maxCents: 10_000,
      currency: 'usd',
      confidence: 'explicit',
    })
  })

  test('parses a suffixed range without dollar signs ("50 dollars to 100")', () => {
    const rows = [{ id: 'm1', sender_id: 'client', body: 'My budget is 50 dollars to 100 dollars for the review.' }]
    expect(extractClientBudget(rows, 'client')).toMatchObject({ minCents: 5_000, maxCents: 10_000 })
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

  test.each([
    ['2000', 200_000],
    ['2,000', 200_000],
    ['2k', 200_000],
    ['around 2000', 200_000],
  ])('accepts bare numeric budget reply %s after YQAA asks for USD budget', (body, maxCents) => {
    const rows = [
      { id: 'a1', sender_id: 'provider', body: 'Before I price this, what budget range are you working with in USD?', metadata: { ai_generated: true } },
      { id: 'm2', sender_id: 'client', body },
    ]
    expect(extractClientBudget(rows, 'client')).toMatchObject({
      maxCents,
      currency: 'usd',
      confidence: 'reply-to-budget-question',
    })
  })

  test('accepts a bare numeric range after a budget question', () => {
    const rows = [
      { id: 'a1', sender_id: 'provider', body: 'What budget range are you working with in USD?', metadata: { ai_generated: true } },
      { id: 'm2', sender_id: 'client', body: '1500-2000' },
    ]
    expect(extractClientBudget(rows, 'client')).toMatchObject({
      minCents: 150_000,
      maxCents: 200_000,
      currency: 'usd',
      confidence: 'reply-to-budget-question',
    })
  })

  test('infers CAD from YQAA budget question for a bare numeric reply', () => {
    const rows = [
      { id: 'a1', sender_id: 'provider', body: 'What budget range are you working with in CAD?', metadata: { ai_generated: true } },
      { id: 'm2', sender_id: 'client', body: '2000' },
    ]
    expect(extractClientBudget(rows, 'client')).toMatchObject({ maxCents: 200_000, currency: 'cad' })
  })

  test('does not treat an unrelated bare number as budget evidence', () => {
    const rows = [
      { id: 'a1', sender_id: 'provider', body: 'How many documents do you have?', metadata: { ai_generated: true } },
      { id: 'm2', sender_id: 'client', body: '2000' },
    ]
    expect(extractClientBudget(rows, 'client')).toBeNull()
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

  test('lowBudgetReply never leaks revenue-safe or floor/mean math and offers empathy + paths', () => {
    const p = pricing({ status: 'budget_too_low', budget: { ...pricing().budget!, maxCents: 10_000 } })
    const reply = lowBudgetReply(p)
    expect(reply.toLowerCase()).not.toContain('revenue-safe')
    expect(reply).not.toMatch(/\$\s*\d/) // no dollar-floor / mean dump
    expect(reply).toMatch(/narrow|provider/i)
    expect(reply).toMatch(/thanks|hear|understand|upfront/i)
  })

  test('budget_too_low guard still blocks (server authority unchanged) with the empathetic template', () => {
    const result = guardMessengerOffer({ pricing: pricing({ status: 'budget_too_low' }) })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('budget_too_low')
      expect(result.reply.toLowerCase()).not.toContain('revenue-safe')
      expect(result.reply).not.toMatch(/\$\s*\d/)
    }
  })

  test('clientFrustrationOrExit catches Foley-style frustration and exit intent', () => {
    expect(clientFrustrationOrExit('This is not helpful and feels like a waste of my time; I still do not understand what is included or what happens next.')).toBe(true)
    expect(clientFrustrationOrExit('wow AI really just stops at the buck lol')).toBe(true)
    expect(clientFrustrationOrExit("I'll go ask another AI then")).toBe(true)
    expect(clientFrustrationOrExit('never mind, forget it')).toBe(true)
    expect(clientFrustrationOrExit('this is useless and a waste of my time')).toBe(true)
    expect(clientFrustrationOrExit('ok so what documents do I need next?')).toBe(false)
    expect(clientFrustrationOrExit('')).toBe(false)
  })

  test('isNearDuplicateReply detects identical and near-identical replies', () => {
    const prior = 'Thanks for sharing all of that context about your application timeline and goals. Here is what usually matters most for this pathway with the documents you described.'
    expect(isNearDuplicateReply(prior, [prior])).toBe(true)
    expect(isNearDuplicateReply(`${prior} Extra tail sentence.`, [prior])).toBe(true)
    expect(isNearDuplicateReply('Completely different short reply.', [prior])).toBe(false)
    expect(isNearDuplicateReply('', [prior])).toBe(false)
  })

  test('budgetGapReplyAlreadySent detects a prior budget-gap explanation', () => {
    const gapReply = lowBudgetReply(pricing({ status: 'budget_too_low' }))
    expect(budgetGapReplyAlreadySent([gapReply])).toBe(true)
    expect(budgetGapReplyAlreadySent(['Hi there, happy to help with your application!'])).toBe(false)
    expect(budgetGapReplyAlreadySent([])).toBe(false)
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
