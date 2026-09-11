'use client'

import React from 'react'
import { createPortal } from 'react-dom'
import './conversation-header.css'

type Menu = 'call' | 'more' | null

function PhoneIcon() {
  return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.93.36 1.84.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.97.34 1.88.58 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
}

function VideoIcon() {
  return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="5" width="14" height="14" rx="2" /><path d="m16 10 5-3v10l-5-3z" /></svg>
}

function MenuIcon({ kind }: { kind: 'link' | 'calendar' | 'search' | 'star' | 'settings' | 'offer' | 'ai' }) {
  if (kind === 'link') return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.07.07l2-2A5 5 0 0 0 12 4l-1.15 1.15" /><path d="M14 11a5 5 0 0 0-7.07-.07l-2 2A5 5 0 0 0 12 20l1.15-1.15" /></svg>
  if (kind === 'calendar') return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="17" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
  if (kind === 'search') return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
  if (kind === 'star') return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
  if (kind === 'offer') return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 12v8H4V4h8" /><path d="M16 3h5v5" /><path d="m21 3-9 9" /></svg>
  if (kind === 'ai') return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 3v3M12 18v3M3 12h3M18 12h3" /><circle cx="12" cy="12" r="4" /></svg>
  return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33A1.65 1.65 0 0 0 14 20.83V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82A1.65 1.65 0 0 0 3.17 14H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9A1.65 1.65 0 0 0 10 3.17V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9A1.65 1.65 0 0 0 20.83 10H21a2 2 0 0 1 0 4h-.09A1.65 1.65 0 0 0 19.4 15z" /></svg>
}

function roleSubtitle(role: unknown) {
  switch (String(role || '').trim().toLowerCase()) {
    case 'attorney': return 'Attorney · Business account'
    case 'consultant': return 'Consultant · Business account'
    case 'admin': return 'YouSafe team'
    case 'support': return 'YouSafe support'
    case 'client':
    case 'student': return 'YouSafe client'
    default: return 'YouSafe member'
  }
}

function findButton(header: HTMLElement, test: (button: HTMLButtonElement) => boolean) {
  return Array.from(header.querySelectorAll<HTMLButtonElement>('button')).find(test) || null
}

function clickButton(button: HTMLButtonElement | null, options?: MouseEventInit) {
  if (!button || button.disabled) return false
  if (options) button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...options }))
  else button.click()
  return true
}

function protectHeaderSubtitle(header: HTMLElement) {
  const status = header.querySelector<HTMLElement>('.cv-head-status')
  if (!status) return

  // UnifiedInbox historically rendered the counterpart email here. A chat
  // header should communicate account context, not expose direct contact data.
  if (!status.textContent?.trim() || /@/.test(status.textContent)) {
    status.textContent = 'YouSafe member'
  }

  const threadId = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('thread')
    : null
  if (!threadId || header.dataset.ysSubtitleThread === threadId) return
  header.dataset.ysSubtitleThread = threadId

  fetch(`/api/messages/conversations/${encodeURIComponent(threadId)}`, { credentials: 'same-origin' })
    .then(response => response.json().catch(() => ({})))
    .then(payload => {
      if (header.dataset.ysSubtitleThread !== threadId) return
      const liveStatus = header.querySelector<HTMLElement>('.cv-head-status')
      if (!liveStatus) return
      liveStatus.textContent = roleSubtitle(payload?.conversation?.counterpart?.role)
    })
    .catch(() => {})
}

