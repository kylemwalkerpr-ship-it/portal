/**
 * GSC push-through — Phase B: score ELIGIBLE GSC only.
 *
 * Locks the 2026-08-18 diagnosis: a property at pos 33 with 0.3% CTR is
 * ON-CURVE for eligible queries when 40% of impressions are junk PDF/URL
 * noise. Demand/SERP must use eligible-only aggregates, a junk-share penalty
 * must stop a polluted property from looking healthy, the CTR gap must be
 * suppressed past #20, and the feed must expose `gscMix` (junk share +
 * strike-distance) so the studio cannot hide behind a site-wide 0.3% CTR.
 *
 * No live GSC calls in CI — rows are injected.
 */
import { computeGscMix } from '@/lib/seoFactory/gscMix'
import { scoreMaster } from '@/lib/seoFactory/masterEngine'
import {
  assembleMasterEngineFeed,
  renderMasterEnginePromptBlock,
} from '@/lib/seoFactory/masterEngineFeed'
import { scoreTopicAuthority } from '@/lib/seoFactory/authorityScoring'
import { computeRankingScore } from '@/lib/seoEngine/rankingModel'

jest.mock('@/lib/supabase', () => {
  const chain = {
    select: () => chain,
    order: () => chain,
    limit: () => Promise.resolve({ data: [] }),
    eq: () => chain,
    in: () => chain,
    single: () => Promise.resolve({ data: null }),
  }
  return { createSupabaseAdminClient: () => ({ from: () => chain }) }
})
jest.mock('@/lib/seoFactory/siteHealthSnapshot', () => ({
  attachSiteHealthFacts: (input: unknown) => Promise.resolve(input),
}))
jest.mock('@/lib/seoEngine/llmVisibility', () => ({
  loadLlmVisibilityEvidence: () => Promise.resolve(null),
}))
jest.mock('@/lib/seoEngine/ahrefsAudit', () => ({
  loadLatestAhrefsSnapshot: () => Promise.resolve(null),
}))
jest.mock('@/lib/gscAnalytics', () => ({
  fetchSiteSearchAnalytics: () =>
    Promise.resolve({ configured: false, topQueries: [], topPages: [], warnings: [] }),
}))
jest.mock('@/lib/seoDataLoaders', () => ({
  // Punch 1: the locked mix as the snapshot loader would return it — 40% junk +
  // one Bristol-like strike-distance row (pos 10.2, 248 imp). The feed must
  // hydrate these WITHOUT the caller injecting queryRows.
  loadGscSnapshot: () =>
    Promise.resolve({
      topQueries: [
        { term: 'pacific.edu/sites/default/files/rates-2026.pdf', clicks: 0, impressions: 2000, ctr: 0, position: 3 },
        { term: '"stockton room and meal plan rates" user2983', clicks: 0, impressions: 2000, ctr: 0, position: 4 },
        { term: 'university of bristol international student guide', clicks: 1, impressions: 248, ctr: 0.004, position: 10.2 },
        { term: 'canada express entry stem category 2026', clicks: 28, impressions: 5752, ctr: 0.0049, position: 53 },
      ],
      topPages: [],
      opportunities: {},
    }),
}))

// ── Fixtures ──────────────────────────────────────────────────────────────────
const junkRow = (i: number, impressions: number, position: number) => ({
  term: `pacific.edu/sites/default/files/users/user${i}`,
  impressions,
  clicks: 0,
  position,
})

/** 90% junk impressions at pos 5, 10% eligible at pos 32. */
const POLLUTED_GSC = {
  impressions: 1000,
  clicks: 1,
  ctr: 0.001,
  position: 31,
  queryRows: [
    ...Array.from({ length: 9 }, (_, i) => junkRow(i, 100, 5)),
    { term: 'canada express entry stem category 2026', impressions: 100, clicks: 1, position: 32 },
  ],
}

/** 15% junk at pos 32, 85% eligible at pos 5. */
const INVERTED_GSC = {
  impressions: 118,
  clicks: 1,
  ctr: 0.0085,
  position: 7,
  queryRows: [
    ...Array.from({ length: 9 }, (_, i) => junkRow(i, 2, 32)),
    { term: 'canada express entry stem category 2026', impressions: 100, clicks: 1, position: 5 },
  ],
}

