'use client'
// @ts-nocheck

import React from 'react'

const STORAGE_KEY = 'yousafe.chat.history.v1'
const OPEN_KEY = 'yousafe.chat.open.v1'
const MAX_PERSISTED = 30

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
  red: '#DC2626',
}

const GREETING = "Hi! I'm Yara, the YouSafe assistant. I can answer questions about services, payments, refunds, document uploads, or how the portal works. What can I help you with?"

function loadHistory() {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.slice(-MAX_PERSISTED) : []
  } catch {
    return []
  }
}

function saveHistory(history) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-MAX_PERSISTED)))
  } catch {
    /* localStorage may be disabled — non-fatal */
  }
}

function loadOpen() {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(OPEN_KEY) === '1'
  } catch {
    return false
  }
}

function saveOpen(open) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(OPEN_KEY, open ? '1' : '0')
  } catch {
    /* ignore */
  }
}

export default function ChatWidget() {
  const [open, setOpen] = React.useState(false)
  const [history, setHistory] = React.useState([])
  const [input, setInput] = React.useState('')
  const [sending, setSending] = React.useState(false)
  const [error, setError] = React.useState(null)
  const [hydrated, setHydrated] = React.useState(false)
  const scrollRef = React.useRef(null)
  const inputRef = React.useRef(null)

  React.useEffect(() => {
    setHistory(loadHistory())
    setOpen(loadOpen())
    setHydrated(true)
  }, [])

  React.useEffect(() => {
    if (hydrated) saveHistory(history)
  }, [history, hydrated])

  React.useEffect(() => {
    if (hydrated) saveOpen(open)
  }, [open, hydrated])

  React.useEffect(() => {
    if (!open) return
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
    if (inputRef.current) inputRef.current.focus()
  }, [open, history.length, sending])

  const send = async () => {
    const text = input.trim()
    if (!text || sending) return

    const userTurn = { role: 'user', content: text, ts: Date.now() }
    const next = [...history, userTurn]
    setHistory(next)
    setInput('')
    setSending(true)
    setError(null)

    try {
      const apiHistory = next.map(m => ({ role: m.role, content: m.content }))
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiHistory }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.reply) {
        throw new Error(data.error || `Assistant unreachable (${res.status})`)
      }
      setHistory(prev => [...prev, { role: 'assistant', content: data.reply, ts: Date.now() }])
    } catch (e) {
      setError(e.message || 'Something went wrong.')
    } finally {
      setSending(false)
    }
  }

  const reset = () => {
    setHistory([])
    setError(null)
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

  return (
    <>
      {/* Floating launcher */}
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
            right: '20px',
            bottom: '88px',
            width: 'min(380px, calc(100vw - 40px))',
            height: 'min(560px, calc(100vh - 120px))',
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
          {/* Header */}
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
              Y
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '14px', fontWeight: 700 }}>Yara · YouSafe assistant</div>
              <div style={{ fontSize: '11px', opacity: 0.85 }}>Replies in seconds · powered by AI</div>
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
          </div>

          {/* Messages */}
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
            {visibleHistory.map((m, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                <div
                  style={{
                    maxWidth: '82%',
                    padding: '10px 13px',
                    borderRadius: '12px',
                    fontSize: '14px',
                    lineHeight: 1.5,
                    whiteSpace: 'pre-wrap',
                    background: m.role === 'user' ? styles.userBubble : styles.assistantBubble,
                    color: m.role === 'user' ? styles.userBubbleText : styles.assistantBubbleText,
                    border: m.role === 'user' ? 'none' : `1px solid ${styles.border}`,
                  }}
                >
                  {m.content}
                </div>
              </div>
            ))}
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

          {/* Composer */}
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
              placeholder="Type a message…"
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
              onClick={send}
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
