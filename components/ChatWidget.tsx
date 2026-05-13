// @ts-nocheck
'use client'

import React from 'react'

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
  userBubble: '#3C3B6E',
  userBubbleText: '#FFFFFF',
  assistantBubble: '#F3F4F6',
  assistantBubbleText: '#111827',
  systemBubble: '#FEF3C7',
  systemBubbleText: '#78350F',
  agentBubble: '#DCFCE7',
  agentBubbleText: '#14532D',
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

function bubbleStylesFor(role) {
  if (role === 'user') {
    return { background: styles.userBubble, color: styles.userBubbleText, border: 'none' }
  }
  if (role === 'system') {
    return { background: styles.systemBubble, color: styles.systemBubbleText, border: '1px solid #FCD34D' }
  }
  if (role === 'agent') {
    return { background: styles.agentBubble, color: styles.agentBubbleText, border: '1px solid #86EFAC' }
  }
  return { background: styles.assistantBubble, color: styles.assistantBubbleText, border: `1px solid ${styles.border}` }
}

function senderLabel(role, name) {
  if (role === 'user') return null
  if (role === 'agent') return name ? `${name} · Support` : 'Support team'
  if (role === 'system') return 'YouSafe'
  return 'Yara'
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
  const scrollRef = React.useRef(null)
  const inputRef = React.useRef(null)

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

  React.useEffect(() => {
    if (!open) return
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
    if (inputRef.current) inputRef.current.focus()
  }, [open, history.length, sending])

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

  const onKeyDown = e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const visibleHistory = history.length > 0
    ? history
    : [{ role: 'assistant', content: GREETING, ts: 0 }]

  const inLiveSession =
    Boolean(supportSession?.conversationId) &&
    supportSession.status !== 'resolved' &&
    supportSession.status !== 'closed'

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
            height: maximized ? 'min(760px, calc(100vh - 40px))' : 'min(580px, calc(100vh - 120px))',
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
          <div
            style={{
              padding: '14px 16px',
              borderBottom: `1px solid ${styles.border}`,
              background: styles.bubbleBg,
              color: styles.bubbleText,
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.18)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: '14px',
              }}
            >
              {inLiveSession ? '🛟' : 'Y'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '14px', fontWeight: 700 }}>
                {inLiveSession ? 'Live support' : 'Yara · YouSafe assistant'}
              </div>
              <div style={{ fontSize: '11px', opacity: 0.85 }}>{statusLabel(supportSession)}</div>
            </div>
            <button
              type="button"
              onClick={reset}
              title="Start a new conversation"
              style={{
                background: 'rgba(255,255,255,0.12)',
                border: 'none',
                color: styles.bubbleText,
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: 600,
                padding: '6px 10px',
                borderRadius: '8px',
              }}
            >
              Reset
            </button>
            <button type="button" onClick={() => setOpen(false)} title="Minimize chat" style={{ width: '28px', height: '28px', borderRadius: '8px', border: 'none', background: 'rgba(255,255,255,0.12)', color: '#fff', cursor: 'pointer', fontWeight: 800 }}>−</button>
            <button type="button" onClick={() => setMaximized(v => !v)} title={maximized ? 'Restore chat' : 'Maximize chat'} style={{ width: '28px', height: '28px', borderRadius: '8px', border: 'none', background: 'rgba(255,255,255,0.12)', color: '#fff', cursor: 'pointer', fontWeight: 800 }}>{maximized ? '▣' : '□'}</button>
            <button type="button" onClick={() => setOpen(false)} title="Close chat" style={{ width: '28px', height: '28px', borderRadius: '8px', border: 'none', background: 'rgba(255,255,255,0.12)', color: '#fff', cursor: 'pointer', fontWeight: 800 }}>×</button>
          </div>

          <div
            ref={scrollRef}
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '16px',
              background: styles.surface2,
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            {visibleHistory.map((m, i) => {
              const role = m.role
              const bubble = bubbleStylesFor(role)
              const align = role === 'user' ? 'flex-end' : 'flex-start'
              const label = senderLabel(role, m.senderName)
              return (
                <div key={m.id || i} style={{ display: 'flex', justifyContent: align, flexDirection: 'column', alignItems: align }}>
                  {label && (
                    <div style={{ fontSize: '10px', color: styles.textDim, marginBottom: '3px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
                  )}
                  <div
                    style={{
                      maxWidth: '82%',
                      padding: '10px 13px',
                      borderRadius: '12px',
                      fontSize: '14px',
                      lineHeight: 1.5,
                      whiteSpace: 'pre-wrap',
                      ...bubble,
                    }}
                  >
                    {m.content}
                  </div>
                </div>
              )
            })}
            {sending && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: '12px',
                    background: styles.assistantBubble,
                    border: `1px solid ${styles.border}`,
                    color: styles.textMuted,
                    fontSize: '13px',
                    display: 'inline-flex',
                    gap: '6px',
                    alignItems: 'center',
                  }}
                >
                  <Dot delay={0} />
                  <Dot delay={150} />
                  <Dot delay={300} />
                </div>
              </div>
            )}
            {error && (
              <div
                style={{
                  fontSize: '12px',
                  color: styles.red,
                  background: 'rgba(220,38,38,0.08)',
                  border: '1px solid rgba(220,38,38,0.25)',
                  borderRadius: '10px',
                  padding: '8px 12px',
                  alignSelf: 'flex-start',
                  maxWidth: '90%',
                }}
              >
                {error}
              </div>
            )}
          </div>

          {!inLiveSession && (
            <div style={{ padding: '8px 12px 0', display: 'flex', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={requestHumanSupport}
                disabled={sending}
                style={{
                  background: 'transparent',
                  border: `1px dashed ${styles.border2}`,
                  borderRadius: '999px',
                  padding: '5px 14px',
                  cursor: sending ? 'not-allowed' : 'pointer',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: styles.bubbleBg,
                  fontFamily: 'inherit',
                  opacity: sending ? 0.6 : 1,
                }}
              >
                Talk to a human →
              </button>
            </div>
          )}

          {pendingHuman && !inLiveSession && (
            <form onSubmit={saveContactAndContinue} style={{ margin: '10px 12px 0', padding: '12px', border: `1px solid ${styles.border}`, borderRadius: '12px', background: '#fff', display: 'grid', gap: '8px' }}>
              <div style={{ fontSize: '12px', color: styles.textMuted, fontWeight: 700 }}>Before live support</div>
              <input value={contactDraft.name} onChange={e => setContactDraft(d => ({ ...d, name: e.target.value }))} placeholder="Your name" style={{ padding: '9px 10px', border: `1px solid ${styles.border2}`, borderRadius: '8px', font: 'inherit', fontSize: '14px' }} />
              <input value={contactDraft.email} onChange={e => setContactDraft(d => ({ ...d, email: e.target.value }))} placeholder="Email address" type="email" style={{ padding: '9px 10px', border: `1px solid ${styles.border2}`, borderRadius: '8px', font: 'inherit', fontSize: '14px' }} />
              <button type="submit" style={{ height: '34px', border: 'none', borderRadius: '8px', background: styles.bubbleBg, color: '#fff', fontWeight: 800, cursor: 'pointer' }}>Start live conversation</button>
            </form>
          )}

          <div
            style={{
              borderTop: `1px solid ${styles.border}`,
              padding: '10px 12px',
              background: styles.panelBg,
              display: 'flex',
              gap: '8px',
              alignItems: 'flex-end',
            }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={inLiveSession ? 'Message support…' : 'Type a message…'}
              rows={1}
              disabled={sending}
              style={{
                flex: 1,
                resize: 'none',
                maxHeight: '120px',
                minHeight: '38px',
                border: `1px solid ${styles.border2}`,
                borderRadius: '10px',
                padding: '9px 12px',
                fontSize: '14px',
                fontFamily: 'inherit',
                outline: 'none',
                background: '#fff',
                color: '#111827',
                lineHeight: 1.4,
              }}
            />
            <button
              type="button"
              onClick={() => send()}
              disabled={sending || input.trim().length === 0}
              style={{
                height: '38px',
                padding: '0 14px',
                background: styles.bubbleBg,
                color: styles.bubbleText,
                border: 'none',
                borderRadius: '10px',
                cursor: sending || input.trim().length === 0 ? 'not-allowed' : 'pointer',
                opacity: sending || input.trim().length === 0 ? 0.5 : 1,
                fontWeight: 700,
                fontSize: '13px',
              }}
            >
              Send
            </button>
          </div>
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
