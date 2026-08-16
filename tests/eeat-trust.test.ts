/**
 * E-E-A-T/Trust module (Subsystem I) — structured parse + malformed fallback,
 * the pure buildEeatActions rules engine, persist mapping, and scoreMaster
 * wiring.
 */
import {
  parseEeatTrustResponse,
  buildEeatActions,
  eeatTrustComposite,
  eeatTrustPersist,
  type EeatTrustResult,
  type EeatLane1,
} from '@/lib/seoFactory/eeatTrust'
import { scoreMaster, computeSignals, type MasterEngineInput } from '@/lib/seoFactory/masterEngine'

function mkResult(over: Partial<EeatTrustResult> = {}): EeatTrustResult {
  return {
    page_url: 'https://legal.yousafeconsultancy.com/uk/graduate-route-visa/',
    subsystem: 'eeat_trust',
    model_used: 'baseten-deepseek:deepseek-ai/DeepSeek-V4-Flash-0731',
    scored_at: new Date().toISOString(),
    variables: [
      { id: 532, name: 'author_expertise_quality', score: 0.4, evidence: 'generic byline, no relevant credential', confidence: 0.8 },
      { id: 540, name: 'sourcing_adequacy', score: 0.45, evidence: 'claims exceed the cited sources', confidence: 0.9 },
      { id: 541, name: 'citation_authority_quality', score: 0.4, evidence: 'secondary summaries instead of primary sources', confidence: 0.7 },
    ],
    trust_gap_summary: {
      missing_signals: ['named reviewer', 'primary-source citations'],
      top_competitor_url: 'https://www.gov.uk/graduate-visa',
      top_competitor_trust_score: 0.85,
    },
    flags: [],
    ...over,
  }
}

describe('parseEeatTrustResponse — structured JSON contract', () => {
  it('parses the JSON contract into scored variables + trust gap summary', () => {
    const json = JSON.stringify({
      variables: [
        { id: 532, name: 'author_expertise_quality', score: 0.55, evidence: 'named solicitor, topic-relevant', confidence: 0.85 },
      ],
      trust_gap_summary: {
        missing_signals: ['named reviewer', 'primary-source citations'],
        top_competitor_url: 'https://www.gov.uk/graduate-visa',
        top_competitor_trust_score: 0.8,
      },
      flags: ['low_trust'],
    })
    const parsed = parseEeatTrustResponse(json)
    expect(parsed.variables).toHaveLength(1)
    expect(parsed.variables[0].score).toBeCloseTo(0.55, 5)
    expect(parsed.trust_gap_summary.missing_signals).toEqual(['named reviewer', 'primary-source citations'])
    expect(parsed.trust_gap_summary.top_competitor_url).toBe('https://www.gov.uk/graduate-visa')
    expect(parsed.flags).toContain('low_trust')
  })

  it('falls back to a flagged empty result on malformed JSON (never throws)', () => {
    const parsed = parseEeatTrustResponse('some prose, not JSON')
    expect(parsed.variables).toEqual([])
    expect(parsed.flags).toContain('malformed_json')
    expect(parsed.trust_gap_summary.missing_signals).toEqual([])
  })
})

describe('buildEeatActions — pure deterministic rules engine', () => {
  const lane1: EeatLane1 = { ymyl: true, disclaimerPresent: false }

  it('missing signals + weak expertise/sourcing/citations + missing disclaimer → prioritized fixes', () => {
    const result = mkResult({ flags: ['low_trust'] })
    const actions = buildEeatActions(result, lane1)
    expect(actions.length).toBeGreaterThanOrEqual(5)
    const text = actions.map((a) => a.action).join(' | ')
    expect(text).toMatch(/named reviewer/)
    expect(text).toMatch(/author byline/)
    expect(text).toMatch(/cited primary source/)
    expect(text).toMatch(/first-party sources/)
    expect(text).toMatch(/not legal advice/)
    const priorities = actions.map((a) => a.priority)
    expect([...priorities].sort((a, b) => b - a)).toEqual(priorities)
  })

  it('sustains when the trust stack clears the consensus', () => {
    const result = mkResult({
      variables: [{ id: 532, name: 'author_expertise_quality', score: 0.9, evidence: 'named expert', confidence: 0.9 }],
      trust_gap_summary: { missing_signals: [], top_competitor_url: null, top_competitor_trust_score: null },
      flags: [],
    })
    const actions = buildEeatActions(result, { ymyl: true, disclaimerPresent: true })
    expect(actions[0].action).toMatch(/Sustain/i)
  })

  it('contains zero LLM calls — pure function of its inputs', () => {
    const result = mkResult()
    expect(buildEeatActions(result, lane1)).toEqual(buildEeatActions(result, lane1))
  })
})

