import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('Admin Master Chats resilience and Cloudflare CPU protection', () => {
  const messenger = read('components/messaging/AdminMasterMessenger.tsx')
  const conversationsRoute = read('app/api/admin/messages/conversations/route.ts')
  const messagesRoute = read('app/api/admin/messages/conversations/[id]/messages/route.ts')

  test('conversations GET route includes CPU_TIMEOUT_REGEX error catching and bounded limit', () => {
    expect(conversationsRoute).toContain("import { CPU_TIMEOUT_REGEX } from '@/lib/cpuTimeout'")
    expect(conversationsRoute).toContain('CPU_TIMEOUT_REGEX.test(message)')
    expect(conversationsRoute).toContain('status: isCpuTimeout ? 503 : 500')
    expect(conversationsRoute).toContain('.limit(500)')
    expect(conversationsRoute).not.toContain('.limit(2000)')
  })

  test('messages GET route includes CPU_TIMEOUT_REGEX error catching', () => {
    expect(messagesRoute).toContain("import { CPU_TIMEOUT_REGEX } from '@/lib/cpuTimeout'")
    expect(messagesRoute).toContain('CPU_TIMEOUT_REGEX.test(message)')
    expect(messagesRoute).toContain('status: isCpuTimeout ? 503 : 500')
  })

  test('messenger UI preserves conversations and active messages during background polling errors', () => {
    expect(messenger).toContain('if (!silent || conversationsRef.current.length === 0)')
    expect(messenger).toContain("if (full || kind === 'older' || activeMsgs.length === 0)")
    expect(messenger).toContain("setListError('')")
  })
})
