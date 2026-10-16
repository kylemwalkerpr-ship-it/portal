'use client'

import { useEffect, useState } from 'react'
import styles from '@/components/checkout/checkout.module.css'

type ReturnStatus = { status?: string; confirmed?: boolean; message?: string }

export default function PesapalReturnStatus({ trackingId, cancelled }: { trackingId: string; cancelled: boolean }) {
  const [status, setStatus] = useState<ReturnStatus | null>(null)

  useEffect(() => {
    const params = new URLSearchParams()
    if (trackingId) params.set('trackingId', trackingId)
    fetch(`/api/checkout/pesapal/status?${params}`, { cache: 'no-store', credentials: 'same-origin' })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}))
        setStatus(payload)
      })
      .catch(() => setStatus({ status: 'pending', message: 'We could not check this payment yet. Do not retry until support confirms the result.' }))
  }, [trackingId])

  const confirmed = status?.confirmed === true
  const title = confirmed ? 'Payment confirmed' : cancelled ? 'Checkout closed' : 'Confirming…'
  const message = status?.message || 'Checking your payment status. Keep this page open while we confirm it.'

  return (
    <main className={styles.returnPage}>
      <section className={styles.returnCard} role="status" aria-live="polite">
        <div className={styles.returnMark} aria-hidden="true">{confirmed ? '✓' : '…'}</div>
        <h1>{title}</h1>
        <p>{message}</p>
        {!confirmed && <p className={styles.stubNotice}>Payment confirmation is not available yet because the Pesapal reconciliation phase is still pending. Please contact support before making another payment.</p>}
        {trackingId && <p className={styles.reference}>Reference: {trackingId}</p>}
        <a href="/dashboard">Return to your dashboard</a>
      </section>
    </main>
  )
}
