import { loadKeywordDemandFile } from '@/lib/seoDataLoaders'
import {
  demandDedupeKey,
  isServiceNavigationalQuery,
  isThinMarketTerm,
  mergeDemandSignals,
  selectKeywordDemandCandidates,
  volumeToPlannerImpressions,
} from '@/lib/seoEngine/keywordDemand'
import { isJunkQuery } from '@/lib/seoFactory/queryNoise'

describe('keyword demand knowledge layer', () => {
  it('loads the committed caseworks Ads export (500 unique terms)', async () => {
    const file = await loadKeywordDemandFile()
    expect(file.rows.length).toBe(500)
    expect(new Set(file.rows.map((r) => r.term.toLowerCase())).size).toBe(500)
    expect(file.rows[0].volume).toBeGreaterThan(file.rows[file.rows.length - 1].volume)
  })

  it('drops lawyer-shopping queries that are not a visa/route topic', () => {
    expect(isServiceNavigationalQuery('attorney immigration')).toBe(true)
    expect(isServiceNavigationalQuery('immigration law firm')).toBe(true)
    expect(isServiceNavigationalQuery('immigration attorney for green card')).toBe(false)
    expect(isServiceNavigationalQuery('uk graduate visa')).toBe(false)
  })

  it('keeps distinctive route phrases and drops two-word generic heads from planning', async () => {
    expect(isThinMarketTerm('student visa')).toBe(true)
    expect(isThinMarketTerm('work visas')).toBe(true)
    expect(isThinMarketTerm('visa us')).toBe(true)
    expect(isThinMarketTerm('stem opt')).toBe(false)
    expect(isThinMarketTerm('uk visa application')).toBe(false)
    expect(isThinMarketTerm('united states work visa')).toBe(false)
    const file = await loadKeywordDemandFile()
    const knowledge = selectKeywordDemandCandidates(file.rows)
    const planned = selectKeywordDemandCandidates(file.rows, { forPlanner: true })
    expect(knowledge.some((c) => c.term.toLowerCase() === 'student visa')).toBe(true)
    expect(planned.some((c) => c.term.toLowerCase() === 'student visa')).toBe(false)
  })

  it('maps surviving terms onto unique country × stage cells and log-scales volume', async () => {
    const file = await loadKeywordDemandFile()
    const selected = selectKeywordDemandCandidates(file.rows)
    expect(selected.length).toBeGreaterThan(80)
    expect(selected.every((c) => !isJunkQuery(c.term))).toBe(true)
    expect(selected.every((c) => !isServiceNavigationalQuery(c.term))).toBe(true)
    expect(selected.every((c) => c.stage && c.matchScore >= 2)).toBe(true)

    const keys = selected.map((c) => demandDedupeKey(c.term, c.country, c.stage))
    expect(new Set(keys).size).toBe(keys.length)

    expect(selected.some((c) => c.country === 'US')).toBe(true)
    expect(selected.some((c) => c.country === 'UK' && /uk/i.test(c.term))).toBe(true)
    expect(selected.some((c) => c.country === 'CA' && /canada/i.test(c.term))).toBe(true)
    expect(selected.some((c) => c.country === 'AU' && /australia/i.test(c.term))).toBe(true)

    const head = volumeToPlannerImpressions(1_220_000)
    const gscGap = 92
    expect(head).toBeLessThan(200)
    expect(head).toBeGreaterThan(gscGap * 0.5)
  })

  it('merges market demand into GSC without overwriting owned-site position', () => {
    const gsc = [{ term: 'uk visa application', clicks: 4, impressions: 40, position: 12, ctr: 0.1 }]
    const market = [
      { term: 'UK visa application', clicks: 0, impressions: 90, position: 80, ctr: 0 },
      { term: 'canada spousal sponsorship 2026', clicks: 0, impressions: 70, position: 80, ctr: 0 },
    ]
    const merged = mergeDemandSignals(gsc, market)
    const uk = merged.find((s) => s.term.toLowerCase() === 'uk visa application')
    const ca = merged.find((s) => /spousal/i.test(s.term))
    expect(uk?.position).toBe(12)
    expect(uk?.impressions).toBe(90)
    expect(ca?.term).toMatch(/canada/i)
    expect(merged.length).toBe(2)
  })
})
