'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { useUser } from '@clerk/nextjs'
import { useCart } from '@/components/cart/CartProvider'
import { getTemplatePack } from '@/lib/template-packs'
import Checkout, { type CheckoutResult, type CheckoutSelection } from '@/components/checkout/Checkout'

const C = {
  bg: '#F7F8FA',
  surface: '#FFFFFF',
  surface2: '#F4F2EE',
  border: 'rgba(0,0,0,0.08)',
  cyan: '#111827',
  text: '#1F2937',
  textMuted: '#6B7280',
  textDim: '#6B7280',
  danger: '#8B1A1A',
  dangerBg: '#FAEAEA',
  success: '#1A6B45',
  purple: '#111827',
}

const SERIF = "'Cormorant Garamond', 'Garamond', Georgia, 'Times New Roman', serif"
const SANS = "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif"

interface SavedCard {
  id: string
  brand: string
  last4: string
  gateway?: string
  exp_month: number
  exp_year: number
  is_default: boolean
}

export default function CartPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: 240, background: 'var(--ys-paper, #F7F8FA)' }} />}>
      <CartPageInner />
    </Suspense>
  )
}

function CartPageInner() {
  const { items, removeItem, setQuantity, subtotalCents, clear, addItem } = useCart()
  const searchParams = useSearchParams()
  const router = useRouter()
  const { isSignedIn, user } = useUser()

  const [walletBalanceCents, setWalletBalanceCents] = useState<number | null>(null)
  const [savedCards, setSavedCards] = useState<SavedCard[]>([])
  const idempotencyKeyRef = useRef<string | null>(null)

  useEffect(() => {
    const existing = document.querySelector('link[rel="canonical"]')
    if (existing) existing.setAttribute('href', '/cart')
    else {
      const link = document.createElement('link')
      link.rel = 'canonical'
      link.href = '/cart'
      document.head.appendChild(link)
    }
  }, [])

  useEffect(() => {
    const addSlug = searchParams?.get('add')
    if (!addSlug) return
    const pack = getTemplatePack(addSlug)
    if (pack) addItem({ slug: pack.slug, name: pack.name, priceUsdCents: Math.round(pack.price_usd * 100) })
    router.replace('/cart')
  }, [searchParams, addItem, router])

  useEffect(() => {
    if (!isSignedIn) return
    fetch('/api/wallet/balance', { credentials: 'same-origin' })
      .then((response) => response.json().catch(() => ({})))
      .then((data) => setWalletBalanceCents(Number(data.balanceCents ?? 0)))
      .catch(() => setWalletBalanceCents(0))
    fetch('/api/wallet/payment-methods', { credentials: 'same-origin' })
      .then((response) => response.json())
      .then((data) => setSavedCards(Array.isArray(data.cards) ? data.cards : []))
      .catch(() => setSavedCards([]))
  }, [isSignedIn])

  const handleCheckout = async (selection: CheckoutSelection): Promise<CheckoutResult> => {
    if (items.length === 0) return { status: 400, message: 'Your cart is empty.' }
    if (selection.paymentMethod === 'invoice') return { status: 400, message: 'Invoice requests are not available for template purchases.' }

    idempotencyKeyRef.current ||= crypto.randomUUID()
    const isWallet = selection.paymentMethod === 'wallet'
    const endpoint = isWallet ? '/api/wallet/debit' : '/api/payments/charge'
    const body = isWallet
      ? { items: items.map((item) => ({ slug: item.slug, quantity: item.quantity })), idempotencyKey: idempotencyKeyRef.current }
      : {
          ...(selection.paymentMethodId ? { paymentMethodId: selection.paymentMethodId } : {}),
          ...(selection.token ? { token: selection.token, gateway: selection.gateway } : {}),
          items: items.map((item) => ({ slug: item.slug, quantity: item.quantity })),
          customer: { email: user?.primaryEmailAddress?.emailAddress || '', name: user?.fullName || '' },
          idempotencyKey: idempotencyKeyRef.current,
        }
    try {
      const response = await fetch(endpoint, {
        method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      })
      const data = await response.json().catch(() => ({}))
      const error = data?.error?.message || data?.message || data?.error || 'Payment could not be completed.'
      const code = data?.error?.code || data?.code
      if (!response.ok || (isWallet && data.ok === false)) {
        if (response.status === 402 && typeof data.balanceCents === 'number') setWalletBalanceCents(data.balanceCents)
        if (response.status !== 409) idempotencyKeyRef.current = null
        return { status: response.status, code, message: typeof error === 'string' ? error : 'Payment could not be completed.' }
      }
      idempotencyKeyRef.current = null
      clear()
      router.push(data.orderId ? `/order/success?orderId=${encodeURIComponent(data.orderId)}` : '/order/success')
      return { orderId: data.orderId }
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Payment request failed.')
      return { status: 503, message: err.message }
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
            href="/"
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
                    color: C.textMuted,
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

          <div>
            <Checkout
              title="Checkout"
              amountUsdCents={subtotalCents}
              purpose="catalogue_checkout"
              description="Template purchases are priced in USD."
              source={{ sourceType: 'catalogue', items: items.map((item) => ({ slug: item.slug, quantity: item.quantity })) }}
              customer={{ email: user?.primaryEmailAddress?.emailAddress || '', name: user?.fullName || '' }}
              savedCards={savedCards}
              walletBalanceCents={walletBalanceCents}
              excludeInvoice
              variant="cart"
              onSubmit={handleCheckout}
            />
          </div>
        </>
      )}
    </main>
  )
}
