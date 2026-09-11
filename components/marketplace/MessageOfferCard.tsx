'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import OfferDetailPanel, { type OfferDetailPayload } from '../messaging/OfferDetailPanel'
import { OfferCountdown } from '../messaging/OfferCountdown'
import { openOrderInApp } from '@/lib/orderLinks'
import { T, F } from './tokens'

type OfferStatus = 'pending' | 'processing' | 'accepted' | 'paid' | 'declined' | 'expired' | 'cancelled'

type OfferCardProps = {
  offer: {
    id: string
    title: string
    description?: string | null
    price_cents: number
    discount_cents?: number
    currency?: string | null
    delivery_days: number
    revisions: number
    expires_at?: string | null
    status: OfferStatus
    linked_gig?: { id: string; title: string; slug: string } | null
    attachments?: { url: string; name: string }[] | string[]
    order_id?: string | null
    order_number?: string | null
  }
  viewerRole: 'buyer' | 'seller'
  offerBusy?: boolean
  onAccept?: (offerId: string) => void
  onDecline?: (offerId: string) => void
  onWithdraw?: (offerId: string) => void
  onOpenOrder?: (orderId: string) => void
}

const detailCache = new Map<string, OfferDetailPayload>()
const detailPromises = new Map<string, Promise<OfferDetailPayload | null>>()

async function loadOfferDetails(offerId: string, force = false): Promise<OfferDetailPayload | null> {
  if (!force && detailCache.has(offerId)) return detailCache.get(offerId) || null
  if (!force && detailPromises.has(offerId)) return detailPromises.get(offerId) || null

  const request = fetch(`/api/offers/${offerId}`, { credentials: 'same-origin' })
    .then(async (res) => {
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload?.error?.message || payload?.error || 'Could not load offer details.')
      const details = payload?.data as OfferDetailPayload | undefined
      if (details?.offer) detailCache.set(offerId, details)
      return details || null
    })
    .finally(() => detailPromises.delete(offerId))

  detailPromises.set(offerId, request)
  return request
}

function formatMoney(cents: number, currency = 'USD'): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() })
      .format(cents / 100)
  } catch {
    return `$${(cents / 100).toFixed(2)}`
  }
}

const STATUS_CONFIG: Record<OfferStatus, { label: string; bg: string; fg: string }> = {
  pending:    { label: 'Awaiting response', bg: `${T.star}1A`, fg: T.star },
  processing: { label: 'Processing',        bg: `${T.star}1A`, fg: T.star },
  accepted:   { label: 'Accepted',          bg: `${T.moss}1A`, fg: T.moss },
  paid:       { label: 'Paid',              bg: `${T.moss}1A`, fg: T.moss },
  declined:   { label: 'Declined',          bg: `${T.brick}1A`, fg: T.brick },
  expired:    { label: 'Expired',           bg: `${T.inkMid}1A`, fg: T.inkMid },
  cancelled:  { label: 'Withdrawn',         bg: `${T.inkMid}1A`, fg: T.inkMid },
}

function StatusBadge({ status }: { status: OfferStatus }) {
  const c = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '3px 9px', borderRadius: 999,
      fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
      textTransform: 'uppercase',
      fontFamily: F.mono, background: c.bg, color: c.fg,
    }}>
      {c.label}
    </span>
  )
}

function StatusMessage({ status }: { status: OfferStatus }) {
  const messages: Partial<Record<OfferStatus, string>> = {
    processing: 'Payment is being processed.',
    accepted:  'Payment in progress — your order will be created when the charge clears.',
    paid:      'Order created. Check your orders for next steps.',
    declined:  'This offer was declined.',
    expired:   'This offer has expired and can no longer be accepted.',
    cancelled: 'This offer was withdrawn by the sender.',
  }
  const msg = messages[status]
  if (!msg) return null
  return (
    <p style={{ margin: 0, fontSize: 12, color: T.inkMid, lineHeight: 1.5, fontStyle: 'italic' }}>
      {msg}
    </p>
  )
}

