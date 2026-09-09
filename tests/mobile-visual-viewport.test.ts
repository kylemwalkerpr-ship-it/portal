import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('mobile visual viewport contract', () => {
  const coordinator = read('components/mobile/MobileVisualViewport.tsx')
  const css = read('app/mobile-visual-viewport.css')
  const layout = read('app/layout.tsx')

  test('measures Safari visual viewport and tracks browser chrome plus keyboard changes', () => {
    expect(coordinator).toContain('window.visualViewport')
    expect(coordinator).toContain("viewport?.addEventListener('resize', schedule)")
    expect(coordinator).toContain("viewport?.addEventListener('scroll', schedule)")
    expect(coordinator).toContain("document.addEventListener('focusin', onFocusChange)")
    expect(coordinator).toContain("document.addEventListener('focusout', onFocusChange)")
    expect(coordinator).toContain("root.style.setProperty(HEIGHT_VAR, `${visibleBottom}px`)")
    expect(coordinator).toContain("const visibleBottom = Math.max(1, Math.round(rawHeight) + offsetTop)")
    expect(coordinator).not.toContain('MIN_HEIGHT')
  })

  test('the final mobile cascade overrides legacy 100vh/100dvh dashboard heights', () => {
    expect(css).toContain('body .yousafe-dashboard-shell.yousafe-dashboard-shell.yousafe-dashboard-shell')
    expect(css).toContain('height: var(--ys-visual-viewport-height, 100dvh) !important')
    expect(css).toContain('min-height: var(--ys-visual-viewport-height, 100dvh) !important')
    expect(css).toContain('max-height: var(--ys-visual-viewport-height, 100dvh) !important')
  })

  test('an open chat has one viewport owner and keeps the composer as a flex child', () => {
    expect(css).toContain(".ys-chatscreen[data-mobile-view='chat']")
    expect(css).toContain('[data-chat-canvas]')
    expect(css).toContain('overflow-y: auto !important')
    expect(css).toContain('.comp {')
    expect(css).toContain('flex: 0 0 auto !important')
    expect(css).toContain('height: 100% !important')
    expect(css).toContain('max-height: 100% !important')
  })

  test('the same viewport source covers role dashboards and marketplace messenger surfaces', () => {
    expect(css).toContain('body .yousafe-dashboard-shell')
    expect(css).toContain('body .cw-market > .yousafe-messenger')
    expect(css).toContain('body .chat-side-pane.yousafe-messenger')
  })

  test('viewport coordinator is mounted globally and its CSS is the last mobile cascade layer', () => {
    const clearanceIndex = layout.indexOf("import './student-mobile-dock-clearance.css'")
    const viewportCssIndex = layout.indexOf("import './mobile-visual-viewport.css'")
    expect(clearanceIndex).toBeGreaterThanOrEqual(0)
    expect(viewportCssIndex).toBeGreaterThan(clearanceIndex)
    expect(layout).toContain("import MobileVisualViewport from '@/components/mobile/MobileVisualViewport'")
    expect(layout).toContain('<MobileVisualViewport />')
  })
})