/** Locked domain totals (29 clicks / 10959 imp / pos 33) + 40% junk share. */
const LOCKED_GSC = {
  impressions: 10959,
  clicks: 29,
  ctr: 29 / 10959,
  position: 33,
  queryRows: [
    { term: 'pacific.edu/sites/default/files/rates-2026.pdf', impressions: 2192, clicks: 0, position: 3 },
    { term: '"stockton room and meal plan rates" user2983', impressions: 2192, clicks: 0, position: 4 },
    { term: 'canada express entry stem category 2026', impressions: 3288, clicks: 15, position: 53 },
    { term: 'uk dependent visa guide', impressions: 3287, clicks: 14, position: 54 },
  ],
}

const BASE_INPUT = {
  topic: 'canada express entry stem category 2026',
  primaryKeyword: 'canada express entry stem category 2026',
  content:
    'Canada Express Entry STEM category 2026 guide. This page explains eligibility, the occupation list, and required documents for STEM-category draws.',
}

describe('computeGscMix — polluted vs inverted mix', () => {
  it('computes eligible-only aggregates and junk share', () => {
    const polluted = computeGscMix(POLLUTED_GSC)
    expect(polluted.junk.share).toBeCloseTo(0.9, 1)
    expect(polluted.eligible.position).toBeCloseTo(32, 1)
    expect(polluted.eligible.impressions).toBe(100)
    expect(polluted.eligible.clicks).toBe(1)
    expect(polluted.eligible.ctr).toBeCloseTo(0.01, 3)

    const inverted = computeGscMix(INVERTED_GSC)
    expect(inverted.junk.share).toBeCloseTo(0.153, 2)
    expect(inverted.eligible.position).toBeCloseTo(5, 1)
  })

  it('recommends improve-eligible-rank (never fix_ctr) when eligible position is deep', () => {
    const polluted = computeGscMix(POLLUTED_GSC)
    const plays = polluted.recommendedPlays.map((p) => p.play)
    expect(plays).toContain('improve_eligible_rank')
    expect(plays).not.toContain('fix_ctr')
  })

  it('recommends fix_ctr (never improve-eligible-rank) when eligible position is shallow', () => {
    const inverted = computeGscMix(INVERTED_GSC)
    const plays = inverted.recommendedPlays.map((p) => p.play)
    expect(plays).toContain('fix_ctr')
    expect(plays).not.toContain('improve_eligible_rank')
  })

  it('passes the aggregate through untouched when no per-query breakdown is supplied', () => {
    const mix = computeGscMix({ impressions: 5000, clicks: 20, ctr: 0.004, position: 31 })
    expect(mix.eligible.impressions).toBe(5000)
    expect(mix.eligible.position).toBe(31)
    expect(mix.junk.share).toBe(0)
    expect(mix.deepTail.share).toBe(0)
  })
})

describe('Master Engine SERP subsystem — eligible-only + junk penalty', () => {
  it('polluted mix does NOT produce a healthy SERP score; inverted mix scores better', () => {
    const polluted = scoreMaster({ ...BASE_INPUT, gsc: POLLUTED_GSC })
    const inverted = scoreMaster({ ...BASE_INPUT, gsc: INVERTED_GSC })

    expect(polluted.subsystems.serp.score).not.toBeNull()
    // A 90%-junk property must read as unhealthy on SERP.
    expect(polluted.subsystems.serp.score!).toBeLessThan(0.5)
    // Same content, same eligible CTR — position + junk share decide.
    expect(polluted.subsystems.serp.score!).toBeLessThan(inverted.subsystems.serp.score!)
  })

  it('suppresses the CTR-deviation signal past #20 (pos 32 is on-curve, not a title problem)', () => {
    const polluted = scoreMaster({ ...BASE_INPUT, gsc: POLLUTED_GSC })
    const gCtrDev = polluted.computedSignals.find((s) => s.id === 'g_ctr_deviation')
    expect(gCtrDev?.value).toBeNull()
  })

  it('locked domain fixture (pos 33 + 40% junk) yields a serp recommendation of improve-eligible-rank, NOT fix-CTR', () => {
    const report = scoreMaster({ ...BASE_INPUT, gsc: LOCKED_GSC })
    const serpRecs = report.recommendations.filter((r) => r.subsystem === 'serp')
    expect(serpRecs.some((r) => r.action.toLowerCase().includes('improve eligible rank'))).toBe(true)
    expect(serpRecs.some((r) => /fix ctr/i.test(r.action))).toBe(false)
  })

  it('exposes gscMix on the report with junk share + strike distance', () => {
    const report = scoreMaster({ ...BASE_INPUT, gsc: LOCKED_GSC })
    expect(report.gscMix.junk.share).toBeCloseTo(4384 / 10959, 3)
    expect(report.gscMix.eligible.position).toBeGreaterThan(20)
  })
})

