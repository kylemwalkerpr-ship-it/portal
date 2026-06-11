'use client'

/**
 * HeroCaseFileSlideshow — auto-advancing hero card that cycles through one
 * top case-file per active jurisdiction.
 *
 * Features:
 * - Auto-advance every 5500 ms (pauses on hover / touch / focus)
 * - Dot indicators + chevron left/right
 * - Jurisdiction badge per slide
 * - Respects prefers-reduced-motion
 * - Falls back to a single static card when only one jurisdiction is live
 */
import React from 'react'

interface CaseTier {
  tier: string
  price: number
}

export interface HeroSlide {
  id: string
  title: string
  providerName: string
  // Resolved seller headshot (attorneys.headshot_url or consultants.headshot_url).
  // Null falls back to initials in the same gradient circle.
  providerHeadshot: string | null
  provider_type: 'attorney' | 'consultant' | null
  providerCountry: string | null
  jx: string | null
  avg_rating: number
  review_count: number
  slug: string | null
  caseTiers: CaseTier[]
  isFallback?: boolean
  label: string // e.g. "United States"
}

interface Props {
  slides: HeroSlide[]
  currency: string
  T: Record<string, string>
  F: Record<string, string>
}

// Helpers inlined — functions cannot cross the RSC → client boundary.
function formatPrice(cents: number | null, currency = 'USD'): string {
  if (cents == null) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(cents / 100))
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p.charAt(0).toUpperCase()).join('') || 'YS'
}

function withCountry(href: string, country: string): string {
  if (country === 'all') return href
  const sep = href.includes('?') ? '&' : '?'
  return `${href}${sep}country=${country}`
}

const INDIGO = '#3C3B6E'
const INDIGO_DEEP = '#2A2A55'
const INK = '#0F172A'
const INK_SOFT = '#64748B'
const RULE = '#E2E8F0'
const PAPER2 = '#EEF1F6'
const BRICK = '#B22234'
const MOSS = '#5F6B3A'
const STAR = '#C68B27'
const SERIF = "var(--font-lora), 'Lora', Georgia, 'Times New Roman', serif"
const MONO = "var(--font-plex-mono), 'IBM Plex Mono', ui-monospace, monospace"
const UI = "var(--font-inter), var(--portal-font-body, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif)"

