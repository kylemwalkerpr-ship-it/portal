import {
  AHREFS_META_MAX,
  AHREFS_TITLE_MAX,
  AHREFS_TITLE_MIN,
  applyAhrefsDraftRepairs,
  clampTitleToAhrefs,
  evaluateAhrefsDraft,
  resolveAhrefsIssueId,
  sanitizeEstateUrl,
  urlHasDoubleSlash,
  isEstateCanonicalUrl,
} from '@/lib/seoFactory/ahrefsIssues'
import { evaluateContentQuality } from '@/lib/seoFactory/contentQualityGate'
import { fallbackLegalAhrefsSnapshot, normalizeAhrefsPayload } from '@/lib/seoEngine/ahrefsAudit'
import { computeSignals } from '@/lib/seoFactory/masterEngine'

const LONG_PAD = Array.from({ length: 200 }, (_, i) => `Point${i} covers a practical step against the official source.`).join(' ')

describe('Ahrefs draft contract', () => {
  it('clamps titles into the 30–60 Ahrefs band', () => {
    expect(clampTitleToAhrefs('Short').length).toBeGreaterThanOrEqual(AHREFS_TITLE_MIN)
    expect(clampTitleToAhrefs('Short').length).toBeLessThanOrEqual(AHREFS_TITLE_MAX)
    const long = 'UK Graduate Route visa requirements eligibility costs documents and how to apply in 2026 for international students'
    expect(clampTitleToAhrefs(long).length).toBeLessThanOrEqual(AHREFS_TITLE_MAX)
    expect(clampTitleToAhrefs('Student visa documents checklist 2026').length).toBeGreaterThanOrEqual(30)
  })

  it('flags a short title and missing H1 as CS-introduced blockers', () => {
    const findings = evaluateAhrefsDraft(`---
title: Visa
description: ${'A practical guide to student visas with official sources and next steps for applicants who need a checklist.'.slice(0, 90)}
---

No heading here.
`)
    expect(findings.some((f) => f.code === 'ahrefs_title_too_short' && f.severity === 'blocker')).toBe(true)
    expect(findings.some((f) => f.code === 'ahrefs_h1_missing')).toBe(true)
  })

  it('repairs title, meta, H1, canonical and noindex', () => {
    const { content, applied } = applyAhrefsDraftRepairs(`---
title: Hi
description: Too short
robots: noindex,follow
---

# One
# Two
Body.
`, { primaryKeyword: 'uk graduate visa', targetUrl: 'https://legal.yousafeconsultancy.com/uk/graduate-route/' })
    expect(applied.length).toBeGreaterThan(2)
    const after = evaluateAhrefsDraft(content, { targetUrl: 'https://legal.yousafeconsultancy.com/uk/graduate-route/' })
    expect(after.filter((f) => f.severity === 'blocker')).toHaveLength(0)
    expect(content).toMatch(/canonicalUrl/)
    expect(content).not.toMatch(/noindex/)
    expect((content.match(/^# /gm) || []).length).toBe(1)
  })

  it('quality gate blocks an indexable draft that would create Ahrefs title flags', () => {
    const r = evaluateContentQuality({
      content: `---
title: Hi
description: A practical checklist of student visa documents, timelines, and risks with official sources for applicants.
---

# Hi

${LONG_PAD}
`,
      contentType: 'legal_guide',
      primaryKeyword: 'student visa documents',
      indexable: true,
    })
    expect(r.ok).toBe(false)
    expect(r.blockers.some((b) => b.code === 'ahrefs_title_too_short')).toBe(true)
  })
})

describe('Ahrefs payload normalize', () => {
  it('counts CS-introduced open issues separately', () => {
    const snap = normalizeAhrefsPayload({
      health_score: 82,
      issues: [
        { issue_id: 'title_too_short', count: 4, count_compared: 1 },
        { issue_id: 'page_has_redirected_js', count: 11000, count_compared: 11000 },
        { issue_id: 'orphan_page', count: 3, count_compared: 5 },
      ],
    }, { projectId: '9902912', date: '2026-08-17T11:00:20Z', dateCompared: '2026-08-10T11:20:07Z' })
    expect(snap.healthScore).toBe(82)
    expect(snap.csOpen).toBe(7)
    expect(snap.csOpenTypes).toBe(2)
    expect(snap.totalOpen).toBe(11007)
    expect(snap.issues.find((i) => i.issueId === 'title_too_short')?.csCanIntroduce).toBe(true)
    expect(snap.issues.find((i) => i.issueId === 'page_has_redirected_js')?.csCanIntroduce).toBe(false)
  })

  it('maps Ahrefs UI labels from the 2026-08-17 legal crawl', () => {
    expect(resolveAhrefsIssueId('Open Graph tags incomplete')).toBe('open_graph_tags_incomplete')
    expect(resolveAhrefsIssueId('Structured data has schema.org validation error')).toBe(
      'structured_data_has_schema_org_validation_error',
    )
    expect(resolveAhrefsIssueId('Double slash in URL')).toBe('double_slash_in_url')
    const snap = fallbackLegalAhrefsSnapshot()
    expect(snap.projectId).toBe('9902912')
    expect(snap.date).toBe('2026-08-17T11:00:20Z')
    expect(snap.issues.find((i) => i.issueId === 'orphan_page')?.count).toBe(205)
    expect(snap.issues.find((i) => i.issueId === 'open_graph_tags_incomplete')?.count).toBe(49)
    expect(snap.issues.find((i) => i.issueId === 'structured_data_has_schema_org_validation_error')?.count).toBe(112)
    expect(snap.issues.find((i) => i.issueId === 'pages_to_submit_to_indexnow')?.count).toBe(347)
    expect(snap.issues.find((i) => i.issueId === 'open_graph_tags_incomplete')?.csCanIntroduce).toBe(true)
    expect(snap.source).toBe('fallback')
    expect(snap.csOpen).toBeGreaterThan(200)
  })

  it('feeds the 2026-08-17 crawl into Master Engine Ahrefs slots', () => {
    const snap = fallbackLegalAhrefsSnapshot()
    const count = (id: string) => snap.issues.find((i) => i.issueId === id)?.count ?? null
    const v = computeSignals({
      topic: 'uk graduate visa',
      primaryKeyword: 'uk graduate visa',
      ahrefs: {
        healthScore: snap.healthScore,
        csOpen: snap.csOpen,
        csOpenTypes: snap.csOpenTypes,
        totalOpen: snap.totalOpen,
        ogIncomplete: count('open_graph_tags_incomplete'),
        schemaErrors: count('structured_data_has_schema_org_validation_error'),
        orphans: count('orphan_page'),
        broken4xx: count('4xx_page'),
        indexNowBacklog: count('pages_to_submit_to_indexnow'),
      },
    })
    expect(v.t_ahrefs_cs_open).not.toBeNull()
    expect(v.t_ahrefs_og).toBeLessThan(1)
    expect(v.t_ahrefs_schema).toBeLessThan(1)
    expect(v.t_ahrefs_orphan).toBe(0)
  })
})


describe('Ahrefs estate canonical guard', () => {
  it('exports isEstateCanonicalUrl for YouSafe hosts only', () => {
    expect(isEstateCanonicalUrl('https://ca.yousafeconsultancy.com/express-entry/')).toBe(true)
    expect(isEstateCanonicalUrl('https://legal.yousafeconsultancy.com/ca/foo/')).toBe(true)
    expect(isEstateCanonicalUrl('https://www.alberta.ca/iqas.aspx/')).toBe(false)
    expect(isEstateCanonicalUrl('https://www.canada.ca/en/immigration-refugees-citizenship.html')).toBe(false)
  })

  it('overwrites model-invented alberta IQAS canonical with owner targetUrl', () => {
    const target = 'https://ca.yousafeconsultancy.com/canada-express-entry-crs-international-student-graduates/'
    const { content, applied } = applyAhrefsDraftRepairs(`---
title: Canada Express Entry CRS for Graduates: 2026 Guide
description: Learn canada express entry crs international student graduates steps, CRS factors, and documents for applicants.
canonicalUrl: https://www.alberta.ca/iqas.aspx/
ogImage: https://www.alberta.ca/iqas.aspx
robots: index,follow
---

# Canada Express Entry CRS for Graduates: 2026 Guide

Body about Express Entry CRS for international student graduates.
`, { primaryKeyword: 'canada express entry crs international student graduates', targetUrl: target })
    expect(applied).toEqual(expect.arrayContaining(['ahrefs_canonical_estate', 'ahrefs_og_image']))
    expect(content).toContain(`canonicalUrl: ${target}`)
    expect(content).not.toMatch(/alberta\.ca/)
    expect(content).toMatch(/ogImage:\s*\/og-image\.png/)
    const findings = evaluateAhrefsDraft(content, { targetUrl: target })
    expect(findings.some((f) => f.code === 'ahrefs_canonical_off_estate')).toBe(false)
    expect(findings.filter((f) => f.severity === 'blocker')).toHaveLength(0)
  })

  it('flags off-estate canonical as a blocker before repair', () => {
    const findings = evaluateAhrefsDraft(`---
title: Canada Express Entry CRS for Graduates: 2026 Guide
description: Learn canada express entry crs international student graduates steps, CRS factors, and documents for applicants.
canonicalUrl: https://www.alberta.ca/iqas.aspx/
ogImage: /og-image.png
---

# Canada Express Entry CRS for Graduates: 2026 Guide

Body.
`)
    expect(findings.some((f) => f.code === 'ahrefs_canonical_off_estate' && f.severity === 'blocker')).toBe(true)
  })
})

describe('Ahrefs OG / schema / double-slash contract', () => {
  it('sanitizes double-slash estate URLs', () => {
    expect(urlHasDoubleSlash('https://legal.yousafeconsultancy.com//uk/foo/')).toBe(true)
    expect(sanitizeEstateUrl('https://legal.yousafeconsultancy.com//uk/foo/')).toBe(
      'https://legal.yousafeconsultancy.com/uk/foo/',
    )
    expect(urlHasDoubleSlash('https://legal.yousafeconsultancy.com/uk/foo/')).toBe(false)
  })

  it('flags incomplete OG, invalid Article JSON-LD, and double-slash URLs', () => {
    const findings = evaluateAhrefsDraft(`---
title: UK Graduate Route visa requirements 2026
description: ${'A practical guide to the UK Graduate Route with official sources and next steps for applicants.'.slice(0, 90)}
canonicalUrl: https://legal.yousafeconsultancy.com//uk/graduate-route/
---

# UK Graduate Route visa requirements 2026

<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Article","headline":"UK Graduate Route visa requirements 2026","datePublished":"2026-08-17","author":{"@type":"Person","name":"Ed","affiliation":"MyCaseworks"}}
</script>

See [hub](https://legal.yousafeconsultancy.com//uk/).
`)
    expect(findings.some((f) => f.code === 'ahrefs_og_incomplete')).toBe(true)
    expect(findings.some((f) => f.code === 'ahrefs_double_slash' && f.severity === 'blocker')).toBe(true)
    expect(findings.some((f) => f.code === 'ahrefs_schema_invalid')).toBe(true)
  })

  it('repairs OG image, schema image, and double-slash hrefs', () => {
    const { content, applied } = applyAhrefsDraftRepairs(`---
title: UK Graduate Route visa requirements 2026
description: ${'A practical guide to the UK Graduate Route with official sources and next steps for applicants.'.slice(0, 90)}
canonicalUrl: https://legal.yousafeconsultancy.com//uk/graduate-route/
---

# UK Graduate Route visa requirements 2026

<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Article","headline":"UK Graduate Route visa requirements 2026","datePublished":"2026-08-17","author":{"@type":"Organization","name":"MyCaseworks"}}
</script>
`, { primaryKeyword: 'uk graduate visa', targetUrl: 'https://legal.yousafeconsultancy.com//uk/graduate-route/' })
    expect(applied).toEqual(expect.arrayContaining(['ahrefs_og_image', 'ahrefs_schema', 'ahrefs_double_slash']))
    expect(content).toMatch(/ogImage:\s*\/og-image\.png/)
    expect(content).toContain('https://legal.yousafeconsultancy.com/uk/graduate-route/')
    expect(content).not.toContain('yousafeconsultancy.com//')
    expect(content).toContain('"image"')
    const after = evaluateAhrefsDraft(content, { targetUrl: 'https://legal.yousafeconsultancy.com/uk/graduate-route/' })
    expect(after.filter((f) => f.severity === 'blocker')).toHaveLength(0)
    expect(after.some((f) => f.code === 'ahrefs_og_incomplete')).toBe(false)
    expect(after.some((f) => f.code === 'ahrefs_schema_invalid')).toBe(false)
  })
})
