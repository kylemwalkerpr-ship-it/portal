import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('Marketplace live-audit polish regressions', () => {
  const categoriesPage = read('app/marketplace/categories/page.tsx')
  const gigDetail = read('components/marketplace/GigDetailPage.tsx')
  const gigComponents = read('components/marketplace/GigDetailComponents.tsx')
  const sellerComponents = read('components/marketplace/SellerProfileComponents.tsx')
  const sellerPage = read('components/marketplace/SellerProfilePage.tsx')
  const discoveryCard = read('components/marketplace/MarketplaceHero.tsx')
  const trustBar = read('components/marketplace/MarketplaceGigTrustBar.tsx')

  test('renders one authoritative category directory instead of the legacy SEO directory plus the interactive directory', () => {
    expect(categoriesPage).toContain('return <MarketplaceCategoriesIndex />')
    expect(categoriesPage).not.toContain('CategoriesIndexSeo')
  })

  test('puts the semantic service title before the gallery and never falls back to zero-valued reputation', () => {
    const overview = gigDetail.indexOf('className="ys-gig-overview"')
    const gallery = gigDetail.indexOf('<img style={gigImage}')
    expect(overview).toBeGreaterThan(-1)
    expect(gallery).toBeGreaterThan(overview)
    expect(gigDetail).toContain('hasServiceRating')
    expect(gigDetail).toContain('hasServiceOrders')
    expect(gigDetail).toContain('New service')
    expect(gigDetail).not.toContain("gig.avg_rating?.toFixed(1) || '0'")
    expect(gigDetail).not.toContain('{gig.review_count || 0} reviews')
    expect(gigDetail).not.toContain('{gig.order_count || 0} orders')
  })

  test('gates gig-sidebar ratings and orders while preserving genuine response-time and messaging controls', () => {
    expect(gigComponents).toContain('const hasRating = reviewCount > 0 && averageRating > 0')
    expect(gigComponents).toContain('const hasOrders = orderCount > 0')
    expect(gigComponents).toContain('{hasRating && (')
    expect(gigComponents).toContain('{hasOrders && (')
    expect(gigComponents).toContain('{seller.response_time && (')
    expect(gigComponents).toContain('onMessage()')
  })

  test('provider profiles only promote populated historical performance metrics', () => {
    expect(sellerComponents).toContain('if (stats.length === 0) return null')
    expect(sellerComponents).toContain('completedOrders > 0')
    expect(sellerComponents).toContain('activeServices > 0')
    expect(sellerComponents).not.toContain("value: seller.rating_avg ? `${seller.rating_avg}★` : 'N/A'")
    expect(sellerComponents).not.toContain("seller.total_orders?.toLocaleString() || '0'")
    expect(sellerComponents).not.toContain('Orders in Queue')
  })

  test('uses the clean Marketplace root and compact public provider names without changing chat counterpart identity', () => {
    expect(gigDetail).toContain('<Link href="/" style={breadcrumbLink}>Marketplace</Link>')
    expect(sellerPage).toContain('<Link href="/" style={breadcrumbLink}>Marketplace</Link>')
    expect(gigDetail).toContain('attorneyName={publicProviderName}')
    expect(gigDetail).toContain('counterpartProfileId={gig.provider_id}')
    expect(sellerPage).toContain('counterpartProfileId={seller.profile_id || seller.id}')
    expect(trustBar).toContain('providerDisplayName(')
  })

  test('formats whole-dollar discovery prices with locale thousands separators', () => {
    expect(discoveryCard).toContain("Math.round(gig.starting_price / 100).toLocaleString('en-US')")
  })
})
