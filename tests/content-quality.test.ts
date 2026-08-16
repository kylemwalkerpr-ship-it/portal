/**
 * Content Quality module (Subsystem A) — structured parse + malformed fallback,
 * the pure buildContentActions rules engine, and scoreMaster wiring.
 */
import {
  parseContentQualityResponse,
  buildContentActions,
  contentQualityComposite,
  contentQualityPersist,
  type ContentQualityResult,
  type ContentLane1,
} from '@/lib/seoFactory/contentQuality'
import { scoreMaster, computeSignals, type MasterEngineInput } from '@/lib/seoFactory/masterEngine'

function mkResult(over: Partial<ContentQualityResult> = {}): ContentQualityResult {
  return {
    page_url: 'https://legal.yousafeconsultancy.com/uk/graduate-route-visa/',
    subsystem: 'content_quality',
    model_used: 'baseten-deepseek:deepseek-ai/DeepSeek-V4-Flash-0731',
    scored_at: new Date().toISOString(),
    variables: [
      { id: 24, name: 'content_depth_score', score: 0.4, evidence: 'shorter than the top 3', confidence: 0.8 },
      { id: 42, name: 'intent_match_score', score: 0.35, evidence: 'no direct answer up front', confidence: 0.9 },
      { id: 55, name: 'cannibalization_safety', score: 0.3, evidence: 'sibling targets same intent', confidence: 0.7 },
    ],
    content_gap_summary: {
      missing_subtopics: ['cost table', 'processing times'],
      top_competitor_url: 'https://www.gov.uk/graduate-visa',
      top_competitor_depth_score: 0.85,
    },
    flags: [],
    ...over,
  }
}

describe('parseContentQualityResponse — structured JSON contract', () => {
  it('parses the JSON contract into scored variables + gap summary', () => {
    const json = JSON.stringify({
      variables: [
        { id: 24, name: 'content_depth_score', score: 0.55, evidence: 'covers eligibility but not fees', confidence: 0.85 },
        { id: 42, name: 'intent_match_score', score: 0.7, evidence: 'answers the query in the first paragraph', confidence: 0.9 },
      ],
      content_gap_summary: {
        missing_subtopics: ['fees', 'timeline'],
        top_competitor_url: 'https://www.gov.uk/graduate-visa',
        top_competitor_depth_score: 0.8,
      },
      flags: ['thin_content_risk'],
    })
    const parsed = parseContentQualityResponse(json)
    expect(parsed.variables).toHaveLength(2)
    expect(parsed.variables[0].score).toBeCloseTo(0.55, 5)
    expect(parsed.variables[0].confidence).toBeCloseTo(0.85, 5)
    expect(parsed.content_gap_summary.missing_subtopics).toEqual(['fees', 'timeline'])
    expect(parsed.content_gap_summary.top_competitor_url).toBe('https://www.gov.uk/graduate-visa')
    expect(parsed.flags).toContain('thin_content_risk')
  })

  it('falls back to a flagged empty result on malformed JSON (never throws)', () => {
    const parsed = parseContentQualityResponse('here is some prose, not JSON')
    expect(parsed.variables).toEqual([])
    expect(parsed.flags).toContain('malformed_json')
    expect(parsed.content_gap_summary.missing_subtopics).toEqual([])
  })
})

