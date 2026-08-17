import {
  AHREFS_META_MAX,
  AHREFS_TITLE_MAX,
  AHREFS_TITLE_MIN,
  applyAhrefsDraftRepairs,
  clampTitleToAhrefs,
  evaluateAhrefsDraft,
} from '@/lib/seoFactory/ahrefsIssues'
import { evaluateContentQuality } from '@/lib/seoFactory/contentQualityGate'
import { normalizeAhrefsPayload } from '@/lib/seoEngine/ahrefsAudit'

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
    expect(snap.totalOpen).toBe(11007)
    expect(snap.issues.find((i) => i.issueId === 'title_too_short')?.csCanIntroduce).toBe(true)
    expect(snap.issues.find((i) => i.issueId === 'page_has_redirected_js')?.csCanIntroduce).toBe(false)
  })
})
