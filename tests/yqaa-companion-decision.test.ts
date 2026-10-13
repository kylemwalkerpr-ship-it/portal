/**
 * Companion decision plane tests (deterministic gates first, Jev advisory second).
 *
 * Jev is always injected/mocked here: no test depends on the TypeSafe account.
 * The DM-path assertion drives the REAL messenger wiring helper with a recorded
 * global fetch, so "the DM path calls Jev when the key is configured" is proven
 * end to end without opening a socket.
 */
import {
  buildCompanionDecision,
  defaultNegotiationAction,
  deterministicCompanionGate,
  eligiblePostures,
  inferJourneyStage,
  renderDecisionAuthority,
  type CompanionDecisionArgs,
} from '@/lib/yqaaCompanionDecision'
import type { CompanionJevContext, CompanionJevResult } from '@/lib/jevAdvisory'
import { buildAdaptivePricingDecision, type AdaptivePricingDecision } from '@/lib/yqaaAdaptivePricing'
import type { PricingAuthority } from '@/lib/messengerPricingAuthority'

const CLIENT = 'client-1'
const PROVIDER = 'provider-1'

function jevStub(result: CompanionJevResult, seen?: CompanionJevContext[]) {
  return (async (ctx: CompanionJevContext) => {
    seen?.push(ctx)
    return result
  }) as any
}

const jevUnavailable: CompanionJevResult = { available: false, reason: 'not_configured' }
const jevSufficient: CompanionJevResult = {
  available: true,
  posture: 'EDUCATE',
  negotiationPosture: null,
  sufficient: true,
  confidence: 0.92,
  needsHandoff: false,
  market: 'canada',
  ignored: [],
}

function args(overrides: Partial<CompanionDecisionArgs> = {}): CompanionDecisionArgs {
  return {
    channel: 'dm',
    redactedQuery: 'How does PR through marriage work?',
    evidence: [],
    pricing: null,
    frustration: false,
    duplicateRisk: false,
    budgetGapExplained: false,
    hasNewScopeOrCounter: false,
    commerceIntent: false,
    jevRequest: jevStub(jevUnavailable),
    ...overrides,
  }
}

// ── pricing decision fixture (real module, in-memory db) ────────────────────

const PRICING_AUTHORITY: PricingAuthority = {
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
}

function dbStub(gigs: any[]) {
  return {
    from: (table: string) => {
      const rows = () => (table === 'gigs' ? { data: gigs, error: null } : { data: [], error: null })
      const builder: any = {
        select() { return builder },
        eq() { return builder },
        in() { return builder },
        limit() { return builder },
        order() { return builder },
        maybeSingle: async () => ({ data: null, error: null }),
        then: (resolve: any, reject: any) => Promise.resolve(rows()).then(resolve, reject),
      }
      return builder
    },
  }
}

async function pricingDecision(body: string): Promise<AdaptivePricingDecision> {
  const gig = {
    id: 'gig-1',
    title: 'Full preparation',
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
    tiers: [
      {
        id: 'tier-full',
        gig_id: 'gig-1',
        tier: 'basic',
        title: 'Complete application preparation',
        description: null,
        price: 40_000,
        delivery_days: 5,
        revisions: 1,
        is_active: true,
        features: ['Full preparation'],
        scope_depth: 'full',
        scope_units: 20,
      },
    ],
  }
  return buildAdaptivePricingDecision({
    db: dbStub([gig]),
    provider: { id: PROVIDER, role: 'attorney' },
    client: { id: CLIENT },
    messages: [{ id: 'm1', sender_id: CLIENT, body, metadata: {} }],
    latestClientText: body,
    pricing: PRICING_AUTHORITY,
    settings: { minimum_offer_amount_cents: 100, maximum_offer_amount_cents: 500_000, primary_currency: 'usd' },
  })
}

