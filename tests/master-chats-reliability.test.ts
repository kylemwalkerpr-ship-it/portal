/**
 * Admin Master Chats — reliability regression suite.
 *
 * Covers the four permanent-fix contracts that shipped for the "Invalid
 * Date + unstyled full-width bubbles + native textarea" report:
 *
 *  1. DATE CONTRACT      — lib/messaging/format.ts never emits "Invalid
 *     Date" / NaN; handles real ISO timestamps with timezone offsets and
 *     invalid or absent values deterministically.
 *  2. SCOPE / STYLE ROOT — messenger-tokens.css scopes bubble + composer
 *     rules to `.yousafe-messenger`; AdminMasterMessenger re-declares that
 *     root and passes RAW created_at to MessageBubble (which formats once).
 *  3. THREAD RACES       — pagination helper + API ordering contract: the
 *     admin GET messages endpoint returns a bounded newest-first page in
 *     ascending order with an older-history cursor (never the old unbounded
 *     oldest-1000 shape) and still enforces admin auth.
 *
 * No live messages / DB writes are involved; everything runs in Jest node.
 */
import fs from 'fs'
import path from 'path'

const ROOT = process.cwd()

/* ════════════════════════════════════════════════════════════════════════
   1. format.ts date contract
   ════════════════════════════════════════════════════════════════════════ */
describe('lib/messaging/format date contract', () => {
  const fmt = require('@/lib/messaging/format')

  it('parses real ISO timestamps and timezone offsets (no Invalid Date)', () => {
    const isoWithOffset = '2026-09-05T14:30:00.000-04:00'
    const isoUtc = '2026-09-05T18:30:00.000Z'
    // Both resolve to the same instant → same absolute rendering.
    expect(fmt.toValidDate(isoWithOffset)).not.toBeNull()
    expect(fmt.toValidDate(isoWithOffset)!.getTime()).toBe(fmt.toValidDate(isoUtc)!.getTime())
    // Compact offset form (common in Postgres-backed APIs).
    expect(fmt.toValidDate('2026-09-05T14:30:00-04:00')!.getTime())
      .toBe(fmt.toValidDate('2026-09-05T18:30:00.000Z')!.getTime())
    // fmtFullTime renders a real label (no "Invalid Date" substring).
    expect(fmt.fmtFullTime(isoUtc)).not.toMatch(/Invalid/)
    expect(fmt.fmtFullTime(isoUtc)).not.toBe('')
  })

  it('returns empty strings for invalid or absent timestamps instead of NaN text', () => {
    expect(fmt.fmtFullTime(null)).toBe('')
    expect(fmt.fmtFullTime(undefined)).toBe('')
    expect(fmt.fmtFullTime('')).toBe('')
    expect(fmt.fmtFullTime('not-a-date')).toBe('')
    expect(fmt.fmtFullTime('2026-13-45T99:99:99Z')).toBe('')
    expect(fmt.fmtRelative('not-a-date')).toBe('')
    expect(fmt.fmtRelative(undefined)).toBe('')
    expect(fmt.fmtRelative(null)).toBe('')
    expect(fmt.dateLabel('garbage')).toBe('')
    expect(fmt.dateLabel(null)).toBe('')
  })

  it('treats invalid dates as never same-day', () => {
    const good = '2026-09-05T10:00:00.000Z'
    expect(fmt.sameDay('nope', good)).toBe(false)
    expect(fmt.sameDay(good, null)).toBe(false)
    expect(fmt.sameDay(null, null)).toBe(false)
    expect(fmt.sameDay(good, '2026-09-05T22:00:00Z')).toBe(true)
    // One invalid, one valid → false (no crashing into NaN year).
    expect(fmt.sameDay('not-a-date', good)).toBe(false)
  })

  it('accepts Date instances and never emits Today/Yesterday for invalid dates', () => {
    const d = new Date('2026-09-05T12:00:00Z')
    expect(fmt.dateLabel(d)).not.toBe('')
    expect(fmt.fmtFullTime(d)).not.toBe('')
    expect(fmt.dateLabel('bad-date')).not.toBe('Today')
    expect(fmt.dateLabel('bad-date')).not.toBe('Yesterday')
    // Valid date on same day as "now" → Today.
    expect(fmt.dateLabel(new Date().toISOString())).toBe('Today')
  })

  it('fmtRelative never overflows to NaN units for valid timestamps', () => {
    const recent = new Date(Date.now() - 30_000).toISOString()
    expect(fmt.fmtRelative(recent)).toMatch(/^\d+m$|^now$/)
  })
})

