import { applyDeterministicRepairs, ensureEditorialScaffold, smoothSentenceRhythm } from '@/lib/seoFactory/editorialScaffold'
import { countBodyWords } from '@/lib/seoFactory/contentDepth'
import { evaluateContentQuality } from '@/lib/seoFactory/contentQualityGate'
import { auditContent } from '@/lib/seoFactory/audit'
import { meetsShipQuality } from '@/lib/seoFactory/audit'

describe('ensureEditorialScaffold', () => {
  it('adds FM, disclaimer, and AU official sources so audit can pass depth+quality', () => {
    const body = [
      '# 485 English requirements',
      '',
      '## Eligibility',
      'You need competent English for the Temporary Graduate visa pathway.',
      '',
      '## Documents',
      '- Passport',
      '- PTE or IELTS results',
      '',
      '## Steps',
      '1. Book a test',
      '2. Lodge after you meet the score',
      '',
      '## FAQ',
      '### What score do I need?',
      'Check the current Home Affairs table for your stream.',
      '',
      '### Can I use PTE?',
      'Yes when the instrument lists PTE Academic.',
    ].join('\n')

    // Varied padding (avoid sentence_start_repetition quality blocker)
    const variants = [
      'Book your English test early so scores remain valid at lodgement.',
      'Compare the instrument list for PTE Academic against your stream.',
      'Keep passport biometrics consistent across every form and statement.',
      'If scores fall short, plan a retest before you request a new COE.',
      'Save PDF confirmation emails from the test centre with your file.',
    ]
    let padded = body + '\n\n'
    for (let i = 0; i < 400; i++) {
      padded += variants[i % variants.length] + ' '
      if (i % 5 === 4) padded += '\n\n'
    }
    const out = ensureEditorialScaffold({
      content: padded,
      title: '485 visa English requirements',
      primaryKeyword: '485 visa english requirements',
      region: 'AU',
    })
    expect(out.startsWith('---')).toBe(true)
    expect(out).toMatch(/homeaffairs\.gov|immi\.homeaffairs/i)
    expect(out).toMatch(/not legal advice/i)
    expect(out).toMatch(/title:/)
    expect(out).toMatch(/In 60 seconds/i)

    const audit = auditContent({
      content: out,
      contentType: 'legal_guide',
      primaryKeyword: '485 visa english requirements',
      indexable: true,
    })
    expect(audit.wordCount).toBeGreaterThanOrEqual(1800)
    // Scaffold should clear citation + disclaimer blockers
    expect(audit.blockers.some((b) => b.code === 'citations')).toBe(false)
    expect(audit.blockers.some((b) => b.code === 'disclaimer')).toBe(false)
    expect(audit.blockers.some((b) => b.code === 'missing_tldr')).toBe(false)
  })

  it('preserves model-emitted Article/FAQPage JSON-LD so the audit credits schema', () => {
    const body = [
      '# 189 visa guide',
      '',
      '## In 60 seconds',
      '- The 189 is a points-tested skilled visa for Australia.',
      '- No employer sponsorship is required.',
      '- Your occupation must be on the skilled list.',
      '',
      '## Eligibility',
      'You must score at least 65 points on the skilled migration points test.',
      'Applicants must be under 45 and have a valid skills assessment.',
      '',
      '## Documents',
      '- Passport',
      '- Skills assessment',
      '- English test results',
      '',
      '## Process',
      'Submit an EOI through SkillSelect, then await an invitation to apply.',
      'After the invitation, lodge the visa application and upload documents.',
      '',
      '## FAQ',
      '- **Can I include family?** Yes, dependent family members can be included.',
      '- **How long does it take?** Processing times vary by month and occupation.',
    ].join('\n')
    const jsonLd = `<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Article","headline":"189 visa guide"}
</script>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[]}
</script>`
    const withScript = body + '\n\n' + jsonLd + '\n\n<script>console.log("tracking")</script>'
    const out = ensureEditorialScaffold({
      content: withScript,
      title: '189 visa guide',
      primaryKeyword: '189 visa guide',
      region: 'AU',
    })
    // ld+json schema survives the scaffold; tracking scripts are stripped
    expect(out).toMatch(/application\/ld\+json/)
    expect(out).toMatch(/"@type":"Article"/)
    expect(out).toMatch(/"@type":"FAQPage"/)
    expect(out).not.toMatch(/console\.log/)

    const audit = auditContent({
      content: out,
      contentType: 'legal_guide',
      primaryKeyword: '189 visa guide',
      indexable: true,
    })
    // Schema checks now credit the preserved JSON-LD instead of always missing
    expect(audit.warnings.some((w) => w.code === 'schema_article')).toBe(false)
    expect(audit.warnings.some((w) => w.code === 'schema_faq')).toBe(false)
  })

  it('strips non-schema scripts but keeps the body otherwise intact', () => {
    const body = '# 485 visa guide\n\n## Eligibility\n\nYou need competent English for the 485 pathway.'
    const messy = body + '\n\n<script async src="https://example.com/tracker.js"></script>\n<script type="application/ld+json">{"@type":"Article"}</script>'
    const out = ensureEditorialScaffold({
      content: messy,
      title: '485 visa guide',
      primaryKeyword: '485 visa guide',
      region: 'AU',
    })
    expect(out).not.toMatch(/tracker\.js/)
    expect(out).toMatch(/application\/ld\+json/)
  })
})

