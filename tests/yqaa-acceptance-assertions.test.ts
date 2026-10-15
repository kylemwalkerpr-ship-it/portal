const { counterofferAcknowledged, orientationAddressesContext, containsMechanicalOrientationCopy, exactSyntheticCounterApproval, runIndependentCategories } = require('../scripts/yqaa-acceptance-assertions.cjs')

describe('category-aware YQAA orientation', () => {
  test.each([
    ['education', 'We can start with a university application checklist.'],
    ['academic-writing', 'Let’s begin with the essay prompt, school requirements, and word count.'],
    ['mentorship', 'We can map out a study plan around your goals as a student.'],
  ])('checks the context vocabulary for %s', (category, reply) => {
    expect(orientationAddressesContext(category, reply)).toBe(true)
  })

  test('rejects unrelated or unknown category vocabulary', () => {
    expect(orientationAddressesContext('academic-writing', 'I can help organize your university documents.')).toBe(false)
    expect(orientationAddressesContext('unknown', 'I can help with your essay.')).toBe(false)
  })

  test('rejects the robotic opening and Marketplace-price fallback', () => {
    expect(containsMechanicalOrientationCopy('I’m YQAA, an AI assistant. I can help you through this one step at a time.')).toBe(true)
    expect(containsMechanicalOrientationCopy('I don’t have enough verified Marketplace pricing for this exact scope.')).toBe(true)
    expect(containsMechanicalOrientationCopy('Let’s compare the residence routes and the documents you may need.')).toBe(false)
  })
})

describe('synthetic provider pricing-approval fence', () => {
  const request = {
    triggerMessageId: 'counter-trigger', counterCents: 13950, scopeHash: 'three-doc-scope',
    runMarker: 'this-run', providerRole: 'consultant',
  }
  const metadata = {
    yqaa_live_acceptance: true, yqaa_live_acceptance_run: 'this-run', ai_mode: 'paused', ai_pricing_approval_status: 'pending', ai_pricing_approval_pending: true,
    ai_pricing_approval_request_id: 'counter-trigger', ai_pricing_approval_version: 1,
    ai_pricing_approval_price_cents: 13950, ai_pricing_approval_scope_hash: 'three-doc-scope', ai_last_scope_hash: 'three-doc-scope',
  }

  test('allows only the exact current hidden fixture counter', () => {
    expect(exactSyntheticCounterApproval(metadata, request)).toBe(true)
  })

  test.each([
    [{ ...metadata, yqaa_live_acceptance: false }, request],
    [{ ...metadata, yqaa_live_acceptance_run: 'another-run' }, request],
    [{ ...metadata, ai_pricing_approval_request_id: 'older-trigger' }, request],
    [{ ...metadata, ai_pricing_approval_version: 2 }, request],
    [{ ...metadata, ai_pricing_approval_price_cents: 15500 }, request],
    [{ ...metadata, ai_pricing_approval_scope_hash: 'other-scope' }, request],
    [{ ...metadata, ai_mode: 'auto' }, request],
    [{ ...metadata, ai_pricing_approval_status: 'approved' }, request],
    [metadata, { ...request, providerRole: 'client' }],
  ])('refuses approval when fixture identity or exact request differs', (candidate, options) => {
    expect(exactSyntheticCounterApproval(candidate, options)).toBe(false)
  })
})

const scopeHash = 'synthetic-three-document-scope'
const triggerMessageId = 'trigger-current'
const baseState = {
  quoteCents: 15500,
  counterCents: 13950,
  scopeHash,
  triggerMessageId,
  metadata: {
    ai_last_trigger_message_id: triggerMessageId,
    ai_last_pricing_status: 'provider_approval_required',
    ai_memory: { negotiation: {
      quotes_made: [{ cents: 15500, scope_hash: scopeHash }],
      client_counters: [{ cents: 13950, message_id: triggerMessageId }],
    } },
  },
}

function pendingReviewState() {
  return {
    ...baseState,
    metadata: { ...baseState.metadata, ai_provider_attention_requested: true },
  }
}

