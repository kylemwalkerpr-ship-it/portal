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

  test('moves concise AI-assisted service summary into About while keeping the hero clean', () => {
    expect(css).toContain('.ys-gig-overview > p')
    expect(css).toContain('display: none !important')
    expect(gigDetail).toContain('className="ys-gig-ai-summary"')
    expect(gigDetail).toContain("gig.pitch || gig.seo_description")
    expect(gigDetail).toContain('Condensed from the provider’s service listing')
    expect(gigDetail).toContain('renderBioMarkdown(gig.description)')
    expect(gigDetail).toContain('aria-controls="ys-gig-description"')
    expect(gigDetail).toContain("descriptionExpanded ? 'Show less' : 'Read more'")
  })

  test('moves provider trust above packages while keeping purchase actions directly below it', () => {
    expect(css).toContain('.ys-sidebar > :nth-child(1)')
    expect(css).toContain('order: 1 !important')
    expect(css).toContain('.ys-sidebar > :nth-child(2)')
    expect(css).toContain('order: 2 !important')
    expect(css).toContain('.ys-sidebar > :nth-child(3)')
    expect(css).toContain('order: 3 !important')
  })

  test('keeps the full service title readable and gives it breathing room from breadcrumb navigation', () => {
    expect(gigDetail).toContain('className="ys-gig-breadcrumb-toolbar"')
    expect(gigDetail).not.toContain('<span aria-current="page" style={{ color: T.onPaper }}>{gig.title}</span>')
    expect(css).toContain('max-width: min(100%, 36ch) !important')
    expect(css).toContain('text-wrap: pretty')
    expect(css).toContain('word-break: normal !important')
    expect(css).toContain('margin-bottom: 30px !important')
  })

  test('affixes a provider message launcher that reuses the existing gated chat surface', () => {
    expect(gigDetail).toContain('className="ys-floating-message-launcher"')
    expect(gigDetail).toContain('onClick={() => gatedChat(() => setMsgOpen(true))}')
    expect(gigDetail).toContain('<ChatSidePane')
    expect(css).toContain('.ys-floating-message-launcher')
    expect(css).toContain('position: fixed')
    expect(css).toContain('left: 24px')
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
