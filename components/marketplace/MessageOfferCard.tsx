'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { OfferCountdown } from '../messaging/OfferCountdown'

type OfferStatus = 'pending' | 'accepted' | 'paid' | 'declined' | 'expired' | 'cancelled'

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
  }
  viewerRole: 'buyer' | 'seller'
  offerBusy?: boolean
  onAccept?: (offerId: string) => void
  onDecline?: (offerId: string) => void
  onWithdraw?: (offerId: string) => void
}

// ── design tokens (match UnifiedInbox + rest of dashboard) ──────────────────
const NAVY   = '#1B2D4F'
const GOLD   = '#9A7B3B'
const GREEN  = '#1A6B45'
const RED    = '#8B1A1A'
const AMBER  = '#8B5E0A'
const CYAN   = '#0E7C8E'
const SURFACE  = '#FFFFFF'
const SURFACE2 = '#FAFAF7'
const BORDER   = '#E5E0D6'
const BORDER2  = '#F2EFE9'
const TEXT  = '#1A1F2E'
const MUTED = '#5C6070'
const DIM   = '#9097A8'
const SERIF = `'Cormorant Garamond', Georgia, serif`
const SANS  = `-apple-system, BlinkMacSystemFont, 'Inter', sans-serif`
const MONO  = `'SF Mono', Menlo, Consolas, monospace`

function formatMoney(cents: number, currency = 'USD'): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() })
      .format(cents / 100)
  } catch {
    return `$${(cents / 100).toFixed(2)}`
  }
}

const STATUS_CONFIG: Record<OfferStatus, { label: string; bg: string; fg: string }> = {
  pending:   { label: 'Awaiting response', bg: `${AMBER}1A`, fg: AMBER },
  accepted:  { label: 'Accepted',          bg: `${GREEN}1A`, fg: GREEN },
  paid:      { label: 'Paid',              bg: `${GREEN}1A`, fg: GREEN },
  declined:  { label: 'Declined',          bg: `${RED}1A`,   fg: RED },
  expired:   { label: 'Expired',           bg: `${MUTED}1A`, fg: MUTED },
  cancelled: { label: 'Withdrawn',         bg: `${MUTED}1A`, fg: MUTED },
}

function StatusBadge({ status }: { status: OfferStatus }) {
  const c = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '3px 9px', borderRadius: 999,
      fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
      textTransform: 'uppercase',
      fontFamily: MONO, background: c.bg, color: c.fg,
    }}>
      {c.label}
    </span>
  )
}

function StatusMessage({ status }: { status: OfferStatus }) {
  const messages: Partial<Record<OfferStatus, string>> = {
    accepted:  'Payment in progress — your order will be created when the charge clears.',
    paid:      'Order created. Check your orders for next steps.',
    declined:  'This offer was declined.',
    expired:   'This offer has expired and can no longer be accepted.',
    cancelled: 'This offer was withdrawn by the sender.',
  }
  const msg = messages[status]
  if (!msg) return null
  return (
    <p style={{ margin: 0, fontSize: 12, color: MUTED, lineHeight: 1.5, fontStyle: 'italic' }}>
      {msg}
    </p>
  )
}

/**
 * Re-render once per minute so the live-expiry gate flips at the deadline
 * boundary without a manual refresh.
 */
function useMinuteTick(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])
  return now
}

