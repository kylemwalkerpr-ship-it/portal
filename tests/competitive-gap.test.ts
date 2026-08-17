/**
 * Competitive Gap module (Subsystem O) — structured parse + malformed fallback,
 * the pure buildCompetitiveActions rules engine, persist mapping, and
 * scoreMaster wiring.
 */
import {
  parseCompetitiveGapResponse,
  buildCompetitiveActions,
  competitiveGapComposite,
  competitiveGapPersist,
  type CompetitiveGapResult,
  type CompetitiveLane1,
} from '@/lib/seoFactory/competitiveGap'
import { scoreMaster, computeSignals, type MasterEngineInput } from '@/lib/seoFactory/masterEngine'

function mkResult(over: Partial<CompetitiveGapResult> = {}): CompetitiveGapResult {
  return {
    page_url: 'https://legal.yousafeconsultancy.com/uk/skilled-worker-visa/',
    subsystem: 'competitive_gap',
    model_used: 'baseten-deepseek:deepseek-ai/DeepSeek-V4-Flash-0731',
    scored_at: new Date().toISOString(),
    variables: [
      { id: 746, name: 'content_comprehensiveness_parity', score: 0.5, evidence: 'covers the core route but misses the fee schedule', confidence: 0.8 },
      { id: 748, name: 'information_gain_edge', score: 0.35, evidence: 're-states what the SERP already says', confidence: 0.85 },
      { id: 762, name: 'overall_competitive_position', score: 0.45, evidence: 'behind the strongest competitor', confidence: 0.75 },
    ],
    competitive_gap_summary: {
      missing_edges: ['official fee schedule', 'worked example for switching employers'],
      top_competitor_url: 'https://www.gov.uk/skilled-worker-visa',
      top_competitor_competitive_score: 0.85,
    },
    flags: [],
    ...over,
  }
}

describe('parseCompetitiveGapResponse — structured JSON contract', () => {
  it('parses the JSON contract into scored variables + competitive gap summary', () => {
    const json = JSON.stringify({
      variables: [
        { id: 746, name: 'content_comprehensiveness_parity', score: 0.6, evidence: 'covers the core route', confidence: 0.85 },
      ],
      competitive_gap_summary: {
        missing_edges: ['official fee schedule'],
        top_competitor_url: 'https://www.gov.uk/skilled-worker-visa',
        top_competitor_competitive_score: 0.8,
      },
      flags: ['lagging_competition'],
    })
    const parsed = parseCompetitiveGapResponse(json)
    expect(parsed.variables).toHaveLength(1)
    expect(parsed.variables[0].score).toBeCloseTo(0.6, 5)
    expect(parsed.competitive_gap_summary.missing_edges).toEqual(['official fee schedule'])
    expect(parsed.competitive_gap_summary.top_competitor_url).toBe('https://www.gov.uk/skilled-worker-visa')
    expect(parsed.competitive_gap_summary.top_competitor_competitive_score).toBeCloseTo(0.8, 5)
    expect(parsed.flags).toContain('lagging_competition')
  })

  it('falls back to a flagged empty result on malformed JSON (never throws)', () => {
    const parsed = parseCompetitiveGapResponse('some prose, not JSON')
    expect(parsed.variables).toEqual([])
    expect(parsed.flags).toContain('malformed_json')
    expect(parsed.competitive_gap_summary.missing_edges).toEqual([])
  })
})

