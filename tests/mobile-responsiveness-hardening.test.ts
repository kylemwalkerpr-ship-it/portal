import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('mobile responsiveness hardening', () => {
  const css = read('app/mobile-hardening.css')
  const conversionCss = read('app/mobile-conversion.css')
  const layout = read('app/layout.tsx')
  const messengerCss = read('components/messaging/messenger-tokens.css')
  const megaMenu = read('components/marketplace/CategoryMegaDropdown.tsx')
  const sellerProfile = read('components/marketplace/SellerProfilePage.tsx')

  test('loads both shared mobile layers after the portal base styles', () => {
    const hardening = layout.indexOf("import './mobile-hardening.css'")
    const conversion = layout.indexOf("import './mobile-conversion.css'")
    expect(hardening).toBeGreaterThan(-1)
    expect(conversion).toBeGreaterThan(hardening)
  })

  test('guards marketplace cards and compact hamburger header on narrow screens', () => {
    expect(css).toContain(".cw-market [style*='minmax(320px, 1fr)']")
    expect(css).toContain(".cw-market [style*='minmax(280px, 1fr)']")
    expect(css).toContain('.cw-market .ys-shell-header-inner')
    expect(css).toContain('flex-wrap: nowrap !important')
    expect(css).toContain('height: 60px !important')
    expect(css).toContain('.cw-market .ys-shell-menu-toggle')
    expect(css).not.toContain("href^='https://portal.yousafeconsultancy.com/dashboard'")
    expect(css).toContain('.cw-market .ys-cat-bar')
    expect(css).toContain('.cw-market .ys-orders-panel')
    expect(css).toContain('.ys-order-row')
    expect(layout).toContain("viewportFit: 'cover'")
    expect(conversionCss).toContain('.cw-market .ys-content-layout')
    expect(conversionCss).toContain('.cw-market button')
    expect(conversionCss).toContain('min-height: 44px')
  })

  test('landing nav uses a hamburger drawer instead of a clipped row', () => {
    const globals = read('app/globals.css')
    const nav = read('components/design/landing/Nav.tsx')
    expect(nav).toContain('ys-nav-menu-toggle')
    expect(nav).toContain('ys-nav-drawer')
    expect(nav).toContain('My Account')
    expect(globals).toContain('.ys-nav-menu-toggle')
    expect(globals).toContain('.ys-nav-drawer-panel')
    expect(globals).toContain('.ys-auth-form-panel')
    expect(globals).toContain('order: -1')
  })

  test('keeps cart and checkout controls usable on narrow phones', () => {
    expect(conversionCss).toContain("main:has(button[aria-label='Decrease quantity'])")
    expect(conversionCss).toContain("button[aria-label='Increase quantity']")
    expect(conversionCss).toContain("button[aria-label='Remove item']")
    expect(conversionCss).toContain('flex-wrap: wrap !important')
    expect(conversionCss).toContain('padding: 28px 14px max(64px, env(safe-area-inset-bottom)) !important')
    expect(conversionCss).toContain('#nmi-card-expiry')
    expect(conversionCss).toContain('#nmi-card-cvv')
  })

  test('keeps seller profile conversion surfaces inside narrow phones', () => {
    expect(sellerProfile).toContain('ys-seller-profile-page')
    expect(sellerProfile).toContain('ys-seller-profile-tabs')
    expect(sellerProfile).toContain('ys-seller-profile-tab-content')
    expect(conversionCss).toContain('.cw-market .ys-seller-profile-page')
    expect(conversionCss).toContain("[style*='min-width: 280px']")
    expect(conversionCss).toContain('.cw-market .ys-seller-profile-tabs')
    expect(conversionCss).toContain('overflow-x: auto !important')
    expect(conversionCss).toContain("grid-template-columns: repeat(2, minmax(0, 1fr)) !important")
  })

  test('uses touch-safe and dynamic-viewport messenger behavior', () => {
    expect(css).toContain('.yousafe-messenger .iconbtn')
    expect(css).toContain('min-width: 44px !important')
    expect(css).toContain('height: 100dvh !important')
    expect(css).toContain('.yousafe-messenger .cv-head-actions')
    expect(css).toContain('.yousafe-messenger .bub')
    expect(css).toContain('max-width: 88% !important')
    expect(messengerCss).toContain('data-mobile-view="list"')
    expect(messengerCss).toContain('data-mobile-view="chat"')
    expect(conversionCss).toContain("aria-label='Pick an emoji'")
    expect(conversionCss).toContain('.chat-side-pane div:has(> div > .comp-row)')
  })

  test('prevents the category mega menu from being positioned off-screen', () => {
    expect(megaMenu).toContain('const panelWidth = Math.min(380')
    expect(megaMenu).toContain('const left = Math.max(')
    expect(megaMenu).toContain('viewportPadding')
    expect(megaMenu).toContain("maxHeight: 'min(70dvh, 560px)'")
    // Guard the executable assignment, not comments that document the old bug.
    expect(megaMenu).not.toContain('const left = Math.min(anchorRect.left')
  })

  test('keeps iOS form focus and safe-area behavior in the hardening layer', () => {
    expect(css).toContain('font-size: 16px !important')
    expect(css).toContain('env(safe-area-inset-bottom)')
    expect(css).toContain("[aria-label='YouSafe assistant']")
    expect(conversionCss).toContain('92dvh')
  })
})
