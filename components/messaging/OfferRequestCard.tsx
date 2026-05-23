'use client'

/**
 * OfferRequestCard — renders a conversation_messages row of type='offer_request'.
 */
import React from 'react'

const INDIGO = '#3C3B6E'

function formatBudget(cents: number | undefined): string {
  if (!cents || !Number.isFinite(cents)) return '—'
  const dollars = cents / 100
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(dollars)
}

export default function OfferRequestCard({ message, canRespond }: { message: any; canRespond: boolean }) {
  const md = (message.metadata || {}) as Record<string, any>
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
    <div className="of-req-card">
      <div style={{ padding: '12px 16px 6px' }}>
        <div style={{
          fontFamily: 'var(--font-plex-mono), ui-monospace, monospace',
          fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase',
          color: '#9A7B3B',
        }}>
          Custom offer requested
        </div>
        <h4 style={{ margin: '6px 0 0', fontFamily: 'var(--font-lora), Georgia, serif', fontSize: 18, color: '#1D2433', fontWeight: 600 }}>{title}</h4>
        {description ? (
          <p style={{ margin: '8px 0 0', fontSize: 13, color: '#4A4F5B', whiteSpace: 'pre-wrap' }}>{description}</p>
        ) : null}
      </div>

      <div className="of-req-meta">
        <div className="of-req-meta-row">
          <span className="of-req-meta-lbl">Suggested budget</span>
          <span className="of-req-meta-val">{budget}</span>
        </div>
        <div className="of-req-meta-row">
          <span className="of-req-meta-lbl">Target delivery</span>
          <span className="of-req-meta-val">{delivery}</span>
        </div>
      </div>

      {canRespond ? (
        <div style={{ padding: '0 16px 14px' }}>
          <button
            onClick={compose}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', background: INDIGO, color: '#fff',
              border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Compose offer →
          </button>
        </div>
      ) : null}
    </div>
  )
}
