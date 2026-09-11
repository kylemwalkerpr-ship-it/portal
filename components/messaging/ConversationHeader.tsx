'use client'

import React from 'react'
import { initials } from '@/lib/messaging/format'

export type ConversationHeaderCallAction = 'voice' | 'video' | 'link' | 'schedule'

type Counterpart = {
  id?: string | null
  full_name?: string | null
  avatar_url?: string | null
  avatar_color?: string | null
  role?: string | null
}

type Props = {
  counterpart?: Counterpart | null
  contextLabel?: string | null
  mobileShowChat?: boolean
  onBack?: () => void
  onOpenProfile: () => void
  onToggleSearch: () => void
  searchOpen?: boolean
  onCallAction: (action: ConversationHeaderCallAction) => void
  canSendOffer?: boolean
  onSendOffer?: () => void
  favourite?: boolean
  onToggleFavourite: (event: React.MouseEvent<HTMLButtonElement>) => void
  onOpenSettings: () => void
  aiMode?: 'auto' | 'paused' | 'off' | string
  aiModeBusy?: boolean
  showAiControls?: boolean
  onSetAiMode?: (mode: 'auto' | 'paused') => void
}

function roleLabel(role?: string | null) {
  switch (String(role || '').toLowerCase()) {
    case 'attorney': return 'Attorney · Business account'
    case 'consultant': return 'Consultant · Business account'
    case 'admin': return 'YouSafe team'
    case 'support': return 'YouSafe support'
    case 'client':
    case 'student': return 'YouSafe client'
    default: return 'YouSafe member'
  }
}

function PhoneIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.93.36 1.84.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.97.34 1.88.58 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  )
}

function VideoIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="5" width="14" height="14" rx="2" />
      <path d="m16 10 5-3v10l-5-3z" />
    </svg>
  )
}

export default function ConversationHeader({
  counterpart,
  contextLabel,
  mobileShowChat,
  onBack,
  onOpenProfile,
  onToggleSearch,
  searchOpen = false,
  onCallAction,
  canSendOffer = false,
  onSendOffer,
  favourite = false,
  onToggleFavourite,
  onOpenSettings,
  aiMode = 'auto',
  aiModeBusy = false,
  showAiControls = false,
  onSetAiMode,
}: Props) {
  const [callMenuOpen, setCallMenuOpen] = React.useState(false)
  const callMenuRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    if (!callMenuOpen) return
    const onPointer = (event: PointerEvent) => {
      if (!callMenuRef.current?.contains(event.target as Node)) setCallMenuOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setCallMenuOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [callMenuOpen])

  const name = counterpart?.full_name || 'Conversation'
  const status = roleLabel(counterpart?.role)

  const chooseCall = (action: ConversationHeaderCallAction) => {
    setCallMenuOpen(false)
    onCallAction(action)
  }

  return (
    <header className="ys-conversation-header">
      <div className="ys-conversation-header-main">
        {mobileShowChat && onBack ? (
          <button type="button" className="ys-conversation-back" onClick={onBack} aria-label="Back to conversations">
            <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        ) : null}

        <button type="button" className="ys-conversation-identity" onClick={onOpenProfile} aria-label={`Open ${name} details`}>
          <span className="ys-conversation-avatar" style={{ background: counterpart?.avatar_color || '#3C3B6E' }}>
            {counterpart?.avatar_url
              ? <img src={counterpart.avatar_url} alt="" />
              : <span>{initials(name)}</span>}
          </span>
          <span className="ys-conversation-copy">
            <strong>{name}</strong>
            <span>{status}</span>
          </span>
        </button>

        {contextLabel ? <span className="ys-conversation-context">{contextLabel}</span> : null}

        <div className="ys-conversation-spacer" />

        <div className="ys-conversation-desktop-controls">
          {canSendOffer && onSendOffer ? (
            <button type="button" className="ys-conversation-offer" onClick={onSendOffer}>+ Send offer</button>
          ) : null}

          {showAiControls && onSetAiMode ? (
            <div className="ys-conversation-ai">
              <span className={`ys-conversation-ai-state is-${aiMode}`}>AI {aiMode}</span>
              <button
                type="button"
                disabled={aiModeBusy}
                onClick={() => onSetAiMode(aiMode === 'auto' ? 'paused' : 'auto')}
              >
                {aiMode === 'auto' ? 'Take over' : 'Resume AI'}
              </button>
            </div>
          ) : null}

          <button type="button" className={`ys-conversation-icon ${searchOpen ? 'is-active' : ''}`} onClick={onToggleSearch} title="Search in chat" aria-label="Search in chat" aria-pressed={searchOpen}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </button>
        </div>

        <div className="ys-conversation-call-wrap" ref={callMenuRef}>
          <button
            type="button"
            className={`ys-conversation-call ${callMenuOpen ? 'is-open' : ''}`}
            onClick={() => setCallMenuOpen(v => !v)}
            aria-haspopup="menu"
            aria-expanded={callMenuOpen}
            title="Call options"
          >
            <PhoneIcon size={21} />
            <svg className="ys-conversation-call-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {callMenuOpen ? (
            <div className="ys-conversation-call-menu" role="menu" aria-label="Call options">
              <button type="button" role="menuitem" onClick={() => chooseCall('voice')}>
                <PhoneIcon />
                <span><strong>Voice call</strong><small>Request a voice call</small></span>
              </button>
              <button type="button" role="menuitem" onClick={() => chooseCall('video')}>
                <VideoIcon />
                <span><strong>Video call</strong><small>Request a video meeting</small></span>
              </button>
              <div className="ys-conversation-call-separator" />
              <button type="button" role="menuitem" onClick={() => chooseCall('link')}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M10 13a5 5 0 0 0 7.07.07l2-2A5 5 0 0 0 12 4l-1.15 1.15" />
                  <path d="M14 11a5 5 0 0 0-7.07-.07l-2 2A5 5 0 0 0 12 20l1.15-1.15" />
                </svg>
                <span><strong>Call link</strong><small>Start a secure link request</small></span>
              </button>
              <button type="button" role="menuitem" onClick={() => chooseCall('schedule')}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="4" width="18" height="17" rx="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                  <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
                </svg>
                <span><strong>Schedule call</strong><small>Suggest a date and time</small></span>
              </button>
            </div>
          ) : null}
        </div>

        <div className="ys-conversation-desktop-controls ys-conversation-desktop-controls-end">
          <button type="button" className={`ys-conversation-icon ${favourite ? 'is-favourite' : ''}`} onClick={onToggleFavourite} title={favourite ? 'Remove from favourites' : 'Add to favourites'} aria-pressed={favourite}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill={favourite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </button>
          <button type="button" className="ys-conversation-icon" onClick={onOpenSettings} title="Messenger settings" aria-label="Messenger settings">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33A1.65 1.65 0 0 0 14 20.83V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82A1.65 1.65 0 0 0 3.17 14H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9A1.65 1.65 0 0 0 10 3.17V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9A1.65 1.65 0 0 0 20.83 10H21a2 2 0 0 1 0 4h-.09A1.65 1.65 0 0 0 19.4 15z" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  )
}
