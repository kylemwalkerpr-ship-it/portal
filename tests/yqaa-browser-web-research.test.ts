describe('YQAA Cloudflare Browser web fallback', () => {
  afterEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  test('falls back from xAI to Browser discovery and only accepts official YMYL pages', async () => {
    const uscis = 'https://www.uscis.gov/working-in-the-united-states/students-and-exchange-visitors/optional-practical-training-opt-for-f-1-students'
    const ddgUscis = `https://duckduckgo.com/l/?uddg=${encodeURIComponent(uscis)}&rut=abc`
    const ddgEvil = `https://duckduckgo.com/l/?uddg=${encodeURIComponent('https://evil.example/latest-opt')}&rut=def`
    const quickAction = jest.fn(async (action: string, options: Record<string, any>) => {
      if (action === 'links') {
        return new Response(JSON.stringify({ success: true, result: [ddgEvil, ddgUscis], meta: { status: 200 } }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        })
      }
      if (action === 'markdown' && options.url === uscis) {
        return new Response(JSON.stringify({
          success: true,
          result: '---\ntitle: "Optional Practical Training (OPT) for F-1 Students | USCIS"\n---\n\n# Optional Practical Training (OPT) for F-1 Students\n\nOptional Practical Training is temporary employment that is directly related to an F-1 student major area of study. Eligible F-1 students can review current filing and eligibility information on this USCIS page.',
          meta: { status: 200, finalUrl: uscis },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      throw new Error(`unexpected Browser action ${action} ${String(options.url)}`)
    })

    jest.doMock('@/lib/superGrokAssistant', () => ({
      callSystemSuperGrokWebSearch: jest.fn(async () => { throw new Error('xAI search unavailable') }),
    }))
    jest.doMock('@opennextjs/cloudflare', () => ({
      getCloudflareContext: () => ({ env: { BROWSER: { quickAction } } }),
    }))

    const { researchYqaaPublicWeb } = await import('@/lib/yqaaWebResearch')
    const evidence = await researchYqaaPublicWeb('What are the latest OPT rules for F-1 students?', 'portal.yousafeconsultancy.com')

    expect(evidence).toHaveLength(1)
    expect(evidence[0]).toMatchObject({
      sourceKey: 'web:cloudflare_browser',
      site: 'official-web',
      jurisdiction: 'United States',
      sourceUrl: uscis,
      authorityTier: 5,
    })
    expect(evidence[0].body).toMatch(/Optional Practical Training/i)
    expect(quickAction).toHaveBeenCalledWith('links', expect.objectContaining({ url: expect.stringContaining('html.duckduckgo.com') }))
    const discoveryUrl = String((quickAction.mock.calls as any[][])[0][1].url)
    expect(decodeURIComponent(discoveryUrl)).toContain('site:uscis.gov')
    expect(quickAction).toHaveBeenCalledWith('markdown', expect.objectContaining({ url: uscis }))
    expect(quickAction).toHaveBeenCalledTimes(2)
  })

  test('general public-web fallback rejects private-network and account/dashboard search results', async () => {
    const safe = 'https://example.com/public-guide'
    const quickAction = jest.fn(async (action: string, options: Record<string, any>) => {
      if (action === 'links') {
        return new Response(JSON.stringify({ success: true, result: [
          'https://127.0.0.1/private',
          'https://192.168.1.2/secret',
          'https://example.com/account/profile',
          safe,
        ], meta: { status: 200 } }), { status: 200 })
      }
      if (action === 'markdown' && options.url === safe) {
        return new Response(JSON.stringify({
          success: true,
          result: '---\ntitle: "Public guide"\n---\n\n# Public guide\n\nThis public guide explains remote work productivity with practical scheduling, communication, and focus techniques for distributed teams.',
          meta: { status: 200, finalUrl: safe },
        }), { status: 200 })
      }
      throw new Error(`unexpected Browser action ${action}`)
    })
    jest.doMock('@/lib/superGrokAssistant', () => ({
      callSystemSuperGrokWebSearch: jest.fn(async () => { throw new Error('xAI search unavailable') }),
    }))
    jest.doMock('@opennextjs/cloudflare', () => ({
      getCloudflareContext: () => ({ env: { BROWSER: { quickAction } } }),
    }))

    const { researchYqaaPublicWeb } = await import('@/lib/yqaaWebResearch')
    const evidence = await researchYqaaPublicWeb('Search the web for a public guide to remote work productivity')
    expect(evidence).toHaveLength(1)
    expect(evidence[0]).toMatchObject({ sourceKey: 'web:cloudflare_browser', site: 'public-web', sourceUrl: safe, authorityTier: 3 })
    expect(quickAction).toHaveBeenCalledTimes(2)
  })
})
