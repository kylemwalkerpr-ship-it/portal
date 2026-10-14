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
    expect(origin.pathname).toBeNull()
    expect(origin.pageText).toBeNull()
  })

  it('strips portal route and rendered private dashboard context', async () => {
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
    expect(origin.pathname).toBeNull()
    expect(origin.url).toBeNull()
    expect(origin.pageText).toBeNull()
    expect(origin.headings).toBeNull()
  })

  it('strips authenticated Marketplace routes even on the public catalog host', async () => {
    const { normalizeAssistantOrigin } = await import('@/lib/centralAssistantKnowledge')
    const req = new Request('https://market.yousafeconsultancy.com/api/chat', {
      method: 'POST',
      headers: { Origin: 'https://market.yousafeconsultancy.com' },
    })
    const origin = normalizeAssistantOrigin({
      url: 'https://market.yousafeconsultancy.com/dashboard/orders/private-order',
      pathname: '/dashboard/orders/private-order',
      title: 'Private order details',
      pageText: 'Private buyer and offer data',
    }, req)
    expect(origin.hostname).toBe('market.yousafeconsultancy.com')
    expect(origin.pathname).toBeNull()
    expect(origin.url).toBeNull()
    expect(origin.title).toBeNull()
    expect(origin.pageText).toBeNull()
  })
})

describe('assistant marketplace intent', () => {
  it.each([
    ['application essay editing checklist', 'academic-writing', 'application-essays'],
    ['student study planning checklist', 'mentorship', 'student-mentorship'],
    ['organizing the full application for student planning across 6 documents', 'mentorship', 'student-mentorship'],
    ['university application checklist', 'education', 'university-admissions'],
    ['statement of purpose review', 'academic-writing', 'sop-writing'],
  ])('keeps the named service %s in its own pricing category', async (request, categoryId, subcategoryId) => {
    const { matchMarketplaceIntent } = await import('@/lib/assistantMarketplaceIntent')
    expect(matchMarketplaceIntent(`My budget is USD 450 for help with ${request}. Please clarify the scope and price.`)).toMatchObject({categoryId, subcategoryId})
  })
  it('maps concrete intent to a real canonical marketplace subcategory', async () => {
    const { matchMarketplaceIntent } = await import('@/lib/assistantMarketplaceIntent')
    const match = matchMarketplaceIntent('I need help preparing for an F-1 student visa and study permit')
    expect(match?.subcategoryId).toBe('study-permits')
    expect(match?.categoryId).toBe('immigration')
    expect(match?.url).toBe('https://market.yousafeconsultancy.com/categories/study-permits')
  })

  it('does not force a marketplace funnel on generic conversation', async () => {
    const { matchMarketplaceIntent } = await import('@/lib/assistantMarketplaceIntent')
    expect(matchMarketplaceIntent('hello, how are you today?')).toBeNull()
  })
})

describe('assistant deterministic fast replies', () => {
  it('answers the generic services question from the verified taxonomy without a model call', async () => {
    const { getDeterministicYqaaReply } = await import('@/lib/assistantFastReplies')
    const reply = getDeterministicYqaaReply([
      { role: 'user', content: 'What services do you sell?' },
    ])

    expect(reply).toContain('Immigration Services')
    expect(reply).toContain('Education & Admissions')
    expect(reply).toContain('Legal Services')
    expect(reply).toContain('Career Development')
    expect(reply).toContain('https://market.yousafeconsultancy.com/')
  })

  it('fast-paths trivial latest-message intents even when older history is unresolved', async () => {
    const { getDeterministicYqaaReply } = await import('@/lib/assistantFastReplies')

    const greeting = getDeterministicYqaaReply([
      { role: 'user', content: 'I need help with a complicated work permit issue' },
      { role: 'user', content: 'hello' },
    ])
    expect(greeting).toContain('YouSafe Quick Assistance Agent')

    const capabilities = getDeterministicYqaaReply([
      { role: 'user', content: 'I need help with a complicated work permit issue' },
      { role: 'user', content: 'how can you help me?' },
    ])
    expect(capabilities).toContain('YouSafe services and Marketplace navigation')

    expect(getDeterministicYqaaReply([{ role: 'user', content: 'thank you' }])).toContain("You're welcome")
    expect(getDeterministicYqaaReply([{ role: 'user', content: 'who are you?' }])).toContain('YQAA')
  })

  it('keeps specific service questions on the grounded AI path', async () => {
    const { getDeterministicYqaaReply } = await import('@/lib/assistantFastReplies')
    expect(getDeterministicYqaaReply([
      { role: 'user', content: 'What services do you have for an F-1 visa?' },
    ])).toBeNull()
  })
})