describe('applyDeterministicRepairs — broken script tag / body swallowing regression', () => {
  it('never lets schema replacement swallow the body (2026-08-28: 2476 → 601 words live)', () => {
    // Shape that triggered the live bug: a FAQPage JSON-LD block at the TOP,
    // the Article JSON-LD at the END behind a BROKEN <script open tag (no `>`).
    // The old ensureValidArticleJsonLd replace regex ran from the FIRST
    // <script to the FIRST "Article" type anywhere after it — across the
    // </script> boundary and the entire article body.
    const sentences = Array.from({ length: 40 }, (_, i) =>
      `Step ${i + 1} requires evidence ${i + 1} checked against the official government source before you rely on it.`,
    ).join(' ')
    const docSentences = Array.from({ length: 40 }, (_, i) =>
      `Document ${i + 1} must be certified ${i + 1} and attached before the department issues a decision.`,
    ).join(' ')
    const draft = [
      '---',
      'title: Australia Student Visa Restrictions: 2026 Guide',
      'description: Understand the restrictions for 2026.',
      'region: AU',
      '---',
      '',
      '<script type="application/ld+json">',
      '{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"Q1?","acceptedAnswer":{"@type":"Answer","text":"A1."}}]}',
      '</script>',
      '',
      '# Australia Student Visa Restrictions: 2026 Guide',
      '',
      '## In 60 seconds',
      '- Check the work-hour cap before you plan any shifts.',
      '- Keep enrolment and OSHC active for the whole visa period.',
      '',
      '## Work limits while studying',
      sentences,
      '',
      '## Documents you must prepare',
      docSentences,
      '',
      '## FAQ',
      '',
      '### What is the visa?',
      'It is the permit that lets you study, and the conditions attach from day one of your grant.',
      '',
      '<script type="application/',
      '',
      '<script type="application/ld+json">',
      '{"@context":"https://schema.org","@type":"Article","headline":"X","image":["a.png"],"datePublished":"2026-01-01","author":{"@type":"Organization","name":"Y"}}',
      '</script>',
    ].join('\n')
    const { content, applied } = applyDeterministicRepairs({
      content: draft,
      title: 'Australia Student Visa Restrictions: 2026 Guide',
      primaryKeyword: 'australia student visa restrictions',
      region: 'AU',
      indexable: true,
      contentType: 'article',
    })
    // The whole body must survive the repair chain.
    expect(countBodyWords(content)).toBeGreaterThan(800)
    expect(applied).toContain('broken_script_tag_removed')
    // A valid Article block is still present and the body headings intact.
    expect(content).toContain('"@type": "Article"')
    expect(content).toContain('## Work limits while studying')
    expect(content).toContain('## Documents you must prepare')
    // The description must be prose — never a scraped script block.
    const descLine = content.match(/^description:\s*(.+)$/m)?.[1] || ''
    expect(descLine).not.toContain('<script')
  })
})

