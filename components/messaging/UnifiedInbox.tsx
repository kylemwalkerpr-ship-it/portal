// @ts-nocheck
'use client'
import React from 'react'
import OfferComposerInline from './OfferComposerInline'

/**
 * UnifiedInbox
 *
 * Single inbox component used by student + attorney + consultant
 * dashboards. Backed by the unified conversation_messages table via
 * /api/messages/conversations.
 *
 * Supports deep linking: pass `defaultThreadId` (typically pulled from
 * the page's ?thread=<id> param) and the matching conversation will be
 * auto-selected on mount.
 *
 * Props:
 *   defaultThreadId?  — conversation id to auto-select
 *   onThreadChange?   — fired when the active thread changes (writes
 *                       back to URL for shareable links)
 */

const NAVY='#1B2D4F', GOLD='#9A7B3B', GREEN='#1A6B45', RED='#8B1A1A', AMBER='#8B5E0A', CYAN='#0E7C8E', PURPLE='#3D2B6B'
const BG='#F7F5F0', SURFACE='#FFFFFF', SURFACE2='#FAFAF7', BORDER='#DDD8CE', BORDER2='#F2EFE9', TEXT='#1A1F2E', MUTED='#5C6070', DIM='#9097A8'
const SERIF=`'Cormorant Garamond', Georgia, serif`
const SANS=`-apple-system, BlinkMacSystemFont, 'Inter', sans-serif`
const MONO=`'SF Mono', Menlo, Consolas, monospace`

const PAGE_SIZE = 50