describe('assistant explicit human-handoff intent', () => {
  it('does not confuse ordinary help or resource language with a human-agent request', async () => {
    const { shouldEscalateToLiveAgent } = await import('@/lib/chatEscalation')
    expect(shouldEscalateToLiveAgent('I want you to help me')).toBe(false)
    expect(shouldEscalateToLiveAgent('Connect me with work permit information')).toBe(false)
    expect(shouldEscalateToLiveAgent('What does representative mean in this guide?')).toBe(false)
  })

  it('recognizes explicit requests for a human or support agent', async () => {
    const { shouldEscalateToLiveAgent } = await import('@/lib/chatEscalation')
    expect(shouldEscalateToLiveAgent('I want to talk to a human')).toBe(true)
    expect(shouldEscalateToLiveAgent('Please connect me with a support agent')).toBe(true)
    expect(shouldEscalateToLiveAgent('I need a real person')).toBe(true)
  })
})

test('preloaded public evidence builds context without another optional network fetch',async()=>{
  jest.resetModules()
  const fetchLiveKnowledge=jest.fn(()=>new Promise(()=>{}))
  jest.doMock('@/lib/liveKnowledge',()=>({fetchLiveKnowledge}))
  try {
    const {buildCentralAssistantKnowledge,normalizeAssistantOrigin}=await import('@/lib/centralAssistantKnowledge')
    const origin=normalizeAssistantOrigin({},new Request('https://portal.yousafeconsultancy.com/api/chat'))
    const work=buildCentralAssistantKnowledge({latestUserMessage:'provider checklist',origin,includeLiveSupplement:false,curatedChunks:[{id:'public-fixture',title:'Checklist',body:'Verified fixture public checklist',source:'https://yousafeconsultancy.com/',site:'main',repository:'public'}]})
    await Promise.resolve()
    expect(fetchLiveKnowledge).not.toHaveBeenCalled()
    expect(await work).toContain('Verified fixture public checklist')
    const empty=await buildCentralAssistantKnowledge({latestUserMessage:'provider checklist',origin,includeLiveSupplement:false,curatedChunks:[]})
    expect(empty).toContain('YOUSAFE QUICK ASSISTANCE AGENT')
    expect(fetchLiveKnowledge).not.toHaveBeenCalled()
  } finally {jest.dontMock('@/lib/liveKnowledge');jest.resetModules()}
})

