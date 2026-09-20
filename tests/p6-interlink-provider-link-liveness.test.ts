/**
 * P6 final repair — PROMPT / PROVIDER LINK FAIL-CLOSED PARITY.
 *
 * · `pipeline.ts` (non-stream) now prunes automatic input/planner interlinks
 *   through the same live internal-URL authority the stream already used;
 * · provider/profile/gig marketplace citation links are verified through the
 *   repository's ACTUAL HTTP liveness authority (`verifyUrlsLive` +
 *   `classifyLiveStatus`) on BOTH surfaces — the estate helper's
 *   `isProtectedMarketplaceUrl` exemption is never treated as proof;
 * · a verifier throw withholds every provider link, dead links are withheld,
 *   no replacement is invented, and the author citation metadata survives.
 */
import fs from 'node:fs'
import path from 'node:path'

jest.mock('@/lib/seoFactory/linkAudit', () => ({
  verifyUrlsLive: jest.fn(),
  classifyLiveStatus: jest.fn(),
}))

import { classifyLiveStatus, verifyUrlsLive } from '@/lib/seoFactory/linkAudit'
import {
  authorPackFromPrunedCitations,
  pruneProviderAuthorLinks,
  verifyMarketplaceServiceUrlsLive,
} from '@/lib/seoFactory/interlinkInjection'
import {
  authorPackFromProvider,
  citedProvidersPromptBlock,
  type CitedProvider,
} from '@/lib/seoFactory/providerAuthors'
import { renderBriefRules, renderWriterRules } from '@/lib/seoFactory/contentQualityPlaybook'

const verifyUrlsLiveMock = jest.mocked(verifyUrlsLive)
const classifyLiveStatusMock = jest.mocked(classifyLiveStatus)

const PROFILE = 'https://market.yousafeconsultancy.com/providers/jordan-hale'
const GIG = 'https://market.yousafeconsultancy.com/gigs/h1b-petition-review'
const DEAD_GIG = 'https://market.yousafeconsultancy.com/gigs/does-not-exist'
const OFF_HOST = 'https://legal.yousafeconsultancy.com/us/student-visas/'

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8')

function person(overrides: Partial<CitedProvider> = {}): CitedProvider {
  return {
    profileId: 'a-us',
    username: 'jordan-hale',
    credentialType: 'Attorney',
    barNumber: null,
    showBarNumber: false,
    barState: 'New York',
    yearsExperience: 9,
    tagline: null,
    practiceAreas: ['immigration'],
    specialties: ['work visas'],
    jurisdictions: ['US'],
    gigs: [
      { slug: 'h1b-petition-review', title: 'H-1B petition review', category: 'work visa', jurisdiction: 'US' },
    ],
    score: 0.9,
    name: 'Jordan Hale',
    credentialLine: 'Attorney · New York',
    role: 'attorney',
    experienceScope: 'immigration',
    matchReasons: ['immigration overlap'],
    profileUrl: PROFILE,
    servicePages: [{ title: 'H-1B petition review', url: GIG, match: 'work visa service' }],
    ...overrides,
  }
}

beforeEach(() => jest.clearAllMocks())

