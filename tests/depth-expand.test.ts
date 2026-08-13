import {
  buildDepthAppendPrompt,
  buildDepthExpandPrompt,
  mergeAppendedSections,
  extractH2Titles,
} from '@/lib/seoFactory/prompts'
import { countBodyWords } from '@/lib/seoFactory/contentDepth'

describe('depth expand helpers', () => {
  it('buildDepthExpandPrompt states current vs min words', () => {
    const p = buildDepthExpandPrompt({
      title: 'Test',
      topic: 'student visa',
      primaryKeyword: 'student visa',
      region: 'US',
      contentType: 'legal_guide',
      minWords: 1800,
      targetWords: 2200,
      currentWords: 750,
      draft: '---\ntitle: x\n---\n\n# Hello\n\nShort body.',
    })
    expect(p).toMatch(/750/)
    expect(p).toMatch(/1800/)
    expect(p).toMatch(/DEPTH EXPANSION/)
    expect(p).toMatch(/PREVIOUS DRAFT/)
  })

  it('buildDepthExpandPrompt carries h2Outline and demands the deficit', () => {
    const p = buildDepthExpandPrompt({
      title: 'Test',
      topic: 'student visa',
      primaryKeyword: 'student visa',
      region: 'US',
      contentType: 'legal_guide',
      minWords: 2200,
      targetWords: 2500,
      maxWords: 2800,
      currentWords: 1660,
      draft: '# x\n\nshort',
      h2Outline: ['Eligibility Requirements', 'Application Process'],
    })
    // The planned outline is threaded into the prompt so expansion follows it
    expect(p).toMatch(/Eligibility Requirements/)
    expect(p).toMatch(/Application Process/)
    // The exact remaining deficit is demanded so the model knows the floor
    expect(p).toMatch(/1660/)
    expect(p).toMatch(/2200/)
    // Under-delivering is framed as the only real failure (no mixed signal)
    expect(p).toMatch(/Under-delivering is the ONLY failure/)
  })

  it('buildDepthAppendPrompt demands the full remaining deficit with focus', () => {
    const p = buildDepthAppendPrompt({
      primaryKeyword: 'student visa',
      region: 'US',
      minWords: 2200,
      currentWords: 1660,
      existingH2s: ['Eligibility'],
      draftExcerpt: 'short',
      h2Outline: ['Eligibility Requirements', 'Application Process'],
      focus: 'Document checklist deep dive',
    })
    // Must demand the whole deficit plus headroom, never a token 100-word nudge
    expect(p).toMatch(/at least 740 MORE words/)
    expect(p).toMatch(/2200 total/)
    // The rotating focus and planned outline are threaded in
    expect(p).toMatch(/FOCUS THIS PASS ON: Document checklist deep dive/)
    expect(p).toMatch(/Application Process/)
    expect(p).not.toMatch(/Need ~400 MORE words/) // old soft target
  })

  it('buildDepthAppendPrompt warns against repeating sentence openings so appended sections never re-create sentence_start_repetition', () => {
    const p = buildDepthAppendPrompt({
      primaryKeyword: 'student visa',
      region: 'US',
      minWords: 2200,
      currentWords: 1900,
      existingH2s: ['Eligibility'],
      draftExcerpt: 'short',
    })
    expect(p).toMatch(/SENTENCE OPENINGS/)
    // Explicitly names the failure mode (repeated 12-char subject phrase) and
    // the remedy (pronouns / connectives / concrete nouns after first mention).
    expect(p).toMatch(/Do NOT start 5 or more sentences/)
    expect(p).toMatch(/same 12 characters/)
    expect(p).toMatch(/pronouns, connectives, and concrete nouns/)
  })

  it('mergeAppendedSections inserts before script', () => {
    const draft = `# Title\n\nIntro\n\n<script type="application/ld+json">{}</script>\n`
    const append = `## Extra section\n\n${'word '.repeat(50)}`
    const merged = mergeAppendedSections(draft, append)
    expect(merged.indexOf('Extra section')).toBeLessThan(merged.indexOf('<script'))
    expect(countBodyWords(merged)).toBeGreaterThan(countBodyWords(draft))
  })

  it('extractH2Titles lists headings', () => {
    const md = '## One\n\nx\n\n## Two\n\ny'
    expect(extractH2Titles(md)).toEqual(['One', 'Two'])
  })
})
