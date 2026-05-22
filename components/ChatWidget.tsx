// @ts-nocheck
'use client'

import React from 'react'
import ChatScreen from './messaging/ChatScreen'
import MessageBubble from './messaging/MessageBubble'
import AutoGrowInput from './messaging/AutoGrowInput'
import { dateLabel, sameDay } from '@/lib/messaging/format'

const STORAGE_KEY = 'yousafe.chat.history.v1'
const OPEN_KEY = 'yousafe.chat.open.v1'
const SUPPORT_KEY = 'yousafe.chat.support.v1'
const CONTACT_KEY = 'yousafe.chat.contact.v1'
const MAX_PERSISTED = 30
const SUPPORT_API_DEFAULT = 'https://support.yousafeconsultancy.com/api/chat/widget'
const SUPPORT_POLL_MS = 5000

const styles = {
  bubbleBg: '#3C3B6E',
  bubbleBgHover: '#2d2a5e',
  bubbleText: '#FFFFFF',
  panelBg: '#FFFFFF',
  panelBorder: '#E5E7EB',
  panelHeader: '#111827',
  textMuted: '#6B7280',
  textDim: '#9CA3AF',
  surface: '#F3F4F6',
  surface2: '#F9FAFB',
  border: '#E5E7EB',
  border2: '#D1D5DB',
  red: '#DC2626',
}

const GREETING = "Hi! I'm Yara, the YouSafe assistant. I can answer questions about services, payments, refunds, document uploads, or how the portal works. If you need a person, just ask to talk to a human and I'll connect you with our support team."

function loadJSON(key, fallback) {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    return parsed != null ? parsed : fallback
  } catch {
    return fallback
  }
}

function saveJSON(key, value) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* localStorage may be disabled — non-fatal */
  }
}

function statusLabel(supportSession) {
  if (!supportSession?.conversationId) return 'AI assistant online'
  const status = supportSession.status
  if (status === 'assigned') return 'Live agent connected'
  if (status === 'waiting_for_agent') {
    const pos = supportSession.queue?.position
    const wait = supportSession.queue?.estimatedWaitMinutes
    if (pos && wait) return `In live queue · #${pos} · ~${wait} min`
    if (pos) return `In live queue · #${pos}`
    return 'In live queue'
  }
  if (status === 'resolved' || status === 'closed') return 'Live chat closed'
  return 'AI support online'
}

function looksLikeHumanRequest(text) {
  return /\b(human|agent|support|representative|person|real person|live chat|talk to someone)\b/i.test(text)
}