describe('eeatTrustComposite + eeatTrustPersist', () => {
  it('computes a confidence-weighted composite and typed persist columns', () => {
    const result = mkResult()
    const composite = eeatTrustComposite(result)
    expect(composite).toBeGreaterThan(0)
    expect(composite).toBeLessThanOrEqual(1)
    const persisted = eeatTrustPersist(result)
    expect(persisted.eeat_author_expertise_score).toBeCloseTo(0.4, 5)
    expect(persisted.eeat_missing_signals).toEqual(['named reviewer', 'primary-source citations'])
    expect(persisted.eeat_top_competitor).toBe('https://www.gov.uk/graduate-visa')
    expect(persisted.eeat_model_used).toContain('baseten-deepseek')
  })
})

describe('scoreMaster — e_eeat_llm signal + eeat_trust_gap recommendation', () => {
  const base: MasterEngineInput = {
    primaryKeyword: 'uk graduate visa',
    topic: 'uk graduate visa requirements',
    contentType: 'legal_guide',
    content: '# UK Graduate Visa\n\n## Eligibility\n\nA two-year post-study route.\n\n## FAQ\n\n### What is the graduate visa?\n\nA two-year route for graduates.',
  }

  it('lights e_eeat_llm from the module composite', () => {
    const signals = computeSignals({
      ...base,
      eeatTrust: { score: 0.55, confidence: 0.8, missingSignals: ['named reviewer'], topCompetitorUrl: 'https://www.gov.uk/graduate-visa', topCompetitorTrustScore: 0.85 },
    })
    expect(signals.e_eeat_llm).toBeCloseTo(0.55, 5)
  })

  it('leaves e_eeat_llm dark when the module has not run', () => {
    expect(computeSignals({ ...base }).e_eeat_llm).toBeNull()
  })

  it('excludes a low-confidence judgment from the score (below 0.6 floor)', () => {
    const signals = computeSignals({
      ...base,
      eeatTrust: { score: 0.55, confidence: 0.5, missingSignals: [], topCompetitorUrl: null, topCompetitorTrustScore: null },
    })
    expect(signals.e_eeat_llm).toBeNull()
  })

  it('emits eeat_trust_gap naming the top competitor + missing signals', () => {
    const report = scoreMaster({
      ...base,
      eeatTrust: { score: 0.4, confidence: 0.8, missingSignals: ['named reviewer', 'primary-source citations'], topCompetitorUrl: 'https://www.gov.uk/graduate-visa', topCompetitorTrustScore: 0.85 },
    })
    const rec = report.recommendations.find((r) => r.code === 'eeat_trust_gap')
    expect(rec).toBeDefined()
    expect(rec?.action).toMatch(/named reviewer/)
    expect(rec?.evidence).toMatch(/graduate-visa/)
  })

  it('does not emit eeat_trust_gap when the page is on par with the top competitor', () => {
    const report = scoreMaster({
      ...base,
      eeatTrust: { score: 0.9, confidence: 0.9, missingSignals: [], topCompetitorUrl: null, topCompetitorTrustScore: 0.85 },
    })
    expect(report.recommendations.some((r) => r.code === 'eeat_trust_gap')).toBe(false)
  })
})
