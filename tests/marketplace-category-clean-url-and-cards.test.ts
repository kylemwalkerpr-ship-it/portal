import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const discovery = readFileSync('components/marketplace/GigDiscoveryPage.tsx', 'utf8')
const middleware = readFileSync('middleware.ts', 'utf8')
const categoryLayout = readFileSync('app/marketplace/categories/[categoryId]/layout.tsx', 'utf8')
const categoryCss = readFileSync('app/marketplace/categories/[categoryId]/category-discovery.module.css', 'utf8')
const filters = readFileSync('components/marketplace/FilterSidebar.tsx', 'utf8')
const featured = readFileSync('components/marketplace/FeaturedBriefsGrid.tsx', 'utf8')

describe('marketplace category URL contract', () => {
  it('keeps the route category in API filtering without duplicating it in the browser URL', () => {
    expect(discovery).toContain('const buildBrowserQuery = React.useCallback')
    expect(discovery).toContain("filter((cat) => cat !== categoryId)")
    expect(discovery).toContain('const qs = buildBrowserQuery().toString()')
    expect(discovery).toContain('const params = buildQuery()')
  })

  it('permanently consolidates legacy redundant category query parameters', () => {
    expect(middleware).toContain('stripRedundantCategoryParam')
    expect(middleware).toContain("pathname.match(/^\\/categories\\/([^/]+)\\/?$/)")
    expect(middleware).toContain('NextResponse.redirect(dest, { status: 301 })')
  })
})

describe('marketplace category discovery presentation', () => {
  it('adds a category banner and linked exploration cards with clean path URLs', () => {
    expect(categoryLayout).toContain('className={styles.hero}')
    expect(categoryLayout).toContain('className={styles.cardRail}')
    expect(categoryLayout).toContain('href={`/categories/${item.id}`}')
    expect(categoryLayout).toContain('Vetted specialists')
  })

  it('keeps the roomy discovery work that was already shipped', () => {
    expect(filters).toContain('ys-filter-desktop-row')
    expect(filters).toContain('grid-template-columns: minmax(0, 1fr) !important')
    expect(featured).toContain('grid-template-columns: repeat(4, minmax(0, 1fr))')
    expect(categoryCss).toContain('scroll-snap-type: x proximity')
  })
})
