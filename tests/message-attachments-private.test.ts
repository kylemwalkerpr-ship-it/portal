import fs from 'fs'
import path from 'path'
import {
  canOpenConversationAttachment,
  isMessageAttachmentRow,
  messageAttachmentProxyPath,
  resolveMessageAttachmentPath,
  withSignedMessageAttachmentUrls,
} from '@/lib/messengerAttachmentAccess'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

describe('message-attachments is private and served via signed URLs', () => {
  test('upload routes never build public URLs and create the bucket private', () => {
    for (const file of [
      'app/api/messages/conversations/[id]/attach/route.ts',
      'app/api/admin/messages/conversations/[id]/attach/route.ts',
    ]) {
      const src = read(file)
      expect(src).not.toContain('getPublicUrl')
      expect(src).not.toContain('public: true')
      expect(src).toContain('messageAttachmentProxyPath(messageId)')
      expect(src).toMatch(/id:\s+messageId/)
    }
  })

  test('proxy route checks participation before signing', () => {
    const src = read('app/api/messages/attachments/[id]/route.ts')
    expect(src).toContain('requirePortalUser')
    const check = src.indexOf('canOpenConversationAttachment(')
    const sign = src.indexOf('signMessageAttachment(db')
    expect(check).toBeGreaterThan(0)
    expect(sign).toBeGreaterThan(check)
    expect(src).toContain("'Cache-Control': 'private, no-store'")
  })

  test('participant / staff gate', () => {
    const conv = { participant_a: 'a', participant_b: 'b' }
    expect(canOpenConversationAttachment(conv, { profileId: 'a', role: 'client' })).toBe(true)
    expect(canOpenConversationAttachment(conv, { profileId: 'b', role: 'attorney' })).toBe(true)
    expect(canOpenConversationAttachment(conv, { profileId: 'x', role: 'client' })).toBe(false)
    expect(canOpenConversationAttachment(conv, { profileId: 'x', role: 'admin' })).toBe(true)
    expect(canOpenConversationAttachment(conv, { profileId: 'x', role: 'support' })).toBe(true)
    expect(canOpenConversationAttachment(null, { profileId: 'a', role: 'client' })).toBe(false)
  })

  test('resolves object path from metadata or a legacy public URL', () => {
    expect(resolveMessageAttachmentPath({ metadata: { storage_path: 'c/u/f.pdf' } })).toBe('c/u/f.pdf')
    expect(
      resolveMessageAttachmentPath({
        attachment_url: 'https://x.supabase.co/storage/v1/object/public/message-attachments/c/u/a%20b.pdf',
      }),
    ).toBe('c/u/a b.pdf')
    expect(resolveMessageAttachmentPath({ metadata: { storage_path: '../etc/passwd' } })).toBeNull()
    expect(resolveMessageAttachmentPath({ attachment_url: 'https://example.com/x.pdf' })).toBeNull()
  })

  test('mobile payload swaps attachment URLs for signed ones', async () => {
    const db = {
      storage: {
        from: () => ({
          createSignedUrl: async (p: string, ttl: number) => ({ data: { signedUrl: `signed:${p}:${ttl}` }, error: null }),
        }),
      },
    }
    const out = await withSignedMessageAttachmentUrls(db, [
      { id: 'm1', attachment_url: messageAttachmentProxyPath('m1'), metadata: { storage_path: 'c/u/f.pdf' } },
      { id: 'm2', attachment_url: null, metadata: {} },
      { id: 'm3', attachment_url: 'https://elsewhere.example/x.png', metadata: {} },
    ])
    expect(out[0].attachment_url).toBe('signed:c/u/f.pdf:300')
    expect(out[1].attachment_url).toBeNull()
    expect(out[2].attachment_url).toBe('https://elsewhere.example/x.png')
    expect(isMessageAttachmentRow({ attachment_url: '/api/messages/attachments/abc' })).toBe(true)
  })
})
