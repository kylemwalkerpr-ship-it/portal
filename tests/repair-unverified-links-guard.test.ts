import { isProtectedMarketplaceUrl, repairUnverifiedInternalLinks } from '../lib/seoFactory/linkAudit'

describe('repairUnverifiedInternalLinks — empty live-set guard', () => {
  const content = [
    '## Related guides',
    '',
    '- [Administrative Review Letter Template UK](https://legal.yousafeconsultancy.com/uk/visa-refusal-admin-review/) — challenge a UK visa refusal.',
    '- [UK Immigration Hub — CaseWorks Guides](https://legal.yousafeconsultancy.com/uk/) — step-by-step UK immigration guides.',
    '',
  ].join('\n')

  it('leaves estate links untouched when the live set is empty (sitemap fetch failed)', () => {
    const r = repairUnverifiedInternalLinks(content, new Set())
    expect(r.content).toBe(content)
    expect(r.unwrapped).toBe(0)
    expect(r.rewritten).toBe(0)
  })

  it('still unwraps unverified links when the live set is populated', () => {
    const live = new Set(['https://legal.yousafeconsultancy.com/uk'])
    const r = repairUnverifiedInternalLinks(content, live)
    expect(r.unwrapped).toBe(1)
    expect(r.content).toContain('[UK Immigration Hub — CaseWorks Guides](https://legal.yousafeconsultancy.com/uk/)')
    expect(r.content).not.toContain('(/uk/visa-refusal-admin-review/)')
  })
})

describe('marketplace reviewer profile URLs survive Audit & Fix', () => {
  const profile = 'https://market.yousafeconsultancy.com/marketplace/providers/charlotte-sullivan/'
  const draft = [
    '## About the author',
    '',
    `Reviewed by Charlotte Sullivan. [Reviewer Profile](${profile})`,
    '',
  ].join('\n')

  it('recognises provider and gig marketplace URLs', () => {
    expect(isProtectedMarketplaceUrl(profile)).toBe(true)
    expect(isProtectedMarketplaceUrl('https://market.yousafeconsultancy.com/marketplace/gigs/spousal-sponsorship-consult/')).toBe(true)
    expect(isProtectedMarketplaceUrl('https://legal.yousafeconsultancy.com/ca/charlotte-sullivan')).toBe(false)
    expect(isProtectedMarketplaceUrl('https://market.yousafeconsultancy.com/about')).toBe(false)
  })

  it('does not swap a reviewer profile for a same-slug legal page', () => {
    const live = new Set([
      'https://legal.yousafeconsultancy.com/ca/spousal-sponsorship',
      'https://legal.yousafeconsultancy.com/ca/charlotte-sullivan',
    ])
    const r = repairUnverifiedInternalLinks(draft, live)
    expect(r.rewritten).toBe(0)
    expect(r.unwrapped).toBe(0)
    expect(r.content).toContain(`[Reviewer Profile](${profile})`)
    expect(r.content).not.toContain('legal.yousafeconsultancy.com/ca/charlotte-sullivan')
  })

  it('does not unwrap a reviewer profile just because it is missing from the legal sitemap', () => {
    const live = new Set(['https://legal.yousafeconsultancy.com/ca/spousal-sponsorship'])
    const r = repairUnverifiedInternalLinks(draft, live)
    expect(r.unwrapped).toBe(0)
    expect(r.content).toContain(profile)
  })
})
