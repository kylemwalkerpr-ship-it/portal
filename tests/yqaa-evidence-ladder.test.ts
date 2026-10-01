const kbChunk = (site = 'caseworks') => ({
  id: `${site}-1`, chunkKey: `${site}-1`, sourceKey: `${site}-source`,
  title: `${site} public overview`, body: 'Public general guidance about the requested topic.',
  source: `https://${site}.yousafeconsultancy.com/guide`,
  sourceUrl: `https://${site}.yousafeconsultancy.com/guide`,
  site, jurisdiction: 'United States', topicTags: [], authorityTier: 4, score: 8,
  fetchedAt: new Date().toISOString(),
})
const clearJev = (market = 'usa') => ({ available: true, advisory: {
  sufficient: true, confidence: 0.94, conflict: false, needsHandoff: false, market,
} })
const weakJev = () => ({ available: true, advisory: {
  sufficient: false, confidence: 0.45, conflict: false, needsHandoff: false, market: 'usa',
} })

async function setup(opts: {
  chunks?: ReturnType<typeof kbChunk>[]; confidence?: number; fresh?: boolean;
  jev?: unknown[]; web?: unknown[]; webError?: boolean; useRealFastReplies?: boolean
} = {}) {
  jest.resetModules()
  const chunks = opts.chunks ?? [kbChunk(), { ...kbChunk('usa'), id: 'usa-2' }]
  const loadYqaaEvidence = jest.fn(async () => ({ chunks, source: 'database',
    retrievalConfidence: opts.confidence ?? 0.9, freshEnough: opts.fresh ?? true,
    jurisdictions: ['United States'], sites: [...new Set(chunks.map((c) => c.site))] }))
  const requestJevAdvisory = jest.fn()
  for (const value of opts.jev ?? [clearJev()]) requestJevAdvisory.mockResolvedValueOnce(value)
  const researchYqaaPublicWeb = jest.fn(opts.webError
    ? async () => { throw new Error('web unavailable') }
    : async () => opts.web ?? [])
  const generateYqaaAnswer = jest.fn(async () => ({ text: 'General answer from evidence.', provider: 'grok', model: 'grok-4.6', fallback: false }))
  const escalateToSupport = jest.fn(async () => ({ conversationId: 'support-1', status: 'queued', queue: null, apiUrl: 'https://support.yousafeconsultancy.com/api/chat/widget' }))
  jest.doMock('@/lib/yqaaKnowledgeDb', () => ({ ...jest.requireActual('@/lib/yqaaKnowledgeDb'), loadYqaaEvidence }))
  jest.doMock('@/lib/jevAdvisory', () => ({ ...jest.requireActual('@/lib/jevAdvisory'), requestJevAdvisory }))
  jest.doMock('@/lib/yqaaWebResearch', () => ({ ...jest.requireActual('@/lib/yqaaWebResearch'), researchYqaaPublicWeb }))
  jest.doMock('@/lib/yqaaGeneration', () => ({ generateYqaaAnswer, publicYqaaProviderLabel: () => 'system-ai' }))
  jest.doMock('@/lib/chatEscalation', () => ({ ...jest.requireActual('@/lib/chatEscalation'), escalateToSupport }))
  if (opts.useRealFastReplies) {
    jest.dontMock('@/lib/assistantFastReplies')
  } else {
    jest.doMock('@/lib/assistantFastReplies', () => ({ getDeterministicYqaaReply: () => null }))
  }
  jest.doMock('@/lib/centralAssistantKnowledge', () => ({
    ...jest.requireActual('@/lib/centralAssistantKnowledge'),
    buildCentralAssistantKnowledge: jest.fn(async ({ curatedChunks }: { curatedChunks: Array<{ sourceUrl?: string }> }) =>
      `Public evidence: ${curatedChunks.map((c) => c.sourceUrl).join(' ')}`),
  }))
  const { POST } = await import('@/app/api/chat/route')
  const ask = async (query: string, extra: Record<string, unknown> = {}) => {
    const response = await POST(new Request('https://usa.yousafeconsultancy.com/api/chat', {
      method: 'POST', headers: { Origin: 'https://usa.yousafeconsultancy.com', 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: query }], ...extra }),
    }))
    return { status: response.status, body: await response.json() as Record<string, any> }
  }
  return { ask, loadYqaaEvidence, requestJevAdvisory, researchYqaaPublicWeb, generateYqaaAnswer, escalateToSupport }
}

