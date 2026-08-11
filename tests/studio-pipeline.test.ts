import {
  DISSERTATION_STAGES,
  LEGACY_STAGE_ALIASES,
  isStageAtOrBefore,
  isStudioStage,
  nearestAvailableStage,
  resolveStudioStage,
  stageIndex,
  transferCompetingWinner,
} from '@/lib/seoFactory/studioPipeline'

describe('studioPipeline · discover → configure order', () => {
  it('starts with Discover and ends with Configure (draft+review, approve+track merged)', () => {
    expect(DISSERTATION_STAGES).toEqual([
      'discover', 'research', 'draft', 'approve', 'configure',
    ])
    expect(DISSERTATION_STAGES[0]).toBe('discover')
    expect(DISSERTATION_STAGES.at(-1)).toBe('configure')
  })

  it('keeps every legacy entry point attached to the correct stage', () => {
    expect(LEGACY_STAGE_ALIASES).toMatchObject({
      identify: 'discover', insights: 'discover', survey: 'discover', operations: 'discover',
      define: 'research', investigate: 'research',
      create: 'research', brief: 'research', plan: 'research', question: 'research',
      write: 'draft', pipeline: 'draft', queue: 'draft',
      defend: 'draft',
      review: 'draft',
      publish: 'approve',
      track: 'approve',
    })
    for (const [legacy, canonical] of Object.entries(LEGACY_STAGE_ALIASES)) {
      expect(resolveStudioStage(legacy)).toBe(canonical)
    }
  })

  it('defaults unknown or missing URLs to the discover stage', () => {
    expect(resolveStudioStage(null)).toBe('discover')
    expect(resolveStudioStage(undefined)).toBe('discover')
    expect(resolveStudioStage('not-a-stage')).toBe('discover')
  })

  it('recognizes only canonical stages as studio stages', () => {
    expect(isStudioStage('discover')).toBe(true)
    expect(isStudioStage('track')).toBe(false)
    expect(isStudioStage('draft')).toBe(true)
    expect(isStudioStage('configure')).toBe(true)
    expect(isStudioStage('research')).toBe(true)
    expect(isStudioStage('insights')).toBe(false)
    expect(isStudioStage(null)).toBe(false)
  })

  it('provides monotonic stage indexes for readiness guards', () => {
    expect(stageIndex('discover')).toBe(0)
    expect(stageIndex('draft')).toBe(2)
    expect(stageIndex('approve')).toBe(3)
    expect(stageIndex('configure')).toBe(4)
    expect(stageIndex('research')).toBeLessThan(stageIndex('draft'))
    expect(isStageAtOrBefore('research', 'draft')).toBe(true)
    expect(isStageAtOrBefore('configure', 'approve')).toBe(false)
  })

  it('falls back to the nearest available prerequisite, not an unrelated tab', () => {
    expect(nearestAvailableStage('approve', { discover: true, research: true, draft: true, approve: false })).toBe('draft')
    expect(nearestAvailableStage('approve', { discover: true, research: true, draft: false, approve: false })).toBe('research')
    expect(nearestAvailableStage('discover', { discover: true })).toBe('discover')
  })

  it('transfers a prior competing-page winner into the loser set safely', () => {
    const selection = transferCompetingWinner('https://example.com/old', 'https://example.com/new', new Set(['https://example.com/other']))
    expect(selection.winner).toBe('https://example.com/new')
    expect([...selection.losers]).toEqual(expect.arrayContaining([
      'https://example.com/old',
      'https://example.com/other',
    ]))
    expect(selection.losers.has('https://example.com/new')).toBe(false)
  })
})
