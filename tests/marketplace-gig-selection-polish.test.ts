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

  test('stretches incomplete final rows instead of leaving empty grid slots', () => {
    expect(css).toContain('.cw-market .gig-grid {')
    expect(css).toContain('display: flex !important')
    expect(css).toContain('flex-wrap: wrap !important')
    expect(css).toContain('.cw-market .gig-grid > .gig-link')
    expect(css).toContain('flex: 1 1 calc((100% - 64px) / 5) !important')
    expect(css).toContain('flex-basis: calc((100% - 48px) / 4) !important')
    expect(css).toContain('flex-basis: calc((100% - 32px) / 3) !important')
    expect(css).toContain('flex-basis: calc((100% - 16px) / 2) !important')
    expect(css).toContain('flex-basis: 100% !important')
  })
})
