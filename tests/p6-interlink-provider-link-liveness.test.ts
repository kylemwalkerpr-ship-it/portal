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
  pruneProviderAuthorLinks,
  verifyMarketplaceServiceUrlsLive,
} from '@/lib/seoFactory/interlinkInjection'
import { citedProvidersPromptBlock, type CitedProvider } from '@/lib/seoFactory/providerAuthors'

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

    expect(result).toMatchObject({ links: [], ok: true })
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
    const pruneAt = body.indexOf('pruneInterlinksToLiveTargets(automaticInput')
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