function useMinuteTick(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])
  return now
}

function isInteractiveTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('button,a,input,textarea,select,[role="button"]'))
}

export function MessageOfferCard({ offer, viewerRole, offerBusy = false, onAccept, onDecline, onWithdraw, onOpenOrder }: OfferCardProps) {
  const now = useMinuteTick()
  const [details, setDetails] = useState<OfferDetailPayload | null>(() => detailCache.get(offer.id) || null)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [detailsError, setDetailsError] = useState('')
  const [panelOpen, setPanelOpen] = useState(false)

  const currency = (offer.currency || 'USD').toUpperCase()
  const hasDiscount = offer.discount_cents != null && offer.discount_cents > 0
  const effectiveCents = hasDiscount ? offer.price_cents - (offer.discount_cents as number) : offer.price_cents
  const revisionsLabel = offer.revisions >= 999 ? 'Unlimited revisions' : `${offer.revisions} revision${offer.revisions === 1 ? '' : 's'}`
  const isExpired = !!offer.expires_at && new Date(offer.expires_at).getTime() <= now
  const buyerDisabled = isExpired || offerBusy
  const attachmentsCount = Array.isArray(offer.attachments) ? offer.attachments.length : 0
  const mine = viewerRole === 'seller'

  useEffect(() => {
    let cancelled = false
    void loadOfferDetails(offer.id)
      .then((value) => { if (!cancelled && value) setDetails(value) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [offer.id])

  const refreshDetails = async () => {
    setDetailsLoading(true)
    setDetailsError('')
    try {
      const value = await loadOfferDetails(offer.id, true)
      if (value) setDetails(value)
      return value
    } catch (err) {
      setDetailsError(err instanceof Error ? err.message : 'Could not load offer details.')
      return null
    } finally {
      setDetailsLoading(false)
    }
  }

  const openOrder = (orderId: string) => {
    if (onOpenOrder) onOpenOrder(orderId)
    else openOrderInApp(orderId)
  }

  const activateCard = async () => {
    const knownOrderId = offer.order_id || details?.order?.id || null
    if (knownOrderId) {
      openOrder(knownOrderId)
      return
    }

    // Accepted/paid cards must resolve their authoritative order before doing
    // anything else. This covers a thread payload that was rendered just
    // before the order link was attached.
    if (offer.status === 'accepted' || offer.status === 'paid' || offer.status === 'processing') {
      const fresh = await refreshDetails()
      if (fresh?.order?.id) {
        openOrder(fresh.order.id)
        return
      }
    }

    setPanelOpen(true)
    void refreshDetails()
  }

  const sender = details?.sender
  const senderName = sender?.full_name || (mine ? 'You' : 'Sender')

  return (
    <>
      <style>{OFFER_ANCHOR_CSS}</style>
      <div
        className={`ys-offer-card-shell ${mine ? 'mine' : 'theirs'}`}
        role="button"
        tabIndex={0}
        aria-label={offer.order_id ? `Open order for ${offer.title}` : `Open details for ${offer.title}`}
        onClick={(event) => {
          if (isInteractiveTarget(event.target)) return
          void activateCard()
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            void activateCard()
          }
        }}
        style={{
          position: 'relative',
          width: 360,
          maxWidth: 'calc(100% - 34px)',
          marginLeft: mine ? 0 : 34,
          marginRight: mine ? 34 : 0,
          cursor: 'pointer',
          outline: 'none',
        }}
      >
        <span
          aria-hidden="true"
          className="ys-offer-tail"
          style={{
            position: 'absolute',
            bottom: 0,
            ...(mine ? { right: -8 } : { left: -8 }),
            width: 8,
            height: 14,
            background: T.vellum,
            clipPath: mine
              ? 'polygon(0 0, 0 100%, 100% 100%)'
              : 'polygon(100% 0, 0 100%, 100% 100%)',
            filter: 'drop-shadow(0 1px 0 rgba(15,23,42,.18))',
            pointerEvents: 'none',
            zIndex: 2,
          }}
        />
        <div
          className="ys-offer-sender-avatar"
          title={senderName}
          aria-label={`Offer sent by ${senderName}`}
          style={{
            position: 'absolute',
            bottom: 1,
            ...(mine ? { right: -34 } : { left: -34 }),
            width: 28,
            height: 28,
            borderRadius: '50%',
            overflow: 'hidden',
            display: 'grid',
            placeItems: 'center',
            background: '#3C3B6E',
            color: '#fff',
            fontSize: 11,
            fontWeight: 700,
            zIndex: 3,
            boxShadow: '0 0 0 2px var(--chat-bg, #F0F2F5)',
          }}
        >
          {sender?.avatar_url
            ? <img src={sender.avatar_url} alt={senderName} style={{ width: 28, height: 28, objectFit: 'cover', display: 'block' }} />
            : senderName.charAt(0).toUpperCase()}
        </div>

        <div className="ys-offer-card" style={{
          width: '100%',
          maxWidth: '100%',
          background: T.vellum,
          border: `1px solid ${T.rule}`,
          borderRadius: 14,
          overflow: 'hidden',
          boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 6px 18px rgba(15,23,42,0.06)',
          fontFamily: F.ui,
        }}>
          <div style={{ height: 3, background: `linear-gradient(90deg, ${T.gold} 0%, ${T.gold} 50%, ${T.gold} 100%)` }} />

          <div style={{ padding: '12px 16px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: T.star, fontFamily: F.mono }}>
              💼 Custom offer
            </span>
            <StatusBadge status={offer.status} />
          </div>

          <div style={{ padding: '0 16px 4px' }}>
            <h3 style={{ margin: 0, fontFamily: F.display, fontSize: 18, fontWeight: 600, color: T.ink, lineHeight: 1.25, letterSpacing: '-0.005em' }}>
              {offer.title}
            </h3>
          </div>

          {offer.description ? (
            <div style={{ padding: '6px 16px 0', fontSize: 13, color: T.inkMid, lineHeight: 1.55, display: '-webkit-box', WebkitBoxOrient: 'vertical' as const, WebkitLineClamp: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'pre-wrap' }}>
              {offer.description}
            </div>
          ) : null}

          <div style={{ padding: '14px 16px 6px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: F.display, fontSize: 30, fontWeight: 600, color: T.ink, letterSpacing: '-0.012em', lineHeight: 1 }}>
                {formatMoney(effectiveCents, currency)}
              </span>
              {hasDiscount && (
                <>
                  <span style={{ fontSize: 13, color: T.inkSoft, textDecoration: 'line-through', fontFamily: F.mono }}>
                    {formatMoney(offer.price_cents, currency)}
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.04em', background: `${T.star}1A`, color: T.star, padding: '2px 8px', borderRadius: 999, fontFamily: F.mono }}>
                    −{formatMoney(offer.discount_cents as number, currency)} OFF
                  </span>
                </>
              )}
            </div>

            <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 12, color: T.inkMid }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Glyph d="M12 8v4l3 3M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                {offer.delivery_days} day{offer.delivery_days === 1 ? '' : 's'} delivery
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Glyph d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                {revisionsLabel}
              </span>
              {attachmentsCount > 0 && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Glyph d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  {attachmentsCount} attachment{attachmentsCount === 1 ? '' : 's'}
                </span>
              )}
            </div>

            {offer.expires_at && offer.status === 'pending' && (
              <div style={{ marginTop: 10 }}><OfferCountdown expiresAt={offer.expires_at} /></div>
            )}

            {offer.linked_gig && (
              <div style={{ marginTop: 10 }}>
                <Link href={`https://market.yousafeconsultancy.com/gigs/${offer.linked_gig.slug}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, background: T.paper2, border: `1px solid ${T.ruleSoft}`, fontSize: 11, fontWeight: 600, color: T.indigo, textDecoration: 'none', fontFamily: F.mono }}>
                  🔗 {offer.linked_gig.title}
                </Link>
              </div>
            )}
          </div>

          <div style={{ height: 1, background: T.ruleSoft, margin: '4px 16px 12px' }} />

          <div style={{ padding: '0 16px 14px' }}>
            {offer.status === 'pending' ? (
              viewerRole === 'buyer' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" onClick={() => onAccept?.(offer.id)} disabled={buyerDisabled} style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: 'none', background: buyerDisabled ? `${T.inkMid}40` : T.indigo, color: buyerDisabled ? T.inkMid : '#fff', fontWeight: 700, fontSize: 13, cursor: buyerDisabled ? 'not-allowed' : 'pointer', fontFamily: F.ui, transition: 'background 0.12s' }}>
                      {offerBusy ? 'Working…' : isExpired ? 'Offer expired' : 'Accept & Pay'}
                    </button>
                    <button type="button" onClick={() => onDecline?.(offer.id)} disabled={buyerDisabled} style={{ padding: '10px 14px', borderRadius: 10, border: `1px solid ${T.rule}`, background: T.vellum, color: buyerDisabled ? T.inkSoft : T.ink, fontWeight: 600, fontSize: 13, cursor: buyerDisabled ? 'not-allowed' : 'pointer', fontFamily: F.ui }}>
                      Decline
                    </button>
                  </div>
                  {isExpired && <p style={{ margin: 0, fontSize: 11, color: T.inkMid, lineHeight: 1.5 }}>Ask the sender to renew this offer before accepting.</p>}
                </div>
              ) : (
                <button type="button" onClick={() => onWithdraw?.(offer.id)} disabled={offerBusy} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: `1px solid ${T.rule}`, background: T.vellum, color: offerBusy ? T.inkSoft : T.inkMid, fontWeight: 600, fontSize: 13, cursor: offerBusy ? 'not-allowed' : 'pointer', fontFamily: F.ui }}>
                  {offerBusy ? 'Working…' : isExpired ? 'Withdraw expired offer' : 'Withdraw offer'}
                </button>
              )
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <StatusMessage status={offer.status} />
                {(offer.order_id || details?.order?.id) && (
                  <button type="button" onClick={() => openOrder((offer.order_id || details?.order?.id) as string)} style={{ alignSelf: 'flex-start', padding: '8px 14px', borderRadius: 10, border: 'none', background: T.indigo, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: F.ui }}>
                    📦 View order{offer.order_number ? ` · ${offer.order_number}` : details?.order?.order_number ? ` · ${details.order.order_number}` : ''} →
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <OfferDetailPanel
        open={panelOpen}
        offerId={offer.id}
        details={details}
        loading={detailsLoading}
        error={detailsError}
        onClose={() => setPanelOpen(false)}
      />
    </>
  )
}

function Glyph({ d }: { d: string }) {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  )
}

const OFFER_ANCHOR_CSS = `
.yousafe-messenger .bub:has(.ys-offer-card-shell) {
  background: transparent !important;
  box-shadow: none !important;
  overflow: visible !important;
  border-radius: 0 !important;
}
.yousafe-messenger .bubrow:has(.ys-offer-card-shell) {
  overflow: visible !important;
}
.yousafe-messenger .bubrow:has(.ys-offer-card-shell)::after {
  display: none !important;
}
.yousafe-messenger .bubrow.theirs .bub:has(.ys-offer-card-shell) > .bub-foot {
  margin-left: 34px !important;
}
.yousafe-messenger .bubrow.mine .bub:has(.ys-offer-card-shell) > .bub-foot {
  margin-right: 34px !important;
}
.yousafe-messenger .ys-offer-card-shell:focus-visible .ys-offer-card {
  outline: 2px solid #3C3B6E;
  outline-offset: 2px;
}
`
