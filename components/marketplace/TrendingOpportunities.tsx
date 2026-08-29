'use client'

/**
 * TrendingOpportunities — provider-only (attorney / consultant) feed of open
 * student inquiries, presented as a Handshake-style card grid in the YouSafe
 * editorial style. Replaces the public "Live case briefs" strip.
 *
 * Cards show the case type, anonymised student name, jurisdiction/urgency/
 * tier tags, and posting recency. "View brief" deep-links attorneys into the
 * Inquiry Queue (?view=queue&open=<id>); consultants get the detail with a
 * pointer to Messages, since the claim flow is attorney-side today.
 *
 * Live: new inquiries arrive via Supabase Realtime and slot in at the top.
 */
import React from 'react'
import { useRouter } from 'next/navigation'
import { T, F } from '@/components/marketplace/tokens'
import { subscribeToTable } from '@/lib/supabaseRealtime'

type Opportunity = {
  id: string
  student: string
  title: string
  country: string | null
  urgency: string
  tier: string | null
  status: string
  created_at: string
}

const URGENCY: Record<string, { label: string; color: string; bg: string }> = {
  urgent: { label: 'Urgent', color: T.brick, bg: 'rgba(212,83,42,0.10)' },
  high: { label: 'High priority', color: T.brick, bg: 'rgba(212,83,42,0.10)' },
  normal: { label: 'Standard', color: T.indigo, bg: T.indigoSoft },
  low: { label: 'Flexible', color: T.inkSoft, bg: T.ruleSoft },
}

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return ''
  const m = Math.floor(Math.max(0, Date.now() - t) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export default function TrendingOpportunities({ role }: { role: 'attorney' | 'consultant' }) {
  const router = useRouter()
  const [opps, setOpps] = React.useState<Opportunity[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [freshIds, setFreshIds] = React.useState<Set<string>>(new Set())

  const load = React.useCallback(() => {
    fetch('/api/provider/opportunities?limit=48', { credentials: 'same-origin' })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(d?.error || `Failed (${r.status})`)
        setOpps(Array.isArray(d?.opportunities) ? d.opportunities : [])
        setError('')
      })
      .catch((e) => setError(e.message || 'Could not load opportunities.'))
      .finally(() => setLoading(false))
  }, [])

  React.useEffect(() => { load() }, [load])

  // Realtime: new inquiries appear at the top with a fade-in; a periodic
  // refresh keeps the grid honest about claims/conversions removing rows.
  React.useEffect(() => {
    const off = subscribeToTable('inquiries', 'public', (payload) => {
      if (payload.eventType !== 'INSERT' || !payload.new) return
      const row: any = payload.new
      if (row.source === 'portal_attorney_chat' || row.archived_at) return
      const next: Opportunity = {
        id: row.id,
        student: String(row.full_name || 'Student').split(/\s+/)[0] || 'Student',
        title: row.case_type_label || row.case_type || 'Client inquiry',
        country: row.country || null,
        urgency: String(row.urgency || 'normal').toLowerCase(),
        tier: row.recommended_tier || null,
        status: row.status || 'open',
        created_at: row.created_at,
      }
      setOpps((prev) => (prev.some((o) => o.id === next.id) ? prev : [next, ...prev]))
      setFreshIds((prev) => new Set(prev).add(next.id))
      setTimeout(() => setFreshIds((prev) => { const u = new Set(prev); u.delete(next.id); return u }), 1400)
    })
    const refresh = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') load()
    }, 60_000)
    return () => { off(); clearInterval(refresh) }
  }, [load])

  const open = (o: Opportunity) => {
    if (role === 'attorney') {
      router.push(`/marketplace?view=queue&open=${encodeURIComponent(o.id)}`)
    } else {
      router.push('/marketplace?view=messages')
    }
  }

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '36px 24px 80px', fontFamily: F.ui }}>
      <style>{`
        @keyframes oppFadeIn { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: none; } }
        @keyframes oppPulse {
          0%   { box-shadow: 0 0 0 0 rgba(95,107,58,0.5); }
          70%  { box-shadow: 0 0 0 8px rgba(95,107,58,0); }
          100% { box-shadow: 0 0 0 0 rgba(95,107,58,0); }
        }
        .ys-opp-card { transition: box-shadow .15s ease, border-color .15s ease, transform .15s ease; }
        .ys-opp-card:hover { box-shadow: 0 8px 24px rgba(15,23,42,0.10); border-color: ${T.paper3} !important; transform: translateY(-2px); }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 14, marginBottom: 26 }}>
        <div>
          <div style={{ fontFamily: F.mono, fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: T.gold, marginBottom: 6 }}>
            For {role === 'attorney' ? 'attorneys' : 'consultants'} only
          </div>
          <h1 style={{ fontFamily: F.display, fontSize: 34, fontWeight: 600, color: '#FFFFFF', margin: 0, letterSpacing: '-0.015em' }}>
            Trending opportunities
          </h1>
          <p style={{ fontSize: 14, color: T.onPaperSoft, margin: '8px 0 0', maxWidth: 560, lineHeight: 1.6 }}>
            Live inquiries filed by students. Fixed fees, escrowed, refundable — respond first and win the brief.
          </p>
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: F.mono, fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
          <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: T.moss, animation: 'oppPulse 1.8s ease-out infinite' }} />
          Live · {opps.length} open
        </div>
      </div>

      {error && (
        <div style={{ background: 'rgba(212,83,42,0.08)', border: '1px solid rgba(212,83,42,0.22)', borderRadius: 10, padding: '14px 18px', color: T.brick, fontSize: 13, marginBottom: 18, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span>{error}</span>
          <button onClick={load} style={{ background: 'none', border: 'none', color: T.brick, textDecoration: 'underline', cursor: 'pointer', fontFamily: F.ui, fontSize: 13 }}>Retry</button>
        </div>
      )}

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} style={{ background: T.vellum, border: `1px solid ${T.rule}`, borderRadius: 12, padding: 22, minHeight: 190, opacity: 0.6 }}>
              <div style={{ height: 18, width: '70%', background: T.paper2, borderRadius: 4, marginBottom: 12 }} />
              <div style={{ height: 12, width: '45%', background: T.paper, borderRadius: 4, marginBottom: 8 }} />
              <div style={{ height: 12, width: '60%', background: T.paper, borderRadius: 4 }} />
            </div>
          ))}
        </div>
      ) : opps.length === 0 && !error ? (
        <div style={{ background: T.vellum, border: `1px dashed ${T.rule}`, borderRadius: 12, padding: '56px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 34, marginBottom: 12, opacity: 0.4 }}>📡</div>
          <div style={{ fontFamily: F.display, fontSize: 20, fontWeight: 600, color: T.ink, marginBottom: 6 }}>No open opportunities right now</div>
          <div style={{ fontSize: 13, color: T.inkMid, lineHeight: 1.6 }}>New student inquiries appear here in real time — check back soon.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
          {opps.map((o) => {
            const urg = URGENCY[o.urgency] || URGENCY.normal
            return (
              <div
                key={o.id}
                className="ys-opp-card"
                onClick={() => open(o)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(o) } }}
                style={{
                  background: T.vellum,
                  border: `1px solid ${T.rule}`,
                  borderRadius: 12,
                  padding: 22,
                  minHeight: 190,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  cursor: 'pointer',
                  animation: freshIds.has(o.id) ? 'oppFadeIn .5s ease both' : undefined,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{ fontFamily: F.mono, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '3px 9px', borderRadius: 4, background: urg.bg, color: urg.color }}>
                    {urg.label}
                  </span>
                  <span style={{ fontFamily: F.mono, fontSize: 11, color: T.inkSoft }}>{relativeTime(o.created_at)}</span>
                </div>

                <div>
                  <div style={{ fontFamily: F.display, fontSize: 19, fontWeight: 600, color: T.ink, lineHeight: 1.25, letterSpacing: '-0.008em' }}>
                    {o.title}
                  </div>
                  <div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 6 }}>
                    Filed by {o.student}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {o.country && (
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 999, border: `1px solid ${T.rule}`, color: T.cream, background: T.paper }}>
                      {o.country}
                    </span>
                  )}
                  {o.tier && (
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 999, border: `1px solid ${T.rule}`, color: T.cream, background: T.paper }}>
                      {String(o.tier).replace(/_/g, ' ')}
                    </span>
                  )}
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 999, border: `1px solid ${T.rule}`, color: T.gold, background: T.paper }}>
                    Escrow protected
                  </span>
                </div>

                <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontFamily: F.mono, fontSize: 11, color: T.inkSoft, textTransform: 'capitalize' }}>{o.status}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); open(o) }}
                    style={{
                      padding: '8px 18px',
                      borderRadius: 999,
                      border: `1.5px solid ${T.indigo}`,
                      background: 'transparent',
                      color: T.indigo,
                      fontSize: 13,
                      fontWeight: 700,
                      fontFamily: F.ui,
                      cursor: 'pointer',
                    }}
                  >
                    {role === 'attorney' ? 'View brief' : 'View'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