describe('A) pruneProviderAuthorLinks — fail closed, never invent, keep metadata', () => {
  it('keeps only the links the verifier proved live', async () => {
    const result = await pruneProviderAuthorLinks(
      [
        { label: 'profile', url: PROFILE },
        { label: 'dead gig', url: DEAD_GIG },
      ],
      [person()],
      async () => [PROFILE],
    )

    expect(result.ok).toBe(true)
    expect(result.links.map((link) => link.url)).toEqual([PROFILE])
    expect(result.verified).toBe(1)
    // Candidate URLs = the profile link + the dead link + the cited gig = 3;
    // only the profile was proven live, so 2 are withheld.
    expect(result.withheld).toBe(2)
  })

  it('withholds EVERY provider link when verification throws, keeping citation metadata', async () => {
    const result = await pruneProviderAuthorLinks(
      [{ label: 'profile', url: PROFILE }],
      [person()],
      async () => {
        throw new Error('liveness authority unreachable')
      },
    )

    expect(result.ok).toBe(false)
    expect(result.verifierUnavailable).toBe(true)
    expect(result.links).toEqual([])
    expect(result.error).toBe('liveness authority unreachable')
    expect(result.withheld).toBe(2)
    // Author citation metadata survives; only the unverified URLs disappear.
    expect(result.cited).toHaveLength(1)
    expect(result.cited[0]).toMatchObject({ name: 'Jordan Hale', credentialLine: 'Attorney · New York' })
    expect(result.cited[0].profileUrl).toBe('')
    expect(result.cited[0].servicePages).toEqual([])
    expect(citedProvidersPromptBlock(result.cited)).toContain('Jordan Hale')
  })

  it('withholds dead links on a mixed-live verdict and keeps the live one', async () => {
    const result = await pruneProviderAuthorLinks(
      [
        { label: 'profile', url: PROFILE },
        { label: 'dead gig', url: DEAD_GIG },
      ],
      [person()],
      async () => [PROFILE],
    )

    expect(result.links.map((link) => link.url)).toEqual([PROFILE])
    expect(result.cited[0].profileUrl).toBe(PROFILE)
    expect(result.cited[0].servicePages).toEqual([])
  })

  it('withholds candidates that carry no URL instead of passing them through', async () => {
    const result = await pruneProviderAuthorLinks([{ label: 'no url' }], [], async () => [])

    expect(result).toMatchObject({ links: [], ok: true, withheld: 0 })
  })

  it('counts DISTINCT normalized withheld URLs (slash variants never inflate the count)', async () => {
    const result = await pruneProviderAuthorLinks(
      [
        { label: 'profile', url: PROFILE },
        { label: 'profile slash variant', url: `${PROFILE}/` },
        { label: 'dead gig', url: DEAD_GIG },
      ],
      [],
      async () => [],
    )

    // A successful verification that proved nothing live is NOT a verifier
    // failure, and the two profile spellings are ONE withheld target.
    expect(result.verifierUnavailable).toBe(false)
    expect(result.verified).toBe(0)
    expect(result.withheld).toBe(2)
  })
})

/** Minimal brief/writer rule input rendered from the (pruned) spec author. */
function specForAuthor(author: ReturnType<typeof authorPackFromPrunedCitations>) {
  return {
    version: '1.0.0',
    jobId: 'job-1',
    contentType: 'legal_guide',
    region: 'us',
    indexable: true,
    primaryKeyword: 'h1b petition',
    requiredKeywords: [{ phrase: 'h1b petition', kind: 'short' as const }],
    wordBudget: { min: 800, target: 1200, max: 1600 },
    verifiedEstateLinks: [],
    approvedSources: [],
    ymyl: { disclaimerRequired: true },
    aeoGeo: { answerFirst: true, faqRequired: true },
    author,
  }
}

