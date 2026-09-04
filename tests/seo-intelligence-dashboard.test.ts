import { FORBIDDEN_SEO_COLUMNS, OPPORTUNITY_TABLE_COLUMNS, SEO_INTEL_NAV } from '@/components/design/seo-intelligence-dashboard'

describe('Phase 10 SEO intelligence dashboard contract', () => {
  it('uses the spec navigation and never shows Volume, KD, or CPC columns', () => {
    expect(SEO_INTEL_NAV).toEqual(['overview', 'opportunities', 'topics', 'content', 'links', 'keywords', 'gsc'])
    expect(OPPORTUNITY_TABLE_COLUMNS).toEqual([
      'Opportunity', 'Action', 'Score', 'Confidence', 'Impressions', 'Position', 'CTR', 'Coverage',
    ])
    for (const banned of FORBIDDEN_SEO_COLUMNS) {
      expect(OPPORTUNITY_TABLE_COLUMNS as readonly string[]).not.toContain(banned)
    }
  })
})
