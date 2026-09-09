/// <reference types="jest" />

import fs from 'node:fs'
import path from 'node:path'

describe('Marketplace selected gig and browse-grid polish', () => {
  const root = process.cwd()
  const css = fs.readFileSync(path.join(root, 'app/marketplace-gig-selection-polish.css'), 'utf8')
  const layout = fs.readFileSync(path.join(root, 'app/layout.tsx'), 'utf8')
  const detail = fs.readFileSync(path.join(root, 'components/marketplace/GigDetailPage.tsx'), 'utf8')

  test('loads the polish layer after the profile/gig mobile layer', () => {
    const profileGig = layout.indexOf("import './mobile-marketplace-profile-gig.css'")
    const selectionPolish = layout.indexOf("import './marketplace-gig-selection-polish.css'")
    expect(profileGig).toBeGreaterThan(-1)
    expect(selectionPolish).toBeGreaterThan(profileGig)
  })

  test('keeps real breadcrumb links but presents Marketplace as a home icon', () => {
    expect(detail).toContain('<Link href="/" style={breadcrumbLink}>Marketplace</Link>')
    expect(detail).toContain('href={`/categories/${category.id}`}')
    expect(detail).toContain('href={`/categories/${subcategory.id}`}')
    expect(css).toContain("nav[aria-label='Breadcrumb'] > a:first-child")
    expect(css).toContain('background-image: url("data:image/svg+xml')
    expect(css).toContain("span[aria-current='page']")
    expect(css).toContain('display: none !important')
  })

  test('makes the selected gig H1 the dominant bold title', () => {
    expect(css).toContain('.ys-content-layout h1')
    expect(css).toContain('font-weight: 700 !important')
    expect(css).toContain('text-wrap: balance')
  })

  test('keeps marketplace browse grids four-up on desktop without stretching incomplete rows', () => {
    expect(css).toContain('.cw-market .gig-grid {')
    expect(css).toContain('display: grid !important')
    expect(css).toContain('grid-template-columns: repeat(4, minmax(0, 1fr)) !important')
    expect(css).toContain('grid-template-columns: repeat(3, minmax(0, 1fr)) !important')
    expect(css).toContain('grid-template-columns: repeat(2, minmax(0, 1fr)) !important')
    expect(css).toContain('grid-template-columns: minmax(0, 1fr) !important')
    expect(css).not.toContain('flex: 1 1 calc(')
    expect(css).not.toContain('flex-wrap: wrap !important')
  })
})
