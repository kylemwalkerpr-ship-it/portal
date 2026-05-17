'use client'
/**
 * OfferPaymentModal
 *
 * Embedded Stripe Payment Element flow for accepting a custom offer.
 * Replaces the old Stripe Checkout redirect with an in-app modal so
 * buyers stay in the conversation throughout the payment.
 *
 * Flow:
 *   1. Modal opens with offerId.
 *   2. Hit POST /api/offers/:id/accept → returns { offer, client_secret, breakdown }.
 *      (PATCH path is also supported — we use POST for parity with existing call sites.)
 *   3. Mount Stripe.elements({ clientSecret }) and a PaymentElement.
 *   4. On submit, stripe.confirmPayment({ elements }) — Stripe handles 3DS, etc.
 *   5. On success, call onPaid() so the inbox can refresh.
 *
 * No React wrapper from @stripe/react-stripe-js — we use the imperative
 * @stripe/stripe-js loader directly to avoid adding a dependency, matching
 * the loadStripe usage already present in components/design/student.jsx.
 */
import { useEffect, useRef, useState } from 'react'
import { loadStripe, type Stripe, type StripeElements } from '@stripe/stripe-js'

const STRIPE_PUB_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

// ── design tokens (match the rest of the inbox) ─────────────────────────────
const NAVY = '#1B2D4F'
const GOLD = '#9A7B3B'
const RED  = '#8B1A1A'
const SURFACE  = '#FFFFFF'
const SURFACE2 = '#FAFAF7'
const BORDER   = '#E5E0D6'
const TEXT  = '#1A1F2E'
const MUTED = '#5C6070'
const DIM   = '#9097A8'
const SERIF = `'Cormorant Garamond', Georgia, serif`
const SANS  = `-apple-system, BlinkMacSystemFont, 'Inter', sans-serif`
const MONO  = `'SF Mono', Menlo, Consolas, monospace`

export interface OfferPaymentModalProps {
  offerId: string
  open: boolean
  onClose: () => void
  /** Fired after a successful confirmPayment. Inbox should reload the thread. */
  onPaid?: () => void
}

interface Breakdown {
  subtotal: number
  platform_fee: number
  tax: number
  total: number
}

interface AcceptResponseData {
  client_secret: string
  payment_intent_id: string
  offer?: { title?: string; currency?: string }
  breakdown?: Breakdown
}

function formatMoney(cents: number, currency = 'USD'): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() })
      .format(cents / 100)
  } catch {
    return `$${(cents / 100).toFixed(2)}`
  }
}

