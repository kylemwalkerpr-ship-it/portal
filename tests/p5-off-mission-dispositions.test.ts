/**
 * P5 — off-mission disposition contract.
 *
 * Covers the durable side of P5: the registry validates against the EXISTING
 * strategic-disposition vocabulary, every entry normalizes deterministically,
 * unmeasured evidence stays UNKNOWN (never 0), and the index-coverage mutation
 * path fails closed for registered KEEP_BUT_SILO URLs — before any GitHub write
 * or delegated site-health repair — without changing behavior for URLs that are
 * not in the registry.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  P5_OFF_MISSION_REGISTRY,
  STRATEGIC_DISPOSITIONS,
  isStrategicDisposition,
  normalizeP5Url,
  p5DispositionEntry,
  p5MutationBlocked,
  p5MutationVerdict,
  p5ProtectedUrlKeys,
  validateP5Registry,
} from '@/lib/seoFactory/p5OffMissionDispositions'
import {
  computeIndexFix,
  resolveIndexCoverage,
  type IndexFixItem,
} from '@/lib/seoFactory/indexCoverageFixes'
import type { SiteHealthPage } from '@/lib/seoFactory/siteHealth'
import type { GscIndexIssue } from '@/lib/gscIndexCoverage'

/** The eight 75%-cumulative-share cohort URLs (supervisor decision 2026-09-20). */
const COHORT = [
  'https://legal.yousafeconsultancy.com/guide/university-of-south-carolina-student-housing/',
  'https://legal.yousafeconsultancy.com/guide/florida-international-university-student-housing/',
  'https://legal.yousafeconsultancy.com/guide/portland-state-university-student-housing/',
  'https://legal.yousafeconsultancy.com/guide/cornell-university-student-housing/',
  'https://legal.yousafeconsultancy.com/guide/university-of-utah-student-housing/',
  'https://legal.yousafeconsultancy.com/guide/arizona-state-university-student-housing/',
  'https://legal.yousafeconsultancy.com/guide/university-of-oregon-student-housing/',
  'https://legal.yousafeconsultancy.com/guide/howard-university-student-housing/',
]

/** Unrelated URL: never named by the P5 registry. */
const UNRELATED = 'https://legal.yousafeconsultancy.com/us/student-visas/x/'

/**
 * The per-URL off-mission split the 2026-09-20 P5 audit DID publish (supervisor
 * evidence). `null` means the audit did not publish that field for that URL —
 * UNKNOWN, never a fabricated 0.
 */
const AUDIT_PER_URL: Record<
  string,
  { impressions: number | null; rows: number | null; qualifiedImpressions: number | null }
> = {
  [COHORT[0]]: { impressions: 141, rows: 16, qualifiedImpressions: 0 },
  [COHORT[1]]: { impressions: 106, rows: 8, qualifiedImpressions: 0 },
  [COHORT[2]]: { impressions: 57, rows: 7, qualifiedImpressions: 0 },
  [COHORT[3]]: { impressions: 49, rows: null, qualifiedImpressions: 0 },
  [COHORT[4]]: { impressions: 46, rows: 1, qualifiedImpressions: 0 },
  [COHORT[5]]: { impressions: 23, rows: 6, qualifiedImpressions: null },
  [COHORT[6]]: { impressions: 23, rows: null, qualifiedImpressions: null },
  [COHORT[7]]: { impressions: null, rows: null, qualifiedImpressions: null },
}

const mockGithubFetch = jest.fn()
const mockPutRepoFile = jest.fn()
const mockOpenPullRequest = jest.fn()
const mockRepairSiteHealth = jest.fn()
const mockSubmitIndexNow = jest.fn()

jest.mock('@/lib/githubContents', () => ({
  githubFetch: (...args: unknown[]) => mockGithubFetch(...args),
  putRepoFile: (...args: unknown[]) => mockPutRepoFile(...args),
  openPullRequest: (...args: unknown[]) => mockOpenPullRequest(...args),
  getBranchHeadSha: jest.fn(),
  getRepoFileContent: jest.fn(),
}))
jest.mock('@/lib/indexNow', () => ({
  submitUrlsToIndexNow: (...args: unknown[]) => mockSubmitIndexNow(...args),
}))
jest.mock('@/lib/seoFactory/siteHealth', () => ({
  repairSiteHealth: (...args: unknown[]) => mockRepairSiteHealth(...args),
  auditSiteHealthChunked: jest.fn(),
  listSiteHealthPageInventory: jest.fn(),
}))

beforeEach(() => {
  mockGithubFetch.mockReset()
  mockPutRepoFile.mockReset()
  mockOpenPullRequest.mockReset()
  mockSubmitIndexNow.mockReset()
  mockRepairSiteHealth.mockReset().mockResolvedValue({ repaired: [], pullRequests: [] })
})

