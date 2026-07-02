'use client'
import React from 'react'

const serif = "'Cormorant Garamond', 'Garamond', Georgia, serif"
const sans  = "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

const EXTERNAL_PAYMENT_METHODS = [
  'Bank transfer',
  'Wire transfer',
  'Check',
  'Cash',
  'Credit/debit card (offline)',
  'PayPal / Venmo',
  'Zelle',
  'Crypto / stablecoin',
  'Other',
]

/**
 * ManualCreditModal
 *
 * Modal for admins to manually credit a student/client wallet to record
 * monies received through external/off-platform payment methods (bank
 * transfer, check, wire, cash, etc.). Writes to the wallet_transactions
 * ledger with metadata.kind = 'manual_credit' so these entries are
 * distinguishable from card top-ups, loyalty credits, or refunds.
 *
 * Props:
 *   - profileId     : string — target profile to credit
 *   - currentBalance: number — current wallet balance in cents (for display)
 *   - profileName   : string — display name for the header
 *   - profileEmail  : string — display email for the header
 *   - onClose       : () => void
 *   - onSuccess     : ({ creditedCents, balanceCents, transactionId }) => void
 */
export default function ManualCreditModal({
  profileId,
  currentBalance = 0,
  profileName = '',
  profileEmail = '',
  onClose,
  onSuccess,
}) {
  const [amount, setAmount] = React.useState('')
  const [memo, setMemo] = React.useState('')
  const [paymentMethod, setPaymentMethod] = React.useState(EXTERNAL_PAYMENT_METHODS[0])
  const [paymentRef, setPaymentRef] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState(null)

  // ESC closes
  React.useEffect(() => {
    const onKey = e => { if (e.key === 'Escape' && !submitting) onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [submitting, onClose])

  const parsedDollars = parseFloat(amount)
  const amountCents = Number.isFinite(parsedDollars) ? Math.round(parsedDollars * 100) : 0
  const memoTrimmed = memo.trim()
  const paymentRefTrimmed = paymentRef.trim()
  const canSubmit = (
    !submitting &&
    Number.isInteger(amountCents) && amountCents > 0 &&
    memoTrimmed.length > 0 && memoTrimmed.length <= 200
  )

  const handleSubmit = async e => {
    e?.preventDefault?.()
    if (!canSubmit) return
    // Confirm large credits (> $500) to prevent accidental over-crediting.
    if (amountCents >= 50000) {
      const confirmed = window.confirm(
        `You are about to credit $${(amountCents / 100).toFixed(2)} to ${profileName || profileEmail || 'this profile'}.\n\n` +
        `This is a large amount and will be immediately available in the student's wallet.\n\n` +
        `Current balance: ${fmtBalance(currentBalance)}\n` +
        `New balance: ${fmtBalance(currentBalance + amountCents)}\n\n` +
        `Payment method: ${paymentMethod}\n` +
        `Memo: ${memoTrimmed}\n\n` +
        `Are you sure you want to proceed?`
      )
      if (!confirmed) return
    }
    setSubmitting(true); setError(null)
    try {
      const res = await fetch(`/api/admin/wallet/credit/${profileId}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountCents,
          memo: memoTrimmed,
          reason: `Manual credit — ${paymentMethod}`,
          metadata: {
            kind: 'manual_credit',
            payment_method: paymentMethod,
            ...(paymentRefTrimmed ? { external_reference: paymentRefTrimmed } : {}),
          },
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json?.error) {
        const message = json?.error?.message || `Credit failed (HTTP ${res.status})`
        setError(message)
        setSubmitting(false)
        return
      }
      const payload = json?.data || json || {}
      onSuccess?.({
        creditedCents: amountCents,
        balanceCents: Number(payload.balanceCents) || 0,
        transactionId: payload.transactionId || null,
      })
    } catch (err) {
      setError(String(err?.message || err))
      setSubmitting(false)
    }
  }

  const handleBackdrop = () => { if (!submitting) onClose?.() }

  const fmtBalance = n => {
    const dollars = (Number(n) || 0) / 100
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(dollars)
  }

  return (
    <div
      onClick={handleBackdrop}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(15,23,42,0.55)',
        zIndex: 400,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px',
      }}>
      <form
        onSubmit={handleSubmit}
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(480px, 100%)',
          background: '#FAFAF8',
          border: '1px solid #DDD8CE',
          borderRadius: '12px',
          boxShadow: '0 24px 60px rgba(15,23,42,0.28)',
          fontFamily: sans,
          overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}>

        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #DDD8CE', background: '#fff' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#9097A8', marginBottom: '4px' }}>Wallet credit</div>
          <h3 style={{ fontFamily: serif, fontWeight: 600, fontSize: '22px', color: '#0F172A', margin: 0, letterSpacing: '-0.012em' }}>
            Manual Wallet Credit
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#9097A8', lineHeight: 1.4 }}>
            Record off-platform payment received from <strong style={{ color: '#0F172A' }}>{profileName || profileEmail || 'student'}</strong>.
            Current balance: {fmtBalance(currentBalance)}
          </p>
        </div>

        <div style={{ padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

          {/* Amount */}
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#5C6070', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Amount Received (USD)</span>
            <div style={{ position: 'relative' }}>
              <span style={{
                position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)',
                color: '#9097A8', fontSize: '14px', fontWeight: 600, pointerEvents: 'none',
              }}>$</span>
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                autoFocus
                disabled={submitting}
                style={{
                  width: '100%', padding: '10px 12px 10px 24px',
                  border: '1px solid #DDD8CE', borderRadius: '6px',
                  background: '#fff', fontSize: '15px', fontFamily: sans, color: '#0F172A',
                  fontWeight: 600,
                  fontVariantNumeric: 'tabular-nums', boxSizing: 'border-box',
                  outline: 'none',
                }} />
            </div>
            {amount && amountCents <= 0 && (
              <span style={{ fontSize: '12px', color: '#8B1A1A' }}>Enter an amount greater than zero.</span>
            )}
            {amountCents > 0 && (
              <span style={{ fontSize: '12px', color: amountCents >= 50000 ? '#8B1A1A' : '#1A6B45', fontWeight: amountCents >= 50000 ? 700 : 400, fontVariantNumeric: 'tabular-nums' }}>
                Credit: {fmtBalance(amountCents)}{amountCents >= 50000 ? ' — large amount, confirmation required' : ''}
              </span>
            )}
          </label>

          {/* External payment method */}
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#5C6070', textTransform: 'uppercase', letterSpacing: '0.06em' }}>External Payment Method</span>
            <select
              value={paymentMethod}
              onChange={e => setPaymentMethod(e.target.value)}
              disabled={submitting}
              style={{
                padding: '10px 12px',
                border: '1px solid #DDD8CE', borderRadius: '6px',
                background: '#fff', fontSize: '14px', fontFamily: sans, color: '#0F172A',
                boxSizing: 'border-box', outline: 'none', cursor: submitting ? 'not-allowed' : 'pointer',
              }}>
              {EXTERNAL_PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>

          {/* External reference (optional) */}
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#5C6070', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              External Reference <span style={{ color: '#9097A8', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
            </span>
            <input
              type="text"
              value={paymentRef}
              onChange={e => setPaymentRef(e.target.value)}
              placeholder="e.g. check #, wire confirmation, transaction ID"
              maxLength={120}
              disabled={submitting}
              style={{
                padding: '10px 12px',
                border: '1px solid #DDD8CE', borderRadius: '6px',
                background: '#fff', fontSize: '14px', fontFamily: sans, color: '#0F172A',
                boxSizing: 'border-box', outline: 'none',
              }} />
          </label>

          {/* Memo */}
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#5C6070', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Memo <span style={{ color: '#9097A8', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(ledger description — visible to student)</span>
            </span>
            <textarea
              value={memo}
              onChange={e => setMemo(e.target.value.slice(0, 200))}
              placeholder="Describe what this credit is for (e.g. Bank transfer payment received for DS-160 service)"
              maxLength={200}
              rows={2}
              disabled={submitting}
              style={{
                padding: '10px 12px', resize: 'vertical',
                border: '1px solid #DDD8CE', borderRadius: '6px',
                background: '#fff', fontSize: '14px', fontFamily: sans, color: '#0F172A',
                boxSizing: 'border-box', outline: 'none', lineHeight: 1.4,
              }} />
            <span style={{ fontSize: '11px', color: '#9097A8', textAlign: 'right' }}>{memoTrimmed.length}/200</span>
          </label>

          {error && (
            <div style={{
              padding: '10px 12px', background: '#FAEAEA', border: '1px solid #E5BFBF',
              borderRadius: '6px', color: '#8B1A1A', fontSize: '13px',
            }}>{error}</div>
          )}
        </div>

        <div style={{
          padding: '14px 24px', borderTop: '1px solid #DDD8CE', background: '#fff',
          display: 'flex', gap: '8px', justifyContent: 'flex-end',
        }}>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            style={{
              padding: '9px 18px', borderRadius: '6px',
              border: '1px solid #DDD8CE', background: '#fff',
              color: '#5C6070', cursor: submitting ? 'not-allowed' : 'pointer',
              fontSize: '13px', fontWeight: 600, fontFamily: sans, lineHeight: 1,
            }}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            onClick={handleSubmit}
            style={{
              padding: '9px 18px', borderRadius: '6px',
              border: 'none',
              background: !canSubmit ? '#DDD8CE' : '#0F172A',
              color: '#fff', cursor: !canSubmit ? 'not-allowed' : 'pointer',
              fontSize: '13px', fontWeight: 600, fontFamily: sans, lineHeight: 1,
              transition: 'background 0.12s',
            }}>
            {submitting
              ? 'Crediting…'
              : amountCents > 0
                ? `Credit $${(amountCents / 100).toFixed(2)}`
                : 'Credit Wallet'}
          </button>
        </div>
      </form>
    </div>
  )
}
