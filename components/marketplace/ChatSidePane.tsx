// @ts-nocheck
'use client'
import React from 'react'
import { Btn } from '../design/shared'
import ChatScreen from '../messaging/ChatScreen'
import MessageBubble from '../messaging/MessageBubble'
import AutoGrowInput from '../messaging/AutoGrowInput'
import Avatar from '../messaging/Avatar'
import { dateLabel, sameDay } from '@/lib/messaging/format'

// Props (loose because this component is JSX-ish via @ts-nocheck):
//   open, onClose, attorneyName, attorneyAvatar
//   attorneyId            — attorney row id (legacy callers)
//   counterpartProfileId  — profile id (any role); preferred new path
//   contextKind, contextId — passed through to /api/messages/start so the
//                           conversation row records its first-link context

/**
 * ChatSidePane
 *
 * Slide-in drawer for student → attorney pre-intake chat. Opens directly
 * from a seller profile (or anywhere else) so the student doesn't have to
 * navigate to the dashboard Messages page just to send a quick question.
 *
 * Props:
 *   open          — whether the drawer is visible
 *   onClose       — callback when the user dismisses
 *   attorneyId    — required to start / continue a chat
 *   attorneyName  — display name for the header
 *   attorneyAvatar — optional avatar URL
 */

const NAVY='#1B2D4F', GREEN='#1A6B45', RED='#8B1A1A', CYAN='#0E7C8E'
const BG='#F7F5F0', SURFACE='#FFFFFF', BORDER='#DDD8CE', TEXT='#1A1F2E', MUTED='#5C6070', DIM='#6B7180'
const SANS=`-apple-system, BlinkMacSystemFont, 'Inter', sans-serif`
const MONO=`'SF Mono', Menlo, Consolas, monospace`

interface ChatSidePaneProps {
  open: boolean
  onClose: () => void
  attorneyName?: string | null
  attorneyAvatar?: string | null
  attorneyId?: string | null            // attorney row id (legacy callers)
  counterpartProfileId?: string | null  // profile id (preferred new path)
  contextKind?: 'general' | 'order' | 'inquiry' | 'gig'
  contextId?: string | null
}

