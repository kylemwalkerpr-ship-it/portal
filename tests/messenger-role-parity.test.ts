import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('Messenger pane + list-scroll parity across roles', () => {
  const product = read('app/messenger-product-contract.css')
  const adminCss = read('components/messaging/admin-master-chats.css')
  const admin = read('components/messaging/AdminMasterMessenger.tsx')
  const adminShell = read('components/design/admin.jsx')
  const conversations = read('app/api/messages/conversations/route.ts')
  const thread = read('app/api/messages/conversations/[id]/route.ts')
  const attorneyHeadshot = read('app/api/attorney/profile/headshot/route.ts')
  const consultantAvatar = read('app/api/consultant/profile/avatar/route.ts')
  const helper = read('lib/messaging/profileAvatars.ts')

  test('product contract gives every messenger a definite iOS list-scroll owner', () => {
    expect(product).toContain("body .yousafe-messenger > .ys-inbox-frame")
    expect(product).toContain("body .yousafe-messenger > .admin-master-shell")
    expect(product).toContain('flex: 1 1 0% !important')
    expect(product).toContain('grid-template-areas: "head" "rail" !important')
  })

  test('Admin Master Chats uses the same list owner instead of display:block + height 100%', () => {
    expect(adminCss).not.toContain(".ys-chatscreen[data-mobile-view='list'] .ys-chatscreen-sidebar { display: block !important; }")
    expect(adminCss).toContain('.admin-master-list')
    expect(adminCss).toContain('overflow-y: scroll !important')
    expect(adminCss).toContain('flex: 1 1 0% !important')
    expect(admin).toContain('writeMessengerThreadParam')
    expect(admin).toContain('isMessengerMobileViewport')
    expect(admin).toContain("className=\"admin-master-shell ys-inbox-frame\"")
    expect(adminShell).toContain("overflow: page === 'master-chats' ? 'hidden' : 'auto'")
  })

  test('seller headshots dual-write to profiles.avatar_url and Messenger fills remaining gaps', () => {
    expect(helper).toContain('export async function fillMissingProfileAvatars')
    expect(helper).toContain('export async function syncProfileAvatar')
    expect(attorneyHeadshot).toContain('syncProfileAvatar')
    expect(consultantAvatar).toContain('syncProfileAvatar')
    expect(conversations).toContain('fillMissingProfileAvatars')
    expect(thread).toContain('fillMissingProfileAvatars')
  })
})
