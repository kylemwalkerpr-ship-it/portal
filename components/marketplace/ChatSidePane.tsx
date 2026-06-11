// @ts-nocheck
'use client'
import React from 'react'
import { Btn } from '../design/shared'
import ChatScreen from '../messaging/ChatScreen'
import MessageBubble from '../messaging/MessageBubble'
import AutoGrowInput from '../messaging/AutoGrowInput'
import Avatar from '../messaging/Avatar'
import { dateLabel, sameDay } from '@/lib/messaging/format'
import { T, F } from './tokens'

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

const NAVY=T.indigoDeep, GREEN=T.moss, RED=T.brick, CYAN=T.indigo
const BG=T.paper, SURFACE=T.vellum, BORDER=T.rule, TEXT=T.ink, MUTED=T.inkMid, DIM=T.inkSoft
const SANS=F.ui
const MONO=F.mono

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
      // credentials: 'include' so the Clerk session cookie travels
      // when this pane runs on market.yousafeconsultancy.com and
      // talks to portal.yousafeconsultancy.com (same site, different
      // origin). 'same-origin' would drop the cookie and force every
      // marketplace visitor to look unauthenticated.
      const r = await fetch('/api/client/attorney-chats', { credentials: 'include' })
      if (r.status === 401) {
        // Anonymous visitor — not a load failure, just unauthenticated.
        // Show the sign-in CTA instead of an error banner.
        setError('SIGN_IN_REQUIRED')
        setChatId(null); setMessages([])
        return
      }
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
      const r = await fetch(`/api/client/attorney-chats/${id}`, { credentials: 'include' })
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
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(r => r.json().catch(() => ({})))
      .then(d => { if (!cancelled && d?.conversation_id) setConversationId(d.conversation_id) })
      .catch(() => null)
    return () => { cancelled = true }
  }, [attorneyId, counterpartProfileId, open, contextKind, contextId])

  // Consultant path: once the unified conversation resolves, hydrate the
  // thread from it (the attorney-chats loader above skipped — no attorneyId).
  React.useEffect(() => {
    if (!open || attorneyId || !conversationId) return
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch(`/api/messages/conversations/${conversationId}`, { credentials: 'include' })
        const d = await r.json().catch(() => ({}))
        if (!cancelled && r.ok && Array.isArray(d?.messages)) {
          setMessages(d.messages.map((m: any) => ({ id: m.id, sender_role: m.sender_id ? 'attorney' : 'client', body: m.body, created_at: m.created_at })))
        }
      } catch { /* non-blocking */ }
      if (!cancelled) setLoading(false)
    })()
    return () => { cancelled = true }
  }, [open, attorneyId, conversationId])

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
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: text }),
        })
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(d?.error || 'Could not send.')
        setDraft('')
        // Refresh thread via the conversation endpoint for live history
        try {
          const tr = await fetch(`/api/messages/conversations/${conversationId}`, { credentials: 'include' })
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

      // Consultant (or any non-attorney) counterpart: there is no
      // attorney-chat queue, so resolve the unified conversation now if
      // the open-time resolution hasn't landed yet, then send through it.
      if (!attorneyId && counterpartProfileId) {
        const sr = await fetch('/api/messages/start', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ counterpart_profile_id: counterpartProfileId, context_kind: contextKind || 'general', context_id: contextId || null }),
        })
        const sd = await sr.json().catch(() => ({}))
        if (!sr.ok || !sd?.conversation_id) throw new Error(sd?.error || 'Could not start chat.')
        setConversationId(sd.conversation_id)
        const mr = await fetch(`/api/messages/conversations/${sd.conversation_id}`, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: text }),
        })
        const md = await mr.json().catch(() => ({}))
        if (!mr.ok) throw new Error(md?.error || 'Could not send.')
        setDraft('')
        try {
          const tr = await fetch(`/api/messages/conversations/${sd.conversation_id}`, { credentials: 'include' })
          const td = await tr.json().catch(() => ({}))
          if (tr.ok && td?.messages) {
            setMessages(td.messages.map((m: any) => ({ id: m.id, sender_role: m.sender_id ? 'attorney' : 'client', body: m.body, created_at: m.created_at })))
          }
        } catch { /* non-blocking */ }
        return
      }

      if (!chatId) {
        // Create chat via attorney-message endpoint (also returns the
        // unified conversation_id for deep-linking into Messages).
        const r = await fetch('/api/client/attorney-message', {
          method: 'POST', credentials: 'include',
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
          method: 'POST', credentials: 'include',
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

  const header = (
    <div style={{ padding: '16px 20px', borderBottom: `1px solid ${BORDER}`, background: SURFACE, display: 'flex', alignItems: 'center', gap: 12 }}>
      <Avatar name={attorneyName} src={attorneyAvatar || undefined} size={40} online={presence === 'online'} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: F.display, fontWeight: 500, fontSize: 17, letterSpacing: '-0.01em', color: TEXT, lineHeight: 1.15 }}>{attorneyName || 'Specialist'}</div>
        <div style={{ fontSize: 10.5, color: presence === 'online' ? GREEN : DIM, fontFamily: MONO, letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 3 }}>
          {presence === 'online' ? '● Online · quick replies likely' : '○ Offline · will respond when available'}
        </div>
      </div>
      <button onClick={onClose} aria-label="Close" style={{ border: `1px solid ${BORDER}`, background: T.paper, color: MUTED, borderRadius: 999, width: 32, height: 32, cursor: 'pointer', fontSize: 16, fontFamily: F.ui }}>×</button>
    </div>
  )

  // SIGN_IN_REQUIRED is the friendly anonymous-visitor signal — show a
  // sign-in CTA instead of a red error banner. Any other error string
  // is a real failure (offline, 5xx, malformed response) and gets the
  // standard red treatment.
  const banner = error === 'SIGN_IN_REQUIRED' ? (
    <div style={{ padding: '12px 14px', background: `${CYAN}10`, color: CYAN, fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
      <span>Sign in to message this attorney.</span>
      <a
        href={`https://portal.yousafeconsultancy.com/sign-in/student?return_to=${encodeURIComponent(typeof window !== 'undefined' ? window.location.href : '/')}`}
        style={{ background: CYAN, color: '#FFFFFF', padding: '6px 12px', borderRadius: 6, textDecoration: 'none', fontWeight: 700, whiteSpace: 'nowrap' }}
      >
        Sign in →
      </a>
    </div>
  ) : error ? (
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
        <Btn
          variant="primary"
          size="sm"
          onClick={send}
          disabled={sending || !draft.trim()}
          style={{
            background: T.indigo,
            color: '#fff',
            borderRadius: 999,
            boxShadow: '0 10px 22px -10px rgba(60,59,110,0.55)',
            fontFamily: F.ui,
          }}
        >
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

  if (!open) return null

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', justifyContent: 'flex-end' }}>
      <button onClick={onClose} aria-label="Close chat" style={{ flex: 1, background: 'rgba(15,18,32,0.45)', border: 'none', cursor: 'pointer' }} />
      <aside style={{
        width: 'min(440px, 100vw)', height: '100vh',
        background: BG, display: 'flex', flexDirection: 'column',
        borderLeft: `1px solid ${BORDER}`,
        boxShadow: '-24px 0 60px rgba(29,36,51,0.18)',
        fontFamily: SANS,
        color: TEXT,
      }}>
        <ChatScreen mode="panel" header={header} messages={messageNodes} composer={composer} banner={banner} />
      </aside>
    </div>
  )
}
