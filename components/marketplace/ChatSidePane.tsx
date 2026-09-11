// @ts-nocheck
'use client'
import React from 'react'
import ChatScreen from '../messaging/ChatScreen'
import MessageBubble from '../messaging/MessageBubble'
import AutoGrowInput from '../messaging/AutoGrowInput'
import Avatar from '../messaging/Avatar'
import { dateLabel, sameDay } from '@/lib/messaging/format'
import { subscribeToTable } from '@/lib/supabaseRealtime'
import '../messaging/messenger-tokens.css'
import { F } from './tokens'

const GREEN = '#3F774A'
const RED = '#B22234'
const CYAN = '#111827'
const BG = 'var(--chat-bg, #F0F2F5)'
const SURFACE = 'var(--panel, #FFFFFF)'
const PANEL2 = 'var(--panel-2, #F1F5F9)'
const BORDER = 'var(--border, #E2E8F0)'
const TEXT = 'var(--text, #0F172A)'
const MUTED = 'var(--text-mid, #334155)'
const DIM = 'var(--text-soft, #64748B)'
const SANS = F.ui
const MONO = F.mono
const MAX_GIG_DRAFT = 2500

interface ChatSidePaneProps {
  open: boolean
  onClose: () => void
  attorneyName?: string | null
  attorneyAvatar?: string | null
  attorneyId?: string | null
  counterpartProfileId?: string | null
  contextKind?: 'general' | 'order' | 'inquiry' | 'gig'
  contextId?: string | null
  presentation?: 'drawer' | 'popover'
  responseTime?: string | null
  serviceTitle?: string | null
}

function normalizeUnifiedThread(payload: any) {
  const counterpartId = payload?.conversation?.counterpart?.id || null
  return (Array.isArray(payload?.messages) ? payload.messages : []).map((m: any) => ({
    id: m.id,
    sender_id: m.sender_id,
    sender_role: counterpartId && m.sender_id === counterpartId ? 'attorney' : 'client',
    body: m.body,
    type: m.type,
    metadata: m.metadata || {},
    attachment_url: m.attachment_url,
    attachment_name: m.attachment_name,
    created_at: m.created_at,
    delivered_at: m.delivered_at,
    read_at: m.read_at,
  }))
}

function AiMessageBody({ body }: { body: React.ReactNode }) {
  return (
    <span className="ys-ai-message">
      <span className="ys-ai-message-label">✦ YouSafe AI</span>
      <span className="ys-ai-message-copy">{body}</span>
    </span>
  )
}

