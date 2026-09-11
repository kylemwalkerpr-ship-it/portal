import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

const discovery = read('components/marketplace/GigDiscoveryPage.tsx')
const middleware = read('middleware.ts')
const categoryLayout = read('app/marketplace/categories/[categoryId]/layout.tsx')
const categoryPage = read('app/marketplace/categories/[categoryId]/page.tsx')
const categoryCarousel = read('components/marketplace/CategoryRecommendedGigsCarousel.tsx')
const categoryCarouselCss = read('components/marketplace/CategoryRecommendedGigsCarousel.module.css')
const filters = read('components/marketplace/FilterSidebar.tsx')
const featured = read('components/marketplace/FeaturedBriefsGrid.tsx')
const categoryMenu = read('components/marketplace/CategoryMegaDropdown.tsx')
const landingControls = read('components/marketplace/LandingDiscoveryControls.tsx')
const categoriesIndex = read('components/marketplace/MarketplaceCategoriesIndex.tsx')
const smartSearch = read('components/marketplace/SmartSearchBox.tsx')

describe('marketplace category URL contract', () => {
  test('keeps the route category in API filtering without duplicating it in the browser URL', () => {
    expect(discovery).toContain('const buildBrowserQuery = React.useCallback')
    expect(discovery).toContain("filter((cat) => cat !== categoryId)")
    expect(discovery).toContain('const qs = buildBrowserQuery().toString()')
    expect(discovery).toContain('const params = buildQuery()')
  })

  test('permanently consolidates legacy redundant category query parameters', () => {
    expect(middleware).toContain('stripRedundantCategoryParam')
    expect(middleware).toContain("pathname.match(/^\\/categories\\/([^/]+)\\/?$/)")
    expect(middleware).toContain('NextResponse.redirect(dest, { status: 301 })')
  })

  test('emits clean pathname-first category URLs from the visible discovery surfaces', () => {
    expect(categoryMenu).toContain('const path = `/categories/${subId || category.id}`')
    expect(categoryMenu).not.toContain("params.set('category', category.id)")
    expect(landingControls).toContain('const categoryLink = (categoryId: string)')
    expect(landingControls).toContain('/categories/${encodeURIComponent(categoryId)}')
    expect(categoriesIndex).toContain('href={`/categories/${category.id}`}')
    expect(categoriesIndex).not.toContain('href={`/marketplace/categories/${category.id}`}')
    expect(smartSearch).toContain('window.location.href = `/categories/${suggestion.id}`')
    expect(smartSearch).not.toContain('window.location.href = `/marketplace/categories/${suggestion.id}`')
  })
})

describe('marketplace category discovery presentation', () => {
  test('keeps the category banner and the upper exploration cards, with recommendations lower down', () => {
    expect(categoryLayout).toContain('className={styles.hero}')
    expect(categoryLayout).toContain('className={styles.cardRail}')
    expect(categoryLayout).toContain('href={`/categories/${item.id}`}')
    expect(categoryLayout).toContain('Vetted specialists')
    expect(categoryLayout).not.toContain('CategoryRecommendedGigsCarousel')
    expect(categoryPage).toContain('<CategoryRecommendedGigsCarousel')
    expect(categoryCarousel).toContain("requestGigs(categoryId, 'trending'")
    expect(categoryCarousel).toContain('getCategoryFilterTerms')
  })

  test('upgrades the categories index to roomy marketplace cards rather than dashboard tiles', () => {
    expect(categoriesIndex).toContain('Popular on YouSafe')
    expect(categoriesIndex).toContain('ys-category-popular-rail')
    expect(categoriesIndex).toContain('ys-category-popular-card')
    expect(categoriesIndex).toContain('ys-category-grid')
    expect(categoriesIndex).toContain('grid-template-columns: repeat(3, minmax(0,1fr))')
    expect(categoriesIndex).toContain('const DISCOVERY_FONT = "-apple-system')
    expect(categoriesIndex).not.toContain('borderLeft: `4px solid')
  })

  test('keeps the roomy discovery work that was already shipped', () => {
    expect(filters).toContain('ys-filter-desktop-row')
    expect(filters).toContain('grid-template-columns: minmax(0, 1fr) !important')
    expect(featured).toContain('grid-template-columns: repeat(4, minmax(0, 1fr))')
    expect(categoryCarouselCss).toContain('scroll-snap-type: x mandatory')
  })
})
