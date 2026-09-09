import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('messenger mobile back-to-list flow', () => {
  const chatScreen = read('components/messaging/ChatScreen.tsx')
  const css = read('app/messenger-mobile-back-list.css')
  const layout = read('app/layout.tsx')

  test('mobile back clears stale thread deep-link without changing desktop selection semantics', () => {
    expect(chatScreen).toContain('previousMobileShowChatRef')
    expect(chatScreen).toContain("url.searchParams.delete('thread')")
    expect(chatScreen).toContain("window.history.replaceState({}, '', url)")
    expect(chatScreen).toContain("'(max-width: 680px)'")
  })

  test('list mode owns a stable full-height in-flow sidebar', () => {
    expect(css).toContain("data-mobile-view='list'")
    expect(css).toContain('.ys-chatscreen-sidebar > .cl')
    expect(css).toContain('position: relative !important')
    expect(css).toContain('height: 100% !important')
    expect(css).toContain('min-height: 0 !important')
    expect(css).toContain('.cl-scroll')
    expect(css).toContain('overflow-y: auto !important')
  })

  test('back-list hardening loads after the earlier messenger mobile parity layer', () => {
    const parity = layout.indexOf("import './messenger-mobile-parity.css'")
    const backList = layout.indexOf("import './messenger-mobile-back-list.css'")
    expect(parity).toBeGreaterThan(-1)
    expect(backList).toBeGreaterThan(parity)
  })
})
