import { emptyUbersuggestSnapshot, ingestToolResult, snapshotSummary } from '@/lib/seoEngine/ubersuggestSnapshot'
import { ubersuggestFullSpendPlan, UBERSUGGEST_TOOL_CATALOG } from '@/lib/seoEngine/ubersuggestCatalog'

describe('ubersuggestFullSpendPlan', () => {
  it('covers keyword, domain, SERP, backlink, content, audit, project and AISV layers', () => {
    const full = ubersuggestFullSpendPlan()
    const names = full.map((s) => s.name)
    expect(full.length).toBeGreaterThanOrEqual(28)
    expect(names).toEqual(expect.arrayContaining([
      'keyword_suggestions', 'keyword_metrics', 'content_ideas',
      'domain_overview', 'domain_keywords', 'domain_top_pages', 'competitors',
      'serp_analysis', 'backlinks_overview', 'backlinks', 'anchor_texts',
      'site_audit_status', 'pagespeed_audit', 'list_projects', 'seo_opportunities',
      'brand_visibility_overview',
    ]))
    expect(full.every((s) => UBERSUGGEST_TOOL_CATALOG.some((t) => t.name === s.name))).toBe(true)
    expect(full.every((s) => s.layer !== 'write' && s.layer !== 'auth')).toBe(true)
  })
})

describe('ingestToolResult', () => {
  it('captures competitors, pages, ideas and backlinks for the engine snapshot', () => {
    const snap = emptyUbersuggestSnapshot()
    ingestToolResult(snap, 'competitors', 'domain', { competitors: [{ domain: 'boundless.com', overlap: 12 }] })
    ingestToolResult(snap, 'domain_top_pages', 'domain', [{ url: 'https://yousafeconsultancy.com/uk/visa', traffic: 400 }])
    ingestToolResult(snap, 'content_ideas', 'content', { ideas: ['UK graduate visa timeline 2026'] })
    ingestToolResult(snap, 'backlinks', 'backlink', [{ source: 'https://gov.uk/x', anchor: 'visa guide', domain_rating: 90 }])
    expect(snap.competitors[0]?.domain).toBe('boundless.com')
    expect(snap.pages[0]?.url).toContain('yousafeconsultancy.com')
    expect(snap.contentIdeas).toContain('UK graduate visa timeline 2026')
    expect(snap.backlinks[0]?.anchor).toBe('visa guide')
    expect(snapshotSummary(snap)).toMatch(/competitors/)
  })
})
