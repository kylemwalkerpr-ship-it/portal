'use client'

/**
 * MarketplaceFeed — WhatsApp-style vertical stack of active inquiry-status
 * broadcasts. Auto-refreshes via Supabase Realtime; prepending new statuses
 * with a brief opacity fade-in.
 *
 * Each card → tap marks the status viewed (`POST /api/statuses/:id/view`),
 * then routes the visitor to `/dashboard/inquiries/:inquiry_id`.
 */
import React from 'react'
import { useRouter } from 'next/navigation'
import Avatar from '@/components/messaging/Avatar'
import StatusRing from '@/components/messaging/StatusRing'
import { subscribeToTable } from '@/lib/supabaseRealtime'

type Status = {
  id: string
  person_id: string
  person_name: string
  inquiry_id: string | null
  payload: Record<string, any> | null
  created_at: string
  expires_at: string
  viewed: boolean
}

const INDIGO = '#3C3B6E'
const BRICK = '#B22234'
const INK = '#1D2433'
const INK_MID = '#4A4F5B'
const INK_SOFT = '#7B7B72'
const BORDER = '#D9D1BD'
const PAPER = '#FBFAF7'
const VELLUM = '#FFFEF9'
const SOFT_BORDER = '#E7E0CD'
const SERIF = "var(--font-lora), Lora, Georgia, serif"
const SANS = "var(--font-inter), Inter, system-ui, sans-serif"

function urgencyColor(u: string | null | undefined): string {
  const v = (u || '').toLowerCase()
  if (v === 'high' || v === 'urgent' || v === 'critical') return BRICK
  if (v === 'low') return INK_SOFT
  return INDIGO
}

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return ''
  const diff = Math.max(0, Date.now() - t)
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

export default function MarketplaceFeed() {
  const router = useRouter()
  const [statuses, setStatuses] = React.useState<Status[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [freshIds, setFreshIds] = React.useState<Set<string>>(new Set())

  React.useEffect(() => {
    let cancelled = false
    fetch('/api/statuses')
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        if (d?.error) setError(String(d.error))
        else setStatuses(Array.isArray(d?.statuses) ? d.statuses : [])
      })
      .catch((e) => !cancelled && setError(String(e?.message || e)))
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [])

  React.useEffect(() => {
    const off = subscribeToTable('inquiry_statuses', 'public', (payload) => {
      if (payload.eventType !== 'INSERT' || !payload.new) return
      const row = payload.new
      // Skip expired rows that arrived stale
      if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return
      const next: Status = {
        id: row.id,
        person_id: row.person_id,
        person_name: row.person_name || '',
        inquiry_id: row.inquiry_id || null,
        payload: row.payload || null,
        created_at: row.created_at,
        expires_at: row.expires_at,
        viewed: false,
      }
      setStatuses((prev) => (prev.some((s) => s.id === next.id) ? prev : [next, ...prev]))
      setFreshIds((prev) => {
        const updated = new Set(prev)
        updated.add(next.id)
        return updated
      })
      // Clear the fade flag after the animation window so future scrolls don't re-animate.
      setTimeout(() => {
        setFreshIds((prev) => {
          const updated = new Set(prev)
          updated.delete(next.id)
          return updated
        })
      }, 1200)
    })
    return () => off()
  }, [])

  async function openStatus(s: Status) {
    // Optimistic mark-viewed.
    setStatuses((prev) => prev.map((x) => (x.id === s.id ? { ...x, viewed: true } : x)))
    try {
      await fetch(`/api/statuses/${s.id}/view`, { method: 'POST' })
    } catch { /* swallow — view tracking is best-effort */ }
    if (s.inquiry_id) router.push(`/dashboard/inquiries/${s.inquiry_id}`)
  }

  return (
    <div style={{ background: PAPER, padding: 20, borderRadius: 14, border: `1px solid ${SOFT_BORDER}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontFamily: SERIF, fontSize: 22, color: INK, fontWeight: 600 }}>Live case briefs</div>
          <div style={{ fontFamily: SANS, fontSize: 13, color: INK_SOFT, marginTop: 2 }}>
            Active client inquiries broadcast over the last 24 hours.
          </div>
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: SANS, fontSize: 12, color: INK_MID }}>
          <span
            aria-hidden="true"
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#1A6B45',
              boxShadow: '0 0 0 0 rgba(26,107,69,0.6)',
              animation: 'msgPulse 1.6s ease-out infinite',
            }}
          />
          Live
        </div>
      </div>

      <style>{`@keyframes msgPulse {
        0%   { box-shadow: 0 0 0 0 rgba(26,107,69,0.55); }
        70%  { box-shadow: 0 0 0 9px rgba(26,107,69,0); }
        100% { box-shadow: 0 0 0 0 rgba(26,107,69,0); }
      }
      @keyframes msgFadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }`}</style>

      {loading ? (
        <div style={{ fontFamily: SANS, fontSize: 14, color: INK_SOFT, padding: '24px 0' }}>Loading live briefs…</div>
      ) : error ? (
        <div style={{ fontFamily: SANS, fontSize: 14, color: BRICK, padding: '24px 0' }}>Couldn’t load briefs: {error}</div>
      ) : statuses.length === 0 ? (
        <div style={{ fontFamily: SANS, fontSize: 14, color: INK_SOFT, padding: '24px 0' }}>
          No active briefs right now. New inquiries appear here in real time.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {statuses.map((s) => {
            const urg = (s.payload?.urgency as string) || 'normal'
            const caseLabel = (s.payload?.case_type_label as string) || (s.payload?.case_type as string) || 'Inquiry'
            const isFresh = freshIds.has(s.id)
            return (
              <button
                key={s.id}
                onClick={() => openStatus(s)}
                style={{
                  textAlign: 'left',
                  background: VELLUM,
                  border: `1px solid ${BORDER}`,
                  borderRadius: 12,
                  padding: 14,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  fontFamily: SANS,
                  animation: isFresh ? 'msgFadeIn 350ms ease-out' : undefined,
                }}
              >
                <StatusRing hasStatus={true} viewed={s.viewed} size={44}>
                  <Avatar name={s.person_name || 'Client'} userId={s.person_id} size={44} />
                </StatusRing>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, color: INK, fontSize: 15 }}>
                      {s.person_name || 'New client'}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: 0.6,
                        padding: '2px 8px',
                        borderRadius: 999,
                        background: `${urgencyColor(urg)}14`,
                        color: urgencyColor(urg),
                      }}
                    >
                      {urg}
                    </span>
                    <span style={{ fontSize: 13, color: INK_MID }}>· {caseLabel}</span>
                  </div>
                  <div style={{ marginTop: 4, fontSize: 13, color: INDIGO }}>
                    Tap to read brief →
                  </div>
                </div>
                <div style={{ fontSize: 12, color: INK_SOFT, whiteSpace: 'nowrap' }}>{relativeTime(s.created_at)}</div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
