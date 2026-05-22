'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { useCart } from '@/components/cart/CartProvider'
import { getTemplatePack } from '@/lib/template-packs'

const C = {
  bg: '#FBFAF7',
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

export default function CartPage() {
  const { items, removeItem, setQuantity, subtotalCents, clear, addItem } = useCart()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfig | null>(null)
  const [configLoading, setConfigLoading] = useState(false)
  const [configError, setConfigError] = useState<string | null>(null)
  const [customerEmail, setCustomerEmail] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const collectJsLoaded = useRef(false)

  // Handle ?add=slug from product pages
  useEffect(() => {
    const addSlug = searchParams.get('add')
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
            handleToken(response.token)
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

  async function handleToken(token: string) {
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
    if (!customerEmail || !customerName) {
      setCheckoutError('Please enter your name and email')
      return
    }
    if (items.length === 0) {
      setCheckoutError('Your cart is empty')
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
            href="/marketplace/templates"
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

                {checkoutError && (
                  <div style={{ background: C.dangerBg, color: C.danger, padding: '12px 16px', borderRadius: '8px', fontSize: '14px', marginBottom: '16px' }}>
                    {checkoutError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  style={{
                    width: '100%',
                    padding: '14px 24px',
                    borderRadius: '8px',
                    background: C.cyan,
                    color: '#fff',
                    fontSize: '16px',
                    fontWeight: 600,
                    border: 'none',
                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                    opacity: isSubmitting ? 0.7 : 1,
                  }}
                >
                  {isSubmitting ? 'Processing…' : `Pay $${subtotalFormatted}`}
                </button>
              </form>
            )}
          </div>
        </>
      )}
    </main>
  )
}