function acceptedCounterState() {
  const offerId = 'offer-current'
  const cardId = 'card-current'
  const replyMessageId = 'reply-current'
  const card = {
    id: cardId,
    conversation_id: 'conversation-current',
    sender_id: 'provider-current',
    type: 'offer',
    ref_offer_id: offerId,
    metadata: { ai_generated: true, pricing_guarded: true, price: 13950, currency: 'usd', pricing_scope_hash: scopeHash },
  }
  return {
    ...baseState,
    metadata: {
      ...baseState.metadata,
      ai_last_offer_id: offerId,
      ai_last_message_id: replyMessageId,
      ai_last_trigger_message_id: triggerMessageId,
      ai_last_approved_price_cents: 13950,
      ai_last_scope_hash: scopeHash,
      ai_memory: {
        last_offer: { currency: 'usd' },
        negotiation: {
          ...baseState.metadata.ai_memory.negotiation,
          scope_current: { scope_hash: scopeHash, units: { unit: 'document', qty: 3 } },
          quotes_made: [...baseState.metadata.ai_memory.negotiation.quotes_made, { cents: 13950, scope_hash: scopeHash }],
        },
      },
    },
    committedOffer: {
      conversationId: 'conversation-current',
      triggerMessageId,
      replyMessageId,
      providerId: 'provider-current',
      clientId: 'client-current',
      commit: { conversation_id: 'conversation-current', trigger_message_id: triggerMessageId, reply_message_id: replyMessageId, offer_id: offerId },
      offer: { id: offerId, chat_id: 'conversation-current', sender_id: 'provider-current', recipient_id: 'client-current', price: 13950, currency: 'usd', status: 'pending' },
      card,
      visibleCard: { ...structuredClone(card), offer: { id: offerId, price_cents: 13950, currency: 'usd', status: 'pending' } },
    },
  }
}

