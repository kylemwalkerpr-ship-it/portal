describe('YQAA xAI web-search transport', () => {
  const originalFetch = global.fetch
  const originalKey = process.env.XAI_API_KEY

  afterEach(() => {
    global.fetch = originalFetch
    if (originalKey === undefined) delete process.env.XAI_API_KEY
    else process.env.XAI_API_KEY = originalKey
    jest.resetModules()
    jest.clearAllMocks()
    jest.dontMock('@opennextjs/cloudflare')
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

  test('uses the commissioned direct xAI Worker binding as the primary live-search credential', async () => {
    delete process.env.XAI_API_KEY
    jest.doMock('@/lib/messengerAi', () => ({
      resolveMessengerGrokAuth: jest.fn(async () => ({
        apiKey: 'oauth-token', baseURL: 'https://api.x.ai/v1', model: 'grok-4.6', authMode: 'supergrok',
      })),
    }))
    jest.doMock('@opennextjs/cloudflare', () => ({
      getCloudflareContext: () => ({ env: { XAI_API_KEY: 'worker-direct-key', XAI_MODEL: 'grok-4.6' } }),
    }))
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
    expect(headers.Authorization).toBe('Bearer worker-direct-key')
    const body = JSON.parse(String((global.fetch as jest.Mock).mock.calls[0][1].body))
    expect(body.tool_choice).toBe('required')
    expect(body.tools).toEqual([expect.objectContaining({ type: 'web_search' })])
  })

  test('falls back to SuperGrok/OAuth when the direct xAI key is forbidden and still requires web search', async () => {
    process.env.XAI_API_KEY = 'direct-search-key'
    jest.doMock('@/lib/messengerAi', () => ({
      resolveMessengerGrokAuth: jest.fn(async () => ({
        apiKey: 'oauth-token', baseURL: 'https://api.x.ai/v1', model: 'grok-4.7', authMode: 'supergrok',
      })),
    }))
    const oauth = JSON.stringify({
      citations: ['https://www.uscis.gov/opt'],
      output: [
        { type: 'web_search_call', action: { sources: [{ url: 'https://www.uscis.gov/opt', snippet: 'USCIS OPT source.' }] } },
        { type: 'message', content: [{ type: 'output_text', text: 'USCIS OPT guidance.[[1]](https://www.uscis.gov/opt)' }] },
      ],
      usage: { server_side_tool_usage_details: { web_search_calls: 1 } },
    })
    global.fetch = jest.fn()
      .mockResolvedValueOnce(new Response('{"error":"forbidden"}', { status: 403 }))
      .mockResolvedValueOnce(new Response(oauth, { status: 200, headers: { 'Content-Type': 'application/json' } })) as any

    const { callSystemSuperGrokWebSearch } = await import('@/lib/superGrokAssistant')
    const result = await callSystemSuperGrokWebSearch('latest OPT guidance', ['uscis.gov'])
    expect(result.webSearchCalls).toBe(1)
    expect(result.citations).toContain('https://www.uscis.gov/opt')
    expect(global.fetch).toHaveBeenCalledTimes(2)
    const oauthBody = JSON.parse(String((global.fetch as jest.Mock).mock.calls[1][1].body))
    expect(oauthBody.tool_choice).toBe('required')
  })

  test('falls back to SuperGrok/OAuth when the direct xAI live-search request times out', async () => {
    process.env.XAI_API_KEY = 'direct-search-key'
    jest.doMock('@/lib/messengerAi', () => ({
      resolveMessengerGrokAuth: jest.fn(async () => ({
        apiKey: 'oauth-token', baseURL: 'https://api.x.ai/v1', model: 'grok-4.7', authMode: 'supergrok',
      })),
    }))
    const secondText = 'Current USCIS OPT guidance.[[1]](https://www.uscis.gov/opt)'
    const second = JSON.stringify({
      citations: ['https://www.uscis.gov/opt'],
      output: [
        { type: 'web_search_call', action: { sources: [{ url: 'https://www.uscis.gov/opt', snippet: 'Current USCIS OPT guidance for F-1 students.' }] } },
        { type: 'message', content: [{ type: 'output_text', text: secondText, annotations: [] }] },
      ],
      usage: { server_side_tool_usage_details: { web_search_calls: 1 } },
    })
    const abort = new Error('The operation was aborted')
    abort.name = 'AbortError'
    global.fetch = jest.fn()
      .mockRejectedValueOnce(abort)
      .mockResolvedValueOnce(new Response(second, { status: 200, headers: { 'Content-Type': 'application/json' } })) as any

    const { callSystemSuperGrokWebSearch } = await import('@/lib/superGrokAssistant')
    const result = await callSystemSuperGrokWebSearch('latest OPT guidance', ['uscis.gov'])
    expect(result.webSearchCalls).toBe(1)
    expect(result.citations).toContain('https://www.uscis.gov/opt')
    expect(global.fetch).toHaveBeenCalledTimes(2)
    const firstHeaders = (global.fetch as jest.Mock).mock.calls[0][1].headers as Record<string, string>
    const secondHeaders = (global.fetch as jest.Mock).mock.calls[1][1].headers as Record<string, string>
    expect(firstHeaders.Authorization).toBe('Bearer direct-search-key')
    expect(secondHeaders.Authorization).toBe('Bearer oauth-token')
    const firstBody = JSON.parse(String((global.fetch as jest.Mock).mock.calls[0][1].body))
    expect(firstBody.include).toContain('web_search_call.action.sources')
  })

})
