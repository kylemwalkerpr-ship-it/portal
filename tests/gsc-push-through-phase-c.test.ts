/**
 * GSC push-through — Phase C: route the factory at the five seed URLs.
 *
 * The locked snapshot routing table still knows the existing owner URLs, but
 * P1 qualified visibility now suppresses real-but-off-mission Pacific housing
 * demand before opportunity scoring. Bristol, Warwick and lease-break remain
 * actionable and must expand/defend their EXISTING owner URL — never a sibling.
 * Junk is dropped before scoring, auto-run never opens a junk/off-mission gap,
 * and the pipeline refuses junk/off-mission GSC-driven jobs.
 *
 * No live GSC calls in CI — rows are injected.
 */
import {
  matchStrikeSeed,
  GSC_STRIKE_SEEDS_2026_08,
} from '@/lib/seoFactory/strikeSeeds'
import { scoreOpportunities } from '@/lib/seoFactory/opportunityEngine'
import { resolveOwner } from '@/lib/seoFactory/ownership'
import {
  pickAutoRunCandidates,
  type FactoryOpportunity,
} from '@/lib/seoFactory/opportunities'
import { isJunkTopic } from '@/lib/seoFactory/queryNoise'
import { isNoiseQuery } from '@/lib/seoFactory/seoWarRoom'

// The exact quoted Pacific PDF query from the locked diagnosis (§1 / §4).
const PDF_JUNK = '"2026-2027 stockton room and meal plan rates final.pdf" pacific.edu/sites/default/files/users/user2983'

// ── Fixtures: the five seed owner keywords + one junk query ─────────────────
const SEED_QUERIES = [
  { term: 'university of bristol international student guide', impressions: 248, clicks: 1, ctr: 0.004, position: 10.2 },
  { term: 'university of the pacific student housing', impressions: 193, clicks: 1, ctr: 0.005, position: 9.8 },
  { term: 'university of warwick international student guide', impressions: 189, clicks: 1, ctr: 0.005, position: 13.8 },
  { term: 'breaking a lease international student', impressions: 76, clicks: 4, ctr: 0.053, position: 10.4 },
]

