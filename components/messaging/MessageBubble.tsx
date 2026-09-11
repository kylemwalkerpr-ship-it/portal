'use client'

import React from 'react'
import { fmtFullTime } from '@/lib/messaging/format'

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏']
const EMOJI_GRID = [
  '👍','❤️','😂','😮','😢','😡','🙏','🎉','🔥','👏',
  '💯','✅','❌','⭐','📌','📎','📷','💬','✨','😊',
  '😎','🤔','😅','😍','🥲','👌','💪','🚀','📅','💼',
]

type ViewerAvatarProfile = {
  full_name?: string | null
  avatar_url?: string | null
}

// MessageBubble is shared by student/client, attorney, consultant, admin and
// marketplace messaging surfaces. Incoming rows normally receive their sender
// profile from the thread payload, but historically "mine" rows deliberately
// received no avatar props. Resolve the signed-in profile once per browser
// module so every outgoing bubble can use the same real profile photo without
// issuing one /api/profile request per message.
let viewerAvatarProfileCache: ViewerAvatarProfile | null = null
let viewerAvatarProfilePromise: Promise<ViewerAvatarProfile | null> | null = null

function loadViewerAvatarProfile(): Promise<ViewerAvatarProfile | null> {
  if (viewerAvatarProfileCache) return Promise.resolve(viewerAvatarProfileCache)
  if (viewerAvatarProfilePromise) return viewerAvatarProfilePromise

  viewerAvatarProfilePromise = fetch('/api/profile', { credentials: 'same-origin' })
    .then(async (response) => {
      if (!response.ok) return null
      const data = await response.json().catch(() => ({}))
      const profile = data?.profile
      if (!profile) return null
      viewerAvatarProfileCache = {
        full_name: profile.full_name || null,
        avatar_url: profile.avatar_url || null,
      }
      return viewerAvatarProfileCache
    })
    .catch(() => null)

  return viewerAvatarProfilePromise
}

function useViewerAvatarProfile(enabled: boolean) {
  const [profile, setProfile] = React.useState<ViewerAvatarProfile | null>(viewerAvatarProfileCache)

  React.useEffect(() => {
    if (!enabled || profile) return
    let cancelled = false
    void loadViewerAvatarProfile().then((resolved) => {
      if (!cancelled && resolved) setProfile(resolved)
    })
    return () => { cancelled = true }
  }, [enabled, profile])

  return profile
}

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

  // Incoming messages keep the explicit sender avatar supplied by the thread.
  // For outgoing messages, fall back to the authenticated profile returned by
  // /api/profile. This makes the primitive symmetrical without forcing every
  // dashboard role to duplicate self-profile state.
  const viewerProfile = useViewerAvatarProfile(mine && (!avatarUrl || !avatarName))
  const resolvedAvatarUrl = avatarUrl || (mine ? viewerProfile?.avatar_url || null : null)
  const resolvedAvatarName = avatarName || (mine ? viewerProfile?.full_name || 'You' : 'Them')

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

  // Every row keeps its own YouSafe avatar, so every bubble also keeps the
  // top-side pointer aimed at that avatar. Group boundaries still control the
  // compact WhatsApp-like vertical spacing between consecutive messages.
  const tailClass = mine ? 'tail-r' : 'tail-l'
  const rowClass = `bubrow ${mine ? 'mine' : 'theirs'} ${isLastInGroup ? 'last' : ''}`
  const bubClass = `bub ${tailClass}`.trim()

  const hasReactions = (reactions || []).length > 0

  // Every message gets a sender anchor. Do not collapse avatars to only the
  // first bubble in a run: the visual contract is avatar → bubble for received
  // messages and bubble → avatar for sent messages, on desktop and mobile.
  const showAvatar = Boolean(resolvedAvatarUrl || resolvedAvatarName)
  const avatarNode = showAvatar ? (
    <button
      type="button"
      onClick={onAvatarClick}
      tabIndex={onAvatarClick ? 0 : -1}
      aria-label={onAvatarClick ? `Open ${resolvedAvatarName || 'sender'} profile` : undefined}
      style={{
        width: 28, height: 28, borderRadius: '50%',
        background: avatarColor || '#3C3B6E',
        color: '#fff', display: 'grid', placeItems: 'center',
        fontSize: 11, fontWeight: 600,
        border: 'none', cursor: onAvatarClick ? 'pointer' : 'default', padding: 0,
        // The tail lives at the bubble's top corner, so the sender avatar must
        // align to the same top edge rather than hanging from the bubble base.
        alignSelf: 'flex-start',
        marginLeft: mine ? 6 : 0,
        marginRight: mine ? 0 : 6,
        flexShrink: 0,
        overflow: 'hidden',
      }}
      title={resolvedAvatarName || ''}
    >
      {resolvedAvatarUrl
        ? <img src={resolvedAvatarUrl} alt={resolvedAvatarName || ''} style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', display: 'block' }} />
        : (resolvedAvatarName || '?').charAt(0).toUpperCase()}
    </button>
  ) : null

  return (
    <div className={`${rowClass} ${className || ''}`.trim()} style={style}>
      {!mine && avatarNode}
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

        {timestamp && (
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
      {mine && avatarNode}

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
