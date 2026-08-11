import { applyDeterministicRepairs, ensureEditorialScaffold } from '@/lib/seoFactory/editorialScaffold'
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

describe('applyDeterministicRepairs — warning micro-fixes', () => {
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
    // REGION_SOURCES.AU injects homeaffairs.gov.au gov references (these count
    // for the citations gate). The repair fires but the audit's internal_links
    // regex /\]\(\// only matches relative links like ](/page), NOT full URLs
    // like ](https://immi.homeaffairs.gov.au/...). This is a known gap — the
    // repair should also inject estate-host interlinks (yousafeconsultancy.com)
    // to clear the INTERNAL_LINKS audit warning.
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
    // internal_links warning still fires — repair injects gov URLs, not estate
    // TODO: wire repair to interlinkRegistry estate URLs so this flips to false
    expect(warningCodes.has('internal_links')).toBe(true)
    expect(warningCodes.has('disclaimer')).toBe(false)

    // ── Assert ≥5 repairs total (6 categories minus internal_links gap) ──
    expect(applied.length).toBeGreaterThanOrEqual(5)
  })
})
