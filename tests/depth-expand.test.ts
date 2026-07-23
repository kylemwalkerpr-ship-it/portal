import {
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
