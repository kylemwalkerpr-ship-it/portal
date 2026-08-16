/**
 * Semantic/NLP module (Subsystem H) — structured parse + embedding-verified
 * confidence cap, malformed fallback, the pure buildSemanticActions rules
 * engine, and scoreMaster wiring.
 */
import {
  parseSemanticNlpResponse,
  buildSemanticActions,
  semanticNlpComposite,
  semanticNlpPersist,
  type SemanticNlpResult,
  type SemanticLane1,
} from '@/lib/seoFactory/semanticNlp'
import { scoreMaster, computeSignals, type MasterEngineInput } from '@/lib/seoFactory/masterEngine'

function mkResult(over: Partial<SemanticNlpResult> = {}): SemanticNlpResult {
  return {
    page_url: 'https://legal.yousafeconsultancy.com/uk/graduate-route-visa/',
    subsystem: 'semantic_nlp',
    model_used: 'baseten-deepseek:deepseek-ai/DeepSeek-V4-Flash-0731',
    scored_at: new Date().toISOString(),
    variables: [
      { id: 466, name: 'topical_authority_breadth', score: 0.35, evidence: 'covers eligibility but not fees', confidence: 0.8, embedding_verified: false },
      { id: 486, name: 'answer_completeness_score', score: 0.4, evidence: 'no direct answer up front', confidence: 0.9, embedding_verified: false },
      { id: 461, name: 'named_entity_coverage', score: 0.5, evidence: 'names the route but not the key forms', confidence: 0.7, embedding_verified: false },
    ],
    entity_gap_summary: {
      missing_entities: ['Student visa', 'Confirmation of Acceptance for Studies'],
      top_competitor_url: 'https://www.gov.uk/graduate-visa',
      top_competitor_entity_coverage: 0.85,
    },
    flags: [],
    ...over,
  }
}

describe('parseSemanticNlpResponse — structured JSON contract + embedding cap', () => {
  it('parses the JSON contract into scored variables + entity gap summary', () => {
    const json = JSON.stringify({
      variables: [
        { id: 466, name: 'topical_authority_breadth', score: 0.55, evidence: 'covers eligibility but not fees', confidence: 0.85, embedding_verified: false },
      ],
      entity_gap_summary: {
        missing_entities: ['Student visa', 'CAS'],
        top_competitor_url: 'https://www.gov.uk/graduate-visa',
        top_competitor_entity_coverage: 0.8,
      },
      flags: ['low_entity_coverage'],
    })
    const parsed = parseSemanticNlpResponse(json)
    expect(parsed.variables).toHaveLength(1)
    expect(parsed.variables[0].score).toBeCloseTo(0.55, 5)
    expect(parsed.entity_gap_summary.missing_entities).toEqual(['Student visa', 'CAS'])
    expect(parsed.entity_gap_summary.top_competitor_url).toBe('https://www.gov.uk/graduate-visa')
    expect(parsed.flags).toContain('low_entity_coverage')
  })

  it('caps text-only confidence at 0.7 when no embedding is supplied', () => {
    const json = JSON.stringify({
      variables: [
        { id: 466, name: 'topical_authority_breadth', score: 0.55, evidence: 'x', confidence: 0.95, embedding_verified: true },
      ],
      entity_gap_summary: { missing_entities: [], top_competitor_url: null, top_competitor_entity_coverage: null },
      flags: [],
    })
    // No Lane-1 embeddings passed → the model's `embedding_verified:true` is
    // ignored and confidence is deterministically capped.
    const parsed = parseSemanticNlpResponse(json)
    expect(parsed.variables[0].embedding_verified).toBe(false)
    expect(parsed.variables[0].confidence).toBeCloseTo(0.7, 5)
  })

  it('preserves full confidence and marks verified when the embedding exists', () => {
    const json = JSON.stringify({
      variables: [
        { id: 466, name: 'topical_authority_breadth', score: 0.55, evidence: 'x', confidence: 0.95, embedding_verified: false },
      ],
      entity_gap_summary: { missing_entities: [], top_competitor_url: null, top_competitor_entity_coverage: null },
      flags: [],
    })
    const parsed = parseSemanticNlpResponse(json, { topical_authority_breadth: 0.62 })
    expect(parsed.variables[0].embedding_verified).toBe(true)
    expect(parsed.variables[0].confidence).toBeCloseTo(0.95, 5)
  })

  it('falls back to a flagged empty result on malformed JSON (never throws)', () => {
    const parsed = parseSemanticNlpResponse('some prose, not JSON')
    expect(parsed.variables).toEqual([])
    expect(parsed.flags).toContain('malformed_json')
    expect(parsed.entity_gap_summary.missing_entities).toEqual([])
  })
})

