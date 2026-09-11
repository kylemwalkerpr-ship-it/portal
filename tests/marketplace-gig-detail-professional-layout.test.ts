import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('Marketplace gig professional-service layout', () => {
  const css = read('app/marketplace/gig-detail-professional-layout.css')
  const layout = read('app/marketplace/layout.tsx')
  const gigDetail = read('components/marketplace/GigDetailPage.tsx')

  test('scopes the redesign to gig details instead of marketplace discovery layouts', () => {
    expect(css).toContain('main:has(.ys-gig-overview)')
    expect(css).not.toContain('.cw-market .ys-content-layout {\n  grid-template-columns')
  })

  test('removes the duplicate shell-level provider strip while retaining the boxed seller card', () => {
    expect(layout).not.toContain('<MarketplaceGigTrustBar />')
    expect(layout).not.toContain("import { MarketplaceGigTrustBar }")
    expect(gigDetail).toContain('<SellerProfileCard')
    expect(gigDetail).toContain('onViewProfile={() =>')
    expect(gigDetail).toContain('onMessage={() => gatedChat')
  })

  test('removes the detached provider-like pitch from the hero hierarchy', () => {
    expect(css).toContain('.ys-gig-overview > p')
    expect(css).toContain('display: none !important')
    expect(gigDetail).toContain('<h3 style={sectionTitle}>About This Service</h3>')
    expect(gigDetail).toContain('renderBioMarkdown(gig.description)')
  })

  test('makes the desktop rail package-first and preserves provider trust below checkout', () => {
    expect(css).toContain('.ys-sidebar > :nth-child(2)')
    expect(css).toContain('order: 1 !important')
    expect(css).toContain('.ys-sidebar > :nth-child(3)')
    expect(css).toContain('order: 2 !important')
    expect(css).toContain('.ys-sidebar > :nth-child(1)')
    expect(css).toContain('order: 3 !important')
  })

  test('keeps one deterministic tablet and phone buyer journey', () => {
    expect(css).toContain('@media (max-width: 1024px)')
    expect(css).toContain('.ys-content-layout > .ys-sidebar')
    expect(css).toContain('display: flex !important')
    expect(css).toContain('order: 20 !important')
    expect(css).toContain(':nth-child(1) {\n    order: 10 !important')
    expect(css).toContain(':nth-child(2) {\n    order: 30 !important')
    expect(css).toContain(':nth-child(3) {\n    order: 40 !important')
    expect(css).toContain(':nth-child(4) {\n    order: 50 !important')
    expect(css).toContain(':nth-child(5) {\n    order: 60 !important')
  })

  test('loads the final gig layer after the older marketplace finishing sheets', () => {
    const finishing = layout.indexOf("import './marketplace-card-finishing.css'")
    const gigLayer = layout.indexOf("import './gig-detail-professional-layout.css'")
    expect(finishing).toBeGreaterThan(-1)
    expect(gigLayer).toBeGreaterThan(finishing)
  })
})
