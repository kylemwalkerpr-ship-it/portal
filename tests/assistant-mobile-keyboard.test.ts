import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('system-wide assistant mobile keyboard behavior', () => {
  const assistant = read('public/assistant.js')

  test('prevents iOS focus zoom on the composer', () => {
    expect(assistant).toContain('.ysa-input{min-height:44px;font-size:16px')
    expect(assistant).toContain('-webkit-text-size-adjust:100%')
  })

  test('sizes the assistant to the visual viewport instead of the desktop layout viewport', () => {
    expect(assistant).toContain('window.visualViewport')
    expect(assistant).toContain("window.visualViewport.addEventListener('resize', syncVisualViewport")
    expect(assistant).toContain("window.visualViewport.addEventListener('scroll', syncVisualViewport")
    expect(assistant).toContain("setPanelImportant('top', top + 'px')")
    expect(assistant).toContain("setPanelImportant('height', height + 'px')")
  })

  test('keyboard mode outranks portal-specific fixed-panel CSS', () => {
    expect(assistant).toContain("panel.style.setProperty(prop, value, 'important')")
    expect(assistant).toContain("setPanelImportant('height', height + 'px')")
    expect(assistant).toContain("setPanelImportant('bottom', 'auto')")
    expect(assistant).toContain("panel.classList.toggle('ysa-keyboard-open', keyboardOpen)")
  })

  test('focus and blur resync after iOS keyboard animation settles', () => {
    expect(assistant).toContain("input.addEventListener('focus', scheduleViewportSync)")
    expect(assistant).toContain("input.addEventListener('blur', scheduleViewportSync)")
    expect(assistant).toContain('window.setTimeout(syncVisualViewport, 240)')
  })

  test('mobile assistant owns scroll while open and keeps a compact keyboard chrome', () => {
    expect(assistant).toContain('html.ysa-assistant-open,html.ysa-assistant-open body')
    expect(assistant).toContain('.ysa-panel.ysa-keyboard-open .ysa-sub{display:none}')
    expect(assistant).toContain('.ysa-stream{flex:1 1 auto;min-height:0;overflow:auto')
  })
})
