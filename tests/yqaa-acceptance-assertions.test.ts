const { counterofferAcknowledged, runIndependentCategories } = require('../scripts/yqaa-acceptance-assertions.cjs')

const state = {
  quoteCents: 15500, counterCents: 13950, scopeHash: 'synthetic-three-document-scope',
  metadata: { ai_last_pricing_status: 'ready', ai_memory: { negotiation: {
    quotes_made: [{ cents: 15500, scope_hash: 'synthetic-three-document-scope' }],
    client_counters: [{ cents: 13950 }],
  } } },
}

describe('counteroffer acceptance evidence', () => {
  test('accepts actual amount acknowledgment holding the authorized total without old keywords', () => {
    expect(counterofferAcknowledged('I noted your $139.50. The approved total remains $155 for the three-document checklist.', state)).toBe(true)
  })
  test.each([
    'I can help organize a checklist. What country are you applying to?',
    'We can review the price with a provider.',
    'A hotel is $155 and a bus ticket is $139.50.',
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
