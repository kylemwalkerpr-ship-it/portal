import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('messenger mobile parity', () => {
  const pane = read('components/marketplace/ChatSidePane.tsx')
  const composer = read('components/messaging/AutoGrowInput.tsx')
  const chatScreen = read('components/messaging/ChatScreen.tsx')
  const css = read('app/messenger-mobile-parity.css')
  const layout = read('app/layout.tsx')
  const conversationRoute = read('app/api/messages/conversations/[id]/route.ts')
  const attachRoute = read('app/api/messages/conversations/[id]/attach/route.ts')
  const aiModeRoute = read('app/api/messages/conversations/[id]/ai-mode/route.ts')

  test('marketplace chat treats the unified conversation as the live source of truth', () => {
    expect(pane).toContain("fetch(`/api/messages/conversations/${id}`")
    expect(pane).toContain("subscribeToTable(\n      'conversation_messages'")
    expect(pane).toContain('conversationIdRef.current')
    expect(pane).toContain('normalizeUnifiedThread')
    // Regression: the prior effect skipped attorneys, leaving their drawer on
    // the legacy feed where AI conversation_messages could be invisible.
    expect(pane).not.toContain('if (!open || attorneyId || !conversationId) return')
  })

  test('unified marketplace messages map direction from counterpart identity and preserve AI metadata', () => {
    expect(pane).toContain("m.sender_id === counterpartId ? 'attorney' : 'client'")
    expect(pane).toContain('metadata: m.metadata || {}')
    expect(pane).toContain('m?.metadata?.ai_generated')
    expect(pane).toContain('YouSafe AI live replies are on.')
    // Regression: every real message has sender_id, so this old check put every
    // unified row on the attorney side of the drawer.
    expect(pane).not.toContain("sender_role: m.sender_id ? 'attorney' : 'client'")
  })

  test('shared dashboard composer refreshes active threads from realtime messages', () => {
    expect(composer).toContain("import { subscribeToTable } from '@/lib/supabaseRealtime'")
    expect(composer).toContain("subscribeToTable('conversation_messages', 'public'")
    expect(composer).toContain('row?.conversation_id === conversationId')
    expect(composer).toContain('liveRefreshRef.current?.(message)')
    expect(composer).toContain("document.addEventListener('visibilitychange', onVisible)")
  })

  test('new messages remain visible without yanking a reader who scrolled up', () => {
    expect(chatScreen).toContain('nearBottomRef.current')
    expect(chatScreen).toContain('ys-new-message-pill')
    expect(chatScreen).toContain('Jump to the newest message')
    expect(chatScreen).toContain('aria-live="polite"')
    expect(chatScreen).toContain("overscrollBehaviorY: 'contain'")
  })

  test('mobile AI controls and dashboard menus cannot be squeezed off-screen', () => {
    expect(css).toContain("span[title='SuperGrok AI closer']")
    expect(css).toContain('flex: 1 1 100% !important')
    expect(css).toContain('.yousafe-dashboard-shell .yousafe-sidebar-nav')
    expect(css).toContain('scroll-snap-type: x proximity')
    expect(css).toContain('overscroll-behavior-x: contain')
    expect(css).toContain('.yousafe-dashboard-shell .yousafe-nav-item')
    expect(css).toContain('min-height: 46px !important')
  })

  test('provider participation never silently pauses AI', () => {
    // Attorney/consultant text and attachments must leave ai_mode untouched.
    // Only the explicit provider Take over / Resume API may change it.
    expect(conversationRoute).not.toContain("isProviderRole(auth.role) || auth.role === 'admin'")
    expect(attachRoute).not.toContain("isProviderRole(auth.role) || auth.role === 'admin'")
    expect(conversationRoute).not.toContain("ai_paused_reason: 'human_message'")
    expect(attachRoute).not.toContain("ai_paused_reason: 'human_attachment'")
    expect(conversationRoute).toContain("if (auth.role === 'admin')")
    expect(attachRoute).toContain("if (auth.role === 'admin')")
    expect(conversationRoute).toContain('Only the explicit Take over control may pause provider-side AI')
    expect(attachRoute).toContain('Only the explicit Take over control may')

    // Explicit provider controls still support pause/resume and remain the
    // authoritative route for provider AI-mode transitions.
    expect(aiModeRoute).toContain("requested !== 'auto' && requested !== 'paused' && requested !== 'off'")
    expect(aiModeRoute).toContain('isProviderRole(auth.role)')
    expect(aiModeRoute).toContain('setConversationAiMode')
  })

  test('focused parity layer loads after the general mobile layers', () => {
    const hardening = layout.indexOf("import './mobile-hardening.css'")
    const conversion = layout.indexOf("import './mobile-conversion.css'")
    const parity = layout.indexOf("import './messenger-mobile-parity.css'")
    expect(hardening).toBeGreaterThan(-1)
    expect(conversion).toBeGreaterThan(hardening)
    expect(parity).toBeGreaterThan(conversion)
  })
})
