import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('mobile Messenger keyboard viewport contract', () => {
  const coordinator = read('components/mobile/MobileVisualViewport.tsx')
  const css = read('app/mobile-visual-viewport.css')

  test('keyboard focus never subtracts a second native toolbar allowance', () => {
    expect(css).not.toContain('--ys-ios-keyboard-native-occlusion')
    expect(css).not.toContain('--ys-ios-keyboard-browser-chrome')
    expect(css).not.toContain('--ys-ios-keyboard-input-assistant')
    expect(css).not.toContain('100lvh - 100svh')
    expect(css).toContain('height: var(--ys-visual-viewport-block-size, 100dvh) !important')
    expect(css).toContain('min-height: var(--ys-visual-viewport-block-size, 100dvh) !important')
    expect(css).toContain('max-height: var(--ys-visual-viewport-block-size, 100dvh) !important')
  })
  const chatScreen = read('components/messaging/ChatScreen.tsx')

  test.each([
    'app/student-mobile-premium.css',
    'app/student-mobile-ux-v2.css',
    'app/student-mobile-dock-clearance.css',
  ])('%s leaves open-chat sizing to the visual viewport owner', (file) => {
    // Checking only that the correct height exists in the final stylesheet
    // missed the bug: earlier !important :has() selectors were more specific.
    // No student layer may target the open-chat root with its own dimensions.
    const source = read(file).replace(/\/\*[\s\S]*?\*\//g, '')
    for (const match of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const [, selectors, declarations] = match
      for (const selector of selectors.split(',')) {
        const targetsChatRoot = /\.ys-chatscreen(?:\[data-mobile-view='chat'\])?\s*$/.test(selector)
        if (targetsChatRoot) {
          expect(declarations).not.toMatch(/(?:^|;)\s*(?:height|min-height|max-height)\s*:/)
        }
        if (/\.comp-row\s*$/.test(selector)) {
          expect(declarations).not.toMatch(/padding-bottom\s*:/)
        }
      }
    }
  })

  test('publishes visual height separately from Safari pan offset', () => {
    expect(coordinator).toContain("const BLOCK_SIZE_VAR = '--ys-visual-viewport-block-size'")
    expect(coordinator).toContain("const PAN_VAR = '--ys-visual-viewport-pan-top'")
    expect(coordinator).toContain('const visualHeight = Math.max(1, Math.round(rawHeight))')
    expect(coordinator).toContain('const pageTop = Math.max(0, Math.round(viewport?.pageTop')
    expect(coordinator).toContain('const visualPanTop = Math.max(offsetTop, pageTop - layoutScrollTop)')
    expect(coordinator).toContain('const visibleBottom = visualHeight + visualPanTop')
    expect(coordinator).toContain("root.style.setProperty(BLOCK_SIZE_VAR, `${visualHeight}px`)")
    expect(coordinator).toContain("root.style.setProperty(OFFSET_VAR, `${offsetTop}px`)")
    expect(coordinator).toContain("root.style.setProperty(PAN_VAR, `${visualPanTop}px`)")
  })

  test('open mobile chats use the truly usable VisualViewport rectangle', () => {
    expect(css).toContain(".ys-chatscreen[data-mobile-view='chat']")
    expect(css).toContain('position: fixed !important')
    expect(css).toContain('height: var(--ys-visual-viewport-block-size, 100dvh) !important')
    expect(css).toContain('max-height: var(--ys-visual-viewport-block-size, 100dvh) !important')
    expect(css).toContain('z-index: 10020 !important')
  })

  test('iOS 26 browser tabs keep fixed layout at top zero and apply pan as a compositor transform', () => {
    expect(css).toContain("html[data-ys-ios-webkit='true'][data-ys-standalone='false']")
    expect(css).toContain('top: 0 !important')
    expect(css).toContain('transform: translate3d(0, var(--ys-visual-viewport-pan-top, 0px), 0) !important')
    expect(css).toContain('will-change: transform')
    expect(coordinator).toContain('pageTop - layoutScrollTop')
  })

  test('tracks composer focus without reserving guessed browser chrome', () => {
    expect(coordinator).toContain('const publishComposerFocus = (focused: boolean) =>')
    expect(coordinator).toContain("root.dataset.ysMessengerComposerFocused = focused ? 'true' : 'false'")
    expect(coordinator).toContain('target.matches(COMPOSER_INPUT_SELECTOR)')
    expect(coordinator).toContain('publishComposerFocus(true)')
    expect(coordinator).toContain("document.addEventListener('focusin', onFocusIn)")
    expect(coordinator).toContain("document.addEventListener('focusout', onFocusOut)")
  })

  test('message history gets leftover space while composer owns an explicit final flex slot', () => {
    expect(chatScreen).toContain("flex: '1 1 0%'")
    expect(chatScreen).toContain('className="ys-chatscreen-composer"')
    expect(css).toContain(".ys-chatscreen[data-mobile-view='chat'] [data-chat-canvas]")
    expect(css).toContain('flex: 1 1 0% !important')
    expect(css).toContain('overflow-y: auto !important')
    expect(css).toContain(".ys-chatscreen[data-mobile-view='chat'] .ys-chatscreen-composer")
    expect(css).toContain('min-height: 58px !important')
    expect(css).toContain(".ys-chatscreen[data-mobile-view='chat'] .comp")
    expect(css).toContain('flex: 0 0 auto !important')
  })

  test('focused composer gets compact web padding inside the measured viewport', () => {
    expect(css).toContain("html[data-ys-messenger-composer-focused='true']")
    expect(css).toContain(".ys-chatscreen[data-mobile-view='chat'] .comp-row")
    expect(css).toContain('padding-bottom: 8px !important')
  })

  test('keyboard resizing keeps the newest message visible only when the reader was at the tail', () => {
    expect(coordinator).toContain('let chatNearBottom = true')
    expect(coordinator).toContain("document.addEventListener('scroll', onChatScroll, true)")
    expect(coordinator).toContain('target.scrollHeight - target.scrollTop - target.clientHeight < 120')
    expect(coordinator).toContain('if (!chatNearBottom) return')
    expect(coordinator).toContain('canvas.scrollTop = canvas.scrollHeight')
    expect(coordinator).toContain('pinChatTailIfNeeded()')
  })

  test('bottom-toolbar Safari gets settled measurements through its keyboard animation', () => {
    expect(coordinator).toContain('focusTimers = [80, 180, 360, 650]')
    expect(coordinator).toContain('scheduleSettledMeasurements()')
  })

  test('underlying dashboard cannot become a second scroll owner while chat is open', () => {
    expect(css).toContain("html:has(.yousafe-messenger .ys-chatscreen[data-mobile-view='chat'])")
    expect(css).toContain('overscroll-behavior: none !important')
  })
})