export default function ChatSidePane({ open, onClose, attorneyId, counterpartProfileId, attorneyName, attorneyAvatar, contextKind, contextId }: ChatSidePaneProps) {
  const [chatId, setChatId] = React.useState(null)
  const [conversationId, setConversationId] = React.useState(null)
  const [messages, setMessages] = React.useState([])
  const [presence, setPresence] = React.useState('online')
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')
  const [draft, setDraft] = React.useState('')
  const [sending, setSending] = React.useState(false)

  // ESC closes
  React.useEffect(() => {
    if (!open) return
    const onKey = e => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Resolve existing chat for this attorney (or queue one on first message).
  // We hit /api/client/attorney-chats?attorney_id=... to find an existing
  // thread; falls through to creating one on first send.
  const loadChat = React.useCallback(async () => {
    if (!attorneyId || !open) return
    setLoading(true); setError('')
    try {
      // Look up existing chats and filter for this attorney
      const r = await fetch('/api/client/attorney-chats', { credentials: 'same-origin' })
      const d = await r.json().catch(() => ({}))
      if (r.ok) {
        const list = d?.chats || []
        const match = list.find(c => c.attorney_profile_id === attorneyId || c.attorney_id === attorneyId)
        if (match?.id) {
          setChatId(match.id)
          await loadMessages(match.id)
          return
        }
      }
      // No existing chat — that's fine, we'll create on first send.
      setChatId(null)
      setMessages([])
    } catch (e) {
      setError(e.message || 'Could not load chat.')
    } finally {
      setLoading(false)
    }
  }, [attorneyId, open])

  const loadMessages = async (id) => {
    try {
      const r = await fetch(`/api/client/attorney-chats/${id}`, { credentials: 'same-origin' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error || 'Could not load thread.')
      setMessages(d.messages || [])
      setPresence(d.chat?.presence || 'online')
    } catch (e) {
      setError(e.message)
    }
  }

  React.useEffect(() => { if (open) loadChat() }, [open, loadChat])

  // Resolve the unified conversation_id for this counterpart so we can offer
  // an "Open in Messages →" deep link. Accepts either an attorney row id
  // OR a profile id (e.g. gig.provider_id).
  React.useEffect(() => {
    if ((!attorneyId && !counterpartProfileId) || !open) return
    let cancelled = false
    const body = counterpartProfileId
      ? { counterpart_profile_id: counterpartProfileId, context_kind: contextKind || 'general', context_id: contextId || null }
      : { counterpart_attorney_id: attorneyId }
    fetch('/api/messages/start', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(r => r.json().catch(() => ({})))
      .then(d => { if (!cancelled && d?.conversation_id) setConversationId(d.conversation_id) })
      .catch(() => null)
    return () => { cancelled = true }
  }, [attorneyId, counterpartProfileId, open, contextKind, contextId])

  // Soft poll every 8s while open
  React.useEffect(() => {
    if (!open || !chatId) return
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') loadMessages(chatId)
    }, 8000)
    return () => clearInterval(id)
  }, [open, chatId])

  const send = async () => {
    const text = draft.trim()
    if (!text || sending || (!attorneyId && !counterpartProfileId)) return
    setSending(true); setError('')
    try {
      // If we already resolved the unified conversation id, POST straight to it.
      // This path is the cleanest — no legacy inquiry creation, deep-link-safe.
      if (conversationId) {
        const r = await fetch(`/api/messages/conversations/${conversationId}`, {
          method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: text }),
        })
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(d?.error || 'Could not send.')
        setDraft('')
        // Refresh thread via the conversation endpoint for live history
        try {
          const tr = await fetch(`/api/messages/conversations/${conversationId}`, { credentials: 'same-origin' })
          const td = await tr.json().catch(() => ({}))
          if (tr.ok && td?.messages) {
            // Normalise to the legacy shape so the existing render works
            setMessages(td.messages.map((m: any) => ({
              id: m.id,
              sender_role: m.sender_id ? 'attorney' : 'client', // refined below
              body: m.body,
              created_at: m.created_at,
            })))
          }
        } catch { /* non-blocking */ }
        return
      }

      if (!chatId) {
        // Create chat via attorney-message endpoint (also returns the
        // unified conversation_id for deep-linking into Messages).
        const r = await fetch('/api/client/attorney-message', {
          method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ attorneyId, message: text }),
        })
        const d = await r.json().catch(() => ({}))
        if (!r.ok || !d?.chatId) throw new Error(d?.error || 'Could not start chat.')
        setChatId(d.chatId)
        if (d.conversationId) setConversationId(d.conversationId)
        setDraft('')
        await loadMessages(d.chatId)
      } else {
        // Existing chat — append a message
        const r = await fetch(`/api/client/attorney-chats/${chatId}/messages`, {
          method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: text }),
        })
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(d?.error || 'Could not send message.')
        setDraft('')
        await loadMessages(chatId)
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setSending(false)
    }
  }

  if (!open) return null

  const header = (
    <div style={{ padding: '14px 18px', borderBottom: `1px solid ${BORDER}`, background: SURFACE, display: 'flex', alignItems: 'center', gap: 12 }}>
      <Avatar name={attorneyName} src={attorneyAvatar || undefined} size={40} online={presence === 'online'} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: TEXT, lineHeight: 1.1 }}>{attorneyName || 'Attorney'}</div>
        <div style={{ fontSize: 11, color: presence === 'online' ? GREEN : DIM, fontFamily: MONO, marginTop: 2 }}>
          {presence === 'online' ? '● Online — quick replies likely' : '○ Offline — will respond when available'}
        </div>
      </div>
      <button onClick={onClose} aria-label="Close" style={{ border: `1px solid ${BORDER}`, background: SURFACE, color: MUTED, borderRadius: 999, width: 32, height: 32, cursor: 'pointer', fontSize: 16 }}>×</button>
    </div>
  )

  const banner = error ? (
    <div style={{ padding: '10px 14px', background: `${RED}10`, color: RED, fontSize: 12, fontWeight: 600 }}>
      {error}
    </div>
  ) : null

  const messageNodes = React.useMemo(() => {
    const result: React.ReactNode[] = []
    if (loading && messages.length === 0) {
      result.push(<div key="loading" style={{ color: MUTED, fontSize: 12 }}>Loading…</div>)
      return result
    }
    if (!loading && !chatId && messages.length === 0) {
      result.push(
        <div key="empty" style={{ background: SURFACE, border: `1px dashed ${BORDER}`, borderRadius: 10, padding: '20px 16px', textAlign: 'center' }}>
          <div style={{ fontSize: 26, marginBottom: 6 }}>💬</div>
          <div style={{ fontWeight: 600, fontSize: 17, color: TEXT, marginBottom: 4 }}>Start the conversation</div>
          <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.5 }}>
            Ask a short question — {attorneyName || 'the attorney'} will see it in their queue and reply. Quick replies are typical within an hour.
          </div>
        </div>
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
      if (showDate) {
        result.push(
          <div key={`date-${m.id}`} style={{ display: 'flex', justifyContent: 'center', margin: '10px 0' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: MUTED, background: 'rgba(0,0,0,0.06)', padding: '4px 12px', borderRadius: 999, letterSpacing: '.02em' }}>
              {dateLabel(m.created_at)}
            </span>
          </div>
        )
      }
      result.push(
        <MessageBubble
          key={m.id}
          mine={mine}
          isFirstInGroup={isFirstInGroup}
          isLastInGroup={isLastInGroup}
          timestamp={m.created_at}
          body={m.body}
        />
      )
    }
    return result
  }, [messages, loading, chatId, attorneyName])

  const composer = (
    <div style={{ padding: '12px 14px', borderTop: `1px solid ${BORDER}`, background: SURFACE }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <AutoGrowInput
          value={draft}
          onChange={setDraft}
          onSubmit={send}
          disabled={sending}
          placeholder="Type a message…"
        />
        <Btn variant="primary" size="sm" onClick={send} disabled={sending || !draft.trim()}>
          {sending ? 'Sending…' : 'Send'}
        </Btn>
      </div>
      <div style={{ marginTop: 8, fontSize: 10, color: DIM, fontFamily: MONO, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span>
          <kbd style={{ padding: '1px 5px', background: BG, border: `1px solid ${BORDER}`, borderRadius: 3, fontFamily: MONO, fontSize: 9 }}>Enter</kbd> send · <kbd style={{ padding: '1px 5px', background: BG, border: `1px solid ${BORDER}`, borderRadius: 3, fontFamily: MONO, fontSize: 9 }}>Esc</kbd> close
        </span>
        {conversationId && (
          <a
            href={`https://portal.yousafeconsultancy.com/dashboard?page=messages&thread=${conversationId}`}
            style={{ color: CYAN, fontWeight: 700, fontFamily: SANS, fontSize: 11, textDecoration: 'none' }}
            onClick={(e) => {
              e.preventDefault()
              window.location.href = `https://portal.yousafeconsultancy.com/dashboard?page=messages&thread=${conversationId}`
            }}
          >
            Open in Messages →
          </a>
        )}
      </div>
    </div>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', justifyContent: 'flex-end' }}>
      <button onClick={onClose} aria-label="Close chat" style={{ flex: 1, background: 'rgba(15,18,32,0.45)', border: 'none', cursor: 'pointer' }} />
      <aside style={{
        width: 'min(440px, 100vw)', height: '100vh',
        background: BG, display: 'flex', flexDirection: 'column',
        borderLeft: `1px solid ${BORDER}`,
        boxShadow: '-24px 0 60px rgba(15,18,32,0.18)',
        fontFamily: SANS,
      }}>
        <ChatScreen mode="panel" header={header} messages={messageNodes} composer={composer} banner={banner} />
      </aside>
    </div>
  )
}
