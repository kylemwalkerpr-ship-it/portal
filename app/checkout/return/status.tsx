'use client'

import { useEffect, useState } from 'react'
import styles from '@/components/checkout/checkout.module.css'
import { confirmedMarketplaceOrderHref } from '@/lib/orderLinks'

type ReturnStatus = { status?: string; confirmed?: boolean; message?: string; orderId?: string }

export default function CheckoutReturnStatus({ trackingId, merchantReference, cancelled, previewStatus }: { trackingId: string; merchantReference: string; cancelled: boolean; previewStatus?: ReturnStatus }) {
  const [status, setStatus] = useState<ReturnStatus | null>(previewStatus || null)
  const [embedded, setEmbedded] = useState(() => typeof window !== 'undefined' && window.top !== window.self)

  useEffect(() => {
    if (window.top === window.self) return
    setEmbedded(true)
    try {
      window.top.location.href = window.location.href
    } catch {
      // The top level may be cross-origin; the hosted payment page can still navigate it.
    }
  }, [])

  useEffect(() => {
    if (previewStatus) return
    if (!trackingId || !merchantReference) {
      setStatus({ status: cancelled ? 'cancelled' : 'pending', message: cancelled ? 'Checkout was closed before confirmation.' : 'Waiting for your payment reference.' })
      return
    }
    const params = new URLSearchParams()
    params.set('OrderTrackingId', trackingId)
    params.set('OrderMerchantReference', merchantReference)
    fetch(`/api/checkout/pesapal/status?${params}`, { cache: 'no-store', credentials: 'same-origin' })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}))
        setStatus(payload)
      })
      .catch(() => setStatus({ status: 'pending', message: 'We could not check this payment yet. Do not retry until support confirms the result.' }))
  }, [trackingId, merchantReference, cancelled, previewStatus])

  useEffect(() => {
    if (previewStatus) return
    const destination = confirmedMarketplaceOrderHref(status)
    if (destination) window.location.replace(destination)
  }, [status, previewStatus])

  const confirmed = status?.confirmed === true
  const failed = status?.status === 'failed' || status?.status === 'reversed'
  const title = confirmed ? 'Payment confirmed' : failed ? 'Payment not completed' : cancelled ? 'Checkout closed' : 'Confirming…'
  const message = confirmed ? 'Your payment is confirmed. Opening your order…' : failed ? 'The payment was not completed. You can return to your dashboard for help.' : cancelled ? 'Checkout was closed before confirmation.' : 'We’re checking your payment. Keep this page open while we confirm it.'

  if (embedded) {
    return <main className={styles.returnPage}><p role="status" aria-live="polite">Finishing your payment…</p></main>
  }

  return (
    <main className={styles.returnPage}>
      <section className={styles.returnCard} role="status" aria-live="polite">
        <div className={styles.returnMark} aria-hidden="true">{confirmed ? '✓' : '…'}</div>
        <img src="/logo.svg" width="128" height="32" alt="YouSafe" />
        <h1>{title}</h1>
        <p>{message}</p>
        {!confirmed && status?.status !== 'failed' && status?.status !== 'reversed' && status?.status !== 'cancelled' && <p className={styles.stubNotice}>If this page remains pending, contact support before starting another payment.</p>}
        {trackingId && <p className={styles.reference}>Reference: {trackingId}</p>}
        <a href="/dashboard">Return to your dashboard</a>
      </section>
    </main>
  )
}