const initials = name => String(name || '').split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase() || '').join('')
const fmtN = n => Number(n ?? 0).toLocaleString('en-US')
const fmtRelative = s => {
  if (!s) return ''
  const d = new Date(s)
  const diff = Date.now() - d.getTime()
  if (diff < 60_000) return 'now'
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d`
  if (diff < 365 * 86_400_000) return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}
const fmtFullTime = s => s ? new Date(s).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''

const FILTER_TABS = [
  { id: 'all',      label: 'All' },
  { id: 'unread',   label: 'Unread' },
  { id: 'archived', label: 'Archived' },
]

const CTX_LABEL = {
  general: 'Direct',
  order:   'Order',
  inquiry: 'Inquiry',
  gig:     'Gig',
}

export default function UnifiedInbox({ defaultThreadId, onThreadChange, canSendOffer = false }) {
  const [tab, setTab] = React.useState('all')
  const [page, setPage] = React.useState(1)
  const [searchInput, setSearchInput] = React.useState('')
  const [debouncedQ, setDebouncedQ] = React.useState('')

  const [conversations, setConversations] = React.useState([])
  const [counts, setCounts] = React.useState({})
  const [hasMore, setHasMore] = React.useState(false)
  const [listLoading, setListLoading] = React.useState(true)
  const [listError, setListError] = React.useState('')

  const [activeId, setActiveId] = React.useState(defaultThreadId || null)
  const [activeMsgs, setActiveMsgs] = React.useState([])
  const [activeConv, setActiveConv] = React.useState(null)
  const [activeSidebar, setActiveSidebar] = React.useState({ orders: [], offers: [] })
  const [threadLoading, setThreadLoading] = React.useState(false)
  const [threadError, setThreadError] = React.useState('')
  const [draft, setDraft] = React.useState('')
  const [sending, setSending] = React.useState(false)
  const [showOfferComposer, setShowOfferComposer] = React.useState(false)
  const scrollRef = React.useRef(null)

  // Notify parent when thread changes (for URL deep links)
  React.useEffect(() => { onThreadChange?.(activeId) }, [activeId, onThreadChange])

  // Debounce search
  React.useEffect(() => {
    const t = setTimeout(() => { setDebouncedQ(searchInput); setPage(1) }, 250)
    return () => clearTimeout(t)
  }, [searchInput])

  const loadList = React.useCallback(async (silent = false) => {
    if (!silent) setListLoading(true)
    setListError('')
    try {
      const p = new URLSearchParams()
      p.set('filter', tab)
      if (debouncedQ) p.set('q', debouncedQ)
      p.set('page', String(page))
      p.set('page_size', String(PAGE_SIZE))
      const r = await fetch(`/api/messages/conversations?${p}`, { credentials: 'same-origin' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error || `Failed (${r.status})`)
      setConversations(d.conversations || [])
      setCounts(d.counts || {})
      setHasMore(!!d.has_more)
      // Auto-select first conversation on first load
      if (!activeId && (d.conversations || []).length > 0) {
        setActiveId(d.conversations[0].id)
      }
    } catch (e) {
      setListError(e.message || 'Failed to load conversations.')
    } finally {
      if (!silent) setListLoading(false)
    }
  }, [tab, debouncedQ, page, activeId])

  React.useEffect(() => { loadList(false) }, [loadList])

  // Soft poll every 12s for live updates
  React.useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') loadList(true)
    }, 12_000)
    return () => clearInterval(id)
  }, [loadList])

  // Load active thread when activeId changes
  const loadThread = React.useCallback(async (silent = false) => {
    if (!activeId) {
      setActiveMsgs([]); setActiveConv(null); setActiveSidebar({ orders: [], offers: [] })
      return
    }
    if (!silent) setThreadLoading(true)
    setThreadError('')
    try {
      const r = await fetch(`/api/messages/conversations/${activeId}`, { credentials: 'same-origin' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error || `Failed (${r.status})`)
      setActiveConv(d.conversation || null)
      setActiveMsgs(d.messages || [])
      setActiveSidebar(d.sidebar || { orders: [], offers: [] })
      // Mark as read on open
      fetch(`/api/messages/conversations/${activeId}`, {
        method: 'PATCH', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ read: true }),
      }).catch(() => null)
    } catch (e) {
      setThreadError(e.message)
    } finally {
      if (!silent) setThreadLoading(false)
    }
  }, [activeId])

  React.useEffect(() => { loadThread(false) }, [loadThread])

  // Soft poll the active thread every 8s
  React.useEffect(() => {
    if (!activeId) return
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') loadThread(true)
    }, 8_000)
    return () => clearInterval(id)
  }, [activeId, loadThread])

  // Auto-scroll
  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [activeMsgs.length])

  const send = async () => {
    const text = draft.trim()
    if (!text || sending || !activeId) return
    setSending(true); setThreadError('')
    try {
      const r = await fetch(`/api/messages/conversations/${activeId}`, {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error || 'Send failed')
      setDraft('')
      await loadThread(true)
      await loadList(true)
    } catch (e) { setThreadError(e.message) }
    finally { setSending(false) }
  }

  return (
    <div style={{ padding: '24px 28px 0', display: 'flex', flexDirection: 'column', gap: 14, fontFamily: SANS, background: BG, minHeight: '100vh' }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.16em', color: GOLD, textTransform: 'uppercase', fontFamily: MONO, marginBottom: 4 }}>Inbox</div>
        <h1 style={{ fontFamily: SERIF, fontSize: 32, fontWeight: 500, color: TEXT, margin: 0, letterSpacing: '-.012em' }}>Messages.</h1>
        <div style={{ fontSize: 13, color: MUTED, marginTop: 4 }}>
          Every conversation in one place — order channels, attorney chats, and inquiry threads. {counts.totalUnread > 0 && <strong style={{ color: CYAN }}>{counts.totalUnread} unread</strong>}.
        </div>
      </div>

      <div className="yousafe-mobile-stack" style={{ display: 'grid', gridTemplateColumns: '320px minmax(0, 1fr)', gap: 18, minHeight: 'calc(100vh - 200px)' }}>
        {/* Left: conversation list */}
        <aside style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: '12px 14px 8px', borderBottom: `1px solid ${BORDER2}` }}>
            <div style={{ position: 'relative', marginBottom: 8 }}>
              <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: DIM, fontSize: 13 }}>🔍</span>
              <input
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                placeholder="Search conversations…"
                style={{ width: '100%', padding: '7px 10px 7px 30px', fontSize: 12, border: `1px solid ${BORDER}`, borderRadius: 6, background: SURFACE2, color: TEXT, fontFamily: SANS, boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {FILTER_TABS.map(t => {
                const c = counts[t.id]
                const active = tab === t.id
                return (
                  <button key={t.id} onClick={() => { setTab(t.id); setPage(1) }} style={{
                    padding: '4px 9px', fontSize: 11, fontFamily: SANS, fontWeight: active ? 700 : 500,
                    border: `1px solid ${active ? CYAN : BORDER}`, background: active ? `${CYAN}15` : 'transparent',
                    color: active ? CYAN : MUTED, borderRadius: 999, cursor: 'pointer',
                  }}>{t.label}{typeof c === 'number' && c > 0 && <span style={{ fontFamily: MONO, fontSize: 10, opacity: .75, marginLeft: 4 }}>({fmtN(c)})</span>}</button>
                )
              })}
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {listLoading && conversations.length === 0 && <div style={{ padding: 18, color: MUTED, fontSize: 12 }}>Loading…</div>}
            {listError && <div style={{ padding: 16, color: RED, fontSize: 12 }}>{listError} · <button onClick={() => loadList(false)} style={{ background: 'none', border: 'none', color: RED, textDecoration: 'underline', cursor: 'pointer', fontFamily: SANS }}>retry</button></div>}
            {!listLoading && !listError && conversations.length === 0 && (
              <div style={{ padding: 24, color: MUTED, fontSize: 12, lineHeight: 1.6 }}>
                {tab === 'unread' ? 'No unread conversations.' : tab === 'archived' ? 'No archived conversations.' : 'No conversations yet. Open a seller profile or place an order to start one.'}
              </div>
            )}
            {conversations.map(c => {
              const isActive = activeId === c.id
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setActiveId(c.id)}
                  style={{
                    width: '100%', padding: '12px 14px', display: 'flex', gap: 10,
                    cursor: 'pointer',
                    background: isActive ? `${CYAN}10` : 'transparent',
                    border: 'none',
                    borderLeft: `3px solid ${isActive ? CYAN : 'transparent'}`,
                    borderBottom: `1px solid ${BORDER2}`,
                    textAlign: 'left', fontFamily: SANS, color: TEXT, position: 'relative',
                  }}
                >
                  {c.counterpart?.avatar_url
                    ? <img src={c.counterpart.avatar_url} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                    : <div style={{ width: 36, height: 36, borderRadius: '50%', background: `${NAVY}10`, color: NAVY, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12, fontFamily: SERIF, flexShrink: 0 }}>{initials(c.counterpart?.name || '?')}</div>}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: c.unread > 0 ? 800 : 700, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.counterpart?.name || 'Conversation'}</span>
                      {c.last_message_at && <span style={{ fontSize: 10, color: c.unread > 0 ? CYAN : DIM, fontFamily: MONO, flexShrink: 0 }}>{fmtRelative(c.last_message_at)}</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 }}>
                      {c.last_from_me && <span style={{ fontSize: 10, color: DIM, fontFamily: MONO }}>You:</span>}
                      <span style={{ fontSize: 12, color: c.unread > 0 ? TEXT : MUTED, fontWeight: c.unread > 0 ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                        {c.last_message || 'New conversation'}
                      </span>
                    </div>
                    <div style={{ marginTop: 4 }}>
                      <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, background: `${MUTED}15`, color: MUTED, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase' }}>
                        {CTX_LABEL[c.context_kind] || c.context_kind}
                      </span>
                    </div>
                  </div>
                  {c.unread > 0 && (
                    <span style={{ position: 'absolute', top: 14, right: 14, fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 999, background: CYAN, color: '#fff', fontFamily: MONO }}>{c.unread}</span>
                  )}
                </button>
              )
            })}
          </div>

          {(page > 1 || hasMore) && (
            <div style={{ padding: '10px 14px', borderTop: `1px solid ${BORDER2}`, background: SURFACE2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} style={pagerBtn(page <= 1)}>← Prev</button>
              <span style={{ fontFamily: MONO, fontSize: 11, color: MUTED }}>Page {page}</span>
              <button disabled={!hasMore} onClick={() => setPage(p => p + 1)} style={pagerBtn(!hasMore)}>Next →</button>
            </div>
          )}
        </aside>

        {/* Right: thread + composer */}
        <main style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {!activeId && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: MUTED, fontSize: 13, padding: 40 }}>
              Select a conversation to view the thread.
            </div>
          )}
          {activeId && (
            <>
              {/* Header */}
              <div style={{ padding: '14px 18px', borderBottom: `1px solid ${BORDER2}`, display: 'flex', alignItems: 'center', gap: 12 }}>
                {activeConv?.counterpart?.avatar_url
                  ? <img src={activeConv.counterpart.avatar_url} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} />
                  : <div style={{ width: 40, height: 40, borderRadius: '50%', background: `${NAVY}10`, color: NAVY, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, fontFamily: SERIF }}>{initials(activeConv?.counterpart?.full_name || '?')}</div>}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 600, color: TEXT, lineHeight: 1.1 }}>{activeConv?.counterpart?.full_name || 'Conversation'}</div>
                  <div style={{ fontSize: 11, color: DIM, fontFamily: MONO, marginTop: 2 }}>
                    {activeConv?.counterpart?.email || ''}
                    {activeConv?.context_kind && activeConv.context_kind !== 'general' && <> · {CTX_LABEL[activeConv.context_kind]}</>}
                  </div>
                </div>
                {activeSidebar.orders?.length > 0 && (
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '4px 8px', borderRadius: 4, background: `${CYAN}15`, color: CYAN, letterSpacing: '.04em', textTransform: 'uppercase' }}>
                    {activeSidebar.orders.length} shared order{activeSidebar.orders.length === 1 ? '' : 's'}
                  </span>
                )}
              </div>

              {threadError && <div style={{ padding: '8px 18px', background: `${RED}10`, color: RED, fontSize: 12 }}>{threadError}</div>}

              {/* Thread */}
              <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
                {threadLoading && activeMsgs.length === 0 && <div style={{ color: MUTED, fontSize: 12 }}>Loading thread…</div>}
                {!threadLoading && activeMsgs.length === 0 && (
                  <div style={{ background: SURFACE2, border: `1px dashed ${BORDER}`, borderRadius: 10, padding: 24, textAlign: 'center' }}>
                    <div style={{ fontSize: 26, marginBottom: 6 }}>💬</div>
                    <div style={{ fontFamily: SERIF, fontSize: 17, fontWeight: 600, color: TEXT, marginBottom: 4 }}>No messages yet</div>
                    <div style={{ fontSize: 12, color: MUTED }}>Type below to start the conversation.</div>
                  </div>
                )}
                {activeMsgs.map(m => {
                  const mine = m.sender_id === (activeConv?.counterpart?.id === activeConv?.counterpart?.id ? null : null) // placeholder
                  return <ThreadMessage key={m.id} m={m} counterpartId={activeConv?.counterpart?.id} />
                })}
              </div>

              {/* Composer */}
              {canSendOffer && showOfferComposer && (
                <div style={{ padding: '10px 14px 0', background: SURFACE2 }}>
                  <OfferComposerInline
                    conversationId={activeId}
                    onSent={() => { loadThread(true); loadList(true) }}
                    onClose={() => setShowOfferComposer(false)}
                  />
                </div>
              )}
              <div style={{ padding: '12px 14px', borderTop: `1px solid ${BORDER2}`, background: SURFACE2, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                {canSendOffer && (
                  <button
                    type="button"
                    onClick={() => setShowOfferComposer(v => !v)}
                    title="Send a custom offer"
                    style={{
                      padding: '8px 12px', borderRadius: 8, border: `1px solid ${BORDER}`,
                      background: showOfferComposer ? `${GOLD}20` : SURFACE,
                      color: showOfferComposer ? GOLD : MUTED, fontSize: 13, fontWeight: 700,
                      cursor: 'pointer', whiteSpace: 'nowrap',
                    }}
                  >💰 Offer</button>
                )}
                <textarea
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                  placeholder="Type a message…"
                  rows={2}
                  disabled={sending}
                  style={{ flex: 1, padding: '8px 12px', background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 13, fontFamily: SANS, outline: 'none', resize: 'none' }}
                />
                <button onClick={send} disabled={sending || !draft.trim()} style={{ padding: '8px 16px', background: CYAN, color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: sending || !draft.trim() ? 'not-allowed' : 'pointer', opacity: sending || !draft.trim() ? 0.6 : 1 }}>
                  {sending ? 'Sending…' : 'Send'}
                </button>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  )
}

function ThreadMessage({ m, counterpartId }) {
  const mine = m.sender_id !== counterpartId
  return (
    <div style={{ display: 'flex', gap: 8, flexDirection: mine ? 'row-reverse' : 'row' }}>
      <div style={{ maxWidth: '70%' }}>
        <div style={{
          padding: '10px 14px', borderRadius: 12, fontSize: 14, lineHeight: 1.5,
          background: mine ? `${CYAN}15` : SURFACE2, color: TEXT,
          border: `1px solid ${mine ? `${CYAN}33` : BORDER}`,
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>{m.body || (m.attachment_name ? `📎 ${m.attachment_name}` : '(message)')}</div>
        <div style={{ fontSize: 10, color: DIM, marginTop: 4, fontFamily: MONO, textAlign: mine ? 'right' : 'left' }}>
          {fmtFullTime(m.created_at)}
        </div>
      </div>
    </div>
  )
}

const pagerBtn = (disabled) => ({
  padding: '4px 10px', fontSize: 11, fontWeight: 700, fontFamily: SANS,
  background: 'transparent', color: disabled ? DIM : TEXT,
  border: `1px solid ${BORDER}`, borderRadius: 5,
  cursor: disabled ? 'not-allowed' : 'pointer',
})
