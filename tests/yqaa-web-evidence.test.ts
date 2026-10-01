import {
  buildYqaaLiveResearchContext,
  guardVerifiedLiveResearchDisclosure,
  isYqaaLiveWebSourceKey,
} from '@/lib/yqaaWebEvidence'

describe('YQAA live web evidence disclosure', () => {
  const browserEvidence = {
    sourceKey: 'cloudflare:browser_search',
    sourceUrl: 'https://www.uscis.gov/opt',
    fetchedAt: '2026-10-01T09:06:00.000Z',
  }

  test('recognizes both commissioned live-web evidence transports', () => {
    expect(isYqaaLiveWebSourceKey('cloudflare:browser_search')).toBe(true)
    expect(isYqaaLiveWebSourceKey('xai:web_search')).toBe(true)
    expect(isYqaaLiveWebSourceKey('database')).toBe(false)
  })

  test('builds an explicit verified-live-research context only when citation-linked evidence exists', () => {
    const context = buildYqaaLiveResearchContext([browserEvidence], 'verified')
    expect(context).toContain('LIVE WEB RESEARCH — VERIFIED THIS TURN')
    expect(context).toContain('uscis.gov')
    expect(context).toContain('2026-10-01T09:06:00.000Z')
    expect(context).toContain('Do NOT say that you cannot search')
    expect(buildYqaaLiveResearchContext([browserEvidence], 'retrieved')).toContain('LIVE WEB RESEARCH — VERIFIED THIS TURN')
    expect(buildYqaaLiveResearchContext([browserEvidence], 'failed')).toBe('')
    expect(buildYqaaLiveResearchContext([{ sourceKey: 'database', sourceUrl: 'https://example.com' }], 'verified')).toBe('')
  })

  test.each([
    'I cannot run a live web crawl in this session, so this is not a real-time news feed.',
    "I still can't search the internet from this chat, so I cannot confirm what is current.",
    "Live web research isn't available this turn. I can only summarize cached information.",
  ])('removes false capability denials after verified live research: %s', (denial) => {
    const result = guardVerifiedLiveResearchDisclosure(`**YQAA** ${denial}\n\nUSCIS says OPT is temporary employment.`, true)
    expect(result).toContain('**Live web research:** I checked live public sources for this answer')
    expect(result).not.toMatch(/cannot run a live web|can't search the internet|research isn't available/i)
    expect(result).toContain('USCIS says OPT')
  })

  test('does not rewrite capability wording when live research was not verified', () => {
    const text = "I cannot search the web this turn."
    expect(guardVerifiedLiveResearchDisclosure(text, false)).toBe(text)
  })
})
