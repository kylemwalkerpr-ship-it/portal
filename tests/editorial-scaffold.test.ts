import { ensureEditorialScaffold } from '@/lib/seoFactory/editorialScaffold'
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
