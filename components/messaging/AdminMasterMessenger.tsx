'use client'

import React from 'react'
import './messenger-tokens.css'
import './admin-master-chats.css'
import ChatScreen from './ChatScreen'
import MessageBubble from './MessageBubble'
import Avatar from './Avatar'
import AdminMasterComposer from './AdminMasterComposer'
import { fmtRelative, sameDay, dateLabel } from '@/lib/messaging/format'
import { subscribeToTable } from '@/lib/supabaseRealtime'
import {
  applyFullMeta,
  applyOlderMeta,
  applyPollMeta,
  initialThreadPageMeta,
  mergeById,
  sentDraftClears,
  type ThreadPageMeta,
  type ThreadPagePayload,
} from '@/lib/adminMessages/threadPage'
import { createThreadGuard, type ThreadGuard } from '@/lib/adminMessages/threadGuard'

const CTX_LABEL: Record<string, string> = {
  general: 'Direct',
  order: 'Order',
  inquiry: 'Inquiry',
  gig: 'Gig',
}

const ROLE_FILTERS = [
  { id: '', label: 'All' },
  { id: 'attorney', label: 'Attorneys' },
  { id: 'consultant', label: 'Consultants' },
  { id: 'client', label: 'Clients' },
]

const THREAD_LIMIT = 100

type DirectTo = 'client' | 'provider'
type ReplyToInfo = { id: string; senderName: string; snippet: string }

type ProviderGroup = {
  id: string
  provider: any | null
  conversations: any[]
}

function normalizedRole(role?: string | null) {
  return role === 'student' ? 'client' : String(role || '').toLowerCase()
}

function providerLabel(provider: any | null) {
  if (!provider) return 'Unassigned / direct client chats'
  const role = normalizedRole(provider.role)
  if (role === 'attorney') return 'Attorney'
  if (role === 'consultant') return 'Consultant'
  return role || 'Provider'
}

function messageKind(message: any, myProfileId: string | null): 'admin' | 'ai' | 'provider' | 'client' {
  const isAdmin = Boolean(message.is_admin_message)
    || message.sender?.role === 'admin'
    || Boolean(myProfileId && message.sender_id === myProfileId)
  if (isAdmin) return 'admin'
  if (message.metadata?.ai_generated) return 'ai'
  const role = normalizedRole(message.sender?.role)
  return role === 'attorney' || role === 'consultant' ? 'provider' : 'client'
}

