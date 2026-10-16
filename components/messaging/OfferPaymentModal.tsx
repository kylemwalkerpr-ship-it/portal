'use client'

import { useEffect, useRef, useState } from 'react'
import Checkout, { type CheckoutResult, type CheckoutSavedCard, type CheckoutSelection } from '@/components/checkout/Checkout'

const TERMS_URL = 'https://usa.yousafeconsultancy.com/terms-of-service'
const REFUND_POLICY_URL = 'https://yousafeconsultancy.com/refund-policy'

export interface OfferPaymentModalProps {
  offerId: string
  open: boolean
  onClose: () => void
  onPaid?: (orderId?: string) => void
  previewData?: OfferCheckoutData
}

interface OfferCheckoutData {
  offer: { title?: string; currency?: string }
  breakdown: { total: number }
  balanceCents: number
  savedCards: CheckoutSavedCard[]
}

function errorMessage(payload: any, status: number) {
  const message = payload?.error?.message || payload?.error || `Request failed (${status})`
  return typeof message === 'string' ? message : 'Something went wrong.'
}

function openOrderInApp(orderId: string) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('yousafe-navigate', { detail: { page: 'orders', orderId } }))
  window.location.assign(`/dashboard?goto=orders&orderId=${encodeURIComponent(orderId)}`)
}