describe('applyDeterministicRepairs — warning micro-fixes', () => {
  it('injects description: into a draft with NO front matter at all', () => {
    // 2026-08-12 regression: a draft without YAML front matter never received
    // a description field, so META_DESCRIPTION could never clear. The repair
    // must now CREATE minimal front matter (title + content_type + region +
    // description) instead of silently skipping.
    const draft = [
      '# UK Dependent Visa Guide',
      '',
      'This guide covers eligibility and documents.',
      '',
      '## Eligibility',
      'Content here. '.repeat(30),
      '',
      '## Documents',
      'More content. '.repeat(30),
    ].join('\n')
    const { content, applied } = applyDeterministicRepairs({
      content: draft,
      title: 'UK Dependent Visa Guide',
      primaryKeyword: 'uk dependent visa',
      region: 'UK',
      indexable: true,
      contentType: 'article',
    })
    expect(applied).toContain('meta_description')
    expect(content).toMatch(/^---\ntitle: /)
    expect(content).toMatch(/^description: /m)
    expect(content).toContain('region: UK')
  })

  it('never eats sentences for natural collocation repeats (trigram dedup regression)', () => {
    // 2026-08-28 regression: the old trigram rule removed every sentence that
    // contained a 3-word phrase seen 4× in a paragraph. Natural collocations
    // ("department of home affairs") cross that threshold in ordinary prose
    // and a live 1328-word draft collapsed to 214 words.
    const sentences = Array.from({ length: 30 }, (_, i) =>
      `Requirement ${i + 1} is checked by the department of home affairs against evidence ${i + 1} you provide.`,
    ).join(' ')
    const draft = [
      '# Student Visa Guide',
      '',
      'This guide explains the visa conditions you must follow while studying in Australia.',
      '',
      '## Conditions while studying',
      sentences,
      '',
      '## Documents',
      'Passport, CoE, and OSHC certificates. '.repeat(10),
    ].join('\n')
    const { content } = applyDeterministicRepairs({
      content: draft,
      title: 'Student Visa Guide',
      primaryKeyword: 'student visa conditions',
      region: 'AU',
      indexable: true,
      contentType: 'article',
    })
    // All 30 distinct sentences survive despite the shared collocation.
    for (let i = 1; i <= 30; i++) {
      expect(content).toContain(`Requirement ${i} is checked by the department of home affairs`)
    }
  })

  it('normalises whilst → while so the tone_whilst warning is mechanically cleared', () => {
    const draft = '# Guide\n\nYou must apply whilst the window is open.'
    const { content, applied } = applyDeterministicRepairs({
      content: draft,
      indexable: true,
      contentType: 'legal_guide',
    })
    expect(applied).toContain('whilst_normalized')
    expect(content).not.toMatch(/whilst/)
    expect(content).toMatch(/apply while the window/)
  })

  it('clears all 6 warning categories — schema_article, schema_faq, wall_of_text, concrete_example, internal_links, + scaffolding', () => {
    // Draft deliberately missing:
    //   - Article JSON-LD → should inject schema_article
    //   - FAQPage JSON-LD (has 3+ FAQ-ish H2s) → should inject schema_faq
    //   - Dense prose block (>180 chars, no breaks) → should split into smaller paragraphs
    //   - Concrete example (≥800 words, no "for example") → should inject worked example
    //   - Internal links (<2 yousafeconsultancy.com refs) → should add Related guides
    //   - Disclaimer → should inject YMYL disclaimer
    //   - Em-dashes → should normalise
    //   - Whilst → should normalise
    const FAQ_H2S = [
      '## Eligibility',
      'You must hold a valid passport and meet the character requirement. All applicants must demonstrate genuine temporary entrant status and provide biometric information when requested. Police certificates from every country you have lived in for more than twelve months are mandatory and must be dated within the last year before you submit your application.',
      '',
      '## Required Documents',
      'Passport, birth certificate, proof of financial capacity, health insurance evidence, and academic transcripts or professional registration certificates must all be translated into English by a NAATI-certified translator before lodgement.',
      '',
      '## Costs and Fees',
      'The visa application charge depends on the stream you select and whether you include dependent family members. Additional costs include the immigration health examination (IHE), police certificates, and document translation services which can vary considerably.',
    ]

    // ~800-word pad without any example markers
    const padSentences = [
      'Immigration officers assess each application against the legislative criteria established under the Migration Regulations 1994.',
      'Applicants should review the most recent legislative instrument published on the Federal Register of Legislation before submitting any supporting documentation.',
      'Processing timeframes published by the Department of Home Affairs reflect the median number of calendar days required to finalise applications in each reporting period.',
      'The Minister has the discretion to request additional information under section 56 of the Migration Act 1958 when a delegate forms the view that further evidence is required.',
      'Consular processing fees are non-refundable under the Consular Services Regulations regardless of the outcome of the visa determination.',
      'Professional migration advice can help applicants navigate complex eligibility pathways and prepare evidence that satisfies the decision-maker at first instance.',
      'Administrative Appeals Tribunal review rights attach to most visa refusal decisions subject to strict time limits that commence from the date of notification.',
      'Legislative amendments to the skilled occupation lists take effect on the date specified in the amending instrument published by the Department of Employment and Workplace Relations.',
      'Bridging visas maintain lawful status during processing — applicants must comply with the conditions attached to their bridging visa at all times.',
      'Evidence of English language proficiency must be less than three years old at the time of invitation unless the applicant holds a passport from an exempt country.',
    ]

    let pad = ''
    for (let i = 0; i < 120; i++) {
      pad += padSentences[i % padSentences.length] + ' '
      if (i % 4 === 3) pad += '\n\n'
    }

    // One deliberately dense block (>180 chars, no breaks) to trigger wall_of_text
    const denseBlock = 'International students who wish to study in Australia must first obtain a Confirmation of Enrolment from a CRICOS-registered education provider before they can apply for a subclass 500 student visa through the Department of Home Affairs online portal.'

    const draft = [
      '# International Student Visa — Australia',
      '',
      ...FAQ_H2S,
      '',
      '## The Application Timeline',
      denseBlock,
      '',
      pad,
      '',
      '## Common Refusal Reasons',
      'Insufficient financial evidence remains the leading cause of refusal — applicants must demonstrate genuine access to funds rather than merely showing a bank balance snapshot on a single day.',
      '',
      '## Post-Study Work Rights',
      'Graduates of Australian institutions may qualify for the Temporary Graduate visa (subclass 485) which provides full work rights — the duration depends on your qualification level and regional study location.',
    ].join('\n')

    const wordCount = draft.split(/\s+/).filter(w => w.length > 1).length
    expect(wordCount).toBeGreaterThanOrEqual(800)

    const { content, applied } = applyDeterministicRepairs({
      content: draft,
      title: 'International Student Visa Australia',
      primaryKeyword: 'australia student visa',
      region: 'AU',
      indexable: true,
      contentType: 'legal_guide',
    })

    // ── Assert all six specific repairs fired ──
    expect(applied).toContain('schema_article')
    expect(applied).toContain('schema_faq')
    expect(applied).toContain('wall_of_text_split')
    expect(applied).toContain('concrete_example')
    expect(applied).toContain('internal_links')

    // ── Assert scaffolding repairs also fired ──
    expect(applied).toContain('disclaimer')
    expect(applied).toContain('table_of_contents')

    // ── Assert schema injected ──
    expect(content).toMatch(/"@type"\s*:\s*"Article"/)
    expect(content).toMatch(/"@type"\s*:\s*"FAQPage"/)
    expect(content).toMatch(/headline/)

    // ── Assert dense block was split (wall_of_text_split fires → content changes) ──
    // The dense block should survive as sentences but be broken into groups
    expect(content).toMatch(/International students/)  // dense block content survives

    // ── Assert concrete example injected ──
    expect(content).toMatch(/Worked Example|Scenario|Maria|Carlos|real.world case/)

    // ── Assert internal links injected ──
    // The internal_links repair now injects verified ESTATE anchors
    // (legal.yousafeconsultancy.com / yousafeconsultancy.com), which the audit
    // counts — so the INTERNAL_LINKS warning clears. Gov citations are injected
    // separately by the official_sources repair.
    expect(content).toMatch(/legal\.yousafeconsultancy\.com/)
    expect(content).toMatch(/immi\.homeaffairs\.gov/)

    // ── Assert disclaimer injected ──
    expect(content).toMatch(/not legal advice/)

    // ── Audit should no longer flag any of the repaired warnings as blockers ──
    const audit = auditContent({
      content,
      contentType: 'legal_guide',
      primaryKeyword: 'australia student visa',
      indexable: true,
    })

    const warningCodes = new Set(audit.warnings.map((w) => w.code))
    expect(warningCodes.has('schema_article')).toBe(false)
    expect(warningCodes.has('schema_faq')).toBe(false)
    expect(warningCodes.has('wall_of_text')).toBe(false)
    expect(warningCodes.has('missing_concrete_example')).toBe(false)
    // internal_links warning now clears — the repair injects estate-host
    // interlinks (yousafeconsultancy.com) instead of gov URLs, and gov sources
    // are handled by the separate official_sources repair.
    expect(warningCodes.has('internal_links')).toBe(false)
    expect(warningCodes.has('citations')).toBe(false)
    expect(warningCodes.has('disclaimer')).toBe(false)

    // ── Assert ≥5 repairs total (6 categories minus internal_links gap) ──
    expect(applied.length).toBeGreaterThanOrEqual(5)
  })

  it('backfills missing required long-tail keywords as FAQ questions', () => {
    const draft = `---
title: Study Abroad Statement of Purpose Guide
description: A practical guide to the study abroad statement of purpose with steps, samples, and requirements.
---

# Study Abroad Statement of Purpose Guide

## In 60 seconds
- One direct answer bullet.

## Eligibility
You need a valid passport and admission letter.

## FAQ
- Q: How long is a statement of purpose?
  A: Usually one page.

## Sources
- [USCIS](https://www.uscis.gov/)

**Disclaimer:** educational only, not legal advice.
`
    const repaired = applyDeterministicRepairs({
      content: draft,
      title: 'Study Abroad Statement of Purpose Guide',
      primaryKeyword: 'study abroad statement of purpose',
      indexable: true,
      contentType: 'article',
      requiredShortKeywords: ['statement of purpose guide', 'sop writing tips', 'sop sample', 'sop length', 'sop checklist'],
      requiredLongTailKeywords: [
        'statement of purpose for study abroad sample',
        'is it possible to study abroad statement of purpose',
        'requirements for a study abroad statement of purpose',
      ],
    })
    const out = repaired.content
    // Every required long-tail phrase must now exist verbatim in the body
    for (const lt of ['statement of purpose for study abroad sample', 'is it possible to study abroad statement of purpose', 'requirements for a study abroad statement of purpose']) {
      expect(out.toLowerCase()).toContain(lt)
    }
    // They were inserted as FAQ questions (### under ## FAQ)
    expect(out).toMatch(/### Statement of purpose for study abroad sample\?/)
    expect(out).toMatch(/### Is it possible to study abroad statement of purpose\?/)
    expect(out).toMatch(/### Requirements for a study abroad statement of purpose\?/)
    expect(repaired.applied.some((a) => a.startsWith('keyword_backfill'))).toBe(true)
  })

  it('backfills missing required short keywords as In 60 seconds bullets', () => {
    const draft = `---
title: Study Abroad SOP Guide
description: Practical study abroad statement of purpose guidance with samples and templates.
---

# Study Abroad SOP Guide

## In 60 seconds
- Direct answer bullet.

## Steps
One practical step here.

## FAQ
- Q: What is an SOP?
  A: A statement of purpose.

## Sources
- [USCIS](https://www.uscis.gov/)

**Disclaimer:** educational only, not legal advice.
`
    const repaired = applyDeterministicRepairs({
      content: draft,
      title: 'Study Abroad SOP Guide',
      primaryKeyword: 'study abroad sop',
      indexable: true,
      contentType: 'article',
      requiredShortKeywords: ['study abroad sop', 'sop writing tips', 'sop sample', 'sop length', 'sop checklist'],
      requiredLongTailKeywords: ['how to write a study abroad statement of purpose', 'study abroad statement of purpose requirements 2026', 'study abroad statement of purpose sample pdf', 'study abroad statement of purpose template'],
    })
    const out = repaired.content
    // Missing shorts appear as bullets in the In 60 seconds block
    for (const k of ['sop writing tips', 'sop sample', 'sop length', 'sop checklist']) {
      expect(out.toLowerCase()).toContain(k)
    }
    expect(out).toMatch(/## In 60 seconds/)
    expect(repaired.applied.some((a) => a.startsWith('keyword_backfill'))).toBe(true)
  })

  // 2026-08-13 live-run regression: GLM 5.2 Fast drafted a 3234-word legal
  // guide (max 2800) and the gates only WARNED — bloated pages shipped. The
  // deterministic repair must trim over-long drafts into [min, max] while
  // preserving every required block.
  it('trims an over-long draft into the word window without touching protected sections', () => {
    const section = (name: string, n = 60) =>
      `## ${name}\n\n` +
      Array.from(
        { length: n },
        (_, i) =>
          `Paragraph ${i} in the ${name} section covers practical steps, required documents, processing times, fees, and common pitfalls for applicants in 2026.`,
      ).join('\n\n')
    const content =
      `# UK Dependent Visa Documents Checklist 2026\n\n` +
      `Intro paragraph with the primary keyword uk dependent visa documents checklist for applicants.\n\n` +
      `${section('In 60 seconds', 3)}\n` +
      `${section('Eligibility')}\n` +
      `${section('Documents')}\n` +
      `${section('Costs and fees')}\n` +
      `${section('Processing times')}\n` +
      `${section('FAQ', 8)}\n` +
      `${section('Disclaimer', 2)}\n`
    expect(countBodyWords(content)).toBeGreaterThan(2800)

    const r = applyDeterministicRepairs({
      content,
      contentType: 'legal_guide',
      primaryKeyword: 'uk dependent visa documents checklist',
      title: 'UK Dependent Visa Documents Checklist 2026',
    })
    const out = r.content
    const words = countBodyWords(out)
    expect(words).toBeLessThanOrEqual(2800)
    expect(words).toBeGreaterThanOrEqual(2200)
    expect(r.applied.some((a) => a.startsWith('trim_to_max_words'))).toBe(true)
    // Required blocks survive the trim
    expect(out).toMatch(/## In 60 seconds/)
    expect(out).toMatch(/## FAQ/)
    expect(out).toMatch(/## Disclaimer/)
    expect(out).toMatch(/## Official sources/)
  })

  // 2026-08-13: a draft that is ALREADY inside the window is untouched.
  it('leaves a draft already inside the window alone', () => {
    const body = [
      '# UK Dependent Visa Guide',
      '',
      '## In 60 seconds',
      '- Dependents include spouses, civil partners, and children under 18.',
      '- Financial requirements apply per dependent.',
      '',
      '## Eligibility',
      'You must demonstrate a genuine and subsisting relationship.',
      '',
      '## Documents',
      'Passport, financial evidence, accommodation details.',
      '',
      '## FAQ',
      '### Do children need separate applications?',
      'Yes when they travel on a dependent visa.',
      '',
      '## Disclaimer',
      '**Disclaimer:** This page is educational and editorial only. It is **not legal advice**.',
    ].join('\n')
    const r = applyDeterministicRepairs({
      content: body,
      contentType: 'legal_guide',
      primaryKeyword: 'uk dependent visa',
      title: 'UK Dependent Visa Guide',
    })
    expect(r.applied.some((a) => a.startsWith('trim_to_max_words'))).toBe(false)
    expect(r.content).toContain('genuine and subsisting relationship')
  })

  it('clears the sentence_start_repetition warning — 5× "The UK dependent visa" openings get varied pronouns', () => {
    // The exact live-run failure: the drafting model opened 5+ sentences with
    // the same 12-char phrase. The AI sweep is told to vary openings but often
    // does not; the deterministic rhythm repair must clear it on the same pass.
    const body = [
      '# UK Dependent Visa Guide',
      '',
      '## Eligibility',
      '',
      'The department publishes guidance for dependents of visa holders. The UK dependent visa allows partners to apply. The UK dependent visa requires proof of the relationship. The UK dependent visa covers children under 18. The UK dependent visa is applied for online. The UK dependent visa normally takes three weeks to process.',
      '',
      '## Documents',
      '',
      'Passport, financial evidence, and accommodation details must all be supplied before the application is submitted for assessment by the case officer. You should keep certified copies of everything you send to the department.',
      '',
      '## FAQ',
      '',
      '### Do children need separate applications?',
      'Yes when they travel on a dependent visa and the sponsor meets the financial requirement for each child.',
    ].join('\n')

    const { content, applied } = applyDeterministicRepairs({
      content: body,
      contentType: 'legal_guide',
      primaryKeyword: 'uk dependent visa',
      title: 'UK Dependent Visa Guide',
      region: 'UK',
      indexable: true,
    })

    expect(applied.some((a) => a.startsWith('sentence_rhythm'))).toBe(true)
    // The first occurrence is kept verbatim; the repeated openings are replaced
    // with pronouns (It / This / That), so the exact phrase no longer repeats.
    const ukDependentCount = (content.match(/The UK dependent visa/g) || []).length
    expect(ukDependentCount).toBeLessThan(5)
    expect(ukDependentCount).toBeGreaterThanOrEqual(1)

    const audit = auditContent({
      content,
      contentType: 'legal_guide',
      primaryKeyword: 'uk dependent visa',
      indexable: true,
    })
    expect(audit.warnings.some((w) => w.code === 'sentence_start_repetition')).toBe(false)
    expect(audit.blockers.some((b) => b.code === 'sentence_start_repetition')).toBe(false)
  })

  it('injects canonicalUrl from targetUrl so ahrefs_canonical_missing clears', () => {
    const body = [
      '# US Visa Renewal Guide',
      '',
      '## In 60 seconds',
      '- Check which visa category applies to your situation',
      '- Gather passport and supporting documents',
      '- File before your current visa expires',
      '',
      '## Eligibility',
      'US visa renewal eligibility depends on your current status and the category you hold.',
      '',
      '## FAQ',
      '### Can I renew before my current visa expires?',
      'Yes, and you should. Starting early protects you if processing takes longer than expected.',
    ].join('\n')
    const { content, applied } = applyDeterministicRepairs({
      content: body,
      contentType: 'legal_guide',
      primaryKeyword: 'us visa renewal',
      title: 'US Visa Renewal Guide',
      region: 'US',
      indexable: true,
      targetUrl: 'https://legal.yousafeconsultancy.com/us/visa-renewal/',
    })
    expect(content).toMatch(/canonicalUrl:\s*https:\/\/legal\.yousafeconsultancy\.com\/us\/visa-renewal\//)
    const audit = auditContent({ content, contentType: 'legal_guide', primaryKeyword: 'us visa renewal', indexable: true })
    expect(audit.warnings.some((w) => w.code === 'ahrefs_canonical_missing')).toBe(false)
  })

  it('clears 5× "US immigration…" openings with adverbial rewrites when the tail is not a verb', () => {
    const body = [
      '# Education Verification',
      '',
      '## Overview',
      '',
      'US immigration services require a full credential review before you file. US immigration services typically take six weeks after documents arrive. US immigration services also check translations against the original diploma. US immigration services may request extra transcripts from the registrar. US immigration services will not proceed until every page is certified.',
      '',
      '## Next steps',
      '',
      'Gather the diploma, transcripts, and a certified translation before you book the evaluation. Keep copies of every envelope you send to the evaluator.',
    ].join('\n')
    const { content, applied } = applyDeterministicRepairs({
      content: body,
      contentType: 'legal_guide',
      primaryKeyword: 'education verification',
      title: 'Education Verification Service',
      region: 'US',
      indexable: true,
    })
    expect(applied.some((a) => a.startsWith('sentence_rhythm'))).toBe(true)
    const hits = (content.match(/US immigration services/g) || []).length
    expect(hits).toBeLessThan(5)
    const audit = auditContent({
      content,
      contentType: 'legal_guide',
      primaryKeyword: 'education verification',
      indexable: true,
    })
    expect(audit.warnings.some((w) => w.code === 'sentence_start_repetition')).toBe(false)
    expect(audit.blockers.some((b) => b.code === 'sentence_start_repetition')).toBe(false)
  })

  it('never mangles a noun-phrase tail — "The UK dependent visa fees are…" stays untouched', () => {
    // Safety guard: the tail after the repeated phrase must start with a verb.
    // "fees are paid" begins with a NOUN, so that sentence must NOT be
    // rewritten into "It fees are paid…".
    const body = [
      '# UK Dependent Visa Guide',
      '',
      '## Eligibility',
      '',
      'The department publishes guidance for dependents of visa holders. The UK dependent visa allows partners to apply. The UK dependent visa requires proof of the relationship. The UK dependent visa covers children under 18. The UK dependent visa is applied for online. The UK dependent visa normally takes three weeks to process. The UK dependent visa fees are paid when you submit.',
      '',
      '## Documents',
      '',
      'Passport, financial evidence, and accommodation details must all be supplied before the application is submitted for assessment by the case officer. You should keep certified copies of everything you send to the department.',
      '',
      '## FAQ',
      '',
      '### Do children need separate applications?',
      'Yes when they travel on a dependent visa and the sponsor meets the financial requirement for each child.',
    ].join('\n')

    const { content } = smoothSentenceRhythm(body)
    expect(content).toContain('The UK dependent visa fees are paid when you submit.')
    // The four safe verb-led sentences ARE rewritten (rotating It/This/That);
    // the noun-led one is not.
    expect(content).toMatch(/(It|This|That) requires proof of the relationship/)
    expect(content).not.toMatch(/It fees are paid/)
  })

  it('uses plural pronouns for repeated plural subjects ("Applicants must…")', () => {
    const body = [
      '# UK Dependent Visa Guide',
      '',
      '## Eligibility',
      '',
      'The department publishes guidance for dependents of visa holders. Applicants must show a valid passport. Applicants must check the official guidance. Applicants must include evidence of shared finances. Applicants must usually need translated documents. Applicants must be responsible for accuracy. The department assesses every application on its own merits. Officers review each file in order of submission date. Processing times vary by office and season. Refusals can be appealed within strict time limits.',
      '',
      '## FAQ',
      '',
      '### Do children need separate applications?',
      'Yes when they travel on a dependent visa and the sponsor meets the financial requirement for each child.',
    ].join('\n')

    const { content, replaced } = smoothSentenceRhythm(body)
    expect(replaced).toBeGreaterThan(0)
    // All rewrites use PLURAL openers (They/These/Those) — the subject
    // "Applicants" is plural, so "It must…" must never appear.
    expect(content).toMatch(/(They|These|Those) must check the official guidance/)
    expect(content).not.toMatch(/It must check the official guidance/)
    expect(content).not.toMatch(/This must check the official guidance/)
    expect(content).not.toMatch(/That must check the official guidance/)
  })

  it('never drops a no-punctuation paragraph that ends with a newline', () => {
    // Regression for the depth-rescue merge: the sentence-splitting regex used
    // `$` (end-of-string only), so a paragraph of plain tokens followed by a
    // trailing newline — exactly how an appended section ends after a merge —
    // produced ZERO spans and the whole paragraph was silently deleted from
    // the rebuilt content (a 700-word block vanishing mid-draft).
    const body = [
      '# Guide',
      '',
      'The UK dependent visa allows partners to apply. The UK dependent visa requires proof of the relationship. The UK dependent visa covers children under 18. The UK dependent visa is applied for online. The UK dependent visa normally takes three weeks to process.',
      '',
      Array(50).fill('guidance').join(' '),
      '',
      '## Documents',
      '',
      'Applicants must show a valid passport. Applicants must check the official guidance. Applicants must include evidence of shared finances. Applicants must usually need translated documents. Applicants must be responsible for accuracy. Officers review each file in order of submission date. Processing times vary by office and season.',
    ].join('\n')

    const { content, replaced } = smoothSentenceRhythm(body)
    expect(replaced).toBeGreaterThan(0) // the repeated openings ARE smoothed
    expect(content).toMatch(/guidance guidance/)
    // The padding paragraph's word count survives (only opener words dropped)
    const kept = content.split(/\s+/).filter(Boolean).length
    const input = body.split(/\s+/).filter(Boolean).length
    expect(kept).toBeGreaterThanOrEqual(input - 12)
  })

  it('smooths repeated openings across TL;DR list items, keeping bullets as bullets', () => {
    // The In 60 seconds block repeats the subject across bullets. The smooth
    // must rewrite the later openers AND preserve the "- " marker so the
    // block stays a list ("- It requires…" not "It requires…" as prose), and
    // must NOT collapse the bullets onto one line.
    const body = [
      '# UK Dependent Visa Guide',
      '',
      '## In 60 seconds',
      '',
      '- The UK dependent visa allows partners to apply.',
      '- The UK dependent visa requires proof of the relationship.',
      '- The UK dependent visa covers children under 18.',
      '- The UK dependent visa is applied for online.',
      '- The UK dependent visa normally takes three weeks to process.',
      '',
      '## Eligibility',
      '',
      'Applicants must hold a valid passport. The main applicant must hold valid leave. Partners can live and work freely. Children can attend school. Extensions are filed before leave expires. Decisions arrive in writing. Appeals have strict deadlines.',
      '',
      '## FAQ',
      '',
      '### Can dependents work?',
      'Yes, dependents have full work rights.',
    ].join('\n')

    const { content, replaced } = smoothSentenceRhythm(body)
    expect(replaced).toBeGreaterThan(0)
    // Exactly one bullet keeps the full subject; the rest take pronouns.
    const full = (content.match(/- The UK dependent visa/g) || []).length
    expect(full).toBe(1)
    // Later bullets are rewritten with rotating pronouns AND stay bullets.
    expect(content).toMatch(/- That requires proof of the relationship/)
    expect(content).toMatch(/- It covers children under 18/)
    // No bullet collapsed into a plain paragraph, no bullets merged into one
    // line (the gap-preserving rebuild keeps every "- " on its own line).
    expect((content.match(/^- /gm) || []).length).toBe(5)
    expect(content).not.toMatch(/apply\.- /)
    // Unrelated sections are untouched.
    expect(content).toMatch(/Applicants must hold a valid passport/)
    expect(content).toMatch(/Yes, dependents have full work rights/)
  })

  it('smooths repeated openings in FAQ answers (prose and bullet forms)', () => {
    // FAQ answers that repeat the subject across questions get smoothed the
    // same way as body prose — the answer block is prose rhythm, not a
    // heading enumeration.
    const body = [
      '# Guide',
      '',
      '## FAQ',
      '',
      '### What documents do I need?',
      'The UK dependent visa requires a valid passport. The UK dependent visa requires proof of the relationship. The UK dependent visa requires financial evidence. The UK dependent visa requires accommodation details. The UK dependent visa requires biometrics for everyone.',
      '',
      '### Can I extend?',
      'Yes, extensions are filed before leave expires.',
      '### Do children apply separately?',
      'No, children are included on the main application.',
      '### Can partners work?',
      'Yes, dependents have full work rights in the UK.',
    ].join('\n')

    const { content, replaced } = smoothSentenceRhythm(body)
    expect(replaced).toBeGreaterThan(0)
    // One opener left in the answer, the other four rotated to pronouns.
    const full = (content.match(/The UK dependent visa requires/g) || []).length
    expect(full).toBe(1)
    expect(content).toMatch(/That requires proof of the relationship/)
    // Question headings and unrelated answers are untouched.    expect(content).toMatch(/### What documents do I need\?/)
    expect(content).toMatch(/Yes, extensions are filed before leave expires/)
  })

  it('injects a ## FAQ section when missing so missing_faq clears (recurring 100/100-BLOCKED case)', () => {
    // Draft has content H2s but NO FAQ section — the exact shape that kept
    // recurring in production: every other gate green, missing_faq blocking.
    const draft = [
      '# UK Dependent Visa Guide',
      '',
      '## In 60 seconds',
      '- Dependents can join a main visa holder in the UK.',
      '- You must prove the relationship and financial support.',
      '- Check official GOV.UK guidance before you apply.',
      '',
      '## Eligibility',
      'You must be the partner or child of a main visa holder and meet the financial requirement. The relationship must be genuine and subsisting.',
      '',
      '## Required documents',
      'Passport, proof of relationship, financial evidence, and accommodation details are all required before you submit.',
      '',
      '## Application process',
      'Apply online from outside the UK, pay the fee, and book a biometrics appointment at a visa application centre.',
      '',
      '## Costs and fees',
      'The application fee and immigration health surcharge are payable in full when you submit.',
    ].join('\n')

    const { content, applied } = applyDeterministicRepairs({
      content: draft,
      title: 'UK Dependent Visa Guide',
      primaryKeyword: 'uk dependent visa',
      region: 'UK',
      indexable: true,
      contentType: 'article',
    })

    expect(applied.some((a) => a.startsWith('faq_section ('))).toBe(true)
    expect(content).toMatch(/^## FAQ$/m)
    expect(content).toMatch(/^### .+\?$/m)
    // schema_faq also clears from the same derived Q&As.
    expect(content).toMatch(/"@type"\s*:\s*"FAQPage"/)

    const gate = evaluateContentQuality({
      content,
      contentType: 'article',
      primaryKeyword: 'uk dependent visa',
      indexable: true,
    })
    expect(gate.blockers.some((f) => f.code === 'missing_faq')).toBe(false)
  })

})
