'use client'
/**
 * OfferPaymentModal
 *
 * Wallet-based payment flow for accepting a custom offer.
 * Buyers pay from their wallet balance. If insufficient, they top up first.
 */
import { useEffect, useState } from 'react'

const NAVY = '#1B2D4F'
const GOLD = '#9A7B3B'
const RED  = '#8B1A1A'
const GREEN = '#1A6B45'
const SURFACE  = '#FFFFFF'
const SURFACE2 = '#FAFAF7'
const BORDER   = '#E5E0D6'
const TEXT  = '#1A1F2E'
const MUTED = '#5C6070'
const DIM   = '#9097A8'
const SERIF = `'Cormorant Garamond', Georgia, serif`
const SANS  = `-apple-system, BlinkMacSystemFont, 'Inter', sans-serif`

export interface OfferPaymentModalProps {
  offerId: string
  open: boolean
  onClose: () => void
  onPaid?: () => void
}

interface Breakdown {
  subtotal: number
  platform_fee: number
  tax: number
  total: number
}

function formatMoney(cents: number, currency = 'USD'): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() })
      .format(cents / 100)
  } catch {
    return `$${(cents / 100).toFixed(2)}`
  }
}

function extractErrorMessage(json: any, status: number): string {
  const msg = json?.error?.message || json?.error || `Request failed (${status})`
  return typeof msg === 'string' ? msg : 'Something went wrong.'
}