export function OfferPaymentModal({ offerId, open, onClose, onPaid }: OfferPaymentModalProps) {
  const [stripe, setStripe]     = useState<Stripe | null>(null)
  const [elements, setElements] = useState<StripeElements | null>(null)
  const [loading, setLoading]   = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [meta, setMeta]         = useState<{ title: string; currency: string; breakdown?: Breakdown } | null>(null)
  const elementsRef = useRef<HTMLDivElement | null>(null)

  // ── Open: hit /accept, then mount Elements ────────────────────────────────
  useEffect(() => {
    if (!open) return
    if (!STRIPE_PUB_KEY) {
      setError('Stripe is not configured. Contact support to complete payment.')
      setLoading(false)
      return
    }

    let cancelled = false
    let paymentElementInstance: any = null
    setLoading(true); setError(null); setMeta(null); setStripe(null); setElements(null)

    ;(async () => {
      try {
        const res = await fetch(`/api/offers/${offerId}/accept`, {
          method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
        })
        const json = await res.json().catch(() => ({}))
        if (cancelled) return
        if (!res.ok) {
          const msg = json?.error || json?.data?.error || `Could not start payment (HTTP ${res.status}).`
          setError(String(msg)); setLoading(false)
          return
        }
        // Envelope: ok() returns { data: {...} }; some routes return flat.
        const payload: AcceptResponseData = (json?.data ?? json) as AcceptResponseData
        if (!payload?.client_secret) {
          setError('Server did not return a Stripe client_secret.')
          setLoading(false)
          return
        }
        const stripeInstance = await loadStripe(STRIPE_PUB_KEY)
        if (cancelled) return
        if (!stripeInstance) {
          setError('Stripe.js failed to load. Disable any blockers and try again.')
          setLoading(false)
          return
        }
        const els = stripeInstance.elements({
          clientSecret: payload.client_secret,
          appearance: {
            theme: 'flat',
            variables: {
              colorPrimary: NAVY,
              colorBackground: SURFACE,
              colorText: TEXT,
              colorDanger: RED,
              fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
              borderRadius: '8px',
            },
          },
        })
        const paymentElement = els.create('payment', { layout: 'tabs' })
        paymentElementInstance = paymentElement

        // Mount once the modal DOM is in place. We wait a tick because the
        // <div ref={elementsRef}> below is rendered AFTER loading=false.
        setStripe(stripeInstance); setElements(els)
        setMeta({
          title: payload.offer?.title || 'Custom offer',
          currency: payload.offer?.currency || 'USD',
          breakdown: payload.breakdown,
        })
        setLoading(false)
        requestAnimationFrame(() => {
          if (cancelled || !elementsRef.current) return
          paymentElement.mount(elementsRef.current)
        })
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || 'Could not start payment.')
          setLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
      try { paymentElementInstance?.unmount() } catch {}
    }
  }, [open, offerId])

  // ── ESC closes ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !submitting) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, submitting, onClose])

  // ── Submit ──────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements || submitting) return
    setSubmitting(true); setError(null)
    try {
      const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          // Stripe needs SOME return_url; if 3DS hijacks the page it'll
          // bounce back here, but for cards w/o 3DS the user stays put.
          return_url: typeof window !== 'undefined' ? window.location.href : 'https://portal.yousafeconsultancy.com/',
        },
        redirect: 'if_required',
      })
      if (confirmError) {
        setError(confirmError.message || 'Payment failed. Try a different card.')
        return
      }
      if (!paymentIntent || (paymentIntent.status !== 'succeeded' && paymentIntent.status !== 'processing')) {
        setError(`Unexpected payment status: ${paymentIntent?.status ?? 'unknown'}`)
        return
      }
      onPaid?.()
      onClose()
    } catch (err: any) {
      setError(err?.message || 'Payment failed.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget && !submitting) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 10020,
        background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16, fontFamily: SANS,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 460, maxWidth: '100%',
          maxHeight: 'calc(100vh - 32px)', overflowY: 'auto',
          background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 14,
          boxShadow: '0 24px 48px rgba(15,23,42,0.2)',
        }}
      >
        {/* Gold accent stripe */}
        <div style={{ height: 3, background: `linear-gradient(90deg, ${GOLD} 0%, #C4A45A 50%, ${GOLD} 100%)` }} />

        {/* Header */}
        <div style={{ padding: '16px 20px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: GOLD, fontFamily: MONO }}>
              💳 Complete payment
            </div>
            <h2 style={{ margin: '4px 0 0', fontFamily: SERIF, fontSize: 20, fontWeight: 600, color: TEXT, letterSpacing: '-0.005em' }}>
              {meta?.title || 'Custom offer'}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => { if (!submitting) onClose() }}
            aria-label="Close payment"
            disabled={submitting}
            style={{
              border: 'none', background: 'transparent', cursor: submitting ? 'not-allowed' : 'pointer',
              fontSize: 22, lineHeight: 1, color: DIM, padding: 4,
            }}
          >×</button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} style={{ padding: '8px 20px 20px' }}>
          {loading && (
            <div style={{ padding: '40px 0', textAlign: 'center', color: MUTED, fontSize: 13 }}>
              Preparing secure payment…
            </div>
          )}

          {!loading && error && !stripe && (
            <div style={{
              background: `${RED}10`, color: RED, padding: '12px 14px',
              borderRadius: 8, fontSize: 13, lineHeight: 1.5,
            }}>
              {error}
            </div>
          )}

          {!loading && stripe && (
            <>
              {/* Breakdown */}
              {meta?.breakdown && (
                <div style={{
                  background: SURFACE2, border: `1px solid ${BORDER}`,
                  borderRadius: 10, padding: '12px 14px', marginBottom: 14,
                  fontSize: 13,
                }}>
                  <Row label="Subtotal" value={formatMoney(meta.breakdown.subtotal, meta.currency)} />
                  {meta.breakdown.platform_fee > 0 && (
                    <Row label="Platform fee" value={formatMoney(meta.breakdown.platform_fee, meta.currency)} muted />
                  )}
                  <div style={{ height: 1, background: BORDER, margin: '8px 0' }} />
                  <Row
                    label="Total today"
                    value={formatMoney(meta.breakdown.total, meta.currency)}
                    bold
                  />
                </div>
              )}

              {/* Stripe Payment Element mount point */}
              <div ref={elementsRef} style={{ marginBottom: 14 }} />

              {error && (
                <div style={{
                  background: `${RED}10`, color: RED, padding: '8px 12px',
                  borderRadius: 8, fontSize: 12, marginBottom: 10, lineHeight: 1.5,
                }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                style={{
                  width: '100%', padding: '12px 16px', borderRadius: 10, border: 'none',
                  background: submitting ? `${MUTED}` : NAVY, color: '#fff',
                  fontWeight: 700, fontSize: 14, cursor: submitting ? 'wait' : 'pointer',
                  fontFamily: SANS,
                }}
              >
                {submitting
                  ? 'Processing…'
                  : meta?.breakdown
                    ? `Pay ${formatMoney(meta.breakdown.total, meta.currency)}`
                    : 'Pay now'}
              </button>

              <p style={{ margin: '10px 0 0', fontSize: 11, color: DIM, textAlign: 'center', lineHeight: 1.5 }}>
                🔒 Encrypted by Stripe · Funds held in escrow until delivery is approved.
              </p>
            </>
          )}
        </form>
      </div>
    </div>
  )
}

function Row({ label, value, muted, bold }: { label: string; value: string; muted?: boolean; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0' }}>
      <span style={{ color: muted ? MUTED : TEXT, fontWeight: bold ? 700 : 500 }}>{label}</span>
      <span style={{ color: TEXT, fontWeight: bold ? 700 : 500, fontFamily: MONO, fontSize: 13 }}>{value}</span>
    </div>
  )
}

export default OfferPaymentModal
