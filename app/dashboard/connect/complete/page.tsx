// @ts-nocheck
'use client'

import React from 'react'
import { C, Btn, Card } from '@/components/design/shared'

export default function ConnectCompletePage() {
  const [status, setStatus] = React.useState<{ onboarded?: boolean; error?: string } | null>(null)

  const refresh = React.useCallback(async () => {
    const res = await fetch('/api/connect/status')
    const data = await res.json()
    setStatus(res.ok ? data : { error: data.error || 'Unable to load status' })
  }, [])

  React.useEffect(() => { refresh() }, [refresh])

  const restart = async () => {
    const res = await fetch('/api/connect/onboard', { method: 'POST' })
    const data = await res.json()
    if (res.ok) window.location.href = data.url
    else setStatus({ error: data.error || 'Unable to restart onboarding' })
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <Card style={{ maxWidth: '520px', width: '100%' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '10px' }}>
          {status?.onboarded ? 'Your account is connected' : 'Verification pending'}
        </h1>
        <p style={{ color: C.textMuted, fontSize: '14px', lineHeight: 1.7, marginBottom: '20px' }}>
          {status?.onboarded
            ? 'You will receive payouts automatically when services are completed.'
            : status?.error || 'Stripe may still need more information before payouts can be enabled.'}
        </p>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <Btn variant="primary" onClick={() => { window.location.href = '/dashboard' }}>Back to Dashboard</Btn>
          {!status?.onboarded && <Btn variant="secondary" onClick={restart}>Continue Onboarding</Btn>}
        </div>
      </Card>
    </div>
  )
}
