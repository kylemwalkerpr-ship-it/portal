import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('shared mobile Messenger surface contract', () => {
  const viewportCss = read('app/mobile-visual-viewport.css')
  const coordinator = read('components/mobile/MobileVisualViewport.tsx')
  const unifiedInbox = read('components/messaging/UnifiedInbox.tsx')
  const student = read('components/design/student.jsx')
  const attorney = read('components/design/attorney.jsx')
  const consultant = read('components/design/consultant.jsx')
  const marketplace = read('components/marketplace/MarketplaceShell.tsx')
  const directMarketplace = read('components/marketplace/ChatSidePane.tsx')
  const admin = read('components/messaging/AdminMasterMessenger.tsx')
  const adminComposer = read('components/messaging/AdminMasterComposer.tsx')

  test('student, attorney, consultant and Marketplace Messages all use UnifiedInbox', () => {
    expect(student).toContain('<UnifiedInbox')
    expect(attorney).toContain('<UnifiedInbox')
    expect(consultant).toContain('<UnifiedInbox')
    expect(marketplace).toContain('<UnifiedInbox')
    expect(unifiedInbox).toContain('className="yousafe-messenger"')
    expect(unifiedInbox).toContain('mode="split"')
  })

  test('direct Marketplace provider contact uses the same Messenger/ChatScreen/composer primitives', () => {
    expect(directMarketplace).toContain('className="yousafe-messenger chat-side-pane"')
    expect(directMarketplace).toContain('<ChatScreen mode="panel"')
    expect(directMarketplace).toContain('<AutoGrowInput')
    expect(directMarketplace).toContain("placeholder={sending ? 'Sending…' : 'Type a message…'}")
  })

  test('Admin Master Chats stays on the shared ChatScreen and composer class contract', () => {
    expect(admin).toContain('className="yousafe-messenger"')
    expect(admin).toContain('mode="split"')
    expect(adminComposer).toContain('className="comp-input"')
  })

  test('one open-chat rule owns viewport, canvas scrolling and composer anchoring for every surface', () => {
    expect(viewportCss).toContain("body .yousafe-messenger .ys-chatscreen[data-mobile-view='chat'] {")
    expect(viewportCss).toContain('height: var(--ys-visual-viewport-block-size, 100dvh) !important')
    expect(viewportCss).toContain("body .yousafe-messenger .ys-chatscreen[data-mobile-view='chat'] [data-chat-canvas]")
    expect(viewportCss).toContain('flex: 1 1 0% !important')
    expect(viewportCss).toContain("body .yousafe-messenger .ys-chatscreen[data-mobile-view='chat'] .ys-chatscreen-composer")
    expect(viewportCss).toContain('flex: 0 0 auto !important')
  })

  test('Marketplace Messages, direct provider chat and Admin hosts cannot re-own mobile 100dvh geometry', () => {
    expect(viewportCss).toContain('body .cw-market .yousafe-messenger:has(> .yousafe-messenger .ys-chatscreen)')
    expect(viewportCss).toContain('body .chat-side-pane.yousafe-messenger')
    expect(viewportCss).toContain('body .cw-market .chat-side-pane.yousafe-messenger')
    expect(viewportCss).toContain('body .yousafe-dashboard-shell .yousafe-messenger .admin-master-shell')
    expect(viewportCss).toContain('height: 100% !important')
  })

  test('keyboard tail anchoring follows the focused/visible Messenger rather than the first chat in the DOM', () => {
    expect(coordinator).toContain('const CHAT_ROOT_SELECTOR = ".yousafe-messenger .ys-chatscreen[data-mobile-view=\'chat\']"')
    expect(coordinator).toContain('const nearBottomByCanvas = new WeakMap<HTMLElement, boolean>()')
    expect(coordinator).toContain('active.closest<HTMLElement>(CHAT_ROOT_SELECTOR)')
    expect(coordinator).toContain('document.querySelectorAll<HTMLElement>(CHAT_ROOT_SELECTOR)')
    expect(coordinator).toContain("activeChatRoot()?.querySelector<HTMLElement>('[data-chat-canvas]')")
    expect(coordinator).not.toContain("document.querySelector<HTMLElement>(CHAT_CANVAS_SELECTOR)")
  })

  test('the coordinator focus selector is role-agnostic and covers every .comp-input Messenger composer', () => {
    expect(coordinator).toContain('const COMPOSER_INPUT_SELECTOR = `${CHAT_ROOT_SELECTOR} .comp-input`')
    expect(coordinator).not.toContain('student')
    expect(coordinator).toContain('focusTimers = [80, 180, 360, 650]')
  })
})
