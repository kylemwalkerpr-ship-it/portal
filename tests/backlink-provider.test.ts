import {
  backlinkSignals,
  fetchBacklinkSnapshot,
  isBacklinkProviderConfigured,
  type BacklinkSnapshot,
} from '@/lib/seoFactory/backlinkProvider'

const SNAPSHOT: BacklinkSnapshot = {
  url: 'https://legal.yousafeconsultancy.com/uk/graduate-route-visa/',
  provider: 'dataforseo',
  fetchedAt: '2026-08-15T00:00:00.000Z',
  totalBacklinks: 120,
  referringDomains: 34,
  referringMainDomains: 22,
  referringPages: 96,
  newBacklinks: 18,
  lostBacklinks: 6,
  brokenBacklinks: 2,
  spamScore: 12,
  domainRank: 38,
  samples: [
    { anchor: 'UK Graduate Route visa', nofollow: false, isNew: true, isLost: false, spamScore: 8, sourceExternalLinks: 4 },
    { anchor: 'graduate visa UK', nofollow: false, isNew: false, isLost: false, spamScore: 15, sourceExternalLinks: 2 },
    { anchor: 'you safe consultancy', nofollow: true, isNew: false, isLost: false, spamScore: 30, sourceExternalLinks: 180 },
    { anchor: 'read more', nofollow: false, isNew: true, isLost: false, spamScore: 5, sourceExternalLinks: 1 },
    { anchor: 'uk graduate visa', nofollow: false, isNew: false, isLost: false, spamScore: 20, sourceExternalLinks: 3 },
  ],
}

describe('Backlink provider — configuration', () => {
  const OLD = { login: process.env.DATAFORSEO_LOGIN, password: process.env.DATAFORSEO_PASSWORD }

  afterEach(() => {
    if (OLD.login === undefined) delete process.env.DATAFORSEO_LOGIN
    else process.env.DATAFORSEO_LOGIN = OLD.login
    if (OLD.password === undefined) delete process.env.DATAFORSEO_PASSWORD
    else process.env.DATAFORSEO_PASSWORD = OLD.password
  })

  it('reports not configured without credentials', () => {
    delete process.env.DATAFORSEO_LOGIN
    delete process.env.DATAFORSEO_PASSWORD
    expect(isBacklinkProviderConfigured()).toBe(false)
  })

  it('reports configured when both credentials exist', () => {
    process.env.DATAFORSEO_LOGIN = 'login'
    process.env.DATAFORSEO_PASSWORD = 'password'
    expect(isBacklinkProviderConfigured()).toBe(true)
  })
})

describe('Backlink provider — signal mapping', () => {
  it('maps a healthy snapshot into 0–1 links signals', () => {
    const s = backlinkSignals({ snapshot: SNAPSHOT, primaryKeyword: 'uk graduate visa', brandTerms: ['yousafe'] })
    expect(s.referringDomains).not.toBeNull()
    expect(s.referringDomains!).toBeGreaterThan(0)
    expect(s.estateInbound).not.toBeNull()
    expect(s.estateInbound).toBeGreaterThan(0)
    // new(18) > lost(6) → velocity above 0.5
    expect(s.linkVelocity!).toBeGreaterThan(0.5)
    // 4 of 5 anchors are natural (brand anchor "you safe consultancy" excluded)
    expect(s.anchorNatural).toBeCloseTo(0.8, 5)
    // spam 12/100 → toxicClean ~0.88 (sampled avg 15.6/100 → ~0.844)
    expect(s.toxicClean!).toBeGreaterThan(0.8)
    // 4 of 5 sampled links are dofollow
    expect(s.editorialLinks).toBeCloseTo(0.8, 5)
    // domain rank 38 → 0.38
    expect(s.domainAuthority).toBeCloseTo(0.38, 5)
  })

  it('reports a losing profile (lost >> new) with velocity below 0.5', () => {
    const s = backlinkSignals({
      snapshot: { ...SNAPSHOT, newBacklinks: 2, lostBacklinks: 30 },
      primaryKeyword: 'uk graduate visa',
    })
    expect(s.linkVelocity!).toBeLessThan(0.5)
  })

  it('returns nulls for every slot on an empty snapshot', () => {
    const s = backlinkSignals({
      snapshot: {
        ...SNAPSHOT,
        totalBacklinks: null, referringDomains: null, newBacklinks: null,
        lostBacklinks: null, spamScore: null, domainRank: null, samples: [],
      },
      primaryKeyword: 'x',
    })
    expect(s.referringDomains).toBeNull()
    expect(s.estateInbound).toBeNull()
    expect(s.linkVelocity).toBeNull()
    expect(s.anchorNatural).toBeNull()
    expect(s.editorialLinks).toBeNull()
  })
})

