// @ts-nocheck
'use client'

import React from 'react'
import { C } from '@/components/design/shared'

export default function ConnectOnboardRefreshPage() {
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    fetch('/api/connect/onboard', { method: 'POST' })
      .then(async res => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Unable to restart onboarding')
        window.location.href = data.url
      })
      .catch(err => setError(err.message))
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', color: C.text }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '18px', fontWeight: 800, marginBottom: '8px' }}>Refreshing onboarding link…</div>
        {error && <div style={{ color: C.red, fontSize: '14px' }}>{error}</div>}
      </div>
    </div>
  )
}
