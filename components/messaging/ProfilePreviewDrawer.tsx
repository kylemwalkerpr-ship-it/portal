'use client'

import React from 'react'
import { resolveCategoryValue } from '@/lib/gigTaxonomy'
import { openOrderInApp } from '@/lib/orderLinks'

interface ProfilePreviewDrawerProps {
  sellerId: string | null
  viewerId?: string | null
  open: boolean
  onClose: () => void
}

const MARKETPLACE_ORIGIN = 'https://market.yousafeconsultancy.com'

const ROLE_LABELS: Record<string, string> = {
  attorney: 'Attorney · Business account',
  consultant: 'Consultant · Business account',
  client: 'YouSafe client',
  student: 'YouSafe client',
  admin: 'YouSafe team',
  support: 'YouSafe support',
}

type ThreadMedia = {
  id: string
  kind: 'attachment' | 'link'
  label: string
  url: string
}

type SharedOrder = {
  id: string
  order_number?: string | null
  status?: string | null
  total_amount?: number | string | null
  escrow_status?: string | null
  created_at?: string | null
}

type HeaderCapabilities = {
  offer: boolean
  ai: boolean
  aiLabel: string
}

function Stars({ avg, count }: { avg: number | null; count: number }) {
  if (!count) return null
  return (
    <div className="ys-contact-rating" aria-label={`${avg?.toFixed(1) || '0.0'} out of 5 from ${count} reviews`}>
      <span aria-hidden="true">★</span>
      <strong>{avg?.toFixed(1) || '0.0'}</strong>
      <span>{count} review{count === 1 ? '' : 's'}</span>
    </div>
  )
}

function DetailRow({ icon, label, value, muted }: { icon: React.ReactNode; label: string; value: React.ReactNode; muted?: boolean }) {
  if (!value) return null
  return (
    <div className="ys-contact-row">
      <span className="ys-contact-row-icon" aria-hidden="true">{icon}</span>
      <div className="ys-contact-row-copy">
        <span className="ys-contact-row-label">{label}</span>
        <span className={`ys-contact-row-value ${muted ? 'is-muted' : ''}`}>{value}</span>
      </div>
    </div>
  )
}

function PhoneIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.93.36 1.84.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.97.34 1.88.58 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
}

function VideoIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="14" height="14" rx="2" /><path d="m16 10 5-3v10l-5-3z" /></svg>
}

function SearchIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
}

function ChevronIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6" /></svg>
}

function ExternalIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3h7v7" /><path d="m21 3-9 9" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></svg>
}

function currentConversationHeader() {
  if (typeof document === 'undefined') return null
  const headers = Array.from(document.querySelectorAll<HTMLElement>('.yousafe-messenger .cv-head'))
  return headers.find(header => header.querySelector('.cv-head-info') && header.getClientRects().length > 0) || null
}

function headerButton(test: (button: HTMLButtonElement) => boolean) {
  const header = currentConversationHeader()
  if (!header) return null
  return Array.from(header.querySelectorAll<HTMLButtonElement>('button')).find(test) || null
}

function invokeHeaderAction(test: (button: HTMLButtonElement) => boolean, options?: MouseEventInit) {
  const button = headerButton(test)
  if (!button || button.disabled) return false
  if (options) button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...options }))
  else button.click()
  return true
}

function safeUrl(value: unknown) {
  const url = typeof value === 'string' ? value.trim() : ''
  return /^https?:\/\//i.test(url) ? url : ''
}

