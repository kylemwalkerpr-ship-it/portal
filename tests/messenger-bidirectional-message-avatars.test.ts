import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('Messenger sender avatar contract', () => {
  const bubble = read('components/messaging/MessageBubble.tsx')
  const inbox = read('components/messaging/UnifiedInbox.tsx')
  const admin = read('components/messaging/AdminMasterMessenger.tsx')
  const profileRoute = read('app/api/profile/route.ts')

  test('outgoing bubbles resolve the signed-in profile photo once and reuse it', () => {
    expect(bubble).toContain("fetch('/api/profile', { credentials: 'same-origin' })")
    expect(bubble).toContain('viewerAvatarProfilePromise')
    expect(bubble).toContain("viewerProfile?.avatar_url || null")
    expect(bubble).toContain("viewerProfile?.full_name || 'You'")
    expect(profileRoute).toContain('avatar_url')
  })

  test('every bubble gets a sender anchor instead of only the first incoming bubble', () => {
    expect(bubble).toContain('const showAvatar = Boolean(resolvedAvatarUrl || resolvedAvatarName)')
    expect(bubble).toContain('{!mine && avatarNode}')
    expect(bubble).toContain('{mine && avatarNode}')
    expect(bubble).not.toContain('const showAvatar = !mine && isFirstInGroup')
  })

  test('shared inbox still supplies the real counterpart profile while mine uses the shared self fallback', () => {
    expect(inbox).toContain('counterpartAvatarUrl={activeConv?.counterpart?.avatar_url}')
    expect(inbox).toContain("avatarUrl={!mine && !isAdminMsg ? counterpartAvatarUrl : undefined}")
    expect(inbox).toContain("avatarName={!mine ? (isAdminMsg ? 'Admin' : counterpartName) : undefined}")
  })

  test('admin master chat already supplies sender identity for both directions', () => {
    expect(admin).toContain('avatarUrl={message.sender?.avatar_url}')
    expect(admin).toContain('avatarName={senderName}')
  })
})
