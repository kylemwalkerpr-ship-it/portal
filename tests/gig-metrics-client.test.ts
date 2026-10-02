import { readFileSync } from 'fs'
import { join } from 'path'
import { hasClientSessionHint } from '@/lib/gigMetricsClient'

describe('gig metric beacon only fires with a Clerk session hint', () => {
  it('treats absent or 0 __client_uat as signed out', () => {
    expect(hasClientSessionHint('')).toBe(false)
    expect(hasClientSessionHint('cw_consent=1; __client_uat=0')).toBe(false)
    expect(hasClientSessionHint('__client_uat_AbC12=0; other=1')).toBe(false)
    expect(hasClientSessionHint('__client_uat=')).toBe(false)
  })

  it('treats a timestamp __client_uat (plain or suffixed) as signed in', () => {
    expect(hasClientSessionHint('a=1; __client_uat=1790000000')).toBe(true)
    expect(hasClientSessionHint('__client_uat_AbC12=1790000000')).toBe(true)
  })

  it('gig pages no longer POST metrics unconditionally (anonymous 401s)', () => {
    for (const p of ['components/marketplace/GigDetailPage.tsx', 'components/marketplace/GigDiscoveryPage.tsx']) {
      const src = readFileSync(join(__dirname, '..', p), 'utf8')
      expect(src).not.toContain("'/api/gig-metrics/event'")
      expect(src).toContain('postGigMetric(')
    }
  })
})
