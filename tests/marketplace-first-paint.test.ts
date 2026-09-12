import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('marketplace first paint', () => {
  it('renders the server-seeded provider island without waiting for enrichment', () => {
    const source = read('components/marketplace/SellerProfilePage.tsx')
    expect(source).toContain('initialSeller?: SellerProfile | null')
    expect(source).toContain('React.useState(!initialSeller)')
    expect(source).toContain("signalSsrReady('yousafe:provider-ssr-ready')")
  })

  it('loads provider profile, gigs, and review count in parallel', () => {
    const source = read('components/marketplace/SellerProfilePage.tsx')
    expect(source).toContain('Promise.allSettled([')
    expect(source).toContain('`/api/sellers/${sellerId}/gigs`')
    expect(source).toContain('`/api/sellers/${sellerId}/reviews`')
  })

  it('does not render the legacy crawler-only duplicate before hydration', () => {
    const gate = read('components/marketplace/SsrHydrateGate.tsx')
    expect(gate).toContain('return null')
    expect(gate).not.toContain('data-ssr-seo')
    expect(gate).not.toContain('useEffect')
    expect(gate).not.toContain('useState')
  })

  it('loads category geometry from server-known CSS before the client component hydrates', () => {
    const layout = read('app/marketplace/layout.tsx')
    const css = read('app/marketplace/marketplace-first-paint.css')
    expect(layout).toContain("import './marketplace-first-paint.css'")
    expect(css).toContain('.cw-market .ys-cat-bar')
    expect(css).toContain('.cw-market .ys-cat-strip')
    expect(css).toContain('display: flex;')
    expect(css).toContain('height: 52px;')
    expect(css).toContain('.cw-market .ys-cat-chev')
    expect(css).toContain('position: absolute;')
    expect(css).toContain('@media (max-width: 719px)')
  })

  it('fans out independent gig enrichments and removes the unused reviews query', () => {
    const route = read('app/api/marketplace/gigs/[slug]/route.ts')
    expect(route).toContain('const [providerGigsRes, providerHeadshotRes, sameCategoryRes, sameJurisdictionRes] = await Promise.all([')
    expect(route).not.toContain("db.from('gig_reviews').select('rating')")
  })

  it('seeds GigDetailPage from SSR so navigation is not a bare LoadingState shell', () => {
    const page = read('app/marketplace/gigs/[slug]/page.tsx')
    const island = read('components/marketplace/GigDetailPage.tsx')
    expect(page).toContain('initialGig={gig ? {')
    expect(island).toContain('initialGig?: any | null')
    expect(island).toContain('GigDetailSkeleton')
    expect(island).toContain('React.useState(!seeded)')
    expect(island).not.toContain('<LoadingState label="Loading gig details..." />')
  })

  it('keeps provider ?tab= reactive without a bare loading shell', () => {
    const source = read('components/marketplace/SellerProfilePage.tsx')
    expect(source).toContain('ProviderProfileSkeleton')
    expect(source).toContain('SellerTabSearchSync')
    expect(source).toContain('useSearchParams')
    expect(source).toContain('fallback={null}')
    expect(source).not.toContain('<LoadingState')
    expect(source).toContain("searchParams.get('tab')")
  })

  it('updates active tab on query-only / back-forward ?tab= changes', () => {
    const source = read('components/marketplace/SellerProfilePage.tsx')
    // Regression: previously keyed only [sellerId] + window.location, so same-path
    // ?tab=about → ?tab=gigs (and popstate) left the panel stale.
    expect(source).toContain('SellerTabSearchSync')
    expect(source).toMatch(/searchParams\.get\('tab'\)/)
    expect(source).toMatch(/\[tab, onTab\]/)
    expect(source).toContain("VALID_TABS")
  })

  it('keeps mobile category chevrons behind CSS rather than a post-mount JS swap', () => {
    const bar = read('components/marketplace/CategoryBar.tsx')
    const shell = read('components/marketplace/MarketplaceShell.tsx')
    expect(bar).not.toContain('showChevrons')
    expect(bar).toContain('@media (max-width: 719px)')
    expect(bar).toContain('.ys-cat-chev { display: none !important; }')
    expect(shell).toContain('fallback={<CategoryBarSkeleton />}')
  })

  it('reacts to same-path ?category= changes for the active highlight', () => {
    const bar = read('components/marketplace/CategoryBar.tsx')
    const shell = read('components/marketplace/MarketplaceShell.tsx')
    // Regression: effect keyed only [pathname, country] + window.location left
    // ?category=A → ?category=B on the same path with a stale highlight.
    expect(bar).toContain('useSearchParams')
    expect(bar).toContain("searchParams.get('category')")
    expect(bar).not.toContain("window.location.search).get('category')")
    // Non-null structural Suspense fallback must remain.
    expect(shell).toContain('fallback={<CategoryBarSkeleton />}')
    expect(shell).toMatch(/CategoryBarSkeleton/)
  })

  it('reserves auth chrome until Clerk isLoaded', () => {
    const auth = read('components/marketplace/MarketplaceAuthNav.tsx')
    expect(auth).toContain('isLoaded')
    expect(auth).toContain('AuthNavSkeleton')
    expect(auth).toContain('if (!isLoaded)')
  })

  it('marks only Browse active for signed-in users on marketplace browse', () => {
    const shell = read('components/marketplace/MarketplaceShell.tsx')
    expect(shell).toContain("const homeCurrent = role === null && !shopActive && activeView === 'browse'")
    expect(shell).toContain("? role === null && !shopActive && activeView === 'browse'")
  })

  it('fails the hero video closed to a poster fallback instead of eager retrying', () => {
    const landing = read('app/marketplace/PublicMarketplaceLanding.tsx')
    const mediaPath = path.join(root, 'components/marketplace/HeroBackgroundMedia.tsx')
    const exists = fs.existsSync(mediaPath)
    expect(exists).toBe(true)
    if (!exists) return
    const media = fs.readFileSync(mediaPath, 'utf8')
    expect(landing).toContain("import { HeroBackgroundMedia } from '@/components/marketplace/HeroBackgroundMedia'")
    expect(landing).toContain('<HeroBackgroundMedia />')
    expect(landing).not.toContain('preload="auto"')
    expect(media).toContain('preload="metadata"')
    expect(media).toContain('onError={() => setFailed(true)}')
    expect(media).toContain('video.play()')
    expect(media).toContain('hero-media-poster')
  })
})