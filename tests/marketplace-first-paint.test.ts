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

  it('does not leave crawler-only copy visible for four seconds after hydration', () => {
    const gate = read('components/marketplace/SsrHydrateGate.tsx')
    expect(gate).toContain('fallbackMs = 350')
    expect(gate).not.toContain('fallbackMs = 4000')
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

  it('avoids useSearchParams suspension on provider profiles', () => {
    const source = read('components/marketplace/SellerProfilePage.tsx')
    expect(source).not.toContain('useSearchParams')
    expect(source).toContain('ProviderProfileSkeleton')
    expect(source).toContain("new URLSearchParams(window.location.search).get('tab')")
  })

  it('keeps mobile category chevrons behind CSS rather than a post-mount JS swap', () => {
    const bar = read('components/marketplace/CategoryBar.tsx')
    const shell = read('components/marketplace/MarketplaceShell.tsx')
    expect(bar).not.toContain('showChevrons')
    expect(bar).not.toContain('useSearchParams')
    expect(bar).toContain('@media (max-width: 719px)')
    expect(bar).toContain('.ys-cat-chev { display: none !important; }')
    expect(shell).toContain('fallback={<CategoryBarSkeleton />}')
  })

  it('reserves auth chrome until Clerk isLoaded', () => {
    const auth = read('components/marketplace/MarketplaceAuthNav.tsx')
    expect(auth).toContain('isLoaded')
    expect(auth).toContain('AuthNavSkeleton')
    expect(auth).toContain('if (!isLoaded)')
  })
})
