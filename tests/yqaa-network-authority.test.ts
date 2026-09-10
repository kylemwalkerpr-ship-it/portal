import fs from 'fs'
import path from 'path'

jest.mock('@/lib/liveKnowledge', () => ({
  fetchLiveKnowledge: jest.fn(async () => null),
}))

jest.mock('@/lib/messengerSiteKnowledge', () => {
  const actual = jest.requireActual('@/lib/messengerSiteKnowledge')
  return {
    ...actual,
    buildMessengerSiteKnowledge: jest.fn(async () => ({
      systemAppendix: '',
      chunks: [],
      providerContext: null,
    })),
  }
})

describe('YQAA canonical network authority', () => {
  it('treats Australia as a first-class supported YouSafe market', async () => {
    const { buildAuthoritativeNetworkContext } = await import('@/lib/assistantNetworkAuthority')
    const context = buildAuthoritativeNetworkContext('Tell me about moving to Australia')

    expect(context).toContain('United States, United Kingdom, Canada, and Australia')
    expect(context).toContain('Australia is a supported YouSafe destination and jurisdiction')
    expect(context).toContain('https://au.yousafeconsultancy.com')
    expect(context).toContain('Subclass 500')
    expect(context).toContain('Subclass 485')
  })

  it('injects canonical authority even when live and crawled retrieval return nothing', async () => {
    const { buildCentralAssistantKnowledge } = await import('@/lib/centralAssistantKnowledge')
    const prompt = await buildCentralAssistantKnowledge({
      latestUserMessage: 'Tell me about moving to Australia',
      origin: {
        surface: 'portal',
        origin: 'https://portal.yousafeconsultancy.com',
        hostname: 'portal.yousafeconsultancy.com',
        pathname: '/messages',
        url: 'https://portal.yousafeconsultancy.com/messages',
        title: 'Messages',
        referrer: null,
        locale: 'en',
        headings: null,
        pageText: null,
      },
    })

    expect(prompt).toContain('CANONICAL YOUSAFE NETWORK AUTHORITY')
    expect(prompt).toContain('Australia is a supported YouSafe destination and jurisdiction')
    expect(prompt).toContain('https://au.yousafeconsultancy.com')
  })

  it('blocks the exact false Australia exclusion shown in production', async () => {
    const { enforceCanonicalMarketCoverage } = await import('@/lib/assistantNetworkAuthority')
    const guarded = enforceCanonicalMarketCoverage(
      'Tell me about moving to Australia',
      "Australia isn't a YouSafe destination we cover, so I can't give you verified YouSafe-specific steps.",
    )

    expect(guarded.corrected).toBe(true)
    expect(guarded.correctedMarkets).toContain('AU')
    expect(guarded.text).toContain('Australia is a supported YouSafe market')
    expect(guarded.text).toContain('https://au.yousafeconsultancy.com')
    expect(guarded.text).toContain('Subclass 500')
  })

  it('does not rewrite a valid Australia answer', async () => {
    const { enforceCanonicalMarketCoverage } = await import('@/lib/assistantNetworkAuthority')
    const reply = 'Australia is one of YouSafe’s supported markets. I can help you find the relevant document-preparation path.'
    const guarded = enforceCanonicalMarketCoverage('I am moving to Australia', reply)

    expect(guarded.corrected).toBe(false)
    expect(guarded.text).toBe(reply)
  })

  it('does not allow the Yara-era static knowledge base back into central fallback', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'lib', 'centralAssistantKnowledge.ts'),
      'utf8',
    )
    expect(source).not.toContain("import('@/lib/chatKnowledgeBase')")
  })
})

describe('central crawler sibling coverage', () => {
  it('requires Australia and every customer-facing sibling repository without retired checkout', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'scripts', 'sync-central-assistant-kb.mjs'),
      'utf8',
    )

    expect(source).toContain("id: 'australia'")
    expect(source).toContain("requiredTerms: ['australia', 'subclass 500']")
    expect(source).toContain('kylemwalkerpr-ship-it/portal')
    expect(source).toContain('kylemwalkerpr-ship-it/yousafe-consultancy')
    expect(source).toContain('kylemwalkerpr-ship-it/caseworks')
    expect(source).toContain('kylemwalkerpr-ship-it/support-saas')
    expect(source).toContain('refusing to replace healthy snapshot')
    expect(source).not.toContain('checkout.yousafeconsultancy.com')
    expect(source).not.toContain("id: 'checkout'")
  })
})
