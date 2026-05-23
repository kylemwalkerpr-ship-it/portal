'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Check {
  id: string
  label: string
  weight: number
  done: boolean
  hint?: string
}

interface Strength {
  score: number
  tier: 'bronze' | 'silver' | 'gold' | 'platinum'
  checks: Check[]
  completed: number
  total: number
  username: string | null
  publish_threshold: number
  publish_ready: boolean
}

/**
 * ProfileCompletenessBanner — Fiverr-style progress meter shown above the
 * gig builder. Pulls /api/attorney/profile/strength and surfaces:
 *   - the % score with a status pill (Ready / X% to publish-ready / Set handle)
 *   - the missing required items, each linking to the profile editor
 *   - a hard publish-ready signal so the wizard can disable the publish CTA
 *     when the threshold (75%) isn't met yet.
 */
export function ProfileCompletenessBanner({
  onReadyChange,
}: {
  onReadyChange?: (ready: boolean, score: number) => void
}) {
  const [data, setData] = useState<Strength | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/attorney/profile/strength', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.statusText)))
      .then((d: Strength) => {
        if (cancelled) return
        setData(d)
        onReadyChange?.(!!d.publish_ready, d.score)
      })
      .catch(() => !cancelled && setError('Could not load profile strength'))
    return () => {
      cancelled = true
    }
  }, [onReadyChange])

  if (error) return null
  if (!data) {
    return (
      <div style={skeleton} role="status">
        Loading profile readiness…
      </div>
    )
  }

  const missing = data.checks.filter((c) => !c.done)
  const ready = data.publish_ready
  const threshold = data.publish_threshold

  const tone =
    ready ? 'ready'
      : !data.username ? 'urgent'
      : 'progress'

  return (
    <div style={wrap}>
      <div style={head}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <ScoreRing score={data.score} tone={tone} />
          <div style={{ minWidth: 0 }}>
            <div style={statusLabel(tone)}>
              {ready
                ? 'Profile ready to publish'
                : !data.username
                  ? 'Set your SEO profile handle to publish'
                  : `Reach ${threshold}% to publish · ${threshold - data.score}% to go`}
            </div>
            <div style={subLabel}>
              {data.completed} of {data.total} sections complete · current tier{' '}
              <b style={{ color: '#1D2433' }}>{capitalise(data.tier)}</b>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          <Link href="/dashboard?goto=profile" style={primaryCta(tone)}>
            {data.username ? 'Continue intake →' : 'Set handle + intake →'}
          </Link>
          <button type="button" onClick={() => setOpen((v) => !v)} style={ghostCta}>
            {open ? 'Hide list' : `${missing.length} item${missing.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>

      {open && missing.length > 0 && (
        <ul style={list}>
          {missing.map((c) => (
            <li key={c.id} style={item}>
              <span style={dot} aria-hidden="true" />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: 600, color: '#1D2433' }}>{c.label}</span>
                {c.hint && <span style={hintStyle}> — {c.hint}</span>}
              </span>
              <span style={weightChip}>+{c.weight}%</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ScoreRing({ score, tone }: { score: number; tone: 'ready' | 'progress' | 'urgent' }) {
  const stroke = tone === 'ready' ? '#1A6B3A' : tone === 'urgent' ? '#B22234' : '#3C3B6E'
  const circumference = 2 * Math.PI * 18
  const offset = circumference * (1 - score / 100)
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" style={{ flexShrink: 0 }}>
      <circle cx="24" cy="24" r="18" fill="none" stroke="#E7E0CD" strokeWidth="4" />
      <circle
        cx="24" cy="24" r="18" fill="none" stroke={stroke} strokeWidth="4"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 24 24)"
        style={{ transition: 'stroke-dashoffset .4s ease' }}
      />
      <text x="24" y="28" textAnchor="middle" fontSize="13" fontWeight="700" fill="#1D2433"
        style={{ fontFamily: 'var(--font-inter), Inter, sans-serif' }}>
        {score}
      </text>
    </svg>
  )
}

function capitalise(s: string) { return s.charAt(0).toUpperCase() + s.slice(1) }

const wrap: React.CSSProperties = {
  background: 'linear-gradient(180deg, #FFFEF9 0%, #F4F0E6 100%)',
  border: '1px solid #D9D1BD',
  borderRadius: 12,
  padding: '14px 16px',
  marginBottom: 18,
  fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif',
}
const head: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
}
const subLabel: React.CSSProperties = { marginTop: 4, fontSize: 12, color: '#4A4F5B' }
const skeleton: React.CSSProperties = {
  ...wrap, color: '#7B7B72', fontSize: 13, padding: 14,
}
const statusLabel = (tone: 'ready' | 'progress' | 'urgent'): React.CSSProperties => ({
  fontFamily: "var(--font-lora), Lora, Georgia, serif",
  fontSize: 17, fontWeight: 600, color: tone === 'urgent' ? '#B22234' : '#1D2433', letterSpacing: '-0.005em',
})
const primaryCta = (tone: 'ready' | 'progress' | 'urgent'): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', height: 32, padding: '0 14px',
  background: tone === 'ready' ? '#1A6B3A' : '#3C3B6E', color: '#fff',
  borderRadius: 999, fontSize: 12.5, fontWeight: 600, textDecoration: 'none',
})
const ghostCta: React.CSSProperties = {
  height: 32, padding: '0 12px', border: '1px solid #D9D1BD', background: '#fff', color: '#1D2433',
  borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer',
}
const list: React.CSSProperties = {
  listStyle: 'none', margin: '12px 0 0', padding: '12px 0 0', borderTop: '1px solid #E7E0CD',
  display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 240, overflowY: 'auto',
}
const item: React.CSSProperties = {
  display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 12.5, color: '#4A4F5B', padding: '4px 0',
}
const dot: React.CSSProperties = {
  width: 6, height: 6, borderRadius: '50%', background: '#B22234', flexShrink: 0, transform: 'translateY(1px)',
}
const hintStyle: React.CSSProperties = { color: '#7B7B72', fontStyle: 'italic' }
const weightChip: React.CSSProperties = {
  fontFamily: "var(--font-plex-mono), 'IBM Plex Mono', monospace",
  fontSize: 10.5, color: '#4A4F5B', background: '#fff', border: '1px solid #E7E0CD',
  padding: '2px 7px', borderRadius: 999, flexShrink: 0,
}
