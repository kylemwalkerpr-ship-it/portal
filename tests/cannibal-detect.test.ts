import { detectCannibalization } from '@/lib/seoFactory/cannibalDetect'

describe('Phase 8 cannibalization detection', () => {
  it('requires shared GSC queries plus another signal — title similarity alone is not enough', () => {
    const titleOnly = detectCannibalization({
      hits: [
        { query: 'alpha fees', page: 'https://x.com/a' },
        { query: 'beta visa', page: 'https://x.com/b' },
      ],
      pages: [
        { url: 'https://x.com/a', title: 'Canada Study Permit Guide' },
        { url: 'https://x.com/b', title: 'Canada Study Permit Guide 2026' },
      ],
    })
    expect(titleOnly).toHaveLength(0)
  })

  it('flags pairs that share queries and similar titles, without merging', () => {
    const found = detectCannibalization({
      hits: [
        { query: 'canada study permit', page: 'https://legal.example/permit', impressions: 400 },
        { query: 'canada study permit', page: 'https://legal.example/permit-guide', impressions: 220 },
        { query: 'study permit requirements', page: 'https://legal.example/permit', impressions: 80 },
        { query: 'study permit requirements', page: 'https://legal.example/permit-guide', impressions: 70 },
      ],
      pages: [
        { url: 'https://legal.example/permit', title: 'Canada Study Permit Requirements', clusterIds: ['cl-permit'] },
        { url: 'https://legal.example/permit-guide', title: 'Canada Study Permit Guide', clusterIds: ['cl-permit'] },
      ],
    })
    expect(found.length).toBe(1)
    expect(found[0].sharedQueries).toEqual(expect.arrayContaining(['canada study permit', 'study permit requirements']))
    expect(found[0].recommendedAction).not.toBe('ignore')
    expect(['merge', 'differentiate', 'canonical-review']).toContain(found[0].recommendedAction)
    expect(found[0].reasons.some((r) => /human must approve|canonical|differentiate/i.test(r) || r.length > 8)).toBe(true)
  })
})
