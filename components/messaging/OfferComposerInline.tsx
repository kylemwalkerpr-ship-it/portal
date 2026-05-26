'use client'
/**
 * OfferComposerInline
 *
 * Rich-but-compact custom offer composer inside UnifiedInbox. Collapsed by
 * default it shows three fields (title, price, delivery days). A
 * "More options" toggle reveals description, revisions (with an Unlimited
 * switch), and expires-in days.
 *
 * Submits to /api/messages/conversations/[id]/quick-offer, which already
 * accepts description, revisions, and expires_in_days alongside the base
 * fields.
 */
import { useState } from 'react'

export interface OfferComposerInlineProps {
  conversationId: string
  onSent?: () => void
  onClose?: () => void
}

const INPUT_STYLE: React.CSSProperties = {
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid #CBD5E1',
  fontSize: 14,
  background: '#FFF',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
}

export function OfferComposerInline({ conversationId, onSent, onClose }: OfferComposerInlineProps) {
  const [title, setTitle]                 = useState('')
  const [description, setDescription]     = useState('')
  const [price, setPrice]                 = useState('')
  const [deliveryDays, setDeliveryDays]   = useState('7')
  const [revisions, setRevisions]         = useState('1')
  const [unlimitedRevisions, setUnlimitedRevisions] = useState(false)
  const [expiresInDays, setExpiresInDays] = useState('7')
  const [expanded, setExpanded]           = useState(false)
  const [submitting, setSubmitting]       = useState(false)
  const [error, setError]                 = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const priceNum = Number(price)
    if (!title.trim() || title.trim().length < 5) { setError('Add a short title (5+ chars).'); return }
    if (!Number.isFinite(priceNum) || priceNum <= 0) { setError('Enter a valid price.'); return }
    const days = Number(deliveryDays)
    if (!Number.isFinite(days) || days < 1) { setError('Delivery must be at least 1 day.'); return }

    const revisionsValue = unlimitedRevisions ? 999 : Number(revisions)
    if (!Number.isFinite(revisionsValue) || revisionsValue < 0) {
      setError('Revisions must be 0 or more.'); return
    }
    const expiry = Number(expiresInDays)
    if (!Number.isFinite(expiry) || expiry < 1 || expiry > 60) {
      setError('Expiry must be between 1 and 60 days.'); return
    }
    if (description.length > 1200) {
      setError('Description is too long (max 1200 chars).'); return
    }

    setSubmitting(true)
    try {
      const res = await fetch(`/api/messages/conversations/${conversationId}/quick-offer`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          price: Math.round(priceNum * 100),
          delivery_days: days,
          revisions: revisionsValue,
          expires_in_days: expiry,
        }),
      })
      const data: any = await res.json().catch(() => ({}))
      if (!res.ok) {
        // apiEnvelope shape: { data: null, error: { message, fields? }, meta }.
        // Older routes used { error: 'string' } directly. Accept both
        // shapes so the surfaced message is a readable string instead of
        // "[object Object]" (the symptom in the user-reported screenshot).
        const fieldErrors = data?.error?.fields || data?.field_errors
        const msg = fieldErrors
          ? Object.values(fieldErrors).join(' ')
          : (data?.error?.message
            || (typeof data?.error === 'string' ? data.error : null)
            || 'Could not send offer.')
        setError(String(msg))
        return
      }
      setTitle(''); setDescription(''); setPrice(''); setDeliveryDays('7')
      setRevisions('1'); setUnlimitedRevisions(false); setExpiresInDays('7')
      setExpanded(false)
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
        display: 'flex', flexDirection: 'column', gap: 8, padding: 10, borderRadius: 10,
        background: '#F8FAFC', border: '1px solid #E2E8F0',
      }}
    >
      {/* Row 1: title, price, delivery, submit, cancel */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="What is the offer for?"
          maxLength={120}
          disabled={submitting}
          style={{ ...INPUT_STYLE, flex: '2 1 240px', minWidth: 200 }}
        />
        <div style={{ position: 'relative', flex: '0 0 120px' }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#64748B', fontSize: 14 }}>$</span>
          <input
            value={price}
            onChange={e => setPrice(e.target.value.replace(/[^\d.]/g, ''))}
            placeholder="Price"
            inputMode="decimal"
            disabled={submitting}
            style={{ ...INPUT_STYLE, width: '100%', paddingLeft: 22 }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '0 0 auto' }}>
          <input
            value={deliveryDays}
            onChange={e => setDeliveryDays(e.target.value.replace(/[^\d]/g, ''))}
            inputMode="numeric"
            disabled={submitting}
            style={{ ...INPUT_STYLE, width: 56, textAlign: 'center' }}
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
            disabled={submitting}
            style={{
              padding: '8px 10px', borderRadius: 8, border: '1px solid #CBD5E1',
              background: '#FFF', color: '#475569', fontSize: 13, cursor: submitting ? 'not-allowed' : 'pointer',
            }}
          >
            Cancel
          </button>
        )}
      </div>

      {/* Toggle */}
      <div>
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          style={{
            background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
            color: '#0F172A', fontSize: 12, fontWeight: 600,
          }}
        >
          {expanded ? 'Fewer options ▴' : 'More options ▾'}
        </button>
      </div>

      {/* Expanded fields */}
      {expanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Add any details the buyer should know before accepting…"
            maxLength={1200}
            rows={3}
            disabled={submitting}
            style={{ ...INPUT_STYLE, width: '100%', resize: 'vertical', minHeight: 64 }}
          />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569' }}>
              <span style={{ fontWeight: 600 }}>Revisions</span>
              <input
                value={unlimitedRevisions ? '∞' : revisions}
                onChange={e => setRevisions(e.target.value.replace(/[^\d]/g, ''))}
                inputMode="numeric"
                disabled={submitting || unlimitedRevisions}
                style={{ ...INPUT_STYLE, width: 56, textAlign: 'center', opacity: unlimitedRevisions ? 0.6 : 1 }}
              />
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#475569', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={unlimitedRevisions}
                  onChange={e => setUnlimitedRevisions(e.target.checked)}
                  disabled={submitting}
                />
                Unlimited
              </label>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569' }}>
              <span style={{ fontWeight: 600 }}>Expires in</span>
              <input
                value={expiresInDays}
                onChange={e => setExpiresInDays(e.target.value.replace(/[^\d]/g, ''))}
                inputMode="numeric"
                disabled={submitting}
                style={{ ...INPUT_STYLE, width: 56, textAlign: 'center' }}
              />
              <span>days</span>
            </label>
          </div>
        </div>
      )}

      {error && (
        <div style={{ color: '#B91C1C', fontSize: 12 }}>{error}</div>
      )}
    </form>
  )
}

export default OfferComposerInline