describe('matchStrikeSeed — locked seed routing table', () => {
  it('matches all four guide/lease owner keywords to an expand-mode seed', () => {
    for (const q of SEED_QUERIES) {
      const seed = matchStrikeSeed(q.term)
      expect(seed).not.toBeNull()
      expect(seed!.mode).toBe('expand')
      expect(seed!.canonicalUrl).toMatch(/^https:\/\//)
      expect(seed!.filePath).toBeTruthy()
    }
  })

  it('matches the apex homepage (defend mode)', () => {
    const seed = matchStrikeSeed('yousafeconsultancy')
    expect(seed).not.toBeNull()
    expect(seed!.path).toBe('/')
    expect(seed!.mode).toBe('defend')
    expect(seed!.canonicalUrl).toBe('https://yousafeconsultancy.com/')
    expect(seed!.repo).toBe('yousafe-consultancy')
  })

  it('matches a seed by its page URL path (authoritative)', () => {
    const seed = matchStrikeSeed('', '/guide/uk-university-of-bristol-international-student-guide/')
    expect(seed).not.toBeNull()
    expect(seed!.canonicalUrl).toBe(GSC_STRIKE_SEEDS_2026_08[0].canonicalUrl)
  })

  it('never matches junk', () => {
    expect(matchStrikeSeed(PDF_JUNK)).toBeNull()
    expect(matchStrikeSeed('sites/default/files/users/user2983')).toBeNull()
  })
})

describe('opportunity engine — seed routing beats content_gap', () => {
  it('routes qualified strike-distance seeds but suppresses the off-mission Pacific housing seed', () => {
    const result = scoreOpportunities({
      queries: [...SEED_QUERIES, { term: PDF_JUNK, impressions: 40, clicks: 0, ctr: 0, position: 9 }],
      limit: 10,
    })
    const topics = result.opportunities.map((o) => o.topic)
    // Zero junk terms.
    expect(topics).not.toContain(PDF_JUNK.toLowerCase())
    expect(result.opportunities.some((o) => o.topic.includes('pacific.edu') || o.topic.includes('user2983'))).toBe(false)

    // P1: the historical Pacific housing seed remains in the routing table for
    // observability/ownership, but real campus-housing demand is off-mission and
    // can no longer become an actionable opportunity.
    const pacificHousing = SEED_QUERIES.find((q) => /pacific student housing/i.test(q.term))!
    expect(matchStrikeSeed(pacificHousing.term)).not.toBeNull()
    expect(topics).not.toContain(pacificHousing.term)

    // The remaining on-mission strike-distance seeds still expand their owner.
    for (const q of SEED_QUERIES.filter((q) => q !== pacificHousing)) {
      const hit = result.opportunities.find((o) => o.topic === q.term)
      expect(hit).toBeDefined()
      expect(hit!.play).toBe('quick_win')
      expect(hit!.sourcePage).toBe(matchStrikeSeed(q.term)!.canonicalUrl)
      expect(hit!.coverage.matched).toBe(true)
    }
    expect(result.opportunities.some((o) => o.play === 'content_gap')).toBe(false)
  })
})

describe('ownership resolver — seed keyword expands the existing canonical URL', () => {
  it('resolves a seed keyword to the locked owner URL with action=expand', async () => {
    for (const q of SEED_QUERIES) {
      const seed = matchStrikeSeed(q.term)!
      const plan = await resolveOwner({
        primaryKeyword: q.term,
        contentType: 'legal_guide',
        region: 'UK',
      })
      expect(plan.routingSource).toBe('strike_seed')
      expect(plan.action).toBe('expand')
      expect(plan.canonicalUrl).toBe(seed.canonicalUrl)
      expect(plan.filePath).toBe(seed.filePath)
      expect(plan.host).toBe('legal')
      expect(plan.repo).toBe('caseworks')
      // Never a sibling: the file path points at the existing owner page.
      expect(plan.filePath).toContain('page.tsx')
    }
  })

  it('resolves the homepage to defend (keep) on apex, never a rewrite', async () => {
    const plan = await resolveOwner({
      primaryKeyword: 'yousafeconsultancy',
      contentType: 'legal_guide',
      region: 'US',
    })
    expect(plan.routingSource).toBe('strike_seed')
    expect(plan.action).toBe('keep')
    expect(plan.canonicalUrl).toBe('https://yousafeconsultancy.com/')
    expect(plan.host).toBe('apex')
    expect(plan.repo).toBe('yousafe-consultancy')
    expect(plan.filePath).toBe('landing-page/content/index.md')
  })
})

describe('auto-run — never opens a content_gap', () => {
  const makeOpp = (over: Partial<FactoryOpportunity>): FactoryOpportunity => ({
    term: 'x',
    impressions: 50,
    clicks: 1,
    ctr: 0.02,
    position: 10,
    score: 70,
    action: 'strike_distance',
    suggestedContentType: 'article',
    region: 'US',
    ownerHint: null,
    enginePlay: 'quick_win',
    ...over,
  })

  it('drops content_gap / deep_demand_build; keeps expand plays', () => {
    const opps = [
      makeOpp({ term: 'gap term one', enginePlay: 'content_gap', action: 'deep_demand_build' }),
      makeOpp({ term: 'bristol guide', enginePlay: 'quick_win', action: 'strike_distance' }),
      makeOpp({ term: 'refresh me', enginePlay: 'refresh', action: 'expand_or_build' }),
      makeOpp({ term: 'defend me', enginePlay: 'defend', action: 'page1_defend' }),
    ]
    const picked = pickAutoRunCandidates(opps, 10)
    const terms = picked.map((p) => p.term)
    expect(terms).not.toContain('gap term one')
    expect(terms).toContain('bristol guide')
    expect(terms).toContain('refresh me')
    expect(terms).toContain('defend me')
  })
})

describe('junk guard — unified classifier', () => {
  it('isJunkTopic refuses GSC-leak junk but keeps long-tail topics', () => {
    expect(isJunkTopic(PDF_JUNK)).toBe(true)
    expect(isJunkTopic('"issued by yale university" weekly new haven')).toBe(true)
    expect(isJunkTopic('yousafeconsultancy')).toBe(true) // brand paste
    expect(isJunkTopic('how to apply for a uk spouse visa step by step guide')).toBe(false)
    expect(isJunkTopic('university of bristol international student guide')).toBe(false)
  })

  it('isNoiseQuery (war room) delegates to the unified junk classifier', () => {
    expect(isNoiseQuery(PDF_JUNK)).toBe(true)
    expect(isNoiseQuery('"issued by yale university" weekly new haven')).toBe(true)
    expect(isNoiseQuery('university of bristol international student guide')).toBe(false)
  })
})
