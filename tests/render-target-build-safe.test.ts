/**
 * Rendered SEO Factory pages must always be build-safe for caseworks /
 * consultancy — independent of which AI wrote the draft.
 */
import { renderTargetFile } from '@/lib/seoFactory/renderTarget'
import { validateRenderedPayload } from '@/lib/seoFactory/shipGate'
import type { OwnerPlan } from '@/lib/seoFactory/ownership'

function plan(partial: Partial<OwnerPlan> & Pick<OwnerPlan, 'host' | 'repo' | 'filePath' | 'canonicalUrl'>): OwnerPlan {
  return {
    matched: null,
    matchScore: 0,
    indexable: true,
    action: 'build',
    intentClass: 'procedural',
    contentType: 'legal_guide',
    warnings: [],
    blockers: [],
    ymy: partial.host === 'legal',
    routingSource: 'standing_rules',
    ...partial,
  }
}

const messyAiMarkdown = `---
title: OPT 90-day unemployment cap
description: ${'x'.repeat(140)}
---

# OPT 90-day unemployment cap

## What it is
F-1 OPT has a **90-day** unemployment maximum. Cite [USCIS](https://www.uscis.gov).

\`\`\`json
{"@type":"FAQPage"}
\`\`\`

<script type="application/ld+json">{"@type":"Article"}</script>

## Steps
1. Track days carefully
2. File extensions on time

## Documents
- I-20
- EAD card

## FAQ
Common questions follow.

Not legal advice — consult an attorney for your case.
`

