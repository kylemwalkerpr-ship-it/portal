import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('mobile Messenger keyboard viewport contract', () => {
  const coordinator = read('components/mobile/MobileVisualViewport.tsx')
  const css = read('app/mobile-visual-viewport.css')

  test('publishes visual height separately from Safari pan offset', () => {
    expect(coordinator).toContain("const BLOCK_SIZE_VAR = '--ys-visual-viewport-block-size'")
    expect(coordinator).toContain('const visualHeight = Math.max(1, Math.round(rawHeight))')
    expect(coordinator).toContain('const visibleBottom = visualHeight + offsetTop')
    expect(coordinator).toContain("root.style.setProperty(BLOCK_SIZE_VAR, `${visualHeight}px`)")
    expect(coordinator).toContain("root.style.setProperty(OFFSET_VAR, `${offsetTop}px`)")
  })

  test('open mobile chats are fixed to the actual VisualViewport rectangle', () => {
    expect(css).toContain(".ys-chatscreen[data-mobile-view='chat']")
    expect(css).toContain('position: fixed !important')
    expect(css).toContain('top: var(--ys-visual-viewport-offset-top, 0px) !important')
    expect(css).toContain('height: var(--ys-visual-viewport-block-size, 100dvh) !important')
    expect(css).toContain('max-height: var(--ys-visual-viewport-block-size, 100dvh) !important')
    expect(css).toContain('z-index: 10020 !important')
  })

  test('only the message canvas scrolls and the composer remains a final flex child', () => {
    expect(css).toContain(".ys-chatscreen[data-mobile-view='chat'] [data-chat-canvas]")
    expect(css).toContain('overflow-y: auto !important')
    expect(css).toContain(".ys-chatscreen[data-mobile-view='chat'] .comp")
    expect(css).toContain('flex: 0 0 auto !important')
  })

  test('focused composer sits directly above the software keyboard', () => {
    expect(css).toContain(".ys-chatscreen[data-mobile-view='chat'] .comp-input:focus")
    expect(css).toContain('padding-bottom: 8px !important')
  })

  test('underlying dashboard cannot become a second scroll owner while chat is open', () => {
    expect(css).toContain("html:has(.yousafe-messenger .ys-chatscreen[data-mobile-view='chat'])")
    expect(css).toContain('overscroll-behavior: none !important')
  })
})