export default function ChatWidget() {
  const [open, setOpen] = React.useState(false)
  const [history, setHistory] = React.useState([])
  const [input, setInput] = React.useState('')
  const [sending, setSending] = React.useState(false)
  const [error, setError] = React.useState(null)
  const [hydrated, setHydrated] = React.useState(false)
  const [supportSession, setSupportSession] = React.useState(null)
  const [maximized, setMaximized] = React.useState(false)
  const [contact, setContact] = React.useState(null)
  const [contactDraft, setContactDraft] = React.useState({ name: '', email: '' })
  const [pendingHuman, setPendingHuman] = React.useState(false)

  React.useEffect(() => {
    setHistory(loadJSON(STORAGE_KEY, []))
    setOpen(loadJSON(OPEN_KEY, false) === true)
    setSupportSession(loadJSON(SUPPORT_KEY, null))
    const savedContact = loadJSON(CONTACT_KEY, null)
    if (savedContact?.name && savedContact?.email) {
      setContact(savedContact)
      setContactDraft(savedContact)
    }
    setHydrated(true)
  }, [])

  React.useEffect(() => {
    if (hydrated) saveJSON(STORAGE_KEY, history.slice(-MAX_PERSISTED))
  }, [history, hydrated])

  React.useEffect(() => {
    if (hydrated) saveJSON(OPEN_KEY, open)
  }, [open, hydrated])

  React.useEffect(() => {
    if (hydrated) saveJSON(SUPPORT_KEY, supportSession)
  }, [supportSession, hydrated])

  React.useEffect(() => {
    if (hydrated && contact?.name && contact?.email) saveJSON(CONTACT_KEY, contact)
  }, [contact, hydrated])

  // Poll support-saas for new agent / system replies once the conversation
  // has been handed off. We merge support-side messages into local history
  // by tracking the most-recent message timestamp we already know.
  React.useEffect(() => {
    if (!open) return
    const id = supportSession?.conversationId
    if (!id) return
    const apiUrl = supportSession?.apiUrl || SUPPORT_API_DEFAULT
    let cancelled = false

    const pull = async () => {
      try {
        const res = await fetch(`${apiUrl}/${encodeURIComponent(id)}`)
        if (!res.ok) return
        const data = await res.json()
        if (cancelled) return
        const remoteMessages = Array.isArray(data.messages) ? data.messages : []
        if (remoteMessages.length === 0) return

        setHistory(prev => mergeRemoteMessages(prev, remoteMessages))
        setSupportSession(prev => prev ? {
          ...prev,
          status: data.conversation?.status ?? prev.status,
          queue: data.queue ?? prev.queue,
        } : prev)
      } catch {
        /* polling errors are non-fatal */
      }
    }

    pull()
    const timer = setInterval(pull, SUPPORT_POLL_MS)
    return () => { cancelled = true; clearInterval(timer) }
  }, [open, supportSession?.conversationId, supportSession?.apiUrl])

  const sendToYara = async (history, options = undefined) => {
    const apiHistory = history
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role, content: m.content }))
    const pageContext = typeof window !== 'undefined'
      ? {
          url: window.location.href,
          origin: window.location.origin,
          pathname: window.location.pathname,
          title: document.title,
          referrer: document.referrer || null,
          surface: 'portal',
        }
      : null
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: apiHistory,
        requestAgent: options?.requestAgent === true,
        topic: options?.topic,
        pageContext,
        visitor: options?.visitor || contact,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(data.error || `Assistant unreachable (${res.status})`)
    }
    return data
  }

  const sendToSupport = async (text, session) => {
    const apiUrl = session.apiUrl || SUPPORT_API_DEFAULT
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        conversationId: session.conversationId,
        topic: 'portal',
        visitor: contact,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(data.error || `Support unreachable (${res.status})`)
    }
    return data
  }

  const send = async (overrideText = undefined, options = undefined) => {
    const text = (typeof overrideText === 'string' ? overrideText : input).trim()
    if (!text || sending) return
    const activeSupport = supportSession?.conversationId && supportSession.status !== 'resolved' && supportSession.status !== 'closed'
    const visitor = options?.visitor || contact
    if (!activeSupport && (!visitor?.name || !visitor?.email) && (options?.requestAgent || looksLikeHumanRequest(text))) {
      setPendingHuman(true)
      setError(null)
      return
    }

    const localUserTurn = { role: 'user', content: text, ts: Date.now() }
    let next = [...history, localUserTurn]
    setHistory(next)
    setInput('')
    setSending(true)
    setError(null)

    try {
      if (supportSession?.conversationId && supportSession.status !== 'resolved' && supportSession.status !== 'closed') {
        // Active live-support session — send through support-saas.
        const data = await sendToSupport(text, supportSession)
        if (Array.isArray(data.messages)) {
          setHistory(prev => mergeRemoteMessages(prev, data.messages))
        }
        setSupportSession(prev => prev ? {
          ...prev,
          status: data.conversation?.status ?? prev.status,
          queue: data.queue ?? prev.queue,
        } : prev)
        return
      }

      const data = await sendToYara(next, options)

      if (data.handoff?.conversationId) {
        const session = {
          conversationId: data.handoff.conversationId,
          status: data.handoff.status || 'waiting_for_agent',
          queue: data.handoff.queue || null,
          apiUrl: data.handoff.apiUrl || SUPPORT_API_DEFAULT,
          openedAt: Date.now(),
        }
        setSupportSession(session)
        const reply = data.reply || "I'm connecting you to a live support agent."
        setHistory(prev => [...prev, { role: 'system', content: reply, ts: Date.now() }])
      } else if (data.reply) {
        setHistory(prev => [...prev, { role: 'assistant', content: data.reply, ts: Date.now() }])
      }
    } catch (e) {
      setError(e.message || 'Something went wrong.')
    } finally {
      setSending(false)
    }
  }

  const requestHumanSupport = () => {
    if (sending) return
    if (!contact?.name || !contact?.email) {
      setPendingHuman(true)
      return
    }
    if (supportSession?.status === 'resolved' || supportSession?.status === 'closed') {
      setSupportSession(null)
    }
    const userMessage = "I'd like to talk to a human support agent."
    send(userMessage, { requestAgent: true })
  }

  const saveContactAndContinue = e => {
    e.preventDefault()
    const next = { name: contactDraft.name.trim(), email: contactDraft.email.trim() }
    if (!next.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.email)) {
      setError('Please enter your name and a valid email before starting live support.')
      return
    }
    setContact(next)
    setPendingHuman(false)
    setError(null)
    setTimeout(() => {
      const userMessage = "I'd like to talk to a human support agent."
      send(userMessage, { requestAgent: true, visitor: next })
    }, 0)
  }

  const reset = () => {
    setHistory([])
    setSupportSession(null)
    setError(null)
    setPendingHuman(false)
  }

  const visibleHistory = history.length > 0
    ? history
    : [{ role: 'assistant', content: GREETING, ts: 0 }]

  const inLiveSession =
    Boolean(supportSession?.conversationId) &&
    supportSession.status !== 'resolved' &&
    supportSession.status !== 'closed'

  const messageNodes = React.useMemo(() => {
    const result: React.ReactNode[] = []
    for (let i = 0; i < visibleHistory.length; i++) {
      const m = visibleHistory[i]
      const prev = visibleHistory[i - 1]
      const next = visibleHistory[i + 1]
      const ts = m.ts || 0
      const prevTs = prev?.ts || 0
      const nextTs = next?.ts || 0
      const showDate = !prev || !sameDay(new Date(ts), new Date(prevTs))
      if (showDate && ts > 0) {
        result.push(
          <div key={`date-${i}`} style={{ display: 'flex', justifyContent: 'center', margin: '10px 0' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', background: 'rgba(0,0,0,0.06)', padding: '4px 12px', borderRadius: 999, letterSpacing: '.02em' }}>
              {dateLabel(new Date(ts))}
            </span>
          </div>
        )
      }
      if (m.role === 'system') {
        result.push(
          <div key={`sys-${i}`} style={{ display: 'flex', justifyContent: 'center', margin: '8px 0' }}>
            <div style={{ maxWidth: '85%', background: '#F3F4F6', border: '1px solid #E5E7EB', borderRadius: 999, padding: '6px 14px', color: '#6B7280', fontSize: 12, textAlign: 'center', fontWeight: 600 }}>
              {m.content}
            </div>
          </div>
        )
        continue
      }
      const mine = m.role === 'user'
      const prevMine = prev ? prev.role === 'user' : null
      const nextMine = next ? next.role === 'user' : null
      const isFirstInGroup = prevMine !== mine
      const isLastInGroup = nextMine !== mine
      const label = m.role === 'agent' ? (m.senderName ? `${m.senderName} · Support` : 'Support team') : m.role === 'assistant' ? 'Yara' : null
      result.push(
        <div key={i}>
          {label && isFirstInGroup && (
            <div style={{ fontSize: 10, color: '#9CA3AF', marginBottom: 3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: mine ? 'right' : 'left', paddingRight: mine ? 4 : 0, paddingLeft: mine ? 0 : 4 }}>
              {label}
            </div>
          )}
          <MessageBubble
            mine={mine}
            isFirstInGroup={isFirstInGroup}
            isLastInGroup={isLastInGroup}
            timestamp={ts > 0 ? new Date(ts).toISOString() : null}
            body={m.content}
          />
        </div>
      )
    }
    if (sending) {
      result.push(
        <div key="typing" style={{ display: 'flex', justifyContent: 'flex-start' }}>
          <div style={{ padding: '10px 14px', borderRadius: 12, background: '#F3F4F6', border: '1px solid #E5E7EB', color: '#6B7280', fontSize: 13, display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <Dot delay={0} />
            <Dot delay={150} />
            <Dot delay={300} />
          </div>
        </div>
      )
    }
    if (error) {
      result.push(
        <div key="error" style={{ fontSize: 12, color: styles.red, background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)', borderRadius: 10, padding: '8px 12px', alignSelf: 'flex-start', maxWidth: '90%' }}>
          {error}
        </div>
      )
    }
    return result
  }, [visibleHistory, sending, error])

  const header = (
    <div style={{ padding: '14px 16px', borderBottom: `1px solid ${styles.border}`, background: styles.bubbleBg, color: styles.bubbleText, display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14 }}>
        {inLiveSession ? '🛟' : 'Y'}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{inLiveSession ? 'Live support' : 'Yara · YouSafe assistant'}</div>
        <div style={{ fontSize: 11, opacity: 0.85 }}>{statusLabel(supportSession)}</div>
      </div>
      <button type="button" onClick={reset} title="Start a new conversation" style={{ background: 'rgba(255,255,255,0.12)', border: 'none', color: styles.bubbleText, cursor: 'pointer', fontSize: 11, fontWeight: 600, padding: '6px 10px', borderRadius: 8 }}>Reset</button>
      <button type="button" onClick={() => setOpen(false)} title="Minimize chat" style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: 'rgba(255,255,255,0.12)', color: '#fff', cursor: 'pointer', fontWeight: 800 }}>−</button>
      <button type="button" onClick={() => setMaximized(v => !v)} title={maximized ? 'Restore chat' : 'Maximize chat'} style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: 'rgba(255,255,255,0.12)', color: '#fff', cursor: 'pointer', fontWeight: 800 }}>{maximized ? '▣' : '□'}</button>
      <button type="button" onClick={() => setOpen(false)} title="Close chat" style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: 'rgba(255,255,255,0.12)', color: '#fff', cursor: 'pointer', fontWeight: 800 }}>×</button>
    </div>
  )

  const composer = (
    <div style={{ borderTop: `1px solid ${styles.border}`, padding: '10px 12px', background: styles.panelBg }}>
      {!inLiveSession && (
        <div style={{ padding: '0 0 8px', display: 'flex', justifyContent: 'center' }}>
          <button
            type="button"
            onClick={requestHumanSupport}
            disabled={sending}
            style={{ background: 'transparent', border: `1px dashed ${styles.border2}`, borderRadius: 999, padding: '5px 14px', cursor: sending ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600, color: styles.bubbleBg, fontFamily: 'inherit', opacity: sending ? 0.6 : 1 }}
          >
            Talk to a human →
          </button>
        </div>
      )}
      {pendingHuman && !inLiveSession && (
        <form onSubmit={saveContactAndContinue} style={{ margin: '0 0 10px', padding: '12px', border: `1px solid ${styles.border}`, borderRadius: 12, background: '#fff', display: 'grid', gap: 8 }}>
          <div style={{ fontSize: 12, color: styles.textMuted, fontWeight: 700 }}>Before live support</div>
          <input value={contactDraft.name} onChange={e => setContactDraft(d => ({ ...d, name: e.target.value }))} placeholder="Your name" style={{ padding: '9px 10px', border: `1px solid ${styles.border2}`, borderRadius: 8, font: 'inherit', fontSize: 14 }} />
          <input value={contactDraft.email} onChange={e => setContactDraft(d => ({ ...d, email: e.target.value }))} placeholder="Email address" type="email" style={{ padding: '9px 10px', border: `1px solid ${styles.border2}`, borderRadius: 8, font: 'inherit', fontSize: 14 }} />
          <button type="submit" style={{ height: 34, border: 'none', borderRadius: 8, background: styles.bubbleBg, color: '#fff', fontWeight: 800, cursor: 'pointer' }}>Start live conversation</button>
        </form>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <AutoGrowInput
          value={input}
          onChange={setInput}
          onSubmit={() => send()}
          disabled={sending}
          placeholder={inLiveSession ? 'Message support…' : 'Type a message…'}
        />
        <button
          type="button"
          onClick={() => send()}
          disabled={sending || input.trim().length === 0}
          style={{ height: 38, padding: '0 14px', background: styles.bubbleBg, color: styles.bubbleText, border: 'none', borderRadius: 10, cursor: sending || input.trim().length === 0 ? 'not-allowed' : 'pointer', opacity: sending || input.trim().length === 0 ? 0.5 : 1, fontWeight: 700, fontSize: 13 }}
        >
          Send
        </button>
      </div>
    </div>
  )

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={open ? 'Close chat' : 'Open chat'}
        style={{
          position: 'fixed',
          right: '20px',
          bottom: '20px',
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          background: styles.bubbleBg,
          color: styles.bubbleText,
          border: 'none',
          cursor: 'pointer',
          boxShadow: '0 12px 28px rgba(15,23,42,0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '24px',
          zIndex: 9998,
          transition: 'background 0.15s, transform 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = styles.bubbleBgHover }}
        onMouseLeave={e => { e.currentTarget.style.background = styles.bubbleBg }}
      >
        {open ? '×' : '💬'}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="YouSafe assistant"
          style={{
            position: 'fixed',
            right: maximized ? '20px' : '20px',
            bottom: maximized ? '20px' : '88px',
            width: maximized ? 'min(760px, calc(100vw - 40px))' : 'min(380px, calc(100vw - 40px))',
            height: maximized ? 'min(760px, calc(100vh - 40px))' : 'min(540px, calc(100vh - 120px))',
            background: styles.panelBg,
            border: `1px solid ${styles.panelBorder}`,
            borderRadius: '16px',
            boxShadow: '0 24px 64px rgba(15,23,42,0.22)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            zIndex: 9998,
            fontFamily: 'inherit',
          }}
        >
          <ChatScreen mode="panel" header={header} messages={messageNodes} composer={composer} />
        </div>
      )}
      <style>{`
        @keyframes yarapulse {
          0%, 60%, 100% { opacity: 0.25; transform: translateY(0); }
          30% { opacity: 1; transform: translateY(-2px); }
        }
      `}</style>
    </>
  )
}

