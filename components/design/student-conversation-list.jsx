'use client'
import React from 'react'
import { Badge, Avatar } from './shared'

/**
 * Student → Messages → Conversation list (Fiverr-grade).
 *
 * Drops into the left pane of the existing Messages view. The right pane
 * (thread + composer + offers) continues to use parent state, so all the
 * sendMessage / sendAttorneyChatMessage / accept-offer handlers keep working.
 *
 * Source: /api/student/conversations — universe-aware, paginated, searchable.
 *
 * Props:
 *   selectedKey   — `${type}:${id}` of the active conversation
 *   onSelect(c)   — called when a row is clicked
 */

const NAVY='#1B2D4F', GREEN='#1A6B45', RED='#8B1A1A', AMBER='#8B5E0A', CYAN='#0E7C8E', PURPLE='#3D2B6B'
const SURFACE='#FFFFFF', SURFACE2='#FAFAF7', BORDER='#DDD8CE', BORDER2='#F2EFE9', TEXT='#1A1F2E', MUTED='#5C6070', DIM='#9097A8'
const SANS=`-apple-system, BlinkMacSystemFont, 'Inter', sans-serif`
const MONO=`'SF Mono', Menlo, Consolas, monospace`

const PAGE_SIZE = 50

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

const TABS = [
  { id: 'all',      label: 'All',         filter: 'all' },
  { id: 'unread',   label: 'Unread',      filter: 'unread' },
  { id: 'offers',   label: 'Offers',      filter: 'offers' },
  { id: 'archived', label: 'Archived',    filter: 'archived' },
]

const KIND_TABS = [
  { id: 'all',      label: 'Both' },
  { id: 'order',    label: 'Consultants' },
  { id: 'attorney', label: 'Attorneys' },
]

