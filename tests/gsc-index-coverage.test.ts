import {
  classifyIndexStatus,
  type GscRawIndexStatus,
} from '@/lib/gscIndexCoverage'
import {
  ensureCanonical,
  fixRobotsTxtDirective,
  computeIndexFix,
  type IndexFixItem,
} from '@/lib/seoFactory/indexCoverageFixes'
import type { SiteHealthPage } from '@/lib/seoFactory/siteHealth'
import type { GscIndexIssue } from '@/lib/gscIndexCoverage'

function raw(partial: Partial<GscRawIndexStatus>): GscRawIndexStatus {
  return {
    verdict: 'NEUTRAL',
    coverageState: 'Discovered - currently not indexed',
    indexingState: 'INDEXING_ALLOWED',
    pageFetchState: 'SUCCESSFUL',
    robotsTxtState: 'ALLOWED',
    ...partial,
  }
}

describe('classifyIndexStatus', () => {
  const u = 'https://legal.yousafeconsultancy.com/us/student-visas/x/'

  it('classifies an indexed URL', () => {
    const issue = classifyIndexStatus(u, raw({ verdict: 'PASS', coverageState: 'Indexed, submitted in sitemap' }))
    expect(issue.indexed).toBe(true)
    expect(issue.reasonCode).toBe('INDEXED')
    expect(issue.fixAction).toBe('NONE')
  })

  it('detects the noindex meta tag block', () => {
    const issue = classifyIndexStatus(u, raw({ indexingState: 'BLOCKED_BY_META_TAG' }))
    expect(issue.reasonCode).toBe('NOINDEX_TAG')
    expect(issue.fixAction).toBe('REMOVE_NOINDEX')
    expect(issue.autoFix).toBe(true)
  })

  it('detects the X-Robots-Tag header block', () => {
    const issue = classifyIndexStatus(u, raw({ indexingState: 'BLOCKED_BY_HTTP_HEADER' }))
    expect(issue.reasonCode).toBe('NOINDEX_HTTP_HEADER')
    expect(issue.fixAction).toBe('REMOVE_NOINDEX')
  })

  it('maps fetch-state errors to their reason codes', () => {
    expect(classifyIndexStatus(u, raw({ pageFetchState: 'SOFT_404' })).reasonCode).toBe('SOFT_404')
    expect(classifyIndexStatus(u, raw({ pageFetchState: 'NOT_FOUND' })).reasonCode).toBe('NOT_FOUND_404')
    expect(classifyIndexStatus(u, raw({ pageFetchState: 'SERVER_ERROR' })).reasonCode).toBe('SERVER_ERROR_5XX')
    expect(classifyIndexStatus(u, raw({ pageFetchState: 'REDIRECT_ERROR' })).reasonCode).toBe('REDIRECT_ERROR')
    expect(classifyIndexStatus(u, raw({ pageFetchState: 'ACCESS_DENIED' })).reasonCode).toBe('ACCESS_DENIED_401')
    expect(classifyIndexStatus(u, raw({ pageFetchState: 'ACCESS_FORBIDDEN' })).reasonCode).toBe('ACCESS_FORBIDDEN_403')
  })

  it('maps robots.txt disallow', () => {
    const issue = classifyIndexStatus(u, raw({ robotsTxtState: 'DISALLOWED', pageFetchState: 'SUCCESSFUL' }))
    expect(issue.reasonCode).toBe('BLOCKED_ROBOTS_TXT')
    expect(issue.fixAction).toBe('FIX_ROBOTS_TXT')
    expect(issue.autoFix).toBe(true)
  })

  it('maps duplicate canonical coverage states', () => {
    expect(
      classifyIndexStatus(u, raw({ coverageState: 'Duplicate without user-selected canonical' })).reasonCode,
    ).toBe('DUPLICATE_NO_CANONICAL')
    expect(
      classifyIndexStatus(u, raw({ coverageState: 'Duplicate, Google chose different canonical than user' })).reasonCode,
    ).toBe('DUPLICATE_CHOSEN_CANONICAL')
  })

  it('treats alternate-page-with-canonical as fine', () => {
    const issue = classifyIndexStatus(u, raw({ coverageState: 'Alternate page with proper canonical tag' }))
    expect(issue.reasonCode).toBe('ALTERNATE_WITH_CANONICAL')
    expect(issue.indexed).toBe(true)
    expect(issue.fixAction).toBe('NONE')
  })

  it('maps discovered/crawled not indexed', () => {
    expect(
      classifyIndexStatus(u, raw({ coverageState: 'Discovered - currently not indexed' })).reasonCode,
    ).toBe('DISCOVERED_NOT_INDEXED')
    expect(
      classifyIndexStatus(u, raw({ coverageState: 'Crawled - currently not indexed' })).reasonCode,
    ).toBe('CRAWLED_NOT_INDEXED')
  })

  it('handles a missing inspection result as unknown-to-google', () => {
    const issue = classifyIndexStatus(u, null)
    expect(issue.reasonCode).toBe('UNKNOWN_TO_GOOGLE')
    expect(issue.fixAction).toBe('ADD_SITEMAP')
  })
})