/* ════════════════════════════════════════════════════════════════════════
   2. Scope / style root + raw-timestamp regression (static contract)
   ════════════════════════════════════════════════════════════════════════ */
describe('Admin Master Chats scope + timestamp contract', () => {
  const messengerSrc = fs.readFileSync(
    path.join(ROOT, 'components/messaging/AdminMasterMessenger.tsx'),
    'utf8',
  )
  const bubbleSrc = fs.readFileSync(
    path.join(ROOT, 'components/messaging/MessageBubble.tsx'),
    'utf8',
  )
  const css = fs.readFileSync(
    path.join(ROOT, 'components/messaging/messenger-tokens.css'),
    'utf8',
  )

  it('re-declares the scoped .yousafe-messenger root + theme/density', () => {
    expect(messengerSrc).toContain("import './messenger-tokens.css'")
    expect(messengerSrc).toMatch(/className="yousafe-messenger"/)
    expect(messengerSrc).toMatch(/data-theme="light"/)
    expect(messengerSrc).toMatch(/data-density="compact"/)
  })

  it('passes raw created_at to MessageBubble (no double formatting)', () => {
    // MessageBubble formats internally — the admin messenger must NOT pre-format.
    expect(bubbleSrc).toMatch(/fmtFullTime\(timestamp\)/)
    expect(messengerSrc).toMatch(/timestamp=\{m\.created_at\}/)
    expect(messengerSrc).not.toContain('fmtFullTime')
  })

  it('scopes bubble + composer rules to the .yousafe-messenger root', () => {
    for (const sel of ['.bubrow', '.bub', '.bub-foot', '.comp-input', '.comp', '.comp-send', '.iconbtn']) {
      expect(css).toContain(`.yousafe-messenger ${sel}`)
    }
  })

  it('omits attachment/voice controls in the admin composer (capability props)', () => {
    expect(messengerSrc).toContain('allowAttach={false}')
    expect(messengerSrc).toContain('allowVoice={false}')
  })
})

/* ════════════════════════════════════════════════════════════════════════
   3. Thread pagination + API auth (pure helper + route contract)
   ════════════════════════════════════════════════════════════════════════ */
