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
    expect(route).toContain('const [providerGigsRes, providerHeadshotRes, similarGigsRes] = await Promise.all([')
    expect(route).not.toContain("db.from('gig_reviews').select('rating')")
  })
})
