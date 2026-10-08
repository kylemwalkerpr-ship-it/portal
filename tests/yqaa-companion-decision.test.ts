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

  test('the DM path uses TYPESAFE_API_KEY when Cloudflare bindings are unavailable locally', async () => {
    const calls: Array<{ url: string; body: string }> = []
    process.env.TYPESAFE_API_KEY = 'typesafe-test-key'
    globalThis.fetch = (async (url: any, init: any) => {
      calls.push({ url: String(url), body: String(init?.body || '') })
      return new Response(
        JSON.stringify({
          answers: {
            posture: { choice: 'EDUCATE' },
            sufficient: { noul: 0.9 },
            needs_handoff: { noul: 0.1 },
            market: { choice: 'canada' },
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
