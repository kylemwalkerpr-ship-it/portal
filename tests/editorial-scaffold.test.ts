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
})
