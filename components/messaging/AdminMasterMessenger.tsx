'use client'
/**
 * AdminMasterMessenger — admin oversight + direct chat into provider↔client threads.
 * Approach (a): admin messages land in the same conversation with sender_id = admin.
 * Both parties see admin messages in shared history; To: Client|Provider sets address intent.
 */
import React from 'react'
import './messenger-tokens.css'
import ChatScreen from './ChatScreen'
import MessageBubble from './MessageBubble'
import Avatar from './Avatar'
import AutoGrowInput from './AutoGrowInput'
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

type DirectTo = 'client' | 'provider'

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
  const [aiModeBusy, setAiModeBusy] = React.useState(false)

  const [myProfileId, setMyProfileId] = React.useState<string | null>(null)
  const [directTo, setDirectTo] = React.useState<DirectTo>('client')
  const [draft, setDraft] = React.useState('')
  const [sending, setSending] = React.useState(false)

  React.useEffect(() => {
    fetch('/api/profile', { credentials: 'same-origin' })
      .then((r) => r.json().catch(() => ({})))
      .then((d) => setMyProfileId(d?.profile?.id || null))
      .catch(() => setMyProfileId(null))
  }, [])

  React.useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(searchInput.trim()), 280)
    return () => window.clearTimeout(t)
  }, [searchInput])

  React.useEffect(() => { setPage(1) }, [debouncedQ, role, unreadOnly])

  // Prefer client when available; otherwise provider
  React.useEffect(() => {
    if (!activeConv) return
    if (activeConv.client?.id) setDirectTo('client')
    else if (activeConv.provider?.id) setDirectTo('provider')
  }, [activeConv?.id])

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
    setDraft('')
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

  const setAiMode = React.useCallback(async (mode: 'auto' | 'paused' | 'off') => {
    if (!activeId || aiModeBusy) return
    setAiModeBusy(true)
    setThreadError('')
    try {
      const r = await fetch(`/api/admin/messages/conversations/${activeId}/ai-mode`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ai_mode: mode }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error || `Failed (${r.status})`)
      const next = d.ai_mode || mode
      setActiveConv((prev: any) => prev ? { ...prev, ai_mode: next } : prev)
      setConversations((prev) => prev.map((c) => c.id === activeId ? { ...c, ai_mode: next } : c))
    } catch (e: any) {
      setThreadError(e?.message || 'Could not update AI mode')
    } finally {
      setAiModeBusy(false)
    }
  }, [activeId, aiModeBusy])

  const targetParty = React.useMemo(() => {
    if (!activeConv) return null
    if (directTo === 'client') {
      return activeConv.client || activeConv.participant_b || activeConv.participant_a || null
    }
    return activeConv.provider || activeConv.participant_a || activeConv.participant_b || null
  }, [activeConv, directTo])

  const canMessageClient = Boolean(activeConv?.client?.id)
  const canMessageProvider = Boolean(activeConv?.provider?.id)

  const send = React.useCallback(async () => {
    const text = draft.trim()
    if (!text || sending || !activeId) return
    if (directTo === 'client' && !canMessageClient) {
      setThreadError('No client participant in this thread.')
      return
    }
    if (directTo === 'provider' && !canMessageProvider) {
      setThreadError('No provider participant in this thread.')
      return
    }
    setSending(true)
    setThreadError('')
    try {
      const r = await fetch(`/api/admin/messages/conversations/${activeId}/messages`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text, to: directTo }),
      })
      const d = await r.json().catch(() => ({}))
      if (r.status === 401 || r.status === 403) throw new Error('Admin access required.')
      if (!r.ok) throw new Error(d?.error || `Send failed (${r.status})`)
      setDraft('')
      if (d.message) {
        setActiveMsgs((prev) => [...prev, d.message])
      }
      setActiveConv((prev: any) => prev ? { ...prev, ai_mode: d.ai_mode || 'paused' } : prev)
      setConversations((prev) => prev.map((c) => {
        if (c.id !== activeId) return c
        return {
          ...c,
          ai_mode: d.ai_mode || 'paused',
          last_message: text.slice(0, 160),
          last_message_at: d.message?.created_at || new Date().toISOString(),
        }
      }))
    } catch (e: any) {
      setThreadError(e?.message || 'Send failed')
    } finally {
      setSending(false)
    }
  }, [draft, sending, activeId, directTo, canMessageClient, canMessageProvider])

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
          Admin chat · {counts.all ?? 0} threads{typeof counts.unread === 'number' ? ` · ${counts.unread} with unread` : ''}
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

                    {c.ai_mode && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase',
                        color: c.ai_mode === 'auto' ? '#1A6B45' : c.ai_mode === 'paused' ? '#8B5E0A' : '#64748B',
                        background: c.ai_mode === 'auto' ? '#E8F7EF' : c.ai_mode === 'paused' ? '#FEF5E4' : '#F1F5F9',
                        padding: '2px 6px', borderRadius: 999,
                      }}>AI {c.ai_mode}</span>
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
          {' · direct admin chat'}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase',
          padding: '4px 8px', borderRadius: 999,
          background: (activeConv.ai_mode || 'auto') === 'auto' ? '#E8F7EF'
            : (activeConv.ai_mode === 'paused' ? '#FEF5E4' : '#F1F5F9'),
          color: (activeConv.ai_mode || 'auto') === 'auto' ? '#1A6B45'
            : (activeConv.ai_mode === 'paused' ? '#8B5E0A' : '#64748B'),
        }}>AI {activeConv.ai_mode || 'auto'}</span>
        {(activeConv.ai_mode || 'auto') === 'auto' ? (
          <button type="button" disabled={aiModeBusy} onClick={() => void setAiMode('paused')}
            style={{ fontSize: 12, fontWeight: 600, padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(15,23,42,0.12)', background: '#0F172A', color: '#fff', cursor: 'pointer' }}>
            Take over
          </button>
        ) : (
          <button type="button" disabled={aiModeBusy} onClick={() => void setAiMode('auto')}
            style={{ fontSize: 12, fontWeight: 600, padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(15,23,42,0.12)', background: '#fff', color: '#0F172A', cursor: 'pointer' }}>
            Resume AI
          </button>
        )}
      </div>

    </div>
  ) : (
    <div style={{ padding: '16px 18px', borderBottom: '1px solid rgba(15,23,42,0.08)', background: '#fff', color: '#64748B', fontSize: 13 }}>
      Select a conversation to read or message either party.
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
        const isAdminMsg = Boolean(m.is_admin_message) || m.sender?.role === 'admin' || (myProfileId && m.sender_id === myProfileId)
        const mine = isAdminMsg || (myProfileId ? m.sender_id === myProfileId : false)
        const isFirstInGroup = !prev || prev.sender_id !== m.sender_id || !sameDay(prev.created_at, m.created_at)
        const isLastInGroup = !next || next.sender_id !== m.sender_id || !sameDay(next.created_at, m.created_at)
        const directedTo = m.metadata?.admin_directed_to_name || m.metadata?.admin_directed_to || null
        const body =
          m.type === 'attachment' && m.attachment_url
            ? (
              <a href={m.attachment_url} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>
                {m.attachment_name || 'Attachment'}
              </a>
            )
            : (m.body || (m.type && m.type !== 'text' ? `[${m.type}]` : ''))

        const senderLabel = isAdminMsg
          ? `Admin${directedTo ? ` → ${directedTo}` : ''}`
          : `${m.sender?.name || 'User'}${m.sender?.role ? ` · ${m.sender.role}` : ''}`

        return (
          <React.Fragment key={m.id}>
            {showDate && (
              <div style={{ textAlign: 'center', margin: '14px 0 8px', fontSize: 11, fontWeight: 600, color: '#94A3B8' }}>
                {dateLabel(m.created_at)}
              </div>
            )}
            {isFirstInGroup && (
              <div style={{
                fontSize: 11, fontWeight: 700, margin: mine ? '8px 12px 2px auto' : '8px 12px 2px',
                textAlign: mine ? 'right' : 'left', maxWidth: '78%',
                color: isAdminMsg ? '#8B1A1A' : '#64748B',
              }}>
                {isAdminMsg && (
                  <span style={{
                    display: 'inline-block', marginRight: 6, fontSize: 10, letterSpacing: 0.3,
                    textTransform: 'uppercase', background: '#8B1A1A', color: '#fff',
                    padding: '1px 6px', borderRadius: 999,
                  }}>Admin</span>
                )}
                {senderLabel}
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
              avatarName={m.sender?.name || (isAdminMsg ? 'Admin' : 'User')}
              rawBody={typeof m.body === 'string' ? m.body : undefined}
              style={isAdminMsg ? { boxShadow: 'inset 0 0 0 1px rgba(139,26,26,0.35)' } : undefined}
            />
          </React.Fragment>
        )
      })}
    </>
  )

  const composer = activeId ? (
    <div style={{ borderTop: '1px solid rgba(15,23,42,0.08)', background: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px 0', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#64748B' }}>To:</span>
        <button
          type="button"
          disabled={!canMessageClient}
          onClick={() => setDirectTo('client')}
          style={{
            fontSize: 12, fontWeight: 650, padding: '6px 12px', borderRadius: 999, cursor: canMessageClient ? 'pointer' : 'default',
            border: directTo === 'client' ? '1px solid #1A6B45' : '1px solid rgba(15,23,42,0.12)',
            background: directTo === 'client' ? '#E8F7EF' : '#fff',
            color: canMessageClient ? '#1A6B45' : '#94A3B8',
            opacity: canMessageClient ? 1 : 0.5,
          }}
        >
          Client{activeConv?.client?.name ? ` · ${activeConv.client.name}` : ''}
        </button>
        <button
          type="button"
          disabled={!canMessageProvider}
          onClick={() => setDirectTo('provider')}
          style={{
            fontSize: 12, fontWeight: 650, padding: '6px 12px', borderRadius: 999, cursor: canMessageProvider ? 'pointer' : 'default',
            border: directTo === 'provider' ? '1px solid #3D2B6B' : '1px solid rgba(15,23,42,0.12)',
            background: directTo === 'provider' ? 'rgba(61,43,107,0.08)' : '#fff',
            color: canMessageProvider ? '#3D2B6B' : '#94A3B8',
            opacity: canMessageProvider ? 1 : 0.5,
          }}
        >
          Provider{activeConv?.provider?.name ? ` · ${activeConv.provider.name}` : ''}
        </button>
        <span style={{ fontSize: 12, color: '#64748B', marginLeft: 'auto' }}>
          Sending to <strong style={{ color: '#0F172A' }}>{targetParty?.name || (directTo === 'client' ? 'Client' : 'Provider')}</strong>
          {targetParty?.role ? ` (${targetParty.role})` : ''} — visible in shared thread
        </span>
      </div>
      <div className="comp" style={{ paddingTop: 6 }}>
        <AutoGrowInput
          value={draft}
          onChange={setDraft}
          onSubmit={() => { void send() }}
          disabled={sending || !activeId}
          placeholder={`Message ${targetParty?.name || directTo} as Admin…`}
        />
      </div>
    </div>
  ) : (
    <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(15,23,42,0.08)', background: '#fff', color: '#64748B', fontSize: 12, textAlign: 'center' }}>
      Select a conversation to message the client or provider.
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
            Master Chats: message either party directly. Admin sends appear in the shared thread as Admin and pause AI auto-replies.
          </div>
        }
      />
    </div>
  )
}