export default function MessengerHeaderEnhancer() {
  const [header, setHeader] = React.useState<HTMLElement | null>(null)
  const [menu, setMenu] = React.useState<Menu>(null)
  const controlsRef = React.useRef<HTMLDivElement | null>(null)

  const discover = React.useCallback(() => {
    const candidates = Array.from(document.querySelectorAll<HTMLElement>('.yousafe-messenger .cv-head'))
    const active = candidates.find(el => el.querySelector('.cv-head-info') && el.getClientRects().length > 0) || null
    setHeader(prev => prev === active ? prev : active)
    if (active) {
      protectHeaderSubtitle(active)
      const video = findButton(active, b => /video call/i.test(b.title || ''))
      const voice = findButton(active, b => /voice call/i.test(b.title || ''))
      if (video) video.dataset.ysLegacyCall = 'video'
      if (voice) voice.dataset.ysLegacyCall = 'voice'
      const aiState = active.querySelector<HTMLElement>('[title="SuperGrok AI closer"]')
      if (aiState?.parentElement) aiState.parentElement.dataset.ysHeaderAi = 'true'
    }
  }, [])

  React.useEffect(() => {
    discover()
    const observer = new MutationObserver(discover)
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class', 'style'],
    })
    window.addEventListener('resize', discover)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', discover)
    }
  }, [discover])

  React.useEffect(() => {
    if (!menu) return
    const close = (event: PointerEvent) => {
      if (!controlsRef.current?.contains(event.target as Node)) setMenu(null)
    }
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenu(null) }
    document.addEventListener('pointerdown', close)
    window.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', key)
    }
  }, [menu])

  if (!header) return null

  const legacyVideo = () => findButton(header, b => b.dataset.ysLegacyCall === 'video' || /video call/i.test(b.title || ''))
  const legacyVoice = () => findButton(header, b => b.dataset.ysLegacyCall === 'voice' || /voice call/i.test(b.title || ''))
  const chooseCall = (kind: 'voice' | 'video' | 'link' | 'schedule') => {
    setMenu(null)
    // The platform already has a confirmed-call request flow with scheduling.
    // Until a first-party RTC/link service is attached, "Send call link" uses
    // the video request path, which explicitly confirms the link before connect.
    if (kind === 'voice' || kind === 'schedule') clickButton(legacyVoice())
    else clickButton(legacyVideo())
  }

  const searchButton = () => findButton(header, b => /search in chat/i.test(b.title || ''))
  const favouriteButton = () => findButton(header, b => /favourites/i.test(b.title || ''))
  const settingsButton = () => findButton(header, b => /^settings$/i.test(b.title || '') || /messenger settings/i.test(b.title || ''))
  const offerButton = () => findButton(header, b => /send offer/i.test(b.textContent || ''))
  const aiButton = () => findButton(header, b => /take over|resume ai/i.test(b.textContent || ''))

  const action = (fn: () => HTMLButtonElement | null, options?: MouseEventInit) => {
    setMenu(null)
    clickButton(fn(), options)
  }

  return createPortal(
    <div ref={controlsRef} className="ys-header-enhanced-controls" data-ys-enhanced-header="true">
      <div className="ys-header-call-anchor">
        <button type="button" className={`ys-header-call-button ${menu === 'call' ? 'is-open' : ''}`} onClick={() => setMenu(menu === 'call' ? null : 'call')} aria-haspopup="menu" aria-expanded={menu === 'call'} aria-label="Call options">
          <PhoneIcon />
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
        </button>
        {menu === 'call' && (
          <div className="ys-header-popover ys-header-call-menu" role="menu" aria-label="Call options">
            <button type="button" role="menuitem" onClick={() => chooseCall('voice')}><PhoneIcon /><span><strong>Voice call</strong><small>Request a voice call</small></span></button>
            <button type="button" role="menuitem" onClick={() => chooseCall('video')}><VideoIcon /><span><strong>Video call</strong><small>Request a video meeting</small></span></button>
            <div className="ys-header-menu-separator" />
            <button type="button" role="menuitem" onClick={() => chooseCall('link')}><MenuIcon kind="link" /><span><strong>Send call link</strong><small>Request a secure link after confirmation</small></span></button>
            <button type="button" role="menuitem" onClick={() => chooseCall('schedule')}><MenuIcon kind="calendar" /><span><strong>Schedule call</strong><small>Suggest a date and time</small></span></button>
          </div>
        )}
      </div>

      <div className="ys-header-more-anchor">
        <button type="button" className={`ys-header-more-button ${menu === 'more' ? 'is-open' : ''}`} onClick={() => setMenu(menu === 'more' ? null : 'more')} aria-haspopup="menu" aria-expanded={menu === 'more'} aria-label="Conversation options">
          <svg width="21" height="21" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
        </button>
        {menu === 'more' && (
          <div className="ys-header-popover ys-header-more-menu" role="menu" aria-label="Conversation options">
            {searchButton() && <button type="button" role="menuitem" onClick={() => action(searchButton)}><MenuIcon kind="search" /><span><strong>Search</strong><small>Find messages in this chat</small></span></button>}
            {favouriteButton() && <button type="button" role="menuitem" onClick={() => action(favouriteButton)}><MenuIcon kind="star" /><span><strong>Favourite</strong><small>Pin this conversation</small></span></button>}
            {offerButton() && <button type="button" role="menuitem" onClick={() => action(offerButton)}><MenuIcon kind="offer" /><span><strong>Send offer</strong><small>Create a custom offer</small></span></button>}
            {aiButton() && <button type="button" role="menuitem" onClick={() => action(aiButton)}><MenuIcon kind="ai" /><span><strong>{/take over/i.test(aiButton()?.textContent || '') ? 'Take over' : 'Resume AI'}</strong><small>Change AI reply mode</small></span></button>}
            <div className="ys-header-menu-separator" />
            {settingsButton() && <button type="button" role="menuitem" onClick={() => action(settingsButton)}><MenuIcon kind="settings" /><span><strong>Messenger settings</strong><small>Theme, wallpaper and notifications</small></span></button>}
            {favouriteButton() && <button type="button" role="menuitem" onClick={() => action(favouriteButton, { altKey: true })}><MenuIcon kind="star" /><span><strong>Starred messages</strong><small>Open your saved messages</small></span></button>}
          </div>
        )}
      </div>
    </div>,
    header,
  )
}