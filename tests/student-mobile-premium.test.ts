import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('premium student mobile dashboard', () => {
  const css = read('app/student-mobile-premium.css')
  const layout = read('app/layout.tsx')
  const student = read('components/design/student.jsx')
  const shared = read('components/design/shared.jsx')

  test('student shell remains uniquely scoped by wallet plus profile footer', () => {
    expect(student).toContain('Wallet: {formatMoney(walletSummary.available')
    expect(student).toContain('className="yousafe-sidebar-user"')
    expect(css).toContain('.yousafe-dashboard-shell:has(.yousafe-sidebar-user > div + div)')
  })

  test('mobile navigation is a safe-area-aware bottom dock without hiding destinations', () => {
    expect(css).toContain('position: fixed !important')
    expect(css).toContain('inset: auto 0 0 0 !important')
    expect(css).toContain('env(safe-area-inset-bottom)')
    expect(css).toContain('overflow-x: auto !important')
    expect(css).toContain('scroll-snap-type: x proximity')
    expect(css).toContain('.yousafe-sidebar-nav > :not(.yousafe-nav-item)')
    expect(css).not.toContain('.yousafe-sidebar-nav .yousafe-nav-item {\n    display: none')
  })

  test('active destination remains auto-centered and receives app-dock treatment', () => {
    expect(shared).toContain("el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })")
    expect(css).toContain(".yousafe-nav-item[data-nav-active='true']")
    expect(css).toContain('scroll-snap-align: center')
  })

  test('topbar and page canvas have compact premium mobile chrome', () => {
    expect(css).toContain('.yousafe-topbar {')
    expect(css).toContain('backdrop-filter: blur(22px) saturate(140%)')
    expect(css).toContain('--student-page-pad: 14px')
    expect(css).toContain(".yousafe-dashboard-content > div[style*='padding: 28px']")
    expect(css).toContain("grid-template-columns: repeat(2, minmax(0, 1fr)) !important")
  })

  test('an open Messenger thread becomes full-screen and restores chrome in list mode', () => {
    expect(css).toContain(":has(.yousafe-messenger .ys-chatscreen[data-mobile-view='chat']) > .yousafe-sidebar")
    expect(css).toContain(":has(.yousafe-messenger .ys-chatscreen[data-mobile-view='chat']) .yousafe-topbar")
    expect(css).toContain('.yousafe-messenger .cl-scroll')
    expect(css).toContain('height: 100dvh !important')
  })

  test('premium student layer loads after the existing mobile and marketplace layers', () => {
    const marketplaceIndex = layout.indexOf("import './mobile-marketplace-premium-nav.css'")
    const studentIndex = layout.indexOf("import './student-mobile-premium.css'")
    expect(marketplaceIndex).toBeGreaterThanOrEqual(0)
    expect(studentIndex).toBeGreaterThan(marketplaceIndex)
  })

  test('accessibility and reduced-motion safeguards are retained', () => {
    expect(css).toContain(':focus-visible')
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
    expect(css).toContain('font-size: 16px !important')
  })
})
