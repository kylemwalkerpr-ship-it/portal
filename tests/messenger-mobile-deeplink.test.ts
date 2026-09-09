import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('messenger mobile deep-link handoff', () => {
  const chatScreen = read('components/messaging/ChatScreen.tsx')
  const marketplacePane = read('components/marketplace/ChatSidePane.tsx')

  test('marketplace Open in Messages preserves the unified conversation id', () => {
    expect(marketplacePane).toContain('dashboard?page=messages&thread=${conversationId}')
  })

  test('a deep-linked dashboard thread promotes the mobile split view into chat', () => {
    expect(chatScreen).toContain("new URLSearchParams(window.location.search).get('thread')")
    expect(chatScreen).toContain("window.matchMedia?.('(max-width: 680px)').matches")
    expect(chatScreen).toContain("'.ys-chatscreen-sidebar button.row.on'")
    expect(chatScreen).toContain('activatedDeepLinkThreadRef.current = threadId')
    expect(chatScreen).toContain('activeRow.click()')
  })

  test('the promotion is one-shot per thread so the mobile Back action stays authoritative', () => {
    expect(chatScreen).toContain('activatedDeepLinkThreadRef.current === threadId')
    expect(chatScreen).toContain('[isSplit, mobileShowChat, sidebar]')
  })
})