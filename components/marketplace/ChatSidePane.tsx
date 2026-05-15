// @ts-nocheck
'use client'
import React from 'react'
import { Btn, Avatar } from '../design/shared'

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

const NAVY='#1B2D4F', GOLD='#9A7B3B', GREEN='#1A6B45', RED='#8B1A1A', AMBER='#8B5E0A', CYAN='#0E7C8E', PURPLE='#3D2B6B'
const BG='#F7F5F0', SURFACE='#FFFFFF', SURFACE2='#FAFAF7', BORDER='#DDD8CE', BORDER2='#F2EFE9', TEXT='#1A1F2E', MUTED='#5C6070', DIM='#9097A8'
const SERIF=`'Cormorant Garamond', Georgia, serif`
const SANS=`-apple-system, BlinkMacSystemFont, 'Inter', sans-serif`
const MONO=`'SF Mono', Menlo, Consolas, monospace`

const fmtTime = s => s ? new Date(s).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : ''
const fmtDate = s => s ? new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''

export default function ChatSidePane({ open, onClose, attorneyId, attorneyName, attorneyAvatar }) {
  const [chatId, setChatId] = React.useState(null)
  const [messages, setMessages] = React.useState([])
  const [presence, setPresence] = React.useState('online')
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')
  const [draft, setDraft] = React.useState('')
  const [sending, setSending] = React.useState(false)
  const scrollRef = React.useRef(null)

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

  // Auto-scroll on new messages
  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages.length])

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
    if (!text || sending || !attorneyId) return
    setSending(true); setError('')
    try {
      if (!chatId) {
        // Create chat via attorney-message endpoint
        const r = await fetch('/api/client/attorney-message', {
          method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ attorneyId, message: text }),
        })
        const d = await r.json().catch(() => ({}))
        if (!r.ok || !d?.chatId) throw new Error(d?.error || 'Could not start chat.')
        setChatId(d.chatId)
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
        {/* Header */}
        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${BORDER}`, background: SURFACE, display: 'flex', alignItems: 'center', gap: 12 }}>
          <Avatar name={attorneyName} src={attorneyAvatar || undefined} size={40} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: SERIF, fontSize: 17, fontWeight: 600, color: TEXT, lineHeight: 1.1 }}>{attorneyName || 'Attorney'}</div>
            <div style={{ fontSize: 11, color: presence === 'online' ? GREEN : DIM, fontFamily: MONO, marginTop: 2 }}>
              {presence === 'online' ? '● Online — quick replies likely' : '○ Offline — will respond when available'}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ border: `1px solid ${BORDER}`, background: SURFACE, color: MUTED, borderRadius: 999, width: 32, height: 32, cursor: 'pointer', fontSize: 16 }}>×</button>
        </div>

        {/* Notice */}
        {error && (
          <div style={{ margin: '10px 14px 0', padding: '8px 12px', background: `${RED}10`, color: RED, fontSize: 12, fontWeight: 600, borderRadius: 6 }}>
            {error}
          </div>
        )}

        {/* Thread */}
        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {loading && messages.length === 0 && <div style={{ color: MUTED, fontSize: 12 }}>Loading…</div>}
          {!loading && !chatId && messages.length === 0 && (
            <div style={{ background: SURFACE, border: `1px dashed ${BORDER}`, borderRadius: 10, padding: '20px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 26, marginBottom: 6 }}>💬</div>
              <div style={{ fontFamily: SERIF, fontSize: 17, fontWeight: 600, color: TEXT, marginBottom: 4 }}>Start the conversation</div>
              <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.5 }}>
                Ask a short question — {attorneyName || 'the attorney'} will see it in their queue and reply. Quick replies are typical within an hour.
              </div>
            </div>
          )}
          {messages.map(m => {
            const mine = m.sender_role === 'client'
            return (
              <div key={m.id} style={{ display: 'flex', gap: 8, flexDirection: mine ? 'row-reverse' : 'row' }}>
                <Avatar name={mine ? 'You' : (attorneyName || 'A')} src={!mine ? attorneyAvatar || undefined : undefined} size={26} />
                <div style={{ maxWidth: '75%' }}>
                  <div style={{
                    padding: '10px 14px', borderRadius: 12, fontSize: 14, lineHeight: 1.5,
                    background: mine ? `${CYAN}15` : SURFACE, color: TEXT,
                    border: `1px solid ${mine ? `${CYAN}33` : BORDER}`,
                    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  }}>{m.body}</div>
                  <div style={{ fontSize: 10, color: DIM, marginTop: 4, fontFamily: MONO, textAlign: mine ? 'right' : 'left' }}>
                    {fmtDate(m.created_at)} · {fmtTime(m.created_at)}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Composer */}
        <div style={{ padding: '12px 14px', borderTop: `1px solid ${BORDER}`, background: SURFACE, display: 'flex', gap: 8 }}>
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder="Type a message…"
            rows={2}
            disabled={sending}
            style={{ flex: 1, padding: '8px 12px', background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 13, fontFamily: SANS, outline: 'none', resize: 'none' }}
          />
          <Btn variant="primary" size="sm" onClick={send} disabled={sending || !draft.trim()}>{sending ? 'Sending…' : 'Send'}</Btn>
        </div>
        <div style={{ padding: '0 14px 12px', fontSize: 10, color: DIM, fontFamily: MONO, textAlign: 'center' }}>
          Press <kbd style={{ padding: '1px 5px', background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: 3, fontFamily: MONO, fontSize: 9 }}>Enter</kbd> to send · <kbd style={{ padding: '1px 5px', background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: 3, fontFamily: MONO, fontSize: 9 }}>Esc</kbd> to close
        </div>
      </aside>
    </div>
  )
}
