'use client'

import { useEffect, useState } from 'react'
import styles from '@/components/checkout/checkout.module.css'

type ReturnStatus = { status?: string; confirmed?: boolean; message?: string }

export default function PesapalReturnStatus({ trackingId, merchantReference, cancelled }: { trackingId: string; merchantReference: string; cancelled: boolean }) {
  const [status, setStatus] = useState<ReturnStatus | null>(null)

  useEffect(() => {
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
  }, [trackingId, merchantReference, cancelled])

  const confirmed = status?.confirmed === true
  const title = confirmed ? 'Payment confirmed' : status?.status === 'failed' || status?.status === 'reversed' ? 'Payment not completed' : cancelled ? 'Checkout closed' : 'Confirming…'
  const message = /pesapal|\bnmi\b|payhip/i.test(status?.message || '') ? 'We could not confirm your payment yet. Please contact support before trying again.' : status?.message || 'Checking your payment status. Keep this page open while we confirm it.'

  return (
    <main className={styles.returnPage}>
      <section className={styles.returnCard} role="status" aria-live="polite">
        <div className={styles.returnMark} aria-hidden="true">{confirmed ? '✓' : '…'}</div>
        <h1>{title}</h1>
        <p>{message}</p>
        {!confirmed && status?.status !== 'failed' && status?.status !== 'reversed' && status?.status !== 'cancelled' && <p className={styles.stubNotice}>If this page remains pending, contact support before starting another payment.</p>}
        {trackingId && <p className={styles.reference}>Reference: {trackingId}</p>}
        <a href="/dashboard">Return to your dashboard</a>
      </section>
    </main>
  )
}