export default function ChatSidePane({
  open,
  onClose,
  attorneyId,
  counterpartProfileId,
  attorneyName,
  attorneyAvatar,
  contextKind,
  contextId,
  presentation = 'drawer',
  responseTime,
  serviceTitle,
}: ChatSidePaneProps) {
  const isPopover = presentation === 'popover'
  const [chatId, setChatId] = React.useState(null)
  const [conversationId, setConversationId] = React.useState(null)
  const [messages, setMessages] = React.useState<any[]>([])
  const [presence, setPresence] = React.useState('online')
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')
  const [draft, setDraft] = React.useState('')
  const [sending, setSending] = React.useState(false)
  const [aiMode, setAiMode] = React.useState<'auto' | 'paused' | 'off'>('auto')
  const [liveStatus, setLiveStatus] = React.useState('CONNECTING')
  const conversationIdRef = React.useRef<string | null>(null)
  const unifiedSeqRef = React.useRef(0)

  React.useEffect(() => {
    conversationIdRef.current = conversationId
  }, [conversationId])

  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const loadLegacyMessages = React.useCallback(async (id: string) => {
    try {
      const r = await fetch(`/api/client/attorney-chats/${id}`, { credentials: 'include' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error || 'Could not load thread.')
      if (!conversationIdRef.current) setMessages(d.messages || [])
      setPresence(d.chat?.presence || 'online')
    } catch (e: any) {
      if (!conversationIdRef.current) setError(e?.message || 'Could not load thread.')
    }
  }, [])

  const loadLegacyChat = React.useCallback(async () => {
    if (!attorneyId || !open) return
    setLoading(true)
    setError('')
    try {
      const r = await fetch('/api/client/attorney-chats', { credentials: 'include' })
      if (r.status === 401) {
        setError('SIGN_IN_REQUIRED')
        setChatId(null)
        setMessages([])
        return
      }
      const d = await r.json().catch(() => ({}))
      if (r.ok) {
        const list = d?.chats || []
        const match = list.find((c: any) => c.attorney_profile_id === attorneyId || c.attorney_id === attorneyId)
        if (match?.id) {
          setChatId(match.id)
          await loadLegacyMessages(match.id)
          return
        }
      }
      setChatId(null)
      if (!conversationIdRef.current) setMessages([])
    } catch (e: any) {
      setError(e?.message || 'Could not load chat.')
    } finally {
      setLoading(false)
    }
  }, [attorneyId, open, loadLegacyMessages])

  React.useEffect(() => {
    if (open) void loadLegacyChat()
  }, [open, loadLegacyChat])

  const loadUnifiedConversation = React.useCallback(async (id: string, silent = false) => {
    if (!id) return
    const seq = ++unifiedSeqRef.current
    if (!silent) setLoading(true)
    try {
      const r = await fetch(`/api/messages/conversations/${id}`, {
        credentials: 'include',
        cache: 'no-store',
      })
      const d = await r.json().catch(() => ({}))
      if (seq !== unifiedSeqRef.current) return
      if (!r.ok) {
        if (r.status === 401) {
          setError('SIGN_IN_REQUIRED')
          return
        }
        throw new Error(d?.error?.message || d?.error || 'Could not load thread.')
      }
      setMessages(normalizeUnifiedThread(d))
      setAiMode((d?.conversation?.ai_mode || 'auto') as 'auto' | 'paused' | 'off')
      setError('')
    } catch (e: any) {
      if (seq === unifiedSeqRef.current && !silent) setError(e?.message || 'Could not load thread.')
    } finally {
      if (!silent && seq === unifiedSeqRef.current) setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    if ((!attorneyId && !counterpartProfileId) || !open) return
    let cancelled = false
    const body = counterpartProfileId
      ? {
          counterpart_profile_id: counterpartProfileId,
          context_kind: contextKind || 'general',
          context_id: contextId || null,
        }
      : { counterpart_attorney_id: attorneyId }

    ;(async () => {
      try {
        const r = await fetch('/api/messages/start', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const d = await r.json().catch(() => ({}))
        if (cancelled) return
        if (r.status === 401) {
          setError('SIGN_IN_REQUIRED')
          return
        }
        if (!r.ok || !d?.conversation_id) return
        setConversationId(d.conversation_id)
        conversationIdRef.current = d.conversation_id
        await loadUnifiedConversation(d.conversation_id, false)
      } catch {
        // Legacy fallback remains available for attorney threads.
      }
    })()

    return () => { cancelled = true }
  }, [attorneyId, counterpartProfileId, open, contextKind, contextId, loadUnifiedConversation])

  React.useEffect(() => {
    if (!open || !conversationId) return
    const off = subscribeToTable(
      'conversation_messages',
      'public',
      (payload) => {
        const row = payload.new || payload.old
        if (row?.conversation_id === conversationId) void loadUnifiedConversation(conversationId, true)
      },
      (status) => setLiveStatus(status),
    )
    return () => off()
  }, [open, conversationId, loadUnifiedConversation])

  React.useEffect(() => {
    if (!open) return
    const id = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      if (conversationIdRef.current) void loadUnifiedConversation(conversationIdRef.current, true)
      else if (chatId) void loadLegacyMessages(chatId)
    }, conversationId ? 4000 : 8000)
    return () => window.clearInterval(id)
  }, [open, chatId, conversationId, loadUnifiedConversation, loadLegacyMessages])

  React.useEffect(() => {
    if (!open) return
    const refresh = () => {
      if (document.visibilityState === 'visible' && conversationIdRef.current) {
        void loadUnifiedConversation(conversationIdRef.current, true)
      }
    }
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [open, loadUnifiedConversation])

  const ensureUnifiedConversation = React.useCallback(async () => {
    if (conversationIdRef.current) return conversationIdRef.current
    const body = counterpartProfileId
      ? {
          counterpart_profile_id: counterpartProfileId,
          context_kind: contextKind || 'general',
          context_id: contextId || null,
        }
      : { counterpart_attorney_id: attorneyId }
    const r = await fetch('/api/messages/start', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok || !d?.conversation_id) return null
    setConversationId(d.conversation_id)
    conversationIdRef.current = d.conversation_id
    return d.conversation_id as string
  }, [attorneyId, counterpartProfileId, contextKind, contextId])

  const send = async () => {
    const text = draft.trim()
    if (!text || sending || (!attorneyId && !counterpartProfileId)) return
    setSending(true)
    setError('')
    try {
      const id = await ensureUnifiedConversation()
      if (id) {
        const r = await fetch(`/api/messages/conversations/${id}`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: text }),
        })
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(d?.error?.message || d?.error || 'Could not send.')
        setDraft('')
        await loadUnifiedConversation(id, true)
        return
      }

      if (attorneyId) {
        if (!chatId) {
          const r = await fetch('/api/client/attorney-message', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ attorneyId, message: text }),
          })
          const d = await r.json().catch(() => ({}))
          if (!r.ok || !d?.chatId) throw new Error(d?.error || 'Could not start chat.')
          setChatId(d.chatId)
          if (d.conversationId) {
            setConversationId(d.conversationId)
            conversationIdRef.current = d.conversationId
          }
          setDraft('')
          await loadLegacyMessages(d.chatId)
        } else {
          const r = await fetch(`/api/client/attorney-chats/${chatId}/messages`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ body: text }),
          })
          const d = await r.json().catch(() => ({}))
          if (!r.ok) throw new Error(d?.error || 'Could not send message.')
          setDraft('')
          await loadLegacyMessages(chatId)
        }
        return
      }

      throw new Error('Could not start chat.')
    } catch (e: any) {
      setError(e?.message || 'Could not send message.')
    } finally {
      setSending(false)
    }
  }

  const firstName = String(attorneyName || 'the specialist').trim().split(/\s+/)[0]
  const starterPrompts = React.useMemo(() => {
    const service = String(serviceTitle || 'this service').trim()
    const compactService = service.length > 70 ? `${service.slice(0, 67).trimEnd()}…` : service
    return [
      `👋 Hi ${firstName}, can you help me with ${compactService}?`,
      '📎 What documents or information should I send before we start?',
      '⏱ Can you confirm the likely timeline and what you need from me?',
    ]
  }, [firstName, serviceTitle])

  const header = (
    <div className="ys-market-chat-head" style={{ padding: isPopover ? '15px 18px' : '16px 20px', borderBottom: `1px solid ${BORDER}`, background: SURFACE, display: 'flex', alignItems: 'center', gap: 12 }}>
      <Avatar name={attorneyName} src={attorneyAvatar || undefined} size={isPopover ? 44 : 40} online={presence === 'online'} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: F.display, fontWeight: 600, fontSize: isPopover ? 18 : 17, letterSpacing: '-0.01em', color: TEXT, lineHeight: 1.15 }}>
          {isPopover ? `Message ${attorneyName || 'specialist'}` : (attorneyName || 'Specialist')}
        </div>
        <div style={{ fontSize: isPopover ? 11 : 10.5, color: presence === 'online' ? GREEN : DIM, fontFamily: isPopover ? SANS : MONO, letterSpacing: isPopover ? 0 : '0.1em', textTransform: isPopover ? 'none' : 'uppercase', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {presence === 'online' ? 'Online' : 'Away'}
          {responseTime ? ` · Avg. response: ${responseTime}` : (presence === 'online' ? ' · quick replies likely' : ' · will respond when available')}
        </div>
      </div>
      <button onClick={onClose} aria-label="Close" style={{ border: isPopover ? 'none' : `1px solid ${BORDER}`, background: isPopover ? 'transparent' : PANEL2, color: MUTED, borderRadius: 999, width: 40, height: 40, cursor: 'pointer', fontSize: isPopover ? 28 : 18, lineHeight: 1, fontFamily: F.ui, flex: '0 0 40px' }}>×</button>
    </div>
  )

  const availabilityBanner = isPopover ? (
    <div className={`ys-gig-chat-availability ${presence === 'online' ? 'is-online' : 'is-away'}`} role="status">
      <span aria-hidden="true">{presence === 'online' ? '●' : '◐'}</span>
      <span>
        {presence === 'online' ? `${attorneyName || 'This specialist'} is online now.` : `${attorneyName || 'This specialist'} is away right now.`}
        {responseTime ? ` Typical response time: ${responseTime}.` : ''}
      </span>
    </div>
  ) : null

  const aiLiveBanner = conversationId && aiMode === 'auto' ? (
    <div className="ys-market-ai-live" role="status" aria-live="polite">
      <span className="ys-ai-live-dot" aria-hidden="true" />
      <span><strong>YouSafe AI live replies are on.</strong> The specialist can join at any time.</span>
      <span className="ys-market-ai-live-state">{liveStatus === 'SUBSCRIBED' ? 'Live' : 'Live sync'}</span>
    </div>
  ) : null

  const errorBanner = error === 'SIGN_IN_REQUIRED' ? (
    <div className="ys-market-chat-signin" style={{ padding: '12px 14px', background: `${CYAN}10`, color: CYAN, fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
      <span>Sign in to message this specialist.</span>
      <a
        href={`https://portal.yousafeconsultancy.com/sign-in/student?return_to=${encodeURIComponent(typeof window !== 'undefined' ? window.location.href : '/')}`}
        style={{ background: CYAN, color: '#FFFFFF', padding: '8px 12px', borderRadius: 999, textDecoration: 'none', fontWeight: 700, whiteSpace: 'nowrap' }}
      >
        Sign in →
      </a>
    </div>
  ) : error ? (
    <div style={{ padding: '10px 14px', background: `${RED}10`, color: RED, fontSize: 12, fontWeight: 600 }}>
      {error}
    </div>
  ) : null

  const banner = (
    <>
      {availabilityBanner}
      {aiLiveBanner}
      {errorBanner}
    </>
  )

  const messageNodes = React.useMemo(() => {
    const result: React.ReactNode[] = []
    if (loading && messages.length === 0) {
      result.push(<div key="loading" style={{ color: MUTED, fontSize: 12 }}>Loading…</div>)
      return result
    }
    if (!loading && messages.length === 0) {
      result.push(
        <div key="empty" className="ys-market-chat-empty" style={{ background: SURFACE, border: isPopover ? 'none' : `1px dashed ${BORDER}`, borderRadius: 10, padding: isPopover ? '8px 4px 4px' : '20px 16px', textAlign: isPopover ? 'left' : 'center' }}>
          {!isPopover && <div style={{ fontSize: 26, marginBottom: 6 }}>💬</div>}
          <div style={{ fontWeight: 600, fontSize: isPopover ? 15 : 17, color: TEXT, marginBottom: 5 }}>Start the conversation</div>
          <div style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.55 }}>
            Ask a question or share your project details. Include requirements, timing, budget or documents when relevant.
          </div>
        </div>,
      )
      return result
    }

    for (let i = 0; i < messages.length; i++) {
      const m = messages[i]
      const prev = messages[i - 1]
      const next = messages[i + 1]
      const mine = m.sender_role === 'client'
      const prevMine = prev ? prev.sender_role === 'client' : null
      const nextMine = next ? next.sender_role === 'client' : null
      const isFirstInGroup = prevMine !== mine
      const isLastInGroup = nextMine !== mine
      const showDate = !prev || !sameDay(m.created_at, prev.created_at)
      const isAi = Boolean(m?.metadata?.ai_generated || m?.metadata?.ai_assistant)

      if (showDate) {
        result.push(
          <div key={`date-${m.id}`} style={{ display: 'flex', justifyContent: 'center', margin: '10px 0' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: MUTED, background: 'rgba(0,0,0,0.06)', padding: '4px 12px', borderRadius: 999, letterSpacing: '.02em' }}>
              {dateLabel(m.created_at)}
            </span>
          </div>,
        )
      }

      result.push(
        <MessageBubble
          key={m.id}
          id={m.id}
          mine={mine}
          isFirstInGroup={isFirstInGroup}
          isLastInGroup={isLastInGroup}
          timestamp={m.created_at}
          deliveredAt={m.delivered_at}
          readAt={m.read_at}
          avatarUrl={!mine ? (attorneyAvatar || undefined) : undefined}
          avatarName={!mine ? (attorneyName || 'Specialist') : undefined}
          body={isAi ? <AiMessageBody body={m.body} /> : m.body}
          rawBody={m.body || ''}
        />,
      )
    }
    return result
  }, [messages, loading, attorneyName, attorneyAvatar, isPopover])

  const composer = (
    <div className={`ys-market-chat-composer ${isPopover ? 'ys-gig-chat-composer' : ''}`} style={{ borderTop: `1px solid ${BORDER}`, background: SURFACE }}>
      {isPopover && messages.length === 0 && (
        <div className="ys-gig-chat-starters" aria-label="Suggested questions">
          {starterPrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => setDraft(prompt.slice(0, MAX_GIG_DRAFT))}
              disabled={sending || error === 'SIGN_IN_REQUIRED'}
            >
              {prompt}
            </button>
          ))}
        </div>
      )}
      <AutoGrowInput
        value={draft}
        onChange={(next) => setDraft(String(next || '').slice(0, isPopover ? MAX_GIG_DRAFT : 10000))}
        onSubmit={send}
        disabled={sending || error === 'SIGN_IN_REQUIRED'}
        placeholder={sending ? 'Sending…' : (isPopover ? `Ask ${firstName} a question or share your project details…` : 'Type a message…')}
        conversationId={conversationId || undefined}
        allowVoice={!isPopover}
        onAttachmentSent={() => {
          if (conversationIdRef.current) void loadUnifiedConversation(conversationIdRef.current, true)
        }}
      />
      <div className="ys-market-chat-foot" style={{ padding: '0 14px 10px', fontSize: 10, color: DIM, fontFamily: MONO, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        {isPopover ? (
          <span className="ys-gig-chat-counter" aria-live="polite">{draft.length}/{MAX_GIG_DRAFT}</span>
        ) : (
          <span className="ys-market-chat-shortcuts">
            <kbd style={{ padding: '1px 5px', background: BG, border: `1px solid ${BORDER}`, borderRadius: 3, fontFamily: MONO, fontSize: 9 }}>Enter</kbd> send · <kbd style={{ padding: '1px 5px', background: BG, border: `1px solid ${BORDER}`, borderRadius: 3, fontFamily: MONO, fontSize: 9 }}>Esc</kbd> close
          </span>
        )}
        {conversationId && (
          <a
            href={`https://portal.yousafeconsultancy.com/dashboard?page=messages&thread=${conversationId}`}
            style={{ color: CYAN, fontWeight: 700, fontFamily: SANS, fontSize: 11, textDecoration: 'none', whiteSpace: 'nowrap' }}
          >
            Open in Messages →
          </a>
        )}
      </div>
    </div>
  )

  if (!open) return null

  const panel = (
    <aside
      className={`yousafe-messenger chat-side-pane ${isPopover ? 'ys-gig-message-popover' : ''}`}
      data-theme="light"
      role={isPopover ? 'dialog' : undefined}
      aria-modal={isPopover ? 'true' : undefined}
      aria-label={isPopover ? `Message ${attorneyName || 'specialist'}` : undefined}
      style={isPopover ? undefined : {
        width: 'min(440px, 100vw)',
        height: '100dvh',
        background: 'var(--bg, #F7F8FA)',
        display: 'flex',
        flexDirection: 'column',
        borderLeft: `1px solid ${BORDER}`,
        boxShadow: '-24px 0 60px rgba(29,36,51,0.18)',
        fontFamily: SANS,
        color: TEXT,
        colorScheme: 'light',
        isolation: 'isolate',
      }}
    >
      <ChatScreen mode="panel" header={header} messages={messageNodes} composer={composer} banner={banner} />
    </aside>
  )

  if (isPopover) {
    return (
      <div className="ys-gig-message-popover-shell" data-ysa-hide-launcher="true">
        <button className="ys-gig-message-popover-dismiss" onClick={onClose} aria-label="Close chat" />
        {panel}
      </div>
    )
  }

  return (
    <div className="ys-market-chat-overlay" data-ysa-hide-launcher="true" style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', justifyContent: 'flex-end' }}>
      <button onClick={onClose} aria-label="Close chat" style={{ flex: 1, background: 'rgba(15,18,32,0.45)', border: 'none', cursor: 'pointer' }} />
      {panel}
    </div>
  )
}
