'use client'

import React from 'react'
import Avatar from './Avatar'
import { fmtRelative } from '@/lib/messaging/format'

interface StatusViewerProps {
  statuses: Array<{
    id: string
    person_id: string
    person_name: string
    payload: Record<string, any> | null
    created_at: string
    viewed: boolean
  }>
  initialIndex?: number
  onClose: () => void
  viewerId?: string | null
}

export default function StatusViewer({ statuses, initialIndex = 0, onClose, viewerId }: StatusViewerProps) {
  const [idx, setIdx] = React.useState(initialIndex)
  const [progress, setProgress] = React.useState(0)
  const status = statuses[idx]
  const isMine = status?.person_id === viewerId

  /* progress bar / auto-advance */
  React.useEffect(() => {
    if (!status) return
    setProgress(0)
    const start = performance.now()
    let raf: number
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 5000)
      setProgress(p)
      if (p < 1) {
        raf = requestAnimationFrame(tick)
      } else if (idx < statuses.length - 1) {
        setIdx(i => i + 1)
      } else {
        onClose()
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [idx, status?.id, statuses.length, onClose])

  /* mark viewed on display (best-effort) */
  React.useEffect(() => {
    if (!status || isMine) return
    fetch(`/api/statuses/${status.id}/view`, { method: 'POST' }).catch(() => null)
  }, [status?.id, isMine])

  /* keyboard navigation */
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') setIdx(i => Math.max(0, i - 1))
      if (e.key === 'ArrowRight') setIdx(i => (i < statuses.length - 1 ? i + 1 : i))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [statuses.length, onClose])

  if (!status) return null

  const payload = status.payload || {}
  const urgency = String(payload.urgency || '').toLowerCase()
  const urgencyLabel = urgency === 'now' ? 'Within 30 days' : urgency === 'soon' ? '1–3 months' : urgency === 'later' ? '3–6 months' : 'Just exploring'
  const tone = urgency === 'now' ? 'urgent' : urgency === 'soon' ? 'standard' : 'easy'

  const urgencyBg = urgency === 'now' ? 'rgba(178,34,52,0.12)' : urgency === 'soon' ? 'rgba(60,59,110,0.12)' : 'rgba(95,107,58,0.12)'
  const urgencyColor = urgency === 'now' ? '#B22234' : urgency === 'soon' ? '#3C3B6E' : '#5F6B3A'

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 300,
        background: 'rgba(15,19,30,0.85)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer',
      }}
      onClick={onClose}
    >
      <div
        style={{
          position: 'relative',
          width: 'min(420px, 92vw)',
          height: 'min(720px, 85vh)',
          background: '#1D2433',
          borderRadius: 16,
          overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          cursor: 'default',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Progress tracks */}
        <div style={{ display: 'flex', gap: 4, padding: '12px 12px 0' }}>
          {statuses.map((_, i) => (
            <div key={i} style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.15)', borderRadius: 2 }}>
              <div
                style={{
                  height: '100%',
                  background: '#fff',
                  borderRadius: 2,
                  width: i < idx ? '100%' : i === idx ? `${progress * 100}%` : '0%',
                  transition: i === idx ? 'none' : 'width 0.2s',
                }}
              />
            </div>
          ))}
        </div>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Avatar name={status.person_name} userId={status.person_id} size={36} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{isMine ? 'You' : status.person_name}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>{fmtRelative(status.created_at)} · {isMine ? 'Your status' : 'New inquiry'}</div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#fff', fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: 4 }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Content card */}
        <div style={{ flex: 1, padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
          <div style={{
            background: '#FFFEF9', borderRadius: 14, padding: 20,
            display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#7B7B72' }}>
              {payload.country_flag || '🌍'} New marketplace inquiry
            </div>
            <h3 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: '#1D2433', fontFamily: "var(--font-lora), Lora, Georgia, serif" }}>
              {payload.case_type_label || 'Inquiry'}
            </h3>
            {payload.headline && (
              <p style={{ margin: 0, fontSize: 14, color: '#4A4F5B', lineHeight: 1.5 }}>
                {payload.headline}
              </p>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span style={{
                fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
                padding: '4px 10px', borderRadius: 999,
                background: urgencyBg, color: urgencyColor,
              }}>
                {urgencyLabel}
              </span>
            </div>
          </div>
        </div>

        {/* Nav buttons */}
        {statuses.length > 1 && (
          <>
            <button
              onClick={() => setIdx(i => Math.max(0, i - 1))}
              disabled={idx === 0}
              style={{
                position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
                width: 36, height: 36, borderRadius: '50%', border: 'none',
                background: 'rgba(255,255,255,0.15)', color: '#fff',
                fontSize: 18, cursor: idx === 0 ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: idx === 0 ? 0.3 : 1,
              }}
              aria-label="Previous"
            >
              ‹
            </button>
            <button
              onClick={() => setIdx(i => (i < statuses.length - 1 ? i + 1 : i))}
              disabled={idx >= statuses.length - 1}
              style={{
                position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                width: 36, height: 36, borderRadius: '50%', border: 'none',
                background: 'rgba(255,255,255,0.15)', color: '#fff',
                fontSize: 18, cursor: idx >= statuses.length - 1 ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: idx >= statuses.length - 1 ? 0.3 : 1,
              }}
              aria-label="Next"
            >
              ›
            </button>
          </>
        )}
      </div>
    </div>
  )
}