describe('buildSemanticActions — pure deterministic rules engine', () => {
  const lane1: SemanticLane1 = { questionIntent: true }

  it('missing entities + low breadth + weak answer → three prioritized fixes', () => {
    const result = mkResult({ flags: ['low_entity_coverage'] })
    const actions = buildSemanticActions(result, lane1)
    expect(actions.length).toBeGreaterThanOrEqual(3)
    const text = actions.map((a) => a.action).join(' | ')
    expect(text).toMatch(/Student visa/)
    expect(text).toMatch(/Broaden topical authority/)
    expect(text).toMatch(/direct-answer format/)
    const priorities = actions.map((a) => a.priority)
    expect([...priorities].sort((a, b) => b - a)).toEqual(priorities)
  })

  it('sustains when entity coverage clears the consensus', () => {
    const result = mkResult({
      variables: [{ id: 466, name: 'topical_authority_breadth', score: 0.9, evidence: 'comprehensive', confidence: 0.9, embedding_verified: false }],
      entity_gap_summary: { missing_entities: [], top_competitor_url: null, top_competitor_entity_coverage: null },
      flags: [],
    })
    const actions = buildSemanticActions(result, { questionIntent: true })
    expect(actions[0].action).toMatch(/Sustain/i)
  })

  it('contains zero LLM calls — pure function of its inputs', () => {
    const result = mkResult()
    expect(buildSemanticActions(result, lane1)).toEqual(buildSemanticActions(result, lane1))
  })
})

describe('semanticNlpComposite + semanticNlpPersist', () => {
  it('computes a confidence-weighted composite and typed persist columns', () => {
    const result = mkResult()
    const composite = semanticNlpComposite(result)
    expect(composite).toBeGreaterThan(0)
    expect(composite).toBeLessThanOrEqual(1)
    const persisted = semanticNlpPersist(result)
    expect(persisted.semantic_topical_breadth_score).toBeCloseTo(0.35, 5)
    expect(persisted.semantic_missing_entities).toEqual(['Student visa', 'Confirmation of Acceptance for Studies'])
    expect(persisted.semantic_top_competitor).toBe('https://www.gov.uk/graduate-visa')
    expect(persisted.semantic_model_used).toContain('baseten-deepseek')
  })

  it('passes the text_only_judgment flag through to the persist columns (panel visibility)', () => {
    const persisted = semanticNlpPersist(mkResult({ flags: ['text_only_judgment'] }))
    expect(persisted.semantic_flags).toContain('text_only_judgment')
  })
})

describe('scoreMaster — s_coverage_llm signal + semantic_coverage_gap recommendation', () => {
  const base: MasterEngineInput = {
    primaryKeyword: 'uk graduate visa',
    topic: 'uk graduate visa requirements',
    contentType: 'legal_guide',
    content: '# UK Graduate Visa\n\n## Eligibility\n\nA two-year post-study route.\n\n## FAQ\n\n### What is the graduate visa?\n\nA two-year route for graduates.',
  }

  it('lights s_coverage_llm from the module composite', () => {
    const signals = computeSignals({
      ...base,
      semanticNlp: { score: 0.55, confidence: 0.8, missingEntities: ['Student visa'], topCompetitorUrl: 'https://www.gov.uk/graduate-visa', topCompetitorEntityCoverage: 0.85 },
    })
    expect(signals.s_coverage_llm).toBeCloseTo(0.55, 5)
  })

  it('leaves s_coverage_llm dark when the module has not run', () => {
    expect(computeSignals({ ...base }).s_coverage_llm).toBeNull()
  })

  it('excludes a low-confidence judgment from the score (below 0.6 floor)', () => {
    const signals = computeSignals({
      ...base,
      semanticNlp: { score: 0.55, confidence: 0.5, missingEntities: ['Student visa'], topCompetitorUrl: null, topCompetitorEntityCoverage: null },
    })
    expect(signals.s_coverage_llm).toBeNull()
  })

  it('emits semantic_coverage_gap naming the top competitor + missing entities', () => {
    const report = scoreMaster({
      ...base,
      semanticNlp: { score: 0.4, confidence: 0.8, missingEntities: ['Student visa', 'CAS'], topCompetitorUrl: 'https://www.gov.uk/graduate-visa', topCompetitorEntityCoverage: 0.85 },
    })
    const rec = report.recommendations.find((r) => r.code === 'semantic_coverage_gap')
    expect(rec).toBeDefined()
    expect(rec?.action).toMatch(/Student visa/)
    expect(rec?.evidence).toMatch(/graduate-visa/)
  })

  it('does not emit semantic_coverage_gap when the page is on par with the top competitor', () => {
    const report = scoreMaster({
      ...base,
      semanticNlp: { score: 0.9, confidence: 0.9, missingEntities: [], topCompetitorUrl: null, topCompetitorEntityCoverage: 0.85 },
    })
    expect(report.recommendations.some((r) => r.code === 'semantic_coverage_gap')).toBe(false)
  })
})
