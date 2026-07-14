'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { useUser } from '@clerk/nextjs'
import { useCart } from '@/components/cart/CartProvider'
import { getTemplatePack } from '@/lib/template-packs'

const C = {
  bg: '#F7F8FA',
  surface: '#FFFFFF',
  surface2: '#F4F2EE',
  border: 'rgba(0,0,0,0.08)',
  cyan: '#3C3B6E',
  text: '#1F2937',
  textMuted: '#6B7280',
  textDim: '#9CA3AF',
  danger: '#8B1A1A',
  dangerBg: '#FAEAEA',
  success: '#1A6B45',
  purple: '#3C3B6E',
}

const SERIF = "'Cormorant Garamond', 'Garamond', Georgia, 'Times New Roman', serif"
const SANS = "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif"

interface PaymentConfig {
  provider: string
  mode: 'inline-token' | 'hosted-redirect' | 'manual-invoice'
  tokenizationKey?: string
  scriptUrl?: string
  publicKey?: string
}

interface SavedCard {
  id: string
  brand: string
  last4: string
  exp_month: number
  exp_year: number
  is_default: boolean
}

export default function CartPage() {
  const { items, removeItem, setQuantity, subtotalCents, clear, addItem } = useCart()
  const searchParams = useSearchParams()
  const router = useRouter()
  const { isSignedIn, user } = useUser()

  const [paymentConfig, setPaymentConfig] = useState<PaymentConfig | null>(null)
  const [configLoading, setConfigLoading] = useState(false)
  const [configError, setConfigError] = useState<string | null>(null)
  const [customerEmail, setCustomerEmail] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const collectJsLoaded = useRef(false)

  // Wallet and Saved Card state (signed-in only)
  const [walletBalanceCents, setWalletBalanceCents] = useState<number | null>(null)
  const [walletLoading, setWalletLoading] = useState(false)
  const [savedCards, setSavedCards] = useState<SavedCard[]>([])
  const [selectedCardId, setSelectedCardId] = useState('')
  const [payMethod, setPayMethod] = useState<'wallet' | 'card' | 'saved_card'>('wallet')
  const [hasSetDefaultPayMethod, setHasSetDefaultPayMethod] = useState(false)

  // Ensure the canonical URL always points to the clean /marketplace/cart
  // path, so any ?add=* query-param variant is consolidated under the
  // base URL. Screaming Frog flagged 10+ cart?add=... URLs as indexable
  // query-param duplicates; this canonical prevents them from competing.
  useEffect(() => {
    const existing = document.querySelector('link[rel="canonical"]')
    if (existing) {
      existing.setAttribute('href', '/marketplace/cart')
    } else {
      const link = document.createElement('link')
      link.rel = 'canonical'
      link.href = '/marketplace/cart'
      document.head.appendChild(link)
    }
  }, [])

  // Handle ?add=slug from product pages
  useEffect(() => {
    const addSlug = searchParams?.get('add')
    if (addSlug) {
      const pack = getTemplatePack(addSlug)
      if (pack) {
        addItem({
          slug: pack.slug,
          name: pack.name,
          priceUsdCents: Math.round(pack.price_usd * 100),
        })
      }
      router.replace('/marketplace/cart')
    }
  }, [searchParams, addItem, router])

  // Load wallet balance and saved cards when signed in
  useEffect(() => {
    if (!isSignedIn) return
    setWalletLoading(true)
    fetch('/api/wallet/balance', { credentials: 'same-origin' })
      .then(r => r.json().catch(() => ({})))
      .then(d => {
        setWalletBalanceCents(Number(d.balanceCents ?? 0))
      })
      .catch(() => setWalletBalanceCents(0))
      .finally(() => setWalletLoading(false))

    fetch('/api/wallet/payment-methods', { credentials: 'same-origin' })
      .then(r => r.json())
      .then(d => {
        const cards = d.cards ?? []
        setSavedCards(cards)
        setSelectedCardId(cards.find((c: SavedCard) => c.is_default)?.id || cards[0]?.id || '')
      })
      .catch(() => setSavedCards([]))
  }, [isSignedIn])

  // Select default payment method once balance and cards are loaded
  useEffect(() => {
    if (!isSignedIn || walletBalanceCents === null || hasSetDefaultPayMethod) return
    const canUseWallet = walletBalanceCents >= subtotalCents
    let selected: 'wallet' | 'saved_card' | 'card' = 'wallet'
    if (canUseWallet) {
      selected = 'wallet'
    } else if (savedCards.length > 0) {
      selected = 'saved_card'
    } else {
      selected = 'card'
    }
    setPayMethod(selected)
    setHasSetDefaultPayMethod(true)
  }, [isSignedIn, walletBalanceCents, savedCards, subtotalCents, hasSetDefaultPayMethod])

  const loadPaymentConfig = useCallback(async () => {
    if (items.length === 0) return
    setConfigLoading(true)
    setConfigError(null)
    try {
      const res = await fetch('/api/payments/config', { cache: 'no-store' })
      if (!res.ok) throw new Error('Could not load payment configuration')
      const data = await res.json()
      setPaymentConfig(data)
    } catch (err) {
      setConfigError(err instanceof Error ? err.message : 'Failed to load payment config')
    } finally {
      setConfigLoading(false)
    }
  }, [items.length])

  // Load Collect.js when config is available for inline-token mode
  useEffect(() => {
    if (!paymentConfig || paymentConfig.mode !== 'inline-token' || collectJsLoaded.current) return
    if (!paymentConfig.scriptUrl || !paymentConfig.tokenizationKey) return

    const existing = document.querySelector(`script[src="${paymentConfig.scriptUrl}"]`)
    if (existing) {
      collectJsLoaded.current = true
      initCollectJs()
      return
    }

    const script = document.createElement('script')
    script.src = paymentConfig.scriptUrl
    script.async = true
    script.dataset.tokenizationKey = paymentConfig.tokenizationKey
    script.onload = () => {
      collectJsLoaded.current = true
      initCollectJs()
    }
    script.onerror = () => {
      setConfigError('Failed to load payment tokenization library')
    }
    document.body.appendChild(script)
  }, [paymentConfig])

  function initCollectJs() {
    if (typeof window === 'undefined') return
    const CollectJS = (window as any).CollectJS
    if (!CollectJS) {
      setConfigError('Payment tokenization library not available')
      return
    }
    try {
      CollectJS.configure({
        variant: 'inline',
        fields: {
          ccnumber: { placeholder: 'Card number', selector: '#nmi-card-number' },
          ccexp: { placeholder: 'MM / YY', selector: '#nmi-card-expiry' },
          cvv: { placeholder: 'CVV', selector: '#nmi-card-cvv' },
        },
        callback: (response: any) => {
          if (response.token) {
            handleCardToken(response.token)
          } else {
            setCheckoutError(response.message || 'Card tokenization failed')
            setIsSubmitting(false)
          }
        },
      })
    } catch (err) {
      setConfigError('Could not initialise payment fields')
    }
  }

  // One idempotency key per checkout attempt — retries replay the stored
  // server outcome instead of double-debiting the wallet.
  const idemKeyRef = useRef<string | null>(null)

  async function handleWalletCheckout() {
    setCheckoutError(null)
    setIsSubmitting(true)
    idemKeyRef.current ||= crypto.randomUUID()
    try {
      const res = await fetch('/api/wallet/debit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          items: items.map((i) => ({ slug: i.slug, quantity: i.quantity })),
          idempotencyKey: idemKeyRef.current,
        }),
      })
      if (res.ok) idemKeyRef.current = null
      const data = await res.json()
      if (!res.ok || !data.ok) {
        if (res.status === 402 && data.balanceCents !== undefined) {
          setWalletBalanceCents(data.balanceCents)
          setCheckoutError(`Insufficient balance. You have $${(data.balanceCents / 100).toFixed(2)} but need $${(data.requiredCents / 100).toFixed(2)}.`)
        } else {
          setCheckoutError(data.error || 'Payment failed.')
        }
        setIsSubmitting(false)
        return
      }
      clear()
      router.push(`/marketplace/order/success?orderId=${data.orderId}`)
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : 'Payment request failed')
      setIsSubmitting(false)
    }
  }

  async function handleSavedCardPay() {
    if (!selectedCardId) { setCheckoutError('Choose a saved card first.'); return }
    setIsSubmitting(true); setCheckoutError(null)
    try {
      const res = await fetch('/api/payments/charge', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentMethodId: selectedCardId,
          items: items.map(item => ({ slug: item.slug, quantity: item.quantity })),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        setCheckoutError(typeof data.message === 'string' ? data.message : data.error || 'Payment was declined.')
        setIsSubmitting(false)
        return
      }
      clear()
      router.push(data.orderId ? `/marketplace/order/success?orderId=${data.orderId}` : '/marketplace/order/success')
    } catch (e: any) {
      setCheckoutError(e?.message || 'Payment failed.')
      setIsSubmitting(false)
    }
  }

  async function handleCardToken(token: string) {
    setCheckoutError(null)
    try {
      const res = await fetch('/api/payments/charge', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token,
          items: items.map((i) => ({ slug: i.slug, quantity: i.quantity })),
          customer: { email: customerEmail, name: customerName },
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setCheckoutError(data.message || 'Payment was declined. Please check your card details and try again.')
        setIsSubmitting(false)
        return
      }
      clear()
      router.push(`/marketplace/order/success?orderId=${data.orderId}`)
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : 'Payment request failed')
      setIsSubmitting(false)
    }
  }

  function handleCheckoutSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (items.length === 0) {
      setCheckoutError('Your cart is empty')
      return
    }

    // Signed-in + wallet selected
    if (isSignedIn && payMethod === 'wallet') {
      handleWalletCheckout()
      return
    }

    // Signed-in + saved card selected
    if (isSignedIn && payMethod === 'saved_card') {
      handleSavedCardPay()
      return
    }

    // Guest or card-selected path
    if (!customerEmail || !customerName) {
      setCheckoutError('Please enter your name and email')
      return
    }
    setIsSubmitting(true)
    setCheckoutError(null)

    if (paymentConfig?.mode === 'inline-token') {
      const CollectJS = (window as any).CollectJS
      if (!CollectJS) {
        setCheckoutError('Payment system not ready')
        setIsSubmitting(false)
        return
      }
      CollectJS.startPaymentRequest()
    } else if (paymentConfig?.mode === 'hosted-redirect') {
      setCheckoutError('Hosted redirect checkout is not yet available.')
      setIsSubmitting(false)
    } else if (paymentConfig?.mode === 'manual-invoice') {
      setCheckoutError('Invoice checkout is not yet available.')
      setIsSubmitting(false)
    } else {
      setCheckoutError('Payment provider not configured')
      setIsSubmitting(false)
    }
  }

  const subtotalFormatted = (subtotalCents / 100).toFixed(2)
  const canUseWallet = walletBalanceCents !== null && walletBalanceCents >= subtotalCents
  const selectedCard = savedCards.find((c) => c.id === selectedCardId)

  return (
    <main style={{ maxWidth: '800px', margin: '0 auto', padding: '48px 24px 80px', fontFamily: SANS, color: C.text }}>
      <h1 style={{ fontFamily: SERIF, fontSize: '32px', fontWeight: 500, margin: '0 0 32px', letterSpacing: '-0.015em' }}>
        Your Cart
      </h1>

      {items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px 24px', background: C.surface, borderRadius: '12px', border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: '40px', marginBottom: '16px' }}>🛒</div>
          <h2 style={{ fontFamily: SERIF, fontSize: '22px', fontWeight: 500, margin: '0 0 8px' }}>Your cart is empty</h2>
          <p style={{ fontSize: '15px', color: C.textMuted, margin: '0 0 24px' }}>
            Browse our template packs and add the ones you need.
          </p>
          <Link
            href="/marketplace"
            style={{
              display: 'inline-block',
              padding: '10px 24px',
              borderRadius: '8px',
              background: C.cyan,
              color: '#fff',
              fontSize: '15px',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Browse Templates
          </Link>
        </div>
      ) : (
        <>
          {/* Cart items */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '32px' }}>
            {items.map((item) => (
              <div
                key={item.slug}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  background: C.surface,
                  border: `1px solid ${C.border}`,
                  borderRadius: '10px',
                  padding: '16px 20px',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '15px', marginBottom: '2px' }}>{item.name}</div>
                  <div style={{ fontSize: '13px', color: C.textMuted }}>
                    ${(item.priceUsdCents / 100).toFixed(2)} each
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    onClick={() => setQuantity(item.slug, item.quantity - 1)}
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '6px',
                      border: `1px solid ${C.border}`,
                      background: C.surface2,
                      cursor: 'pointer',
                      fontSize: '16px',
                      fontWeight: 600,
                    }}
                    aria-label="Decrease quantity"
                  >
                    −
                  </button>
                  <span style={{ minWidth: '24px', textAlign: 'center', fontSize: '15px', fontWeight: 600 }}>
                    {item.quantity}
                  </span>
                  <button
                    onClick={() => setQuantity(item.slug, item.quantity + 1)}
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '6px',
                      border: `1px solid ${C.border}`,
                      background: C.surface2,
                      cursor: 'pointer',
                      fontSize: '16px',
                      fontWeight: 600,
                    }}
                    aria-label="Increase quantity"
                  >
                    +
                  </button>
                </div>
                <div style={{ minWidth: '80px', textAlign: 'right', fontWeight: 700, fontSize: '16px', fontFamily: SERIF }}>
                  ${((item.priceUsdCents * item.quantity) / 100).toFixed(2)}
                </div>
                <button
                  onClick={() => removeItem(item.slug)}
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '6px',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    fontSize: '18px',
                    color: C.textDim,
                  }}
                  aria-label="Remove item"
                  title="Remove"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          {/* Subtotal */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '20px 0',
              borderTop: `1px solid ${C.border}`,
              borderBottom: `1px solid ${C.border}`,
              marginBottom: '32px',
            }}
          >
            <span style={{ fontSize: '16px', fontWeight: 600 }}>Subtotal</span>
            <span style={{ fontSize: '24px', fontWeight: 700, fontFamily: SERIF, color: C.cyan }}>
              ${subtotalFormatted}
            </span>
          </div>

          {/* Checkout section */}
          <div>
            {!paymentConfig ? (
              <button
                onClick={loadPaymentConfig}
                disabled={configLoading}
                style={{
                  width: '100%',
                  padding: '14px 24px',
                  borderRadius: '8px',
                  background: C.cyan,
                  color: '#fff',
                  fontSize: '16px',
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                {configLoading ? 'Loading…' : 'Proceed to Checkout'}
              </button>
            ) : (
              <form onSubmit={handleCheckoutSubmit}>
                <h2 style={{ fontFamily: SERIF, fontSize: '22px', fontWeight: 500, margin: '0 0 20px' }}>
                  Payment Details
                </h2>

                {configError && (
                  <div style={{ background: C.dangerBg, color: C.danger, padding: '12px 16px', borderRadius: '8px', fontSize: '14px', marginBottom: '16px' }}>
                    {configError}
                  </div>
                )}

                {/* Signed-in wallet section */}
                {isSignedIn && (
                  <div style={{ marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {/* Wallet Option */}
                    <div
                      onClick={() => setPayMethod('wallet')}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '14px 16px',
                        borderRadius: '10px',
                        border: `2px solid ${payMethod === 'wallet' ? C.cyan : C.border}`,
                        background: payMethod === 'wallet' ? `${C.cyan}08` : C.surface2,
                        cursor: 'pointer',
                      }}
                    >
                      <input type="radio" checked={payMethod === 'wallet'} readOnly style={{ accentColor: C.cyan }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: '14px' }}>Pay with wallet</div>
                        <div style={{ fontSize: '12px', color: C.textMuted }}>
                          {walletLoading
                            ? 'Loading balance…'
                            : walletBalanceCents === null
                              ? 'Unable to load balance'
                              : `Balance: $${(walletBalanceCents / 100).toFixed(2)}`}
                        </div>
                      </div>
                      {canUseWallet && payMethod === 'wallet' && (
                        <span style={{ color: C.success, fontWeight: 700, fontSize: '12px' }}>✓ Sufficient</span>
                      )}
                      {!canUseWallet && walletBalanceCents !== null && payMethod === 'wallet' && (
                        <span style={{ color: C.danger, fontWeight: 700, fontSize: '12px' }}>Insufficient</span>
                      )}
                    </div>

                    {!canUseWallet && walletBalanceCents !== null && payMethod === 'wallet' && (
                      <div style={{ paddingLeft: '28px' }}>
                        <Link
                          href="/dashboard?goto=billing"
                          style={{
                            display: 'inline-block',
                            padding: '8px 16px',
                            borderRadius: '6px',
                            background: C.cyan,
                            color: '#fff',
                            fontSize: '13px',
                            fontWeight: 600,
                            textDecoration: 'none',
                          }}
                        >
                          + Top up wallet
                        </Link>
                      </div>
                    )}

                    {/* Saved Card Option */}
                    <div
                      onClick={() => {
                        if (savedCards.length > 0) setPayMethod('saved_card')
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '14px 16px',
                        borderRadius: '10px',
                        border: `2px solid ${payMethod === 'saved_card' ? C.cyan : C.border}`,
                        background: payMethod === 'saved_card' ? `${C.cyan}08` : C.surface2,
                        opacity: savedCards.length === 0 ? 0.6 : 1,
                        cursor: savedCards.length === 0 ? 'not-allowed' : 'pointer',
                      }}
                    >
                      <input
                        type="radio"
                        checked={payMethod === 'saved_card'}
                        disabled={savedCards.length === 0}
                        readOnly
                        style={{ accentColor: C.cyan }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: '14px' }}>Pay with saved card</div>
                        <div style={{ fontSize: '12px', color: C.textMuted }}>
                          {savedCards.length === 0
                            ? 'No saved cards — add one from billing'
                            : selectedCard
                              ? `${(selectedCard.brand || 'CARD').toUpperCase()} ••••${selectedCard.last4} · exp ${String(selectedCard.exp_month).padStart(2, '0')}/${String(selectedCard.exp_year).slice(-2)}`
                              : 'Select a saved card below'}
                        </div>
                      </div>
                    </div>

                    {payMethod === 'saved_card' && savedCards.length > 0 && (
                      <div style={{ paddingLeft: '28px' }}>
                        <select
                          value={selectedCardId}
                          onChange={(e) => setSelectedCardId(e.target.value)}
                          aria-label="Choose a saved card"
                          style={{
                            width: '100%',
                            border: `1px solid ${C.border}`,
                            borderRadius: '8px',
                            padding: '10px 12px',
                            background: C.surface,
                            color: C.text,
                            fontSize: '14px',
                            fontFamily: SANS,
                          }}
                        >
                          {savedCards.map((card) => (
                            <option key={card.id} value={card.id}>
                              {(card.brand || 'CARD').toUpperCase()} ••••{card.last4} · exp {String(card.exp_month).padStart(2, '0')}/{String(card.exp_year).slice(-2)}{card.is_default ? ' · default' : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* New Card Option */}
                    <div
                      onClick={() => setPayMethod('card')}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '14px 16px',
                        borderRadius: '10px',
                        border: `2px solid ${payMethod === 'card' ? C.cyan : C.border}`,
                        background: payMethod === 'card' ? `${C.cyan}08` : C.surface2,
                        cursor: 'pointer',
                      }}
                    >
                      <input type="radio" checked={payMethod === 'card'} readOnly style={{ accentColor: C.cyan }} />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '14px' }}>Pay with card</div>
                        <div style={{ fontSize: '12px', color: C.textMuted }}>Enter card details below</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Guest or card-selected: name + email + card fields */}
                {(!isSignedIn || payMethod === 'card') && (
                  <>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: C.textMuted }}>
                          Full Name
                        </label>
                        <input
                          type="text"
                          value={customerName}
                          onChange={(e) => setCustomerName(e.target.value)}
                          placeholder="Your full name"
                          required
                          style={{
                            width: '100%',
                            padding: '10px 14px',
                            borderRadius: '8px',
                            border: `1px solid ${C.border}`,
                            fontSize: '15px',
                            fontFamily: SANS,
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: C.textMuted }}>
                          Email
                        </label>
                        <input
                          type="email"
                          value={customerEmail}
                          onChange={(e) => setCustomerEmail(e.target.value)}
                          placeholder="you@example.com"
                          required
                          style={{
                            width: '100%',
                            padding: '10px 14px',
                            borderRadius: '8px',
                            border: `1px solid ${C.border}`,
                            fontSize: '15px',
                            fontFamily: SANS,
                          }}
                        />
                      </div>
                    </div>

                    {paymentConfig.mode === 'inline-token' && (
                      <div style={{ marginBottom: '20px' }}>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: C.textMuted }}>
                          Card Details
                        </label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          <div
                            id="nmi-card-number"
                            style={{
                              width: '100%',
                              padding: '10px 14px',
                              borderRadius: '8px',
                              border: `1px solid ${C.border}`,
                              minHeight: '42px',
                              background: C.surface,
                            }}
                          />
                          <div style={{ display: 'flex', gap: '10px' }}>
                            <div
                              id="nmi-card-expiry"
                              style={{
                                flex: 1,
                                padding: '10px 14px',
                                borderRadius: '8px',
                                border: `1px solid ${C.border}`,
                                minHeight: '42px',
                                background: C.surface,
                              }}
                            />
                            <div
                              id="nmi-card-cvv"
                              style={{
                                flex: 1,
                                padding: '10px 14px',
                                borderRadius: '8px',
                                border: `1px solid ${C.border}`,
                                minHeight: '42px',
                                background: C.surface,
                              }}
                            />
                          </div>
                        </div>
                        <p style={{ fontSize: '12px', color: C.textDim, marginTop: '8px' }}>
                          Card data is tokenized securely. It never reaches our servers.
                        </p>
                      </div>
                    )}

                    {paymentConfig.mode === 'hosted-redirect' && (
                      <div style={{ background: C.surface2, padding: '16px', borderRadius: '8px', fontSize: '14px', color: C.textMuted, marginBottom: '20px' }}>
                        You will be redirected to our payment partner to complete your purchase.
                      </div>
                    )}

                    {paymentConfig.mode === 'manual-invoice' && (
                      <div style={{ background: C.surface2, padding: '16px', borderRadius: '8px', fontSize: '14px', color: C.textMuted, marginBottom: '20px' }}>
                        We will email you an invoice to complete your purchase.
                      </div>
                    )}
                  </>
                )}

                {checkoutError && (
                  <div style={{ background: C.dangerBg, color: C.danger, padding: '12px 16px', borderRadius: '8px', fontSize: '14px', marginBottom: '16px' }}>
                    {checkoutError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={
                    isSubmitting ||
                    (isSignedIn && payMethod === 'wallet' && !canUseWallet) ||
                    (isSignedIn && payMethod === 'saved_card' && !selectedCardId)
                  }
                  style={{
                    width: '100%',
                    padding: '14px 24px',
                    borderRadius: '8px',
                    background: C.cyan,
                    color: '#fff',
                    fontSize: '16px',
                    fontWeight: 600,
                    border: 'none',
                    cursor:
                      isSubmitting ||
                      (isSignedIn && payMethod === 'wallet' && !canUseWallet) ||
                      (isSignedIn && payMethod === 'saved_card' && !selectedCardId)
                        ? 'not-allowed'
                        : 'pointer',
                    opacity:
                      isSubmitting ||
                      (isSignedIn && payMethod === 'wallet' && !canUseWallet) ||
                      (isSignedIn && payMethod === 'saved_card' && !selectedCardId)
                        ? 0.6
                        : 1,
                  }}
                >
                  {isSubmitting
                    ? 'Processing…'
                    : isSignedIn && payMethod === 'wallet'
                      ? `Pay $${subtotalFormatted} from wallet`
                      : isSignedIn && payMethod === 'saved_card' && selectedCard
                        ? `Pay $${subtotalFormatted} with ${(selectedCard.brand || 'CARD').toUpperCase()} ••••${selectedCard.last4}`
                        : `Pay $${subtotalFormatted}`}
                </button>
              </form>
            )}
          </div>
        </>
      )}
    </main>
  )
}
