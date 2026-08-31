import { repairUnverifiedInternalLinks } from '../lib/seoFactory/linkAudit'

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
