import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('marketplace footer coverage', () => {
  it('mounts the route-aware footer alongside MarketplaceShell', () => {
    const layout = read('app/marketplace/layout.tsx')
    expect(layout).toContain('MarketplaceRouteFooter')
    expect(layout).toContain('<MarketplaceRouteFooter />')
  })

  it('covers public category, gig, and provider path shapes without duplicating the landing footer', () => {
    const source = read('components/marketplace/MarketplaceRouteFooter.tsx')
    expect(source).toContain("replace(/^\\/marketplace(?=\\/|$)/, '')")
    expect(source).toContain('categories|gigs|providers')
    expect(source).toContain('if (!needsSharedFooter) return null')
  })

  it('keeps both floating chat launchers and the desktop gig messenger above the footer', () => {
    const routeFooter = read('components/marketplace/MarketplaceRouteFooter.tsx')
    const footer = read('components/marketplace/MarketplaceFooter.tsx')

    expect(footer).toContain('data-chat-footer-boundary')
    expect(routeFooter).toContain("querySelector<HTMLElement>('[data-chat-footer-boundary]')")
    expect(routeFooter).toContain('getBoundingClientRect().top')
    expect(routeFooter).toContain("--ys-footer-inset")
    expect(routeFooter).toContain('.ys-floating-message-launcher')
    expect(routeFooter).toContain('.ysa-launcher')
    expect(routeFooter).toContain('.ys-gig-message-popover')
    expect(routeFooter).toContain('.ysa-panel')
    expect(routeFooter).toContain('requestAnimationFrame(updateFooterInset)')
  })

  it('locks the AI and provider launchers to one lower shared mobile baseline', () => {
    const routeFooter = read('components/marketplace/MarketplaceRouteFooter.tsx')

    expect(routeFooter).toContain('--ys-market-mobile-launcher-bottom')
    expect(routeFooter).toContain('max(30px, calc(22px + env(safe-area-inset-bottom)))')
    expect(routeFooter).not.toContain('--ys-market-mobile-launcher-bottom: max(82px')
    expect(routeFooter).toContain('html body .ys-floating-message-launcher,')
    expect(routeFooter).toContain('html body .ysa-launcher {')
    expect(routeFooter).toContain('bottom: calc(var(--ys-market-mobile-launcher-bottom) + var(--ys-footer-inset, 0px)) !important;')
  })
})
