'use client'
// @ts-nocheck
import React from 'react'
import { useRouter } from 'next/navigation'
import { GigBuilderWizard } from './GigBuilderWizard'
import { C, LoadingState, ErrorState } from '../design/fiverr-workbench'

async function requestJson(url: string, options = {}) {
  const res = await fetch(url, {
    credentials: 'same-origin',
    ...options,
    headers:
      options.body && !(options.body instanceof FormData)
        ? { 'Content-Type': 'application/json', ...(options.headers || {}) }
        : options.headers,
  })
  const payload = await res.json().catch(() => ({}))
  const message = payload?.error?.message || payload?.error || `Request failed (${res.status})`
  if (!res.ok) {
    const error = new Error(message) as any
    error.fields = payload?.error?.fields || {}
    throw error
  }
  return payload?.data ?? payload
}

interface GigBuilderWizardClientProps {
  gigId: string
}

export function GigBuilderWizardClient({ gigId }: GigBuilderWizardClientProps) {
  const router = useRouter()
  const [gig, setGig] = React.useState<any>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    const loadGig = async () => {
      setLoading(true)
      setError('')
      try {
        const data = await requestJson(`/api/gigs/${gigId}`)
        setGig(data.gig)
      } catch (e: any) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }

    loadGig()
  }, [gigId])

  const handleComplete = (savedGigId: string) => {
    router.push(`/dashboard/gigs`)
  }

  const handleCancel = () => {
    router.push(`/dashboard/gigs`)
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, padding: '32px' }}>
        <LoadingState label="Loading gig details..." />
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, padding: '32px' }}>
        <ErrorState message={error} onRetry={() => window.location.reload()} />
      </div>
    )
  }

  if (!gig) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, padding: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '16px', color: C.text }}>
            Gig not found
          </h2>
          <p style={{ color: C.textMuted, marginBottom: '24px' }}>
            This gig may have been deleted or you don't have access to it.
          </p>
          <button
            onClick={() => router.push('/dashboard/gigs')}
            style={{
              padding: '12px 24px',
              background: C.cyan,
              color: '#fff',
              border: 'none',
              borderRadius: '10px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Back to Gigs
          </button>
        </div>
      </div>
    )
  }

  return (
    <GigBuilderWizard
      gigId={gigId}
      existingGig={gig}
      onComplete={handleComplete}
      onCancel={handleCancel}
    />
  )
}
