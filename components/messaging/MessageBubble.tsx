'use client'

import React from 'react'
import { fmtFullTime } from '@/lib/messaging/format'

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏']
const EMOJI_GRID = [
  '👍','❤️','😂','😮','😢','😡','🙏','🎉','🔥','👏',
  '💯','✅','❌','⭐','📌','📎','📷','💬','✨','😊',
  '😎','🤔','😅','😍','🥲','👌','💪','🚀','📅','💼',
]

export interface ReplyToInfo {
  id: string
  senderName: string
  snippet: string
}

export interface ReactionItem {
  emoji: string
  count: number
  mine: boolean
}

export interface MessageBubbleProps {
  body: React.ReactNode
  mine: boolean
  isFirstInGroup?: boolean
  isLastInGroup?: boolean
  timestamp?: string | null
  readAt?: string | null
  deliveredAt?: string | null
  className?: string
  style?: React.CSSProperties
  /* §3.5 — reactions + reply quoting */
  id?: string
  reactions?: ReactionItem[]
  onReact?: (msgId: string, emoji: string) => void
  replyTo?: ReplyToInfo | null
  onReplyClick?: (msgId: string) => void
  onReplyStart?: (msgId: string, snippet: string, senderName: string) => void
}

function CheckIcon({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function CheckDoubleIcon({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
      <polyline points="20 6 9 17 4 12" transform="translate(4, 0)" />
    </svg>
  )
}

function TickBadge({ readAt, deliveredAt }: { readAt?: string | null; deliveredAt?: string | null }) {
  const isRead = !!readAt
  const isDelivered = !!deliveredAt || (!readAt && !deliveredAt)
  if (isRead) {
    return <span className="bub-tick read"><CheckDoubleIcon size={13} color="#53BDEB" /></span>
  }
  if (isDelivered) {
    return <span className="bub-tick"><CheckDoubleIcon size={13} color="currentColor" /></span>
  }
  return <span className="bub-tick"><CheckIcon size={13} color="currentColor" /></span>
}

export default function MessageBubble({
  body,
  mine,
  isFirstInGroup = true,
  isLastInGroup = true,
  timestamp,
  readAt,
  deliveredAt,
  className,
  style,
  id,
  reactions,
  onReact,
  replyTo,
  onReplyClick,
  onReplyStart,
}: MessageBubbleProps) {
  const [showPicker, setShowPicker] = React.useState(false)
  const [pickerPos, setPickerPos] = React.useState({ x: 0, y: 0 })
  const [showGrid, setShowGrid] = React.useState(false)
  const pickerRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!showPicker) return
    const onDoc = (e: MouseEvent) => {
      if (!pickerRef.current?.contains(e.target as Node)) {
        setShowPicker(false)
        setShowGrid(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [showPicker])

  const handleContextMenu = (e: React.MouseEvent) => {
    if (!id) return
    e.preventDefault()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const x = Math.min(window.innerWidth - 280, Math.max(8, rect.left + rect.width / 2 - 140))
    const y = Math.min(window.innerHeight - 220, Math.max(8, rect.top + rect.height / 2 - 80))
    setPickerPos({ x, y })
    setShowPicker(true)
    setShowGrid(false)
  }

  const handleReact = (emoji: string) => {
    if (!id || !onReact) return
    onReact(id, emoji)
    setShowPicker(false)
    setShowGrid(false)
  }

  const tailClass = isLastInGroup ? (mine ? 'tail-r' : 'tail-l') : ''
  const rowClass = `bubrow ${mine ? 'mine' : 'theirs'} ${isLastInGroup ? 'last' : ''}`
  const bubClass = `bub ${tailClass}`.trim()

  const hasReactions = (reactions || []).length > 0

  return (
    <div className={`${rowClass} ${className || ''}`.trim()} style={style}>
      <div className={bubClass} onContextMenu={handleContextMenu} data-msgmenu>
        {replyTo && (
          <button
            type="button"
            className="bub-reply-snippet"
            onClick={() => onReplyClick?.(replyTo.id)}
            title="Jump to message"
          >
            <span className="bub-reply-bar" />
            <span className="bub-reply-name">{replyTo.senderName}</span>
            <span className="bub-reply-text">{replyTo.snippet}</span>
          </button>
        )}

        <div className="bub-text">{body}</div>

        {isLastInGroup && timestamp && (
          <div className="bub-foot">
            <span>{fmtFullTime(timestamp)}</span>
            {mine && <TickBadge readAt={readAt} deliveredAt={deliveredAt} />}
          </div>
        )}

        {hasReactions && (
          <div className={`bub-reactions ${mine ? 'mine' : ''}`}>
            {(reactions || []).map((r) => (
              <button
                key={r.emoji}
                type="button"
                className={`bub-reaction-chip ${r.mine ? 'mine' : ''}`}
                onClick={() => handleReact(r.emoji)}
                title={`${r.count}`}
              >
                <span className="bub-reaction-emoji">{r.emoji}</span>
                {r.count > 1 && <span className="bub-reaction-count">{r.count}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {showPicker && id && (
        <div
          ref={pickerRef}
          className="bub-emoji-picker"
          style={{ left: pickerPos.x, top: pickerPos.y }}
        >
          {!showGrid ? (
            <>
              <div className="bub-emoji-picker-quick">
                {QUICK_REACTIONS.map((em) => (
                  <button key={em} type="button" onClick={() => handleReact(em)}>{em}</button>
                ))}
                <button type="button" className="bub-emoji-picker-more" onClick={() => setShowGrid(true)}>+</button>
              </div>
              <div className="bub-emoji-picker-sep" />
              <button
                type="button"
                className="bub-emoji-picker-action"
                onClick={() => {
                  if (replyTo || !body) return
                  const snippet = String(body).slice(0, 120)
                  onReplyStart?.(id, snippet, mine ? 'You' : 'Them')
                  setShowPicker(false)
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 17 4 12 9 7" />
                  <path d="M20 18v-2a8 8 0 0 0-8-8H4" />
                </svg>
                Reply
              </button>
            </>
          ) : (
            <div className="bub-emoji-picker-grid">
              {EMOJI_GRID.map((em) => (
                <button key={em} type="button" onClick={() => handleReact(em)}>{em}</button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