describe('companion decision — deterministic gates', () => {
  test('an orientation question resolves to EDUCATE', async () => {
    const decision = await buildCompanionDecision(args())
    expect(decision.posture).toBe('EDUCATE')
    expect(decision.escalate).toBe(false)
    expect(decision.jev).toBeNull()
    expect(decision.reasons).toContain('jev_unavailable_not_configured')
    expect(renderDecisionAuthority(decision)).toContain('posture: EDUCATE')
  })

  test('frustration escalates even when Jev reports the evidence is sufficient', async () => {
    const decision = await buildCompanionDecision(args({
      frustration: true,
      jevRequest: jevStub(jevSufficient),
    }))
    expect(decision.posture).toBe('EMPATHIZE')
    expect(decision.escalate).toBe(true)
    expect(decision.reasons).toContain('client_frustration_or_exit')
    // Jev was consulted but cannot clear the gate.
    expect(decision.jev?.available).toBe(true)
    expect(decision.jev?.used).toBe(false)
  })

  test('high-stakes matters escalate and prune the posture set to escalation', async () => {
    expect(eligiblePostures({ channel: 'dm', highStakes: true })).toEqual(['ESCALATE_PROVIDER', 'ABSTAIN'])
    const decision = await buildCompanionDecision(args({
      redactedQuery: 'What are my chances of winning my removal case?',
      highStakes: true,
      jevRequest: jevStub(jevSufficient),
    }))
    expect(decision.posture).toBe('ESCALATE_PROVIDER')
    expect(decision.escalate).toBe(true)
  })

  test('missing legal evidence forces a provider handoff even when Jev says sufficient', async () => {
    const decision = await buildCompanionDecision(args({
      missingLegalEvidence: true,
      jevRequest: jevStub(jevSufficient),
    }))
    expect(decision).toMatchObject({ posture: 'ESCALATE_PROVIDER', escalate: true })
    expect(decision.reasons).toContain('legal_evidence_missing')
  })

  test('Jev-reported insufficient evidence forces a provider handoff', async () => {
    const decision = await buildCompanionDecision(args({
      evidence: [{ id: 'kb-1', title: 'A source', body: 'Some relevant source text', site: 'canada' } as any],
      evidenceSensitive: true,
      jevRequest: jevStub({ ...jevSufficient, sufficient: false, confidence: 0.4 }),
    }))
    expect(decision).toMatchObject({ posture: 'ESCALATE_PROVIDER', escalate: true })
    expect(decision.reasons).toContain('jev_evidence_insufficient')
  })

  test('a budget gap already explained with no new scope or counter escalates', async () => {
    const gate = deterministicCompanionGate({
      channel: 'dm',
      frustration: false,
      duplicateRisk: false,
      budgetGapExplained: true,
      hasNewScopeOrCounter: false,
    })
    expect(gate).toMatchObject({ posture: 'ESCALATE_PROVIDER', escalate: true, reason: 'budget_gap_already_explained' })
    const withNewScope = await buildCompanionDecision(args({
      budgetGapExplained: true,
      hasNewScopeOrCounter: true,
      commerceIntent: true,
    }))
    expect(withNewScope.escalate).toBe(false)
  })

  test('a duplicate-reply risk escalates instead of looping', async () => {
    const decision = await buildCompanionDecision(args({ duplicateRisk: true }))
    expect(decision.posture).toBe('ESCALATE_PROVIDER')
    expect(decision.escalate).toBe(true)
    expect(decision.reasons).toContain('duplicate_reply_risk')
  })
})

