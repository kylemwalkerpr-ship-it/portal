import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('responsive Messenger conversation header', () => {
  const enhancer = read('components/messaging/MessengerHeaderEnhancer.tsx')
  const headerCss = read('components/messaging/conversation-header.css')
  const infoCss = read('components/messaging/conversation-info-enhancements.css')
  const profile = read('components/messaging/ProfilePreviewDrawer.tsx')
  const layout = read('app/layout.tsx')
  const inbox = read('components/messaging/UnifiedInbox.tsx')
  const sellerRoute = read('app/api/sellers/[id]/route.ts')

  test('shared app layout mounts the enhancement over the canonical UnifiedInbox header', () => {
    expect(layout).toContain("import MessengerHeaderEnhancer from '@/components/messaging/MessengerHeaderEnhancer'")
    expect(layout).toContain('<MessengerHeaderEnhancer />')
    expect(enhancer).toContain("'.yousafe-messenger .cv-head'")
    expect(enhancer).toContain("'.cv-head-info'")
    expect(inbox).toContain('className="cv-head"')
    expect(inbox).toContain('className="cv-head-info"')
  })

  test('mobile and desktop use one responsive identity row with a combined call control', () => {
    expect(headerCss).toContain('@media (max-width: 680px)')
    expect(headerCss).toContain('flex-wrap: nowrap !important')
    expect(headerCss).toContain('height: 64px !important')
    expect(headerCss).toContain('.ys-header-call-button')
    expect(headerCss).toContain('.cv-head-actions [data-ys-legacy-call]')
    expect(headerCss).toContain('.ys-header-more-button')
    expect(headerCss).toContain('@media (min-width: 681px)')
  })

  test('nested call menu exposes the requested familiar actions while reusing existing call flow', () => {
    expect(enhancer).toContain('<strong>Voice call</strong>')
    expect(enhancer).toContain('<strong>Video call</strong>')
    expect(enhancer).toContain('<strong>Send call link</strong>')
    expect(enhancer).toContain('<strong>Schedule call</strong>')
    expect(enhancer).toContain("video.dataset.ysLegacyCall = 'video'")
    expect(enhancer).toContain("voice.dataset.ysLegacyCall = 'voice'")
    expect(enhancer).toContain('clickButton(legacyVideo())')
    expect(enhancer).toContain('clickButton(legacyVoice())')
  })

  test('header subtitle removes direct-contact email and resolves account context from counterpart role', () => {
    expect(enhancer).toContain("/@/.test(status.textContent)")
    expect(enhancer).toContain("case 'attorney': return 'Attorney · Business account'")
    expect(enhancer).toContain("case 'consultant': return 'Consultant · Business account'")
    expect(enhancer).toContain("case 'client':")
    expect(enhancer).toContain("return 'YouSafe client'")
    expect(enhancer).toContain("payload?.conversation?.counterpart?.role")
  })

  test('name click keeps the existing profile drawer and upgrades it with real conversation actions', () => {
    expect(inbox).toContain('setPreviewSellerId(activeConv?.counterpart?.id)')
    expect(profile).toContain('Conversation info')
    expect(profile).toContain('ys-contact-quick-actions')
    expect(profile).toContain('<span>Voice</span>')
    expect(profile).toContain('<span>Video</span>')
    expect(profile).toContain('<span>Search</span>')
    expect(profile).toContain('Media, links and docs')
    expect(profile).toContain('Starred messages')
    expect(profile).toContain('Messenger settings')
    expect(profile).toContain('Send custom offer')
    expect(profile).toContain('AI conversation mode')
  })

  test('conversation info is responsive and derives media from the authenticated active thread', () => {
    expect(profile).toContain("fetch(`/api/messages/conversations/${encodeURIComponent(threadId)}`")
    expect(profile).toContain('extractThreadMedia')
    expect(infoCss).toContain('width: min(460px, 100vw) !important')
    expect(infoCss).toContain('@media (max-width: 680px)')
    expect(infoCss).toContain('width: 100vw !important')
    expect(infoCss).toContain('height: 100dvh !important')
    expect(infoCss).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))')
  })

  test('profile depth remains available for providers and non-provider user roles', () => {
    expect(sellerRoute).toContain(".from('profiles')")
    expect(sellerRoute).toContain(".select('id, full_name, email, avatar_url, country, role, status, created_at')")
    expect(sellerRoute).toContain('wireRole')
    expect(profile).toContain("admin: 'YouSafe team'")
    expect(profile).toContain("support: 'YouSafe support'")
  })
})
