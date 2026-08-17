/**
 * Local SEO module (Subsystem J) — structured parse + malformed fallback,
 * the pure buildLocalActions rules engine, persist mapping, and scoreMaster
 * wiring.
 */
import {
  parseLocalSeoResponse,
  buildLocalActions,
  localSeoComposite,
  localSeoPersist,
  type LocalSeoResult,
  type LocalLane1,
} from '@/lib/seoFactory/localSeo'
import { scoreMaster, computeSignals, type MasterEngineInput } from '@/lib/seoFactory/masterEngine'

function mkResult(over: Partial<LocalSeoResult> = {}): LocalSeoResult {
  return {
    page_url: 'https://legal.yousafeconsultancy.com/us/h1b-visa-dallas/',
    subsystem: 'local_seo',
    model_used: 'baseten-deepseek:deepseek-ai/DeepSeek-V4-Flash-0731',
    scored_at: new Date().toISOString(),
    variables: [
      { id: 576, name: 'gbp_completeness', score: 0.4, evidence: 'profile exists but missing review signals', confidence: 0.8 },
      { id: 584, name: 'nap_consistency', score: 0.35, evidence: 'address differs across the page and footer', confidence: 0.85 },
      { id: 591, name: 'regional_content_depth', score: 0.4, evidence: 'no Dallas-specific processing office content', confidence: 0.75 },
    ],
    local_gap_summary: {
      missing_local_signals: ['verified Google Business Profile', 'Dallas-specific processing office content'],
      top_competitor_url: 'https://www.dallasimmigrationlaw.com/h1b',
      top_competitor_local_score: 0.85,
    },
    flags: [],
    ...over,
  }
}

describe('parseLocalSeoResponse — structured JSON contract', () => {
  it('parses the JSON contract into scored variables + local gap summary', () => {
    const json = JSON.stringify({
      variables: [
        { id: 576, name: 'gbp_completeness', score: 0.6, evidence: 'complete profile', confidence: 0.85 },
      ],
      local_gap_summary: {
        missing_local_signals: ['verified Google Business Profile'],
        top_competitor_url: 'https://www.dallasimmigrationlaw.com/h1b',
        top_competitor_local_score: 0.8,
      },
      flags: ['weak_local_presence'],
    })
    const parsed = parseLocalSeoResponse(json)
    expect(parsed.variables).toHaveLength(1)
    expect(parsed.variables[0].score).toBeCloseTo(0.6, 5)
    expect(parsed.local_gap_summary.missing_local_signals).toEqual(['verified Google Business Profile'])
    expect(parsed.local_gap_summary.top_competitor_url).toBe('https://www.dallasimmigrationlaw.com/h1b')
    expect(parsed.local_gap_summary.top_competitor_local_score).toBeCloseTo(0.8, 5)
    expect(parsed.flags).toContain('weak_local_presence')
  })

  it('falls back to a flagged empty result on malformed JSON (never throws)', () => {
    const parsed = parseLocalSeoResponse('some prose, not JSON')
    expect(parsed.variables).toEqual([])
    expect(parsed.flags).toContain('malformed_json')
    expect(parsed.local_gap_summary.missing_local_signals).toEqual([])
  })
})

describe('buildLocalActions — pure deterministic rules engine', () => {
  const lane1: LocalLane1 = { region: 'US', hasContactInfo: false }

  it('missing signals + weak NAP/regional/schema + no contact info → prioritized fixes', () => {
    const result = mkResult({
      variables: [
        { id: 584, name: 'nap_consistency', score: 0.3, evidence: 'inconsistent NAP', confidence: 0.8 },
        { id: 591, name: 'regional_content_depth', score: 0.35, evidence: 'generic', confidence: 0.8 },
        { id: 592, name: 'local_business_schema', score: 0.3, evidence: 'no LocalBusiness markup', confidence: 0.7 },
      ],
      flags: ['weak_local_presence'],
    })
    const actions = buildLocalActions(result, lane1)
    expect(actions.length).toBeGreaterThanOrEqual(5)
    const text = actions.map((a) => a.action).join(' | ')
    expect(text).toMatch(/verified Google Business Profile/)
    expect(text).toMatch(/NAP/i)
    expect(text).toMatch(/US-specific content/i)
    expect(text).toMatch(/LocalBusiness JSON-LD/)
    expect(text).toMatch(/contact block/)
    const priorities = actions.map((a) => a.priority)
    expect([...priorities].sort((a, b) => b - a)).toEqual(priorities)
  })

  it('sustains when the local-visibility stack clears the consensus', () => {
    const result = mkResult({
      variables: [{ id: 576, name: 'gbp_completeness', score: 0.9, evidence: 'fully built out', confidence: 0.9 }],
      local_gap_summary: { missing_local_signals: [], top_competitor_url: null, top_competitor_local_score: null },
      flags: [],
    })
    const actions = buildLocalActions(result, { region: 'US', hasContactInfo: true })
    expect(actions[0].action).toMatch(/Sustain/i)
  })

  it('contains zero LLM calls — pure function of its inputs', () => {
    const result = mkResult()
    expect(buildLocalActions(result, lane1)).toEqual(buildLocalActions(result, lane1))
  })
})

