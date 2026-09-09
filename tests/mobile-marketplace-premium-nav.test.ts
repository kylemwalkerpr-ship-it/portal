import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('premium marketplace mobile navigation', () => {
  const css = read('app/mobile-marketplace-premium-nav.css')
  const layout = read('app/layout.tsx')

  test('loads the marketplace nav override after existing mobile layers', () => {
    const hardening = layout.indexOf("import './mobile-hardening.css'")
    const conversion = layout.indexOf("import './mobile-conversion.css'")
    const premiumNav = layout.indexOf("import './mobile-marketplace-premium-nav.css'")

    expect(hardening).toBeGreaterThan(-1)
    expect(conversion).toBeGreaterThan(hardening)
    expect(premiumNav).toBeGreaterThan(conversion)
  })

  test('keeps the account control on the far right of the mobile navbar', () => {
    expect(css).toContain('.cw-market .ys-shell-menu-toggle')
    expect(css).toContain('order: 2;')
    expect(css).toContain('margin-left: auto !important;')
    expect(css).toContain('.cw-market .ys-shell-auth')
    expect(css).toContain('order: 3;')
    expect(css).toContain("button[aria-label='Account menu']")
  })

  test('keeps the primary mobile header compact and non-wrapping', () => {
    expect(css).toContain('height: 60px !important;')
    expect(css).toContain('flex-wrap: nowrap !important;')
    expect(css).toContain('env(safe-area-inset-left)')
    expect(css).toContain('env(safe-area-inset-right)')
  })

  test('makes the opened drawer explicitly dismissible above the modal', () => {
    expect(css).toContain(".cw-market .ys-shell-menu-toggle[aria-expanded='true']")
    expect(css).toContain('position: fixed !important;')
    expect(css).toContain('z-index: 470 !important;')
    expect(css).toContain("content: '×';")
    expect(css).toContain("top: max(8px, env(safe-area-inset-top)) !important;")
  })

  test('provides a sticky swipeable marketplace category rail', () => {
    expect(css).toContain('.cw-market .ys-cat-bar')
    expect(css).toContain('position: sticky !important;')
    expect(css).toContain('top: 60px !important;')
    expect(css).toContain('.cw-market .ys-cat-strip')
    expect(css).toContain('scroll-snap-type: x proximity;')
    expect(css).toContain('overscroll-behavior-x: contain;')
    expect(css).toContain('height: 44px !important;')
  })

  test('keeps the drawer contextual instead of swallowing the whole phone', () => {
    expect(css).toContain('width: min(312px, 86vw) !important;')
    expect(css).toContain("content: 'Marketplace';")
    expect(css).toContain('.cw-market .ys-shell-drawer-extras')
    expect(css).toContain('grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) !important;')
    expect(css).toContain("button[aria-label^='Theme:']::before")
    expect(css).toContain("content: 'Appearance';")
    expect(css).toContain('@media (max-width: 360px)')
  })

  test('removes floating support controls while modal navigation is open', () => {
    expect(css).toContain("body:has(.cw-market .ys-shell-menu-toggle[aria-expanded='true'])")
    expect(css).toContain("button[aria-label='Open chat']")
    expect(css).toContain('visibility: hidden !important;')
    expect(css).toContain('pointer-events: none !important;')
  })

  test('keeps account and preference popovers inside narrow phone viewports', () => {
    expect(css).toContain("width: min(240px, calc(100vw - 24px)) !important;")
    expect(css).toContain("width: min(260px, calc(100vw - 40px)) !important;")
    expect(css).toContain('.cw-market .ys-shell-brand > div > :not(img)')
  })
})