describe('buildCompetitiveActions — pure deterministic rules engine', () => {
  const lane1: CompetitiveLane1 = { competitorCount: 5, authorityScore: 0.4 }

  it('missing edges + weak information gain/serp parity/freshness → prioritized fixes', () => {
    const result = mkResult({
      variables: [
        { id: 748, name: 'information_gain_edge', score: 0.3, evidence: 're-states the SERP', confidence: 0.8 },
        { id: 750, name: 'serp_feature_parity', score: 0.4, evidence: 'competitors own the PAA slots', confidence: 0.7 },
        { id: 754, name: 'freshness_parity', score: 0.4, evidence: 'competitors read more current', confidence: 0.7 },
      ],
      flags: ['lagging_competition'],
    })
    const actions = buildCompetitiveActions(result, lane1)
    expect(actions.length).toBeGreaterThanOrEqual(4)
    const text = actions.map((a) => a.action).join(' | ')
    expect(text).toMatch(/official fee schedule/)
    expect(text).toMatch(/information gain/)
    expect(text).toMatch(/SERP features/)
    expect(text).toMatch(/freshness/i)
    const priorities = actions.map((a) => a.priority)
    expect([...priorities].sort((a, b) => b - a)).toEqual(priorities)
  })

  it('sustains when the page clears the competitive set', () => {
    const result = mkResult({
      variables: [{ id: 762, name: 'overall_competitive_position', score: 0.9, evidence: 'leads the set', confidence: 0.9 }],
      competitive_gap_summary: { missing_edges: [], top_competitor_url: null, top_competitor_competitive_score: null },
      flags: [],
    })
    const actions = buildCompetitiveActions(result, lane1)
    expect(actions[0].action).toMatch(/Sustain/i)
  })

  it('contains zero LLM calls — pure function of its inputs', () => {
    const result = mkResult()
    expect(buildCompetitiveActions(result, lane1)).toEqual(buildCompetitiveActions(result, lane1))
  })
})

describe('competitiveGapComposite + competitiveGapPersist', () => {
  it('computes a confidence-weighted composite and typed persist columns', () => {
    const result = mkResult()
    const composite = competitiveGapComposite(result)
    expect(composite).toBeGreaterThan(0)
    expect(composite).toBeLessThanOrEqual(1)
    const persisted = competitiveGapPersist(result)
    expect(persisted.competitive_overall_position).toBeCloseTo(0.45, 5)
    expect(persisted.competitive_missing_edges).toEqual(['official fee schedule', 'worked example for switching employers'])
    expect(persisted.competitive_top_competitor).toBe('https://www.gov.uk/skilled-worker-visa')
    expect(persisted.competitive_model_used).toContain('baseten-deepseek')
  })
})

describe('scoreMaster — o_competitive_llm signal + competitive_gap recommendation', () => {
  const base: MasterEngineInput = {
    primaryKeyword: 'uk skilled worker visa',
    topic: 'uk skilled worker visa requirements',
    contentType: 'legal_guide',
    content: '# UK Skilled Worker Visa\n\n## Eligibility\n\nA points-based work route.\n\n## FAQ\n\n### What is the skilled worker visa?\n\nA points-based route for sponsored employment.',
  }

  it('lights o_competitive_llm from the module composite', () => {
    const signals = computeSignals({
      ...base,
      competitiveGap: { score: 0.55, confidence: 0.8, missingEdges: ['official fee schedule'], topCompetitorUrl: 'https://www.gov.uk/skilled-worker-visa', topCompetitorCompetitiveScore: 0.85 },
    })
    expect(signals.o_competitive_llm).toBeCloseTo(0.55, 5)
  })

  it('leaves o_competitive_llm dark when the module has not run', () => {
    expect(computeSignals({ ...base }).o_competitive_llm).toBeNull()
  })

  it('excludes a low-confidence judgment from the score (below 0.6 floor)', () => {
    const signals = computeSignals({
      ...base,
      competitiveGap: { score: 0.55, confidence: 0.5, missingEdges: [], topCompetitorUrl: null, topCompetitorCompetitiveScore: null },
    })
    expect(signals.o_competitive_llm).toBeNull()
  })

  it('emits competitive_gap naming the top competitor + missing edges', () => {
    const report = scoreMaster({
      ...base,
      competitiveGap: { score: 0.4, confidence: 0.8, missingEdges: ['official fee schedule', 'worked example'], topCompetitorUrl: 'https://www.gov.uk/skilled-worker-visa', topCompetitorCompetitiveScore: 0.85 },
    })
    const rec = report.recommendations.find((r) => r.code === 'competitive_gap')
    expect(rec).toBeDefined()
    expect(rec?.subsystem).toBe('serp')
    expect(rec?.action).toMatch(/official fee schedule/)
    expect(rec?.evidence).toMatch(/skilled-worker-visa/)
  })

  it('does not emit competitive_gap when the page is on par with the top competitor', () => {
    const report = scoreMaster({
      ...base,
      competitiveGap: { score: 0.9, confidence: 0.9, missingEdges: [], topCompetitorUrl: null, topCompetitorCompetitiveScore: 0.85 },
    })
    expect(report.recommendations.some((r) => r.code === 'competitive_gap')).toBe(false)
  })
})
