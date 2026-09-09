describe('YQAA latency routing', () => {
  it('answers a standalone greeting without invoking deep retrieval', async () => {
    const { getDeterministicYqaaReply } = await import('@/lib/assistantFastReplies')
    const reply = getDeterministicYqaaReply([{ role: 'user', content: 'Hi you' }])
    expect(reply).toContain('YQAA')
    expect(reply).toContain('What can I help you with?')
  })

  it('answers the common company-overview question from stable curated facts', async () => {
    const { getDeterministicYqaaReply } = await import('@/lib/assistantFastReplies')
    const reply = getDeterministicYqaaReply([
      { role: 'user', content: 'Tell me about YouSafe Consultancy' },
    ])
    expect(reply).toContain('YouSafe Consultancy')
    expect(reply).toContain('https://yousafeconsultancy.com')
    expect(reply).toContain('https://market.yousafeconsultancy.com')
  })

  it('does not let a later greeting hide an unanswered substantive question', async () => {
    const { getDeterministicYqaaReply } = await import('@/lib/assistantFastReplies')
    const reply = getDeterministicYqaaReply([
      { role: 'user', content: 'I need help with an Australian student visa refusal' },
      { role: 'user', content: 'Hi' },
    ])
    expect(reply).toBeNull()
  })

  it('keeps generic brand/platform questions on the lightweight core path', async () => {
    const { shouldUseDeepNetworkKnowledge } = await import('@/lib/assistantFastKnowledge')
    expect(shouldUseDeepNetworkKnowledge('Hi there')).toBe(false)
    expect(shouldUseDeepNetworkKnowledge('Tell me about this company')).toBe(false)
    expect(shouldUseDeepNetworkKnowledge('How does YouSafe work?')).toBe(false)
  })

  it('uses the deep network corpus for substantive regional/service questions', async () => {
    const { shouldUseDeepNetworkKnowledge } = await import('@/lib/assistantFastKnowledge')
    expect(shouldUseDeepNetworkKnowledge('What evidence do I need for an Australian subclass 500 visa?')).toBe(true)
    expect(shouldUseDeepNetworkKnowledge('Help me with a Canada study permit refusal')).toBe(true)
    expect(shouldUseDeepNetworkKnowledge('How much does the study permit package cost?')).toBe(true)
  })
})