describe('lib/adminMessages/threadPage', () => {
  const { buildThreadPage, parseThreadPageLimit, THREAD_PAGE_MAX_LIMIT, keyOf, encodeCursor, parseCursor, olderThanSlot, cursorFilter } =
    require('@/lib/adminMessages/threadPage')

  it('clamps and defaults the page limit', () => {
    expect(parseThreadPageLimit(null)).toBe(100)
    expect(parseThreadPageLimit(undefined)).toBe(100)
    expect(parseThreadPageLimit('')).toBe(100)
    expect(parseThreadPageLimit('abc')).toBe(100)
    expect(parseThreadPageLimit('0')).toBe(100)
    expect(parseThreadPageLimit('-5')).toBe(100)
    expect(parseThreadPageLimit('50')).toBe(50)
    expect(parseThreadPageLimit('99999')).toBe(THREAD_PAGE_MAX_LIMIT)
  })

  it('returns the newest page ascending with a composite (created_at,id) cursor', () => {
    const rows = [
      { id: 'm3', created_at: '2026-09-05T10:00:00Z' },
      { id: 'm2', created_at: '2026-09-05T09:00:00Z' },
      { id: 'm1', created_at: '2026-09-05T08:00:00Z' },
    ]
    const r = buildThreadPage(rows, 2, keyOf)
    expect(r.messages.map((m) => m.id)).toEqual(['m2', 'm3']) // ascending, newest kept
    expect(r.has_older).toBe(true)
    // Cursor is the composite key of the OLDEST message of the page.
    expect(r.older_cursor).toBe(encodeCursor('2026-09-05T09:00:00Z', 'm2'))
    expect(parseCursor(r.older_cursor)).toEqual({ created_at: '2026-09-05T09:00:00Z', id: 'm2' })
  })

  it('stops pagination when no older rows remain', () => {
    const rows = [
      { id: 'm2', created_at: '2026-09-05T10:00:00Z' },
      { id: 'm1', created_at: '2026-09-05T08:00:00Z' },
    ]
    const r = buildThreadPage(rows, 100, keyOf)
    expect(r.messages.map((m) => m.id)).toEqual(['m1', 'm2'])
    expect(r.has_older).toBe(false)
    expect(r.older_cursor).toBeNull()
  })

  it('tolerates empty / null result sets', () => {
    const r = buildThreadPage(null as any, 100, keyOf)
    expect(r.messages).toEqual([])
    expect(r.has_older).toBe(false)
    expect(r.older_cursor).toBeNull()
  })

  it('rejects malformed cursors instead of skipping or crashing', () => {
    expect(parseCursor(null)).toBeNull()
    expect(parseCursor('')).toBeNull()
    expect(parseCursor('not-json')).toBeNull()
    expect(parseCursor('{"c":"only-c"}')).toBeNull()
    expect(parseCursor('{"c":"2026-09-05T09:00:00Z","i":42}')).toBeNull()
    expect(parseCursor('{"c":"garbage","i":"m1"}')).toBeNull()
  })

  it('walks a full history WITHOUT skipping equal-boundary-timestamp messages', () => {
    // Three messages share 09:00 (ids 1,2,3); two share 10:00 (ids 1,2).
    // A bare `created_at <` cursor would permanently skip the tidier fall of
    // the 09:00 bucket. The composite (created_at,id) cursor must never
    // skip or duplicate across page boundaries.
    const all = [
      { id: 'a1', created_at: '2026-09-05T08:00:00Z' },
      { id: 'b1', created_at: '2026-09-05T09:00:00Z' },
      { id: 'b2', created_at: '2026-09-05T09:00:00Z' },
      { id: 'b3', created_at: '2026-09-05T09:00:00Z' },
      { id: 'c1', created_at: '2026-09-05T10:00:00Z' },
      { id: 'c2', created_at: '2026-09-05T10:00:00Z' },
    ]
    // Newest-first order (the DB contract): created_at DESC, id DESC.
    const newestFirst = [...all].sort((x, y) => {
      const ax = new Date(x.created_at).getTime()
      const ay = new Date(y.created_at).getTime()
      if (ax !== ay) return ay - ax
      return String(y.id).localeCompare(String(x.id))
    })

    const pageSize = 2
    const seen: string[] = []
    let cursor: string | null = null
    let guard = 0
    while (guard++ < 50) {
      const rows = cursor
        ? newestFirst.filter((m) => olderThanSlot(keyOf(m), parseCursor(cursor)!))
        : newestFirst
      const page = buildThreadPage(rows, pageSize, keyOf)
      const ids = page.messages.map((m) => m.id as string)
      seen.push(...ids)
      if (!page.has_older || !page.older_cursor) break
      if (page.older_cursor === cursor) throw new Error('cursor did not advance')
      cursor = page.older_cursor
    }

    // Every message exactly once (page-major order by construction; the
    // multiset must equal the full history — proving zero skips/duplicates).
    expect([...seen].sort()).toEqual(all.map((m) => m.id).sort())
    expect(new Set(seen).size).toBe(all.length) // no duplicates
    expect(guard).toBeLessThan(50)
  })

  it('emits the tie-safe PostgREST older-than filter', () => {
    expect(cursorFilter('2026-09-05T09:00:00Z', 'b3'))
      .toBe('created_at.lt.2026-09-05T09:00:00Z,and(created_at.eq.2026-09-05T09:00:00Z,id.lt.b3)')
    // Equality on timestamp falls through to id comparison (olderThanSlot twin).
    expect(olderThanSlot({ created_at: '2026-09-05T09:00:00Z', id: 'b2' }, { created_at: '2026-09-05T09:00:00Z', id: 'b3' })).toBe(true)
    expect(olderThanSlot({ created_at: '2026-09-05T09:00:00Z', id: 'b3' }, { created_at: '2026-09-05T09:00:00Z', id: 'b3' })).toBe(false)
    expect(olderThanSlot({ created_at: '2026-09-05T08:59:00Z', id: 'zzz' }, { created_at: '2026-09-05T09:00:00Z', id: 'aaa' })).toBe(true)
  })
})

