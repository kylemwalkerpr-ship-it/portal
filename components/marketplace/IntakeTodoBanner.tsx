'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

type Strength = {
  score: number
  publish_threshold: number
  publish_ready: boolean
  username: string | null
}

interface Props {
  role: 'attorney' | 'consultant'
}

/**
 * IntakeTodoBanner — sticky, dismissable "complete your intake" banner that
 * docks above the dashboard while the profile is below the 75% publish gate.
 * Works for both attorneys and consultants — endpoint + link change per role.
 */
export function IntakeTodoBanner({ role }: Props) {
  const [data, setData] = useState<Strength | null>(null)
  const [hidden, setHidden] = useState(false)

  const strengthEndpoint = role === 'attorney'
    ? '/api/attorney/profile/strength'
    : '/api/consultant/profile/strength'
  const intakeHref = role === 'attorney'
    ? '/dashboard/attorney/intake'
    : '/dashboard/consultant/intake'

  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage.getItem(`ys-intake-banner-hidden-${role}`) === '1') {
        setHidden(true)
      }
    } catch { /* non-fatal */ }
    fetch(strengthEndpoint, { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setData(d))
      .catch(() => { /* swallow */ })
  }, [strengthEndpoint, role])

  if (hidden || !data || data.publish_ready) return null

  const remaining = Math.max(0, data.publish_threshold - data.score)
  const needsHandle = !data.username

  return (
    <div role="alert" style={wrap}>
      <div style={inner}>
        <div style={dotBlock}>
          <span style={dot} aria-hidden="true" />
          <div>
            <div style={head}>
              {needsHandle ? 'Set your SEO handle to publish' : `${remaining}% to your publish-ready profile`}
            </div>
            <div style={sub}>
              You're at <b style={{ color: '#1D2433' }}>{data.score}%</b>. Reach{' '}
              <b style={{ color: '#1D2433' }}>{data.publish_threshold}%</b> and set a username to start posting gigs.
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Link href={intakeHref} style={primaryCta}>Continue intake →</Link>
          <button
            type="button"
            onClick={() => {
              try { window.sessionStorage.setItem(`ys-intake-banner-hidden-${role}`, '1') } catch { /* noop */ }
              setHidden(true)
            }}
            aria-label="Hide for this session"
            style={dismissBtn}
          >×</button>
        </div>
      </div>
    </div>
  )
}

const wrap: React.CSSProperties = {
  position: 'sticky', top: 0, zIndex: 60,
  background: 'linear-gradient(180deg, #FFFEF9 0%, #F4F0E6 100%)',
  borderBottom: '1px solid #D9D1BD',
  fontFamily: "var(--font-inter), Inter, system-ui, sans-serif",
  color: '#1D2433',
}
const inner: React.CSSProperties = {
  width: 'min(1280px, calc(100vw - 32px))', margin: '0 auto', padding: '10px 0',
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
}
const dotBlock: React.CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 0,
}
const dot: React.CSSProperties = {
  width: 8, height: 8, borderRadius: '50%', background: '#B22234',
  boxShadow: '0 0 0 3px rgba(178,34,52,0.18)',
  marginTop: 6, flexShrink: 0,
}
const head: React.CSSProperties = {
  fontFamily: "var(--font-lora), Lora, Georgia, serif",
  fontSize: 15, fontWeight: 600, color: '#1D2433', lineHeight: 1.2,
}
const sub: React.CSSProperties = {
  fontSize: 12.5, color: '#4A4F5B', marginTop: 2, lineHeight: 1.4,
}
const primaryCta: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', height: 32,
  padding: '0 14px', background: '#3C3B6E', color: '#fff',
  borderRadius: 999, fontSize: 12.5, fontWeight: 600, textDecoration: 'none',
}
const dismissBtn: React.CSSProperties = {
  width: 28, height: 28, border: '1px solid #D9D1BD', background: '#FFFEF9',
  color: '#4A4F5B', borderRadius: '50%', fontSize: 18, lineHeight: 1, cursor: 'pointer',
}