export function OfferPaymentModal({ offerId, open, onClose, onPaid, previewData }: OfferPaymentModalProps) {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [checkout, setCheckout] = useState<OfferCheckoutData | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const invoiceKeyRef = useRef<string | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    if (previewData) { setCheckout(previewData); setLoading(false); setLoadError(null); return }
    const controller = new AbortController()
    setLoading(true)
    setLoadError(null)
    setCheckout(null)

    fetch(`/api/offers/${offerId}/accept`, { method: 'GET', credentials: 'same-origin', signal: controller.signal })
      .then(async (response) => {
        const json = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(errorMessage(json, response.status))
        setCheckout(json?.data ?? json)
      })
      .catch((error) => {
        if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : 'Could not load offer details.')
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })

    return () => controller.abort()
  }, [open, offerId, previewData])

  useEffect(() => {
    if (!open) return
    const dialog = dialogRef.current
    if (!dialog) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusables = () => Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'))
    focusables()[0]?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onCloseRef.current(); return }
      if (event.key !== 'Tab') return
      const nodes = focusables()
      if (!nodes.length) { event.preventDefault(); dialog.focus(); return }
      if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes[nodes.length - 1].focus() }
      else if (!event.shiftKey && document.activeElement === nodes[nodes.length - 1]) { event.preventDefault(); nodes[0].focus() }
    }
    dialog.addEventListener('keydown', onKeyDown)
    return () => { dialog.removeEventListener('keydown', onKeyDown); previousFocus?.focus() }
  }, [open])

  if (!open) return null

  const submit = async (selection: CheckoutSelection): Promise<CheckoutResult> => {
    const invoice = selection.paymentMethod === 'invoice'
    if (invoice) invoiceKeyRef.current ||= crypto.randomUUID()
    const paymentMethod = selection.paymentMethod === 'saved_card' ? 'saved_card'
      : selection.paymentMethod === 'new_card' ? 'new_card' : 'wallet'
    const body = invoice ? {
      sourceType: 'unified_offer',
      sourceId: offerId,
      paymentMethod: 'invoice',
      idempotencyKey: invoiceKeyRef.current,
    } : {
      paymentMethod,
      ...(selection.paymentMethodId ? { paymentMethodId: selection.paymentMethodId } : {}),
      ...(selection.token ? { token: selection.token, gateway: selection.gateway } : {}),
    }
    const response = await fetch(invoice ? '/api/checkout/order' : `/api/offers/${offerId}/accept`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await response.json().catch(() => ({}))
    if (!response.ok) {
      const payload = json?.error?.code ? json.error : json?.data?.error || json?.error
      if (invoice && json?.fallback === 'invoice_request' && json?.orderId) {
        invoiceKeyRef.current = null
        return { orderId: json.orderId, payload: json }
      }
      return { status: response.status, code: payload?.code, message: errorMessage(json, response.status) }
    }
    if (invoice) invoiceKeyRef.current = null
    const result = json?.data ?? json
    return { orderId: result?.orderId || result?.order?.id, url: result?.url, payload: result }
  }

  const complete = (result: CheckoutResult) => {
    const orderId = result.orderId
    onPaid?.(orderId)
    onClose()
    if (orderId) openOrderInApp(orderId)
  }

  return (
    <div ref={dialogRef} className="ys-offer-checkout-frame" data-preview={previewData ? 'true' : undefined} role="dialog" aria-modal={previewData ? undefined : true} aria-label="Pay for offer" tabIndex={-1}>
      {loading ? (
        <div className="ys-offer-checkout-loading" role="status" aria-live="polite">Loading offer details…</div>
      ) : loadError ? (
        <section className="ys-offer-checkout-error" role="alert">
          <h2>Offer details unavailable</h2>
          <p>{loadError}</p>
          <button type="button" onClick={onClose}>Close</button>
        </section>
      ) : checkout ? (
        <Checkout
          title={checkout.offer?.title || 'Custom offer'}
          amountUsdCents={Number(checkout.breakdown?.total || 0)}
          purpose="offer"
          source={{ sourceType: 'unified_offer', sourceId: offerId }}
          savedCards={checkout.savedCards || []}
          walletBalanceCents={Number(checkout.balanceCents || 0)}
          variant="offer"
          onSubmit={submit}
          onComplete={complete}
          onClose={onClose}
        />
      ) : null}
      <p className="ys-offer-checkout-terms" data-preview={previewData ? 'true' : undefined}>
        By placing this order you agree to the <a href={TERMS_URL} target="_blank" rel="noreferrer">Terms of Service</a> and <a href={REFUND_POLICY_URL} target="_blank" rel="noreferrer">Refund Policy</a>.
      </p>
      <style jsx>{`
        .ys-offer-checkout-frame { position: fixed; inset: 0; z-index: 899; display: grid; place-items: center; padding: 16px; background: rgb(15 23 42 / 52%); }
        .ys-offer-checkout-frame[data-preview="true"] { position: relative; inset: auto; z-index: auto; display: block; padding: 0; background: transparent; }
        .ys-offer-checkout-loading, .ys-offer-checkout-error { width: min(100%, 520px); padding: 28px; border-radius: 16px; background: var(--ys-vellum, #fff); color: var(--ys-ink, #0f172a); font-family: var(--font-inter), Inter, sans-serif; }
        .ys-offer-checkout-loading { min-height: 140px; display: grid; place-items: center; }
        .ys-offer-checkout-error p { color: var(--ys-inkMid, #334155); line-height: 1.5; }
        .ys-offer-checkout-error button { min-height: 44px; padding: 0 16px; border: 0; border-radius: 8px; background: var(--ys-indigo, #111827); color: white; font: inherit; }
        .ys-offer-checkout-terms { position: fixed; z-index: 905; bottom: max(10px, env(safe-area-inset-bottom)); left: 50%; width: min(calc(100% - 32px), 600px); transform: translateX(-50%); margin: 0; padding: 6px 10px; border-radius: 8px; background: var(--ys-vellum, #fff); color: var(--ys-inkSoft, #526072); text-align: center; font: 12px/1.45 var(--font-inter), Inter, sans-serif; }
        .ys-offer-checkout-terms[data-preview="true"] { position: static; width: auto; transform: none; margin-top: 10px; text-align: left; }
        .ys-offer-checkout-terms a { color: var(--ys-ink, #0f172a); text-underline-offset: 2px; }
        @media (max-width: 640px) { .ys-offer-checkout-frame { padding: 8px 8px 54px; } }
        @media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto !important; } }
      `}</style>
    </div>
  )
}

export default OfferPaymentModal
