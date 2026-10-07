import fs from 'node:fs'
import path from 'node:path'
import { buildOfferIntakeAssessment } from '@/lib/messengerOfferIntake'
import { buildGroundedConversationMemory, type YqaaConversationMemory } from '@/lib/messengerConversationMemory'
import { countFollowUpsSinceLatestClient, followUpDue, FOLLOW_UP_DELAYS_MS } from '@/lib/messengerFollowups'
import type { PricingAuthority } from '@/lib/messengerPricingAuthority'

function pricing(overrides: Partial<PricingAuthority> = {}): PricingAuthority {
  return {
    status: 'ready',
    currency: 'usd',
    intent: {
      categoryId: 'immigration',
      categoryName: 'Immigration Services',
      subcategoryId: 'study-permits',
      subcategoryName: 'Study Permits',
      url: 'https://market.yousafeconsultancy.com/categories/immigration',
      score: 18,
      confidence: 'high',
    },
    budget: {
      minCents: null,
      maxCents: 100_000,
      currency: 'usd',
      sourceText: 'My budget is $1000',
      messageId: 'c1',
      confidence: 'explicit',
    },
    market: null,
    provider: null,
    empirical: null,
    empiricalIncluded: false,
    referenceMeanCents: 90_000,
    minimumAutoOfferCents: 76_500,
    evidenceHighCents: 120_000,
    providerGigIds: ['gig-1'],
    providerRelevantGigIds: ['gig-1'],
    comparableGigIds: ['gig-1'],
    comparableTitles: ['Canada study permit support'],
    platformMinimumCents: 100,
    platformMaximumCents: 500_000,
    rationale: [],
    ...overrides,
  }
}

function memory(overrides: Partial<YqaaConversationMemory> = {}): YqaaConversationMemory {
  return {
    version: 1,
    updated_at: new Date(0).toISOString(),
    budget: pricing().budget,
    markets: ['Canada'],
    marketplace_scope: {
      category_id: 'immigration',
      category_name: 'Immigration Services',
      subcategory_id: 'study-permits',
      subcategory_name: 'Study Permits',
    },
    client_highlights: [],
    deadline_highlights: [],
    document_highlights: [],
    latest_goal: null,
    provider_attention: {
      requested_at: null,
      pending: false,
      human_reply_after_request: false,
    },
    offer_intake: null,
    last_offer: null,
    ...overrides,
  }
}

describe('YQAA deterministic order intake on current main', () => {
  test('blocks a budget plus broad service label from becoming offer-ready', () => {
    const p = pricing()
    const messages = [
      { id: 'c1', sender_id: 'client', body: 'Send me an offer I have budget of $1000 for Canada study permit' },
    ]
    const result = buildOfferIntakeAssessment({ messages, clientId: 'client', pricing: p, memory: memory() })

    expect(result.status).toBe('needs_clarification')
    expect(result.missing).toEqual(expect.arrayContaining(['deliverable', 'timing', 'starting_point']))
  })

  test('allows offer readiness only after material scope, timing and starting point are grounded', () => {
    const p = pricing()
    const text = 'I need a Canada study permit application review. I already have my passport and admission letter, and my deadline is next Friday. My budget is $1000.'
    const result = buildOfferIntakeAssessment({
      messages: [{ id: 'c1', sender_id: 'client', body: text }],
      clientId: 'client',
      pricing: p,
      memory: memory({ deadline_highlights: [text], document_highlights: [text] }),
    })

    expect(result.status).toBe('ready')
    expect(result.missing).toEqual([])
  })

  test('grounded memory downgrades incomplete scope while preserving provider-attention state', () => {
    const p = pricing()
    const result = buildGroundedConversationMemory({
      clientId: 'client',
      pricing: p,
      metadata: {
        ai_provider_attention_requested: true,
        ai_provider_attention_requested_at: '2026-09-14T00:00:00.000Z',
      },
      messages: [
        { id: 'c1', sender_id: 'client', body: 'Send me an offer I have budget of $1000 for Canada study permit' },
      ],
    })

    expect(p.status).toBe('insufficient_scope')
    expect(result.offer_intake?.status).toBe('needs_clarification')
    expect(result.provider_attention).toBeDefined()
  })
})

describe('YQAA silence-cycle follow-ups', () => {
  const base = Date.parse('2026-09-09T12:00:00Z')

  test('waits 24h for the first follow-up, 72h for the second, then stops', () => {
    expect(followUpDue({ nowMs: base + FOLLOW_UP_DELAYS_MS[0] - 1, lastMessageAt: base, followUpCount: 0, aiMode: 'auto', lastWasYqaa: true })).toBe(false)
    expect(followUpDue({ nowMs: base + FOLLOW_UP_DELAYS_MS[0], lastMessageAt: base, followUpCount: 0, aiMode: 'auto', lastWasYqaa: true })).toBe(true)
    expect(followUpDue({ nowMs: base + FOLLOW_UP_DELAYS_MS[1], lastMessageAt: base, followUpCount: 1, aiMode: 'auto', lastWasYqaa: true })).toBe(true)
    expect(followUpDue({ nowMs: base + 30 * 24 * 60 * 60 * 1000, lastMessageAt: base, followUpCount: 2, aiMode: 'auto', lastWasYqaa: true })).toBe(false)
  })

  test('does not follow up while paused or after a terminal offer', () => {
    expect(followUpDue({ nowMs: base + 7 * 86400000, lastMessageAt: base, followUpCount: 0, aiMode: 'paused', lastWasYqaa: true })).toBe(false)
    expect(followUpDue({ nowMs: base + 7 * 86400000, lastMessageAt: base, followUpCount: 0, aiMode: 'auto', lastWasYqaa: true, terminalOffer: true })).toBe(false)
  })

  test('a client reply starts a fresh silence cycle', () => {
    const rows = [
      { sender_id: 'client', body: 'Initial question' },
      { sender_id: 'provider', body: 'Answer', metadata: { ai_generated: true } },
      { sender_id: 'provider', body: 'Checking in', metadata: { ai_generated: true, ai_follow_up: true } },
      { sender_id: 'client', body: 'Thanks, I also need document review' },
      { sender_id: 'provider', body: 'What deadline are you working with?', metadata: { ai_generated: true } },
    ]
    expect(countFollowUpsSinceLatestClient(rows, 'client')).toBe(0)
  })
})

describe('Marketplace-started offer checkout parity', () => {
  test('ChatSidePane preserves real offer data and mounts shared payment UI', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'components/marketplace/ChatSidePane.tsx'), 'utf8')
    expect(source).toMatch(/MessageOfferCard/)
    expect(source).toMatch(/OfferPaymentModal/)
    expect(source).toMatch(/offer:\s*m\.offer\s*\|\|\s*null/)
    expect(source).toMatch(/setPayingOfferId\(offerId\)/)
    expect(source).toMatch(/open=\{!!payingOfferId\}/)
  })

  test('the canonical accept endpoint still creates the paid order', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'app/api/offers/[id]/accept/route.ts'), 'utf8')
    expect(source).toMatch(/createPaidOrder/)
    expect(source).toMatch(/orderId:\s*order\.id/)
  })

  test('the newer escalation-aware client auto-reply entry point remains in use', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'app/api/messages/start/route.ts'), 'utf8')
    expect(source).toContain('scheduleClientAutoReply')
    expect(source).not.toContain('messengerCommerceOrchestrator')
  })
})