describe('renderTargetFile build-safety', () => {
  it('emits a caseworks page that passes ship-gate + CTAPanel contract', () => {
    const p = plan({
      host: 'legal',
      repo: 'caseworks',
      filePath: 'app/us/student-visas/opt-90-day-unemployment-cap/page.tsx',
      canonicalUrl: 'https://legal.yousafeconsultancy.com/us/student-visas/opt-90-day-unemployment-cap/',
      contentType: 'legal_guide',
    })
    const { filePath, fileContent } = renderTargetFile({
      plan: p,
      content: messyAiMarkdown,
      title: 'OPT 90-day unemployment cap',
      region: 'US',
      contentType: 'legal_guide',
      primaryKeyword: 'opt 90 day unemployment',
      indexable: true,
      canonicalUrl: p.canonicalUrl,
    })
    expect(filePath).toContain('page.tsx')
    expect(fileContent).toContain('from "@/components/article/CTAPanel"')
    expect(fileContent).toMatch(/href=\{?"?\/intake/)
    expect(fileContent).toContain('headline=')
    expect(fileContent).not.toMatch(/```/)
    expect(fileContent).not.toMatch(/href=\{undefined\}/)
    expect(fileContent).not.toMatch(/<script/i)
    expect(fileContent).toMatch(/images:\s*\[\s*\{\s*url:\s*"\/og-image\.png"/)
    expect(fileContent).toContain('card: "summary_large_image"')
    expect(fileContent).toContain('images: ["/og-image.png"]')
    // caseworks article-quality: no SEO Factory kicker, non-empty related/sources,
    // and no mirrored OG/Twitter title+description (Next.js derives those).
    expect(fileContent).not.toMatch(/kicker:\s*"SEO Factory"/)
    expect(fileContent).toMatch(/kicker:\s*"[^"]+"/)
    expect(fileContent).not.toMatch(/const related[^=]*=\s*\[\s*\]/)
    expect(fileContent).toMatch(/const related: RelatedRef\[\] = \[\{ slug:/)
    expect(fileContent).toMatch(/const sources: SourceRef\[\] = \[\{ title:/)
    const ogBlock = fileContent.match(/openGraph:\s*\{([\s\S]*?)\},\s*\n\s*twitter:/)?.[1] || ''
    expect(ogBlock).not.toMatch(/(?:^|\n)\s*title:/)
    expect(ogBlock).not.toMatch(/(?:^|\n)\s*description:/)
    const twBlock = fileContent.match(/twitter:\s*\{([\s\S]*?)\},/)?.[1] || ''
    expect(twBlock).not.toMatch(/(?:^|\n)\s*title:/)
    expect(twBlock).not.toMatch(/(?:^|\n)\s*description:/)

    const gate = validateRenderedPayload({
      plan: p,
      filePath,
      fileContent,
      contentType: 'legal_guide',
    })
    expect(gate.ok).toBe(true)
    expect(gate.errors).toEqual([])
  })

  it('emits regional markdown with front matter for consultancy deploys', () => {
    const p = plan({
      host: 'usa',
      repo: 'yousafe-consultancy',
      filePath: 'usa/content/universities/yale-international-students.md',
      canonicalUrl: 'https://usa.yousafeconsultancy.com/universities/yale-international-students/',
      contentType: 'regional_university',
      intentClass: 'university_modifier',
    })
    const { fileContent } = renderTargetFile({
      plan: p,
      content: messyAiMarkdown + '\n\n' + 'word '.repeat(600),
      title: 'Yale international students',
      region: 'US',
      contentType: 'regional_university',
      primaryKeyword: 'yale university international students',
      indexable: true,
      canonicalUrl: p.canonicalUrl,
    })
    expect(fileContent.startsWith('---')).toBe(true)
    expect(fileContent).toMatch(/ownerHost:\s*"?usa"?/)
    expect(fileContent).toMatch(/canonical:/)
    const gate = validateRenderedPayload({
      plan: p,
      filePath: p.filePath,
      fileContent,
      contentType: 'regional_university',
    })
    expect(gate.ok).toBe(true)
  })

  it('supports AU country on caseworks pages', () => {
    const p = plan({
      host: 'legal',
      repo: 'caseworks',
      filePath: 'app/au/english-language-requirements-student-485/page.tsx',
      canonicalUrl: 'https://legal.yousafeconsultancy.com/au/english-language-requirements-student-485/',
    })
    const { fileContent } = renderTargetFile({
      plan: p,
      content: messyAiMarkdown,
      title: '485 English requirements',
      region: 'AU',
      contentType: 'legal_guide',
      primaryKeyword: '485 visa english requirements',
      indexable: true,
      canonicalUrl: p.canonicalUrl,
    })
    expect(fileContent).toMatch(/country:\s*"au"/)
    expect(fileContent).toContain('/intake?country=au')
    expect(fileContent).not.toMatch(/kicker:\s*"SEO Factory"/)
    expect(fileContent).toMatch(/const related: RelatedRef\[\] = \[\{ slug:/)
  })

  it('renders US Form I-485 pages without SEO Factory kicker / empty related / mirrored OG', () => {
    const p = plan({
      host: 'legal',
      repo: 'caseworks',
      filePath: 'app/us/i-485-adjustment-of-status-document-checklist/page.tsx',
      canonicalUrl: 'https://legal.yousafeconsultancy.com/us/i-485-adjustment-of-status-document-checklist/',
      contentType: 'legal_guide',
    })
    const { fileContent } = renderTargetFile({
      plan: p,
      content: messyAiMarkdown,
      title: 'I-485 Adjustment of Status Document Checklist (2026)',
      region: 'US',
      contentType: 'legal_guide',
      primaryKeyword: 'I-485 adjustment of status document checklist',
      indexable: true,
      canonicalUrl: p.canonicalUrl,
    })
    expect(fileContent).toMatch(/country:\s*"us"/)
    expect(fileContent).not.toMatch(/kicker:\s*"SEO Factory"/)
    expect(fileContent).toMatch(/const related: RelatedRef\[\] = \[\{ slug:/)
    expect(fileContent).toMatch(/const sources: SourceRef\[\] = \[\{ title:/)
    const ogBlock = fileContent.match(/openGraph:\s*\{([\s\S]*?)\},\s*\n\s*twitter:/)?.[1] || ''
    expect(ogBlock).not.toMatch(/(?:^|\n)\s*title:/)
    expect(ogBlock).not.toMatch(/(?:^|\n)\s*description:/)
  })
})
