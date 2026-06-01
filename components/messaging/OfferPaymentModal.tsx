'use client'
/**
 * OfferPaymentModal
 *
 * 3-method payment flow for accepting a custom offer:
 *   1. Wallet balance
 *   2. Saved card (vault charge)
 *   3. New card (gateway-agnostic tokenization via CardFields — NMI Collect.js
 *      or Authorize.net Accept.js depending on /api/payments/config).
 */
import { useEffect, useRef, useState } from 'react'
import CardFields, { type CardFieldsHandle, type CardTokenResult } from '@/components/payments/CardFields'

const NAVY = '#0F172A'
const GOLD = '#9A7B3B'
const RED  = '#8B1A1A'
const GREEN = '#1A6B45'
const CYAN = '#3C3B6E'
const SURFACE  = '#FFFFFF'
const SURFACE2 = '#FAFAF7'
const BORDER   = '#E5E0D6'
const BORDER2  = 'rgba(0,0,0,0.12)'
const TEXT  = '#1A1F2E'
const MUTED = '#5C6070'
const DIM   = '#9097A8'
const SERIF = `'Cormorant Garamond', Georgia, serif`
const SANS  = `-apple-system, BlinkMacSystemFont, 'Inter', sans-serif`

const TERMS_URL = 'https://usa.yousafeconsultancy.com/terms-of-service'
const REFUND_POLICY_URL = 'https://yousafeconsultancy.com/refund-policy'

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

interface SavedCard {
  id: string
  brand: string | null
  last4: string
  exp_month: number | null
  exp_year: number | null
  is_default: boolean
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

function cardLabel(card: SavedCard): string {
  const brand = (card.brand || 'CARD').toUpperCase()
  const expMonth = String(card.exp_month ?? '').padStart(2, '0')
  const expYear = String(card.exp_year ?? '').slice(-2)
  const exp = expMonth && expYear ? ` · exp ${expMonth}/${expYear}` : ''
  const def = card.is_default ? ' · default' : ''
  return `${brand} ••••${card.last4}${exp}${def}`
}

export function OfferPaymentModal({ offerId, open, onClose, onPaid }: OfferPaymentModalProps) {
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [meta, setMeta] = useState<{ title: string; currency: string; breakdown?: Breakdown } | null>(null)
  const [walletCents, setWalletCents] = useState<number | null>(null)
  const [requiredCents, setRequiredCents] = useState<number | null>(null)

  const [payMethod, setPayMethod] = useState<'wallet' | 'saved_card' | 'new_card'>('wallet')
  const [savedCards, setSavedCards] = useState<SavedCard[]>([])
  const [selectedCardId, setSelectedCardId] = useState<string>('')
  const [newCardToken, setNewCardToken] = useState<CardTokenResult | null>(null)
  const [cardError, setCardError] = useState<string | null>(null)
  const cardFieldsRef = useRef<CardFieldsHandle>(null)
  // setState is async; capture the freshest tokenization result so handlePay
  // can POST it in the same tick the user clicked.
  const latestTokenRef = useRef<CardTokenResult | null>(null)

  // Reset state when modal opens
  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError(null)
    setMeta(null)
    setWalletCents(null)
    setRequiredCents(null)
    setPayMethod('wallet')
    setSavedCards([])
    setSelectedCardId('')
    setNewCardToken(null)
    setCardError(null)

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
        const breakdown = payload?.breakdown
        const total = Number(breakdown?.total ?? 0)
        const balance = Number(payload?.balanceCents ?? 0)
        const cards: SavedCard[] = payload?.savedCards ?? []

        setMeta({
          title: payload?.offer?.title || 'Custom offer',
          currency: payload?.offer?.currency || 'USD',
          breakdown,
        })
        setWalletCents(balance)
        setRequiredCents(total)
        setSavedCards(cards)

        // Default selected card
        const defaultCard = cards.find(c => c.is_default)
        setSelectedCardId(defaultCard?.id || cards[0]?.id || '')

        // Default payMethod
        if (balance >= total) {
          setPayMethod('wallet')
        } else if (cards.length > 0) {
          setPayMethod('saved_card')
        } else {
          setPayMethod('new_card')
        }
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
    setSubmitting(true)
    setError(null)

    // New-card path: tokenize at click-time so the user only sees one button.
    // CardFields.tokenize() resolves after onToken (we capture into newCardToken).
    // We read the freshly-tokenized result via a local variable too because
    // setState is async and we want to POST in the same tick.
    let tokenResult: CardTokenResult | null = newCardToken
    if (payMethod === 'new_card' && !tokenResult) {
      try {
        await cardFieldsRef.current?.tokenize()
        // After tokenize resolves, onToken has fired and updated state. The
        // ref-bound callback also stashes the latest result here.
        tokenResult = latestTokenRef.current
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Card tokenization failed')
        setSubmitting(false)
        return
      }
      if (!tokenResult) {
        setError('Card tokenization did not return a token')
        setSubmitting(false)
        return
      }
    }

    try {
      const body =
        payMethod === 'wallet'      ? { paymentMethod: 'wallet' } :
        payMethod === 'saved_card'  ? { paymentMethod: 'saved_card', paymentMethodId: selectedCardId } :
                                      { paymentMethod: 'new_card', token: tokenResult!.token, gateway: tokenResult!.gateway }

      const res = await fetch(`/api/offers/${offerId}/accept`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (res.status === 402 && payMethod === 'wallet') {
          setWalletCents(Number(json?.error?.balanceCents ?? walletCents ?? 0))
          setRequiredCents(Number(json?.error?.requiredCents ?? requiredCents ?? 0))
        }
        setError(extractErrorMessage(json, res.status))
        setSubmitting(false)
        return
      }
      onPaid?.()
      onClose()
    } catch (e: any) {
      setError(e instanceof Error ? e.message : 'Payment failed.')
      setSubmitting(false)
    }
  }

