import {
  buildSegmentWritePrompt,
  mergeSegmentParts,
  planWriteSegments,
} from '@/lib/seoFactory/prompts'
import { countBodyWords } from '@/lib/seoFactory/contentDepth'

describe('segmented writing helpers', () => {
  it('single-pass is the default: no split unless segmentCount > 1 is explicit', () => {
    // The pipeline now defaults every draft to ONE part — segmented writing
    // is an opt-in only (writeSegments > 1). A default '2' was the source of
    // the echo/second-copy defect (part 2 re-emitting front matter/H1).
    const single = planWriteSegments({
      h2Outline: ['Eligibility', 'Process', 'Documents', 'Costs', 'FAQ', 'Sources'],
      minWords: 2200,
      segmentCount: 1,
    })
    expect(single).toHaveLength(1)
    expect(single[0].sections).toEqual(['Eligibility', 'Process', 'Documents', 'Costs', 'FAQ', 'Sources'])
    expect(single[0].wordFloor).toBe(2200)
    expect(single[0].priorSections).toEqual([])
  })

  it('planWriteSegments splits the outline into 2 contiguous chunks', () => {
    const segments = planWriteSegments({
      h2Outline: ['Eligibility', 'Process', 'Documents', 'Costs', 'FAQ', 'Sources'],
      minWords: 2200,
      segmentCount: 2,
    })
    expect(segments).toHaveLength(2)
    expect(segments[0].index).toBe(1)
    expect(segments[1].index).toBe(2)
    // Contiguous — first part owns the first half of the outline
    expect(segments[0].sections).toEqual(['Eligibility', 'Process', 'Documents'])
    expect(segments[1].sections).toEqual(['Costs', 'FAQ', 'Sources'])
    // Word floors sum to at least the full minWords
    const totalFloor = segments.reduce((a, s) => a + s.wordFloor, 0)
    expect(totalFloor).toBeGreaterThanOrEqual(2200)
    // Part 2 knows what part 1 already wrote (no repetition)
    expect(segments[1].priorSections).toEqual(['Eligibility', 'Process', 'Documents'])
  })

  it('planWriteSegments returns a single part for short content', () => {
    const segments = planWriteSegments({ h2Outline: ['A'], minWords: 900, segmentCount: 2 })
    expect(segments).toHaveLength(1)
    expect(segments[0].wordFloor).toBe(900)
  })

  it('planWriteSegments falls back to a generic split without an outline', () => {
    const segments = planWriteSegments({ minWords: 2200, segmentCount: 2 })
    expect(segments).toHaveLength(2)
    const totalFloor = segments.reduce((a, s) => a + s.wordFloor, 0)
    expect(totalFloor).toBeGreaterThanOrEqual(2200)
  })

  it('buildSegmentWritePrompt scopes part 1 to its sections and word floor', () => {
    const segments = planWriteSegments({
      h2Outline: ['Eligibility', 'Process', 'Documents', 'Costs'],
      minWords: 2000,
      segmentCount: 2,
    })
    // First half of the outline belongs to part 1, second half to part 2
    expect(segments[0].sections).toEqual(['Eligibility', 'Process'])
    expect(segments[1].sections).toEqual(['Documents', 'Costs'])
    const p = buildSegmentWritePrompt({
      title: 'Skilled Migration 189',
      topic: 'skilled migration',
      primaryKeyword: 'skilled independent visa 189',
      region: 'AU',
      contentType: 'legal_guide',
      tone: 'educational',
      segment: segments[0],
      minWords: 2000,
      targetWords: 2200,
      gscBlock: 'GSC block',
    })
    expect(p).toMatch(/PART 1 OF 2/)
    expect(p).toMatch(/Eligibility/)
    expect(p).toMatch(/Process/)
    expect(p).toMatch(new RegExp(`${segments[0].wordFloor} body words`))
    // Part 1 owns front matter; must NOT write the final FAQ/Sources
    expect(p).toMatch(/YAML front matter/)
    expect(p).toMatch(/final part writes those/)
  })

  it('buildSegmentWritePrompt continuation parts never repeat prior sections', () => {
    const segments = planWriteSegments({
      h2Outline: ['Eligibility', 'Process', 'Costs'],
      minWords: 2200,
      segmentCount: 2,
    })
    const p = buildSegmentWritePrompt({
      title: 'Test',
      topic: 'test topic',
      primaryKeyword: 'test keyword',
      region: 'US',
      contentType: 'legal_guide',
      tone: 'educational',
      segment: segments[1],
      minWords: 2200,
      targetWords: 2500,
      gscBlock: 'GSC block',
    })
    expect(p).toMatch(/PART 2 OF 2/)
    // Explicitly told what is already written and not to repeat it
    expect(p).toMatch(/ALREADY WRITTEN IN EARLIER PARTS/)
    expect(p).toMatch(/Eligibility/)
    expect(p).toMatch(/Process/)
    // Continuation parts must NOT emit front matter
    expect(p).toMatch(/Do NOT emit YAML front matter/)
    // Final part closes the article with FAQ/Sources/JSON-LD/disclaimer
    expect(p).toMatch(/## FAQ/)
    expect(p).toMatch(/## Sources/)
    expect(p).toMatch(/JSON-LD/)
  })

  it('mergeSegmentParts joins parts and strips stray front matter/H1 from continuations', () => {
    const part1 = '---\ntitle: T\n---\n\n# Skilled Migration\n\n## Eligibility\n\nBody one.'
    const part2 = '---\ntitle: T\n---\n\n# Skilled Migration\n\n## Costs\n\nBody two.'
    const merged = mergeSegmentParts([part1, part2])
    // Only one H1 survives
    expect((merged.match(/# Skilled Migration/g) || []).length).toBe(1)
    // Only one YAML front matter survives (part 2's is stripped)
    expect((merged.match(/title: T/g) || []).length).toBe(1)
    // Both sections survive
    expect(merged).toMatch(/## Eligibility/)
    expect(merged).toMatch(/## Costs/)
  })

  it('mergeSegmentParts word count clears the floor when parts are substantial', () => {
    const parts = [
      '# Title\n\n## In 60 seconds\n\n' + 'intro '.repeat(400),
      '## Costs\n\n' + 'costs '.repeat(400),
      '## FAQ\n\n' + 'faq '.repeat(400),
    ]
    const merged = mergeSegmentParts(parts)
    expect(countBodyWords(merged)).toBeGreaterThanOrEqual(1200)
  })
})