describe('YQAA final evidence ladder', () => {
  test('freshness-sensitive latest OPT question forces official web research even with a high-confidence fresh KB', async () => {
    const official = { ...kbChunk('official-web'), id: 'opt-web', sourceKey: 'xai:web_search',
      sourceUrl: 'https://www.uscis.gov/working-in-the-united-states/students-and-exchange-visitors/optional-practical-training-opt-for-f-1-students',
      source: 'https://www.uscis.gov/working-in-the-united-states/students-and-exchange-visitors/optional-practical-training-opt-for-f-1-students' }
    const flow = await setup({ jev: [clearJev(), clearJev()], web: [official] })
    const result = await flow.ask('What are the latest OPT rules for F-1 students?')
    expect(flow.researchYqaaPublicWeb).toHaveBeenCalledTimes(1)
    expect(flow.requestJevAdvisory).toHaveBeenCalledTimes(2)
    expect(flow.generateYqaaAnswer).toHaveBeenCalledTimes(1)
    expect(result.body.reply).toContain(official.sourceUrl)
    expect(flow.escalateToSupport).not.toHaveBeenCalled()
  })

  test('Browser evidence explicitly tells the model live research succeeded even when second Jev is unavailable', async () => {
    const official = { ...kbChunk('official-web'), id: 'browser-live', sourceKey: 'cloudflare:browser_search',
      sourceUrl: 'https://www.uscis.gov/working-in-the-united-states/students-and-exchange-visitors/optional-practical-training-opt-for-f-1-students',
      source: 'https://www.uscis.gov/working-in-the-united-states/students-and-exchange-visitors/optional-practical-training-opt-for-f-1-students' }
    const flow = await setup({ confidence: 0.2, jev: [weakJev(), { available: false, reason: 'request_failed' }], web: [official] })
    const result = await flow.ask('What are the latest OPT news for F-1 students?')
    expect(result.body.provider).toBe('system-ai')
    expect(flow.generateYqaaAnswer).toHaveBeenCalledTimes(1)
    const systemPrompt = String((flow.generateYqaaAnswer.mock.calls as any[][])[0][0])
    expect(systemPrompt).toContain('LIVE WEB RESEARCH SUCCEEDED')
    expect(systemPrompt).toContain('Do not say that web search, internet access, or live research is unavailable')
    expect(systemPrompt).toContain(official.sourceUrl)
    expect(result.body.reply).toContain(official.sourceUrl)
    expect(flow.escalateToSupport).not.toHaveBeenCalled()
  })

  test('Browser-derived live web evidence is retained and cited in the final YQAA answer', async () => {
    const official = { ...kbChunk('official-web'), id: 'browser-opt', sourceKey: 'cloudflare:browser_search',
      sourceUrl: 'https://www.uscis.gov/working-in-the-united-states/students-and-exchange-visitors/optional-practical-training-opt-for-f-1-students',
      source: 'https://www.uscis.gov/working-in-the-united-states/students-and-exchange-visitors/optional-practical-training-opt-for-f-1-students' }
    const flow = await setup({ jev: [clearJev(), clearJev()], web: [official] })
    const result = await flow.ask('What are the latest OPT rules for F-1 students?')
    expect(flow.researchYqaaPublicWeb).toHaveBeenCalledTimes(1)
    expect(flow.generateYqaaAnswer).toHaveBeenCalledTimes(1)
    expect(result.body.reply).toContain(official.sourceUrl)
    expect(flow.escalateToSupport).not.toHaveBeenCalled()
  })

  test('high-confidence fresh KB and clear Jev answer without web', async () => {
    const flow = await setup()
    const result = await flow.ask('Explain general housing rules in the United States')
    expect(result.body.provider).toBe('system-ai')
    expect(flow.researchYqaaPublicWeb).not.toHaveBeenCalled()
    expect(flow.requestJevAdvisory).toHaveBeenCalledTimes(1)
    expect(flow.generateYqaaAnswer).toHaveBeenCalledTimes(1)
  })

  test('high-confidence fresh KB answers a simple question when Jev is unavailable', async () => {
    const flow = await setup({ jev: [{ available: false, reason: 'timeout' }] })
    const result = await flow.ask('How do I find public information?')
    expect(result.body.provider).toBe('system-ai')
    expect(flow.researchYqaaPublicWeb).not.toHaveBeenCalled()
    expect(flow.requestJevAdvisory).toHaveBeenCalledTimes(1)
    expect(flow.generateYqaaAnswer).toHaveBeenCalledTimes(1)
    expect(flow.escalateToSupport).not.toHaveBeenCalled()
  })

  test('weak KB searches official web, sends combined evidence to Jev, and retains citations', async () => {
    const official = { ...kbChunk('official-web'), id: 'web-1', sourceKey: 'xai:web_search',
      sourceUrl: 'https://www.hud.gov/program_offices/housing', source: 'https://www.hud.gov/program_offices/housing' }
    const flow = await setup({ confidence: 0.3, jev: [weakJev(), clearJev()], web: [official] })
    const result = await flow.ask('Explain general housing rules in the United States')
    expect(flow.researchYqaaPublicWeb).toHaveBeenCalledTimes(1)
    expect(flow.requestJevAdvisory).toHaveBeenCalledTimes(2)
    expect(flow.requestJevAdvisory.mock.calls[1][0].evidence[0].sourceUrl).toBe(official.sourceUrl)
    expect(result.body.reply).toContain(official.sourceUrl)
    expect(result.body.provider).toBe('system-ai')
  })

  test.each(['failure', 'insufficient'])('web %s keeps an ordinary question with YQAA instead of creating a support ticket', async (kind) => {
    const flow = await setup({ confidence: 0.2, jev: [weakJev(), weakJev()],
      webError: kind === 'failure', web: kind === 'insufficient' ? [
        { ...kbChunk('official-web'), sourceKey: 'xai:web_search' },
      ] : [] })
    const result = await flow.ask('Explain general housing rules in the United States')
    expect(result.body.provider).toBe('system-ai')
    expect(flow.generateYqaaAnswer).toHaveBeenCalledTimes(1)
    expect(flow.escalateToSupport).not.toHaveBeenCalled()
    const systemPrompt = String((flow.generateYqaaAnswer.mock.calls as any[][])[0][0])
    expect(systemPrompt).toContain('CURRENT TURN EVIDENCE LIMIT')
    expect(systemPrompt).toContain('not, by itself, a reason to create a human-support handoff')
  })

  test('individualized legal strategy hands off without trying web research', async () => {
    const flow = await setup()
    const result = await flow.ask('My landlord is evicting me tomorrow; should I sue?')
    expect(result.body.provider).toBe('handoff')
    expect(flow.researchYqaaPublicWeb).not.toHaveBeenCalled()
    expect(flow.generateYqaaAnswer).not.toHaveBeenCalled()
  })

  test.each(['Which option should I choose?', 'What are Canada PGWP steps?'])(
    'ambiguous or cross-jurisdiction request researches the web but stays with YQAA when Jev is unavailable: %s',
    async (query) => {
      const flow = await setup({ jev: [{ available: false, reason: 'timeout' }] })
      const result = await flow.ask(query)
      expect(flow.researchYqaaPublicWeb).toHaveBeenCalledTimes(1)
      expect(result.body.provider).toBe('system-ai')
      expect(flow.generateYqaaAnswer).toHaveBeenCalledTimes(1)
      expect(flow.escalateToSupport).not.toHaveBeenCalled()
    },
  )

  test('Jev outage only deterministic-passes an explicit Canada query after matching local or official-web evidence', async () => {
    const matchingLocal = { ...kbChunk('canada'), jurisdiction: 'Canada' }
    const matchingLocalFlow = await setup({ chunks: [matchingLocal], jev: [{ available: false, reason: 'timeout' }] })
    const matchingLocalResult = await matchingLocalFlow.ask('What are Canada PGWP steps?')
    expect(matchingLocalFlow.researchYqaaPublicWeb).not.toHaveBeenCalled()
    expect(matchingLocalResult.body.provider).toBe('system-ai')

    const localFlow = await setup({ chunks: [kbChunk('usa')], jev: [{ available: false, reason: 'timeout' }] })
    const localResult = await localFlow.ask('What are Canada PGWP steps?')
    expect(localFlow.researchYqaaPublicWeb).toHaveBeenCalledTimes(1)
    expect(localFlow.generateYqaaAnswer).toHaveBeenCalledTimes(1)
    expect(localResult.body.provider).toBe('system-ai')
    expect(localFlow.escalateToSupport).not.toHaveBeenCalled()

    const webEvidence = { ...kbChunk('official-web'), id: 'ca-web', sourceKey: 'xai:web_search',
      jurisdiction: 'Canada', sourceUrl: 'https://www.canada.ca/en/immigration.html',
      source: 'https://www.canada.ca/en/immigration.html' }
    const webFlow = await setup({ chunks: [kbChunk('usa')], jev: [
      { available: false, reason: 'timeout' }, { available: false, reason: 'timeout' },
    ], web: [webEvidence] })
    const webResult = await webFlow.ask('What are Canada PGWP steps?')
    expect(webFlow.researchYqaaPublicWeb).toHaveBeenCalledTimes(1)
    expect(webFlow.requestJevAdvisory).toHaveBeenCalledTimes(2)
    expect(webResult.body.provider).toBe('system-ai')
    expect(webResult.body.reply).toContain(webEvidence.sourceUrl)
    expect(webFlow.generateYqaaAnswer).toHaveBeenCalledTimes(1)
  })

  test('conflicting sources research before a clear second Jev can approve cited official evidence', async () => {
    const authoritative = { ...kbChunk('official-web'), id: 'authoritative', sourceKey: 'xai:web_search',
      jurisdiction: 'United States', sourceUrl: 'https://www.hud.gov/housing',
      source: 'https://www.hud.gov/housing' }
    const flow = await setup({ jev: [
      { available: true, advisory: { sufficient: true, confidence: 0.9, conflict: false, needsHandoff: false, market: 'global' } },
      clearJev('usa'),
    ], web: [authoritative] })
    const result = await flow.ask('These sources conflict about general housing rules; what is correct?')
    expect(flow.researchYqaaPublicWeb).toHaveBeenCalledTimes(1)
    expect(flow.requestJevAdvisory).toHaveBeenCalledTimes(2)
    expect(flow.requestJevAdvisory.mock.calls[1][0].evidence[0].sourceUrl).toBe(authoritative.sourceUrl)
    expect(result.body.provider).toBe('system-ai')
    expect(result.body.reply).toContain(authoritative.sourceUrl)
  })

  test.each([
    ['unavailable', { available: false, reason: 'timeout' }],
    ['conflicted', { available: true, advisory: { sufficient: true, confidence: 0.95, conflict: true, needsHandoff: false, market: 'usa' } }],
    ['insufficient', { available: true, advisory: { sufficient: false, confidence: 0.45, conflict: false, needsHandoff: false, market: 'usa' } }],
  ])('conflict remains model-handled with bounded uncertainty when second Jev is %s', async (_label, secondJev) => {
    const authoritative = { ...kbChunk('official-web'), id: 'authoritative', sourceKey: 'xai:web_search',
      jurisdiction: 'United States', sourceUrl: 'https://www.hud.gov/housing',
      source: 'https://www.hud.gov/housing' }
    const flow = await setup({ jev: [clearJev('usa'), secondJev], web: [authoritative] })
    const result = await flow.ask('These sources conflict about general housing rules; what is correct?')
    expect(flow.researchYqaaPublicWeb).toHaveBeenCalledTimes(1)
    expect(result.body.provider).toBe('system-ai')
    expect(flow.generateYqaaAnswer).toHaveBeenCalledTimes(1)
    expect(flow.escalateToSupport).not.toHaveBeenCalled()
    expect(result.body.reply).toContain(authoritative.sourceUrl)
  })

  test('trivial capability question bypasses retrieval, Jev, web, and model even with stale unresolved history', async () => {
    const flow = await setup({ useRealFastReplies: true })
    const response = await (async () => {
      const { POST } = await import('@/app/api/chat/route')
      const res = await POST(new Request('https://usa.yousafeconsultancy.com/api/chat', {
        method: 'POST',
        headers: { Origin: 'https://usa.yousafeconsultancy.com', 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [
          { role: 'user', content: 'I have a complicated work permit question' },
          { role: 'user', content: 'how can you help me?' },
        ] }),
      }))
      return await res.json() as Record<string, any>
    })()

    expect(response.provider).toBe('system-fast-path')
    expect(response.reply).toContain('YouSafe services and Marketplace navigation')
    expect(flow.loadYqaaEvidence).not.toHaveBeenCalled()
    expect(flow.requestJevAdvisory).not.toHaveBeenCalled()
    expect(flow.researchYqaaPublicWeb).not.toHaveBeenCalled()
    expect(flow.generateYqaaAnswer).not.toHaveBeenCalled()
    expect(flow.escalateToSupport).not.toHaveBeenCalled()
  })

  test('ordinary help language stays with YQAA while an explicit human request hands off', async () => {
    const ordinary = await setup()
    const ordinaryResult = await ordinary.ask('I want you to help me understand work permit options')
    expect(ordinaryResult.body.provider).toBe('system-ai')
    expect(ordinary.generateYqaaAnswer).toHaveBeenCalledTimes(1)
    expect(ordinary.escalateToSupport).not.toHaveBeenCalled()

    const explicit = await setup()
    const explicitResult = await explicit.ask('I want to talk to a human support agent')
    expect(explicitResult.body.provider).toBe('handoff')
    expect(explicitResult.body.handoff.kind).toBe('explicit')
    expect(explicit.escalateToSupport).toHaveBeenCalledTimes(1)
    expect(explicit.generateYqaaAnswer).not.toHaveBeenCalled()
  })

  test('general legal and immigration overview questions stay with YQAA', async () => {
    const flow = await setup({ chunks: [{ ...kbChunk('usa'), jurisdiction: 'United States' }] })
    const result = await flow.ask('What are the general rules for F-1 students working on campus?')
    expect(result.body.provider).toBe('system-ai')
    expect(flow.generateYqaaAnswer).toHaveBeenCalledTimes(1)
    expect(flow.escalateToSupport).not.toHaveBeenCalled()
  })

  test('private page and visitor details do not enter Jev or web payloads', async () => {
    const flow = await setup({ confidence: 0.2, jev: [weakJev(), clearJev()], web: [
      { ...kbChunk('official-web'), sourceKey: 'xai:web_search', jurisdiction: 'United States' },
    ] })
    await flow.ask('Explain housing rules', {
      visitor: { name: 'Private Visitor', email: 'private@example.com' },
      pageContext: { hostname: 'usa.yousafeconsultancy.com', pathname: '/orders/98765', title: 'PRIVATE ORDER 98765' },
    })
    const sent = JSON.stringify(flow.requestJevAdvisory.mock.calls) + JSON.stringify(flow.researchYqaaPublicWeb.mock.calls)
    expect(sent).not.toContain('PRIVATE ORDER')
    expect(sent).not.toContain('/orders/98765')
    expect(sent).not.toContain('private@example.com')
  })
})
