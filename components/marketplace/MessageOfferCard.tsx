'use client'

import Link from 'next/link'
import { OfferCountdown } from '../messaging/OfferCountdown'

type OfferStatus = 'pending' | 'accepted' | 'paid' | 'declined' | 'expired' | 'cancelled'

type OfferCardProps = {
  offer: {
    id: string
    title: string
    description: string
    price_cents: number
    discount_cents?: number
    delivery_days: number
    revisions: number
    expires_at?: string | null
    status: OfferStatus
    linked_gig?: { id: string; title: string; slug: string } | null
    attachments?: string[]
  }
  viewerRole: 'buyer' | 'seller'
  onAccept?: (offerId: string) => void
  onDecline?: (offerId: string) => void
  onWithdraw?: (offerId: string) => void
}

function formatMoney(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}

function StatusBadge({ status }: { status: OfferStatus }) {
  const config: Record<OfferStatus, { label: string; className: string }> = {
    pending:   { label: 'Awaiting Response', className: 'bg-amber-100 text-amber-800' },
    accepted:  { label: 'Accepted',          className: 'bg-green-100 text-green-800' },
    paid:      { label: 'Paid',              className: 'bg-green-100 text-green-800' },
    declined:  { label: 'Declined',          className: 'bg-red-100 text-red-800' },
    expired:   { label: 'Expired',           className: 'bg-gray-100 text-gray-600' },
    cancelled: { label: 'Withdrawn',         className: 'bg-gray-100 text-gray-600' },
  }
  const { label, className } = config[status]
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${className}`}>
      {label}
    </span>
  )
}

function ExpiryBadge({ expiresAt }: { expiresAt: string }) {
  const ms = new Date(expiresAt).getTime() - Date.now()
  if (ms <= 0) {
    return <span className="text-xs text-red-500 font-medium">Expired</span>
  }
  const days = Math.ceil(ms / (1000 * 60 * 60 * 24))
  return (
    <span className="text-xs text-amber-600 font-medium">
      Expires in {days} day{days === 1 ? '' : 's'}
    </span>
  )
}

function StatusMessage({ status }: { status: OfferStatus }) {
  const messages: Partial<Record<OfferStatus, string>> = {
    accepted:  'Payment in progress — order will be created shortly.',
    paid:      'Order created.',
    declined:  'This offer was declined.',
    expired:   'This offer has expired.',
    cancelled: 'This offer was withdrawn.',
  }
  const msg = messages[status]
  if (!msg) return null
  return <p className="text-sm text-gray-500 italic">{msg}</p>
}

export function MessageOfferCard({ offer, viewerRole, onAccept, onDecline, onWithdraw }: OfferCardProps) {
  const effectiveCents = offer.discount_cents != null && offer.discount_cents > 0
    ? offer.price_cents - offer.discount_cents
    : offer.price_cents
  const hasDiscount = offer.discount_cents != null && offer.discount_cents > 0
  const revisionsLabel = offer.revisions >= 999 ? 'Unlimited' : `${offer.revisions} revision${offer.revisions === 1 ? '' : 's'}`

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden max-w-sm w-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3">
        <h3 className="text-sm font-semibold text-gray-900 leading-snug flex-1">{offer.title}</h3>
        <StatusBadge status={offer.status} />
      </div>

      <div className="h-px bg-gray-100" />

      {/* Price */}
      <div className="px-4 py-3">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-gray-900">{formatMoney(effectiveCents)}</span>
          {hasDiscount && (
            <>
              <span className="text-sm text-gray-400 line-through">{formatMoney(offer.price_cents)}</span>
              <span className="text-xs font-semibold text-amber-600 bg-amber-50 rounded-full px-2 py-0.5">
                -{formatMoney(offer.discount_cents!)} off
              </span>
            </>
          )}
        </div>

        {/* Delivery & revisions */}
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-600">
          <span className="flex items-center gap-1">
            <svg className="h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {offer.delivery_days} day{offer.delivery_days === 1 ? '' : 's'} delivery
          </span>
          <span className="flex items-center gap-1">
            <svg className="h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {revisionsLabel}
          </span>
          {offer.attachments && offer.attachments.length > 0 && (
            <span className="flex items-center gap-1">
              <svg className="h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
              {offer.attachments.length} file{offer.attachments.length === 1 ? '' : 's'}
            </span>
          )}
        </div>

        {/* Expiry */}
        {offer.expires_at && offer.status === 'pending' && (
          <div className="mt-2">
            <OfferCountdown expiresAt={offer.expires_at} />
          </div>
        )}

        {/* Linked gig */}
        {offer.linked_gig && (
          <div className="mt-2">
            <Link
              href={`/marketplace/gigs/${offer.linked_gig.slug}`}
              className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-xs font-medium text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <svg className="h-3 w-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              {offer.linked_gig.title}
            </Link>
          </div>
        )}
      </div>

      {/* Actions or status message */}
      <div className="px-4 pb-4">
        {offer.status === 'pending' ? (
          viewerRole === 'buyer' ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onAccept?.(offer.id)}
                className="flex-1 rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-700 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
              >
                Accept &amp; Pay
              </button>
              <button
                type="button"
                onClick={() => onDecline?.(offer.id)}
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Decline
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onWithdraw?.(offer.id)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Withdraw Offer
            </button>
          )
        ) : (
          <StatusMessage status={offer.status} />
        )}
      </div>
    </div>
  )
}
