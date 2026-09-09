import {
  SWIPE_BACK_EDGE_PX,
  isSwipeBackStart,
  shouldCommitSwipeBack,
  shouldLockSwipeBack,
} from '@/lib/messaging/swipeBack'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('WhatsApp-style Messenger swipe-back math', () => {
  test('only a left-edge start can become a back swipe', () => {
    expect(isSwipeBackStart(0)).toBe(true)
    expect(isSwipeBackStart(SWIPE_BACK_EDGE_PX)).toBe(true)
    expect(isSwipeBackStart(SWIPE_BACK_EDGE_PX + 1)).toBe(false)
    expect(isSwipeBackStart(-4)).toBe(false)
  })

  test('vertical pans abort and a clear rightward move locks', () => {
    expect(shouldLockSwipeBack(4, 3)).toBe(false)
    expect(shouldLockSwipeBack(8, 20)).toBe('abort')
    expect(shouldLockSwipeBack(-16, 2)).toBe('abort')
    expect(shouldLockSwipeBack(24, 6)).toBe(true)
  })

  test('commit needs distance or a rightward flick', () => {
    expect(shouldCommitSwipeBack(40, 0, 390)).toBe(false)
    expect(shouldCommitSwipeBack(120, 0, 390)).toBe(true)
    expect(shouldCommitSwipeBack(50, 0.8, 390)).toBe(true)
    expect(shouldCommitSwipeBack(-10, 1, 390)).toBe(false)
  })
})

describe('swipe-back is wired on every split Messenger', () => {
  const chatScreen = read('components/messaging/ChatScreen.tsx')
  const inbox = read('components/messaging/UnifiedInbox.tsx')
  const admin = read('components/messaging/AdminMasterMessenger.tsx')
  const css = read('app/messenger-mobile-back-list.css')

  test('ChatScreen owns the edge gesture and calls onMobileBack', () => {
    expect(chatScreen).toContain('onMobileBack')
    expect(chatScreen).toContain('ys-chatscreen-swipeback')
    expect(chatScreen).toContain('data-swipe-back="true"')
    expect(chatScreen).toContain('data-swipe-dragging')
    expect(chatScreen).toContain('isSwipeBackStart')
    expect(chatScreen).toContain('shouldCommitSwipeBack')
    expect(chatScreen).toContain('isMessengerMobileViewport()')
  })

  test('student/attorney/consultant inbox and admin Master Chats use the same back action as the chevron', () => {
    expect(inbox).toContain('onMobileBack={() => setMobileShowChat(false)}')
    expect(admin).toContain('onMobileBack={closeThread}')
  })

  test('the list peeks under the sliding chat on phones only', () => {
    expect(css).toContain("[data-swipe-dragging='true']")
    expect(css).toContain('.ys-chatscreen-swipeback')
    expect(css).toContain('touch-action: pan-x')
    expect(css).toContain("data-mobile-view='chat'] .ys-chatscreen-swipeback")
  })
})