describe('D) H1 — the ContentSpec/playbook/prompt author pack comes from PRUNED citations', () => {
  it('a dead profile URL disappears from cited links AND spec/playbook/prompt URL surfaces', async () => {
    const pruned = await pruneProviderAuthorLinks(
      [
        { label: 'profile', url: PROFILE },
        { label: 'dead gig', url: DEAD_GIG },
      ],
      [person()],
      async () => [],
    )
    const pack = authorPackFromPrunedCitations(authorPackFromProvider(person()), pruned.cited)

    // Cited links are gone (verifier proved nothing live)…
    expect(pruned.links).toEqual([])
    expect(pruned.cited[0].profileUrl).toBe('')
    expect(pruned.cited[0].servicePages).toEqual([])
    // …and the author pack metadata survives WITHOUT the unverified URL keys.
    expect(pack).not.toBeNull()
    expect(pack).toMatchObject({
      name: 'Jordan Hale',
      credential: 'Attorney · New York',
      experienceScope: 'immigration',
      providerType: 'attorney',
    })
    expect(pack && 'marketplaceUrl' in pack).toBe(false)
    expect(pack?.servicePages).toBeUndefined()
    // ContentSpec validation rejects an empty marketplaceUrl, so the key must
    // be absent — never `''` — or the whole spec would be nulled.

    // The playbook/brief/writer surfaces show the named author and NOT the URL.
    for (const surface of [renderBriefRules(specForAuthor(pack)), renderWriterRules(specForAuthor(pack))]) {
      expect(surface).toContain('Jordan Hale')
      expect(surface).toContain('Attorney · New York')
      expect(surface).not.toContain(PROFILE)
      expect(surface).not.toContain(DEAD_GIG)
    }
    // The provider prompt block also drops the mandatory URL line, keeping the citation.
    const prompt = citedProvidersPromptBlock(pruned.cited)
    expect(prompt).toContain('Jordan Hale')
    expect(prompt).not.toContain(PROFILE)
    expect(prompt).not.toContain('You MUST include each listed marketplace URL')
  })

  it('mixed-live keeps ONLY the proven profile/gig URLs in the author pack', async () => {
    const pruned = await pruneProviderAuthorLinks(
      [
        { label: 'profile', url: PROFILE },
        { label: 'dead gig', url: DEAD_GIG },
      ],
      [person()],
      async () => [PROFILE, GIG],
    )
    const pack = authorPackFromPrunedCitations(authorPackFromProvider(person()), pruned.cited)

    expect(pack?.marketplaceUrl).toBe(PROFILE)
    expect(pack?.servicePages?.map((page) => page.url)).toEqual([GIG])
    expect(JSON.stringify(pack)).not.toContain(DEAD_GIG)
  })

  it('a verifier throw withholds every URL but never drops author metadata', async () => {
    const pruned = await pruneProviderAuthorLinks(
      [{ label: 'profile', url: PROFILE }],
      [person()],
      async () => {
        throw new Error('liveness authority unreachable')
      },
    )
    const pack = authorPackFromPrunedCitations(authorPackFromProvider(person()), pruned.cited)

    expect(pruned.ok).toBe(false)
    expect(pack?.name).toBe('Jordan Hale')
    expect(pack && 'marketplaceUrl' in pack).toBe(false)
    expect(pack?.servicePages).toBeUndefined()
    expect(JSON.stringify(pack)).not.toContain(PROFILE)
    expect(JSON.stringify(pack)).not.toContain(GIG)
  })

  it('both pipeline surfaces derive the spec author from the PRUNED citation state', () => {
    for (const rel of ['lib/seoFactory/pipeline.ts', 'lib/seoFactory/pipelineStream.ts']) {
      const body = read(rel)
      const deriveAt = body.indexOf('authorPackFromPrunedCitations(providerAuthors.author')
      const specAt = body.indexOf('resolveContentSpecForJob({')
      expect(deriveAt).toBeGreaterThan(0)
      expect(specAt).toBeGreaterThan(deriveAt)
      // The raw unverified pack is never allowed to feed the spec/prompt.
      expect(body).not.toMatch(/author:\s*providerAuthors\.author\s*\|\|\s*undefined/)
      expect(body).toMatch(/author:\s*authorPack\s*\|\|\s*undefined/)
    }
  })
})