describe('Backlink provider — fetch', () => {
  const OLD_FETCH = global.fetch
  const OLD = { login: process.env.DATAFORSEO_LOGIN, password: process.env.DATAFORSEO_PASSWORD }

  beforeEach(() => {
    process.env.DATAFORSEO_LOGIN = 'login'
    process.env.DATAFORSEO_PASSWORD = 'password'
  })
  afterEach(() => {
    global.fetch = OLD_FETCH
    if (OLD.login === undefined) delete process.env.DATAFORSEO_LOGIN
    else process.env.DATAFORSEO_LOGIN = OLD.login
    if (OLD.password === undefined) delete process.env.DATAFORSEO_PASSWORD
    else process.env.DATAFORSEO_PASSWORD = OLD.password
  })

  const dfsJson = (payload: unknown, ok = true) =>
    ({ ok, status: ok ? 200 : 401, json: async () => payload }) as Response

  it('returns null when the provider is not configured', async () => {
    delete process.env.DATAFORSEO_LOGIN
    expect(await fetchBacklinkSnapshot('https://example.com/')).toBeNull()
  })

  it('parses a live summary + backlinks response into a snapshot', async () => {
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/summary/live')) {
        return dfsJson({ tasks: [{ result: [{
          target: 'https://legal.yousafeconsultancy.com/uk/graduate-route-visa/',
          backlinks: 120, referring_domains: 34, referring_main_domains: 22,
          referring_pages: 96, new_backlinks: 18, lost_backlinks: 6,
          broken_backlinks: 2, spam_score: 12, domain_rank: 38,
        }] }] })
      }
      return dfsJson({ tasks: [{ result: [
        { anchor: 'UK Graduate Route visa', is_nofollow: false, is_new: true, is_lost: false, spam_score: 8, page_from_external_links: 4 },
        { anchor: 'you safe consultancy', is_nofollow: true, is_new: false, is_lost: false, spam_score: 30, page_from_external_links: 180 },
      ] }] })
    })

    const snap = await fetchBacklinkSnapshot('https://legal.yousafeconsultancy.com/uk/graduate-route-visa/')
    expect(snap).not.toBeNull()
    expect(snap!.provider).toBe('dataforseo')
    expect(snap!.totalBacklinks).toBe(120)
    expect(snap!.referringDomains).toBe(34)
    expect(snap!.newBacklinks).toBe(18)
    expect(snap!.spamScore).toBe(12)
    expect(snap!.domainRank).toBe(38)
    expect(snap!.samples).toHaveLength(2)
    expect(snap!.samples[0]).toMatchObject({ anchor: 'UK Graduate Route visa', nofollow: false, isNew: true })
    // Basic auth header was sent
    const calls = (global.fetch as jest.Mock).mock.calls
    expect(calls[0][1].headers.Authorization).toBe('Basic ' + Buffer.from('login:password').toString('base64'))
  })

  it('degrades to null when both requests fail (e.g. expired balance / bad creds)', async () => {
    global.fetch = jest.fn(async () => dfsJson({ tasks: [{ result: [] }] }, false))
    expect(await fetchBacklinkSnapshot('https://example.com/')).toBeNull()
  })

  it('tolerates a partial failure (summary ok, links list degraded) and keeps summary data', async () => {
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/summary/live')) {
        return dfsJson({ tasks: [{ result: [{ target: 'https://example.com/', backlinks: 40, referring_domains: 12, domain_rank: 25, spam_score: 20 }] }] })
      }
      return dfsJson({ tasks: [{ result: [] }] })
    })
    const snap = await fetchBacklinkSnapshot('https://example.com/')
    expect(snap).not.toBeNull()
    expect(snap!.totalBacklinks).toBe(40)
    expect(snap!.samples).toHaveLength(0)
  })
})
