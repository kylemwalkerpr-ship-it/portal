// @ts-nocheck
'use client'

import React from 'react'
import { C, Btn, Card, Badge, Divider } from '@/components/design/shared'

export default function ConsultantConnectPage() {
  const [status, setStatus] = React.useState<any>(null)
  const [error, setError] = React.useState('')

  const refresh = React.useCallback(async () => {
    const res = await fetch('/api/connect/status')
    const data = await res.json()
    if (!res.ok) setError(data.error || 'Unable to load Connect status')
    else { setStatus(data); setError('') }
  }, [])

  React.useEffect(() => { refresh() }, [refresh])

  const startOnboarding = async () => {
    const res = await fetch('/api/connect/onboard', { method: 'POST' })
    const data = await res.json()
    if (!res.ok) setError(data.error || 'Unable to start onboarding')
    else window.location.href = data.url
  }

  const openDashboard = async () => {
    const res = await fetch('/api/connect/dashboard-link', { method: 'POST' })
    const data = await res.json()
    if (!res.ok) setError(data.error || 'Unable to open payout dashboard')
    else window.location.href = data.url
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, padding: '28px' }}>
      <div style={{ maxWidth: '720px', margin: '0 auto' }}>
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap', marginBottom: '18px' }}>
            <div>
              <h1 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '8px' }}>Payout Setup</h1>
              <p style={{ color: C.textMuted, fontSize: '14px', lineHeight: 1.7 }}>Connect your bank account with Stripe Express to receive automatic payouts.</p>
            </div>
            <Badge color={status?.onboarded ? 'green' : 'orange'}>{status?.onboarded ? 'Connected' : 'Not connected'}</Badge>
          </div>
          <Divider style={{ marginBottom: '18px' }} />
          {error && <div style={{ color: C.red, fontSize: '13px', marginBottom: '14px' }}>{error}</div>}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {status?.onboarded ? (
              <Btn variant="primary" onClick={openDashboard}>View Payout Dashboard</Btn>
            ) : (
              <Btn variant="primary" onClick={startOnboarding}>Connect Bank Account</Btn>
            )}
            <Btn variant="secondary" onClick={() => { window.location.href = '/dashboard' }}>Back to Dashboard</Btn>
          </div>
        </Card>
      </div>
    </div>
  )
}
