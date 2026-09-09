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
    expect(css).toContain("env(safe-area-inset-left)")
    expect(css).toContain("env(safe-area-inset-right)")
  })

  test('provides a sticky swipeable Fiverr-style category rail', () => {
    expect(css).toContain('.cw-market .ys-cat-bar')
    expect(css).toContain('position: sticky !important;')
    expect(css).toContain('top: 60px !important;')
    expect(css).toContain('.cw-market .ys-cat-strip')
    expect(css).toContain('scroll-snap-type: x proximity;')
    expect(css).toContain('overscroll-behavior-x: contain;')
    expect(css).toContain('height: 44px !important;')
  })

  test('keeps menu and account surfaces inside narrow phone viewports', () => {
    expect(css).toContain("width: min(240px, calc(100vw - 24px)) !important;")
    expect(css).toContain('width: min(340px, 92vw) !important;')
    expect(css).toContain('@media (max-width: 360px)')
    expect(css).toContain('.cw-market .ys-shell-brand > div > :not(img)')
  })
})
