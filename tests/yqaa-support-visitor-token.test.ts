import fs from 'node:fs'
import path from 'node:path'
import { escalateToSupport } from '@/lib/chatEscalation'

// support-saas now serves a widget conversation only to the visitor holding its
// per-conversation token (X-Chat-Token). YQAA must carry the token from the
// server-side handoff to the browser and send it on every poll / live message.
const assistant = fs.readFileSync(path.join(process.cwd(), 'public/assistant.js'), 'utf8')
const route = fs.readFileSync(path.join(process.cwd(), 'app/api/chat/route.ts'), 'utf8')

describe('YQAA support visitor token', () => {
  const originalFetch = global.fetch
  afterEach(() => { global.fetch = originalFetch })

  test('escalateToSupport surfaces the visitor token support-saas issues', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ conversation: { id: 'c1', status: 'waiting_for_agent' }, queue: { position: 1, estimatedWaitMinutes: 4 }, visitorToken: 'tok_abc' }),
    })) as any
    const r = await escalateToSupport({ message: 'human please', visitor: null })
    expect(r.conversationId).toBe('c1')
    expect(r.visitorToken).toBe('tok_abc')
  })

  test('missing token maps to null', async () => {
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ conversation: { id: 'c2' } }) })) as any
    expect((await escalateToSupport({ message: 'x', visitor: null })).visitorToken).toBeNull()
  })

  test('both handoff responses pass the token to the browser', () => {
    expect(route.match(/visitorToken: handoff\.visitorToken/g)?.length).toBe(2)
  })

  test('assistant.js stores the token and sends it on poll and live POST', () => {
    expect(assistant).toContain("token: data.handoff.visitorToken || null")
    expect(assistant).toContain("headers['X-Chat-Token'] = support.token")
    expect(assistant).toContain("encodeURIComponent(support.conversationId), { headers: supportHeaders() })")
    expect(assistant).toContain("headers: supportHeaders({ 'Content-Type': 'application/json' })")
    // Rejected / pre-token sessions end gracefully instead of polling forever.
    expect(assistant).toContain('if (res.status === 401 || res.status === 404) { endLiveSession(); return }')
    expect(assistant).toContain('if (!support.token) { endLiveSession(); return }')
    // A restarted support conversation is adopted with its new token.
    expect(assistant).toContain('support.token = live.data.visitorToken')
  })
})
