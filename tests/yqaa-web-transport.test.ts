describe('YQAA xAI web-search transport', () => {
  const originalFetch = global.fetch
  const originalKey = process.env.XAI_API_KEY

  afterEach(() => {
    global.fetch = originalFetch
    if (originalKey === undefined) delete process.env.XAI_API_KEY
    else process.env.XAI_API_KEY = originalKey
    jest.resetModules()
    jest.clearAllMocks()
  })

  test('recognizes current Responses API web_search_call output and annotation/source citations without a legacy usage counter', async () => {
    const { parseSystemWebSearchResponse } = await import('@/lib/superGrokAssistant')
    const text = 'USCIS says OPT is temporary employment directly related to an F-1 student major.[[1]](https://www.uscis.gov/opt)'
    const raw = JSON.stringify({
      output: [
        { type: 'web_search_call', action: { sources: [
          { url: 'https://www.uscis.gov/opt', title: 'OPT', snippet: 'USCIS official OPT guidance for F-1 students.' },
        ] } },
        { type: 'message', content: [{ type: 'output_text', text, annotations: [
          { url: 'https://www.uscis.gov/opt', title: 'OPT', start_index: text.indexOf('[[1]]') },
        ] }] },
      ],
      usage: {},
    })
    const parsed = parseSystemWebSearchResponse(raw)
    expect(parsed.webSearchCalls).toBe(1)
    expect(parsed.citations).toContain('https://www.uscis.gov/opt')
    expect(parsed.sources[0]).toMatchObject({ url: 'https://www.uscis.gov/opt', title: 'OPT' })
  })

  test('retries the web-search request with the commissioned direct xAI key when the primary auth path returns no citation-linked search evidence', async () => {
    process.env.XAI_API_KEY = 'direct-search-key'
    jest.doMock('@/lib/messengerAi', () => ({
      resolveMessengerGrokAuth: jest.fn(async () => ({
        apiKey: 'oauth-token', baseURL: 'https://api.x.ai/v1', model: 'grok-4.7', authMode: 'supergrok',
      })),
    }))
    const first = JSON.stringify({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'No tool evidence.' }] }], usage: {} })
    const secondText = 'Current USCIS OPT guidance.[[1]](https://www.uscis.gov/opt)'
    const second = JSON.stringify({
      citations: ['https://www.uscis.gov/opt'],
      output: [
        { type: 'web_search_call', action: { sources: [{ url: 'https://www.uscis.gov/opt', snippet: 'Current USCIS OPT guidance for F-1 students.' }] } },
        { type: 'message', content: [{ type: 'output_text', text: secondText, annotations: [] }] },
      ],
      usage: { server_side_tool_usage_details: { web_search_calls: 1 } },
    })
    global.fetch = jest.fn()
      .mockResolvedValueOnce(new Response(first, { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(second, { status: 200, headers: { 'Content-Type': 'application/json' } })) as any

    const { callSystemSuperGrokWebSearch } = await import('@/lib/superGrokAssistant')
    const result = await callSystemSuperGrokWebSearch('latest OPT guidance', ['uscis.gov'])
    expect(result.webSearchCalls).toBe(1)
    expect(result.citations).toContain('https://www.uscis.gov/opt')
    expect(global.fetch).toHaveBeenCalledTimes(2)
    const secondHeaders = (global.fetch as jest.Mock).mock.calls[1][1].headers as Record<string, string>
    expect(secondHeaders.Authorization).toBe('Bearer direct-search-key')
    const secondBody = JSON.parse(String((global.fetch as jest.Mock).mock.calls[1][1].body))
    expect(secondBody.include).toContain('web_search_call.action.sources')
  })
})
