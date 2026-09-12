'use client'

import React from 'react'
import dynamic from 'next/dynamic'

const ChatSidePane = dynamic(() => import('@/components/marketplace/ChatSidePane'), { ssr: false })

const OPEN_EVENT = 'yousafe-open-order-dock-messenger'
const STORAGE_KEY = 'yousafe.orderMessengerDock.v1'

type DockMode = 'left' | 'right' | 'float'

type Counterpart = {
  id?: string | null
  full_name?: string | null
  avatar_url?: string | null
  role?: string | null
}

export function openOrderMessengerDock(orderId: string) {
  if (typeof window === 'undefined' || !orderId) return
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { orderId } }))
}

export default function OrderMessengerDock({
  orderId,
  counterpartProfileId,
  counterpartName,
  counterpartAvatar,
  serviceTitle,
}: {
  orderId: string
  counterpartProfileId?: string | null
  counterpartName?: string | null
  counterpartAvatar?: string | null
  serviceTitle?: string | null
}) {
  const [open, setOpen] = React.useState(false)
  const [dock, setDock] = React.useState<DockMode>('right')
  const [position, setPosition] = React.useState({ x: 80, y: 84 })
  const [resolved, setResolved] = React.useState<Counterpart | null>(null)
  const [resolving, setResolving] = React.useState(false)
  const dragRef = React.useRef<{
    pointerId: number
    offsetX: number
    offsetY: number
  } | null>(null)
  const windowRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}')
      if (saved?.dock === 'left' || saved?.dock === 'right' || saved?.dock === 'float') setDock(saved.dock)
      if (Number.isFinite(saved?.x) && Number.isFinite(saved?.y)) {
        setPosition({ x: Number(saved.x), y: Number(saved.y) })
      }
    } catch {}
  }, [])

  React.useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ dock, x: position.x, y: position.y }))
    } catch {}
  }, [dock, position])

  React.useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent)?.detail || {}
      if (detail.orderId && detail.orderId !== orderId) return
      setOpen(true)
    }
    window.addEventListener(OPEN_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_EVENT, onOpen)
  }, [orderId])

  React.useEffect(() => {
    if (!open || counterpartProfileId || resolved?.id || resolving) return
    let cancelled = false
    setResolving(true)
    fetch(`/api/orders/${encodeURIComponent(orderId)}/activity`, { credentials: 'same-origin', cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(payload?.error || 'Could not resolve order conversation.')
        return payload
      })
      .then((payload) => {
        if (!cancelled) setResolved(payload?.counterpart || null)
      })
      .catch(() => {
        if (!cancelled) setResolved(null)
      })
      .finally(() => {
        if (!cancelled) setResolving(false)
      })
    return () => { cancelled = true }
  }, [open, orderId, counterpartProfileId, resolved?.id, resolving])

  const clamp = React.useCallback((x: number, y: number) => {
    if (typeof window === 'undefined') return { x, y }
    const width = Math.min(440, Math.max(320, window.innerWidth - 32))
    const height = Math.min(700, Math.max(440, window.innerHeight - 32))
    return {
      x: Math.min(Math.max(12, x), Math.max(12, window.innerWidth - width - 12)),
      y: Math.min(Math.max(12, y), Math.max(12, window.innerHeight - height - 12)),
    }
  }, [])

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button')) return
    const node = windowRef.current
    if (!node) return
    const rect = node.getBoundingClientRect()
    const nextPos = clamp(rect.left, rect.top)
    setDock('float')
    setPosition(nextPos)
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    setPosition(clamp(event.clientX - drag.offsetX, event.clientY - drag.offsetY))
  }

  const stopDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null
  }

  React.useEffect(() => {
    if (!open || dock !== 'float') return
    const onResize = () => setPosition((prev) => clamp(prev.x, prev.y))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [open, dock, clamp])

  if (!open) return null

  const profileId = counterpartProfileId || resolved?.id || null
  const name = counterpartName || resolved?.full_name || (resolving ? 'Loading conversation…' : 'Order specialist')
  const avatar = counterpartAvatar || resolved?.avatar_url || null

  const frameStyle: React.CSSProperties = dock === 'float'
    ? {
        left: position.x,
        top: position.y,
        width: 'min(440px, calc(100vw - 24px))',
        height: 'min(700px, calc(100dvh - 24px))',
      }
    : dock === 'left'
      ? { left: 14, top: 76, bottom: 14, width: 'min(440px, calc(100vw - 28px))' }
      : { right: 14, top: 76, bottom: 14, width: 'min(440px, calc(100vw - 28px))' }

  return (
    <div
      ref={windowRef}
      className={`ys-order-messenger-window ys-order-messenger-${dock}`}
      data-dock={dock}
      style={frameStyle}
    >
      <style>{`
        .ys-order-messenger-window {
          position: fixed;
          z-index: 340;
          display: flex;
          flex-direction: column;
          min-width: 320px;
          min-height: 440px;
          overflow: hidden;
          border: 1px solid rgba(15,23,42,.16);
          border-radius: 16px;
          background: #fff;
          box-shadow: 0 28px 80px rgba(15,23,42,.28), 0 8px 24px rgba(15,23,42,.12);
        }
        .ys-order-messenger-float { resize: both; }
        .ys-order-messenger-toolbar {
          min-height: 42px;
          flex: 0 0 42px;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 0 8px 0 12px;
          background: #111827;
          color: #fff;
          cursor: grab;
          user-select: none;
          touch-action: none;
        }
        .ys-order-messenger-toolbar:active { cursor: grabbing; }
        .ys-order-messenger-grip { font-size: 15px; letter-spacing: 2px; opacity: .6; }
        .ys-order-messenger-title {
          min-width: 0;
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font: 700 12px/1.2 -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
        }
        .ys-order-messenger-controls { display: flex; align-items: center; gap: 4px; }
        .ys-order-messenger-controls button {
          width: 30px;
          height: 30px;
          display: grid;
          place-items: center;
          border: 1px solid rgba(255,255,255,.18);
          border-radius: 8px;
          background: rgba(255,255,255,.08);
          color: #fff;
          cursor: pointer;
          font-size: 14px;
        }
        .ys-order-messenger-controls button:hover,
        .ys-order-messenger-controls button:focus-visible {
          background: rgba(255,255,255,.18);
          outline: none;
        }
        .ys-order-messenger-slot { position: relative; flex: 1; min-height: 0; overflow: hidden; }
        .ys-order-messenger-slot .ys-gig-message-popover-shell {
          position: absolute !important;
          inset: 0 !important;
          z-index: 1 !important;
          pointer-events: none !important;
        }
        .ys-order-messenger-slot .ys-gig-message-popover-dismiss { display: none !important; }
        .ys-order-messenger-slot .ys-gig-message-popover {
          position: absolute !important;
          inset: 0 !important;
          left: 0 !important;
          top: 0 !important;
          right: 0 !important;
          bottom: 0 !important;
          width: 100% !important;
          height: 100% !important;
          min-height: 0 !important;
          max-height: none !important;
          border: 0 !important;
          border-radius: 0 !important;
          box-shadow: none !important;
          pointer-events: auto !important;
        }
        .ys-order-messenger-resolving {
          height: 100%;
          display: grid;
          place-items: center;
          padding: 28px;
          color: #64748b;
          font: 600 13px/1.5 -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
          text-align: center;
        }
        @media (max-width: 760px) {
          .ys-order-messenger-window {
            inset: 0 !important;
            width: 100vw !important;
            height: 100dvh !important;
            min-width: 0 !important;
            min-height: 0 !important;
            border: 0 !important;
            border-radius: 0 !important;
            resize: none !important;
          }
          .ys-order-messenger-toolbar { cursor: default; padding-top: env(safe-area-inset-top); min-height: calc(44px + env(safe-area-inset-top)); }
          .ys-order-messenger-controls button[data-dock-control] { display: none; }
        }
      `}</style>

      <div
        className="ys-order-messenger-toolbar"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
        aria-label="Move and dock order Messenger"
      >
        <span className="ys-order-messenger-grip" aria-hidden="true">⠿</span>
        <span className="ys-order-messenger-title">Order Messenger · {name}</span>
        <div className="ys-order-messenger-controls">
          <button type="button" data-dock-control aria-label="Dock Messenger left" title="Dock left" onClick={() => setDock('left')}>◧</button>
          <button type="button" data-dock-control aria-label="Float Messenger" title="Move freely" onClick={() => {
            const rect = windowRef.current?.getBoundingClientRect()
            if (rect) setPosition(clamp(rect.left, rect.top))
            setDock('float')
          }}>↗</button>
          <button type="button" data-dock-control aria-label="Dock Messenger right" title="Dock right" onClick={() => setDock('right')}>◨</button>
          <button type="button" aria-label="Close order Messenger" title="Close" onClick={() => setOpen(false)}>×</button>
        </div>
      </div>

      <div className="ys-order-messenger-slot">
        {profileId ? (
          <ChatSidePane
            open
            onClose={() => setOpen(false)}
            counterpartProfileId={profileId}
            attorneyName={name}
            attorneyAvatar={avatar}
            contextKind="order"
            contextId={orderId}
            presentation="popover"
            serviceTitle={serviceTitle || undefined}
          />
        ) : (
          <div className="ys-order-messenger-resolving">
            {resolving ? 'Connecting this order to Messenger…' : 'The order conversation could not be resolved. Refresh and try again.'}
          </div>
        )}
      </div>
    </div>
  )
}
