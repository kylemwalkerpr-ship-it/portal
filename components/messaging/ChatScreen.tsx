'use client'

import React from 'react'

const CHAT_BG = '#ECE7DF'

export type ChatScreenMode = 'fill' | 'panel' | 'split'

export interface ChatScreenProps {
  header: React.ReactNode
  messages: React.ReactNode
  composer: React.ReactNode
  banner?: React.ReactNode
  sidebar?: React.ReactNode
  mode?: ChatScreenMode
  unreadDivider?: { afterMessageId: string } | null
  className?: string
  style?: React.CSSProperties
}

export default function ChatScreen({
  header,
  messages,
  composer,
  banner,
  sidebar,
  mode = 'fill',
  unreadDivider,
  className,
  style,
}: ChatScreenProps) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const messagesRef = React.useRef<HTMLDivElement>(null)
  const [showNewMessagePill, setShowNewMessagePill] = React.useState(false)
  const nearBottomRef = React.useRef(true)
  const lastScrollHeightRef = React.useRef(0)

  // Dev guard: warn if parent height is non-deterministic
  React.useEffect(() => {
    const parent = containerRef.current?.parentElement
    if (!parent) return
    const cs = getComputedStyle(parent)
    if (process.env.NODE_ENV !== 'production' && (cs.height === 'auto' || parent.clientHeight < 200)) {
      // eslint-disable-next-line no-console
      console.warn(
        '[ChatScreen] Parent has non-deterministic height; chat will not scroll correctly. Set the parent height explicitly.'
      )
    }
  }, [])

  // Auto-scroll
  React.useEffect(() => {
    const el = messagesRef.current
    if (!el) return
    const scrollHeight = el.scrollHeight
    const clientHeight = el.clientHeight
    const scrollTop = el.scrollTop

    // If user was near bottom before content changed, scroll to bottom
    if (nearBottomRef.current || scrollHeight <= clientHeight) {
      el.scrollTop = scrollHeight
      setShowNewMessagePill(false)
    } else if (scrollHeight > lastScrollHeightRef.current) {
      setShowNewMessagePill(true)
    }

    lastScrollHeightRef.current = scrollHeight
  }, [messages])

  const handleScroll = React.useCallback(() => {
    const el = messagesRef.current
    if (!el) return
    const threshold = 120
    nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold
    if (nearBottomRef.current) {
      setShowNewMessagePill(false)
    }
  }, [])

  const scrollToBottom = React.useCallback(() => {
    const el = messagesRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
    nearBottomRef.current = true
    setShowNewMessagePill(false)
  }, [])

  const isSplit = mode === 'split' && sidebar

  const chatRegion = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        overflow: 'hidden',
        background: CHAT_BG,
      }}
    >
      {/* Header */}
      <div style={{ flexShrink: 0 }}>{header}</div>

      {/* Banner */}
      {banner && <div style={{ flexShrink: 0 }}>{banner}</div>}

      {/* Messages */}
      <div
        ref={messagesRef}
        onScroll={handleScroll}
        style={{
          flex: '1 1 auto',
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          position: 'relative',
        }}
      >
        <div style={{ maxWidth: 760, margin: '0 auto', padding: '14px 18px' }}>
          {messages}
        </div>
        {showNewMessagePill && (
          <button
            onClick={scrollToBottom}
            style={{
              position: 'sticky',
              bottom: 12,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 10,
              background: '#1B2D4F',
              color: '#fff',
              border: 'none',
              borderRadius: 999,
              padding: '6px 14px',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            }}
          >
            ↓ New message
          </button>
        )}
      </div>

      {/* Composer */}
      <div style={{ flexShrink: 0 }}>{composer}</div>
    </div>
  )

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        display: 'flex',
        flexDirection: isSplit ? 'row' : 'column',
        height: '100%',
        overflow: 'hidden',
        ...style,
      }}
    >
      {isSplit && (
        <div
          style={{
            width: 340,
            flexShrink: 0,
            borderRight: '1px solid #DDD8CE',
            overflowY: 'auto',
            background: '#fff',
          }}
        >
          {sidebar}
        </div>
      )}
      {chatRegion}
    </div>
  )
}
