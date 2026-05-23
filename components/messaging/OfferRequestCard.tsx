'use client'

/**
 * OfferRequestCard — renders a conversation_messages row of type='offer_request'.
 *
 * The buyer's "please send me a custom offer" prompt as a card. When
 * `canRespond` is true (i.e. the viewer is the targeted seller), shows a
 * "Compose offer" button that fires a window CustomEvent the chat shell can
 * listen for to open the offer composer.
 */
import React from 'react'

const INDIGO = '#3C3B6E'
const GOLD = '#9A7B3B'
const INK = '#1D2433'
const INK_MID = '#4A4F5B'
const INK_SOFT = '#7B7B72'
const BORDER = '#D9D1BD'
const VELLUM = '#FFFEF9'
const SERIF = "var(--font-lora), Lora, Georgia, serif"
const SANS = "var(--font-inter), Inter, system-ui, sans-serif"

type OfferRequestMetadata = {
  kind?: 'offer_request' | string
  title?: string
  description?: string
  suggested_budget_cents?: number
  suggested_delivery_days?: number
}

interface OfferRequestCardProps {
  message: {
    id: string
    body?: string | null
    metadata?: Record<string, any> | null
    created_at: string
    sender_id: string | null
  }
  canRespond: boolean
}

function formatBudget(cents: number | undefined): string {
  if (!cents || !Number.isFinite(cents)) return '—'
  const dollars = cents / 100
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(dollars)
}

export default function OfferRequestCard({ message, canRespond }: OfferRequestCardProps) {
  const md = (message.metadata || {}) as OfferRequestMetadata
  const title = md.title || message.body || 'Custom offer requested'
  const description = md.description || ''
  const budget = formatBudget(md.suggested_budget_cents)
  const days = md.suggested_delivery_days
  const delivery = typeof days === 'number' && days > 0 ? `${days} day${days === 1 ? '' : 's'}` : '—'

  function compose() {
    window.dispatchEvent(
      new CustomEvent('open-offer-composer', { detail: { request_id: message.id } }),
    )
  }

  return (
    <div
      style={{
        background: VELLUM,
        border: `1px solid ${BORDER}`,
        borderRadius: 12,
        padding: 14,
        fontFamily: SANS,
        maxWidth: 460,
      }}
    >
      <div style={{ fontFamily: SERIF, fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', color: GOLD }}>
        Custom offer requested
      </div>
      <h4 style={{ margin: '6px 0 0', fontFamily: SERIF, fontSize: 18, color: INK, fontWeight: 600 }}>{title}</h4>
      {description ? (
        <p style={{ margin: '8px 0 0', fontSize: 13, color: INK_MID, whiteSpace: 'pre-wrap' }}>{description}</p>
      ) : null}

      <div style={{ display: 'flex', gap: 18, marginTop: 12 }}>
        <div>
          <div style={{ fontSize: 11, color: INK_SOFT, textTransform: 'uppercase', letterSpacing: 0.6 }}>
            Suggested budget
          </div>
          <div style={{ fontSize: 14, color: INK, fontWeight: 600, marginTop: 2 }}>{budget}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: INK_SOFT, textTransform: 'uppercase', letterSpacing: 0.6 }}>
            Target delivery
          </div>
          <div style={{ fontSize: 14, color: INK, fontWeight: 600, marginTop: 2 }}>{delivery}</div>
        </div>
      </div>

      {canRespond ? (
        <button
          onClick={compose}
          style={{
            marginTop: 14,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 14px',
            background: INDIGO,
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            fontFamily: SANS,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Compose offer →
        </button>
      ) : null}
    </div>
  )
}
