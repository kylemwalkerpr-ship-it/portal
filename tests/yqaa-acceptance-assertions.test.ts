const { counterofferAcknowledged, runIndependentCategories } = require('../scripts/yqaa-acceptance-assertions.cjs')

const state = {
  quoteCents: 15500, counterCents: 13950, scopeHash: 'synthetic-three-document-scope',
  metadata: { ai_last_pricing_status: 'ready', ai_memory: { negotiation: {
    quotes_made: [{ cents: 15500, scope_hash: 'synthetic-three-document-scope' }],
    client_counters: [{ cents: 13950 }],
  } } },
}

describe('counteroffer acceptance evidence', () => {
  test('recognizes a new authorised same-scope counterproposal, and rejects an unsaved value', () => {
    const updated = {...state,metadata:{...state.metadata,ai_memory:{negotiation:{...state.metadata.ai_memory.negotiation,quotes_made:[...state.metadata.ai_memory.negotiation.quotes_made,{cents:15000,scope_hash:state.scopeHash}]}}}}
    expect(counterofferAcknowledged('I noted your $139.50 proposal. I can offer this scope at $150.', updated)).toBe(true)
    expect(counterofferAcknowledged('I noted your $139.50 proposal. I can offer this scope at $149.', updated)).toBe(false)
  })
  test('holds the saved price when scope details sit between the commitment and amount', () => {
    expect(counterofferAcknowledged('I hear your $139.50. I can keep that narrowed scope as-is—organizing three documents only, no form completion and no advice—at $155.',state)).toBe(true)
    expect(counterofferAcknowledged('I hear your $139.50. I can keep that narrowed scope unchanged, and you can book a hotel for $155.',state)).toBe(false)
    expect(counterofferAcknowledged('I hear your $139.50. I can keep that narrowed scope at $154.',state)).toBe(false)
    expect(counterofferAcknowledged('I hear your $139.50. I can keep that narrowed scope at $155 if the provider approves.',state)).toBe(false)
    expect(counterofferAcknowledged('I hear your $139.50. I couldn’t keep that narrowed scope at $155.',state)).toBe(false)
  })
  test('recognizes direct offer-figure language at the saved amount and rejects conditional or invented figures', () => {
    expect(counterofferAcknowledged('I hear you on $139.50. The figure I can put on the offer is $155.',state)).toBe(true)
    expect(counterofferAcknowledged('I hear you on $139.50. The figure I can put on the offer is $154.',state)).toBe(false)
    expect(counterofferAcknowledged('I hear you on $139.50. The figure I can put on the offer is $155 if the provider approves.',state)).toBe(false)
  })
  test.each([
    'I hear you wanting $139.50. For that narrowed scope I can put the offer through at $155 USD.',
    'I hear you wanting $139.50. For that narrowed checklist I can send it at $155.',
    'I hear you wanting $139.50. For that narrowed packet I can keep the offer at $155 on YouSafe.',
    'I hear you wanting $139.50. The on-platform figure I can put in front of you is $155.',
  ])('recognizes direct saved offer disposition: %s', (body) => {
    expect(counterofferAcknowledged(body, state)).toBe(true)
    expect(counterofferAcknowledged(body.replace('$155', '$154'), state)).toBe(false)
    expect(counterofferAcknowledged(body + ' Provider approval is required.', state)).toBe(false)
    expect(counterofferAcknowledged(body.replace('I can', 'I could'), state)).toBe(false)
  })
  test.each([
    'I hear your $139.50. I can put through the narrowed organization at $155.',
    'I hear your $139.50. For that narrowed scope I’m keeping it at $155 on-platform.',
    'I hear your $139.50. I can hold the on-platform package at $155.',
    'I hear your **$139.50**. I’ll keep the three document checklist at **$155**.',
    'I hear your $139.50. We are offering the narrowed packet for $155.',
  ])('binds a natural scoped commitment to the saved quote: %s', (body) => {
    expect(counterofferAcknowledged(body, state)).toBe(true)
    expect(counterofferAcknowledged(body.replace('$155', '$154'), state)).toBe(false)
    expect(counterofferAcknowledged(body + ' Provider approval is required.', state)).toBe(false)
    expect(counterofferAcknowledged(body.replace(/I can|I’m|I’ll|We are/, 'We might'), state)).toBe(false)
  })
  test.each([
    'I hear your $139.50. I can keep the scope that your organization quoted at $155.',
    'I hear your $139.50. I can keep your organization quoted price at $155.',
    'I hear your $139.50. I am offering the packet at $155. Subject to your approval.',
    'I hear your $139.50. I am offering the packet at $155. Only when funding arrives.',
    'I hear your $139.50. I can keep the scope as Bob books a hotel for $155.',
    'I hear your $139.50. I can keep the scope whilst Bob books a hotel for $155.',
    'I hear your $139.50. I can offer a possible package for $155.',
    'I hear your $139.50. I am offering a hypothetical package at $155.',
    'I hear your $139.50. I can offer zero documents for $155.',
    'I hear your $139.50. I am keeping the scope suspended at $155.',
    'I hear your $139.50. I can keep the scope while Bob books a hotel for $155.',
    'I hear your $139.50. I can keep the scope that Bob changed for a hotel for $155.',
    'I hear your $139.50. I am holding off on this scope at $155.',
    'I hear your $139.50. I can keep the scope on hold at $155.',
    'I hear your $139.50. I can keep the estimated price at $155.',
    'I hear your $139.50. I can offer the scope without committing for $155.',
    'I hear your $139.50. I can offer zero application documents for $155.',
    'I hear your $139.50. For organizing twenty-three documents, I can meet you at $155.',
    'I hear your $139.50. For organizing three documents, I can meet you at USD 155 CAD.',
    'I hear your $139.50. For organizing six documents only, I can meet you at $155.',
    'I hear your $139.50. I can send the three documents, and a train ticket costs $155.',
    'I hear your $139.50. For organizing three documents, I can meet you at $155 CAD.',
    'I hear your $139.50. I can offer no documents for $155.',
    'I hear your $139.50. I am offering the scoped document packet at $155 contingent on your approval.',
    'I hear your $139.50. I am offering the scoped document packet at $155 on condition that funding arrives.',
    'I hear your $139.50. I am offering the scoped document packet at $155. Only if funding arrives.',
    'I hear your $139.50. I can keep a hotel at $155.',
    'I hear your $139.50. I can keep the scope unchanged and book a hotel for $155.',
    'I hear your $139.50. I can keep the scope unchanged at a hotel for $155.',
    'I hear your $139.50. I can hold the packet and you can book a hotel for $155.',
    'I hear your $139.50. I’m not keeping the packet at $155.',
    'I hear your $139.50. We are offering the packet for $155 if the provider approves.',
  ])('rejects a bridged, unrelated or conditional commitment: %s', (body) => {
    expect(counterofferAcknowledged(body, state)).toBe(false)
  })
  test('recognizes the natural lock-it-at disposition tied to the exact saved quote and counter', () => {
    expect(counterofferAcknowledged('I hear you wanting $139.50 for the same three-document checklist. For that narrowed work, I can lock it at $155 on-platform.', state)).toBe(true)
    expect(counterofferAcknowledged('I can lock it at $154. I hear your $139.50 proposal.', state)).toBe(false)
  })
  test('accepts actual amount acknowledgment holding the authorized total without old keywords', () => {
    expect(counterofferAcknowledged('I noted your $139.50. The approved total remains $155 for the three-document checklist.', state)).toBe(true)
  })
  test.each([
    'I can help organize a checklist. What country are you applying to?',
    'We can review the price with a provider.',
    'A hotel is $155 and a bus ticket is $139.50.',
    'I can’t lock it at $155. Your $139.50 proposal still needs a decision.',
    'I cannot offer this scope at $155. I noted your $139.50.',
    'I couldn’t lock it at $155. Your $139.50 proposal still needs a decision.',
    'I noted your $139.50 proposal. Can I lock it at $155?',
    'I noted your $139.50 proposal. The approved total remains $155?',
    'I might lock it at $155. Your $139.50 proposal is noted.',
    'I noted your $139.50. The approved total is probably $155.',
    'I noted your $139.50. The approved total is likely $155.',
    'I noted your $139.50. The approved total is estimated at $155.',
    'I noted your $139.50. We can hold it at $155 as long as the provider approves.',
    'I noted your $139.50. The approved total is $155 if the provider approves.',
    'I noted your $139.50. We can hold it at $155 subject to provider approval.',
    'I noted your $139.50. We can hold it at $155 once the provider approves.',
    'I noted your $139.50. I can lock it at $155. If the provider approves.',
    'I noted your $139.50. I can lock it at $155. Provider approval is required.',
    'I noted your $139.50. I can lock it at $155. The provider must approve first.',
    'I noted your $139.50. I can lock it at $155. The provider is available? Approval is required.',
    `I noted your $139.50. I can lock it at $155. The provider ${'additional details '.repeat(15)} approval is required.`,
    'The approved total is not $155. Your $139.50 proposal is noted.',
    'I accept your $139.50 offer; the previous total was $155.',
    'The approved total remains $155. Please tell me your budget.',
    'Your $139.51 proposal leaves the approved total at $155.',
  ])('rejects unrelated, evasive, wrong-value or unauthorized reply: %s', (body) => {
    expect(counterofferAcknowledged(body, state)).toBe(false)
  })
  test('rejects missing counter memory and wrong-scope quote', () => {
    const body = 'I noted your $139.50. The approved total remains $155.'
    expect(counterofferAcknowledged(body, { ...state, metadata: { ...state.metadata, ai_memory: { negotiation: { ...state.metadata.ai_memory.negotiation, client_counters: [] } } } })).toBe(false)
    expect(counterofferAcknowledged(body, { ...state, scopeHash: 'different-scope' })).toBe(false)
  })
  test('acceptance at the counter needs a real same-scope quote at that amount', () => {
    const approved = { ...state, metadata: { ...state.metadata, ai_memory: { negotiation: { ...state.metadata.ai_memory.negotiation, quotes_made: [...state.metadata.ai_memory.negotiation.quotes_made, { cents: 13950, scope_hash: state.scopeHash }] } } } }
    expect(counterofferAcknowledged('I accept your $139.50 offer for this scope.', approved)).toBe(true)
    expect(counterofferAcknowledged('I accept your $139.50 offer. Provider approval is required.', approved)).toBe(false)
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


describe('durable current-turn counter disposition', () => {
  function proof() {
    const card = { id: 'card', conversation_id: 'conversation', sender_id: 'provider', type: 'offer', ref_offer_id: 'offer', metadata: { ai_generated: true, pricing_guarded: true, price: 15500, currency: 'usd', pricing_scope_hash: state.scopeHash } }
    return {
      ...state,
      metadata: { ...state.metadata, ai_last_offer_id: 'offer', ai_last_message_id: 'reply', ai_last_trigger_message_id: 'trigger', ai_last_approved_price_cents: 15500, ai_last_scope_hash: state.scopeHash,
        ai_memory: { last_offer: { currency: 'usd' }, negotiation: { ...state.metadata.ai_memory.negotiation, scope_current: { scope_hash: state.scopeHash, units: { unit: 'document', qty: 3 } }, client_counters: [{ cents: 13950, message_id: 'trigger' }] } } },
      committedOffer: { conversationId: 'conversation', triggerMessageId: 'trigger', replyMessageId: 'reply', providerId: 'provider', clientId: 'client',
        commit: { conversation_id: 'conversation', trigger_message_id: 'trigger', reply_message_id: 'reply', offer_id: 'offer' },
        offer: { id: 'offer', chat_id: 'conversation', sender_id: 'provider', recipient_id: 'client', price: 15500, currency: 'usd', status: 'pending' }, card, visibleCard: { ...structuredClone(card), offer: { id: 'offer', price_cents: 15500, currency: 'usd', status: 'pending' } } },
    }
  }
  const body = 'I hear your $139.50. For organizing three documents only, I can meet you at $155.'
  test('client choice after a committed quote is not provider-price approval', () => {
    const text = 'Thanks for the $139.50 counter. For this same narrowed three-document checklist I can send the on-platform offer at $155 so you can accept it here if it still works for you.'
    expect(counterofferAcknowledged(text, proof())).toBe(true)
    expect(counterofferAcknowledged(text, state)).toBe(false)
    expect(counterofferAcknowledged(text.replace('if it still works for you', 'if the provider approves'), proof())).toBe(false)
    expect(counterofferAcknowledged(text.replace('if it still works for you', 'if it still works for you and funding arrives'), proof())).toBe(false)
    expect(counterofferAcknowledged(text.replace('$155', '$154'), proof())).toBe(false)
  })
  test('requires real current-turn visible offer evidence for natural price wording', () => {
    expect(counterofferAcknowledged(body, proof())).toBe(true)
    expect(counterofferAcknowledged(body, state)).toBe(false)
  })
  test('rejects missing or wrong rendered offer and explicit reply currency', () => {
    const p: any = proof(); delete p.committedOffer.visibleCard.offer
    expect(counterofferAcknowledged(body, p)).toBe(false)
    const q: any = proof(); q.committedOffer.visibleCard.offer.price_cents = 15400
    expect(counterofferAcknowledged(body, q)).toBe(false)
    expect(counterofferAcknowledged(body.replace('$155', 'CAD 155'), proof())).toBe(false)
  })
  test.each(['commit', 'offer', 'card', 'visibleCard'])('fails closed when %s is absent', (field) => {
    const p: any = proof(); delete p.committedOffer[field]
    expect(counterofferAcknowledged(body, p)).toBe(false)
  })
  test.each([
    ['commit', 'trigger_message_id', 'older-trigger'], ['commit', 'reply_message_id', 'older-reply'],
    ['offer', 'price', 15400], ['offer', 'status', 'cancelled'], ['offer', 'recipient_id', 'other-client'],
    ['card', 'ref_offer_id', 'other-offer'], ['visibleCard', 'id', 'other-card'],
  ])('rejects mismatched %s.%s', (field, key, value) => {
    const p: any = proof(); p.committedOffer[field][key] = value
    expect(counterofferAcknowledged(body, p)).toBe(false)
  })
  test.each([
    'I hear your $139.50. I can offer zero application documents for $155.',
    'I hear your $139.50. For organizing twenty-three documents, I can meet you at $155.',
    'I hear your $139.50. For organizing three documents, I can meet you at USD 155 CAD.',
    'I hear your $139.50. For organizing six documents only, I can meet you at $155.',
    'I hear your $139.50. I can send the three documents, and a train ticket costs $155.',
    'I hear your $139.50. For organizing three documents, I can meet you at $155 CAD.',
    'I hear your $139.50. I can offer no documents for $155.',
    'I hear your $139.50. I can keep the documents unchanged and book a hotel for $155.',
    'I hear your $139.50. A hotel costs $155.',
    'I hear your $139.50. I cannot offer the three-document checklist at $155.',
    'I hear your $139.50. The three-document checklist is $155 if the provider approves.',
    'I hear your $139.50. The three-document checklist is $154.',
  ])('committed evidence does not excuse unrelated, negative or conditional copy', (text) => {
    expect(counterofferAcknowledged(text, proof())).toBe(false)
  })
})