describe('localSeoComposite + localSeoPersist', () => {
  it('computes a confidence-weighted composite and typed persist columns', () => {
    const result = mkResult()
    const composite = localSeoComposite(result)
    expect(composite).toBeGreaterThan(0)
    expect(composite).toBeLessThanOrEqual(1)
    const persisted = localSeoPersist(result)
    expect(persisted.local_score).toBeGreaterThan(0)
    expect(persisted.local_gbp_score).toBeCloseTo(0.4, 5)
    expect(persisted.local_nap_consistency_score).toBeCloseTo(0.35, 5)
    expect(persisted.local_missing_signals).toEqual(['verified Google Business Profile', 'Dallas-specific processing office content'])
    expect(persisted.local_top_competitor).toBe('https://www.dallasimmigrationlaw.com/h1b')
    expect(persisted.local_model_used).toContain('baseten-deepseek')
  })
})

describe('scoreMaster — e_local_llm signal + local_seo_gap recommendation', () => {
  const base: MasterEngineInput = {
    primaryKeyword: 'h1b visa dallas',
    topic: 'h1b visa lawyer dallas texas',
    contentType: 'legal_guide',
    content: '# H-1B Visa in Dallas\n\n## Eligibility\n\nA specialty occupation route.\n\n## FAQ\n\n### What is the H-1B visa?\n\nA specialty occupation route for professionals.',
  }

  it('lights e_local_llm from the module composite', () => {
    const signals = computeSignals({
      ...base,
      localSeo: { score: 0.55, confidence: 0.8, missingSignals: ['verified Google Business Profile'], topCompetitorUrl: 'https://www.dallasimmigrationlaw.com/h1b', topCompetitorLocalScore: 0.85 },
    })
    expect(signals.e_local_llm).toBeCloseTo(0.55, 5)
  })

  it('leaves e_local_llm dark when the module has not run', () => {
    expect(computeSignals({ ...base }).e_local_llm).toBeNull()
  })

  it('excludes a low-confidence judgment from the score (below 0.6 floor)', () => {
    const signals = computeSignals({
      ...base,
      localSeo: { score: 0.55, confidence: 0.5, missingSignals: [], topCompetitorUrl: null, topCompetitorLocalScore: null },
    })
    expect(signals.e_local_llm).toBeNull()
  })

  it('emits local_seo_gap naming the top competitor + missing signals', () => {
    const report = scoreMaster({
      ...base,
      localSeo: { score: 0.4, confidence: 0.8, missingSignals: ['verified Google Business Profile'], topCompetitorUrl: 'https://www.dallasimmigrationlaw.com/h1b', topCompetitorLocalScore: 0.85 },
    })
    const rec = report.recommendations.find((r) => r.code === 'local_seo_gap')
    expect(rec).toBeDefined()
    expect(rec?.subsystem).toBe('eeat')
    expect(rec?.action).toMatch(/verified Google Business Profile/)
    expect(rec?.evidence).toMatch(/dallasimmigrationlaw/)
  })

  it('does not emit local_seo_gap when the page is on par with the top competitor', () => {
    const report = scoreMaster({
      ...base,
      localSeo: { score: 0.9, confidence: 0.9, missingSignals: [], topCompetitorUrl: null, topCompetitorLocalScore: 0.85 },
    })
    expect(report.recommendations.some((r) => r.code === 'local_seo_gap')).toBe(false)
  })
})
