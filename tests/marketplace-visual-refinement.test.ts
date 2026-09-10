import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('Marketplace visual refinement layer', () => {
  const layout = read('app/marketplace/layout.tsx')
  const refinement = read('app/marketplace/marketplace-refinement.css')
  const grid = read('app/marketplace/discovery-grid.css')
  const gigCard = read('components/marketplace/MarketplaceHero.tsx')
  const filters = read('components/marketplace/FilterSidebar.tsx')

  test('loads the additive refinement layer after existing marketplace contracts', () => {
    const polish = layout.indexOf("import './marketplace-polish.css'")
    const mobile = layout.indexOf("import './mobile-flow.css'")
    const discovery = layout.indexOf("import './discovery-grid.css'")
    const refinementIndex = layout.indexOf("import './marketplace-refinement.css'")

    expect(polish).toBeGreaterThan(-1)
    expect(mobile).toBeGreaterThan(polish)
    expect(discovery).toBeGreaterThan(mobile)
    expect(refinementIndex).toBeGreaterThan(discovery)
  })

  test('keeps the explicit discovery grid breakpoint contract intact', () => {
    expect(grid).toContain('grid-template-columns: repeat(4, minmax(0, 1fr)) !important')
    expect(grid).toContain('grid-template-columns: repeat(3, minmax(0, 1fr)) !important')
    expect(grid).toContain('grid-template-columns: repeat(2, minmax(0, 1fr)) !important')
    expect(grid).toContain('grid-template-columns: minmax(0, 1fr) !important')
    expect(refinement).toContain('.cw-market .ys-gig-grid')
    expect(refinement).toContain('row-gap: 34px !important')
  })

  test('refines existing discovery controls without replacing their behavior', () => {
    expect(filters).toContain('label="Service options"')
    expect(filters).toContain('label="Provider details"')
    expect(filters).toContain('label="Budget"')
    expect(filters).toContain('label="Delivery time"')
    expect(refinement).toContain('.cw-market .ys-filter-pill')
    expect(refinement).toContain('.cw-market .ys-filter-popover')
    expect(refinement).toContain(".cw-market input[role='combobox']")
  })

  test('preserves genuine social proof and seller-provided imagery contracts', () => {
    expect(gigCard).toContain('const showRating = (gig.avg_rating ?? 0) > 0 && (gig.review_count ?? 0) > 0')
    expect(gigCard).toContain("gig.gallery_images?.[0]?.url || (gig as any).cover_image_url")
    expect(gigCard).toContain('New service')
    expect(refinement).toContain('Do not invent ratings')
  })

  test('protects touch, iOS input sizing and reduced-motion behavior', () => {
    expect(refinement).toContain("font-size: 16px !important; /* prevents iOS focus zoom */")
    expect(refinement).toContain('@media (prefers-reduced-motion: reduce)')
    expect(refinement).toContain('@media (hover: none), (pointer: coarse)')
    expect(refinement).toContain('transform: none !important')
  })

  test('keeps refinement presentation-only by avoiding behavior-bearing route and API edits', () => {
    expect(refinement).not.toContain('/api/')
    expect(refinement).not.toContain('window.location')
    expect(refinement).not.toContain('router.')
    expect(refinement).not.toContain('fetch(')
  })
})
