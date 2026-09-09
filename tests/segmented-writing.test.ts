import {
  buildSegmentWritePrompt,
  mergeSegmentParts,
  planWriteSegments,
} from '@/lib/seoFactory/segmentedWriting'
import { countBodyWords } from '@/lib/seoFactory/contentDepth'

describe('segmented writing', () => {
  it('plans a coherent first, middle, and final segment', () => {
    const segments = planWriteSegments({ minWords: 3200, segmentCount: 3 })
    expect(segments).toHaveLength(3)
    expect(segments[0].position).toBe('first')
    expect(segments[1].position).toBe('middle')
    expect(segments[2].position).toBe('final')
    expect(segments[0].includeFrontmatter).toBe(true)
    expect(segments[2].includeClosing).toBe(true)
  })

  it('gives every part an explicit measured word window', () => {
    const segments = planWriteSegments({ minWords: 3600, segmentCount: 3 })
    for (const segment of segments) {
      expect(segment.minWords).toBeGreaterThan(0)
      expect(segment.targetWords).toBeGreaterThanOrEqual(segment.minWords)
      expect(segment.maxWords).toBeGreaterThanOrEqual(segment.targetWords)
    }
    expect(segments.reduce((sum, s) => sum + s.minWords, 0)).toBeGreaterThanOrEqual(3600)
  })

  it('builds prompts that prohibit cross-segment duplication', () => {
    const [first, middle, final] = planWriteSegments({ minWords: 3600, segmentCount: 3 })
    const base = {
      title: 'F-1 checklist', topic: 'F-1 checklist', primaryKeyword: 'f1 checklist',
      region: 'US', contentType: 'blog_post', tone: 'educational', minWords: 3600,
      targetWords: 4000, gscBlock: '',
    }
    const firstPrompt = buildSegmentWritePrompt({ ...base, segment: first })
    const middlePrompt = buildSegmentWritePrompt({ ...base, segment: middle })
    const finalPrompt = buildSegmentWritePrompt({ ...base, segment: final })

    expect(firstPrompt).toContain('Do not write sections assigned to other parts')
    expect(firstPrompt).toContain('MEASURED WORD WINDOW FOR THIS PART')
    expect(middlePrompt).not.toContain('Emit YAML front matter')
    expect(finalPrompt).toContain('This part closes the article')
  })

  it('mergeSegmentParts removes repeated front matter and H1 while preserving section bodies', () => {
    const first = `---
title: Test
---
# Test title

Intro.

## Eligibility

First body.`
    const second = `---
title: Duplicate
---
# Duplicate title

## Eligibility

Repeated heading body.

## Costs

Second body.`
    const merged = mergeSegmentParts([first, second])

    expect((merged.match(/^---$/gm) || []).length).toBe(2)
    expect((merged.match(/^# /gm) || []).length).toBe(1)
    expect(merged).toContain('First body.')
    expect(merged).toContain('Repeated heading body.')
    expect(merged).toContain('Second body.')
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

it('a single segment owns both opening and closing material without contradictory omissions', () => {
  const [segment] = planWriteSegments({ minWords: 900, segmentCount: 1 })
  const prompt = buildSegmentWritePrompt({
    title: 'Application checklist', topic: 'Application checklist',
    primaryKeyword: 'application checklist', region: 'US', contentType: 'blog_post',
    tone: 'educational', segment, minWords: 900, targetWords: 1000, gscBlock: '',
  })
  expect(prompt).toContain('This is the complete article')
  expect(prompt).toContain('This part closes the article')
  expect(prompt).toContain('FAQ / FAQPage are not required')
  expect(prompt).not.toContain('Do NOT include the final')
})