export default function HeroCaseFileSlideshow({
  slides,
  currency,
  T,
}: Props) {
  const [index, setIndex] = React.useState(0)
  const [paused, setPaused] = React.useState(false)
  const [prefersReduced, setPrefersReduced] = React.useState(false)

  const count = slides.length

  React.useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setPrefersReduced(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setPrefersReduced(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // Auto-advance
  React.useEffect(() => {
    if (count <= 1 || paused || prefersReduced) return
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % count)
    }, 5500)
    return () => clearInterval(timer)
  }, [count, paused, prefersReduced])

  const go = (i: number) => setIndex((i % count + count) % count)
  const prev = () => go(index - 1)
  const next = () => go(index + 1)

  // Empty-state guard must come BEFORE reading slides[index]; otherwise an
  // empty slides array crashes SSR with "Cannot read properties of undefined".
  // That throw inside the layout's Suspense boundary surfaces as React #419
  // ("We hit a snag") on every public landing fetch when the inventory query
  // returns no jurisdictions with caseFiles.
  if (count === 0) {
    return (
      <aside className="hero-empty" style={{ background: '#fff', border: `1px dashed ${RULE}`, borderRadius: 18, padding: '48px 32px', textAlign: 'center', color: INK_SOFT, fontFamily: SERIF, fontStyle: 'italic', fontSize: 18, lineHeight: 1.5 }}>
        No active briefs yet — be the first to <a href="https://portal.yousafeconsultancy.com/sign-up/attorney" style={{ color: INDIGO, borderBottom: `1px solid ${INDIGO}` }}>list one</a>.
      </aside>
    )
  }

  // Clamp index to a valid slot — defensive against `index` exceeding `count`
  // after a state reset, hot-reload, or jurisdiction filter change.
  const safeIndex = ((index % count) + count) % count
  const slide = slides[safeIndex]
  const jxLabel = (slide.jx ?? 'us').toUpperCase()

  const tierLabels = ['Cover memo + checklist review', 'Full evidence pack & declarations', 'Pack + attorney signature']

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label="Top case briefs by jurisdiction"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      style={{ position: 'relative' }}
    >
      {/* Jurisdiction badge */}
      <div
        style={{
          position: 'absolute',
          top: -10,
          right: 14,
          zIndex: 2,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 12px',
          borderRadius: 999,
          background: '#fff',
          border: `1px solid ${RULE}`,
          boxShadow: '0 1px 3px rgba(15,23,42,0.08)',
          color: INK,
          fontFamily: UI,
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: '#1A6B45',
          }}
        />
        {jxLabel} · {slide.label}
      </div>

      {/* Card */}
      <a
        className="hero-card-link"
        href={slide.slug ? `/marketplace/gigs/${slide.slug}` : withCountry('/marketplace?sort=most_orders', slide.jx ?? 'all')}
        aria-label={`Open ${slide.title}`}
        style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
      >
        <aside
          className="hero-card"
          data-c={slide.jx ?? 'us'}
          aria-label="Most-popular service listing"
          style={{ animation: 'slideFadeIn 350ms ease-out' }}
        >
          <div className="file-meta">
            <span className="badge popular">{slide.isFallback ? 'Top brief' : 'Most popular'}</span>
            <span className="badge verified">
              ✓ Verified {slide.provider_type === 'attorney' ? '· J.D.' : '· Regulated'}
            </span>
          </div>
          <h3>{slide.title}</h3>
          <div className="attorney">
            {slide.providerHeadshot ? (
              // Real headshot. The existing .avatar CSS rule handles size
              // and circle clipping; object-fit:cover prevents distortion.
              <img
                className="avatar"
                src={slide.providerHeadshot}
                alt={slide.providerName}
                loading="lazy"
                style={{ objectFit: 'cover' }}
              />
            ) : (
              <div className="avatar" style={{ background: `linear-gradient(135deg, ${INDIGO}, ${INDIGO_DEEP})` }}>
                {initialsOf(slide.providerName)}
              </div>
            )}
            <div className="attorney-name">
              <b>{slide.providerName}</b>
              <span>{slide.provider_type === 'attorney' ? 'Licensed attorney' : 'Regulated consultant'}</span>
            </div>
            {slide.review_count > 0 ? (
              <div className="stars" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 600 }}>
                <svg viewBox="0 0 24 24" fill="currentColor" style={{ color: STAR, width: 14, height: 14 }}>
                  <polygon points="12 2 15 9 22 9.5 17 14.5 18.5 22 12 18 5.5 22 7 14.5 2 9.5 9 9" />
                </svg>
                {slide.avg_rating.toFixed(2)} <span className="rev" style={{ color: INK_SOFT, fontWeight: 500, marginLeft: 2 }}>· {slide.review_count}</span>
              </div>
            ) : null}
          </div>
          {slide.caseTiers.length > 0 && (
            <div className="tiers">
              {slide.caseTiers.map((t, i) => (
                <div key={i} className="tier-row">
                  <span className="lbl">{t.tier}</span>
                  <span className="name">{tierLabels[i] ?? ''}</span>
                  <span className="price">{formatPrice(t.price, currency)}</span>
                </div>
              ))}
            </div>
          )}
          {slide.isFallback && (
            <div className="hero-fallback-hint" style={{ marginTop: 10, padding: '8px 10px', background: PAPER2, border: `1px dashed ${RULE}`, borderRadius: 8, fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.06em', color: INK, textTransform: 'none' } as React.CSSProperties}>
              No <b>{slide.label}</b> briefs yet — showing the platform's top brief.
            </div>
          )}
        </aside>
      </a>

      {/* Dots + chevrons (only when >1 slide) */}
      {count > 1 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            marginTop: 12,
          }}
        >
          <button
            aria-label="Previous brief"
            onClick={(e) => { e.preventDefault(); prev() }}
            style={{
              width: 28,
              height: 28,
              borderRadius: 999,
              border: `1px solid ${RULE}`,
              background: '#fff',
              color: INK,
              display: 'inline-grid',
              placeItems: 'center',
              cursor: 'pointer',
              fontSize: 14,
              fontFamily: UI,
            }}
          >
            ‹
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {slides.map((_, i) => (
              <button
                key={i}
                aria-label={`Go to slide ${i + 1}`}
                aria-current={i === index ? 'true' : undefined}
                onClick={(e) => { e.preventDefault(); go(i) }}
                style={{
                  width: i === index ? 20 : 8,
                  height: 8,
                  borderRadius: 999,
                  border: 'none',
                  background: i === index ? INK : RULE,
                  cursor: 'pointer',
                  transition: 'width 0.2s, background 0.2s',
                  padding: 0,
                }}
              />
            ))}
          </div>

          <button
            aria-label="Next brief"
            onClick={(e) => { e.preventDefault(); next() }}
            style={{
              width: 28,
              height: 28,
              borderRadius: 999,
              border: `1px solid ${RULE}`,
              background: '#fff',
              color: INK,
              display: 'inline-grid',
              placeItems: 'center',
              cursor: 'pointer',
              fontSize: 14,
              fontFamily: UI,
            }}
          >
            ›
          </button>
        </div>
      )}
    </div>
  )
}
