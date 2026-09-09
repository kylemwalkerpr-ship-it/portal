'use client'

import React from 'react'
import {
  isSwipeBackStart,
  shouldCommitSwipeBack,
  shouldLockSwipeBack,
} from '@/lib/messaging/swipeBack'
import { isMessengerMobileViewport } from '@/lib/messaging/threadUrl'

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
  /**
   * Mobile pane toggle. When true and viewport ≤680px, the chat region
   * fills the screen and the sidebar is hidden. When false (or when no
   * conversation is selected), the sidebar fills the screen and the
   * chat region is hidden. At >680px both panes render side-by-side.
   */
  mobileShowChat?: boolean
  /**
   * WhatsApp-style interactive back. Called when a rightward left-edge
   * swipe on a phone commits, matching the in-app Back chevron.
   */
  onMobileBack?: () => void
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
  mobileShowChat = false,
  onMobileBack,
}: ChatScreenProps) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const chatPaneRef = React.useRef<HTMLDivElement>(null)
  const messagesRef = React.useRef<HTMLDivElement>(null)
  const [showNewMessagePill, setShowNewMessagePill] = React.useState(false)
  const nearBottomRef = React.useRef(true)
  const lastScrollHeightRef = React.useRef(0)
  const activatedDeepLinkThreadRef = React.useRef<string | null>(null)
  const previousMobileShowChatRef = React.useRef(mobileShowChat)
  const swipeRef = React.useRef({
    pointerId: null as number | null,
    startX: 0,
    startY: 0,
    dx: 0,
    locked: false,
    lastX: 0,
    lastT: 0,
    vx: 0,
  })
  const onMobileBackRef = React.useRef(onMobileBack)
  onMobileBackRef.current = onMobileBack

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

  const resetSwipeTransform = React.useCallback((commit: boolean) => {
    const pane = chatPaneRef.current
    const width = containerRef.current?.clientWidth || 0
    if (!pane) return
    pane.style.transition = 'transform 180ms ease-out'
    pane.style.transform = commit && width ? `translate3d(${width}px,0,0)` : 'translate3d(0,0,0)'
  }, [])

  const clearSwipeDrag = React.useCallback(() => {
    containerRef.current?.removeAttribute('data-swipe-dragging')
    const pane = chatPaneRef.current
    if (!pane) return
    const finish = () => {
      pane.style.transition = ''
      pane.style.transform = ''
    }
    pane.addEventListener('transitionend', finish, { once: true })
    window.setTimeout(finish, 220)
  }, [])

  const handleSwipePointerDown = React.useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (!onMobileBackRef.current) return
    if (!isMessengerMobileViewport()) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    if (!isSwipeBackStart(event.clientX - rect.left)) return
    swipeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      dx: 0,
      locked: false,
      lastX: event.clientX,
      lastT: event.timeStamp,
      vx: 0,
    }
  }, [])

  const handleSwipePointerMove = React.useCallback((event: React.PointerEvent<HTMLElement>) => {
    const swipe = swipeRef.current
    if (swipe.pointerId !== event.pointerId) return
    const dx = event.clientX - swipe.startX
    const dy = event.clientY - swipe.startY
    if (!swipe.locked) {
      const lock = shouldLockSwipeBack(dx, dy)
      if (lock === false) return
      if (lock === 'abort') {
        swipe.pointerId = null
        return
      }
      swipe.locked = true
      try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* Safari */ }
      containerRef.current?.setAttribute('data-swipe-dragging', 'true')
      const pane = chatPaneRef.current
      if (pane) pane.style.transition = 'none'
    }
    const dt = Math.max(1, event.timeStamp - swipe.lastT)
    swipe.vx = (event.clientX - swipe.lastX) / dt
    swipe.lastX = event.clientX
    swipe.lastT = event.timeStamp
    swipe.dx = Math.max(0, dx)
    const pane = chatPaneRef.current
    if (pane) pane.style.transform = `translate3d(${swipe.dx}px,0,0)`
  }, [])

  const handleSwipePointerUp = React.useCallback((event: React.PointerEvent<HTMLElement>) => {
    const swipe = swipeRef.current
    if (swipe.pointerId !== event.pointerId) return
    swipe.pointerId = null
    if (!swipe.locked) return
    const width = containerRef.current?.clientWidth || 0
    const commit = shouldCommitSwipeBack(swipe.dx, swipe.vx, width)
    resetSwipeTransform(commit)
    if (commit) {
      window.setTimeout(() => {
        clearSwipeDrag()
        onMobileBackRef.current?.()
      }, 160)
      return
    }
    clearSwipeDrag()
  }, [clearSwipeDrag, resetSwipeTransform])

  React.useEffect(() => {
    if (mobileShowChat) return
    const pane = chatPaneRef.current
    if (pane) {
      pane.style.transition = ''
      pane.style.transform = ''
    }
    containerRef.current?.removeAttribute('data-swipe-dragging')
    swipeRef.current.pointerId = null
    swipeRef.current.locked = false
  }, [mobileShowChat])

  // WhatsApp-like auto-scroll: if the reader is already at the conversation
  // tail, keep the newest reply in view. If they deliberately scrolled up,
  // never yank the viewport; surface the persistent New message control.
  React.useEffect(() => {
    const el = messagesRef.current
    if (!el) return
    const scrollHeight = el.scrollHeight
    const clientHeight = el.clientHeight
    const scrollTop = el.scrollTop

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
    if (nearBottomRef.current) setShowNewMessagePill(false)
  }, [])

  const scrollToBottom = React.useCallback(() => {
    const el = messagesRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
    nearBottomRef.current = true
    setShowNewMessagePill(false)
  }, [])

  const isSplit = mode === 'split' && sidebar
  const swipeBackEnabled = Boolean(isSplit && mobileShowChat && onMobileBack)

  // A dashboard URL such as ?page=messages&thread=<id> already gives
  // UnifiedInbox the correct active conversation. The inbox now opens the
  // mobile chat pane from that param on mount, but a thread can also appear
  // after mount (marketplace "Open in Messages" while already on Messages).
  // Promote the already-selected row through the inbox's normal click path
  // once it appears so the in-app Back control keeps working.
  //
  // This intentionally runs only for a new deep-link thread value.
  React.useEffect(() => {
    if (!isSplit || mobileShowChat || typeof window === 'undefined') return
    if (!window.matchMedia?.('(max-width: 680px)').matches) return

    const threadId = new URLSearchParams(window.location.search).get('thread')
    if (!threadId || activatedDeepLinkThreadRef.current === threadId) return

    const activeRow = containerRef.current?.querySelector<HTMLButtonElement>(
      '.ys-chatscreen-sidebar button.row.on',
    )
    if (!activeRow) return

    activatedDeepLinkThreadRef.current = threadId
    activeRow.click()
  }, [isSplit, mobileShowChat, sidebar])

  // Keep URL + visual state aligned when the in-app mobile Back button moves
  // from a thread to the conversation list. UnifiedInbox intentionally keeps
  // activeId so the selected row can remain highlighted on desktop, but on a
  // phone a stale ?thread= deep-link should not survive once the list is the
  // visible pane. Clearing it prevents a remount or browser restore from
  // immediately promoting the same thread again and keeps list mode stable.
  React.useEffect(() => {
    const wasShowingChat = previousMobileShowChatRef.current
    previousMobileShowChatRef.current = mobileShowChat

    if (!isSplit || typeof window === 'undefined') return
    if (!wasShowingChat || mobileShowChat) return
    if (!window.matchMedia?.('(max-width: 680px)').matches) return

    try {
      const url = new URL(window.location.href)
      if (url.searchParams.has('thread')) {
        url.searchParams.delete('thread')
        window.history.replaceState({}, '', url)
      }
    } catch {
      // The pane state is still authoritative even if URL cleanup fails.
    }

    // A list restored from a long thread should start from a deterministic
    // position rather than inheriting any browser scroll restoration artifact.
    const sidebarEl = containerRef.current?.querySelector<HTMLElement>('.ys-chatscreen-sidebar')
    if (sidebarEl) sidebarEl.scrollTop = 0
  }, [isSplit, mobileShowChat])

  const chatRegion = (
    <div
      ref={chatPaneRef}
      className="ys-chatscreen-chat"
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        overflow: 'hidden',
        background: 'var(--chat-bg)',
        position: 'relative',
      }}
    >
      {swipeBackEnabled && (
        <div
          className="ys-chatscreen-swipeback"
          data-swipe-back="true"
          aria-hidden="true"
          onPointerDown={handleSwipePointerDown}
          onPointerMove={handleSwipePointerMove}
          onPointerUp={handleSwipePointerUp}
          onPointerCancel={handleSwipePointerUp}
        />
      )}
      <div style={{ flexShrink: 0 }}>{header}</div>
      {banner && <div style={{ flexShrink: 0 }}>{banner}</div>}

      <div
        ref={messagesRef}
        onScroll={handleScroll}
        className="cv-body-bg"
        data-chat-canvas
        style={{
          flex: '1 1 0%',
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          position: 'relative',
          overscrollBehaviorY: 'contain',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <div className="cv-canvas-inner" style={{ padding: '14px 6px', position: 'relative', zIndex: 2 }}>
          {messages}
        </div>
        {showNewMessagePill && (
          <button
            type="button"
            className="ys-new-message-pill"
            aria-label="Jump to the newest message"
            onClick={scrollToBottom}
            style={{
              position: 'sticky',
              bottom: 12,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 10,
              background: '#0F172A',
              color: '#fff',
              border: 'none',
              borderRadius: 999,
              padding: '10px 14px',
              minHeight: 44,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(0, 0, 0, 0.18)',
            }}
          >
            ↓ New message
          </button>
        )}
        <span className="ys-live-message-announcer" aria-live="polite" aria-atomic="true">
          {showNewMessagePill ? 'A new message is available below.' : ''}
        </span>
      </div>

      <div className="ys-chatscreen-composer" style={{ flexShrink: 0 }}>{composer}</div>
    </div>
  )

  const wrapperClass = ['ys-chatscreen', className].filter(Boolean).join(' ')

  return (
    <div
      ref={containerRef}
      className={wrapperClass}
      data-mobile-view={isSplit ? (mobileShowChat ? 'chat' : 'list') : 'chat'}
      style={{
        display: 'flex',
        flexDirection: isSplit ? 'row' : 'column',
        height: '100%',
        minHeight: 0,
        minWidth: 0,
        overflow: 'hidden',
        ...style,
      }}
    >
      {isSplit && (
        <div
          className="ys-chatscreen-sidebar"
          style={{
            width: 340,
            flexShrink: 0,
            borderRight: '1px solid #DDD8CE',
            overflow: 'hidden',
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