describe('companion decision — Jev integration', () => {
  test('a Jev timeout never throws and falls back to deterministic policy', async () => {
    const decision = await buildCompanionDecision(args({
      jevRequest: jevStub({ available: false, reason: 'timeout' }),
    }))
    expect(decision.posture).toBe('EDUCATE')
    expect(decision.escalate).toBe(false)
    expect(decision.jev).toBeNull()
    expect(decision.reasons).toContain('jev_unavailable_timeout')
  })

  test('a Jev throw is contained and deterministic policy still answers', async () => {
    const decision = await buildCompanionDecision(args({
      jevRequest: (async () => { throw new Error('socket hang up') }) as any,
      commerceIntent: true,
    }))
    expect(decision.posture).toBe('COMMERCE')
    expect(decision.reasons).toContain('jev_unavailable_exception')
  })

  test('Jev may not pick a pruned posture or action', async () => {
    const pricing = await pricingDecision('Please prepare my 20 pages. Could you do it for $340?')
    expect(pricing.eligible_actions.length).toBeGreaterThan(0)
    const pruned = pricing.eligible_actions.filter((action) => action !== 'QUOTE')
    const decision = await buildCompanionDecision(args({
      pricing,
      commerceIntent: true,
      hasNewScopeOrCounter: true,
      jevRequest: jevStub({
        available: true,
        posture: 'HANDOFF_SUPPORT',
        negotiationPosture: pruned.includes('MEET_MIDDLE') ? 'MEET_MIDDLE' : pruned[0],
        sufficient: false,
        confidence: 0.4,
        needsHandoff: false,
        market: 'canada',
        ignored: [],
      }),
    }))
    expect(decision.posture).toBe('NEGOTIATE')
    expect(decision.reasons).toContain('jev_posture_not_eligible_HANDOFF_SUPPORT')
    expect(pruned).toContain(decision.negotiationAction as any)
    expect(decision.jev?.used).toBe(true)
  })

  test('a Jev answer outside the pruned negotiation set is ignored in favour of the default', async () => {
    const pricing = await pricingDecision('Please prepare my 20 pages. Could you do it for $340?')
    expect(pricing.eligible_actions).not.toContain('HOLD_VALUE')
    const decision = await buildCompanionDecision(args({
      pricing,
      commerceIntent: true,
      hasNewScopeOrCounter: true,
      jevRequest: jevStub({
        available: true,
        posture: 'NEGOTIATE',
        negotiationPosture: 'HOLD_VALUE',
        sufficient: true,
        confidence: 0.8,
        needsHandoff: false,
        market: 'canada',
        ignored: [],
      }),
    }))
    expect(decision.negotiationAction).toBe(defaultNegotiationAction({
      counterClass: pricing.counter_class,
      eligible: pricing.eligible_actions,
      hasDownscopeOption: pricing.eligible_actions.includes('DOWNSCOPE'),
    }))
  })

  test('the Jev request payload never contains cents, rates or floors', async () => {
    const seen: CompanionJevContext[] = []
    const pricing = await pricingDecision('Please prepare my 20 pages. Could you do it for $340?')
    await buildCompanionDecision(args({
      pricing,
      commerceIntent: true,
      hasNewScopeOrCounter: true,
      jevRequest: jevStub(jevSufficient, seen),
    }))
    expect(seen.length).toBe(1)
    const payload = JSON.stringify(seen[0])
    expect(payload).not.toMatch(/\b\d{3,}\b(?!\d*"?\})/) // no raw cents figures
    expect(seen[0].counterBucket).toBe(pricing.counter_class)
    expect(seen[0].scopeDepth).toBe(pricing.scope.depth)
    expect(seen[0].negotiationOptions).toEqual(pricing.eligible_actions.filter((action) => action !== 'QUOTE'))
  })
})

describe('companion decision — DM path wiring', () => {
  const originalFetch = globalThis.fetch

  test('the DM path calls Jev when TYPESAFE_API_KEY is configured (mock asserted)', async () => {
    const calls: Array<{ url: string; body: string }> = []
    process.env.TYPESAFE_API_KEY = 'typesafe-test-key'
    globalThis.fetch = (async (url: any, init: any) => {
      calls.push({ url: String(url), body: String(init?.body || '') })
      const payload = JSON.parse(String(init?.body || '{}'))
      const postures = Object.keys(payload.questions.posture.criteria)
      const postureProbabilities = Object.fromEntries(postures.map((option: string, index: number) => [option, index === 0 ? 0.8 : 0.2 / (postures.length - 1)]))
      const markets = Object.keys(payload.questions.market.criteria)
      const marketProbabilities = Object.fromEntries(markets.map((option: string) => [option, option === 'canada' ? 0.9 : option === 'global' ? 0.1 : 0]))
      return new Response(
        JSON.stringify({
          answers: {
            posture: { type: 'choice', choice: postures[0], probabilities: postureProbabilities, confidence: 0.6 },
            sufficient: { type: 'noul', noul: 0.9 },
            needs_handoff: { type: 'noul', noul: 0.1 },
            market: { type: 'choice', choice: 'canada', probabilities: marketProbabilities, confidence: 0.8 },
          },
        }),
        { status: 200 },
      )
    }) as unknown as typeof fetch

    try {
      const { buildMessengerDecisionAuthority } = await import('@/lib/messengerAi')
      const decision = await buildMessengerDecisionAuthority({
        latestClientText: 'I could do $50 to $100 for a consult, happy to do the legwork.',
        adaptive: null,
        memory: null,
        frustrated: false,
        budgetGapAlreadyExplained: false,
        hasNewScopeOrCounter: false,
      })
      expect(calls.length).toBe(1)
      expect(calls[0].url).toBe('https://api.typesafe.ai/v1/systemone')
      expect(calls[0].body).toContain('posture')
      expect(calls[0].body).not.toMatch(/\$\s*\d|\b5000\b|\b10000\b/)
      expect(calls[0].body).toContain('"posture"')
      expect(decision.jev).not.toBeNull()
      expect(decision.jev?.choiceDiagnostics).toMatchObject({ posture: { confidence: 0.6, selectedProbability: 0.8 }, market: { confidence: 0.8, selectedProbability: 0.9 } })
      expect(decision.posture).toBe('EDUCATE')
    } finally {
      globalThis.fetch = originalFetch
      delete process.env.TYPESAFE_API_KEY
    }
  })

  test('without a key the DM path makes no Jev call and still decides deterministically', async () => {
    const calls: string[] = []
    delete process.env.TYPESAFE_API_KEY
    globalThis.fetch = (async (url: any) => {
      calls.push(String(url))
      return new Response('{}', { status: 200 })
    }) as unknown as typeof fetch
    try {
      const { buildMessengerDecisionAuthority } = await import('@/lib/messengerAi')
      const decision = await buildMessengerDecisionAuthority({
        latestClientText: 'What documents do I need for PR through marriage?',
        adaptive: null,
        memory: null,
        frustrated: true,
        budgetGapAlreadyExplained: false,
        hasNewScopeOrCounter: false,
      })
      expect(calls).toEqual([])
      expect(decision.posture).toBe('EMPATHIZE')
      expect(decision.escalate).toBe(true)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('omits singleton Choice questions and deterministically selects a singleton eligible posture', async () => {
    const { companionJevPayload, requestCompanionJev } = await import('@/lib/jevAdvisory')
    const context: CompanionJevContext = { query: 'Hello', postureOptions: ['EDUCATE'], negotiationOptions: ['HOLD_VALUE'] }
    const payload = companionJevPayload(context)
    const marketProbabilities = Object.fromEntries(Object.keys((payload.questions.market as any).criteria).map((option: string) => [option, option === 'global' ? 0.8 : 0.04]))
    expect(payload.questions).not.toHaveProperty('posture')
    expect(payload.questions).not.toHaveProperty('negotiation_posture')
    const fetcher = (async () => new Response(JSON.stringify({ answers: {
      sufficient: { type: 'noul', noul: 0.9 }, needs_handoff: { type: 'noul', noul: 0.1 },
      market: { type: 'choice', choice: 'global', probabilities: marketProbabilities, confidence: 0.8 },
    } }), { status: 200 })) as typeof fetch
    await expect(requestCompanionJev(context, fetcher, { apiKey: 'test' })).resolves.toMatchObject({ available: true, posture: 'EDUCATE', negotiationPosture: 'HOLD_VALUE' })
    expect(companionJevPayload({ ...context, postureOptions: [] }).questions).not.toHaveProperty('posture')
    expect(companionJevPayload({ ...context, negotiationOptions: [] }).questions).not.toHaveProperty('negotiation_posture')
  })

  test('rejects a Choice answer with missing contract fields and preserves only bounded selection diagnostics', async () => {
    const { requestCompanionJev } = await import('@/lib/jevAdvisory')
    const context: CompanionJevContext = { query: 'Hello', postureOptions: ['EDUCATE', 'DISCOVER'] }
    const response = (answers: unknown) => new Response(JSON.stringify({ answers }), { status: 200 })
    const marketProbabilities = { usa: 0.04, canada: 0.04, uk: 0.04, australia: 0.04, global: 0.8, unknown: 0.04 }
    const incomplete = (async () => response({
      sufficient: { type: 'noul', noul: 0.9 }, needs_handoff: { type: 'noul', noul: 0.1 },
      market: { type: 'choice', choice: 'global', probabilities: marketProbabilities, confidence: 0.8 },
      posture: { choice: 'EDUCATE' },
    })) as typeof fetch
    await expect(requestCompanionJev(context, incomplete, { apiKey: 'test' })).resolves.toEqual({ available: false, reason: 'invalid_response' })

    const valid = (async () => response({
      sufficient: { type: 'noul', noul: 0.9 }, needs_handoff: { type: 'noul', noul: 0.1 },
      market: { type: 'choice', choice: 'global', probabilities: marketProbabilities, confidence: 0.6 },
      posture: { type: 'choice', choice: 'EDUCATE', probabilities: { EDUCATE: 0.7, DISCOVER: 0.3 }, confidence: 0.4 },
    })) as typeof fetch
    await expect(requestCompanionJev(context, valid, { apiKey: 'test' })).resolves.toMatchObject({
      available: true, posture: 'EDUCATE', choiceDiagnostics: { posture: { confidence: 0.4, selectedProbability: 0.7 }, market: { confidence: 0.6, selectedProbability: 0.8 } },
    })
  })

  test.each([[401, 'http_401'], [422, 'http_422'], [429, 'http_429'], [529, 'http_529']] as const)(
    'returns safe finite diagnostics for HTTP %i without reading the response body', async (status, reason) => {
      const { requestCompanionJev } = await import('@/lib/jevAdvisory')
      const fetcher = (async () => new Response('private provider detail and payload', { status })) as typeof fetch
      await expect(requestCompanionJev({ query: 'hello', postureOptions: [] }, fetcher, { apiKey: 'test' })).resolves.toEqual({ available: false, reason })
    },
  )

  test('classifies transport failures without retaining exception text', async () => {
    const { requestCompanionJev } = await import('@/lib/jevAdvisory')
    const fetcher = (async () => { throw new Error('socket failed while sending private payload') }) as typeof fetch
    await expect(requestCompanionJev({ query: 'hello', postureOptions: [] }, fetcher, { apiKey: 'test' })).resolves.toEqual({ available: false, reason: 'network_error' })
  })

  test('rejects oversized response bodies and an already-aborted caller deadline', async () => {
    const { requestCompanionJev } = await import('@/lib/jevAdvisory')
    const context: CompanionJevContext = { query: 'Hello', postureOptions: [] }
    const oversized = (async () => new Response('x'.repeat(4097), { status: 200 })) as typeof fetch
    await expect(requestCompanionJev(context, oversized, { apiKey: 'test' })).resolves.toEqual({ available: false, reason: 'invalid_response' })
    const controller = new AbortController()
    controller.abort()
    const stalled = (async () => new Promise<Response>(() => {})) as typeof fetch
    await expect(requestCompanionJev(context, stalled, { apiKey: 'test', signal: controller.signal })).resolves.toEqual({ available: false, reason: 'timeout' })
  })

  test('aborts an in-flight response body at the caller deadline', async () => {
    const { requestCompanionJev } = await import('@/lib/jevAdvisory')
    const controller = new AbortController()
    let cancelCalled = false
    const fetcher = (async () => {
      return new Response(new ReadableStream({
        pull() { return new Promise(() => {}) },
        cancel() { cancelCalled = true },
      }))
    }) as typeof fetch
    const pending = requestCompanionJev({ query: 'hello', postureOptions: [] }, fetcher, { apiKey: 'test', timeoutMs: 20, signal: controller.signal })
    await expect(pending).resolves.toEqual({ available: false, reason: 'timeout' })
    expect(cancelCalled).toBe(true)
  })

  test('a pre-aborted signal prevents fetching', async () => {
    const { requestCompanionJev } = await import('@/lib/jevAdvisory')
    const controller = new AbortController()
    controller.abort()
    const fetcher = jest.fn(async () => new Response('{}')) as unknown as typeof fetch
    await expect(requestCompanionJev({ query: 'hello', postureOptions: [] }, fetcher, { apiKey: 'test', signal: controller.signal }))
      .resolves.toEqual({ available: false, reason: 'timeout' })
    expect(fetcher).not.toHaveBeenCalled()
  })
})

describe('companion decision — journey stage', () => {
  test('classifies orientation, documents, commerce and exit risk deterministically', () => {
    expect(inferJourneyStage({ latestClientText: 'What are my options for PR?', frustration: false, hasOffer: false })).toBe('pathway_map')
    expect(inferJourneyStage({ latestClientText: 'I have my transcripts and forms ready', frustration: false, hasOffer: false })).toBe('docs_gather')
    expect(inferJourneyStage({ latestClientText: 'ok', frustration: false, hasOffer: false, pricingStatus: 'negotiating' })).toBe('post_offer')
    expect(inferJourneyStage({ latestClientText: 'never mind', frustration: true, hasOffer: false })).toBe('exit_risk')
    expect(inferJourneyStage({ latestClientText: 'I got an eviction notice', frustration: false, hasOffer: false })).toBe('crisis')
    expect(inferJourneyStage({ latestClientText: 'hi', frustration: false, hasOffer: false, scopeDepth: 'consult' })).toBe('consult_ready')
  })
})
