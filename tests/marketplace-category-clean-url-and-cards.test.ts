import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

const discovery = read('components/marketplace/GigDiscoveryPage.tsx')
const middleware = read('middleware.ts')
const categoryLayout = read('app/marketplace/categories/[categoryId]/layout.tsx')
const categoryCss = read('app/marketplace/categories/[categoryId]/category-discovery.module.css')
const filters = read('components/marketplace/FilterSidebar.tsx')
const featured = read('components/marketplace/FeaturedBriefsGrid.tsx')

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
})

describe('marketplace category discovery presentation', () => {
  test('adds a category banner and linked exploration cards with clean path URLs', () => {
    expect(categoryLayout).toContain('className={styles.hero}')
    expect(categoryLayout).toContain('className={styles.cardRail}')
    expect(categoryLayout).toContain('href={`/categories/${item.id}`}')
    expect(categoryLayout).toContain('Vetted specialists')
  })

  test('keeps the roomy discovery work that was already shipped', () => {
    expect(filters).toContain('ys-filter-desktop-row')
    expect(filters).toContain('grid-template-columns: minmax(0, 1fr) !important')
    expect(featured).toContain('grid-template-columns: repeat(4, minmax(0, 1fr))')
    expect(categoryCss).toContain('scroll-snap-type: x proximity')
  })
})
