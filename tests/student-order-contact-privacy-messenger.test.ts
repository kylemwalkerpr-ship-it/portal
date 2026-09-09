import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('student order contact privacy and canonical Messenger routing', () => {
  const orderDetailApi = read('app/api/student/orders/[id]/route.ts')
  const studentData = read('app/api/student/data/route.ts')
  const studentHome = read('app/api/student/home/route.ts')
  const studentConversations = read('app/api/student/conversations/route.ts')
  const mobileOrders = read('lib/mobileOrders.ts')
  const messengerList = read('app/api/messages/conversations/route.ts')
  const messengerThread = read('app/api/messages/conversations/[id]/route.ts')
  const mobileMessages = read('lib/mobileMessages.ts')
  const bridge = read('components/student/StudentOrderMessengerBridge.tsx')
  const layout = read('app/layout.tsx')
  const safety = read('lib/safety.ts')

  test('student order APIs never return consultant email or use email as a display-name fallback', () => {
    expect(orderDetailApi).not.toContain('consultantEmail')
    expect(orderDetailApi).not.toContain('consultant?.email')
    expect(orderDetailApi).not.toContain("select('id, full_name, email")

    expect(studentData).not.toContain('consultant?.email')
    expect(studentData).not.toContain("select('id, email, full_name")

    expect(studentHome).not.toContain('consultant?.email')
    expect(studentHome).not.toContain("select('id, full_name, email")

    expect(studentConversations).not.toContain('consultant?.email')
    expect(studentConversations).not.toContain('p?.email')
    expect(studentConversations).not.toContain("select('id, full_name, email")
  })

  test('native student order payloads apply the same provider-contact privacy boundary', () => {
    expect(mobileOrders).not.toContain('consultantEmail')
    expect(mobileOrders).not.toContain('consultant?.email')
    expect(mobileOrders).not.toContain('(consultant as any)?.email')
    expect(mobileOrders).not.toContain("select('id, full_name, email, avatar_url, role')")
  })

  test('Messenger web and native payloads expose platform identity, not counterpart email', () => {
    for (const source of [messengerList, messengerThread, mobileMessages]) {
      expect(source).not.toContain('counterpart.email')
      expect(source).not.toContain('counterpartRow.email')
      expect(source).not.toContain("select('id, full_name, email, avatar_url, role')")
    }
  })

  test('Open chat hands the order to the full shared Messenger and retires the legacy Activity control', () => {
    expect(bridge).toContain("import { openOrderInMessenger } from '@/lib/openOrderMessenger'")
    expect(bridge).toContain("new URLSearchParams(window.location.search).get('order')")
    expect(bridge).toContain('await openOrderInMessenger({ orderId })')
    expect(bridge).toContain("text === 'open chat'")
    expect(bridge).toContain('isLegacyActivityButton')
    expect(bridge).toContain('button.hidden = true')
    expect(bridge).toContain("data-yousafe-retired-order-activity")
    expect(bridge).toContain("document.addEventListener('click', onClickCapture, true)")
    expect(layout).toContain("import StudentOrderMessengerBridge from '@/components/student/StudentOrderMessengerBridge'")
    expect(layout).toContain('<StudentOrderMessengerBridge />')
  })

  test('the canonical Messenger continues to block typed emails and phone numbers server-side', () => {
    expect(messengerThread).toContain('const safety = safetyGuard(text)')
    expect(messengerThread).toContain("status: 422")
    expect(safety).toContain("type: 'email'")
    expect(safety).toContain("type: 'phone'")
    expect(safety).toContain("type: 'phone_intl'")
    expect(safety).toContain('Keep all communication on YouSafe.')
    expect(mobileMessages).toContain('const safety = safetyGuard(text)')
  })
})