const WORDS = 'prose '.repeat(450)

function page(partial: Partial<SiteHealthPage>): SiteHealthPage {
  return {
    repo: 'caseworks',
    host: 'legal.yousafeconsultancy.com',
    path: 'app/guide/university-of-south-carolina-student-housing/page.tsx',
    url: COHORT[0],
    title: 'Student housing',
    indexable: true,
    inboundLinks: 0,
    sampleSources: [],
    content: '',
    ...partial,
  }
}

function issue(partial: Partial<GscIndexIssue>): GscIndexIssue {
  return {
    url: COHORT[0],
    indexed: false,
    reasonCode: 'NOINDEX_TAG',
    reason: 'x',
    fixAction: 'REMOVE_NOINDEX',
    autoFix: true,
    fixLabel: 'Remove noindex tag',
    coverageState: null,
    verdict: null,
    indexingState: null,
    pageFetchState: null,
    robotsTxtState: null,
    googleCanonical: null,
    userCanonical: null,
    sitemaps: [],
    referringUrls: [],
    lastCrawlTime: null,
    ...partial,
  }
}

describe('P5 registry contract', () => {
  it('ships a well-formed versioned contract with no validation problems', () => {
    expect(validateP5Registry()).toEqual([])
    expect(P5_OFF_MISSION_REGISTRY.version).toBe('p5-off-mission-dispositions-v1')
    expect(Number.isNaN(Date.parse(P5_OFF_MISSION_REGISTRY.capturedAt))).toBe(false)
    expect(Number.isNaN(Date.parse(P5_OFF_MISSION_REGISTRY.evidence.persistedSyncAt))).toBe(false)
    expect(P5_OFF_MISSION_REGISTRY.evidence.window).toEqual({ start: '2026-06-22', end: '2026-09-19' })
    // Cohort-level evidence the audit measured exactly.
    expect(P5_OFF_MISSION_REGISTRY.evidence.offMissionTotals).toEqual({
      impressions: 613,
      rows: 134,
      urls: 37,
      clicks: 0,
    })
    expect(P5_OFF_MISSION_REGISTRY.evidence.cohortRule).toMatch(/75% of all off-mission impressions/)
  })

  it('ships the data/ and public/ registry copies byte-identical', () => {
    const data = readFileSync(join(process.cwd(), 'data/seo/p5-off-mission-dispositions.json'))
    const published = readFileSync(join(process.cwd(), 'public/seo-data/p5-off-mission-dispositions.json'))
    expect(Buffer.compare(data, published)).toBe(0)
  })

  it('seeds exactly the eight 75% cohort URLs, all KEEP_BUT_SILO', () => {
    const urls = P5_OFF_MISSION_REGISTRY.entries.map((entry) => entry.url)
    expect([...urls].sort()).toEqual([...COHORT].sort())
    expect(new Set(urls).size).toBe(8)
    expect(P5_OFF_MISSION_REGISTRY.evidence.cohortUrlCount).toBe(8)
    for (const entry of P5_OFF_MISSION_REGISTRY.entries) {
      expect(entry.disposition).toBe('KEEP_BUT_SILO')
      // Existing program vocabulary only — no competing disposition names.
      expect(isStrategicDisposition(entry.disposition)).toBe(true)
      expect(STRATEGIC_DISPOSITIONS).toContain(entry.disposition)
      expect(entry.permits.automatedIndexCoverageMutation).toBe(false)
      expect(entry.permits.redirect).toBe(false)
      expect(entry.permits.noindex).toBe(false)
      expect(entry.permits.canonicalChange).toBe(false)
      expect(entry.permits.retire).toBe(false)
      expect(entry.permits.internalAuthorityExpansion).toBe(false)
      expect(entry.notes).toMatch(/current state/i)
    }
    expect(p5ProtectedUrlKeys()).toEqual(COHORT)
  })

  it('normalizes every entry deterministically and idempotently', () => {
    for (const url of COHORT) {
      expect(normalizeP5Url(url)).toBe(url)
      expect(normalizeP5Url(normalizeP5Url(url))).toBe(url)
      const host = new URL(url).host
      const path = new URL(url).pathname
      // Case / scheme / trailing-slash / tracker / www variants hit the same entry.
      for (const variant of [
        `https://${host.toUpperCase()}${path}`,
        `http://${host}${path}`,
        `https://${host}${path.replace(/\/$/, '')}`,
        `${url}?utm_source=p5&utm_medium=audit`,
        `https://www.${host}${path}#top`,
      ]) {
        expect(normalizeP5Url(variant)).toBe(url)
        expect(p5DispositionEntry(variant)?.url).toBe(url)
      }
    }
    // Un-matchable input is distinguishable from "not registered".
    expect(normalizeP5Url('not a url')).toBeNull()
    expect(normalizeP5Url('mailto:admin@yousafeconsultancy.com')).toBeNull()
    expect(normalizeP5Url('')).toBeNull()
  })

  it('records the per-URL split the audit DID publish — never a fabricated 0', () => {
    expect(P5_OFF_MISSION_REGISTRY.evidence.perUrlOffMissionSplit).toMatchObject({ state: 'published' })
    for (const entry of P5_OFF_MISSION_REGISTRY.entries) {
      const expected = AUDIT_PER_URL[entry.url]
      expect(expected).toBeDefined()
      expect(entry.offMissionImpressions).toBe(expected.impressions)
      expect(entry.offMissionRows).toBe(expected.rows)
      expect(entry.qualifiedDemand.impressions).toBe(expected.qualifiedImpressions)
      // Never published per URL → UNKNOWN (null), never a measured 0.
      expect(entry.offMissionClicks).toBeNull()
      expect(entry.qualifiedDemand.rows).toBeNull()
      expect(entry.qualifiedDemand.clicks).toBeNull()
      expect(entry.unknownReason.trim().length).toBeGreaterThan(0)
    }
    // Measured qualified zero stays a measured zero.
    expect(p5DispositionEntry(COHORT[0])!.qualifiedDemand.impressions).toBe(0)
    // Howard's exact impressions were published only as an audit display range.
    const howard = p5DispositionEntry(COHORT[7])!
    expect(howard.offMissionImpressions).toBeNull()
    expect(howard.offMissionImpressions).not.toBe(0)
    expect(howard.offMissionClicks).toBeNull()
    expect(howard.offMissionClicks).not.toBe(0)
    expect(howard.unknownReason).toMatch(/20\u201329/)
  })

  it('records the live observations the audit published instead of blanket UNKNOWN', () => {
    for (const entry of P5_OFF_MISSION_REGISTRY.entries) {
      expect(entry.liveObservations.httpStatus).toBe(200)
      expect(entry.liveObservations.inSitemap).toBe(false)
      expect(entry.liveObservations.robotsState).toBe('allowed')
      // Date-level only: the exact capture time was not recorded, so none is fabricated.
      expect(String(entry.liveObservations.observedAt)).toMatch(/^2026-09-20 \(date-level/)
    }
    // Ownership row identified for Utah only; the others are UNKNOWN, not "none".
    expect(p5DispositionEntry(COHORT[4])!.liveObservations.ownershipRegistryRowId).toBe(57)
    for (const url of COHORT.filter((candidate) => candidate !== COHORT[4])) {
      expect(p5DispositionEntry(url)!.liveObservations.ownershipRegistryRowId).toBeNull()
    }
  })

  it('no longer claims the audit published no per-URL split', () => {
    const reason = String(P5_OFF_MISSION_REGISTRY.evidence.perUrlOffMissionSplitReason)
    expect(reason).toMatch(/DID publish/)
    expect(reason).toMatch(/classifyGscVisibility/)
    expect(reason).not.toMatch(/did not publish a per-URL split/i)
    expect(reason).not.toMatch(/not a per-URL split/i)
    expect(P5_OFF_MISSION_REGISTRY.evidence.knownLimitations.join(' ')).toMatch(/20\u201329/)
  })
})

describe('P5 fail-closed index-coverage mutation gate', () => {
  it('blocks automated mutation for every registered KEEP_BUT_SILO URL', () => {
    for (const url of COHORT) {
      const verdict = p5MutationVerdict(url)
      expect(verdict.registered).toBe(true)
      expect(verdict.disposition).toBe('KEEP_BUT_SILO')
      expect(verdict.blocked).toBe(true)
      expect(String(verdict.reason)).toMatch(/P5 disposition KEEP_BUT_SILO/)
      expect(String(verdict.reason)).toMatch(/2026-06-22 → 2026-09-19/)
      expect(p5MutationBlocked(url)).toBe(true)
    }
  })

  it('leaves unrelated index-coverage behavior unchanged (no registry entry → no new gate)', () => {
    expect(p5MutationVerdict(UNRELATED)).toEqual({
      registered: false,
      disposition: null,
      blocked: false,
      reason: null,
    })

    // Fully-expanded unregistered noindex page: still fixed, exactly as before.
    const fixed = computeIndexFix({
      issue: issue({ url: UNRELATED, fixAction: 'REMOVE_NOINDEX' }),
      page: page({
        url: UNRELATED,
        path: 'app/us/student-visas/x/page.tsx',
        content: `export const metadata = { robots: { index: false } }\n\n${WORDS}`,
      }),
    })
    expect(fixed.status).toBe('fixed')
    expect(fixed.newContent).toContain('index: true')

    // Unregistered orphan/sitemap issue: still delegated to Site Health.
    expect(
      computeIndexFix({
        issue: issue({ url: UNRELATED, fixAction: 'ADD_INTERNAL_LINK' }),
        page: page({ url: UNRELATED }),
      }).status,
    ).toBe('delegated')
    expect(
      computeIndexFix({
        issue: issue({ url: UNRELATED, fixAction: 'ADD_SITEMAP' }),
        page: page({ url: UNRELATED }),
      }).status,
    ).toBe('delegated')
  })

  it('skips every fix shape for a registered URL, including the ones that would write', () => {
    const noindexPage = page({ content: `export const metadata = { robots: { index: false } }\n\n${WORDS}` })
    const fixable: Array<Partial<GscIndexIssue>> = [
      { fixAction: 'REMOVE_NOINDEX' },
      { fixAction: 'ADD_CANONICAL' },
      { fixAction: 'FIX_CANONICAL' },
      { fixAction: 'FIX_ROBOTS_TXT' },
      { fixAction: 'ADD_INTERNAL_LINK' },
      { fixAction: 'ADD_SITEMAP' },
      { fixAction: 'REQUEST_INDEXING' },
    ]
    for (const partial of fixable) {
      const o = computeIndexFix({ issue: issue(partial), page: noindexPage })
      expect(o.status).toBe('skipped')
      expect(o.detail).toMatch(/P5 disposition KEEP_BUT_SILO/)
      expect(o.newContent).toBeNull()
    }
  })

  it('performs no GitHub write or delegated site-health repair for registered URLs', async () => {
    const items: IndexFixItem[] = COHORT.map((url) => ({
      issue: issue({ url, fixAction: 'REMOVE_NOINDEX' }),
      page: page({ url, content: `export const metadata = { robots: { index: false } }\n\n${WORDS}` }),
    }))

    const result = await resolveIndexCoverage(items, { requestIndexing: false })

    expect(result.outcomes).toHaveLength(8)
    expect(result.outcomes.every((o) => o.status === 'skipped')).toBe(true)
    expect(result.outcomes.every((o) => /P5 disposition KEEP_BUT_SILO/.test(o.detail))).toBe(true)
    expect(result.prUrls).toEqual([])
    expect(result.summary).toEqual({
      fixed: 0,
      delegated: 0,
      recommended: 0,
      skipped: 8,
      failed: 0,
      requested: 0,
    })
    // Fail-closed BEFORE every write surface.
    expect(mockGithubFetch).not.toHaveBeenCalled()
    expect(mockPutRepoFile).not.toHaveBeenCalled()
    expect(mockOpenPullRequest).not.toHaveBeenCalled()
    expect(mockRepairSiteHealth).not.toHaveBeenCalled()
    expect(mockSubmitIndexNow).not.toHaveBeenCalled()
  })

  it('hands a delegated repair the FULL registry protection set without changing the unrelated URL', async () => {
    const registeredUrl = COHORT[3]
    const items: IndexFixItem[] = [
      {
        issue: issue({ url: registeredUrl, fixAction: 'ADD_INTERNAL_LINK' }),
        page: page({ url: registeredUrl }),
      },
      {
        issue: issue({ url: UNRELATED, fixAction: 'ADD_SITEMAP' }),
        page: page({ url: UNRELATED, path: 'app/us/student-visas/x/page.tsx' }),
      },
    ]

    const result = await resolveIndexCoverage(items, { requestIndexing: false })

    const registered = result.outcomes.find((o) => o.url === registeredUrl)!
    const unrelated = result.outcomes.find((o) => o.url === UNRELATED)!
    expect(registered.status).toBe('skipped')
    expect(registered.detail).toMatch(/P5 disposition KEEP_BUT_SILO/)
    // Unrelated URL still reaches the Site Health delegation.
    expect(unrelated.status).toBe('fixed')
    expect(mockRepairSiteHealth).toHaveBeenCalledTimes(1)
    expect(mockRepairSiteHealth).toHaveBeenCalledWith('caseworks', false, {
      protectedUrls: COHORT,
    })
    // The protection set is what stops a repo-wide repair re-expanding the silo.
    expect(mockGithubFetch).not.toHaveBeenCalled()
  })

  it('protects ALL registry URLs even when the delegated batch contains none of them', async () => {
    const items: IndexFixItem[] = [
      {
        issue: issue({ url: UNRELATED, fixAction: 'ADD_INTERNAL_LINK' }),
        page: page({ url: UNRELATED, path: 'app/us/student-visas/x/page.tsx' }),
      },
    ]

    const result = await resolveIndexCoverage(items, { requestIndexing: false })

    expect(result.outcomes[0].status).toBe('fixed')
    // A repo-wide repair is still told to protect every registered cohort URL —
    // the registry, not the current batch, is the floor.
    expect(mockRepairSiteHealth).toHaveBeenCalledTimes(1)
    expect(mockRepairSiteHealth).toHaveBeenCalledWith('caseworks', false, {
      protectedUrls: COHORT,
    })
  })
})
