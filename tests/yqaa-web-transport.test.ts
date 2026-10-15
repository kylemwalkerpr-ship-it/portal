describe('YQAA xAI web-search transport', () => {
  const originalFetch = global.fetch
  const originalKey = process.env.XAI_API_KEY

  test('keeps the factual sentence when live citations follow a bare source URL', async () => {
    const { parseSystemWebSearchResponse } = await import('@/lib/superGrokAssistant')
    const url = 'https://www.uscis.gov/opt'
    const fact = 'Eligible F-1 students may apply for OPT employment authorization.'
    const text = `${fact} ${url}[[1]](${url})`
    const parsed = parseSystemWebSearchResponse(JSON.stringify({ output: [
      { type: 'web_search_call', action: { sources: [{ type: 'url', url }] } },
      { type: 'message', content: [{ type: 'output_text', text, annotations: [{ type: 'url_citation', url, start_index: text.indexOf('[[1]]') }] }] },
    ] }))
    expect(parsed.sources).toEqual([expect.objectContaining({ url, snippet: fact })])
  })

  afterEach(() => {
    global.fetch = originalFetch
    if (originalKey === undefined) delete process.env.XAI_API_KEY
    else process.env.XAI_API_KEY = originalKey
    jest.resetModules()
    jest.clearAllMocks()
    jest.dontMock('@opennextjs/cloudflare')
    jest.dontMock('@/lib/aiKeyVault')
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

  test('safe search diagnostics expose structure but never response text or credentials', async () => {
    const { safeWebSearchResponseMeta } = await import('@/lib/superGrokAssistant')
    const meta = safeWebSearchResponseMeta(JSON.stringify({
      status: 'completed', model: 'grok-4.6', tool_choice: 'required',
      citations: ['https://www.uscis.gov/opt'],
      output: [{ type: 'web_search_call' }, { type: 'message', content: [{ type: 'output_text', text: 'SENSITIVE ANSWER TEXT' }] }],
      usage: { num_sources_used: 1, num_server_side_tools_used: 1, server_side_tool_usage_details: { web_search_calls: 1 } },
      secret: 'DO-NOT-LOG',
    }))
    expect(meta).toMatchObject({ responseStatus: 'completed', model: 'grok-4.6', toolChoice: 'required', citationsCount: 1, webSearchCalls: 1 })
    expect(meta.outputTypes).toEqual(['web_search_call', 'message'])
    expect(JSON.stringify(meta)).not.toContain('SENSITIVE ANSWER TEXT')
    expect(JSON.stringify(meta)).not.toContain('DO-NOT-LOG')
  })

  test('uses only the SuperGrok subscription session for server-side web search', async () => {
    process.env.XAI_API_KEY = 'synthetic-metered-worker-key'
    jest.doMock('@/lib/messengerAi', () => ({
      resolveMessengerGrokAuth: jest.fn(async () => ({
        apiKey: 'oauth-token', baseURL: 'https://api.x.ai/v1', model: 'grok-4.6', authMode: 'supergrok',
      })),
    }))
    const buildVaultEnvOverrides = jest.fn(async () => ({ XAI_API_KEY: 'synthetic-vault-key' }))
    jest.doMock('@/lib/aiKeyVault', () => ({ buildVaultEnvOverrides }))
    const payload = JSON.stringify({
      citations: ['https://www.uscis.gov/opt'],
      output: [
        { type: 'web_search_call', action: { sources: [{ url: 'https://www.uscis.gov/opt', snippet: 'USCIS OPT source.' }] } },
        { type: 'message', content: [{ type: 'output_text', text: 'Current USCIS OPT guidance.[[1]](https://www.uscis.gov/opt)' }] },
      ],
      usage: { server_side_tool_usage_details: { web_search_calls: 1 } },
    })
    global.fetch = jest.fn().mockResolvedValueOnce(new Response(payload, { status: 200 })) as any

    const { callSystemSuperGrokWebSearch } = await import('@/lib/superGrokAssistant')
    const result = await callSystemSuperGrokWebSearch('latest OPT guidance', ['uscis.gov'])
    expect(result.webSearchCalls).toBe(1)
    expect(global.fetch).toHaveBeenCalledTimes(1)
    const headers = (global.fetch as jest.Mock).mock.calls[0][1].headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer oauth-token')
    expect(buildVaultEnvOverrides).not.toHaveBeenCalled()
    const body = JSON.parse(String((global.fetch as jest.Mock).mock.calls[0][1].body))
    expect(body.tool_choice).toBe('required')
    expect(body.tools).toEqual([expect.objectContaining({ type: 'web_search' })])
  })

  test('refuses a developer-key auth mode before making a web-search request', async () => {
    process.env.XAI_API_KEY = 'synthetic-metered-worker-key'
    jest.doMock('@/lib/messengerAi', () => ({
      resolveMessengerGrokAuth: jest.fn(async () => ({
        apiKey: 'synthetic-metered-worker-key', baseURL: 'https://api.x.ai/v1', model: 'grok-4.6', authMode: 'env',
      })),
    }))
    global.fetch = jest.fn()

    const { callSystemSuperGrokWebSearch } = await import('@/lib/superGrokAssistant')
    await expect(callSystemSuperGrokWebSearch('latest OPT guidance', ['uscis.gov'])).rejects.toThrow(/authentication/i)
    expect(global.fetch).not.toHaveBeenCalled()
  })

})
