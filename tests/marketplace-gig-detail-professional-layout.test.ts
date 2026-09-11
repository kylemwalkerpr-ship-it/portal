import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('Marketplace gig professional-service layout', () => {
  const css = read('app/marketplace/gig-detail-professional-layout.css')
  const layout = read('app/marketplace/layout.tsx')
  const gigDetail = read('components/marketplace/GigDetailPage.tsx')
  const chatPane = read('components/marketplace/ChatSidePane.tsx')

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

  test('makes the affixed provider message launcher more discoverable without removing motion accessibility', () => {
    expect(gigDetail).toContain('className="ys-floating-message-launcher"')
    expect(gigDetail).toContain('onClick={() => gatedChat(() => setMsgOpen(true))}')
    expect(css).toContain('.ys-floating-message-launcher')
    expect(css).toContain('position: fixed')
    expect(css).toContain('left: 24px')
    expect(css).toContain('min-height: 66px')
    expect(css).toContain('@keyframes ys-message-beam')
    expect(css).toContain('@keyframes ys-message-attention')
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
    expect(css).toContain('animation: none !important')
  })

  test('opens gig messaging as an anchored in-page popover backed by the unified messenger', () => {
    expect(gigDetail).toContain('<ChatSidePane')
    expect(gigDetail).toContain('presentation="popover"')
    expect(gigDetail).toContain('responseTime={gig.provider_response_time || null}')
    expect(gigDetail).toContain('serviceTitle={gig.title}')
    expect(chatPane).toContain("presentation?: 'drawer' | 'popover'")
    expect(chatPane).toContain("const isPopover = presentation === 'popover'")
    expect(chatPane).toContain("fetch('/api/messages/start'")
    expect(chatPane).toContain('className="ys-gig-message-popover-shell"')
    expect(chatPane).toContain('className={`yousafe-messenger chat-side-pane ${isPopover ? \'ys-gig-message-popover\' : \'\'}`}')
    expect(css).toContain('.ys-gig-message-popover')
    expect(css).toContain('height: min(650px, calc(100dvh - 110px))')
  })

  test('includes useful pre-order messaging affordances without inventing provider timezone data', () => {
    expect(chatPane).toContain('const MAX_GIG_DRAFT = 2500')
    expect(chatPane).toContain('ys-gig-chat-availability')
    expect(chatPane).toContain('ys-gig-chat-starters')
    expect(chatPane).toContain('What documents or information should I send before we start?')
    expect(chatPane).toContain('Can you confirm the likely timeline and what you need from me?')
    expect(chatPane).toContain('{draft.length}/{MAX_GIG_DRAFT}')
    expect(chatPane).toContain('allowVoice={!isPopover}')
    expect(chatPane).toContain('<AutoGrowInput')
    expect(chatPane).toContain('Open in Messages →')
    expect(chatPane).not.toContain('providerTimezone')
    expect(css).toContain('.ys-gig-chat-starters button')
    expect(css).toContain('.ys-gig-chat-availability.is-away')
  })

  test('keeps the gig messaging popover mobile-safe', () => {
    expect(css).toContain('@media (max-width: 700px)')
    expect(css).toContain('.ys-gig-message-popover {\n    position: fixed;\n    inset: 0;')
    expect(css).toContain('width: 100vw')
    expect(css).toContain('height: 100dvh')
    expect(css).toContain('.ys-gig-chat-starters button {\n    width: 100%;')
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
