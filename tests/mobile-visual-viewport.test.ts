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
    expect(coordinator).toContain('const visualHeight = Math.max(1, Math.round(rawHeight))')
    expect(coordinator).toContain('const visibleBottom = visualHeight + offsetTop')
    expect(coordinator).toContain("root.style.setProperty(HEIGHT_VAR, `${visibleBottom}px`)")
    expect(coordinator).toContain("root.style.setProperty(BLOCK_SIZE_VAR, `${visualHeight}px`)")
    expect(coordinator).toContain("root.style.setProperty(OFFSET_VAR, `${offsetTop}px`)")
    expect(coordinator).not.toContain('MIN_HEIGHT')
  })

  test('marks real iOS software-keyboard state instead of treating every focused textarea as a keyboard', () => {
    expect(coordinator).toContain("root.dataset.ysIosWebkit = isIOSWebKit ? 'true' : 'false'")
    expect(coordinator).toContain("root.dataset.ysStandalone = standalone ? 'true' : 'false'")
    expect(coordinator).toContain('visualHeight < unfocusedVisualHeight - 80')
    expect(coordinator).toContain("root.dataset.ysKeyboardOpen = keyboardOpen ? 'true' : 'false'")
    expect(coordinator).toContain('focusTimers = [80, 180, 360, 650]')
  })

  test('reserves Safari bottom chrome plus input assistant only while the iOS software keyboard is open', () => {
    expect(css).toContain("html[data-ys-ios-webkit='true'][data-ys-standalone='false'][data-ys-keyboard-open='true']")
    expect(css).toContain('--ys-ios-keyboard-browser-chrome: 52px')
    expect(css).toContain('--ys-ios-keyboard-input-assistant: 44px')
    expect(css).toContain('--ys-ios-keyboard-browser-chrome: clamp(48px, calc(100lvh - 100svh), 72px)')
    expect(css).toContain('--ys-ios-keyboard-native-occlusion: calc(')
    expect(css).toContain('var(--ys-ios-keyboard-browser-chrome, 0px) + var(--ys-ios-keyboard-input-assistant, 0px)')
    expect(css).toContain('calc(var(--ys-visual-viewport-block-size, 100dvh) - var(--ys-ios-keyboard-native-occlusion, 0px))')
  })

  test('the final mobile cascade overrides legacy 100vh/100dvh dashboard heights', () => {
    expect(css).toContain('body .yousafe-dashboard-shell.yousafe-dashboard-shell.yousafe-dashboard-shell')
    expect(css).toContain('height: var(--ys-visual-viewport-height, 100dvh) !important')
    expect(css).toContain('min-height: var(--ys-visual-viewport-height, 100dvh) !important')
    expect(css).toContain('max-height: var(--ys-visual-viewport-height, 100dvh) !important')
  })

  test('an open chat has one viewport owner and guarantees a final composer flex slot', () => {
    expect(css).toContain(".ys-chatscreen[data-mobile-view='chat']")
    expect(css).toContain('position: fixed !important')
    expect(css).toContain('top: var(--ys-visual-viewport-offset-top, 0px) !important')
    expect(css).toContain('height: max(1px, calc(var(--ys-visual-viewport-block-size, 100dvh) - var(--ys-ios-keyboard-native-occlusion, 0px))) !important')
    expect(css).toContain('[data-chat-canvas]')
    expect(css).toContain('flex: 1 1 0% !important')
    expect(css).toContain('overflow-y: auto !important')
    expect(css).toContain('.ys-chatscreen-composer')
    expect(css).toContain('min-height: 58px !important')
    expect(css).toContain('.comp {')
    expect(css).toContain('flex: 0 0 auto !important')
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