export function OfferPaymentModal({ offerId, open, onClose, onPaid }: OfferPaymentModalProps) {
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [meta, setMeta] = useState<{ title: string; currency: string; breakdown?: Breakdown } | null>(null)
  const [walletCents, setWalletCents] = useState<number | null>(null)
  const [requiredCents, setRequiredCents] = useState<number | null>(null)

  useEffect(() => {
    if (!open) return
    setLoading(true); setError(null); setMeta(null); setWalletCents(null); setRequiredCents(null)

    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/offers/${offerId}/accept`, {
          method: 'GET', credentials: 'same-origin',
        })
        const json = await res.json().catch(() => ({}))
        if (cancelled) return

        if (!res.ok) {
          setError(extractErrorMessage(json, res.status))
          setLoading(false)
          return
        }

        const payload = json?.data ?? json
        setMeta({
          title: payload?.offer?.title || 'Custom offer',
          currency: payload?.offer?.currency || 'USD',
          breakdown: payload?.breakdown,
        })
        setWalletCents(Number(payload?.balanceCents ?? 0))
        setRequiredCents(Number(payload?.breakdown?.total ?? 0))
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Could not load payment details.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [open, offerId])

  const handlePay = async () => {
    if (!meta?.breakdown || submitting) return
    setSubmitting(true); setError(null)
    try {
      const res = await fetch(`/api/offers/${offerId}/accept`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (res.status === 402) {
          setWalletCents(Number(json?.error?.balanceCents ?? json?.balanceCents ?? walletCents ?? 0))
          setRequiredCents(Number(json?.error?.requiredCents ?? json?.requiredCents ?? requiredCents ?? 0))
        }
        setError(extractErrorMessage(json, res.status))
        setSubmitting(false)
        return
      }
      onPaid?.()
      onClose()
    } catch (e: any) {
      setError(e?.message || 'Payment failed.')
      setSubmitting(false)
    }
  }

  if (!open) return null

  const totalCents = meta?.breakdown?.total ?? 0
  const canPay = walletCents !== null && walletCents >= totalCents && totalCents > 0

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 20 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: SURFACE, borderRadius: 16, padding: '28px', maxWidth: 460, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', fontFamily: SANS, color: TEXT }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: MUTED }}>Secure checkout</div>
            <div style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 500, marginTop: 4 }}>{meta?.title || 'Custom offer'}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: DIM, lineHeight: 1 }}>×</button>
        </div>

        {loading ? (
          <div style={{ padding: '32px 0', textAlign: 'center', color: MUTED }}>Loading…</div>
        ) : error && !meta?.breakdown ? (
          <div style={{ background: 'rgba(139,26,26,0.08)', border: `1px solid ${RED}44`, borderRadius: 10, padding: '12px 14px', fontSize: 13, color: RED }}>{error}</div>
        ) : (
          <>
            {meta?.breakdown && (
              <div style={{ background: SURFACE2, borderRadius: 12, padding: '16px', marginBottom: 20, border: `1px solid ${BORDER}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 8 }}>
                  <span style={{ color: MUTED }}>Subtotal</span>
                  <span>{formatMoney(meta.breakdown.subtotal, meta.currency)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 8 }}>
                  <span style={{ color: MUTED }}>Platform fee</span>
                  <span>{formatMoney(meta.breakdown.platform_fee, meta.currency)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 8 }}>
                  <span style={{ color: MUTED }}>Tax</span>
                  <span>{formatMoney(meta.breakdown.tax, meta.currency)}</span>
                </div>
                <div style={{ borderTop: `1px solid ${BORDER}`, margin: '10px 0', paddingTop: 10, display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 18 }}>
                  <span>Total</span>
                  <span style={{ color: NAVY }}>{formatMoney(meta.breakdown.total, meta.currency)}</span>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, padding: '12px 14px', background: SURFACE2, borderRadius: 10, border: `1px solid ${BORDER}` }}>
              <span style={{ fontSize: 13, color: MUTED }}>Wallet balance</span>
              <span style={{ marginLeft: 'auto', fontWeight: 700, fontSize: 16, color: walletCents !== null && walletCents >= totalCents ? GREEN : RED }}>
                {walletCents === null ? '—' : formatMoney(walletCents, meta?.currency || 'USD')}
              </span>
            </div>

            {error && (
              <div style={{ background: 'rgba(139,26,26,0.08)', border: `1px solid ${RED}44`, borderRadius: 10, padding: '10px 14px', fontSize: 13, color: RED, marginBottom: 14 }}>
                {error}
                {requiredCents !== null && walletCents !== null && walletCents < requiredCents && (
                  <div style={{ marginTop: 8, fontSize: 12, color: MUTED }}>
                    Required: {formatMoney(requiredCents, meta?.currency || 'USD')} · Available: {formatMoney(walletCents, meta?.currency || 'USD')}
                  </div>
                )}
              </div>
            )}

            {canPay ? (
              <button
                onClick={handlePay}
                disabled={submitting}
                style={{ width: '100%', padding: '14px', borderRadius: 10, background: NAVY, color: '#fff', fontSize: 15, fontWeight: 700, border: 'none', cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.7 : 1 }}
              >
                {submitting ? 'Processing…' : `Pay ${formatMoney(totalCents, meta?.currency || 'USD')} from wallet`}
              </button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 10, padding: '12px 14px', fontSize: 13, color: '#92400e' }}>
                  Insufficient wallet balance. Top up your wallet first.
                  {requiredCents !== null && walletCents !== null && (
                    <div style={{ marginTop: 4, fontSize: 12, opacity: 0.85 }}>
                      Required: {formatMoney(requiredCents, meta?.currency || 'USD')} · Available: {formatMoney(walletCents, meta?.currency || 'USD')}
                    </div>
                  )}
                </div>
                <a
                  href="/student?goto=billing"
                  style={{ display: 'block', textAlign: 'center', padding: '12px', borderRadius: 10, background: NAVY, color: '#fff', fontSize: 15, fontWeight: 700, textDecoration: 'none' }}
                >
                  + Top up wallet
                </a>
              </div>
            )}

            <button
              onClick={onClose}
              style={{ width: '100%', marginTop: 10, padding: '10px', borderRadius: 10, background: 'transparent', color: MUTED, fontSize: 14, border: 'none', cursor: 'pointer' }}
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  )
}
