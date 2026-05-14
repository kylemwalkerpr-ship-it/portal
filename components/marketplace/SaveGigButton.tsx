'use client'
import React from 'react'

interface SaveGigButtonProps {
  gigId: string
  initialSaved?: boolean
  savedGigRecordId?: string | null
  className?: string
}

export function SaveGigButton({ gigId, initialSaved = false, savedGigRecordId = null, className }: SaveGigButtonProps) {
  const [saved, setSaved] = React.useState(initialSaved)
  const [recordId, setRecordId] = React.useState<string | null>(savedGigRecordId ?? null)
  const [loading, setLoading] = React.useState(false)

  const handleToggle = async () => {
    if (loading) return
    // Optimistic toggle
    const wasSaved = saved
    setSaved(!wasSaved)
    setLoading(true)

    try {
      if (!wasSaved) {
        const res = await fetch('/api/saved-gigs', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gig_id: gigId }),
        })
        if (!res.ok) throw new Error('Failed to save')
        const data = await res.json()
        const id = data?.data?.id ?? data?.id ?? null
        setRecordId(id)
      } else {
        if (!recordId) {
          // Try to fetch the record id first
          const listRes = await fetch('/api/saved-gigs', { credentials: 'same-origin' })
          const listData = await listRes.json()
          const items: Array<{ id: string; gig_id: string }> = listData?.data ?? listData ?? []
          const match = items.find((s) => s.gig_id === gigId)
          if (match) {
            await fetch(`/api/saved-gigs/${match.id}`, { method: 'DELETE', credentials: 'same-origin' })
            setRecordId(null)
          }
        } else {
          await fetch(`/api/saved-gigs/${recordId}`, { method: 'DELETE', credentials: 'same-origin' })
          setRecordId(null)
        }
      }
    } catch {
      // Revert on error
      setSaved(wasSaved)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={loading}
      aria-label={saved ? 'Remove from saved' : 'Save this gig'}
      className={className}
      style={{
        background: 'none',
        border: '1px solid',
        borderColor: saved ? '#e53e3e' : 'rgba(0,0,0,0.15)',
        borderRadius: '8px',
        padding: '8px 12px',
        cursor: loading ? 'wait' : 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '13px',
        fontWeight: 600,
        color: saved ? '#e53e3e' : '#6B7280',
        transition: 'all 150ms ease',
        opacity: loading ? 0.6 : 1,
      }}
    >
      <span style={{ fontSize: '16px', lineHeight: 1 }}>{saved ? '♥' : '♡'}</span>
      {saved ? 'Saved' : 'Save'}
    </button>
  )
}
