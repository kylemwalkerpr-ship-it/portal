/**
 * Ranking-model guidance → generation prompt.
 * Locks that recommendedActions + forecast from the ranking model reach the
 * AI brief (modelGuidanceBlock) and that buildFactoryUserPrompt renders them
 * only when provided.
 */
import { buildFactoryUserPrompt, modelGuidanceBlock, type ModelGuidanceInput } from '@/lib/seoFactory/prompts'

const basePromptOpts = {
  title: 'H-1B visa explained',
  topic: 'H-1B visa',
  primaryKeyword: 'h-1b visa requirements',
  region: 'US',
  contentType: 'legal_guide',
  tone: 'educational',
  gscBlock: 'GSC: 1,200 impressions · #14 position',
}

const guidance: ModelGuidanceInput = {
  total: 58,
  confidence: 0.5,
  recommendedActions: [
    'Add answer capsule + FAQ block + stats panel (AEO/GEO)',
    'Add named author credentials, gov citations, YMYL disclaimer',
    'Depth pass — target 1,800–3,500 words with fan-out sub-sections',
  ],
  forecast: {
    points: [
      { horizonDays: 30, projectedPosition: 12, projectedImpressions: 1500, projectedClicks: 60, probabilityOfTop10: 0.1 },
      { horizonDays: 60, projectedPosition: 9, projectedImpressions: 1900, projectedClicks: 95, probabilityOfTop10: 0.42 },
      { horizonDays: 90, projectedPosition: 7, projectedImpressions: 2400, projectedClicks: 140, probabilityOfTop10: 0.65 },
    ],
  },
}

describe('modelGuidanceBlock', () => {
  it('renders the score, every recommended action, and the forecast chain', () => {
    const block = modelGuidanceBlock(guidance)
    expect(block).toMatch(/RANKING MODEL GUIDANCE/)
    expect(block).toMatch(/Model total: 58\/100 · confidence 50%/)
    expect(block).toMatch(/answer capsule \+ FAQ block/)
    expect(block).toMatch(/named author credentials/)
    expect(block).toMatch(/Depth pass/)
    expect(block).toMatch(/#12 \(30d\) → #9 \(60d\) → #7 \(90d\)/)
    expect(block).toMatch(/top-10 probability 65% at 90d/)
    expect(block).toMatch(/Weak-family rule/)
  })

  it('caps actions at 6 and stays deterministic', () => {
    const many: ModelGuidanceInput = {
      recommendedActions: Array.from({ length: 9 }, (_, i) => `action ${i + 1}`),
    }
    const block = modelGuidanceBlock(many)
    expect(block.match(/· action \d+/g)).toHaveLength(6)
    expect(modelGuidanceBlock(many)).toBe(block)
  })

  it('omits the forecast line when no points are supplied', () => {
    const block = modelGuidanceBlock({ total: 40, recommendedActions: ['Fix canonical'] })
    expect(block).toMatch(/Model total: 40\/100/)
    expect(block).toMatch(/Fix canonical/)
    expect(block).not.toMatch(/projected position/)
  })

  it('handles a single forecast point (partial data) without crashing', () => {
    const block = modelGuidanceBlock({
      forecast: { points: [{ horizonDays: 90, projectedPosition: 6, probabilityOfTop10: 0.7 }] },
    })
    expect(block).toMatch(/#6 \(90d\)/)
    expect(block).toMatch(/top-10 probability 70% at 90d/)
  })
})

describe('buildFactoryUserPrompt · model guidance threading', () => {
  it('renders the guidance block when modelGuidance is provided', () => {
    const prompt = buildFactoryUserPrompt({ ...basePromptOpts, modelGuidance: guidance })
    expect(prompt).toMatch(/RANKING MODEL GUIDANCE/)
    expect(prompt).toMatch(/h-1b visa requirements/i)
  })

  it('is absent when modelGuidance is not provided', () => {
    const prompt = buildFactoryUserPrompt({ ...basePromptOpts })
    expect(prompt).not.toMatch(/RANKING MODEL GUIDANCE/)
    expect(prompt).not.toMatch(/Weak-family rule/)
  })

  it('keeps model guidance across a refine pass', () => {
    const prompt = buildFactoryUserPrompt({ ...basePromptOpts, refineNotes: 'Fix depth blocker', modelGuidance: guidance })
    expect(prompt).toMatch(/REVISION REQUIRED/)
    expect(prompt).toMatch(/RANKING MODEL GUIDANCE/)
  })

  it('carries the current draft into a refine pass so fixes accumulate (no blind regeneration)', () => {
    const draft = '# H-1B visa\n\n## Eligibility\n\nApplicants must meet the specialty occupation standard.'
    const prompt = buildFactoryUserPrompt({
      ...basePromptOpts,
      refineNotes: 'BLOCKER: ai_slop — remove machine phrasing. BLOCKER: missing_disclaimer — add the disclaimer.',
      draft,
    })
    expect(prompt).toMatch(/REVISION REQUIRED/)
    expect(prompt).toMatch(/EXISTING DRAFT — REVISE, DO NOT REWRITE FROM SCRATCH/)
    // The draft body is included so the model edits the real text instead of
    // regenerating from scratch and re-introducing the same blockers.
    expect(prompt).toContain(draft)
    // Sanity: the factory brief is still present alongside the revision contract.
    expect(prompt).toMatch(/Primary keyword \(must appear naturally in title \+ first H2\)/)
  })

  it('omits the draft block when there is no existing draft (first pass)', () => {
    const prompt = buildFactoryUserPrompt({ ...basePromptOpts, refineNotes: 'Fix depth' })
    expect(prompt).not.toMatch(/EXISTING DRAFT/)
  })
})