describe('system-wide assistant model routing', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    jest.useRealTimers()
    jest.resetModules()
    jest.clearAllMocks()
  })

  it('uses the current Responses API with low reasoning through Messenger SuperGrok auth', async () => {
    jest.doMock('@/lib/messengerAi', () => ({
      resolveMessengerGrokAuth: jest.fn(async () => ({
        apiKey: 'system-ai-test-token',
        baseURL: 'https://system-ai.example/v1',
        model: 'grok-test-model',
        authMode: 'supergrok',
      })),
    }))

    const fetchMock = jest.fn(async (_url: RequestInfo | URL, _init?: RequestInit): Promise<any> => new Response(JSON.stringify({ output_text: 'Grounded answer' }), { status: 200 }))
    global.fetch = fetchMock as any

    const { callSystemSuperGrok } = await import('@/lib/superGrokAssistant')
    const result = await callSystemSuperGrok('system context', [
      { role: 'user', content: 'question' },
    ])

    expect(result.text).toBe('Grounded answer')
    expect(result.model).toBe('grok-test-model')
    expect(result.authMode).toBe('supergrok')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://system-ai.example/v1/responses')
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit)?.body))
    expect(body.reasoning).toEqual({ effort: 'low' })
    expect(body.prompt_cache_key).toBe('yqaa-public-assistant-v2')
    expect(body.store).toBe(false)
  })

  it('preserves a full primary Responses allowance after cold authentication', async () => {
    jest.useFakeTimers()
    jest.doMock('@/lib/messengerAi', () => ({ resolveMessengerGrokAuth: jest.fn(() => new Promise(resolve => setTimeout(() => resolve({
      apiKey:'test-only',baseURL:'https://system-ai.example/v1',model:'grok-test-model',authMode:'supergrok',
    }),6_500))) }))
    const fetchMock = jest.fn((_url:string,init:RequestInit) => new Promise((resolve,reject) => {
      const timer=setTimeout(()=>resolve(new Response(JSON.stringify({output_text:'Completed after cold auth'}),{status:200})),13_500)
      init.signal?.addEventListener('abort',()=>{clearTimeout(timer);reject(new DOMException('Aborted','AbortError'))},{once:true})
    }))
    global.fetch=fetchMock as any
    const {generateYqaaAnswer}=await import('@/lib/yqaaGeneration')
    const work=generateYqaaAnswer('public evidence',[{role:'user',content:'question'}])
    let completed:unknown=null
    void work.then(value=>{completed=value},()=>{completed={text:'failed'}})
    await jest.advanceTimersByTimeAsync(20_001)
    expect(completed).toMatchObject({text:'Completed after cold auth',provider:'grok',fallback:false})
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await work
  })

  it('lets a bounded Responses attempt finish instead of prematurely restarting it', async () => {
    jest.useFakeTimers()
    jest.doMock('@/lib/messengerAi', () => ({ resolveMessengerGrokAuth: jest.fn(async () => ({
      apiKey:'test-only',baseURL:'https://system-ai.example/v1',model:'grok-test-model',authMode:'supergrok',
    })) }))
    const fetchMock = jest.fn((_url: string, init: RequestInit) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve(new Response(JSON.stringify({output_text:'Completed answer'}),{status:200})), 10_500)
      init.signal?.addEventListener('abort',()=>{clearTimeout(timer);reject(new DOMException('Aborted','AbortError'))},{once:true})
    }))
    global.fetch=fetchMock as any
    const {callSystemSuperGrok}=await import('@/lib/superGrokAssistant')
    const work=callSystemSuperGrok('public evidence',[{role:'user',content:'question'}],{timeoutMs:17_000})
    let completed: unknown = null
    void work.then(value=>{completed=value},()=>{completed={text:'failed'}})
    await jest.advanceTimersByTimeAsync(10_501)
    expect(completed).toMatchObject({text:'Completed answer'})
    expect(fetchMock).toHaveBeenCalledTimes(1)
    jest.useRealTimers()
  })

  it('allows a measured slow Responses answer to finish inside the unchanged primary budget', async () => {
    jest.useFakeTimers()
    jest.doMock('@/lib/messengerAi', () => ({resolveMessengerGrokAuth: jest.fn(async () => ({apiKey:'synthetic',baseURL:'https://provider.invalid/v1',model:'grok-4.6',authMode:'supergrok'}))}))
    const fetchMock=jest.fn((_url:string,init:RequestInit)=>new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>resolve(new Response(JSON.stringify({output_text:'Completed slow answer'}),{status:200})),19000)
      init.signal?.addEventListener('abort',()=>{clearTimeout(timer);reject(new DOMException('Aborted','AbortError'))},{once:true})
    }))
    global.fetch=fetchMock as any
    const {callSystemSuperGrok}=await import('@/lib/superGrokAssistant')
    const work=callSystemSuperGrok('Synthetic policy',[{role:'user',content:'Question'}],{timeoutMs:24000})
    await jest.advanceTimersByTimeAsync(19001)
    await expect(work).resolves.toMatchObject({text:'Completed slow answer'})
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each([0,6500])('shrinks Chat recovery to remaining attempt time after Responses times out (auth %i ms)', async authMs => {
    jest.useFakeTimers()
    jest.doMock('@/lib/messengerAi', () => ({resolveMessengerGrokAuth: jest.fn(() => new Promise(resolve=>setTimeout(()=>resolve({apiKey:'synthetic',baseURL:'https://provider.invalid/v1',model:'grok-4.6',authMode:'supergrok'}),authMs)))}))
    const calls:Array<{protocol:string,started:number}>=[]
    const started=Date.now()
    const fetchMock=jest.fn((url:string,init:RequestInit)=>new Promise((resolve,reject)=>{
      calls.push({protocol:url.endsWith('/responses')?'responses':'chat',started:Date.now()-started})
      const timer=url.endsWith('/chat/completions')?setTimeout(()=>resolve(new Response(JSON.stringify({choices:[{message:{content:'Recovered within remaining budget'}}]}),{status:200})),2500):null
      init.signal?.addEventListener('abort',()=>{if(timer)clearTimeout(timer);const error=new Error('Provider attempt timed out');error.name='AbortError';reject(error)},{once:true})
    }))
    global.fetch=fetchMock as any
    const {callSystemSuperGrok}=await import('@/lib/superGrokAssistant')
    const work=callSystemSuperGrok('Synthetic policy',[{role:'user',content:'Question'}],{timeoutMs:24000})
    await jest.advanceTimersByTimeAsync(23999)
    await expect(work).resolves.toMatchObject({text:'Recovered within remaining budget'})
    expect(calls.map(x=>x.protocol)).toEqual(['responses','chat'])
    expect(calls[1].started).toBeLessThanOrEqual(21000)
    expect(Date.now()-started).toBeLessThan(24000)
  })

  it('uses Chat Completions as an independent low-reasoning fallback after a Responses timeout', async () => {
    jest.doMock('@/lib/messengerAi', () => ({
      resolveMessengerGrokAuth: jest.fn(async () => ({
        apiKey: 'system-ai-test-token',
        baseURL: 'https://system-ai.example/v1',
        model: 'grok-test-model',
        authMode: 'supergrok',
      })),
    }))

    const timeout = new Error('timed out')
    timeout.name = 'AbortError'
    const fetchMock = jest.fn()
      .mockRejectedValueOnce(timeout)
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: 'Recovered answer' } }] }),{status:200}))
    global.fetch = fetchMock as any

    const { callSystemSuperGrok } = await import('@/lib/superGrokAssistant')
    const result = await callSystemSuperGrok('system context', [
      { role: 'user', content: 'question' },
    ])

    expect(result.text).toBe('Recovered answer')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[0][0])).toContain('/responses')
    expect(String(fetchMock.mock.calls[1][0])).toContain('/chat/completions')
    const fallbackBody = JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit)?.body))
    expect(fallbackBody.reasoning_effort).toBe('low')
  })
})
