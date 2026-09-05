import { extractProse, fleschReadingEase, fleschTargetForBrief, scoreHarperLints, computeSeoScore, computeEditorMetrics, suggestReadabilityFixes, applyReadabilityFixes, expandMetaToBriefTarget, missingBriefKeywords, injectMissingBriefKeywords, stripNonClientChrome } from '../lib/editorMetrics'

describe('editor metrics', () => {
  it('extracts prose from markdown including frontmatter/headings/lists', () => {
    const md = `---
title: X
---
# Guide

## Section

Plain sentence here. Another one.

- bullet text
| a | b |
`
    const prose = extractProse(md)
    expect(prose).toContain('Plain sentence here')
    expect(prose).toContain('Another one')
    expect(prose).not.toContain('#')
    expect(prose).not.toContain('|')
    expect(prose).not.toContain('---')
    expect(prose).not.toMatch(/\btitle\s*:/)
    expect(prose).not.toMatch(/\bdescription\s*:/)
    expect(prose).not.toContain('Guide')
  })

  it('extractProse drops fenced YAML keys and does not feed them to Flesch', () => {
    const md = `---
title: "PhD Research Proposal Writing Service"
description: "PhD Research Proposal Writing Service for doctoral applicants who need a structured proposal."
content_type: blog_post
primaryKeyword: phd research proposal writing service
region: AU
canonicalUrl: https://example.com/phd
robots: index
ogImage: /og.png
---

# PhD Research Proposal Writing Service

You can hire a researcher to draft a proposal. You still own the argument. Supervisors expect a clear question, method, and timeline.

Write short sentences. Use the same terms your faculty uses.
`
    const prose = extractProse(md)
    expect(prose).toContain('You can hire a researcher')
    expect(prose).toContain('Write short sentences')
    expect(prose).not.toMatch(/\btitle\s*:/i)
    expect(prose).not.toMatch(/\bdescription\s*:/i)
    expect(prose).not.toMatch(/\bcontent_type\s*:/i)
    expect(prose).not.toMatch(/\bprimaryKeyword\s*:/i)
    expect(prose).not.toMatch(/\bcanonicalUrl\s*:/i)
    expect(prose).not.toMatch(/\bogImage\s*:/i)
    expect(prose).not.toContain('blog_post')
    const metrics = computeEditorMetrics(md, [], { contentType: 'blog_post', primaryKeyword: 'phd research proposal writing service' })
    expect(metrics.readability.words).toBeGreaterThan(20)
    expect(prose.toLowerCase()).not.toContain('primarykeyword')
  })

  it('extractProse strips KEEP--- and duplicated unfenced yaml like production job 8cc5d523', () => {
    const md = `KEEP---
description: "PhD Research Proposal Writing Service for doctoral applicants in Australia."
---
KEEP--- title: "PhD Research Proposal Writing Service" content_type: blog_post primaryKeyword: phd research proposal writing service description: "PhD Research Proposal Writing Service for doctoral applicants in Australia." region: AU
canonicalUrl: https://yousafe.au/blog/phd
robots: index,follow
ogImage: /images/phd.png

# PhD Research Proposal Writing Service

A research proposal states the question you will answer. It also states how you will gather evidence. Keep the method honest and the timeline realistic.

You should name the gap in the literature. Then you should explain why that gap matters for practice.
`
    const prose = extractProse(md)
    expect(prose).toContain('A research proposal states the question')
    expect(prose).toContain('You should name the gap')
    expect(prose).not.toMatch(/KEEP---/i)
    expect(prose).not.toMatch(/\btitle\s*:/i)
    expect(prose).not.toMatch(/\bdescription\s*:/i)
    expect(prose).not.toMatch(/\bcontent_type\s*:/i)
    expect(prose).not.toMatch(/\bprimaryKeyword\s*:/i)
    expect(prose).not.toMatch(/\bcanonicalUrl\s*:/i)
    expect(prose).not.toContain('blog_post')
    const bodyOnly = fleschReadingEase(prose)
    const withYaml = fleschReadingEase(
      'description: PhD Research Proposal Writing Service. primaryKeyword: phd research proposal writing service. A research proposal states the question you will answer.',
    )
    const metrics = computeEditorMetrics(md, [], { contentType: 'blog_post' })
    expect(metrics.readability.words).toBe(bodyOnly.words)
    expect(metrics.readability.score).toBe(bodyOnly.score)
    expect(metrics.readability.words).not.toBe(withYaml.words)
  })

  it('scores readability with Flesch', () => {
    const hard = fleschReadingEase('The epistemological consolidation of preparatory juridical discourse necessitates substantial chronological investment.')
    const easy = fleschReadingEase('You can apply online. It takes about ten minutes. You need your passport.')
    expect(hard.score).toBeLessThan(easy.score)
  })

  it('weights harper errors harder than style suggestions', () => {
    const errs = scoreHarperLints([{ kind: 'Spelling' }, { kind: 'Grammar' }, { kind: 'Grammar' }])
    const style = scoreHarperLints([{ kind: 'Style' }, { kind: 'Style' }])
    expect(errs.score).toBeLessThan(style.score)
    expect(errs.errors).toBe(3)
  })

  it('seo score rewards FAQ + keyword in H1 + depth', () => {
    const good = `# Student visa fee increase\n\n## In 60 seconds\n\nIntro sentence about student visa fee increase.\n\n## Costs\n\nText text text about cost and study. [source](https://gov.example/1) more. [other](https://edu.example/2)\n\n## Process\n\nText. \n\n## FAQ\n\n### Do I need a consultant? Yes.\n\n## Sources\n\n- a\n`
    const bad = '# X\n\nTiny.\n'
    const g = computeSeoScore(good, { primaryKeyword: 'student visa fee increase', targetWords: 1200 })
    const b = computeSeoScore(bad, { primaryKeyword: 'student visa fee increase', targetWords: 1200 })
    expect(g.score).toBeGreaterThan(60)
    expect(g.pass.some((p) => p.includes('H1'))).toBe(true)
    expect(b.score).toBeLessThan(40)
  })

  it('meta description uses the ship gate 70–160 and treats 114 as SERP warn not a fail', () => {
    const desc = 'Check the 485 graduate visa streams, English, and skills evidence before you lodge in Australia.'
    expect(desc.length).toBeGreaterThanOrEqual(70)
    expect(desc.length).toBeLessThan(140)
    const md = `---\ntitle: "Graduate visa 485"\ndescription: "${desc}"\n---\n\n# Graduate visa 485\n\nIntro about graduate visa 485.\n`
    const s = computeSeoScore(md, { primaryKeyword: 'graduate visa 485' })
    expect(s.fail.some((f) => /meta/i.test(f))).toBe(false)
    expect(s.warn.some((w) => /ship-ok/.test(w) && /140/.test(w))).toBe(true)
    const apostrophe = `---\ndescription: "You'll need documents, English, and a skills assessment for the 485 graduate visa in Australia."\n---\n\n# T\n\nHi.\n`
    const full = computeSeoScore(apostrophe)
    expect(full.fail.some((f) => /No meta/.test(f))).toBe(false)
    const expanded = expandMetaToBriefTarget(md, { primaryKeyword: 'graduate visa 485' })
    expect(expanded.applied).toBe(true)
    expect(expanded.length).toBeGreaterThanOrEqual(140)
    expect(expanded.length).toBeLessThanOrEqual(160)
  })

  it('brief content type sets the Flesch floor and long sentences get split suggestions', () => {
    expect(fleschTargetForBrief({ contentType: 'blog_post' })).toBe(60)
    expect(fleschTargetForBrief({ contentType: 'legal_guide' })).toBe(50)
    expect(fleschTargetForBrief({ contentType: 'article', audience: 'students hiring an admissions consultant', tone: 'educational' })).toBe(55)
    const long = 'Applicants who want a graduate visa after study in Australia must compare the post-study work stream with the graduate work stream and collect evidence of CRICOS study, English, and a skills assessment before they lodge because processing clocks do not pause for missing documents.'
    const fixes = suggestReadabilityFixes(`# T\n\n${long}\n`, { contentType: 'blog_post', audience: 'graduates' })
    expect(fixes.length).toBeGreaterThan(0)
    expect(fixes[0].suggestion).toMatch(/\.\s+[A-Z]/)
  })

  it('readability auto-fix shortens dense wording when sentences are already short', () => {
    const md = `# T\n\nYou should utilize the portal in order to file. Subsequently you demonstrate status.\n`
    const fixes = suggestReadabilityFixes(md, { contentType: 'blog_post' })
    expect(fixes.some((f) => /utilize|in order to|subsequently|demonstrate/i.test(f.quote))).toBe(true)
    const out = applyReadabilityFixes(md, fixes)
    expect(out.applied).toBeGreaterThan(0)
    expect(out.content).toMatch(/\buse\b/)
    expect(out.content).not.toMatch(/\butilize\b/i)
  })

  it('injects missing brief keywords into the body without making them headings', () => {
    const md = `---
title: Essay editing
description: How F-1 students use an editor before a school file in 2026 cycle now.
---

# Essay editing service

Intro about editors and honour codes.

## What to send
Passport and I-20.

## FAQ
Who can edit? A reviewer the school allows.

## Sources
- a
`
    const hint = {
      primaryKeyword: 'essay editing service',
      requiredShortKeywords: ['essay editing service', 'college essay', 'personal statement'],
      requiredLongTailKeywords: ['f-1 essay editing', 'us college application essay'],
    }
    const missing = missingBriefKeywords(md, hint)
    expect(missing.length).toBeGreaterThan(0)
    const out = injectMissingBriefKeywords(md, hint)
    expect(out.applied).toBeGreaterThan(0)
    expect(out.content).not.toMatch(/^##\s+college essay/m)
    const after = missingBriefKeywords(out.content, hint)
    expect(after.length).toBeLessThan(missing.length)
  })


  it('extractProse and readability Auto-fix ignore JSON-LD / ld+json / schema chrome', () => {
    const md = `---
title: "Graduate visa checklist"
description: "A practical graduate visa checklist for applicants who need clear next steps before they lodge."
content_type: blog_post
ogImage: /images/og-graduate.png
---

# Graduate visa checklist

You should gather your passport and transcripts first. Keep a short list of forms. File only when every field matches the school letter.

## Costs

Fees change. Check the official page before you pay.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "Graduate visa checklist",
  "datePublished": "2026-09-01",
  "dateModified": "2026-09-04",
  "publisher": {
    "@type": "Organization",
    "name": "YouSafe Consultancy",
    "logo": { "@type": "ImageObject", "url": "https://yousafe.au/images/og-graduate.png" }
  },
  "image": "https://yousafe.au/images/og-graduate.png",
  "mainEntity": {
    "@type": "FAQPage",
    "mainEntity": [{ "@type": "Question", "acceptedAnswer": { "@type": "Answer", "text": "Yes." } }]
  }
}
</script>

\`\`\`json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "datePublished": "2026-09-01",
  "publisher": { "name": "YouSafe" }
}
\`\`\`

{
  "@context": "https://schema.org",
  "@type": "WebPage",
  "datePublished": "2026-09-01",
  "publisher": { "name": "YouSafe", "url": "https://yousafe.au" },
  "image": "/images/og-graduate.png"
}

## FAQ

### Do I need every form on day one?

No. Start with identity and study evidence.
`

    const prose = extractProse(md)
    expect(prose).toContain('You should gather your passport')
    expect(prose).toContain('Fees change')
    expect(prose).not.toMatch(/datePublished/i)
    expect(prose).not.toMatch(/acceptedAnswer/i)
    expect(prose).not.toMatch(/@context/i)
    expect(prose).not.toMatch(/schema\.org/i)
    expect(prose).not.toMatch(/og-graduate/i)
    expect(prose).not.toMatch(/BreadcrumbList/i)
    expect(prose).not.toMatch(/application\/ld\+json/i)

    const chrome = stripNonClientChrome(md)
    expect(chrome).toContain('You should gather your passport')
    expect(chrome).not.toMatch(/datePublished/i)
    expect(chrome).not.toMatch(/@context/i)

    const fixes = suggestReadabilityFixes(md, { contentType: 'blog_post', audience: 'graduates' })
    expect(fixes.every((f) => !/datePublished|publisher|acceptedAnswer|@context|og-graduate|schema\.org/i.test(f.quote))).toBe(true)
    expect(fixes.every((f) => !/datePublished|publisher|acceptedAnswer|@context/i.test(f.suggestion))).toBe(true)

    const metrics = computeEditorMetrics(md, [], { contentType: 'blog_post', primaryKeyword: 'graduate visa checklist' })
    const bodyOnly = fleschReadingEase(extractProse(`# Graduate visa checklist

You should gather your passport and transcripts first. Keep a short list of forms. File only when every field matches the school letter.

## Costs

Fees change. Check the official page before you pay.

## FAQ

### Do I need every form on day one?

No. Start with identity and study evidence.
`))
    // Word count must track real prose, not schema keys padded into "sentences".
    expect(metrics.readability.words).toBe(bodyOnly.words)
    expect(metrics.readability.words).toBeLessThan(120)
    expect(metrics.readability.score).toBe(bodyOnly.score)
  })

  it('extractProse drops unclosed script JSON-LD tails', () => {
    const md = `# Title

Real guidance for applicants who need a clear next step.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "datePublished": "2026-01-01",
  "publisher": { "name": "YouSafe" },
  "image": "og-image.png"
`
    const prose = extractProse(md)
    expect(prose).toContain('Real guidance for applicants')
    expect(prose).not.toMatch(/datePublished/i)
    expect(prose).not.toMatch(/publisher/i)
    expect(prose).not.toMatch(/og-image/i)
  })

  it('computeEditorMetrics aggregates all three', () => {
    const m = computeEditorMetrics('# T\n\nHello there. This is a fine article.', [], { primaryKeyword: 'fine article' })
    expect(typeof m.grammar.score).toBe('number')
    expect(typeof m.readability.target).toBe('number')
    expect(typeof m.readability.score).toBe('number')
    expect(typeof m.seo.score).toBe('number')
  })
})

import { ensureMinimumOutline } from '../lib/seoEngine/researchDemand'

describe('ensureMinimumOutline', () => {
  it('completes a sparse skeleton with structural + example sections', () => {
    const given = ['Eligibility and requirements', 'Application process']
    const out = ensureMinimumOutline(given)
    expect(out).toContain('In 60 seconds')
    expect(out).toContain('Worked Example')
    expect(out).toContain('FAQ')
    expect(out).toContain('Sources')
    expect(out[0]).toBe('In 60 seconds')
  })

  it('is idempotent and never duplicates existing structural sections', () => {
    const full = ['In 60 seconds', 'Process', 'Worked Example', 'FAQ', 'Sources']
    const out = ensureMinimumOutline(full)
    expect(out.filter((h) => h.toLowerCase() === 'faq').length).toBe(1)
    expect(out.filter((h) => h.toLowerCase() === 'sources').length).toBe(1)
    expect(out.length).toBe(5)
  })

  it('caps at 12 and normalizes H2: prefixes', () => {
    const many = Array.from({ length: 14 }, (_, i) => `Section number ${i}`)
    const out = ensureMinimumOutline(many)
    expect(out.length).toBeLessThanOrEqual(12)
    const prefixed = ensureMinimumOutline(['H2: Costs'])
    expect(prefixed).toContain('Costs')
    expect(prefixed).not.toContain('H2: Costs')
  })
})
