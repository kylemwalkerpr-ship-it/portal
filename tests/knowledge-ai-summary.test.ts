import { parseKnowledgeAiSummary } from '@/lib/seoEngine/knowledge'

describe('parseKnowledgeAiSummary', () => {
  it('reads a clean JSON object', () => {
    const parsed = parseKnowledgeAiSummary('{"summary":"IRCC updated the PGWP language rules.","stages":["work"],"countries":["CA"]}')
    expect(parsed.summary).toContain('PGWP')
    expect(parsed.stages).toEqual(['work'])
    expect(parsed.countries).toEqual(['CA'])
  })

  it('strips markdown fences and leading prose that Grok often wraps around JSON', () => {
    const parsed = parseKnowledgeAiSummary(`Here is the summary:
\`\`\`json
{"summary":"USCIS published a new H-1B lottery notice for FY2027.","stages":["work","visa"],"countries":["US"]}
\`\`\``)
    expect(parsed.summary).toContain('H-1B lottery')
    expect(parsed.stages).toEqual(['work', 'visa'])
    expect(parsed.countries).toEqual(['US'])
  })

  it('recovers a two-sentence prose summary when the model ignores JSON', () => {
    const parsed = parseKnowledgeAiSummary(
      'The UK Home Office tightened the skilled worker salary threshold again. Sponsors must check the new going rate before assigning a CoS.',
    )
    expect(parsed.summary).toContain('skilled worker salary')
    expect(parsed.summary).toContain('going rate')
    expect(parsed.stages).toEqual([])
  })

  it('returns empty on blank input', () => {
    expect(parseKnowledgeAiSummary('   ')).toEqual({ summary: '', stages: [], countries: [] })
  })
})