function extractThreadMedia(messages: any[]): ThreadMedia[] {
  const items: ThreadMedia[] = []
  const seen = new Set<string>()
  const urlRegex = /https?:\/\/[^\s<>()]+/gi

  for (const message of messages) {
    const attachmentUrl = safeUrl(message?.attachment_url)
    if (attachmentUrl && !seen.has(attachmentUrl)) {
      seen.add(attachmentUrl)
      items.push({
        id: `attachment-${message?.id || items.length}`,
        kind: 'attachment',
        label: String(message?.attachment_name || 'Attachment'),
        url: attachmentUrl,
      })
    }

    const body = String(message?.body || '')
    for (const raw of body.match(urlRegex) || []) {
      const url = raw.replace(/[),.;!?]+$/, '')
      if (!safeUrl(url) || seen.has(url)) continue
      seen.add(url)
      let label = url
      try { label = new URL(url).hostname.replace(/^www\./, '') } catch {}
      items.push({ id: `link-${message?.id || items.length}-${items.length}`, kind: 'link', label, url })
    }
  }

  return items.reverse()
}

function serviceHref(gig: any) {
  const slug = String(gig?.slug || '').trim()
  return slug ? `${MARKETPLACE_ORIGIN}/gigs/${encodeURIComponent(slug)}` : `${MARKETPLACE_ORIGIN}/providers`
}

function categoryHref(label: string) {
  const target = resolveCategoryValue(label)
  if (target?.value) return `${MARKETPLACE_ORIGIN}/categories/${encodeURIComponent(target.value)}`
  return `${MARKETPLACE_ORIGIN}/?q=${encodeURIComponent(label)}`
}

function orderDate(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function orderAmount(value?: number | string | null) {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount <= 0) return ''
  return `$${amount.toLocaleString(undefined, { minimumFractionDigits: amount % 1 ? 2 : 0, maximumFractionDigits: 2 })}`
}

function OptionRow({ icon, title, subtitle, count, onClick }: {
  icon: React.ReactNode
  title: string
  subtitle?: string
  count?: number
  onClick: () => void
}) {
  return (
    <button type="button" className="ys-contact-option-row" onClick={onClick}>
      <span className="ys-contact-option-icon" aria-hidden="true">{icon}</span>
      <span className="ys-contact-option-copy">
        <strong>{title}</strong>
        {subtitle ? <small>{subtitle}</small> : null}
      </span>
      {typeof count === 'number' && count > 0 ? <span className="ys-contact-option-count">{count}</span> : null}
      <span className="ys-contact-option-chevron"><ChevronIcon /></span>
    </button>
  )
}

