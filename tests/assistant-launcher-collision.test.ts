import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('YQAA launcher does not cover chat send controls', () => {
  const assistant = read('public/assistant.js')
  const pane = read('components/marketplace/ChatSidePane.tsx')
  const css = read('app/messenger-mobile-parity.css')

  test('hides the launcher while a marketplace or messenger composer owns the screen', () => {
    expect(assistant).toContain('function competingAppChrome()')
    expect(assistant).toContain(".ys-market-chat-overlay")
    expect(assistant).toContain('.ys-market-chat-composer')
    expect(assistant).toContain('.ys-chatscreen[data-mobile-view="chat"]')
    expect(assistant).toContain('[data-ysa-hide-launcher="true"]')
    expect(assistant).toContain('.ysa-launcher.ysa-launcher-away')
    expect(assistant).toContain('hideLauncher(true)')
  })

  test('keeps Send and Open in Messages tappable by hiding over composer chrome', () => {
    expect(assistant).toContain('.comp-send, .ys-market-chat-composer, .ys-market-chat-foot a, .comp-row')
    expect(assistant).toContain('function launcherFootprint()')
    expect(assistant).toContain('function syncLauncherChrome()')
    expect(assistant).toContain('scheduleLauncherChrome()')
  })

  test('lifts the launcher off leftover bottom-right buttons when no chat is open', () => {
    expect(assistant).toContain("document.querySelectorAll('button, a[href], [role=\"button\"], input[type=\"submit\"]')")
    expect(assistant).toContain("launcher.style.bottom = 'max(' + bottom + 'px")
    expect(assistant).toContain('new MutationObserver(scheduleLauncherChrome)')
  })

  test('marketplace chat overlay opts the site launcher out', () => {
    expect(pane).toContain('data-ysa-hide-launcher="true"')
    expect(css).toContain("body:has(.ys-market-chat-overlay) .ysa-launcher")
    expect(css).toContain("body:has(.ys-market-chat-composer) .ysa-launcher")
    expect(css).toContain("body:has(.ys-chatscreen[data-mobile-view='chat']) .ysa-launcher")
    expect(css).toContain("body:has([data-ysa-hide-launcher='true']) .ysa-launcher")
    expect(css).toContain('display: none !important;')
    expect(css).toContain('pointer-events: none !important;')
    expect(assistant).toContain('body:has(.ys-market-chat-overlay) .ysa-launcher')
    expect(assistant).toContain('display:none!important')
  })

  test('cache-busts assistant.js so phones do not keep the overlapping FAB', () => {
    const widget = read('components/ChatWidget.tsx')
    const yara = read('public/yara.js')
    expect(widget).toContain("script.src = '/assistant.js?v=ysa-composer-hide-2'")
    expect(yara).toContain('assistant.js?v=ysa-composer-hide-2')
  })
})