describe('ensureCanonical', () => {
  const url = 'https://legal.yousafeconsultancy.com/us/student-visas/x/'

  it('replaces an existing canonical value', () => {
    const out = ensureCanonical(`const metadata = { canonical: "https://old.example.com/x" }`, url)
    expect(out).toContain(`canonical: ${JSON.stringify(url)}`)
    expect(out).not.toContain('old.example.com')
  })

  it('inserts canonical into an existing alternates block', () => {
    const out = ensureCanonical(`const metadata = { alternates: { languages: {} } }`, url)
    expect(out).toContain(`alternates: { canonical: ${JSON.stringify(url)},`)
  })

  it('adds alternates.canonical to a metadata export without one', () => {
    const out = ensureCanonical(`export const metadata: Metadata = {\n  title: 'X',\n}`, url)
    expect(out).toContain(`alternates: { canonical: ${JSON.stringify(url)} },`)
  })

  it('prepends a metadata export when none exists', () => {
    const out = ensureCanonical(`export default function Page() { return <div/> }`, url)
    expect(out.startsWith(`export const metadata = { alternates: { canonical: ${JSON.stringify(url)} } }`)).toBe(true)
  })

  it('leaves a correct canonical unchanged', () => {
    const src = `const metadata = { canonical: ${JSON.stringify(url)} }`
    expect(ensureCanonical(src, url)).toBe(src)
  })
})

describe('fixRobotsTxtDirective', () => {
  const url = 'https://legal.yousafeconsultancy.com/us/secret/'

  it('removes a quoted disallow array entry', () => {
    const src = "const disallow = [\n  '/api/',\n  '/us/secret/',\n  '/_next/',\n]\n"
    const out = fixRobotsTxtDirective(src, url)
    expect(out).not.toContain('/us/secret/')
    expect(out).toContain('/api/')
  })

  it('removes a plain Disallow line', () => {
    const src = 'Disallow: /api/\nDisallow: /us/secret/\n'
    const out = fixRobotsTxtDirective(src, url)
    expect(out).not.toContain('/us/secret')
    expect(out).toContain('Disallow: /api/')
  })

  it('returns unchanged when no matching rule exists', () => {
    const src = "const disallow = ['/api/']\n"
    expect(fixRobotsTxtDirective(src, url)).toBe(src)
  })
})

describe('computeIndexFix', () => {
  const words = 'prose '.repeat(450)

  function page(partial: Partial<SiteHealthPage>): SiteHealthPage {
    return {
      repo: 'caseworks',
      host: 'legal.yousafeconsultancy.com',
      path: 'app/us/student-visas/x/page.tsx',
      url: 'https://legal.yousafeconsultancy.com/us/student-visas/x/',
      title: 'X',
      indexable: true,
      inboundLinks: 0,
      sampleSources: [],
      content: '',
      ...partial,
    }
  }

  function issue(partial: Partial<GscIndexIssue>): GscIndexIssue {
    return {
      url: 'https://legal.yousafeconsultancy.com/us/student-visas/x/',
      indexed: false,
      reasonCode: 'NOINDEX_TAG',
      reason: 'x',
      fixAction: 'REMOVE_NOINDEX',
      autoFix: true,
      fixLabel: 'Remove noindex tag',
      coverageState: null,
      verdict: null,
      indexingState: null,
      pageFetchState: null,
      robotsTxtState: null,
      googleCanonical: null,
      userCanonical: null,
      sitemaps: [],
      referringUrls: [],
      lastCrawlTime: null,
      ...partial,
    }
  }

  it('fixes noindex on a fully expanded page', () => {
    const item: IndexFixItem = {
      issue: issue({}),
      page: page({ content: `export const metadata = { robots: { index: false } }\n\n${words}` }),
    }
    const o = computeIndexFix(item)
    expect(o.status).toBe('fixed')
    expect(o.newContent).toContain('index: true')
  })

  it('recommends expansion for a thin noindex page', () => {
    const item: IndexFixItem = {
      issue: issue({}),
      page: page({ content: `export const metadata = { robots: { index: false } }\n\nshort page` }),
    }
    const o = computeIndexFix(item)
    expect(o.status).toBe('recommended')
  })

  it('adds a canonical for a duplicate-without-canonical page', () => {
    const item: IndexFixItem = {
      issue: issue({ reasonCode: 'DUPLICATE_NO_CANONICAL', fixAction: 'ADD_CANONICAL', fixLabel: 'Add canonical' }),
      page: page({ content: `export default function Page() { return <div/> }` }),
    }
    const o = computeIndexFix(item)
    expect(o.status).toBe('fixed')
    expect(o.newContent).toContain('alternates: { canonical:')
  })

  it('delegates orphan + sitemap reasons to Site Health repair', () => {
    expect(
      computeIndexFix({ issue: issue({ fixAction: 'ADD_INTERNAL_LINK' }), page: page({}) }).status,
    ).toBe('delegated')
    expect(
      computeIndexFix({ issue: issue({ fixAction: 'ADD_SITEMAP' }), page: page({}) }).status,
    ).toBe('delegated')
  })

  it('recommends (not auto-rewrites) route and thin-content reasons', () => {
    expect(
      computeIndexFix({ issue: issue({ fixAction: 'EXPAND_THIN_CONTENT' }), page: page({}) }).status,
    ).toBe('recommended')
    expect(
      computeIndexFix({ issue: issue({ fixAction: 'FIX_ROUTE' }), page: page({}) }).status,
    ).toBe('recommended')
  })
})