describe('counteroffer acceptance evidence', () => {
  test('a provider review is acknowledged only for the exact current counter turn', () => {
    const body = 'Thanks for putting USD 139.50 forward. I’ve asked the provider to review that counter; their answer is still pending.'
    expect(counterofferAcknowledged(body, pendingReviewState())).toBe(true)
    expect(counterofferAcknowledged('Thanks for the USD 139.50 counter on the same narrowed scope. I’ve asked the provider, Ms Foley, to review it, and I’ll let you know as soon as I hear back.', pendingReviewState())).toBe(true)
    expect(counterofferAcknowledged('Your counter was USD 155.00. I’ve asked the provider to review USD 139.50.', pendingReviewState())).toBe(false)
    expect(counterofferAcknowledged('Thanks for your counter of USD 139.50 for the same work. I’ve sent it to Ms Foley to review.', pendingReviewState())).toBe(true)
    expect(counterofferAcknowledged(body, { ...pendingReviewState(), metadata: { ...pendingReviewState().metadata, ai_last_trigger_message_id: 'older-trigger' } })).toBe(false)
    expect(counterofferAcknowledged(body, { ...pendingReviewState(), triggerMessageId: 'older-trigger' })).toBe(false)
  })

  test('repeating the existing quote never acknowledges a lower client counter', () => {
    const oldQuoteReply = 'I hear your USD 139.50 counter. I can keep the three-document scope at USD 155; you can accept the current offer if it works.'
    expect(counterofferAcknowledged(oldQuoteReply, baseState)).toBe(false)
    expect(counterofferAcknowledged(oldQuoteReply, pendingReviewState())).toBe(false)
  })

  test('acceptance requires a visible, durable current-turn offer at the exact counter', () => {
    const state = acceptedCounterState()
    expect(counterofferAcknowledged('I can accept your USD 139.50 counter for the three-document scope.', state)).toBe(true)
    expect(counterofferAcknowledged('For that same narrowed scope — the three-document checklist — I can lock in USD 139.50.', state)).toBe(true)
    expect(counterofferAcknowledged('I can accept your USD 139.50 counter for the three-document scope.', baseState)).toBe(false)
    expect(counterofferAcknowledged('I can accept your USD 139.50 counter for the three-document scope.', { ...state, committedOffer: { ...state.committedOffer, offer: { ...state.committedOffer.offer, price: 15500 } } })).toBe(false)
    expect(counterofferAcknowledged('I can accept your USD 139.50 counter for the three-document scope.', { ...state, committedOffer: { ...state.committedOffer, visibleCard: null } })).toBe(false)
    expect(counterofferAcknowledged('I hear your USD 139.50 counter. I can lock in USD 155 for the three-document scope.', state)).toBe(false)
  })

  test('a natural provider-review handoff acknowledges the exact counter without claiming approval', () => {
    const body = 'Thanks for the USD 139.50 counter for the same work. I’ve sent it to Ms Foley to have a look, and I’ll let you know when I hear back.'
    expect(counterofferAcknowledged(body, pendingReviewState())).toBe(true)
  })

  test.each([
    'I accept your USD 139.50 counter. Provider review is still pending.',
    'I agreed to USD 139.50. I’ve asked the provider to review the counter.',
    'I approved your USD 139.50 counter, subject to the provider review.',
  ])('a pending-review reply cannot also claim the counter was accepted: %s', (body) => {
    expect(counterofferAcknowledged(body, pendingReviewState())).toBe(false)
  })

  test.each([
    'I hear your USD 139.50 counter. I can keep the three-document offer at USD 155.',
    'Your USD 139.50 is noted. The old quote is still USD 155 and available to accept.',
    'I can accept USD 139.50 if the provider approves it.',
    'I can offer USD 139.50 for a hotel instead of the three documents.',
    'I can accept USD 139.50 for six documents.',
    'I can accept CAD 139.50 for the three-document scope.',
    'A train costs USD 139.50; the provider can review your counter later.',
    'The provider may accept USD 139.50 for the three-document scope.',
  ])('does not treat an uncommitted or changed-scope reply as acceptance: %s', (body) => {
    expect(counterofferAcknowledged(body, pendingReviewState())).toBe(false)
    expect(counterofferAcknowledged(body, acceptedCounterState())).toBe(false)
  })

  test.each([
    'I hear your USD 139.50. I can offer zero application documents for USD 155.',
    'I hear your USD 139.50. For organizing twenty-three documents, I can meet you at USD 155.',
    'I hear your USD 139.50. For organizing three documents, I can meet you at USD 155 CAD.',
    'I hear your USD 139.50. For organizing six documents only, I can meet you at USD 155.',
    'I hear your USD 139.50. I can send the three documents, and a train ticket costs USD 155.',
    'I hear your USD 139.50. I can offer no documents for USD 155.',
    'I hear your USD 139.50. I can keep the documents unchanged and book a hotel for USD 155.',
    'I hear your USD 139.50. A hotel costs USD 155.',
    'I hear your USD 139.50. I cannot offer the three-document checklist at USD 155.',
    'I hear your USD 139.50. The three-document checklist is USD 155 if the provider approves.',
    'I hear your USD 139.50. The three-document checklist is USD 154.',
    'I hear your USD 139.50. For organizing three documents, I can meet you at USD 155 on-platform in NZD.',
    'I hear your USD 139.50. I can meet you at USD 155. The offer is in NZD and is final.',
    'I hear your USD 139.50. For the three-document checklist, which is out of scope, I can meet you at USD 155.',
    'I hear your USD 139.50. The three-document checklist is not included in the USD 155 offer.',
    'I can accept USD 139.50 if the provider approves it.',
    'I can accept USD 139.50 for a hotel instead of the three documents.',
    'I can accept USD 139.50 for six documents.',
    'I can accept CAD 139.50 for the three-document scope.',
    'The provider may accept USD 139.50 for the three-document scope.',
  ])('rejects unrelated, off-scope, conditional, or differently priced copy: %s', (body) => {
    expect(counterofferAcknowledged(body, acceptedCounterState())).toBe(false)
  })

  test('fails closed when the turn, scope, or counter evidence is missing', () => {
    const body = 'Thanks for putting USD 139.50 forward. I’ve asked the provider to review that counter; their answer is still pending.'
    const state = pendingReviewState()
    expect(counterofferAcknowledged(body, { ...state, metadata: { ...state.metadata, ai_memory: { negotiation: { ...state.metadata.ai_memory.negotiation, client_counters: [] } } } })).toBe(false)
    expect(counterofferAcknowledged(body, { ...state, metadata: { ...state.metadata, ai_provider_attention_requested: false } })).toBe(false)
    expect(counterofferAcknowledged('I’ve asked the provider to review your counter; their answer is still pending.', state)).toBe(false)
    expect(counterofferAcknowledged(body, { ...state, scopeHash: 'another-scope' })).toBe(false)
  })
})

describe('independent category coverage', () => {
  test('collects failure, then runs isolated attention and later categories', async () => {
    const visited: string[] = []
    const failures: string[] = []
    const result = await runIndependentCategories(['education', 'academic-writing', 'mentorship'], {
      negotiation: async (category: string) => { visited.push(`${category}/negotiation`); if (category === 'education') throw new Error('synthetic timeout') },
      attention: async (category: string) => { visited.push(`${category}/attention`) },
      onFailure: (category: string, name: string) => failures.push(`${category}/${name}`),
    })
    expect(result).toBe(false)
    expect(failures).toEqual(['education/negotiation'])
    expect(visited).toEqual(['education/negotiation', 'education/attention', 'academic-writing/negotiation', 'academic-writing/attention', 'mentorship/negotiation', 'mentorship/attention'])
  })
  test('run cancellation stops independent probes', async () => {
    const controller = new AbortController()
    const attention = jest.fn()
    await expect(runIndependentCategories(['education', 'mentorship'], {
      signal: controller.signal,
      negotiation: async () => { controller.abort(new Error('cancelled')); throw new Error('step failed') },
      attention, onFailure: jest.fn(),
    })).rejects.toThrow('cancelled')
    expect(attention).not.toHaveBeenCalled()
  })
})
