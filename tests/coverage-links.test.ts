import { extractMarkdownUrls, scoreClusterCoverage, suggestInternalLinks } from '@/lib/seoFactory/coverageLinks'

describe('coverage + internal links (Phase 5)', () => {
  it('scores coverage from presence, headings, questions, and links — not stuffing', () => {
    const md = `## Requirements\n\nCanada study permit documents. See [IRCC](https://legal.yousafeconsultancy.com/ca/study-permit/).\n\n## FAQ\n\nHow long does a study permit take?\n`
    const s = scoreClusterCoverage({
      title: 'Canada Study Permit',
      bodyText: md,
      clusterKeywords: ['canada study permit', 'study permit documents', 'canada study permit fees'],
      updatedAt: new Date().toISOString(),
    })
    expect(s.keywordVariants).toBeGreaterThan(0)
    expect(s.keywordVariants).toBeLessThanOrEqual(100)
    expect(s.questions).toBeGreaterThanOrEqual(60)
    expect(s.reasons.some((r) => /variants present/i.test(r))).toBe(true)
    expect(s.score).toBeGreaterThan(20)
  })

  it('excludes the current URL and URLs already linked in the draft', () => {
    const body = `See the [fees guide](https://legal.yousafeconsultancy.com/ca/study-permit-fees/).`
    expect(extractMarkdownUrls(body)).toContain('https://legal.yousafeconsultancy.com/ca/study-permit-fees')
    const suggestions = suggestInternalLinks({
      currentUrl: 'https://legal.yousafeconsultancy.com/ca/study-permit/',
      currentTitle: 'Canada Study Permit',
      currentBody: `Canada study permit IRCC. ${body}`,
      corpus: [
        { url: 'https://legal.yousafeconsultancy.com/ca/study-permit/', title: 'Canada Study Permit', bodyText: 'self' },
        { url: 'https://legal.yousafeconsultancy.com/ca/study-permit-fees/', title: 'Study Permit Fees', primaryKeyword: 'study permit fees', bodyText: 'Canada study permit fees IRCC' },
        { url: 'https://legal.yousafeconsultancy.com/ca/pgwp/', title: 'PGWP Eligibility Guide', primaryKeyword: 'post-graduation work permit', bodyText: 'Canada study permit then PGWP IRCC' },
        { url: 'not-a-url', title: 'Broken' },
      ],
    })
    const urls = suggestions.map((s) => s.targetUrl)
    expect(urls.some((u) => /study-permit\/?$/.test(u) && !/fees/.test(u))).toBe(false)
    expect(urls.some((u) => u.includes('study-permit-fees'))).toBe(false)
    expect(urls.some((u) => u.includes('pgwp'))).toBe(true)
    expect(suggestions.every((s) => /^https?:\/\//.test(s.targetUrl))).toBe(true)
    expect(suggestions[0].reason.length).toBeGreaterThan(8)
    expect(suggestions[0].suggestedAnchor.length).toBeGreaterThan(2)
  })
})
