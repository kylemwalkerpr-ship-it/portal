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

  test('keeps the close control above the drawer and injected floating UI', () => {
    expect(css).toContain('.cw-market header:has(.ys-shell-drawer)')
    expect(css).toContain('z-index: 2147483640 !important;')
    expect(css).toContain(".cw-market .ys-shell-menu-toggle[aria-expanded='true']")
    expect(css).toContain('z-index: 2147483646 !important;')
    expect(css).toContain("content: '×';")
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

  test('uses a restrained app-style drawer instead of a near-full-width slab', () => {
    expect(css).toContain('width: min(360px, 88vw) !important;')
    expect(css).toContain('border-radius: 16px 0 0 16px !important;')
    expect(css).toContain("content: 'Marketplace';")
    expect(css).toContain('backdrop-filter: blur(5px) saturate(0.88);')
    expect(css).toContain('width: calc(100vw - 24px) !important;')
    expect(css).not.toContain('width: min(390px, 92vw) !important;')
  })

  test('keeps preferences compact and directly below navigation', () => {
    expect(css).toContain('.cw-market .ys-shell-drawer-extras')
    expect(css).toContain('grid-template-columns: repeat(2, minmax(0, 1fr)) !important;')
    expect(css).toContain('margin-top: 14px !important;')
    expect(css).not.toContain('margin-top: auto !important;')
    expect(css).toContain('> :first-child:nth-last-child(3)')
    expect(css).toContain("content: 'Preferences';")
    expect(css).toContain("content: 'Appearance';")
  })

  test('keeps dropdowns inside the drawer and opens them upward on phones', () => {
    expect(css).toContain(".cw-market .ys-shell-drawer-extras [role='listbox']")
    expect(css).toContain('top: auto !important;')
    expect(css).toContain('bottom: calc(100% + 8px) !important;')
    expect(css).toContain('max-height: min(44dvh, 360px) !important;')
    expect(css).toContain("button[aria-label^='Language:']")
    expect(css).toContain("button[aria-label^='Theme:']")
  })

  test('gives navigation rows deliberate touch and keyboard states', () => {
    expect(css).toContain('min-height: 48px !important;')
    expect(css).toContain('.cw-market .ys-shell-drawer-link::after')
    expect(css).toContain('.cw-market .ys-shell-drawer-link:focus-visible')
    expect(css).toContain('transform: scale(0.988);')
  })

  test('freezes the page and hides the actual injected assistant while navigation is open', () => {
    expect(css).toContain('body:has(#ys-market-mobile-menu)')
    expect(css).toContain('.ysa-launcher')
    expect(css).toContain('.ysa-panel')
    expect(css).toContain('overflow: hidden !important;')
    expect(css).toContain('visibility: hidden !important;')
    expect(css).toContain('pointer-events: none !important;')
    expect(css).not.toContain("button[aria-label='Open chat']")
  })

  test('keeps account and narrow-phone controls within viewport bounds', () => {
    expect(css).toContain("width: min(240px, calc(100vw - 24px)) !important;")
    expect(css).toContain('max-width: calc(100vw - 56px) !important;')
    expect(css).toContain('.cw-market .ys-shell-brand > div > :not(img)')
  })
})
