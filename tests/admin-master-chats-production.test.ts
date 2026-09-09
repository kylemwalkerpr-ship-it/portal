import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('Admin Master Chats production messenger', () => {
  const messenger = read('components/messaging/AdminMasterMessenger.tsx')
  const composer = read('components/messaging/AdminMasterComposer.tsx')
  const css = read('components/messaging/admin-master-chats.css')
  const attach = read('app/api/admin/messages/conversations/[id]/attach/route.ts')
  const messages = read('app/api/admin/messages/conversations/[id]/messages/route.ts')
  const reactRoute = read('app/api/admin/messages/conversations/[id]/messages/[mid]/react/route.ts')

  test('keeps the proven scoped messenger and raw timestamp contracts', () => {
    expect(messenger).toContain("import './messenger-tokens.css'")
    expect(messenger).toContain("import './admin-master-chats.css'")
    expect(messenger).toContain('className="yousafe-messenger"')
    expect(messenger).toContain('data-theme="light"')
    expect(messenger).toContain('data-density="compact"')
    expect(messenger).toContain('timestamp={message.created_at}')
    expect(messenger).not.toContain('fmtFullTime')
  })

  test('groups conversations by provider and clearly separates client/provider identity', () => {
    expect(messenger).toContain('groupByProvider')
    expect(messenger).toContain('admin-master-provider-group')
    expect(messenger).toContain('grouped by provider')
    expect(messenger).toContain('data-kind="client"')
    expect(messenger).toContain('data-kind="provider"')
    expect(messenger).toContain('Client ·')
    expect(messenger).toContain('shared thread · admin oversight')
  })

  test('uses realtime delivery with the existing bounded poll as fallback', () => {
    expect(messenger).toContain("subscribeToTable('conversation_messages', 'public'")
    expect(messenger).toContain("subscribeToTable('conversations', 'public'")
    expect(messenger).toContain("subscribeToTable('conversation_message_reactions', 'public'")
    expect(messenger).toContain('window.setInterval(refreshVisible, 8000)')
    expect(messenger).toContain('visibilitychange')
    expect(messenger).toContain('loadThreadPage')
    expect(messenger).toContain('mergeById')
  })

  test('admin composer supports text, emoji, attachments and voice notes', () => {
    expect(messenger).toContain('<AdminMasterComposer')
    expect(composer).toContain('Pick an emoji')
    expect(composer).toContain('Attach a file')
    expect(composer).toContain('Record a voice message')
    expect(composer).toContain('MediaRecorder')
    expect(composer).toContain('/api/admin/messages/conversations/${conversationId}/attach')
    expect(composer).toContain("params.set('type', 'voice')")
    expect(composer).toContain('to: directTo')
  })

  test('admin attachment route is admin-authenticated and keeps directed metadata', () => {
    expect(attach).toContain("import { requireAdminUser } from '@/lib/portalAuth'")
    expect(attach).toContain('await requireAdminUser()')
    expect(attach).toContain("admin_message: true")
    expect(attach).toContain('admin_directed_to: directedTo')
    expect(attach).toContain('admin_directed_to_id: target.id')
    expect(attach).toContain('message-attachments')
    expect(attach).toContain('MAX_BYTES = 25 * 1024 * 1024')
    expect(attach).toContain("ai_paused_reason: 'admin_attachment'")
  })

  test('quoted replies are real thread messages rather than decorative UI', () => {
    expect(messenger).toContain('replyTo={message.reply_preview || null}')
    expect(messenger).toContain('onReplyStart={handleReplyStart}')
    expect(messenger).toContain('reply_to_id: replyTo?.id || null')
    expect(composer).toContain('Replying to {replyTo.senderName}')
    expect(messages).toContain('reply_to_id: replyToId')
    expect(messages).toContain('reply_preview: reply ?')
  })

  test('reactions are admin-authenticated, persisted and live-refreshable', () => {
    expect(messenger).toContain('onReact={handleReact}')
    expect(messenger).toContain('/messages/${msgId}/react')
    expect(messages).toContain("from('conversation_message_reactions')")
    expect(messages).toContain('reactions: reactionMap.get(m.id) || []')
    expect(reactRoute).toContain('requireAdminUser')
    expect(reactRoute).toContain("from('conversation_message_reactions')")
    expect(reactRoute).toContain('profile_id: profileId')
  })

  test('mobile shell provides full-screen pane parity and safe touch sizing', () => {
    expect(css).toContain('@media (max-width: 680px)')
    expect(css).toContain('height: 100dvh')
    expect(css).toContain("[data-mobile-view='chat']")
    expect(css).toContain("[data-mobile-view='list']")
    expect(css).toContain('min-width: 44px !important')
    expect(css).toContain('font-size: 16px !important')
    expect(css).toContain('env(safe-area-inset-bottom)')
  })

  test('AI controls remain explicit and admin intervention is disclosed', () => {
    expect(messenger).toContain('Take over')
    expect(messenger).toContain('Resume AI')
    expect(messenger).toContain('Admin intervention pauses AI until Resume AI is selected.')
    expect(messenger).toContain("setAiMode('paused')")
    expect(messenger).toContain("setAiMode('auto')")
  })
})