export function MessageOfferCard({ offer, viewerRole, offerBusy = false, onAccept, onDecline, onWithdraw }: OfferCardProps) {
  const now = useMinuteTick()
  const currency = (offer.currency || 'USD').toUpperCase()
  const hasDiscount = offer.discount_cents != null && offer.discount_cents > 0
  const effectiveCents = hasDiscount ? offer.price_cents - (offer.discount_cents as number) : offer.price_cents
  const revisionsLabel = offer.revisions >= 999 ? 'Unlimited revisions' : `${offer.revisions} revision${offer.revisions === 1 ? '' : 's'}`
  const isExpired = !!offer.expires_at && new Date(offer.expires_at).getTime() <= now
  const buyerDisabled = isExpired || offerBusy
  const attachmentsCount = Array.isArray(offer.attachments) ? offer.attachments.length : 0

  return (
    <div style={{
      width: 360, maxWidth: '100%',
      background: SURFACE, border: `1px solid ${BORDER}`,
      borderRadius: 14, overflow: 'hidden',
      boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 6px 18px rgba(15,23,42,0.06)',
      fontFamily: SANS,
    }}>
      {/* Gold accent stripe — same visual signature as marketplace header */}
      <div style={{
        height: 3,
        background: `linear-gradient(90deg, ${GOLD} 0%, #C4A45A 50%, ${GOLD} 100%)`,
      }} />

      {/* Eyebrow */}
      <div style={{
        padding: '12px 16px 8px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
      }}>
        <span style={{
          fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase',
          color: GOLD, fontFamily: MONO,
        }}>
          💼 Custom offer
        </span>
        <StatusBadge status={offer.status} />
      </div>

      {/* Title */}
      <div style={{ padding: '0 16px 4px' }}>
        <h3 style={{
          margin: 0, fontFamily: SERIF, fontSize: 18, fontWeight: 600,
          color: TEXT, lineHeight: 1.25, letterSpacing: '-0.005em',
        }}>
          {offer.title}
        </h3>
      </div>

      {/* Description preview (clamped to 3 lines) */}
      {offer.description ? (
        <div style={{
          padding: '6px 16px 0', fontSize: 13, color: MUTED, lineHeight: 1.55,
          display: '-webkit-box', WebkitBoxOrient: 'vertical' as const, WebkitLineClamp: 3,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'pre-wrap',
        }}>
          {offer.description}
        </div>
      ) : null}

      {/* Price */}
      <div style={{ padding: '14px 16px 6px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span style={{
            fontFamily: SERIF, fontSize: 30, fontWeight: 600,
            color: TEXT, letterSpacing: '-0.012em', lineHeight: 1,
          }}>
            {formatMoney(effectiveCents, currency)}
          </span>
          {hasDiscount && (
            <>
              <span style={{ fontSize: 13, color: DIM, textDecoration: 'line-through', fontFamily: MONO }}>
                {formatMoney(offer.price_cents, currency)}
              </span>
              <span style={{
                fontSize: 10, fontWeight: 800, letterSpacing: '0.04em',
                background: `${AMBER}1A`, color: AMBER,
                padding: '2px 8px', borderRadius: 999, fontFamily: MONO,
              }}>
                −{formatMoney(offer.discount_cents as number, currency)} OFF
              </span>
            </>
          )}
        </div>

        {/* Delivery / revisions / attachments line */}
        <div style={{
          marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 14,
          fontSize: 12, color: MUTED,
        }}>
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

        {/* Expiry countdown */}
        {offer.expires_at && offer.status === 'pending' && (
          <div style={{ marginTop: 10 }}>
            <OfferCountdown expiresAt={offer.expires_at} />
          </div>
        )}

        {/* Linked gig pill */}
        {offer.linked_gig && (
          <div style={{ marginTop: 10 }}>
            <Link
              href={`/marketplace/gigs/${offer.linked_gig.slug}`}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '4px 10px', borderRadius: 999,
                background: SURFACE2, border: `1px solid ${BORDER2}`,
                fontSize: 11, fontWeight: 600, color: NAVY,
                textDecoration: 'none', fontFamily: MONO,
              }}
            >
              🔗 {offer.linked_gig.title}
            </Link>
          </div>
        )}
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: BORDER2, margin: '4px 16px 12px' }} />

      {/* Actions */}
      <div style={{ padding: '0 16px 14px' }}>
        {offer.status === 'pending' ? (
          viewerRole === 'buyer' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => onAccept?.(offer.id)}
                  disabled={buyerDisabled}
                  style={{
                    flex: 1, padding: '10px 14px', borderRadius: 10, border: 'none',
                    background: buyerDisabled ? `${MUTED}40` : NAVY,
                    color: buyerDisabled ? MUTED : '#fff',
                    fontWeight: 700, fontSize: 13, cursor: buyerDisabled ? 'not-allowed' : 'pointer',
                    fontFamily: SANS, transition: 'background 0.12s',
                  }}
                >
                  {offerBusy ? 'Working…' : isExpired ? 'Offer expired' : 'Accept & Pay'}
                </button>
                <button
                  type="button"
                  onClick={() => onDecline?.(offer.id)}
                  disabled={buyerDisabled}
                  style={{
                    padding: '10px 14px', borderRadius: 10,
                    border: `1px solid ${BORDER}`, background: SURFACE,
                    color: buyerDisabled ? DIM : TEXT,
                    fontWeight: 600, fontSize: 13, cursor: buyerDisabled ? 'not-allowed' : 'pointer',
                    fontFamily: SANS,
                  }}
                >
                  Decline
                </button>
              </div>
              {isExpired && (
                <p style={{ margin: 0, fontSize: 11, color: MUTED, lineHeight: 1.5 }}>
                  Ask the sender to renew this offer before accepting.
                </p>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onWithdraw?.(offer.id)}
              disabled={offerBusy}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 10,
                border: `1px solid ${BORDER}`, background: SURFACE,
                color: offerBusy ? DIM : MUTED,
                fontWeight: 600, fontSize: 13, cursor: offerBusy ? 'not-allowed' : 'pointer',
                fontFamily: SANS,
              }}
            >
              {offerBusy ? 'Working…' : isExpired ? 'Withdraw expired offer' : 'Withdraw offer'}
            </button>
          )
        ) : (
          <StatusMessage status={offer.status} />
        )}
      </div>
    </div>
  )
}

/** Tiny inline icon helper to keep the JSX above readable. */
function Glyph({ d }: { d: string }) {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  )
}
