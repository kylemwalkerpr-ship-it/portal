describe('system-wide assistant origin context', () => {
  it('accepts every YouSafe sister-site HTTPS origin and rejects outsiders', async () => {
    const { isAllowedAssistantOrigin } = await import('@/lib/centralAssistantKnowledge')
    expect(isAllowedAssistantOrigin('https://yousafeconsultancy.com')).toBe(true)
    expect(isAllowedAssistantOrigin('https://usa.yousafeconsultancy.com')).toBe(true)
    expect(isAllowedAssistantOrigin('https://au.yousafeconsultancy.com')).toBe(true)
    expect(isAllowedAssistantOrigin('https://legal.yousafeconsultancy.com')).toBe(true)
    expect(isAllowedAssistantOrigin('https://evil.example')).toBe(false)
    expect(isAllowedAssistantOrigin('http://legal.yousafeconsultancy.com')).toBe(false)
  })

  it('binds site identity to the trusted browser Origin instead of spoofed body data', async () => {
    const { normalizeAssistantOrigin } = await import('@/lib/centralAssistantKnowledge')
    const req = new Request('https://portal.yousafeconsultancy.com/api/chat', {
      method: 'POST',
      headers: { Origin: 'https://legal.yousafeconsultancy.com' },
    })
    const origin = normalizeAssistantOrigin(
      {
        hostname: 'usa.yousafeconsultancy.com',
        url: 'https://usa.yousafeconsultancy.com/wrong-page',
        pathname: '/actual-caseworks-page',
        title: 'Caseworks article',
        pageText: 'Visible legal article text',
      },
      req,
    )

    expect(origin.hostname).toBe('legal.yousafeconsultancy.com')
    expect(origin.pathname).toBe('/actual-caseworks-page')
    expect(origin.pageText).toBe('Visible legal article text')
  })

  it('keeps portal route context but strips rendered private dashboard content', async () => {
    const { normalizeAssistantOrigin } = await import('@/lib/centralAssistantKnowledge')
    const req = new Request('https://portal.yousafeconsultancy.com/api/chat', {
      method: 'POST',
      headers: { Origin: 'https://portal.yousafeconsultancy.com' },
    })
    const origin = normalizeAssistantOrigin(
      {
        hostname: 'portal.yousafeconsultancy.com',
        url: 'https://portal.yousafeconsultancy.com/orders/private-order',
        pathname: '/orders/private-order',
        headings: 'Private order details',
        pageText: 'Sensitive private customer data',
      },
      req,
    )

    expect(origin.hostname).toBe('portal.yousafeconsultancy.com')
    expect(origin.pathname).toBe('/orders/private-order')
    expect(origin.pageText).toBeNull()
    expect(origin.headings).toBeNull()
  })
})

describe('system-wide assistant model routing', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    jest.resetModules()
    jest.clearAllMocks()
  })

  it('routes through Messenger SuperGrok auth/model without another AI provider', async () => {
    jest.doMock('@/lib/messengerAi', () => ({
      resolveMessengerGrokAuth: jest.fn(async () => ({
        apiKey: 'supergrok-test-token',
        baseURL: 'https://supergrok.example/v1',
        model: 'grok-test-model',
        authMode: 'supergrok',
      })),
    }))

    const fetchMock = jest.fn(async (url: string) => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ choices: [{ message: { content: 'Context-aware answer' } }] }),
    }))
    global.fetch = fetchMock as any

    const { callSystemSuperGrok } = await import('@/lib/superGrokAssistant')
    const result = await callSystemSuperGrok('system context', [
      { role: 'user', content: 'question' },
    ])

    expect(result.text).toBe('Context-aware answer')
    expect(result.model).toBe('grok-test-model')
    expect(result.authMode).toBe('supergrok')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://supergrok.example/v1/chat/completions')
  })
})
