import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('messenger pane persistence', () => {
  const inbox = read('components/messaging/UnifiedInbox.tsx')
  const student = read('components/design/student.jsx')
  const attorney = read('components/design/attorney.jsx')
  const consultant = read('components/design/consultant.jsx')
  const marketplace = read('components/marketplace/MarketplaceShell.tsx')
  const admin = read('components/messaging/AdminMasterMessenger.tsx')
  const chatScreen = read('components/messaging/ChatScreen.tsx')

  test('mobile chat pane restores from ?thread= and starts on the list without it', () => {
    expect(inbox).toContain("React.useState(() => Boolean(defaultThreadId))")
    expect(inbox).toContain("new URLSearchParams(window.location.search).get('thread')")
    expect(inbox).toContain('setMobileShowChat(true)')
    expect(inbox).toContain('isMessengerMobileViewport() && !mobileShowChat')
    expect(inbox).toContain('sync(null)')
  })

  test('inline parent onThreadChange identity cannot rewrite the URL on every render', () => {
    expect(inbox).toContain('onThreadChangeRef')
    expect(inbox).toContain('onThreadChangeRef.current = onThreadChange')
    expect(inbox).toContain('}, [activeId, mobileShowChat])')
    expect(inbox).not.toContain('onThreadChange?.(activeId)')
  })

  test('phones do not auto-open conversation #1 into the chat pane', () => {
    expect(inbox).toContain('!isMessengerMobileViewport()')
    expect(inbox).toContain('setActiveId(d.conversations[0].id)')
  })

  test('student, attorney, consultant, marketplace and admin share the URL writer', () => {
    for (const source of [student, attorney, consultant, marketplace, admin]) {
      expect(source).toContain("from '@/lib/messaging/threadUrl'")
      expect(source).toContain('writeMessengerThreadParam')
    }
  })

  test('post-mount deep-link promotion remains a one-shot fallback', () => {
    expect(chatScreen).toContain('activatedDeepLinkThreadRef.current = threadId')
    expect(chatScreen).toContain('activeRow.click()')
    expect(chatScreen).toContain("url.searchParams.delete('thread')")
  })

  test('the conversation list frame is a flex column and the sidebar is not a nested scroller', () => {
    expect(inbox).toContain('className="ys-inbox-frame"')
    expect(inbox).toContain("display: 'flex'")
    expect(inbox).toContain("flexDirection: 'column'")
    expect(chatScreen).toContain("overflow: 'hidden'")
    expect(chatScreen).toContain("className=\"ys-chatscreen-sidebar\"")
    expect(chatScreen).not.toMatch(/className="ys-chatscreen-sidebar"[\s\S]*?overflowY: 'auto'/)
  })
})