export default function ProfilePreviewDrawer({ sellerId, viewerId, open, onClose }: ProfilePreviewDrawerProps) {
  const [seller, setSeller] = React.useState<any>(null)
  const [gigs, setGigs] = React.useState<any[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')
  const [threadMedia, setThreadMedia] = React.useState<ThreadMedia[]>([])
  const [sharedOrders, setSharedOrders] = React.useState<SharedOrder[]>([])
  const [showMedia, setShowMedia] = React.useState(false)
  const [capabilities, setCapabilities] = React.useState<HeaderCapabilities>({ offer: false, ai: false, aiLabel: '' })

  const suppressed = !!sellerId && !!viewerId && sellerId === viewerId

  React.useEffect(() => {
    if (!open || !sellerId || suppressed) return
    let cancelled = false
    setLoading(true)
    setError('')
    setShowMedia(false)
    setSharedOrders([])

    Promise.all([
      fetch(`/api/sellers/${sellerId}`, { credentials: 'same-origin' }).then(r => r.json().catch(() => ({}))),
      fetch(`/api/sellers/${sellerId}/gigs`, { credentials: 'same-origin' }).then(r => r.json().catch(() => ({}))),
    ])
      .then(([sellerRes, gigsRes]) => {
        if (cancelled) return
        setSeller(sellerRes?.data?.seller || null)
        setGigs(gigsRes?.data?.gigs || [])
      })
      .catch(() => {
        if (!cancelled) setError('Could not load profile.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    const header = currentConversationHeader()
    if (header) {
      const buttons = Array.from(header.querySelectorAll<HTMLButtonElement>('button'))
      const offer = buttons.some(button => /send offer/i.test(button.textContent || ''))
      const aiButton = buttons.find(button => /take over|resume ai/i.test(button.textContent || ''))
      setCapabilities({ offer, ai: !!aiButton, aiLabel: aiButton?.textContent?.trim() || '' })
    } else {
      setCapabilities({ offer: false, ai: false, aiLabel: '' })
    }

    const threadId = typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('thread')
      : null
    if (threadId) {
      fetch(`/api/messages/conversations/${encodeURIComponent(threadId)}`, { credentials: 'same-origin' })
        .then(r => r.json().catch(() => ({})))
        .then(payload => {
          if (cancelled) return
          setThreadMedia(extractThreadMedia(Array.isArray(payload?.messages) ? payload.messages : []))
          setSharedOrders(Array.isArray(payload?.sidebar?.orders) ? payload.sidebar.orders : [])
        })
        .catch(() => {
          if (!cancelled) {
            setThreadMedia([])
            setSharedOrders([])
          }
        })
    } else {
      setThreadMedia([])
      setSharedOrders([])
    }

    return () => { cancelled = true }
  }, [open, sellerId, suppressed])

  React.useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  React.useEffect(() => {
    if (!open || typeof document === 'undefined') return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [open])

  if (!open || suppressed) return null

  const role = seller?.role || 'client'
  const roleLabel = ROLE_LABELS[role] || 'YouSafe member'
  const specialties =
    Array.isArray(seller?.specialties) && seller.specialties.length
      ? seller.specialties
      : Array.isArray(seller?.practice_areas)
        ? seller.practice_areas
        : []
  const completedOrders = sharedOrders.filter(order => ['completed', 'complete'].includes(String(order?.status || '').toLowerCase()))

  const memberSince = seller?.member_since
    ? new Date(seller.member_since).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : null

  const runAndClose = (action: () => boolean | void) => {
    onClose()
    window.setTimeout(() => action(), 0)
  }

  const openVoice = () => runAndClose(() => invokeHeaderAction(button => /voice call/i.test(button.title || '') || button.dataset.ysLegacyCall === 'voice'))
  const openVideo = () => runAndClose(() => invokeHeaderAction(button => /video call/i.test(button.title || '') || button.dataset.ysLegacyCall === 'video'))
  const openSearch = () => runAndClose(() => invokeHeaderAction(button => /search in chat/i.test(button.title || '')))
  const openStarred = () => runAndClose(() => invokeHeaderAction(button => /favourites/i.test(button.title || ''), { altKey: true }))
  const openSettings = () => runAndClose(() => invokeHeaderAction(button => /^settings$/i.test(button.title || '') || /messenger settings/i.test(button.title || '')))
  const openOffer = () => runAndClose(() => invokeHeaderAction(button => /send offer/i.test(button.textContent || '')))
  const toggleAi = () => runAndClose(() => invokeHeaderAction(button => /take over|resume ai/i.test(button.textContent || '')))
  const openOrder = (orderId: string) => runAndClose(() => openOrderInApp(orderId))

  return (
    <div className="ys-contact-info-layer" role="presentation" onClick={onClose}>
      <section
        className="ys-contact-info"
        role="dialog"
        aria-modal="true"
        aria-label="Conversation info"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="ys-contact-info-head">
          <button type="button" className="ys-contact-back" onClick={onClose} aria-label="Back to conversation">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <strong>Conversation info</strong>
          <span className="ys-contact-head-spacer" />
        </header>

        <div className="ys-contact-info-scroll">
          {loading && <div className="ys-contact-state"><span className="ys-contact-spinner" aria-hidden="true" /><span>Loading profile…</span></div>}
          {error && <div className="ys-contact-state is-error"><strong>Profile unavailable</strong><span>{error}</span></div>}
          {!loading && !error && !seller && <div className="ys-contact-state"><strong>Profile details are unavailable</strong><span>You can continue this conversation normally.</span></div>}

          {!loading && !error && seller && (
            <>
              <section className="ys-contact-hero ys-contact-hero-upgraded">
                <div className="ys-contact-avatar-ring">
                  <div className="ys-contact-avatar">
                    {seller.headshot_url ? <img src={seller.headshot_url} alt={seller.full_name || ''} /> : <span>{(seller.full_name || '?').charAt(0).toUpperCase()}</span>}
                  </div>
                </div>
                <h2>{seller.full_name || 'YouSafe member'}</h2>
                <p className="ys-contact-role">{roleLabel}</p>
                {seller.tagline && <p className="ys-contact-tagline">{seller.tagline}</p>}
                <Stars avg={seller.rating_avg} count={seller.rating_count || 0} />

                <div className="ys-contact-quick-actions" aria-label="Conversation actions">
                  <button type="button" onClick={openVoice}><PhoneIcon /><span>Voice</span></button>
                  <button type="button" onClick={openVideo}><VideoIcon /><span>Video</span></button>
                  <button type="button" onClick={openSearch}><SearchIcon /><span>Search</span></button>
                </div>

                {role !== 'client' && role !== 'student' && seller.profile_id && (
                  <a className="ys-contact-primary-action" href={`${MARKETPLACE_ORIGIN}/providers/${seller.profile_id}`} target="_blank" rel="noopener noreferrer">
                    View marketplace profile <span aria-hidden="true">↗</span>
                  </a>
                )}
              </section>

              <section className="ys-contact-card ys-contact-business-card" aria-label="Profile details">
                <div className="ys-contact-card-title-row">
                  <h3>{role === 'attorney' || role === 'consultant' ? 'Business info' : 'Account info'}</h3>
                  {(role === 'attorney' || role === 'consultant') && seller.available !== false ? <span className="ys-contact-open-now">Available</span> : null}
                </div>
                {seller.country && <DetailRow icon="◎" label="Country" value={seller.country} />}
                {memberSince && <DetailRow icon="◷" label="Member since" value={memberSince} />}
                {seller.years_experience && <DetailRow icon="◇" label="Experience" value={`${seller.years_experience} year${seller.years_experience === 1 ? '' : 's'}`} />}
                {Array.isArray(seller.languages) && seller.languages.length > 0 && <DetailRow icon="文" label="Languages" value={seller.languages.join(', ')} />}
                {(role === 'client' || role === 'student') && typeof seller.inquiry_count === 'number' && (
                  <DetailRow icon="◫" label="Marketplace activity" value={`${seller.inquiry_count} inquir${seller.inquiry_count === 1 ? 'y' : 'ies'} posted`} muted />
                )}
              </section>

              <section className="ys-contact-card ys-contact-options" aria-label="Conversation options">
                <OptionRow
                  icon={<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9" r="1.5" /><path d="m21 15-5-5L5 20" /></svg>}
                  title="Media, links and docs"
                  subtitle={threadMedia.length ? 'Files and links shared in this conversation' : 'No shared media or links yet'}
                  count={threadMedia.length}
                  onClick={() => setShowMedia(value => !value)}
                />
                {showMedia && (
                  <div className="ys-contact-media-panel">
                    {threadMedia.length ? threadMedia.slice(0, 8).map(item => (
                      <a key={item.id} href={item.url} target="_blank" rel="noopener noreferrer" className="ys-contact-media-item">
                        <span aria-hidden="true">{item.kind === 'attachment' ? '📎' : '↗'}</span><strong>{item.label}</strong>
                      </a>
                    )) : <div className="ys-contact-media-empty">Nothing has been shared in this conversation yet.</div>}
                  </div>
                )}
                <OptionRow icon={<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>} title="Starred messages" subtitle="Review messages you saved" onClick={openStarred} />
                {capabilities.offer ? <OptionRow icon="↗" title="Send custom offer" subtitle="Create an offer for this conversation" onClick={openOffer} /> : null}
                {capabilities.ai ? <OptionRow icon="✦" title={capabilities.aiLabel || 'AI conversation mode'} subtitle="Change who handles automatic replies" onClick={toggleAi} /> : null}
                <OptionRow icon="⚙" title="Messenger settings" subtitle="Theme, wallpaper and notifications" onClick={openSettings} />
              </section>

              {role === 'attorney' && Array.isArray(seller.jurisdictions) && seller.jurisdictions.length > 0 && (
                <section className="ys-contact-card">
                  <h3>Jurisdictions</h3>
                  <div className="ys-contact-chip-row">
                    {seller.jurisdictions.map((item: string) => <span key={item} className="ys-contact-chip">{item}</span>)}
                  </div>
                </section>
              )}

              {specialties.length > 0 && (
                <section className="ys-contact-card">
                  <div className="ys-contact-card-title-row">
                    <h3>{role === 'attorney' ? 'Practice areas' : 'Specialties'}</h3>
                    <span>Browse services</span>
                  </div>
                  <div className="ys-contact-chip-row">
                    {specialties.slice(0, 8).map((item: string) => (
                      <a key={item} className="ys-contact-chip ys-contact-linked-chip" href={categoryHref(item)} target="_blank" rel="noopener noreferrer" aria-label={`Browse ${item} services`}>
                        <span>{item}</span><ExternalIcon />
                      </a>
                    ))}
                  </div>
                </section>
              )}

              {(role === 'attorney' || role === 'consultant') && gigs.length > 0 && (
                <section className="ys-contact-card">
                  <div className="ys-contact-card-title-row">
                    <h3>Services</h3>
                    <span>{gigs.length} available</span>
                  </div>
                  <div className="ys-contact-services">
                    {gigs.slice(0, 4).map((gig: any) => (
                      <a key={gig.id} className="ys-contact-service ys-contact-service-link" href={serviceHref(gig)} target="_blank" rel="noopener noreferrer" aria-label={`Open service: ${gig.title}`}>
                        <div>
                          <strong>{gig.title}</strong>
                          <span>{gig.order_count ? `${gig.order_count} order${gig.order_count === 1 ? '' : 's'}` : 'Available on YouSafe'}</span>
                        </div>
                        <span className="ys-contact-service-end">
                          {gig.starting_price ? <b>${Number(gig.starting_price / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}</b> : null}
                          <ExternalIcon />
                        </span>
                      </a>
                    ))}
                  </div>
                  {seller.profile_id && gigs.length > 4 ? (
                    <a className="ys-contact-see-all" href={`${MARKETPLACE_ORIGIN}/providers/${seller.profile_id}`} target="_blank" rel="noopener noreferrer">View all {gigs.length} services <span aria-hidden="true">↗</span></a>
                  ) : null}
                </section>
              )}

              <section className="ys-contact-card ys-contact-orders-card" aria-label="Completed orders together">
                <div className="ys-contact-card-title-row">
                  <h3>Completed together</h3>
                  <span>{completedOrders.length ? `${completedOrders.length} order${completedOrders.length === 1 ? '' : 's'}` : 'Order history'}</span>
                </div>
                {completedOrders.length ? (
                  <div className="ys-contact-orders">
                    {completedOrders.slice(0, 5).map(order => (
                      <button key={order.id} type="button" className="ys-contact-order" onClick={() => openOrder(order.id)}>
                        <span className="ys-contact-order-icon" aria-hidden="true">✓</span>
                        <span className="ys-contact-order-copy">
                          <strong>{order.order_number || 'Completed order'}</strong>
                          <small>{[orderDate(order.created_at), 'Completed'].filter(Boolean).join(' · ')}</small>
                        </span>
                        {orderAmount(order.total_amount) ? <b>{orderAmount(order.total_amount)}</b> : null}
                        <span className="ys-contact-order-chevron"><ChevronIcon /></span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="ys-contact-order-empty">No completed orders between you and this person yet.</div>
                )}
              </section>

              <section className="ys-contact-card ys-contact-safety">
                <h3>Messaging on YouSafe</h3>
                <DetailRow icon="⌁" label="Conversation context" value="Messages, files and service activity stay attached to this YouSafe conversation." muted />
                <DetailRow icon="✓" label="Platform protections" value="Use YouSafe messaging and checkout for the clearest service record and support trail." muted />
              </section>
            </>
          )}
        </div>
      </section>
    </div>
  )
}