/* ════════════════════════════════════════════════════════════════════════
   Admin GET messages route — auth + bounded ordering, via mocked Supabase
   (no live DB, no message sends).
   ════════════════════════════════════════════════════════════════════════ */
describe('admin messages GET route', () => {
  const realAdmin = {
    db: null as any,
    profileId: 'admin-1',
    profile: { id: 'admin-1', full_name: 'Admin', email: 'admin@yousafe.com', avatar_url: null },
  }

  // NOTE: the happy-path auth stub omits the `error` key on purpose — the
  // route treats `'error' in auth` as an authorization failure.
  const clearAdmin = () => jest.fn(async () => ({
    db: realAdmin.db,
    profileId: realAdmin.profileId,
    profile: realAdmin.profile,
  }))

  const makeDb = (overrides: { messages?: any[]; orCapture?: (v: string) => void; limitCapture?: (n: number) => void } = {}) => {
    const conv = {
      id: 'c1',
      participant_a: 'a',
      participant_b: 'b',
      context_kind: 'general',
      context_id: null,
      status: 'active',
      type: 'direct',
      last_message_at: '2026-09-05T10:00:00Z',
      created_at: '2026-09-01T00:00:00Z',
      metadata: { ai_mode: 'auto' },
    }
    const builder = (result: any, capture?: (b: any) => void) => {
      const b: any = {
        eq: () => b,
        order: () => b,
        or: (filter: string) => { overrides.orCapture?.(filter); return b },
        limit: (n: number) => { overrides.limitCapture?.(n); return b },
        select: () => b,
        in: () => Promise.resolve({ data: [], error: null }),
        single: () => Promise.resolve({ data: result, error: null }),
        then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
      }
      capture?.(b)
      return b
    }
    return {
      from: (table: string) => {
        if (table === 'conversation_messages') {
          return builder({ data: overrides.messages ?? [], error: null })
        }
        if (table === 'conversations') return builder(conv)
        if (table === 'profiles') {
          return builder({
            data: [
              { id: 'a', full_name: 'Client A', email: 'a@x.com', avatar_url: null, role: 'client' },
              { id: 'b', full_name: 'Prov B', email: 'b@x.com', avatar_url: null, role: 'attorney' },
            ],
            error: null,
          })
        }
        return builder(null)
      },
    }
  }

  it('returns 401 for a non-admin caller', async () => {
    jest.doMock('@/lib/portalAuth', () => ({
      requireAdminUser: jest.fn(async () => ({ error: 'Admin access required.', status: 401 })),
    }))
    jest.doMock('@/lib/safety', () => ({ safetyGuard: () => ({ ok: true }) }))
    jest.doMock('@/lib/messengerAi', () => ({ readAiMode: () => 'auto', setConversationAiMode: jest.fn() }))
    jest.resetModules()
    const { GET } = await import('@/app/api/admin/messages/conversations/[id]/messages/route')
    const res = await GET(new Request('https://portal.local/api/admin/messages/conversations/c1/messages'), {
      params: Promise.resolve({ id: 'c1' }),
    })
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('Admin access required.')
  })

  it('returns newest page ascending with older_history cursor and enforces limit+1 probe', async () => {
    const captured: { limit?: number } = {}
    const db = makeDb({
      messages: [
        { id: 'm3', sender_id: 'a', type: 'text', body: 'three', metadata: {}, created_at: '2026-09-05T10:00:00Z', attachment_url: null, attachment_name: null, ref_offer_id: null, ref_order_id: null, ref_inquiry_id: null, reply_to_id: null },
        { id: 'm2', sender_id: 'b', type: 'text', body: 'two', metadata: {}, created_at: '2026-09-05T09:00:00Z', attachment_url: null, attachment_name: null, ref_offer_id: null, ref_order_id: null, ref_inquiry_id: null, reply_to_id: null },
        { id: 'm1', sender_id: 'a', type: 'text', body: 'one', metadata: {}, created_at: '2026-09-05T08:00:00Z', attachment_url: null, attachment_name: null, ref_offer_id: null, ref_order_id: null, ref_inquiry_id: null, reply_to_id: null },
      ],
      limitCapture: (n) => { captured.limit = n },
    })
    realAdmin.db = db
    jest.doMock('@/lib/portalAuth', () => ({ requireAdminUser: clearAdmin() }))
    jest.doMock('@/lib/safety', () => ({ safetyGuard: () => ({ ok: true }) }))
    jest.doMock('@/lib/messengerAi', () => ({ readAiMode: () => 'auto', setConversationAiMode: jest.fn() }))
    jest.resetModules()
    const { GET } = await import('@/app/api/admin/messages/conversations/[id]/messages/route')

    const res = await GET(new Request('https://portal.local/api/admin/messages/conversations/c1/messages?limit=2'), {
      params: Promise.resolve({ id: 'c1' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    // Ascending display order, newest page kept, bounded probe = limit + 1.
    expect(body.messages.map((m: any) => m.id)).toEqual(['m2', 'm3'])
    expect(body.messages.map((m: any) => m.body)).toEqual(['two', 'three'])
    expect(body.total).toBe(2)
    expect(body.has_older).toBe(true)
    // Composite cursor JSON for the oldest message of the page.
    expect(body.older_cursor).toBe(JSON.stringify({ c: '2026-09-05T09:00:00Z', i: 'm2' }))
    expect(captured.limit).toBe(3)
  })

  it('passes a composite before= cursor to the DB when loading an older page', async () => {
    const capturedOr: string[] = []
    const db = makeDb({
      messages: [
        { id: 'm2', sender_id: 'a', type: 'text', body: 'older-two', metadata: {}, created_at: '2026-09-05T07:00:00Z', attachment_url: null, attachment_name: null, ref_offer_id: null, ref_order_id: null, ref_inquiry_id: null, reply_to_id: null },
        { id: 'm1', sender_id: 'a', type: 'text', body: 'older-one', metadata: {}, created_at: '2026-09-05T06:00:00Z', attachment_url: null, attachment_name: null, ref_offer_id: null, ref_order_id: null, ref_inquiry_id: null, reply_to_id: null },
      ],
      orCapture: (v) => capturedOr.push(v),
    })
    realAdmin.db = db
    jest.doMock('@/lib/portalAuth', () => ({ requireAdminUser: clearAdmin() }))
    jest.doMock('@/lib/safety', () => ({ safetyGuard: () => ({ ok: true }) }))
    jest.doMock('@/lib/messengerAi', () => ({ readAiMode: () => 'auto', setConversationAiMode: jest.fn() }))
    jest.resetModules()
    const { GET } = await import('@/app/api/admin/messages/conversations/[id]/messages/route')

    const cursor = JSON.stringify({ c: '2026-09-05T09:00:00Z', i: 'm3' })
    const res = await GET(new Request(`https://portal.local/api/admin/messages/conversations/c1/messages?limit=100&before=${encodeURIComponent(cursor)}`), {
      params: Promise.resolve({ id: 'c1' }),
    })
    expect(res.status).toBe(200)
    // PostgREST `or` filter = tie-safe lexicographic older-than.
    expect(capturedOr).toEqual(['created_at.lt.2026-09-05T09:00:00Z,and(created_at.eq.2026-09-05T09:00:00Z,id.lt.m3)'])
    const body = await res.json()
    expect(body.messages.map((m: any) => m.body)).toEqual(['older-one', 'older-two'])
    // 2 rows ≤ limit → no further older history.
    expect(body.has_older).toBe(false)
    expect(body.older_cursor).toBeNull()
  })

  it('rejects a malformed before cursor with 400 instead of skipping rows', async () => {
    jest.doMock('@/lib/portalAuth', () => ({ requireAdminUser: clearAdmin() }))
    jest.doMock('@/lib/safety', () => ({ safetyGuard: () => ({ ok: true }) }))
    jest.doMock('@/lib/messengerAi', () => ({ readAiMode: () => 'auto', setConversationAiMode: jest.fn() }))
    jest.resetModules()
    const { GET } = await import('@/app/api/admin/messages/conversations/[id]/messages/route')
    realAdmin.db = makeDb({ messages: [] })

    const res = await GET(new Request(`https://portal.local/api/admin/messages/conversations/c1/messages?before=${encodeURIComponent('{bad json')}`), {
      params: Promise.resolve({ id: 'c1' }),
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Invalid before cursor')
  })
})