describe('demand consumers — rankingModel + authorityScoring', () => {
  it('rankingModel scoreDemand penalizes the polluted mix and suppresses CTR gap past #20', () => {
    const polluted = computeRankingScore({ topic: 'canada express entry stem category 2026', gsc: POLLUTED_GSC })
    const inverted = computeRankingScore({ topic: 'canada express entry stem category 2026', gsc: INVERTED_GSC })
    expect(polluted.families.demand.score).toBeLessThan(inverted.families.demand.score)
    expect(polluted.families.demand.reasons.some((r) => /CTR gap/i.test(r))).toBe(false)
  })

  it('authorityScoring demand uses eligible aggregates with the junk-share penalty', () => {
    const base = {
      term: 'canada express entry stem category 2026',
      impressions: 1000,
      clicks: 1,
      ctr: 0.001,
      position: 31,
    }
    const polluted = scoreTopicAuthority({ ...base, queryRows: POLLUTED_GSC.queryRows })
    const inverted = scoreTopicAuthority({
      ...base,
      impressions: 118,
      clicks: 1,
      ctr: 0.0085,
      position: 7,
      queryRows: INVERTED_GSC.queryRows,
    })
    expect(polluted.demand).toBeLessThan(inverted.demand)
  })
})

describe('Master Engine feed — gscMix contract', () => {
  it('assembleMasterEngineFeed JSON includes gscMix.junk.share and gscMix.strikeDistance', async () => {
    const feed = await assembleMasterEngineFeed({
      topic: 'canada express entry stem category 2026',
      primaryKeyword: 'canada express entry stem category 2026',
      canonicalUrl: 'https://legal.yousafeconsultancy.com/ca/canada-express-entry-stem-category-occupations-list-2026/',
      gsc: {
        ...LOCKED_GSC,
        queryRows: [
          { term: 'pacific.edu/sites/default/files/rates-2026.pdf', impressions: 2192, clicks: 0, position: 3 },
          { term: 'canada express entry stem category 2026', impressions: 248, clicks: 1, position: 10.2 },
          { term: 'uk dependent visa guide', impressions: 3288, clicks: 15, position: 53 },
        ],
      },
    })
    expect(feed.ok).toBe(true)
    expect(feed.gscMix).toBeDefined()
    expect(feed.gscMix.junk.share).toBeGreaterThan(0)
    expect(Array.isArray(feed.gscMix.strikeDistance)).toBe(true)
    // The Bristol-like row (pos 10.2, 248 imp) must surface as strike distance.
    expect(feed.gscMix.strikeDistance.some((s) => s.position >= 8 && s.position <= 14)).toBe(true)
  })

  it('autopilot prompt block contains "eligible position" and "junk share"', () => {
    const report = scoreMaster({ ...BASE_INPUT, gsc: LOCKED_GSC })
    const block = renderMasterEnginePromptBlock(report)
    expect(block).toContain('eligible position')
    expect(block).toContain('junk share')
  })

  // Punch 1 — the real write path. No gsc on the request; the feed itself must
  // hydrate rows from the snapshot loader (mocked above) so the classifier sees
  // junk and the studio cannot hide behind a site-wide 0.3% CTR.
  it('hydrates queryRows from the snapshot when the caller passes no gsc', async () => {
    const feed = await assembleMasterEngineFeed({
      topic: 'canada express entry stem category 2026',
      primaryKeyword: 'canada express entry stem category 2026',
    })
    expect(feed.ok).toBe(true)
    // 4000 junk / 10000 total impressions = 0.4 junk share.
    expect(feed.gscMix.junk.share).toBeCloseTo(0.4, 1)
    // Bristol-like row (pos 10.2, 248 imp) must surface as strike distance.
    expect(feed.gscMix.strikeDistance.length).toBeGreaterThanOrEqual(1)
    expect(feed.promptBlock).toContain('eligible position')
    expect(feed.promptBlock).toContain('junk share')
  })

  it('hydrated (no injected rows) fixture → serp recommendation is improve-eligible-rank, not fix-CTR', async () => {
    const feed = await assembleMasterEngineFeed({
      topic: 'canada express entry stem category 2026',
      primaryKeyword: 'canada express entry stem category 2026',
    })
    // Eligible position is impression-weighted ≈ 51 — deep, so rank problem.
    expect(feed.gscMix.eligible.position).toBeGreaterThan(20)
    expect(feed.promptBlock.toLowerCase()).toContain('improve eligible rank')
    expect(feed.promptBlock.toLowerCase()).not.toContain('fix ctr')
  })
})