function groupByProvider(conversations: any[]): ProviderGroup[] {
  const groups = new Map<string, ProviderGroup>()
  for (const conversation of conversations) {
    const provider = conversation.provider || null
    const key = provider?.id || 'unassigned'
    if (!groups.has(key)) groups.set(key, { id: key, provider, conversations: [] })
    groups.get(key)!.conversations.push(conversation)
  }
  return Array.from(groups.values())
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
  const [aiModeBusy, setAiModeBusy] = React.useState(false)

  const [myProfileId, setMyProfileId] = React.useState<string | null>(null)
  const [directTo, setDirectTo] = React.useState<DirectTo>('client')
  const [draft, setDraft] = React.useState('')
  const [replyTo, setReplyTo] = React.useState<ReplyToInfo | null>(null)
  const [sending, setSending] = React.useState(false)
  const [threadMeta, setThreadMeta] = React.useState<ThreadPageMeta>(initialThreadPageMeta)
  const [olderLoading, setOlderLoading] = React.useState(false)

  const listGuardRef = React.useRef<ThreadGuard | null>(null)
  const threadGuardRef = React.useRef<ThreadGuard | null>(null)
  if (!listGuardRef.current) listGuardRef.current = createThreadGuard()
  if (!threadGuardRef.current) threadGuardRef.current = createThreadGuard()
  const activeIdRef = React.useRef<string | null>(null)
  const draftByConvRef = React.useRef<Record<string, string>>({})
  const realtimeTimerRef = React.useRef<number | null>(null)

  React.useEffect(() => {
    fetch('/api/profile', { credentials: 'same-origin' })
      .then((response) => response.json().catch(() => ({})))
      .then((data) => setMyProfileId(data?.profile?.id || null))
      .catch(() => setMyProfileId(null))
  }, [])

  React.useEffect(() => {
    activeIdRef.current = activeId
  }, [activeId])

  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQ(searchInput.trim()), 280)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  React.useEffect(() => { setPage(1) }, [debouncedQ, role, unreadOnly])

  React.useEffect(() => {
    if (!activeConv) return
    if (activeConv.client?.id) setDirectTo('client')
    else if (activeConv.provider?.id) setDirectTo('provider')
  }, [activeConv?.id])

  const loadList = React.useCallback(async (silent = false) => {
    const guard = listGuardRef.current!
    const token = guard.begin(silent ? 'poll' : 'full')
    if (!token) return
    if (!silent) setListLoading(true)
    setListError('')
    try {
      const params = new URLSearchParams({ page: String(page), page_size: '50' })
      if (debouncedQ) params.set('q', debouncedQ)
      if (role) params.set('role', role)
      if (unreadOnly) params.set('unread', '1')
      const response = await fetch(`/api/admin/messages/conversations?${params.toString()}`, { credentials: 'same-origin' })
      const data = await response.json().catch(() => ({}))
      if (!guard.isCurrent(token)) return
      if (response.status === 401 || response.status === 403) {
        setListError('Admin access required.')
        setConversations([])
        return
      }
      if (!response.ok) throw new Error(data?.error || `Failed (${response.status})`)
      setConversations(data.conversations || [])
      setCounts(data.counts || {})
      setHasMore(Boolean(data.has_more))
    } catch (error: any) {
      if (guard.isCurrent(token)) {
        setListError(error?.message || 'Failed to load conversations')
        setConversations([])
      }
    } finally {
      const current = guard.isCurrent(token)
      guard.end(token)
      if (!silent && current) setListLoading(false)
    }
  }, [debouncedQ, role, unreadOnly, page])

  React.useEffect(() => { void loadList() }, [loadList])

  const loadThreadPage = React.useCallback(async (
    id: string,
    opts: { full?: boolean; before?: string | null } = {},
  ) => {
    if (!id) return
    const guard = threadGuardRef.current!
    const kind = opts.full ? 'full' : opts.before ? 'older' : 'poll'
    const token = guard.begin(kind)
    if (!token) return
    const full = kind === 'full'
    if (full) {
      setThreadLoading(true)
      setThreadError('')
    }
    try {
      const params = new URLSearchParams({ limit: String(THREAD_LIMIT) })
      if (opts.before) params.set('before', opts.before)
      const response = await fetch(`/api/admin/messages/conversations/${id}/messages?${params.toString()}`, { credentials: 'same-origin' })
      const data = await response.json().catch(() => ({}))
      if (!guard.isCurrent(token) || activeIdRef.current !== id) return
      if (response.status === 401 || response.status === 403) {
        setThreadError('Admin access required.')
        return
      }
      if (!response.ok) throw new Error(data?.error || `Failed (${response.status})`)
      const fresh = Array.isArray(data.messages) ? data.messages : []
      const threadPage: ThreadPagePayload = {
        messages: fresh,
        has_older: Boolean(data.has_older),
        older_cursor: data.older_cursor || null,
      }
      if (full) {
        setActiveConv(data.conversation || null)
        setActiveMsgs(fresh)
        setThreadMeta(applyFullMeta(threadPage))
      } else if (kind === 'older') {
        setActiveMsgs((previous) => mergeById(previous, fresh))
        setThreadMeta((previous) => applyOlderMeta(previous, threadPage))
      } else {
        setActiveMsgs((previous) => mergeById(previous, fresh))
        setThreadMeta((previous) => applyPollMeta(previous, threadPage))
        if (data.conversation) setActiveConv(data.conversation)
      }
    } catch (error: any) {
      if (guard.isCurrent(token) && activeIdRef.current === id) {
        setThreadError(error?.message || 'Failed to load thread')
      }
    } finally {
      const mayClear = full && guard.isCurrent(token) && activeIdRef.current === id
      guard.end(token)
      if (mayClear) setThreadLoading(false)
    }
  }, [])

  const openThread = React.useCallback((id: string) => {
    threadGuardRef.current!.switchSession()
    activeIdRef.current = id
    setActiveId(id)
    setMobileShowChat(true)
    setActiveConv(null)
    setActiveMsgs([])
    setReplyTo(null)
    setThreadMeta(initialThreadPageMeta)
    setThreadError('')
    setDraft(draftByConvRef.current[id] || '')
    void loadThreadPage(id, { full: true })
  }, [loadThreadPage])

  const closeThread = React.useCallback(() => {
    threadGuardRef.current!.switchSession()
    if (activeIdRef.current) draftByConvRef.current[activeIdRef.current] = draft
    activeIdRef.current = null
    setActiveId(null)
    setMobileShowChat(false)
    setActiveConv(null)
    setActiveMsgs([])
    setReplyTo(null)
    setThreadMeta(initialThreadPageMeta)
    setThreadError('')
  }, [draft])

  const loadOlder = React.useCallback(async () => {
    const id = activeIdRef.current
    if (!id || olderLoading || !threadMeta.older_cursor) return
    setOlderLoading(true)
    setThreadError('')
    try {
      await loadThreadPage(id, { before: threadMeta.older_cursor })
    } finally {
      setOlderLoading(false)
    }
  }, [olderLoading, threadMeta.older_cursor, loadThreadPage])

  const refreshVisible = React.useCallback(() => {
    if (document.visibilityState !== 'visible') return
    const id = activeIdRef.current
    if (id) void loadThreadPage(id)
    void loadList(true)
  }, [loadThreadPage, loadList])

  React.useEffect(() => {
    const interval = window.setInterval(refreshVisible, 8000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshVisible()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [refreshVisible])

  React.useEffect(() => {
    const schedule = (conversationId?: string | null) => {
      if (realtimeTimerRef.current) window.clearTimeout(realtimeTimerRef.current)
      realtimeTimerRef.current = window.setTimeout(() => {
        if (conversationId && activeIdRef.current === conversationId) void loadThreadPage(conversationId)
        void loadList(true)
      }, 100)
    }
    const offMessages = subscribeToTable('conversation_messages', 'public', (payload) => {
      const row = payload.new || payload.old
      schedule(row?.conversation_id || null)
    })
    const offConversations = subscribeToTable('conversations', 'public', (payload) => {
      const row = payload.new || payload.old
      schedule(row?.id || null)
    })
    const offReactions = subscribeToTable('conversation_message_reactions', 'public', () => {
      const id = activeIdRef.current
      if (id) schedule(id)
    })
    return () => {
      if (realtimeTimerRef.current) window.clearTimeout(realtimeTimerRef.current)
      offMessages()
      offConversations()
      offReactions()
    }
  }, [loadThreadPage, loadList])

  const setAiMode = React.useCallback(async (mode: 'auto' | 'paused' | 'off') => {
    const id = activeIdRef.current
    if (!id || aiModeBusy) return
    setAiModeBusy(true)
    setThreadError('')
    try {
      const response = await fetch(`/api/admin/messages/conversations/${id}/ai-mode`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ai_mode: mode }),
      })
      const data = await response.json().catch(() => ({}))
      if (activeIdRef.current !== id) return
      if (!response.ok) throw new Error(data?.error || `Failed (${response.status})`)
      const next = data.ai_mode || mode
      setActiveConv((previous: any) => previous ? { ...previous, ai_mode: next } : previous)
      setConversations((previous) => previous.map((conversation) => conversation.id === id ? { ...conversation, ai_mode: next } : conversation))
    } catch (error: any) {
      if (activeIdRef.current === id) setThreadError(error?.message || 'Could not update AI mode')
    } finally {
      setAiModeBusy(false)
    }
  }, [aiModeBusy])

  const targetParty = React.useMemo(() => {
    if (!activeConv) return null
    return directTo === 'client'
      ? activeConv.client || activeConv.participant_b || activeConv.participant_a || null
      : activeConv.provider || activeConv.participant_a || activeConv.participant_b || null
  }, [activeConv, directTo])

  const canMessageClient = Boolean(activeConv?.client?.id)
  const canMessageProvider = Boolean(activeConv?.provider?.id)

  const handleDraftChange = React.useCallback((value: string) => {
    setDraft(value)
    const id = activeIdRef.current
    if (id) draftByConvRef.current[id] = value
  }, [])

  const handleReplyStart = React.useCallback((msgId: string, snippet: string, senderName: string) => {
    const message = activeMsgs.find((item) => item.id === msgId)
    if (!message) return
    const kind = messageKind(message, myProfileId)
    if (kind === 'client' && canMessageClient) setDirectTo('client')
    if ((kind === 'provider' || kind === 'ai') && canMessageProvider) setDirectTo('provider')
    setReplyTo({ id: msgId, senderName, snippet })
  }, [activeMsgs, myProfileId, canMessageClient, canMessageProvider])

  const handleReplyClick = React.useCallback((msgId: string) => {
    const target = document.querySelector<HTMLElement>(`[data-admin-message-id="${msgId}"]`)
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    if (target) {
      target.animate(
        [{ backgroundColor: 'rgba(67,56,202,.14)' }, { backgroundColor: 'transparent' }],
        { duration: 1100, easing: 'ease-out' },
      )
    }
  }, [])

  const handleReact = React.useCallback(async (msgId: string, emoji: string) => {
    const id = activeIdRef.current
    if (!id) return
    try {
      const response = await fetch(`/api/admin/messages/conversations/${id}/messages/${msgId}/react`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error || 'Reaction failed')
      if (activeIdRef.current !== id) return
      setActiveMsgs((previous) => previous.map((message) => message.id === msgId ? { ...message, reactions: data.reactions || [] } : message))
    } catch (error: any) {
      setThreadError(error?.message || 'Could not update reaction')
    }
  }, [])

  const handleShowInfo = React.useCallback((msgId: string) => {
    const message = activeMsgs.find((item) => item.id === msgId)
    if (!message) return
    const kind = messageKind(message, myProfileId)
    const sent = message.created_at ? new Date(message.created_at).toLocaleString() : 'Unknown'
    const directed = message.metadata?.admin_directed_to_name || message.metadata?.admin_directed_to || 'Shared thread'
    window.alert(`Message info\n\nSender: ${message.sender?.name || kind}\nRole: ${kind}\nSent: ${sent}\nDirected to: ${directed}`)
  }, [activeMsgs, myProfileId])

  const send = React.useCallback(async () => {
    const guard = threadGuardRef.current!
    const sendSession = guard.session()
    const id = activeIdRef.current
    const text = draft.trim()
    if (!text || sending || !id) return
    if (directTo === 'client' && !canMessageClient) return setThreadError('No client participant in this thread.')
    if (directTo === 'provider' && !canMessageProvider) return setThreadError('No provider participant in this thread.')
    setSending(true)
    setThreadError('')
    try {
      const response = await fetch(`/api/admin/messages/conversations/${id}/messages`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text, to: directTo, reply_to_id: replyTo?.id || null }),
      })
      const data = await response.json().catch(() => ({}))
      if (response.status === 401 || response.status === 403) throw new Error('Admin access required.')
      if (!response.ok) throw new Error(data?.error || `Send failed (${response.status})`)

      if (sentDraftClears(draftByConvRef.current[id], text)) {
        draftByConvRef.current[id] = ''
        if (activeIdRef.current === id) setDraft('')
      }
      setReplyTo(null)
      if (guard.isSessionCurrent({ session: sendSession, opSeq: 0 }) && activeIdRef.current === id) {
        if (data.message) setActiveMsgs((previous) => mergeById(previous, [data.message]))
        setActiveConv((previous: any) => previous ? { ...previous, ai_mode: data.ai_mode || 'paused' } : previous)
      }
      void loadList(true)
    } catch (error: any) {
      if (activeIdRef.current === id) setThreadError(error?.message || 'Send failed')
    } finally {
      setSending(false)
    }
  }, [draft, sending, directTo, replyTo?.id, canMessageClient, canMessageProvider, loadList])

  const handleAttachmentSent = React.useCallback((message?: any) => {
    const id = activeIdRef.current
    if (!id) return
    if (message) setActiveMsgs((previous) => mergeById(previous, [message]))
    setActiveConv((previous: any) => previous ? { ...previous, ai_mode: 'paused' } : previous)
    setConversations((previous) => previous.map((conversation) => conversation.id === id ? { ...conversation, ai_mode: 'paused' } : conversation))
    void loadThreadPage(id)
    void loadList(true)
  }, [loadThreadPage, loadList])

  const groups = React.useMemo(() => groupByProvider(conversations), [conversations])

  const sidebar = (
    <aside className="admin-master-sidebar" aria-label="Master Chats conversations">
      <div className="admin-master-sidebar-head">
        <div className="admin-master-title-row">
          <h2 className="admin-master-title">Master Chats</h2>
          <span className="admin-master-live">Live</span>
        </div>
        <p className="admin-master-subtitle">
          {counts.all ?? 0} conversations{typeof counts.unread === 'number' ? ` · ${counts.unread} unread` : ''} · grouped by provider
        </p>
        <div className="admin-master-search-wrap">
          <span className="admin-master-search-icon" aria-hidden="true">⌕</span>
          <input
            className="admin-master-search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search people or messages"
            aria-label="Search Master Chats"
          />
        </div>
        <div className="admin-master-filter-row" aria-label="Conversation filters">
          {ROLE_FILTERS.map((filter) => (
            <button
              key={filter.id || 'all'}
              type="button"
              className="admin-master-chip"
              aria-pressed={role === filter.id}
              onClick={() => setRole(filter.id)}
            >
              {filter.label}
            </button>
          ))}
          <button type="button" className="admin-master-chip" aria-pressed={unreadOnly} onClick={() => setUnreadOnly((value) => !value)}>
            Unread{counts.unread ? ` ${counts.unread}` : ''}
          </button>
          <button type="button" className="admin-master-chip" aria-label="Refresh conversation list" onClick={() => void loadList()}>
            ↻ Refresh
          </button>
        </div>
      </div>

      <div className="admin-master-list">
        {listLoading && conversations.length === 0 && <div className="admin-master-loading">Loading conversations…</div>}
        {listError && <div className="admin-master-error" role="alert">{listError}<br /><button type="button" className="admin-master-chip" onClick={() => void loadList()}>Retry</button></div>}
        {!listLoading && !listError && conversations.length === 0 && <div className="admin-master-empty">No conversations match these filters.</div>}

        {groups.map((group) => (
          <section className="admin-master-provider-group" key={group.id} aria-label={`${providerLabel(group.provider)} group`}>
            <div className="admin-master-provider-head">
              <Avatar
                name={group.provider?.name || 'Clients'}
                src={group.provider?.avatar_url}
                userId={group.provider?.id}
                size={30}
              />
              <div className="admin-master-provider-name">
                <strong>{group.provider?.name || 'Clients without assigned provider'}</strong>
                <span className="admin-master-provider-role">{providerLabel(group.provider)}</span>
              </div>
              <span className="admin-master-group-count">{group.conversations.length}</span>
            </div>

            {group.conversations.map((conversation) => {
              const active = conversation.id === activeId
              const client = conversation.client || conversation.participant_b || conversation.participant_a
              return (
                <button
                  key={conversation.id}
                  type="button"
                  className="admin-master-conversation"
                  data-active={active ? 'true' : 'false'}
                  aria-current={active ? 'true' : undefined}
                  onClick={() => openThread(conversation.id)}
                >
                  <div className="admin-master-conversation-inner">
                    <Avatar name={client?.name || 'Client'} src={client?.avatar_url} userId={client?.id} size={40} />
                    <div style={{ minWidth: 0 }}>
                      <div className="admin-master-conversation-top">
                        <span className="admin-master-client-name">{client?.name || 'Client'}</span>
                        <span className="admin-master-time">{fmtRelative(conversation.last_message_at)}</span>
                      </div>
                      <div className="admin-master-status-row">
                        <span className="admin-master-mini-badge" data-tone="client">Client</span>
                        {conversation.context_kind && <span className="admin-master-mini-badge" data-tone="provider">{CTX_LABEL[conversation.context_kind] || conversation.context_kind}</span>}
                        <span className="admin-master-mini-badge" data-tone={conversation.ai_mode === 'paused' ? 'warn' : 'ai'}>AI {conversation.ai_mode || 'auto'}</span>
                      </div>
                      <div className="admin-master-preview">{conversation.last_message || 'No messages yet'}</div>
                    </div>
                  </div>
                  {conversation.has_unread && <span className="admin-master-unread-dot" aria-label="Unread activity" />}
                </button>
              )
            })}
          </section>
        ))}
      </div>

      {(page > 1 || hasMore) && (
        <div className="admin-master-pager">
          <button type="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>‹</button>
          <span style={{ fontSize: 11, color: '#64748b' }}>Page {page}</span>
          <button type="button" disabled={!hasMore} onClick={() => setPage((value) => value + 1)}>›</button>
        </div>
      )}
    </aside>
  )

  const header = activeConv ? (
    <header className="admin-master-thread-header">
      <div className="admin-master-thread-head-main">
        <button type="button" className="admin-master-back" onClick={closeThread} aria-label="Back to conversations">‹</button>
        <div className="admin-master-pair-avatars" aria-hidden="true">
          <Avatar name={activeConv.provider?.name || 'Provider'} src={activeConv.provider?.avatar_url} userId={activeConv.provider?.id} size={34} />
          <Avatar name={activeConv.client?.name || 'Client'} src={activeConv.client?.avatar_url} userId={activeConv.client?.id} size={30} />
        </div>
        <div className="admin-master-thread-copy">
          <div className="admin-master-thread-title">
            {activeConv.client?.name || 'Client'} ↔ {activeConv.provider?.name || 'Provider'}
          </div>
          <div className="admin-master-thread-meta">
            {CTX_LABEL[activeConv.context_kind] || activeConv.context_kind || 'Direct'} · shared thread · admin oversight
          </div>
        </div>
        <div className="admin-master-ai-controls">
          <span className="admin-master-ai-state" data-mode={activeConv.ai_mode || 'auto'}>AI {activeConv.ai_mode || 'auto'}</span>
          {(activeConv.ai_mode || 'auto') === 'auto' ? (
            <button type="button" className="admin-master-ai-action" data-primary="true" disabled={aiModeBusy} onClick={() => void setAiMode('paused')}>Take over</button>
          ) : (
            <button type="button" className="admin-master-ai-action" disabled={aiModeBusy} onClick={() => void setAiMode('auto')}>Resume AI</button>
          )}
        </div>
      </div>
      <div className="admin-master-participant-pair" aria-label="Conversation participants">
        <div className="admin-master-person-pill" data-kind="client">
          <Avatar name={activeConv.client?.name || 'Client'} src={activeConv.client?.avatar_url} userId={activeConv.client?.id} size={22} />
          <span>Client · {activeConv.client?.name || 'Unknown'}</span>
        </div>
        <div className="admin-master-person-pill" data-kind="provider">
          <Avatar name={activeConv.provider?.name || 'Provider'} src={activeConv.provider?.avatar_url} userId={activeConv.provider?.id} size={22} />
          <span>{providerLabel(activeConv.provider)} · {activeConv.provider?.name || 'Unknown'}</span>
        </div>
      </div>
    </header>
  ) : (
    <header className="admin-master-thread-header">
      <div className="admin-master-thread-title">Select a conversation</div>
      <div className="admin-master-thread-meta">Choose a client under any provider group to open the full shared chat.</div>
    </header>
  )

  const messageNodes = (
    <>
      {activeId && threadMeta.has_older && !threadMeta.history_done && (
        <div className="admin-master-history-wrap">
          <button type="button" className="admin-master-history-button" onClick={() => void loadOlder()} disabled={olderLoading} aria-label="Load earlier messages">
            {olderLoading ? 'Loading earlier…' : '↑ Load earlier messages'}
          </button>
        </div>
      )}
      {threadLoading && <div className="admin-master-loading">Loading messages…</div>}
      {threadError && <div className="admin-master-error" role="alert">{threadError}{activeId && <><br /><button type="button" className="admin-master-chip" onClick={() => openThread(activeId)}>Retry</button></>}</div>}
      {!threadLoading && !threadError && activeId && activeMsgs.length === 0 && <div className="admin-master-empty">No messages in this thread yet.</div>}

      {activeMsgs.map((message, index) => {
        const previous = activeMsgs[index - 1]
        const next = activeMsgs[index + 1]
        const showDate = !previous || !sameDay(previous.created_at, message.created_at)
        const kind = messageKind(message, myProfileId)
        const mine = kind === 'admin'
        const first = !previous || previous.sender_id !== message.sender_id || !sameDay(previous.created_at, message.created_at)
        const last = !next || next.sender_id !== message.sender_id || !sameDay(next.created_at, message.created_at)
        const directedTo = message.metadata?.admin_directed_to_name || message.metadata?.admin_directed_to || null
        const senderName = message.sender?.name || (kind === 'client' ? 'Client' : kind === 'provider' ? 'Provider' : 'Admin')
        const senderRole = message.sender?.role ? normalizedRole(message.sender.role) : ''
        const label = kind === 'admin'
          ? `Admin${directedTo ? ` → ${directedTo}` : ''}`
          : kind === 'ai'
            ? `YouSafe AI · ${senderName}`
            : `${senderName}${senderRole ? ` · ${senderRole}` : ''}`

        let body: React.ReactNode = message.body || ''
        if (message.type === 'voice' && message.attachment_url) {
          body = <audio controls preload="metadata" src={message.attachment_url} style={{ width: 'min(280px, 100%)' }} />
        } else if (message.type === 'attachment' && message.attachment_url) {
          body = <a href={message.attachment_url} target="_blank" rel="noreferrer">📎 {message.attachment_name || 'Attachment'}</a>
        }

        const bubbleStyle: React.CSSProperties | undefined = kind === 'admin'
          ? { boxShadow: 'inset 0 0 0 1px rgba(157,34,53,.28)' }
          : kind === 'provider'
            ? { boxShadow: 'inset 3px 0 0 rgba(87,66,138,.32)' }
            : kind === 'ai'
              ? { boxShadow: 'inset 3px 0 0 rgba(67,56,202,.35)' }
              : { boxShadow: 'inset 3px 0 0 rgba(31,122,85,.28)' }

        return (
          <React.Fragment key={message.id}>
            {showDate && <div className="admin-master-date">{dateLabel(message.created_at)}</div>}
            <div data-admin-message-id={message.id}>
              {first && (
                <div className="admin-master-sender-label" data-mine={mine ? 'true' : 'false'} data-kind={kind === 'ai' ? 'provider' : kind}>
                  <span className="admin-master-sender-tag" data-kind={kind}>{kind === 'ai' ? 'AI' : kind}</span>
                  <span>{label}</span>
                </div>
              )}
              <MessageBubble
                id={message.id}
                body={body}
                mine={mine}
                isFirstInGroup={first}
                isLastInGroup={last}
                timestamp={message.created_at}
                reactions={message.reactions || []}
                onReact={handleReact}
                replyTo={message.reply_preview || null}
                onReplyStart={handleReplyStart}
                onReplyClick={handleReplyClick}
                onShowInfo={handleShowInfo}
                avatarUrl={message.sender?.avatar_url}
                avatarName={senderName}
                rawBody={typeof message.body === 'string' ? message.body : undefined}
                style={bubbleStyle}
              />
            </div>
          </React.Fragment>
        )
      })}
    </>
  )

  const composer = activeId ? (
    <div className="admin-master-composer">
      <div className="admin-master-recipient-row" aria-label="Message recipient">
        <span className="admin-master-recipient-label">To</span>
        <button type="button" className="admin-master-recipient" data-kind="client" disabled={!canMessageClient} aria-pressed={directTo === 'client'} onClick={() => setDirectTo('client')}>
          Client · {activeConv?.client?.name || 'Client'}
        </button>
        <button type="button" className="admin-master-recipient" data-kind="provider" disabled={!canMessageProvider} aria-pressed={directTo === 'provider'} onClick={() => setDirectTo('provider')}>
          {providerLabel(activeConv?.provider)} · {activeConv?.provider?.name || 'Provider'}
        </button>
        <span className="admin-master-target-copy">Sending to {targetParty?.name || directTo} · visible in shared thread</span>
      </div>
      <AdminMasterComposer
        conversationId={activeId}
        directTo={directTo}
        value={draft}
        onChange={handleDraftChange}
        onSubmit={() => void send()}
        onAttachmentSent={handleAttachmentSent}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        disabled={sending}
        placeholder={`Message ${targetParty?.name || directTo} as Admin…`}
      />
    </div>
  ) : (
    <div className="admin-master-empty" style={{ margin: 0, borderRadius: 0 }}>Select a conversation to start messaging.</div>
  )

  return (
    <div className="yousafe-messenger" data-theme="light" data-density="compact" style={{ height: '100%', minHeight: 0 }}>
      <div className="admin-master-shell">
        <ChatScreen
          mode="split"
          className="admin-master-chatscreen"
          sidebar={sidebar}
          header={header}
          messages={messageNodes}
          composer={composer}
          mobileShowChat={mobileShowChat && Boolean(activeId)}
          banner={
            <div className="admin-master-banner">
              <span aria-hidden="true">🛡</span>
              <span><strong>Admin oversight:</strong> messages, files, voice notes, replies and reactions enter the shared client-provider thread. Admin intervention pauses AI until Resume AI is selected.</span>
            </div>
          }
        />
      </div>
    </div>
  )
}
