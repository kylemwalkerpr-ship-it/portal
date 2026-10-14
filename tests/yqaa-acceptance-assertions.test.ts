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
    'I hear you wanting $139.50. For that narrowed packet I can keep the offer at $155 on YouSafe.',
    'I hear you wanting $139.50. The on-platform figure I can put in front of you is $155.',
  ])('recognizes direct saved offer disposition: %s', (body) => {
    expect(counterofferAcknowledged(body, state)).toBe(true)
    expect(counterofferAcknowledged(body.replace('$155', '$154'), state)).toBe(false)
    expect(counterofferAcknowledged(body + ' Provider approval is required.', state)).toBe(false)
    expect(counterofferAcknowledged(body.replace('I can', 'I could'), state)).toBe(false)
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
