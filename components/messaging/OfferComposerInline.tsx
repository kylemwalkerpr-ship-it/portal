'use client'
/**
 * OfferComposerInline
 *
 * Compact, single-line offer composer that lives inside the thread view
 * of UnifiedInbox. Attorneys (and consultants) can fire a quick custom
 * order without leaving the chat. Three inputs only — title, price,
 * delivery — everything else is defaulted on the server side.
 */
import { useState } from 'react'

export interface OfferComposerInlineProps {
  conversationId: string
  onSent?: () => void
  onClose?: () => void
}

export function OfferComposerInline({ conversationId, onSent, onClose }: OfferComposerInlineProps) {
  const [title, setTitle]               = useState('')
  const [price, setPrice]               = useState('')
  const [deliveryDays, setDeliveryDays] = useState('7')
  const [submitting, setSubmitting]     = useState(false)
  const [error, setError]               = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const priceNum = Number(price)
    if (!title.trim() || title.trim().length < 5) { setError('Add a short title (5+ chars).'); return }
    if (!Number.isFinite(priceNum) || priceNum <= 0) { setError('Enter a valid price.'); return }
    const days = Number(deliveryDays)
    if (!Number.isFinite(days) || days < 1) { setError('Delivery must be at least 1 day.'); return }

    setSubmitting(true)
    try {
      const res = await fetch(`/api/messages/conversations/${conversationId}/quick-offer`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          price: Math.round(priceNum * 100),
          delivery_days: days,
        }),
      })
      const data: any = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = data?.field_errors
          ? Object.values(data.field_errors).join(' ')
          : (data?.error || 'Could not send offer.')
        setError(String(msg))
        return
      }
      setTitle(''); setPrice(''); setDeliveryDays('7')
      onSent?.()
      onClose?.()
    } catch {
      setError('Network error. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={submit}
      style={{
        display: 'flex', flexWrap: 'wrap', gap: 8, padding: 10, borderRadius: 10,
        background: '#F8FAFC', border: '1px solid #E2E8F0', alignItems: 'center',
      }}
    >
      <input
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="What is the offer for?"
        maxLength={120}
        style={{
          flex: '2 1 240px', minWidth: 200, padding: '8px 10px', borderRadius: 8,
          border: '1px solid #CBD5E1', fontSize: 14, background: '#FFF',
        }}
      />
      <div style={{ position: 'relative', flex: '0 0 120px' }}>
        <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#64748B', fontSize: 14 }}>$</span>
        <input
          value={price}
          onChange={e => setPrice(e.target.value.replace(/[^\d.]/g, ''))}
          placeholder="Price"
          inputMode="decimal"
          style={{
            width: '100%', padding: '8px 10px 8px 22px', borderRadius: 8,
            border: '1px solid #CBD5E1', fontSize: 14, background: '#FFF',
          }}
        />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '0 0 auto' }}>
        <input
          value={deliveryDays}
          onChange={e => setDeliveryDays(e.target.value.replace(/[^\d]/g, ''))}
          inputMode="numeric"
          style={{
            width: 56, padding: '8px 10px', borderRadius: 8,
            border: '1px solid #CBD5E1', fontSize: 14, background: '#FFF', textAlign: 'center',
          }}
        />
        <span style={{ fontSize: 13, color: '#475569' }}>days</span>
      </div>
      <button
        type="submit"
        disabled={submitting}
        style={{
          padding: '8px 14px', borderRadius: 8, border: 'none',
          background: submitting ? '#94A3B8' : '#0F172A', color: '#FFF',
          fontWeight: 600, fontSize: 13, cursor: submitting ? 'not-allowed' : 'pointer',
        }}
      >
        {submitting ? 'Sending…' : 'Send offer'}
      </button>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          style={{
            padding: '8px 10px', borderRadius: 8, border: '1px solid #CBD5E1',
            background: '#FFF', color: '#475569', fontSize: 13, cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      )}
      {error && (
        <div style={{ flex: '1 1 100%', color: '#B91C1C', fontSize: 12 }}>{error}</div>
      )}
    </form>
  )
}

export default OfferComposerInline
