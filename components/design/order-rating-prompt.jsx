// @ts-nocheck
'use client'
import React from 'react'
import { C, Card, Btn } from './shared'

// Self-contained widget: drop into an order detail view with the order id and
// it figures out whether to render. Renders nothing for non-attorney orders.
export default function OrderRatingPrompt({ orderId }) {
  const [data, setData] = React.useState(null)
  const [loading, setLoading] = React.useState(true)
  const [stars, setStars] = React.useState(0)
  const [comment, setComment] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)
  const [submitted, setSubmitted] = React.useState(false)
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    if (!orderId) return
    fetch(`/api/client/orders/${orderId}/attorney-rating`, { credentials: 'same-origin' })
      .then(async (r) => {
        const payload = await r.json().catch(() => null)
        if (!r.ok) {
          setError(payload?.error || 'Could not load rating context.')
          return
        }
        setData(payload)
        if (payload?.my_rating?.stars) {
          setStars(Number(payload.my_rating.stars))
          setComment(payload.my_rating.comment || '')
          setSubmitted(true)
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [orderId])

  if (loading || !data || !data.is_attorney_order) return null

  if (!data.can_rate) {
    return (
      <Card>
        <div style={{ padding: '14px 16px', color: C.textMuted, fontSize: '13px' }}>
          You can rate {data.attorney_name} once this engagement is completed.
        </div>
      </Card>
    )
  }

  async function submit() {
    if (submitting) return
    if (!stars || stars < 1 || stars > 5) {
      setError('Pick 1–5 stars.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch(`/api/attorneys/${data.attorney_id}/ratings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ stars, comment: comment.trim() }),
      })
      const payload = await res.json().catch(() => null)
      if (!res.ok) throw new Error(payload?.error || 'Could not save your rating.')
      setSubmitted(true)
    } catch (e) {
      setError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <div style={{ padding: '16px 18px' }}>
        <div style={{ fontWeight: 700, fontSize: '15px', color: C.text, marginBottom: '6px' }}>
          {submitted ? 'Your rating' : `Rate ${data.attorney_name}`}
        </div>
        <p style={{ color: C.textMuted, fontSize: '12px', margin: '0 0 10px' }}>
          {submitted
            ? 'Thanks for sharing your feedback. You can update your rating any time.'
            : 'Help future clients pick the right attorney. Ratings are public on this attorney’s profile.'}
        </p>

        <StarPicker value={stars} onChange={setStars} disabled={submitting} />

        <textarea
          rows={3}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Optional: a sentence or two about how the engagement went."
          disabled={submitting}
          style={{
            marginTop: '10px',
            width: '100%',
            background: C.bg,
            border: `1px solid ${C.border}`,
            borderRadius: '8px',
            padding: '8px 10px',
            color: C.text,
            fontSize: '13px',
            fontFamily: 'inherit',
            resize: 'vertical',
            boxSizing: 'border-box',
          }}
        />

        {error && (
          <div style={{ marginTop: '8px', color: C.red, fontSize: '12px' }}>{error}</div>
        )}

        <div style={{ marginTop: '10px' }}>
          <Btn variant="primary" size="sm" disabled={submitting || !stars} onClick={submit}>
            {submitting ? 'Saving...' : submitted ? 'Update rating' : 'Submit rating'}
          </Btn>
        </div>
      </div>
    </Card>
  )
}

function StarPicker({ value, onChange, disabled }) {
  const [hover, setHover] = React.useState(0)
  const display = hover || value
  return (
    <div style={{ display: 'flex', gap: '4px' }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          onClick={() => onChange(n)}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          aria-label={`${n} star${n === 1 ? '' : 's'}`}
          style={{
            background: 'none',
            border: 'none',
            cursor: disabled ? 'not-allowed' : 'pointer',
            color: n <= display ? '#f5b400' : C.border2,
            fontSize: '24px',
            padding: 0,
            lineHeight: 1,
          }}
        >
          ★
        </button>
      ))}
    </div>
  )
}
