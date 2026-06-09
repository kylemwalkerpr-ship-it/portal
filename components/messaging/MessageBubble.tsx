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
  /* §D — profile preview drawer on avatar click */
  avatarUrl?: string | null
  avatarColor?: string
  avatarName?: string
  onAvatarClick?: () => void
  /* Action menu — Forward / Copy / Info / Star / Delete.
     Each callback receives the message id; the parent owns the
     side-effect (api call, modal, etc.). Star is already a toggle so
     it takes the current state. Delete is sender-only; the parent
     should pass a no-op (or omit the callback) when `mine` is false. */
  starred?: boolean
  rawBody?: string                          // plain-text body for Copy
  onStar?: (msgId: string, next: boolean) => void
  onDelete?: (msgId: string) => void
  onForward?: (msgId: string) => void
  onShowInfo?: (msgId: string) => void
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
  avatarUrl,
  avatarColor,
  avatarName,
  onAvatarClick,
  starred,
  rawBody,
  onStar,
  onDelete,
  onForward,
  onShowInfo,
}: MessageBubbleProps) {
  const [copiedFlash, setCopiedFlash] = React.useState(false)
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

  const showAvatar = !mine && isFirstInGroup && (avatarUrl || avatarName)

  return (
    <div className={`${rowClass} ${className || ''}`.trim()} style={style}>
      {showAvatar && (
        <button
          type="button"
          onClick={onAvatarClick}
          style={{
            width: 28, height: 28, borderRadius: '50%',
            background: avatarColor || '#3C3B6E',
            color: '#fff', display: 'grid', placeItems: 'center',
            fontSize: 11, fontWeight: 600,
            border: 'none', cursor: 'pointer', padding: 0,
            alignSelf: 'flex-end', marginRight: 6, marginBottom: 2,
            flexShrink: 0,
          }}
          title={avatarName || ''}
        >
          {avatarUrl
            ? <img src={avatarUrl} alt={avatarName || ''} style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
            : (avatarName || '?').charAt(0).toUpperCase()}
        </button>
      )}
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
              {/* Action row — matches the iOS-style screenshot the user
                  shared. Each item closes the picker after firing. */}
              <button
                type="button"
                className="bub-emoji-picker-action"
                onClick={() => {
                  if (replyTo || !body) { setShowPicker(false); return }
                  const snippet = rawBody || (typeof body === 'string' ? String(body) : '').slice(0, 120)
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

              {onForward && (
                <button
                  type="button"
                  className="bub-emoji-picker-action"
                  onClick={() => { onForward(id); setShowPicker(false) }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 17 20 12 15 7" />
                    <path d="M4 18v-2a8 8 0 0 1 8-8h8" />
                  </svg>
                  Forward
                </button>
              )}

              <button
                type="button"
                className="bub-emoji-picker-action"
                onClick={async () => {
                  const text = rawBody || (typeof body === 'string' ? body : '')
                  if (!text) { setShowPicker(false); return }
                  try {
                    await navigator.clipboard.writeText(text)
                    setCopiedFlash(true)
                    window.setTimeout(() => { setCopiedFlash(false); setShowPicker(false) }, 800)
                  } catch {
                    setShowPicker(false)
                  }
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                {copiedFlash ? 'Copied' : 'Copy'}
              </button>

              {onShowInfo && (
                <button
                  type="button"
                  className="bub-emoji-picker-action"
                  onClick={() => { onShowInfo(id); setShowPicker(false) }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                  Info
                </button>
              )}

              {onStar && (
                <button
                  type="button"
                  className="bub-emoji-picker-action"
                  onClick={() => { onStar(id, !starred); setShowPicker(false) }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill={starred ? '#C4A45A' : 'none'} stroke={starred ? '#C4A45A' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                  {starred ? 'Unstar' : 'Star'}
                </button>
              )}

              {mine && onDelete && (
                <button
                  type="button"
                  className="bub-emoji-picker-action"
                  style={{ color: '#B22234' }}
                  onClick={() => {
                    if (window.confirm('Delete this message? It will show as "deleted" for the other side.')) {
                      onDelete(id)
                      setShowPicker(false)
                    }
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    <path d="M10 11v6M14 11v6" />
                  </svg>
                  Delete
                </button>
              )}
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
