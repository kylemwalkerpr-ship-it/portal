'use client'
/**
 * AdminMasterMessenger — admin oversight of ALL provider↔client chats.
 * Reuses ChatScreen / MessageBubble / Avatar / messenger-tokens patterns.
 * Read-only (Part A): no send composer.
 */
import React from 'react'
import './messenger-tokens.css'
import ChatScreen from './ChatScreen'
import MessageBubble from './MessageBubble'
import Avatar from './Avatar'
import { fmtRelative, fmtFullTime, sameDay, dateLabel } from '@/lib/messaging/format'

const CTX_LABEL: Record<string, string> = {
  general: 'Direct',
  order: 'Order',
  inquiry: 'Inquiry',
  gig: 'Gig',
}

const ROLE_FILTERS = [
  { id: '', label: 'All roles' },
  { id: 'attorney', label: 'Attorney' },
  { id: 'consultant', label: 'Consultant' },
  { id: 'client', label: 'Client' },
]

function roleBadgeColor(role?: string | null) {
  switch (role) {
    case 'attorney': return '#3D2B6B'
    case 'consultant': return '#0E7C8E'
    case 'client':
    case 'student': return '#1A6B45'
    case 'admin': return '#8B1A1A'
    default: return '#5C6070'
  }
}

export default function AdminMasterMessenger() {
  const [searchInput, setSearchInput] = React.useState('')
  const [debouncedQ, setDebouncedQ] = React.useState('')
  const [role, setRole] = React.useState('')
  const [unreadOnly, setUnreadOnly] = React.useState(false)
  const [page, setPage] = React.useState(1)

  const [conversations, setConversations] = React.useState<any[]>([])
  const [counts, setCounts] = React.useState<{ all?: number; unread?: number }>({})
  const [hasMore, setHasMore] = React.useState(false)
  const [listLoading, setListLoading] = React.useState(true)
  const [listError, setListError] = React.useState('')

  const [activeId, setActiveId] = React.useState<string | null>(null)
  const [activeConv, setActiveConv] = React.useState<any>(null)
  const [activeMsgs, setActiveMsgs] = React.useState<any[]>([])
  const [threadLoading, setThreadLoading] = React.useState(false)
  const [threadError, setThreadError] = React.useState('')
  const [mobileShowChat, setMobileShowChat] = React.useState(false)

  React.useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(searchInput.trim()), 280)
    return () => window.clearTimeout(t)
  }, [searchInput])

  React.useEffect(() => { setPage(1) }, [debouncedQ, role, unreadOnly])

  const loadList = React.useCallback(async () => {
    setListLoading(true)
    setListError('')
    try {
      const params = new URLSearchParams()
      if (debouncedQ) params.set('q', debouncedQ)
      if (role) params.set('role', role)
      if (unreadOnly) params.set('unread', '1')
      params.set('page', String(page))
      params.set('page_size', '50')
      const res = await fetch(`/api/admin/messages/conversations?${params}`, { credentials: 'same-origin' })
      if (res.status === 401 || res.status === 403) {
        setListError('Admin access required.')
        setConversations([])
        return
      }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || `Failed (${res.status})`)
      }
      const data = await res.json()
      setConversations(data.conversations || [])
      setCounts(data.counts || {})
      setHasMore(!!data.has_more)
    } catch (e: any) {
      setListError(e?.message || 'Failed to load conversations')
      setConversations([])
    } finally {
      setListLoading(false)
    }
  }, [debouncedQ, role, unreadOnly, page])

  React.useEffect(() => { void loadList() }, [loadList])

  const openThread = React.useCallback(async (id: string) => {
    setActiveId(id)
    setMobileShowChat(true)
    setThreadLoading(true)
    setThreadError('')
    setActiveMsgs([])
    setActiveConv(null)
    try {
      const res = await fetch(`/api/admin/messages/conversations/${id}/messages`, { credentials: 'same-origin' })
      if (res.status === 401 || res.status === 403) {
        setThreadError('Admin access required.')
        return
      }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || `Failed (${res.status})`)
      }
      const data = await res.json()
      setActiveConv(data.conversation)
      setActiveMsgs(data.messages || [])
    } catch (e: any) {
      setThreadError(e?.message || 'Failed to load thread')
    } finally {
      setThreadLoading(false)
    }
  }, [])

  const titleFor = (c: any) => {
    const provider = c.provider?.name || c.participant_a?.name || 'Provider'
    const client = c.client?.name || c.participant_b?.name || 'Client'
    return `${provider} <> ${client}`
  }

  const sidebar = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--msg-bg, #F7F4EE)' }}>
      <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid rgba(15,23,42,0.08)' }}>
        <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 22, fontWeight: 600, color: '#0F172A', marginBottom: 4 }}>
          Master Chats
        </div>
        <div style={{ fontSize: 12, color: '#64748B', marginBottom: 10 }}>
          Admin oversight · {counts.all ?? 0} threads{typeof counts.unread === 'number' ? ` · ${counts.unread} with unread` : ''}
        </div>
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search name, email, message..."
          style={{
            width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 10,
            border: '1px solid rgba(15,23,42,0.12)', background: '#fff', fontSize: 13, outline: 'none',
          }}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            style={{ flex: 1, minWidth: 120, padding: '7px 10px', borderRadius: 8, border: '1px solid rgba(15,23,42,0.12)', fontSize: 12, background: '#fff' }}
          >
            {ROLE_FILTERS.map((f) => (
              <option key={f.id || 'all'} value={f.id}>{f.label}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setUnreadOnly((v) => !v)}
            style={{
              padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              border: unreadOnly ? '1px solid #0F172A' : '1px solid rgba(15,23,42,0.12)',
              background: unreadOnly ? '#0F172A' : '#fff',
              color: unreadOnly ? '#fff' : '#0F172A',
            }}
          >
            Unread
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {listLoading && (
          <div style={{ padding: 24, textAlign: 'center', color: '#64748B', fontSize: 13 }}>Loading conversations...</div>
        )}
        {listError && (
          <div style={{ margin: 12, padding: 12, borderRadius: 10, background: 'rgba(139,26,26,0.08)', color: '#8B1A1A', fontSize: 13 }}>{listError}</div>
        )}
        {!listLoading && !listError && conversations.length === 0 && (
          <div style={{ padding: 28, textAlign: 'center', color: '#64748B', fontSize: 13 }}>No conversations match.</div>
        )}
        {conversations.map((c) => {
          const active = c.id === activeId
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => void openThread(c.id)}
              style={{
                display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
                padding: '12px 14px', border: 'none', borderBottom: '1px solid rgba(15,23,42,0.06)',
                background: active ? 'rgba(15,23,42,0.06)' : 'transparent',
              }}
            >
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <Avatar name={c.provider?.name || c.participant_a?.name} src={c.provider?.avatar_url || c.participant_a?.avatar_url} userId={c.provider?.id || c.participant_a?.id} size={40} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 2 }}>
                    <div style={{ fontSize: 13, fontWeight: 650, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {titleFor(c)}
                    </div>
                    <div style={{ fontSize: 11, color: '#94A3B8', flexShrink: 0 }}>{fmtRelative(c.last_message_at)}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                    {(c.roles || []).map((r: string) => (
                      <span key={r} style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase', color: '#fff', background: roleBadgeColor(r), padding: '2px 6px', borderRadius: 999 }}>{r}</span>
                    ))}
                    {c.context_kind && (
                      <span style={{ fontSize: 10, fontWeight: 600, color: '#64748B', background: 'rgba(15,23,42,0.06)', padding: '2px 6px', borderRadius: 999 }}>
                        {CTX_LABEL[c.context_kind] || c.context_kind}
                      </span>
                    )}
                    {c.has_unread && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#8B5E0A', background: '#FEF5E4', padding: '2px 6px', borderRadius: 999 }}>unread</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.last_message || 'No messages yet'}
                  </div>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {(page > 1 || hasMore) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: 10, borderTop: '1px solid rgba(15,23,42,0.08)' }}>
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} style={{ fontSize: 12, padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(15,23,42,0.12)', background: '#fff', cursor: page <= 1 ? 'default' : 'pointer', opacity: page <= 1 ? 0.5 : 1 }}>Prev</button>
          <span style={{ fontSize: 12, color: '#64748B', alignSelf: 'center' }}>Page {page}</span>
          <button type="button" disabled={!hasMore} onClick={() => setPage((p) => p + 1)} style={{ fontSize: 12, padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(15,23,42,0.12)', background: '#fff', cursor: !hasMore ? 'default' : 'pointer', opacity: !hasMore ? 0.5 : 1 }}>Next</button>
        </div>
      )}
    </div>
  )

  const header = activeConv ? (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid rgba(15,23,42,0.08)', background: '#fff' }}>
      <button
        type="button"
        onClick={() => { setMobileShowChat(false); setActiveId(null) }}
        style={{ display: 'none', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 18 }}
        className="admin-master-back"
      >
        Back
      </button>
      <Avatar name={activeConv.participant_a?.name} src={activeConv.participant_a?.avatar_url} userId={activeConv.participant_a?.id} size={36} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>
          {(activeConv.participant_a?.name || 'A') + ' <> ' + (activeConv.participant_b?.name || 'B')}
        </div>
        <div style={{ fontSize: 12, color: '#64748B' }}>
          {[activeConv.participant_a?.role, activeConv.participant_b?.role].filter(Boolean).join(' · ')}
          {activeConv.context_kind ? ` · ${CTX_LABEL[activeConv.context_kind] || activeConv.context_kind}` : ''}
          {' · read-only oversight'}
        </div>
      </div>
    </div>
  ) : (
    <div style={{ padding: '16px 18px', borderBottom: '1px solid rgba(15,23,42,0.08)', background: '#fff', color: '#64748B', fontSize: 13 }}>
      Select a conversation to inspect the full thread.
    </div>
  )

  const messageNodes = (
    <>
      {threadLoading && <div style={{ padding: 24, textAlign: 'center', color: '#64748B', fontSize: 13 }}>Loading messages...</div>}
      {threadError && <div style={{ margin: 16, padding: 12, borderRadius: 10, background: 'rgba(139,26,26,0.08)', color: '#8B1A1A', fontSize: 13 }}>{threadError}</div>}
      {!threadLoading && !threadError && activeId && activeMsgs.length === 0 && (
        <div style={{ padding: 24, textAlign: 'center', color: '#64748B', fontSize: 13 }}>No messages in this thread.</div>
      )}
      {activeMsgs.map((m, idx) => {
        const prev = activeMsgs[idx - 1]
        const next = activeMsgs[idx + 1]
        const showDate = !prev || !sameDay(prev.created_at, m.created_at)
        const mine = m.sender_id === activeConv?.participant_a?.id
        const isFirstInGroup = !prev || prev.sender_id !== m.sender_id || !sameDay(prev.created_at, m.created_at)
        const isLastInGroup = !next || next.sender_id !== m.sender_id || !sameDay(next.created_at, m.created_at)
        const body =
          m.type === 'attachment' && m.attachment_url
            ? (
              <a href={m.attachment_url} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>
                {m.attachment_name || 'Attachment'}
              </a>
            )
            : (m.body || (m.type && m.type !== 'text' ? `[${m.type}]` : ''))

        return (
          <React.Fragment key={m.id}>
            {showDate && (
              <div style={{ textAlign: 'center', margin: '14px 0 8px', fontSize: 11, fontWeight: 600, color: '#94A3B8' }}>
                {dateLabel(m.created_at)}
              </div>
            )}
            {isFirstInGroup && (
              <div style={{ fontSize: 11, fontWeight: 600, color: '#64748B', margin: mine ? '8px 12px 2px auto' : '8px 12px 2px', textAlign: mine ? 'right' : 'left', maxWidth: '78%' }}>
                {m.sender?.name || 'User'}
                {m.sender?.role ? ` · ${m.sender.role}` : ''}
              </div>
            )}
            <MessageBubble
              id={m.id}
              body={body}
              mine={mine}
              isFirstInGroup={isFirstInGroup}
              isLastInGroup={isLastInGroup}
              timestamp={fmtFullTime(m.created_at)}
              avatarUrl={m.sender?.avatar_url}
              avatarName={m.sender?.name}
              rawBody={typeof m.body === 'string' ? m.body : undefined}
            />
          </React.Fragment>
        )
      })}
    </>
  )

  const composer = (
    <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(15,23,42,0.08)', background: '#fff', color: '#64748B', fontSize: 12, textAlign: 'center' }}>
      Read-only admin oversight — sending is disabled in Master Chats (Part A).
    </div>
  )

  return (
    <div style={{ height: 'calc(100vh - 64px)', minHeight: 480, padding: 0 }}>
      <style>{`
        @media (max-width: 680px) {
          .admin-master-back { display: inline-block !important; }
        }
      `}</style>
      <ChatScreen
        mode="split"
        sidebar={sidebar}
        header={header}
        messages={messageNodes}
        composer={composer}
        mobileShowChat={mobileShowChat && !!activeId}
        banner={
          <div style={{ padding: '8px 14px', background: '#FEF5E4', color: '#8B5E0A', fontSize: 12, borderBottom: '1px solid rgba(139,94,10,0.15)' }}>
            Oversight mode: you can read every attorney/consultant to client thread. Do not share contents outside the support process.
          </div>
        }
      />
    </div>
  )
}