function Dot({ delay }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: '6px',
        height: '6px',
        borderRadius: '50%',
        background: '#9CA3AF',
        animation: `yarapulse 1.2s ease-in-out ${delay}ms infinite`,
      }}
    />
  )
}

/**
 * Merges support-saas messages (which may include AI/agent/system replies the
 * user didn't see locally yet) into the widget's local history. We dedupe on
 * the support-saas message id and only append messages strictly newer than
 * what we already have.
 */
function mergeRemoteMessages(local, remote) {
  if (!Array.isArray(remote) || remote.length === 0) return local
  const seenIds = new Set(local.map(m => m.id).filter(Boolean))
  const lastTs = local.reduce((acc, m) => (m.ts && m.ts > acc ? m.ts : acc), 0)
  const additions = []
  for (const r of remote) {
    if (!r || !r.id || seenIds.has(r.id)) continue
    const ts = r.created_at ? new Date(r.created_at).getTime() : Date.now()
    if (ts <= lastTs) continue
    const role = remoteRoleToLocal(r.sender_type)
    if (!role) continue
    if (role === 'user') continue // visitor messages are already in local history
    additions.push({
      id: r.id,
      role,
      content: r.body || '',
      senderName: r.sender_name || null,
      ts,
    })
  }
  if (additions.length === 0) return local
  return [...local, ...additions]
}

function remoteRoleToLocal(senderType) {
  if (senderType === 'visitor') return 'user'
  if (senderType === 'agent') return 'agent'
  if (senderType === 'system') return 'system'
  if (senderType === 'ai') return 'assistant'
  return null
}
