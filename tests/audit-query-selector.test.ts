import {
  jaccard,
  normalizeAuditQuery,
  queryTokens,
  scoreAuditCandidates,
  selectAuditQueries,
  usableQuery,
} from '@/lib/seoEngine/auditQuerySelector'
import { DEFAULT_AUDIT_QUERIES } from '@/lib/seoEngine/llmVisibility'

const NOW = Date.parse('2026-08-17T12:00:00.000Z')

describe('auditQuerySelector — adaptive LLM audit slate', () => {
  it('does not pin the hardcoded Nigeria query as #1 once it has been audited recently', () => {
    const scored = scoreAuditCandidates({
      seeds: DEFAULT_AUDIT_QUERIES,
      priorAudits: [
        {
          query: DEFAULT_AUDIT_QUERIES[0],
          cited: false,
          shareOfVoice: 0,
          createdAt: '2026-08-17T10:00:00.000Z',
        },
      ],
      now: NOW,
    })
    const picked = selectAuditQueries(scored, 6)
    expect(picked[0].query).not.toBe(DEFAULT_AUDIT_QUERIES[0])
    expect(scored.some((p) => p.reasons.some((r) => /cooldown/i.test(r)))).toBe(true)
  })

  it('promotes an uncited planner/FAQ term over a stale seed', () => {
    const scored = scoreAuditCandidates({
      seeds: DEFAULT_AUDIT_QUERIES,
      plans: [
        {
          primaryTerm: 'opt stem extension documents',
          relatedTerms: ['opt stem extension requirements'],
          faq: ['How long does OPT STEM extension last?'],
          opportunityScore: 0.92,
          impressions: 4800,
        },
      ],
      priorAudits: [
        {
          query: DEFAULT_AUDIT_QUERIES[0],
          cited: false,
          shareOfVoice: 0,
          createdAt: '2026-08-16T12:00:00.000Z',
        },
      ],
      now: NOW,
    })
    const picked = selectAuditQueries(scored, 4)
    expect(picked.some((p) => /opt stem/i.test(p.query))).toBe(true)
    expect(picked[0].source === 'plan' || /opt stem/i.test(picked[0].query)).toBe(true)
  })

  it('walks a Markov neighbor of the last lost query', () => {
    const scored = scoreAuditCandidates({
      seeds: [
        'How do I get a student visa for Canada from Nigeria?',
        'Canada study permit from Ghana processing time',
        'Australia subclass 190 nomination requirements',
      ],
      priorAudits: [
        {
          query: 'How do I get a student visa for Canada from Nigeria?',
          cited: false,
          shareOfVoice: 0,
          createdAt: '2026-08-10T12:00:00.000Z',
        },
      ],
      now: NOW,
    })
    const ghana = scored.find((c) => /ghana/i.test(c.query))
    expect(ghana).toBeTruthy()
    expect(ghana!.reasons.some((r) => /markov/i.test(r))).toBe(true)
    expect(ghana!.score).toBeGreaterThan(
      scored.find((c) => /190/i.test(c.query))!.score,
    )
  })

  it('diversifies the slate so two near-duplicate Canada student queries are not both taken first', () => {
    const scored = scoreAuditCandidates({
      seeds: [
        'How do I get a student visa for Canada from Nigeria?',
        'How do I get a Canada student visa from Nigeria in 2026?',
        'UK Skilled Worker visa requirements 2026',
        'Australia subclass 190 state nomination',
      ],
      now: NOW,
    })
    const picked = selectAuditQueries(scored, 3)
    const canadaish = picked.filter((p) => /canada/i.test(p.query) && /nigeria/i.test(p.query))
    expect(canadaish.length).toBeLessThanOrEqual(1)
    expect(picked.length).toBe(3)
  })

  it('rejects ontology stage-label FAQ templates as unusable search queries', () => {
    expect(usableQuery('What documents do I need for schools & study in US?')).toBeNull()
    expect(usableQuery('How long does schools & study take in US?')).toBeNull()
    expect(usableQuery('What are the US schools & study requirements?')).toBeNull()
    expect(usableQuery('How long does OPT STEM extension last?')).toBe('How long does OPT STEM extension last?')
    const scored = scoreAuditCandidates({
      seeds: DEFAULT_AUDIT_QUERIES,
      plans: [{
        primaryTerm: 'f-1 visa requirements',
        faq: [
          'What documents do I need for schools & study in US?',
          'What documents do I need for f-1 visa requirements?',
        ],
        opportunityScore: 0.9,
      }],
      now: NOW,
    })
    expect(scored.some((c) => /schools & study/i.test(c.query))).toBe(false)
    expect(scored.some((c) => /f-1 visa requirements/i.test(c.query))).toBe(true)
  })

  it('jaccard is 0 on disjoint tokens and 1 on identical sets', () => {
    expect(jaccard(queryTokens('uk spouse visa'), queryTokens('uk spouse visa'))).toBe(1)
    expect(jaccard(queryTokens('uk spouse visa'), queryTokens('australia 190 nomination'))).toBe(0)
    expect(normalizeAuditQuery('  How  DO I  ')).toBe('how do i')
  })
})
