/**
 * LLM/AEO visibility audit v3 — structured multi-engine matrix, competitive
 * delta, deterministic action generator, and scoreMaster g_share_of_voice wiring.
 */
import {
  parseAuditResponse,
  buildCitationActions,
  aggregateEngineAudits,
  type EngineAudit,
} from '@/lib/seoEngine/llmVisibility'
import { scoreMaster, computeSignals, type MasterEngineInput } from '@/lib/seoFactory/masterEngine'

describe('parseAuditResponse — structured JSON contract', () => {
  it('parses the JSON contract into sources with domain + estate classification', () => {
    const json = JSON.stringify({
      answer: 'A UK graduate visa lets you stay 2 years.',
      answerFormat: 'direct_answer',
      sources: [
        { url: 'https://legal.yousafeconsultancy.com/uk/graduate-route-visa/', domain: 'legal.yousafeconsultancy.com', quote: '2-year post-study route', position: 1 },
        { url: 'https://www.gov.uk/graduate-visa', domain: 'gov.uk', quote: 'official eligibility', position: 2 },
      ],
      confidence: 0.9,
      flags: [],
    })
    const parsed = parseAuditResponse(json)
    expect(parsed.answerFormat).toBe('direct_answer')
    expect(parsed.sources).toHaveLength(2)
    expect(parsed.sources[0].isEstate).toBe(true)
    expect(parsed.sources[1].isEstate).toBe(false)
    expect(parsed.sources[1].domain).toBe('gov.uk')
    expect(parsed.confidence).toBe(0.9)
    expect(parsed.flags).toEqual([])
  })

  it('falls back to regex URL extraction and flags malformed JSON (never throws)', () => {
    const prose = 'Here is the answer. See https://legal.yousafeconsultancy.com/uk/spouse-visa/ and https://www.gov.uk/spouse-visa for more.'
    const parsed = parseAuditResponse(prose)
    expect(parsed.flags).toContain('malformed_json')
    expect(parsed.sources.map((s) => s.domain)).toEqual(expect.arrayContaining(['legal.yousafeconsultancy.com', 'gov.uk']))
    expect(parsed.sources.find((s) => s.domain === 'legal.yousafeconsultancy.com')?.isEstate).toBe(true)
  })
})

describe('buildCitationActions — deterministic, prioritized fixes', () => {
  it('un-cited query → answer capsule + FAQ schema + entities + discovery', () => {
    const actions = buildCitationActions({ shareOfVoice: 0, topCompetitorDomain: null, competitorShare: null, cited: false })
    expect(actions.length).toBeGreaterThanOrEqual(4)
    expect(actions[0].action).toMatch(/direct-answer/i)
    expect(actions.map((a) => a.action).join(' ')).toMatch(/FAQPage/i)
    // Sorted by priority (highest first).
    const priorities = actions.map((a) => a.priority)
    expect([...priorities].sort((a, b) => b - a)).toEqual(priorities)
  })

  it('partial share-of-voice → names the top competitor to outrank', () => {
    const actions = buildCitationActions({ shareOfVoice: 0.33, topCompetitorDomain: 'boundless.com', competitorShare: 0.75, cited: true })
    expect(actions[0].action).toMatch(/Outrank boundless\.com/i)
  })

  it('full share-of-voice → sustain, not fix', () => {
    const actions = buildCitationActions({ shareOfVoice: 1, topCompetitorDomain: null, competitorShare: null, cited: true })
    expect(actions[0].action).toMatch(/Sustain/i)
  })
})

describe('aggregateEngineAudits — multi-engine matrix + competitive delta', () => {
  const mk = (over: Partial<EngineAudit>): EngineAudit => ({
    engine: 'glm-fast', model: 'zai-org/GLM-5.2-Fast', ok: true, cited: false,
    citedUrls: [], competitorDomains: [], answerFormat: null, snippet: '', confidence: 0.5, flags: [],
    ...over,
  })

  it('computes share-of-voice across successful engines and the top competitor', () => {
    const result = aggregateEngineAudits('graduate visa uk', [
      mk({ engine: 'glm-fast', cited: true, citedUrls: ['https://legal.yousafeconsultancy.com/uk/graduate-route-visa/'], competitorDomains: ['gov.uk', 'boundless.com'] }),
      mk({ engine: 'deepseek', cited: false, competitorDomains: ['boundless.com', 'immigration.govt.nz'] }),
      mk({ engine: 'openai', ok: false, flags: ['engine_error: 402'] }),
    ])
    // Only 2 successful engines → share-of-voice = 1/2.
    expect(result.shareOfVoice).toBe(0.5)
    expect(result.cited).toBe(true)
    expect(result.citedUrls).toContain('https://legal.yousafeconsultancy.com/uk/graduate-route-visa/')
    // boundless.com cited by BOTH successful engines → top competitor share 1.0.
    expect(result.topCompetitor).toEqual({ domain: 'boundless.com', share: 1 })
    expect(result.competitorDomains).toEqual(expect.arrayContaining(['gov.uk', 'boundless.com', 'immigration.govt.nz']))
    expect(result.actions.length).toBeGreaterThan(0)
  })

  it('returns zero share-of-voice when every engine fails', () => {
    const result = aggregateEngineAudits('q', [mk({ ok: false, flags: ['engine_error: 402'] })])
    expect(result.shareOfVoice).toBe(0)
    expect(result.topCompetitor).toBeNull()
    expect(result.engines).toHaveLength(1)
    expect(result.engines[0].ok).toBe(false)
    expect(result.engines[0].flags).toContain('engine_error: 402')
  })
})

describe('scoreMaster — g_share_of_voice lights up from measured evidence', () => {
  const base: MasterEngineInput = {
    primaryKeyword: 'opt stem extension',
    topic: 'opt stem extension requirements',
    contentType: 'legal_guide',
    content: '# OPT STEM Extension\n\n## Requirements\n\nA 24-month extension after the initial OPT period.\n\n## FAQ\n\n### What is OPT STEM extension?\n\nA 24-month extension for STEM degree holders.',
  }

  it('computes g_share_of_voice from llmVisibility evidence (never guessed)', () => {
    const signals = computeSignals({ ...base, llmVisibility: { cited: 1, total: 4, shareOfVoice: 0.25, topCompetitorDomain: 'boundless.com', competitorShare: 0.75 } })
    expect(signals.g_share_of_voice).toBeCloseTo(0.25, 5)
  })

  it('leaves g_share_of_voice dark when no evidence is provided', () => {
    const signals = computeSignals({ ...base })
    expect(signals.g_share_of_voice).toBeNull()
  })

  it('emits a llm_voice_gap recommendation naming the top competitor', () => {
    const report = scoreMaster({
      ...base,
      llmVisibility: { cited: 1, total: 4, shareOfVoice: 0.25, topCompetitorDomain: 'boundless.com', competitorShare: 0.75 },
    })
    const rec = report.recommendations.find((r) => r.code === 'llm_voice_gap')
    expect(rec).toBeDefined()
    expect(rec?.action).toMatch(/boundless\.com/i)
    expect(rec?.evidence).toMatch(/25%/)
  })

  it('does not emit llm_voice_gap when share-of-voice is healthy', () => {
    const report = scoreMaster({
      ...base,
      llmVisibility: { cited: 4, total: 4, shareOfVoice: 1, topCompetitorDomain: null, competitorShare: null },
    })
    expect(report.recommendations.some((r) => r.code === 'llm_voice_gap')).toBe(false)
  })
})
