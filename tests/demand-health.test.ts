import { pickGscSiteUrl } from '@/lib/gscSites'
import { resolveDemandHealth } from '@/lib/seoEngine/demandHealth'
import { getGscAccess } from '@/lib/gscAuth'
import { loadGscSnapshot } from '@/lib/seoDataLoaders'

jest.mock('@/lib/gscAuth', () => ({
  getGscAccess: jest.fn(),
}))

jest.mock('@/lib/seoDataLoaders', () => ({
  loadGscSnapshot: jest.fn(),
  snapshotAgeDays: jest.requireActual('@/lib/seoDataLoaders').snapshotAgeDays,
  isSnapshotStale: jest.requireActual('@/lib/seoDataLoaders').isSnapshotStale,
}))

const mockAccess = getGscAccess as jest.Mock
const mockSnap = loadGscSnapshot as jest.Mock

describe('pickGscSiteUrl', () => {
  it('prefers the estate sc-domain property', () => {
    expect(pickGscSiteUrl([
      'https://example.com/',
      'sc-domain:yousafeconsultancy.com',
      'https://legal.yousafeconsultancy.com/',
    ])).toBe('sc-domain:yousafeconsultancy.com')
  })

  it('falls back to any yousafeconsultancy property', () => {
    expect(pickGscSiteUrl(['https://other.com/', 'https://legal.yousafeconsultancy.com/']))
      .toBe('https://legal.yousafeconsultancy.com/')
  })
})

describe('resolveDemandHealth', () => {
  beforeEach(() => {
    mockAccess.mockReset()
    mockSnap.mockReset()
  })

  it('reports live GSC when a token is wired — never the 42d snapshot', async () => {
    mockAccess.mockResolvedValue({
      accessToken: 'tok',
      mode: 'oauth',
      siteUrl: 'sc-domain:yousafeconsultancy.com',
    })
    const h = await resolveDemandHealth()
    expect(h.source).toBe('live')
    expect(h.stale).toBe(false)
    expect(h.ageDays).toBe(0)
    expect(h.mode).toBe('oauth')
    expect(mockSnap).not.toHaveBeenCalled()
  })

  it('falls back to the file snapshot (and STALE) only when GSC is not wired', async () => {
    mockAccess.mockResolvedValue(null)
    mockSnap.mockResolvedValue({
      generatedAt: '2026-07-22T13:52:28.068Z',
      topQueries: [{ term: 'visa', clicks: 0, impressions: 10, ctr: 0, position: 40 }],
      topPages: [],
    })
    const h = await resolveDemandHealth()
    expect(h.source).toBe('snapshot')
    expect(h.stale).toBe(true)
    expect(h.ageDays).toBeGreaterThan(14)
  })
})
