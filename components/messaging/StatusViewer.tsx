'use client'

import React from 'react'
import Avatar from './Avatar'
import { fmtRelative } from '@/lib/messaging/format'

interface StatusViewerProps {
  statuses: Array<{
    id: string
    person_id: string
    person_name: string
    inquiry_id?: string | null
    payload: Record<string, any> | null
    created_at: string
    viewed: boolean
  }>
  initialIndex?: number
  onClose: () => void
  viewerId?: string | null
  viewerRole?: string | null
  onRespond?: (statusId: string) => void
  onOpenProfile?: (personId: string) => void
  onDeleteBroadcast?: (statusId: string, inquiryId: string) => void
}

const STORY_MS = 6500

export default function StatusViewer({
  statuses,
  initialIndex = 0,
  onClose,
  viewerId,
  viewerRole,
  onRespond,
  onOpenProfile,
  onDeleteBroadcast,
}: StatusViewerProps) {
  const [idx, setIdx] = React.useState(initialIndex)
  const [progress, setProgress] = React.useState(0)
  const [paused, setPaused] = React.useState(false)
  const pausedRef = React.useRef(false)
  const status = statuses[idx]
  const isMine = status?.person_id === viewerId
  const canRespond = !isMine && ['attorney', 'consultant'].includes(viewerRole || '') && !!onRespond

  /* Keep pause state available to the animation loop without restarting the
     story timer. A hold/release must freeze and resume at the same point — it
     must never reset the progress bar. */
  React.useEffect(() => {
    pausedRef.current = paused
  }, [paused])

  React.useEffect(() => {
    if (!status) return
    setProgress(0)
    let raf = 0
    let elapsed = 0
    let previous = performance.now()

    const tick = (now: number) => {
      /* Cap a frame delta so an iOS tab/background suspension cannot cause the
         story to jump straight to the next item when Safari resumes. */
      const delta = Math.min(100, Math.max(0, now - previous))
      previous = now
      if (!pausedRef.current && document.visibilityState !== 'hidden') elapsed += delta

      const next = Math.min(1, elapsed / STORY_MS)
      setProgress(next)

      if (next >= 1) {
        if (idx < statuses.length - 1) setIdx(i => i + 1)
        else onClose()
        return
      }
      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [idx, status?.id, statuses.length, onClose])

  React.useEffect(() => {
    if (!status || isMine) return
    fetch(`/api/statuses/${status.id}/view`, { method: 'POST' }).catch(() => null)
  }, [status?.id, isMine])

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowLeft') setIdx(i => Math.max(0, i - 1))
      if (event.key === 'ArrowRight') setIdx(i => (i < statuses.length - 1 ? i + 1 : i))
      if (event.key === ' ') {
        event.preventDefault()
        setPaused(value => !value)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [statuses.length, onClose])

  React.useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [])

  if (!status) return null

  const payload = status.payload || {}
  const urgency = String(payload.urgency || '').toLowerCase()
  const urgencyLabel =
    urgency === 'now' ? 'Within 30 days'
      : urgency === 'soon' ? '1–3 months'
        : urgency === 'later' ? '3–6 months'
          : 'Just exploring'

  const goPrevious = () => setIdx(i => Math.max(0, i - 1))
  const goNext = () => {
    if (idx < statuses.length - 1) setIdx(i => i + 1)
    else onClose()
  }

  return (
    <div className="ys-status-viewer" role="dialog" aria-modal="true" aria-label="Status">
      <div
        className="ys-status-stage"
        onPointerDown={() => setPaused(true)}
        onPointerUp={() => setPaused(false)}
        onPointerCancel={() => setPaused(false)}
      >
        <div className="ys-status-progress" aria-hidden="true">
          {statuses.map((item, index) => (
            <span key={item.id}>
              <i style={{ width: index < idx ? '100%' : index === idx ? `${progress * 100}%` : '0%' }} />
            </span>
          ))}
        </div>

        <header className="ys-status-head">
          <button type="button" className="ys-status-back" onClick={onClose} aria-label="Close status">
            <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>

          <button type="button" className="ys-status-person" onClick={() => onOpenProfile?.(status.person_id)}>
            <Avatar name={status.person_name} userId={status.person_id} size={38} />
            <span>
              <strong>{isMine ? 'You' : status.person_name}</strong>
              <small>{fmtRelative(status.created_at)} · {isMine ? 'Your status' : 'Marketplace update'}</small>
            </span>
          </button>

          {paused ? <span className="ys-status-paused">Paused</span> : <span className="ys-status-head-spacer" />}
        </header>

        <button type="button" className="ys-status-tap ys-status-tap-prev" onClick={goPrevious} aria-label="Previous status" />
        <button type="button" className="ys-status-tap ys-status-tap-next" onClick={goNext} aria-label="Next status" />

        <main className="ys-status-content">
          <article className="ys-status-card">
            <div className="ys-status-eyebrow">
              <span>{payload.country_flag || '🌍'}</span>
              <span>Marketplace inquiry</span>
            </div>
            <h2>{payload.case_type_label || 'New inquiry'}</h2>
            {payload.headline && <p>{payload.headline}</p>}

            <div className="ys-status-tags">
              <span className={`is-${urgency || 'exploring'}`}>{urgencyLabel}</span>
              {payload.tier && <span>{payload.tier}</span>}
            </div>

            {payload.country && (
              <div className="ys-status-detail">
                <small>Country / jurisdiction</small>
                <strong>{payload.country}</strong>
              </div>
            )}
          </article>
        </main>

        <footer className="ys-status-foot">
          {canRespond && (
            <button type="button" className="ys-status-reply" onClick={() => onRespond?.(status.id)}>
              <span>Reply to this inquiry</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          )}

          {isMine && onDeleteBroadcast && status.inquiry_id && (
            <button type="button" className="ys-status-delete" onClick={() => onDeleteBroadcast(status.id, status.inquiry_id!)}>
              Delete broadcast
            </button>
          )}
        </footer>
      </div>
    </div>
  )
}