describe('B) verifyMarketplaceServiceUrlsLive — real HTTP authority, no exemption trust', () => {
  it('verifies marketplace provider/gig URLs with verifyUrlsLive + classifyLiveStatus', async () => {
    verifyUrlsLiveMock.mockResolvedValue(
      new Map([
        [PROFILE, { ok: true, status: 200, finalUrl: PROFILE, at: 1 }],
        [GIG, { ok: false, status: 404, finalUrl: GIG, at: 1 }],
      ]),
    )
    classifyLiveStatusMock.mockImplementation((_url: string, status: number) => ({
      ok: status >= 200 && status < 400,
      blocker: status >= 400,
      code: 'dead_internal_link',
      message: '',
    }))

    const live = await verifyMarketplaceServiceUrlsLive([PROFILE, GIG])

    // Both marketplace URLs were really checked (the protected-marketplace
    // exemption is a sitemap-coverage exemption, never proof).
    expect(verifyUrlsLiveMock).toHaveBeenCalledWith([PROFILE, GIG])
    expect(live).toEqual([PROFILE])
  })

  it('never verifies (or trusts) a non-marketplace URL', async () => {
    verifyUrlsLiveMock.mockResolvedValue(new Map())

    expect(await verifyMarketplaceServiceUrlsLive([OFF_HOST])).toEqual([])
    expect(verifyUrlsLiveMock).not.toHaveBeenCalled()
  })

  it('withholds a marketplace URL whose HTTP check did not observe it', async () => {
    verifyUrlsLiveMock.mockResolvedValue(new Map())
    classifyLiveStatusMock.mockReturnValue({
      ok: true,
      blocker: false,
      code: 'dead_internal_link',
      message: '',
    })

    expect(await verifyMarketplaceServiceUrlsLive([PROFILE])).toEqual([])
  })
})

describe('C) both pipeline surfaces prune BEFORE building the prompt', () => {
  it('pipeline (non-stream) prunes automatic interlinks and provider links', () => {
    const body = read('lib/seoFactory/pipeline.ts')
    const pruneAt = body.search(/pruneInterlinksToLiveTargets\(\s*automaticInput/)
    const providerPruneAt = body.indexOf('pruneProviderAuthorLinks(')
    const promptAt = body.indexOf('const system = buildFactorySystemPrompt({')

    expect(pruneAt).toBeGreaterThan(0)
    expect(providerPruneAt).toBeGreaterThan(0)
    expect(promptAt).toBeGreaterThan(0)
    expect(pruneAt).toBeLessThan(promptAt)
    expect(providerPruneAt).toBeLessThan(promptAt)
    // The prompt/allowlists consume the pruned list, never the raw input.
    expect(body).toMatch(/interlinkAllowlist: automaticInterlinks/)
    expect(body).not.toMatch(/interlinkAllowlist: providerInterlinks/)
    expect(body).toMatch(/citedProviders,/)
    // The verifier is the repository HTTP authority, not a sitemap exemption.
    expect(body).toContain('verifyMarketplaceServiceUrlsLive')
  })

  it('pipelineStream verifies provider links before the prompt allowlist is built', () => {
    const body = read('lib/seoFactory/pipelineStream.ts')
    const providerPruneAt = body.indexOf('pruneProviderAuthorLinks(')
    const providerPushAt = body.indexOf('radarInterlinks.push({ label: link.label')
    const promptAt = body.indexOf('const system = buildFactorySystemPrompt({')

    expect(providerPruneAt).toBeGreaterThan(0)
    expect(providerPushAt).toBeGreaterThan(providerPruneAt)
    expect(promptAt).toBeGreaterThan(providerPushAt)
    expect(body).toContain('verifyMarketplaceServiceUrlsLive')
    expect(body).toMatch(/citedProviders,/)
    // A withheld provider link is observable, never silent.
    expect(body).toContain('no unverified link injected')
  })

  it('the author prompt block drops the mandatory URL line when no URL verified', () => {
    const withUrls = citedProvidersPromptBlock([person()])
    expect(withUrls).toContain('You MUST include each listed marketplace URL')
    expect(withUrls).toContain(PROFILE)

    const withoutUrls = citedProvidersPromptBlock([
      person({ profileUrl: '', servicePages: [] }),
    ])
    expect(withoutUrls).toContain('Jordan Hale')
    expect(withoutUrls).not.toContain('You MUST include each listed marketplace URL')
  })
})
