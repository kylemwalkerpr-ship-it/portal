import {
  crawlDepthForUrl,
  deriveSiteHealthFacts,
  normalizePageUrl,
} from '@/lib/seoFactory/siteHealthSnapshot'
import { enrichInboundLinks, isRootPageUrl, type SiteHealthPage } from '@/lib/seoFactory/siteHealth'
import { computeSignals } from '@/lib/seoFactory/masterEngine'

function page(partial: Partial<SiteHealthPage> & { url: string }): SiteHealthPage {
  return {
    repo: 'caseworks',
    host: 'legal.yousafeconsultancy.com',
    path: 'app/x/page.tsx',
    title: 'Test',
    indexable: true,
    noindex: false,
    words: 500,
    inboundLinks: 0,
    sampleSources: [],
    ...partial,
  }
}

describe('site health snapshot helpers', () => {
  it('normalizes URLs to a host+pathname match key', () => {
    expect(normalizePageUrl('https://Legal.Yousafeconsultancy.com/uk/graduate-visa/')).toBe(
      'legal.yousafeconsultancy.com/uk/graduate-visa',
    )
    expect(normalizePageUrl('https://legal.yousafeconsultancy.com/')).toBe(
      'legal.yousafeconsultancy.com/',
    )
  })

  it('computes crawl depth from path segments', () => {
    expect(crawlDepthForUrl('https://h/a/b/c/')).toBe(3)
    expect(crawlDepthForUrl('https://h/')).toBe(0)
  })

  it('flags the root page as never-an-orphan', () => {
    expect(isRootPageUrl('https://legal.yousafeconsultancy.com/')).toBe(true)
    expect(isRootPageUrl('https://legal.yousafeconsultancy.com/a/')).toBe(false)
  })
})

describe('deriveSiteHealthFacts', () => {
  it('derives orphan, inSitemap, and crawlDepth from a scan + sitemap diffs', () => {
    const pages = [
      page({ url: 'https://legal.yousafeconsultancy.com/', inboundLinks: 0 }),
      page({ url: 'https://legal.yousafeconsultancy.com/a/', inboundLinks: 0 }),
      page({ url: 'https://legal.yousafeconsultancy.com/b/c/', inboundLinks: 2 }),
    ]
    const facts = deriveSiteHealthFacts(pages, [
      { repo: 'caseworks', liveReachable: true, missing: ['https://legal.yousafeconsultancy.com/a/'] },
    ])
    const byUrl = new Map(facts.map((f) => [f.url, f]))

    // root page: 0 links but excluded from orphan classification
    expect(byUrl.get('https://legal.yousafeconsultancy.com/')!.orphan).toBe(false)
    expect(byUrl.get('https://legal.yousafeconsultancy.com/')!.crawlDepth).toBe(0)

    // /a/ has zero inbound links → orphan, and it's missing from the sitemap
    expect(byUrl.get('https://legal.yousafeconsultancy.com/a/')!.orphan).toBe(true)
    expect(byUrl.get('https://legal.yousafeconsultancy.com/a/')!.inSitemap).toBe(false)

    // /b/c/ has inbound links → not orphan, present in sitemap
    expect(byUrl.get('https://legal.yousafeconsultancy.com/b/c/')!.orphan).toBe(false)
    expect(byUrl.get('https://legal.yousafeconsultancy.com/b/c/')!.inSitemap).toBe(true)
    expect(byUrl.get('https://legal.yousafeconsultancy.com/b/c/')!.crawlDepth).toBe(2)
  })

  it('marks inSitemap null when the sitemap was unreachable', () => {
    const facts = deriveSiteHealthFacts(
      [page({ url: 'https://legal.yousafeconsultancy.com/a/' })],
      [{ repo: 'caseworks', liveReachable: false, missing: [] }],
    )
    expect(facts[0].inSitemap).toBeNull()
  })
})

describe('enrichInboundLinks', () => {
  it('counts estate inbound links across the scan', () => {
    const a = page({
      url: 'https://legal.yousafeconsultancy.com/a/',
      content: '<a href="/b/">read B</a>',
    })
    const b = page({ url: 'https://legal.yousafeconsultancy.com/b/', content: '' })
    const enriched = enrichInboundLinks([a, b])
    const byUrl = new Map(enriched.map((p) => [p.url, p]))
    expect(byUrl.get('https://legal.yousafeconsultancy.com/b/')!.inboundLinks).toBe(1)
    expect(byUrl.get('https://legal.yousafeconsultancy.com/a/')!.inboundLinks).toBe(0)
  })
})

describe('computeSignals — site health feed', () => {
  it('lights up sitemap, crawl depth, orphan, noindex, indexable and thin-word signals', () => {
    const v = computeSignals({
      content: 'A substantial body of prose that is clearly long enough to avoid thin-page flags.',
      primaryKeyword: 'graduate visa',
      siteHealth: {
        orphan: true,
        inboundLinks: 0,
        inSitemap: false,
        noindex: true,
        indexable: false,
        crawlDepth: 3,
        words: 200,
      },
    })
    expect(v.t_sitemap_membership).toBe(0)
    expect(v.t_crawl_depth).toBeCloseTo(0.4, 2)
    expect(v.l_orphan_risk).toBe(0)
    expect(v.t_noindex_absent).toBe(0)
    expect(v.t_indexable).toBe(0)
    expect(v.t_soft404).toBe(0) // 200 words < 400 → thin
  })

  it('clears the same signals for a healthy page', () => {
    const v = computeSignals({
      content: 'A substantial body of prose that is clearly long enough.',
      primaryKeyword: 'graduate visa',
      siteHealth: {
        orphan: false,
        inboundLinks: 4,
        inSitemap: true,
        noindex: false,
        indexable: true,
        crawlDepth: 1,
        words: 900,
      },
    })
    expect(v.t_sitemap_membership).toBe(1)
    expect(v.t_crawl_depth).toBeCloseTo(0.8, 2)
    expect(v.l_orphan_risk).toBe(1)
    expect(v.t_noindex_absent).toBe(1)
    expect(v.t_indexable).toBe(1)
    expect(v.t_soft404).toBe(1)
  })

  it('keeps signals null when no site health snapshot is present', () => {
    const v = computeSignals({ content: 'body', primaryKeyword: 'x' })
    expect(v.t_sitemap_membership).toBeNull()
    expect(v.t_crawl_depth).toBeNull()
  })
})
