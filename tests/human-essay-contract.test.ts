/**
 * Locks the human-essay writer contract: one article, not keyword-stuffed
 * kit pieces. These strings are the generation contract — if they drift back
 * to quota-checklists, drafts regress to mill glue.
 */
import { buildFactorySystemPrompt, buildFactoryUserPrompt } from '@/lib/seoFactory/prompts'
import { qualityPromptBlock, qualityToRefineNotes, evaluateContentQuality } from '@/lib/seoFactory/contentQualityGate'
import { essayFirstPromptBlock } from '@/lib/seoFactory/writingShape'
import { renderKeywordContractBrief } from '@/lib/seoFactory/keywordContractBrief'
import { buildOutlineSectionPrompt } from '@/lib/seoFactory/outlineCompletion'
import { THROUGHLINE_SYSTEM, shouldRunThroughline } from '@/lib/seoFactory/throughline'
import type { OwnerPlan } from '@/lib/seoFactory/ownership'

const legalPlan = {
  matched: null,
  matchScore: 0,
  host: 'legal',
  repo: 'caseworks',
  filePath: 'app/us/h1b/page.tsx',
  canonicalUrl: 'https://legal.yousafeconsultancy.com/us/h1b',
  indexable: true,
  action: 'create',
  intentClass: 'legal_guide',
  contentType: 'legal_guide',
  warnings: [],
  blockers: [],
  ymy: true,
  routingSource: 'registry_host',
} as OwnerPlan

describe('essay-first writer contract', () => {
  it('injects the one-article block into the system prompt', () => {
    const prompt = buildFactorySystemPrompt({
      plan: legalPlan,
      contentType: 'legal_guide',
      minWords: 2200,
      primaryKeyword: 'h-1b visa',
    })
    for (const line of essayFirstPromptBlock()) {
      expect(prompt).toContain(line)
    }
    expect(prompt).toContain('WRITE ONE ARTICLE, NOT A KIT.')
    expect(prompt).not.toMatch(/must include keyword\(s\)/)
  })

  it('treats per-H2 ranges as pacing, not ship-failure quotas', () => {
    const prompt = buildFactoryUserPrompt({
      title: 'H-1B visa',
      topic: 'H-1B visa',
      primaryKeyword: 'h-1b visa',
      region: 'US',
      contentType: 'legal_guide',
      tone: 'educational',
      gscBlock: '',
      sectionBudgets: [
        { heading: 'Eligibility', minWords: 400, maxWords: 600 },
        { heading: 'FAQ', minWords: 200, maxWords: 320 },
      ],
    })
    expect(prompt).toContain('PAGE PACING GUIDE')
    expect(prompt).toContain('not independent articles')
    expect(prompt).toContain('with a bridge between them')
    expect(prompt).not.toContain('ABSOLUTE SECTION QUOTAS')
    expect(prompt).not.toMatch(/MUST be \d+–\d+ body words \(inclusive\)/)
  })

  it('maps brief keywords as topics to cover, never as stuffing checkboxes', () => {
    const prompt = buildFactorySystemPrompt({
      plan: legalPlan,
      contentType: 'legal_guide',
      minWords: 2200,
      primaryKeyword: 'h-1b visa',
      h2Outline: ['Eligibility', 'Documents'],
      kwH2Map: { 'h-1b visa': 'Eligibility' },
    })
    expect(prompt).toContain('cover these topics naturally: h-1b visa')
    expect(prompt).not.toContain('must include keyword(s)')
    expect(prompt).toContain('Never paste the keyword string')
    expect(prompt).not.toMatch(/In 60 seconds, a checklist item/)
  })

  it('quality block leads with one-article cohesion, not 12-char scanner gaming', () => {
    const block = qualityPromptBlock('legal_guide')
    expect(block).toContain('Q1. ONE ARTICLE.')
    expect(block.indexOf('Q1. ONE ARTICLE.')).toBeLessThan(block.indexOf('Q2. VARIED SENTENCE OPENINGS'))
    expect(block).toContain('WRITE ONE ARTICLE, NOT A KIT.')
    expect(block).not.toContain('Q1. VARIED SENTENCE OPENINGS. This is the #1 rejection reason')
  })

  it('keyword contract forbids checklist stuffing', () => {
    const brief = renderKeywordContractBrief({
      requiredShortKeywords: ['student visa'],
      requiredLongTailKeywords: ['how to apply student visa'],
      shortKeywordTerms: [{ term: 'student visa', source: 'demand' }],
      longTailKeywordTerms: [{ term: 'how to apply student visa', source: 'demand' }],
      backfilled: false,
    }, 'student visa')
    expect(brief).toContain('This list is not a checklist')
    expect(brief).toContain('Never stuff the first content H2')
  })

  it('outline closer requires a bridge from the previous section', () => {
    const { system, prompt } = buildOutlineSectionPrompt({
      article: '# Guide\n\nThesis about skilled migration.\n\n## Eligibility\n\nOfficers weigh the job offer before they ask for the file.\n',
      heading: 'Documents',
    })
    expect(system).toMatch(/first sentence must depend on the previous section/)
    expect(prompt).toMatch(/Open with a bridge from the last claim/)
    expect(prompt).toContain('Previous section to continue from')
    expect(prompt).toContain('## Eligibility')
    expect(prompt).not.toMatch(/Write 180-350 words/)
  })

  it('throughline revises kit openings and stuffing, and can be forced after splices', () => {
    expect(THROUGHLINE_SYSTEM).toMatch(/Each H2 must continue the previous H2/)
    expect(THROUGHLINE_SYSTEM).toMatch(/Do not keyword-stuff/)
    expect(shouldRunThroughline({ contentType: 'blog_post', indexable: true, words: 280, force: true })).toBe(true)
  })

  it('does not tell the writer to stuff missing shorts into the first H2 or In 60 seconds', () => {
    const r = evaluateContentQuality({
      content: `# H-1B visa\n\nYou file after the LCA is certified.\n\n## Eligibility\n\nUSCIS will not accept the petition without a certified LCA from the Department of Labor. Keep the notice with the offer letter.\n\n## Documents\n\nThe certified LCA sits with the passport and the I-129 packet.\n\n## Process\n\nFile only when every named artefact is current.\n\n## FAQ\n\n### What happens after filing?\n\nUSCIS issues a receipt.\n\n## Sources\n\n- [USCIS](https://www.uscis.gov/)\n\n**Disclaimer:** This page is educational only. It is **not legal advice**.`,
      contentType: 'legal_guide',
      primaryKeyword: 'h-1b visa',
      indexable: true,
      requiredShortKeywords: ['h-1b visa', 'specialty occupation', 'labor condition'],
      requiredLongTailKeywords: ['how to apply for h-1b visa', 'h-1b visa documents checklist', 'h-1b processing time 2026', 'what is a specialty occupation'],
    })
    const notes = qualityToRefineNotes(r)
    expect(notes).not.toMatch(/title, first H2, In 60 seconds, or as a checklist item/)
    const missing = r.findings.find((f: { code: string }) => f.code === 'missing_short_keyword')
    if (missing) {
      expect(missing.fix).toMatch(/Meaning coverage beats exact-string placement/)
      expect(missing.fix).not.toMatch(/checklist item/)
    }
  })
})
