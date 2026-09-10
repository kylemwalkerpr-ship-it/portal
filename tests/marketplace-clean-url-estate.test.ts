import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

const middleware = read('middleware.ts')
const sitemap = read('app/sitemap.ts')
const gigPage = read('app/marketplace/gigs/[slug]/page.tsx')
const gigApi = read('app/api/marketplace/gigs/[slug]/route.ts')
const seo = read('lib/marketplaceSeo.ts')
const authShell = read('components/auth-shell.tsx')

const publicUrlEmitters = [
  'components/marketplace/MarketplaceProvidersIndex.tsx',
  'components/marketplace/GigDiscoveryPage.tsx',
  'components/marketplace/GigDetailComponents.tsx',
  'components/marketplace/SellerProfileComponents.tsx',
  'components/marketplace/CategoryRecommendedGigsCarousel.tsx',
  'components/marketplace/GigDetailPage.tsx',
  'components/marketplace/TrendingOpportunities.tsx',
  'components/marketplace/MarketplaceAuthNav.tsx',
  'components/marketplace/MarketplaceShell.tsx',
  'components/marketplace/BuyerDashboardWidgets.tsx',
  'components/marketplace/MessageOfferCard.tsx',
  'components/cart/CartIcon.tsx',
  'components/seller/SellerMarketplaceView.tsx',
  'components/seller/SellerGigCard.tsx',
  'components/design/admin-gigs.jsx',
  'components/design/consultant-overview.jsx',
  'components/design/landing/Nav.tsx',
  'components/design/student.jsx',
  'components/design/fiverr-workbench.jsx',
  'app/marketplace/cart/page.tsx',
  'app/marketplace/order/success/page.tsx',
  'app/marketplace/PublicMarketplaceLanding.tsx',
  'lib/orderLinks.ts',
  'lib/seoFactory/ownership.ts',
  'lib/seoFactory/providerAuthors.ts',
]

const retiredRelativeLiteral = /['"`]\/marketplace(?=[/?'"`])/g
const retiredAbsoluteMarketUrl = /https:\/\/market\.yousafeconsultancy\.com\/marketplace(?=[/?'"`])/g

function runtimeLines(file: string): string[] {
  return read(file)
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim()
      return !trimmed.startsWith('//') && !trimmed.startsWith('/*') && !trimmed.startsWith('*')
    })
}

describe('Marketplace public URL retirement', () => {
  test('hard-404s the retired /marketplace namespace on both public hosts', () => {
    expect(middleware).toContain("const isLegacyMarketplacePath = pathname === '/marketplace' || pathname.startsWith('/marketplace/')")
    expect(middleware).toContain('(hostname === MARKET_HOST || hostname === PORTAL_HOST) && isLegacyMarketplacePath')
    expect(middleware).toContain("return new NextResponse('Not Found', {")
    expect(middleware).toContain('status: 404')
  })

  test('keeps clean market URLs as browser-facing paths while rewriting only internally', () => {
    expect(middleware).toContain('const rewrite = new URL(`/marketplace${pathname}${search}`, req.url)')
    expect(middleware).toContain('NextResponse.rewrite(rewrite)')
    expect(seo).toContain("const stripped = normalized.replace(/^\\/marketplace(?=\\/|$)/, '') || '/'")
  })

  test('emits clean gig URLs from metadata, slug aliases, API SEO and sitemap', () => {
    expect(gigPage).toContain('getMarketplaceCanonicalUrl(`/gigs/${slug}`)')
    expect(gigPage).toContain('permanentRedirect(`/gigs/${redirected}`)')
    expect(gigPage).not.toContain('permanentRedirect(`/marketplace/gigs/${redirected}`)')
    expect(gigApi).toContain('canonical_path: `/gigs/${gig.slug}`')
    expect(sitemap).toContain('url: `${base}${clean(`/gigs/${gig.slug}`)}`')
    expect(sitemap).toContain('url: `${base}${clean(`/providers/${token}`)}`')
    expect(sitemap).not.toContain('mp(`/marketplace')
  })

  test('does not retain public redirect compatibility through auth return targets', () => {
    expect(authShell).toContain("const MARKET_ORIGIN = 'https://market.yousafeconsultancy.com'")
    expect(authShell).toContain("value === '/marketplace'")
    expect(authShell).toContain('return `${MARKET_ORIGIN}${cleanPath}${url.search}${url.hash}`')
    expect(authShell).not.toContain('window.location.replace')
  })

  test.each(publicUrlEmitters)('%s emits no retired public Marketplace URL', (file) => {
    const runtime = runtimeLines(file).join('\n')
    expect(runtime.match(retiredRelativeLiteral) ?? []).toHaveLength(0)
    expect(runtime.match(retiredAbsoluteMarketUrl) ?? []).toHaveLength(0)
  })
})
