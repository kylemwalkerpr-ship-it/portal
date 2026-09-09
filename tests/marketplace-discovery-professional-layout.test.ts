import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('Marketplace professional discovery layout', () => {
  const filters = read('components/marketplace/FilterSidebar.tsx')
  const landingFilters = read('components/marketplace/LandingDiscoveryControls.tsx')
  const featured = read('components/marketplace/FeaturedBriefsGrid.tsx')
  const gigCard = read('components/marketplace/MarketplaceHero.tsx')
  const controls = read('components/marketplace/FilterControls.tsx')
  const route = read('app/api/marketplace/gigs/route.ts')

  test('desktop discovery uses horizontal marketplace controls instead of a permanent narrow sidebar', () => {
    expect(filters).toContain('label="Service options"')
    expect(filters).toContain('label="Provider details"')
    expect(filters).toContain('label="Budget"')
    expect(filters).toContain('label="Delivery time"')
    expect(filters).toContain('label="Attorneys only"')
    expect(filters).toContain('label="Delivery ≤ 3 days"')
    expect(filters).toContain('grid-template-columns: minmax(0, 1fr) !important')
    expect(filters).toContain('.ys-filter-desktop-row')
    expect(filters).toContain('.ys-filter-popover')
  })

  test('landing exposes real filter destinations and clean category routes', () => {
    expect(landingFilters).toContain('provider_type=attorney')
    expect(landingFilters).toContain('provider_type=consultant')
    expect(landingFilters).toContain('delivery_days=3')
    expect(landingFilters).toContain('min_price=100')
    expect(landingFilters).toContain('max_price=100')
    expect(landingFilters).toContain('const categoryLink = (categoryId: string)')
    expect(landingFilters).toContain('/categories/${encodeURIComponent(categoryId)}')
    expect(landingFilters).not.toContain('category=${encodeURIComponent(category.id)}')
    expect(route).toContain("url.searchParams.getAll('provider_type')")
    expect(route).toContain("url.searchParams.getAll('delivery_days')")
    expect(route).toContain("url.searchParams.get('min_price')")
    expect(route).toContain("url.searchParams.get('max_price')")
  })

  test('featured landing replaces legacy chips with the richer filter bar and roomier four-column cards', () => {
    expect(featured).toContain("import { LandingDiscoveryControls } from '@/components/marketplace/LandingDiscoveryControls'")
    expect(featured).toContain('<LandingDiscoveryControls gigs={gigs} country={country} />')
    expect(featured).toContain('.cw-market .featured .wrap > .filters')
    expect(featured).toContain('display: none !important')
    expect(featured).toContain('grid-template-columns: repeat(4, minmax(0, 1fr))')
    expect(featured).toContain('gap: 34px 24px')
    expect(featured).toContain('aspect-ratio: 16 / 10')
    expect(featured).toContain('background: transparent')
    expect(featured).toContain('border: 0')
  })

  test('service cards are image-first, low-chrome and preserve YouSafe trust signals', () => {
    expect(gigCard).toContain("aspectRatio: '16 / 10'")
    expect(gigCard).toContain("background: 'transparent'")
    expect(gigCard).toContain('Licensed attorney')
    expect(gigCard).toContain('Vetted consultant')
    expect(gigCard).toContain('Escrow protected')
    expect(gigCard).toContain("fontSize: 15")
    expect(gigCard).not.toContain('const trustChip')
  })

  test('sort, result count and active-filter chrome use a quieter discovery hierarchy', () => {
    expect(controls).toContain('Sort by:')
    expect(controls).toContain('All filters')
    expect(controls).toContain('Show results')
    expect(controls).toContain('ys-active-filters')
    expect(controls).toContain('ys-results-count')
    expect(controls).toContain("fontFamily: DISCOVERY_FONT")
  })

  test('mobile keeps a dedicated expanded filter experience while desktop popovers stay hidden there', () => {
    expect(filters).toContain('@media (max-width: 1024px)')
    expect(filters).toContain('.ys-filter-desktop-row { display: none; }')
    expect(filters).toContain('.ys-filter-mobile-expanded { display: block; }')
    expect(landingFilters).toContain('@media (max-width: 700px)')
    expect(landingFilters).toContain('.ys-landing-filter-shortcuts { display: none; }')
  })
})
