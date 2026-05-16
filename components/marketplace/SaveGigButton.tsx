'use client'
import React from 'react'

/**
 * SaveGigButton — instant-response heart toggle with optimistic UI,
 * cross-component sync, and race-condition-safe reconciliation.
 *
 * Design goals (in priority order):
 *
 *   1. The heart flips the INSTANT the user clicks. No `disabled`, no
 *      `cursor: wait`, no opacity dimming. Every tap feels immediate.
 *   2. Every SaveGigButton on the page pointing at the same gigId stays
 *      in sync — saving from a Trending card also updates the same gig
 *      in All Services without a refetch.
 *   3. Rapid double-clicks collapse to one network round trip; the
 *      server is reconciled to the LATEST desired state only.
 *   4. Network failure quietly reverts the local state and broadcasts
 *      the correction to every mirrored instance.
 *
 * Architecture (module-scoped maps shared across every button instance):
 *   - `savedState` keyed by gigId — single source of truth.
 *   - `savedgigs:changed` CustomEvent broadcast on every transition;
 *     buttons subscribe and re-render if their gigId matches.
 *   - `inFlight` keyed by gigId — abort the previous request on retoggle
 *     so only the latest desired state hits the server. A stale 409
 *     (already saved) is treated as success.
 */

interface SaveGigButtonProps {
  gigId: string
  initialSaved?: boolean
  savedGigRecordId?: string | null
  className?: string
  /** Compact: icon-only (no "Save / Saved" text label). */
  compact?: boolean
}

type SaveRecord = { saved: boolean; recordId: string | null }
type Pending = { aborter: AbortController; desired: boolean }

const savedState = new Map<string, SaveRecord>()
const inFlight   = new Map<string, Pending>()

function writeState(gigId: string, next: SaveRecord) {
  savedState.set(gigId, next)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('savedgigs:changed', { detail: { gigId, ...next } }))
  }
}

export function SaveGigButton({ gigId, initialSaved = false, savedGigRecordId = null, className, compact }: SaveGigButtonProps) {
  // Seed the shared map on first mount. If another button has already seeded
  // the state, its value wins — keeps duplicates in scrolling lists flicker-free.
  const seeded = savedState.get(gigId)
  const initial: SaveRecord = seeded || { saved: initialSaved, recordId: savedGigRecordId ?? null }
  if (!seeded) savedState.set(gigId, initial)

  const [state, setState] = React.useState<SaveRecord>(initial)
  const [pulse, setPulse] = React.useState(0) // re-triggers heart pop animation

  React.useEffect(() => {
    const onChange = (e: Event) => {
      const ce = e as CustomEvent<{ gigId: string; saved: boolean; recordId: string | null }>
      if (ce.detail?.gigId !== gigId) return
      setState({ saved: !!ce.detail.saved, recordId: ce.detail.recordId ?? null })
    }
    window.addEventListener('savedgigs:changed', onChange as EventListener)
    return () => window.removeEventListener('savedgigs:changed', onChange as EventListener)
  }, [gigId])

  const handleToggle = React.useCallback(() => {
    const current = savedState.get(gigId) || state
    const nextSaved = !current.saved

    // Flip immediately + tell every mirror.
    writeState(gigId, { saved: nextSaved, recordId: current.recordId })
    setPulse(p => p + 1)

    // Abort any in-flight reconcile for this gig — only the latest matters.
    const prev = inFlight.get(gigId)
    if (prev) { try { prev.aborter.abort() } catch { /* noop */ } }

    const aborter = new AbortController()
    inFlight.set(gigId, { aborter, desired: nextSaved })

    const finishOk = (recordId: string | null) => {
      inFlight.delete(gigId)
      const last = savedState.get(gigId)
      if (last?.saved === nextSaved) writeState(gigId, { saved: nextSaved, recordId })
    }
    const finishErr = (err: any) => {
      if (err?.name === 'AbortError') return // newer toggle is reconciling
      inFlight.delete(gigId)
      const last = savedState.get(gigId)
      if (last?.saved === nextSaved) writeState(gigId, { saved: !nextSaved, recordId: current.recordId })
    }

    const reqInit: RequestInit = { credentials: 'same-origin', signal: aborter.signal }

    if (nextSaved) {
      fetch('/api/saved-gigs', {
        ...reqInit,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gig_id: gigId }),
      })
        .then(async (res) => {
          if (res.status === 409) return finishOk(current.recordId) // already saved server-side
          if (!res.ok) throw new Error('Save failed')
          const data = await res.json().catch(() => null)
          const payload = data?.data ?? data ?? {}
          const id = payload?.saved?.id ?? payload?.id ?? null
          finishOk(id)
        })
        .catch(finishErr)
    } else {
      // Fast-path DELETE by gig_id — no list-fetch detour required.
      fetch(`/api/saved-gigs/by-gig/${encodeURIComponent(gigId)}`, { ...reqInit, method: 'DELETE' })
        .then((res) => {
          if (!res.ok) throw new Error('Unsave failed')
          finishOk(null)
        })
        .catch(finishErr)
    }
  }, [gigId, state])

  const { saved } = state
  const heart = saved ? '♥' : '♡'
  const animName = `savegig-pop-${gigId.replace(/[^a-zA-Z0-9]/g, '')}`

  return (
    <>
      <style>{`
        @keyframes ${animName} {
          0%   { transform: scale(1);   }
          40%  { transform: scale(1.4); }
          70%  { transform: scale(0.92);}
          100% { transform: scale(1);   }
        }
      `}</style>
      <button
        type="button"
        onClick={handleToggle}
        aria-label={saved ? 'Remove from saved' : 'Save this gig'}
        aria-pressed={saved}
        className={className}
        style={{
          background: saved ? 'rgba(229, 62, 62, 0.08)' : 'transparent',
          border: '1px solid',
          borderColor: saved ? '#e53e3e' : 'rgba(0,0,0,0.15)',
          borderRadius: '8px',
          padding: compact ? '6px 10px' : '8px 12px',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: '13px',
          fontWeight: 600,
          color: saved ? '#e53e3e' : '#6B7280',
          transition: 'background-color 120ms ease, border-color 120ms ease, color 120ms ease',
          userSelect: 'none',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <span
          key={pulse}
          aria-hidden="true"
          style={{
            display: 'inline-block',
            fontSize: '16px',
            lineHeight: 1,
            animation: pulse > 0 ? `${animName} 280ms ease` : 'none',
          }}
        >
          {heart}
        </span>
        {!compact && <span>{saved ? 'Saved' : 'Save'}</span>}
      </button>
    </>
  )
}