export default function StudentConversationList({ selectedKey, onSelect }) {
  const [tab, setTab] = React.useState('all')
  const [kind, setKind] = React.useState('all')
  const [page, setPage] = React.useState(1)
  const [searchInput, setSearchInput] = React.useState('')
  const [debouncedQ, setDebouncedQ] = React.useState('')

  const [conversations, setConversations] = React.useState([])
  const [counts, setCounts] = React.useState({})
  const [hasMore, setHasMore] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    const t = setTimeout(() => { setDebouncedQ(searchInput); setPage(1) }, 250)
    return () => clearTimeout(t)
  }, [searchInput])

  const load = React.useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError('')
    try {
      const p = new URLSearchParams()
      p.set('kind', kind)
      p.set('filter', tab)
      if (debouncedQ) p.set('q', debouncedQ)
      p.set('page', String(page))
      p.set('page_size', String(PAGE_SIZE))
      const r = await fetch(`/api/student/conversations?${p}`, { credentials: 'same-origin' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error || `Failed (${r.status})`)
      setConversations(d.conversations || [])
      setCounts(d.counts || {})
      setHasMore(!!d.has_more)
    } catch (e) {
      setError(e.message || 'Failed to load conversations.')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [tab, kind, debouncedQ, page])

  React.useEffect(() => { load(false) }, [load])

  // Soft poll every 10s while visible (no full spinner)
  React.useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') load(true)
    }, 10_000)
    return () => clearInterval(id)
  }, [load])

  return (
    <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Header */}
      <div style={{ padding: '12px 14px 8px', borderBottom: `1px solid ${BORDER2}` }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, letterSpacing: '.12em', textTransform: 'uppercase', fontFamily: MONO }}>
            Conversations
          </div>
          {counts.totalUnread > 0 && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: `${RED}15`, color: RED }}>
              {fmtN(counts.totalUnread)} unread
            </span>
          )}
        </div>

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: 8 }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: DIM, fontSize: 13 }}>🔍</span>
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Search conversations…"
            style={{ width: '100%', padding: '7px 10px 7px 30px', fontSize: 12, border: `1px solid ${BORDER}`, borderRadius: 6, background: SURFACE2, color: TEXT, fontFamily: SANS, boxSizing: 'border-box' }}
          />
        </div>

        {/* Kind tabs */}
        <div style={{ display: 'inline-flex', background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: 6, padding: 2, marginBottom: 8 }}>
          {KIND_TABS.map(t => (
            <button key={t.id} onClick={() => { setKind(t.id); setPage(1) }} style={{
              padding: '4px 10px', fontSize: 11, fontWeight: 700, fontFamily: SANS, border: 'none', borderRadius: 4,
              background: kind === t.id ? CYAN : 'transparent', color: kind === t.id ? '#fff' : MUTED, cursor: 'pointer',
            }}>{t.label} {counts[t.id] !== undefined && <span style={{ opacity: .7 }}>({fmtN(counts[t.id])})</span>}</button>
          ))}
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {TABS.map(t => {
            const c = counts[t.id]
            const active = tab === t.id
            return (
              <button key={t.id} onClick={() => { setTab(t.id); setPage(1) }} style={{
                padding: '4px 9px', fontSize: 11, fontFamily: SANS, fontWeight: active ? 700 : 500,
                border: `1px solid ${active ? CYAN : BORDER}`, background: active ? `${CYAN}15` : 'transparent',
                color: active ? CYAN : MUTED, borderRadius: 999, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}>
                {t.label}
                {typeof c === 'number' && c > 0 && <span style={{ fontFamily: MONO, fontSize: 10, opacity: .75 }}>({fmtN(c)})</span>}
              </button>
            )
          })}
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {loading && conversations.length === 0 && (
          <div style={{ padding: 18, color: MUTED, fontSize: 12 }}>Loading…</div>
        )}
        {error && (
          <div style={{ padding: 16, color: RED, fontSize: 12 }}>
            {error} · <button onClick={() => load(false)} style={{ background: 'none', border: 'none', color: RED, textDecoration: 'underline', cursor: 'pointer', fontFamily: SANS }}>retry</button>
          </div>
        )}
        {!loading && !error && conversations.length === 0 && (
          <div style={{ padding: 24, color: MUTED, fontSize: 12, lineHeight: 1.6 }}>
            {tab === 'unread'  ? 'No unread conversations.'
            : tab === 'offers' ? 'No conversations with pending offers.'
            : tab === 'archived' ? 'No archived conversations.'
            : 'No conversations yet. Open an attorney profile to start a chat, or place an order to message a consultant.'}
          </div>
        )}
        {conversations.map(c => {
          const key = `${c.type}:${c.id}`
          const active = selectedKey === key
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect?.(c)}
              style={{
                width: '100%', padding: '12px 14px', display: 'flex', gap: 10,
                cursor: 'pointer',
                background: active ? `${CYAN}10` : 'transparent',
                border: 'none',
                borderLeft: `3px solid ${active ? CYAN : 'transparent'}`,
                borderBottom: `1px solid ${BORDER2}`,
                textAlign: 'left', fontFamily: SANS, color: TEXT,
                position: 'relative',
              }}
            >
              <Avatar name={c.name} src={c.avatar || undefined} size={36} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6 }}>
                  <span style={{
                    fontSize: 13, fontWeight: c.unread > 0 ? 800 : 700, color: TEXT,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{c.name}</span>
                  {c.lastAt && (
                    <span style={{ fontSize: 10, color: c.unread > 0 ? CYAN : DIM, fontFamily: MONO, flexShrink: 0 }}>{fmtRelative(c.lastAt)}</span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 }}>
                  {c.lastFrom === 'me' && <span style={{ fontSize: 10, color: DIM, fontFamily: MONO, flexShrink: 0 }}>You:</span>}
                  <span style={{
                    fontSize: 12, color: c.unread > 0 ? TEXT : MUTED,
                    fontWeight: c.unread > 0 ? 600 : 400,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                  }}>
                    {c.lastMessage || c.sub || (c.type === 'order' ? 'New order' : 'Attorney chat')}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  {c.type === 'order'    && <Badge color="cyan"   style={{ fontSize: 9 }}>Order</Badge>}
                  {c.type === 'attorney' && <Badge color="purple" style={{ fontSize: 9 }}>Attorney</Badge>}
                  {c.meta?.serviceTitle && <span style={{ fontSize: 10, color: DIM, fontFamily: MONO, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.meta.serviceTitle}</span>}
                  {c.type === 'attorney' && c.presence === 'online' && (
                    <span style={{ fontSize: 10, color: GREEN }}>● Online</span>
                  )}
                  {c.pending > 0 && (
                    <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 999, background: `${GREEN}15`, color: GREEN, marginLeft: 'auto' }}>
                      ⚡ {c.pending} offer{c.pending === 1 ? '' : 's'}
                    </span>
                  )}
                </div>
              </div>
              {c.unread > 0 && (
                <span style={{
                  position: 'absolute', top: 14, right: 14,
                  fontSize: 10, fontWeight: 800, padding: '2px 7px',
                  borderRadius: 999, background: CYAN, color: '#fff',
                  fontFamily: MONO,
                }}>{c.unread}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Pagination */}
      {(page > 1 || hasMore) && (
        <div style={{ padding: '10px 14px', borderTop: `1px solid ${BORDER2}`, background: SURFACE2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} style={pagerBtn(page <= 1)}>← Prev</button>
          <span style={{ fontFamily: MONO, fontSize: 11, color: MUTED }}>Page {page}</span>
          <button disabled={!hasMore} onClick={() => setPage(p => p + 1)} style={pagerBtn(!hasMore)}>Next →</button>
        </div>
      )}
    </div>
  )
}

const pagerBtn = (disabled) => ({
  padding: '4px 10px', fontSize: 11, fontWeight: 700, fontFamily: SANS,
  background: 'transparent', color: disabled ? DIM : TEXT,
  border: `1px solid ${BORDER}`, borderRadius: 5,
  cursor: disabled ? 'not-allowed' : 'pointer',
})