describe('buildContentActions — pure deterministic rules engine', () => {
  const lane1: ContentLane1 = {
    targetWordCount: 900,
    medianCompetitorWordCount: 1600,
    detectedIntent: 'procedural',
    competingInternalUrls: ['https://legal.yousafeconsultancy.com/uk/graduate-route-visa-old/'],
  }

  it('thin + missing subtopics + intent mismatch + cannibalization → four prioritized fixes', () => {
    const result = mkResult({ flags: ['thin_content_risk', 'cannibalization_risk'] })
    const actions = buildContentActions(result, lane1)
    expect(actions.length).toBeGreaterThanOrEqual(4)
    const text = actions.map((a) => a.action).join(' | ')
    expect(text).toMatch(/Expand to at least 1600 words \(\+700/)
    expect(text).toMatch(/cost table/)
    expect(text).toMatch(/procedural intent/)
    expect(text).toMatch(/graduate-route-visa-old/)
    // Sorted highest priority first.
    const priorities = actions.map((a) => a.priority)
    expect([...priorities].sort((a, b) => b - a)).toEqual(priorities)
  })

  it('sustains when the page clears the consensus', () => {
    const result = mkResult({
      variables: [{ id: 24, name: 'content_depth_score', score: 0.9, evidence: 'comprehensive', confidence: 0.9 }],
      content_gap_summary: { missing_subtopics: [], top_competitor_url: null, top_competitor_depth_score: null },
      flags: [],
    })
    const actions = buildContentActions(result, { targetWordCount: 2000, medianCompetitorWordCount: 1500, detectedIntent: null, competingInternalUrls: [] })
    expect(actions[0].action).toMatch(/Sustain/i)
  })

  it('contains zero LLM calls — it is a pure function of its inputs', () => {
    // Two calls with identical inputs must produce identical output (no hidden
    // side effects / network). A stray LLM call would make this nondeterministic.
    const result = mkResult()
    expect(buildContentActions(result, lane1)).toEqual(buildContentActions(result, lane1))
  })
})

describe('contentQualityComposite + contentQualityPersist', () => {
  it('computes a confidence-weighted composite and typed persist columns', () => {
    const result = mkResult()
    const composite = contentQualityComposite(result)
    expect(composite).toBeGreaterThan(0)
    expect(composite).toBeLessThanOrEqual(1)
    const persisted = contentQualityPersist(result)
    expect(persisted.content_depth_score).toBeCloseTo(0.4, 5)
    expect(persisted.content_gap_missing_subtopics).toEqual(['cost table', 'processing times'])
    expect(persisted.content_top_competitor).toBe('https://www.gov.uk/graduate-visa')
    expect(persisted.content_model_used).toContain('baseten-deepseek')
  })
})

describe('scoreMaster — c_quality_llm signal + content_depth_gap recommendation', () => {
  const base: MasterEngineInput = {
    primaryKeyword: 'uk graduate visa',
    topic: 'uk graduate visa requirements',
    contentType: 'legal_guide',
    content: '# UK Graduate Visa\n\n## Eligibility\n\nA two-year post-study route.\n\n## FAQ\n\n### What is the graduate visa?\n\nA two-year route for graduates.',
  }

  it('lights c_quality_llm from the module composite', () => {
    const signals = computeSignals({ ...base, contentQuality: { score: 0.55, confidence: 0.8, missingSubtopics: ['fees'], topCompetitorUrl: 'https://www.gov.uk/graduate-visa', topCompetitorDepthScore: 0.85 } })
    expect(signals.c_quality_llm).toBeCloseTo(0.55, 5)
  })

  it('leaves c_quality_llm dark when the module has not run', () => {
    expect(computeSignals({ ...base }).c_quality_llm).toBeNull()
  })

  it('excludes a low-confidence judgment from the score (below 0.6 floor)', () => {
    // Below LLM_CONFIDENCE_FLOOR → the signal stays dark so it cannot leak a
    // weak LLM score into the subsystem composite / regression training.
    const signals = computeSignals({
      ...base,
      contentQuality: { score: 0.55, confidence: 0.5, missingSubtopics: ['fees'], topCompetitorUrl: null, topCompetitorDepthScore: null },
    })
    expect(signals.c_quality_llm).toBeNull()
  })

  it('emits content_depth_gap naming the top competitor + missing subtopics', () => {
    const report = scoreMaster({
      ...base,
      contentQuality: { score: 0.4, confidence: 0.8, missingSubtopics: ['cost table', 'processing times'], topCompetitorUrl: 'https://www.gov.uk/graduate-visa', topCompetitorDepthScore: 0.85 },
    })
    const rec = report.recommendations.find((r) => r.code === 'content_depth_gap')
    expect(rec).toBeDefined()
    expect(rec?.action).toMatch(/cost table/)
    expect(rec?.evidence).toMatch(/graduate-visa/)
  })

  it('does not emit content_depth_gap when the page is on par with the top competitor', () => {
    const report = scoreMaster({
      ...base,
      contentQuality: { score: 0.9, confidence: 0.9, missingSubtopics: [], topCompetitorUrl: null, topCompetitorDepthScore: 0.85 },
    })
    expect(report.recommendations.some((r) => r.code === 'content_depth_gap')).toBe(false)
  })
})