  if (!open) return null

  const totalCents = meta?.breakdown?.total ?? 0
  const currency = meta?.currency || 'USD'
  const canPayWallet = walletCents !== null && walletCents >= totalCents && totalCents > 0
  const selectedCard = savedCards.find(c => c.id === selectedCardId)

  // Pay button label & disabled state
  let payLabel = 'Processing…'
  let payDisabled = submitting
  if (!submitting) {
    if (payMethod === 'wallet') {
      payLabel = `Pay ${formatMoney(totalCents, currency)} from wallet`
      payDisabled = payDisabled || !canPayWallet
    } else if (payMethod === 'saved_card') {
      if (savedCards.length === 0) {
        payLabel = 'No saved cards available'
        payDisabled = true
      } else if (!selectedCardId) {
        payLabel = 'Choose a saved card'
        payDisabled = true
      } else {
        payLabel = `Pay ${formatMoney(totalCents, currency)} with ${(selectedCard?.brand || 'CARD').toUpperCase()} ••••${selectedCard?.last4 || ''}`
      }
    } else {
      // New-card flow: tokenization is folded into handlePay (one-click pay),
      // so the button is always enabled. CardFields.tokenize() surfaces any
      // validation / SDK errors via setCardError.
      payLabel = `Pay ${formatMoney(totalCents, currency)} with new card`
    }
  }

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Payment modal"
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
          <button onClick={onClose} aria-label="Close payment modal" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: DIM, lineHeight: 1 }}>×</button>
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

            {/* Payment method picker */}
            <div role="radiogroup" aria-label="Choose payment method" style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
              {/* Wallet option */}
              <button
                type="button"
                role="radio"
                aria-checked={payMethod === 'wallet'}
                onClick={() => canPayWallet && setPayMethod('wallet')}
                disabled={!canPayWallet}
                style={{
                  width: '100%', textAlign: 'left', padding: '14px', borderRadius: 12,
                  border: `2px solid ${payMethod === 'wallet' ? NAVY : BORDER}`,
                  background: payMethod === 'wallet' ? `${NAVY}10` : SURFACE2,
                  cursor: canPayWallet ? 'pointer' : 'not-allowed',
                  opacity: canPayWallet ? 1 : 0.5,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  fontFamily: SANS, fontSize: 14, color: TEXT,
                }}
              >
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <span style={{ fontSize: 20 }}>💰</span>
                  <div>
                    <div style={{ fontWeight: 600 }}>Wallet balance</div>
                    <div style={{ fontSize: 12, color: MUTED }}>
                      {walletCents === null ? '—' : formatMoney(walletCents, currency)} available
                      {!canPayWallet && walletCents !== null && <span style={{ color: RED, marginLeft: 6 }}>· insufficient</span>}
                    </div>
                  </div>
                </div>
                {payMethod === 'wallet' && <span style={{ color: NAVY, fontWeight: 700 }}>✓</span>}
              </button>

              {/* Saved card option.
                  IMPORTANT: do NOT use the disabled attribute when savedCards
                  is empty. The inner "add one from billing" link span needs to
                  receive click events; browsers silently swallow pointer events
                  on every descendant of a `disabled` button. Use aria-disabled
                  for assistive tech + the onClick guard for selection. */}
              <button
                type="button"
                role="radio"
                aria-checked={payMethod === 'saved_card'}
                aria-disabled={savedCards.length === 0}
                onClick={() => savedCards.length > 0 && setPayMethod('saved_card')}
                style={{
                  width: '100%', textAlign: 'left', padding: '14px', borderRadius: 12,
                  border: `2px solid ${payMethod === 'saved_card' ? NAVY : BORDER}`,
                  background: payMethod === 'saved_card' ? `${NAVY}10` : SURFACE2,
                  cursor: savedCards.length > 0 ? 'pointer' : 'default',
                  opacity: savedCards.length > 0 ? 1 : 0.7,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  fontFamily: SANS, fontSize: 14, color: TEXT,
                }}
              >
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <span style={{ fontSize: 20 }}>💳</span>
                  <div>
                    <div style={{ fontWeight: 600 }}>Saved card</div>
                    <div style={{ fontSize: 12, color: MUTED }}>
                      {savedCards.length === 0
                        ? (
                            <span>
                              No saved cards yet —{' '}
                              {/* Anchor tags inside a <button> are swallowed by the browser
                                  (interactive children aren't allowed inside button). Use a
                                  span + click handler: stop propagation so the parent radio
                                  button doesn't toggle, dispatch yousafe-navigate so the
                                  StudentApp host switches tabs, fall back to a hard nav. */}
                              <span
                                role="link"
                                tabIndex={0}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  e.preventDefault()
                                  onClose()
                                  if (typeof window !== 'undefined') {
                                    window.dispatchEvent(new CustomEvent('yousafe-navigate', { detail: { page: 'billing' } }))
                                    // Hard-nav fallback if no handler picks up the event
                                    // (e.g. modal opened outside the student dashboard).
                                    setTimeout(() => {
                                      if (!window.location.search.includes('goto=billing')) {
                                        // /student does not exist as a page route — the
                                        // student dashboard lives at /dashboard (which
                                        // mounts StudentApp and reads ?goto= internally).
                                        window.location.assign('/dashboard?goto=billing')
                                      }
                                    }, 50)
                                  }
                                }}
                                style={{ color: CYAN, textDecoration: 'underline', cursor: 'pointer' }}
                              >
                                add one from billing
                              </span>
                            </span>
                          )
                        : selectedCard ? cardLabel(selectedCard) : 'Choose a saved card'
                      }
                    </div>
                  </div>
                </div>
                {payMethod === 'saved_card' && <span style={{ color: NAVY, fontWeight: 700 }}>✓</span>}
              </button>

              {/* Saved card dropdown */}
              {payMethod === 'saved_card' && savedCards.length > 0 && (
                <select
                  aria-label="Choose a saved card"
                  value={selectedCardId}
                  onChange={e => setSelectedCardId(e.target.value)}
                  style={{
                    width: '100%', padding: '12px 14px', borderRadius: 10, border: `1px solid ${BORDER}`,
                    background: SURFACE, fontFamily: SANS, fontSize: 13, color: TEXT, cursor: 'pointer',
                  }}
                >
                  {savedCards.map(card => (
                    <option key={card.id} value={card.id}>{cardLabel(card)}</option>
                  ))}
                </select>
              )}

              {/* New card option */}
              <button
                type="button"
                role="radio"
                aria-checked={payMethod === 'new_card'}
                onClick={() => { setPayMethod('new_card') }}
                style={{
                  width: '100%', textAlign: 'left', padding: '14px', borderRadius: 12,
                  border: `2px solid ${payMethod === 'new_card' ? NAVY : BORDER}`,
                  background: payMethod === 'new_card' ? `${NAVY}10` : SURFACE2,
                  cursor: 'pointer',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  fontFamily: SANS, fontSize: 14, color: TEXT,
                }}
              >
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <span style={{ fontSize: 20 }}>💳</span>
                  <div>
                    <div style={{ fontWeight: 600 }}>New card</div>
                    <div style={{ fontSize: 12, color: MUTED }}>Enter card details — tokenized securely before submission</div>
                  </div>
                </div>
                {payMethod === 'new_card' && <span style={{ color: NAVY, fontWeight: 700 }}>✓</span>}
              </button>

              {/* New card inline fields (gateway-agnostic) */}
              {payMethod === 'new_card' && (
                <div style={{ margin: '-2px 0 0 0' }}>
                  {cardError && (
                    <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#EF4444', marginBottom: 10 }}>
                      {cardError}
                    </div>
                  )}
                  <CardFields
                    ref={cardFieldsRef}
                    fieldStyle={{ border: `1px solid ${BORDER2}` }}
                    onError={setCardError}
                    onToken={(result) => {
                      latestTokenRef.current = result
                      setNewCardToken(result)
                      setCardError(null)
                    }}
                  />
                </div>
              )}
            </div>

            {/* Top-up block (wallet only, insufficient) */}
            {payMethod === 'wallet' && !canPayWallet && walletCents !== null && totalCents > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 10, padding: '12px 14px', fontSize: 13, color: '#92400e' }}>
                  Insufficient wallet balance. Top up your wallet first.
                  {requiredCents !== null && walletCents !== null && (
                    <div style={{ marginTop: 4, fontSize: 12, opacity: 0.85 }}>
                      Required: {formatMoney(requiredCents, currency)} · Available: {formatMoney(walletCents, currency)}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onClose()
                    if (typeof window !== 'undefined') {
                      window.dispatchEvent(new CustomEvent('yousafe-navigate', { detail: { page: 'billing' } }))
                      setTimeout(() => {
                        if (!window.location.search.includes('goto=billing')) {
                          // /student does not exist — student dashboard is at /dashboard.
                          window.location.assign('/dashboard?goto=billing')
                        }
                      }, 50)
                    }
                  }}
                  style={{ display: 'block', width: '100%', textAlign: 'center', padding: '12px', borderRadius: 10, background: NAVY, color: '#fff', fontSize: 15, fontWeight: 700, border: 'none', cursor: 'pointer' }}
                >
                  + Top up wallet
                </button>
              </div>
            )}

            {error && (
              <div style={{ background: 'rgba(139,26,26,0.08)', border: `1px solid ${RED}44`, borderRadius: 10, padding: '10px 14px', fontSize: 13, color: RED, marginBottom: 14 }}>
                {error}
                {requiredCents !== null && walletCents !== null && walletCents < requiredCents && (
                  <div style={{ marginTop: 8, fontSize: 12, color: MUTED }}>
                    Required: {formatMoney(requiredCents, currency)} · Available: {formatMoney(walletCents, currency)}
                  </div>
                )}
              </div>
            )}

            {/* Pay button */}
            <button
              onClick={handlePay}
              disabled={payDisabled}
              style={{
                width: '100%', padding: '14px', borderRadius: 10, background: NAVY, color: '#fff',
                fontSize: 15, fontWeight: 700, border: 'none',
                cursor: payDisabled ? 'not-allowed' : 'pointer',
                opacity: payDisabled ? 0.7 : 1,
              }}
            >
              {payLabel}
            </button>

            {/* Fine-print disclosure */}
            <p style={{ fontSize: 11, color: MUTED, textAlign: 'center', marginTop: 10, lineHeight: 1.5 }}>
              By placing this order you agree to the{' '}
              <a href={TERMS_URL} target="_blank" rel="noreferrer" style={{ color: MUTED, textDecoration: 'underline' }}>Terms of Service</a>{' '}
              and{' '}
              <a href={REFUND_POLICY_URL} target="_blank" rel="noreferrer" style={{ color: MUTED, textDecoration: 'underline' }}>Refund Policy</a>.
            </p>

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
