// @ts-nocheck
'use client'
import React from 'react'
import { C } from './shared'
import { EagleGlyph, MapleGlyph, LionGlyph } from './country-glyphs'

// Right rail: role CTAs plus a live article feed from the legal library.
//
// Modes:
//   - inline   → renders flat, no sticky/drawer (used inside the consultant
//                dashboard column).
//   - rail     → wide-screen sticky right column (default).
//   - rail-min → wide-screen, user clicked Hide → floating "Show ▸" tab on
//                the right edge.
//   - drawer   → narrow viewport with drawer open.
//   - launcher → narrow viewport, drawer closed → floating launcher button.
//
// Switching modes never unmounts the component, so feed state and scroll
// position survive expand/collapse cycles.
export default function DashboardRightPane({ role = 'student', variant = 'rail' }) {
  const cards = role === 'attorney' ? ATTORNEY_CARDS
    : role === 'admin' ? ADMIN_CARDS
    : role === 'consultant' ? CONSULTANT_CARDS
    : STUDENT_CARDS

  const [articles, setArticles] = React.useState([])
  const [region, setRegion] = React.useState('ALL')
  const [isLoading, setIsLoading] = React.useState(true)
  const [feedError, setFeedError] = React.useState(null)
  const [hidden, setHidden] = React.useState(false)
  const [isNarrow, setIsNarrow] = React.useState(false)
  const hoverCapable = useHoverCapable()

  // Track viewport width
  React.useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(max-width: 1100px)')
    const apply = () => setIsNarrow(mq.matches)
    apply()
    mq.addEventListener?.('change', apply)
    return () => mq.removeEventListener?.('change', apply)
  }, [])

  // Reset hidden state when crossing the breakpoint so the user starts fresh
  // at the new layout (otherwise hiding the drawer leaves the wide rail stuck
  // closed, or vice versa).
  React.useEffect(() => { setHidden(false) }, [isNarrow])

  // Fetch the article feed (region-aware).
  React.useEffect(() => {
    let cancelled = false
    const ctrl = new AbortController()

    setIsLoading(true)
    setFeedError(null)

    const params = new URLSearchParams({ role, limit: '18' })
    if (region !== 'ALL') params.set('region', region)

    fetch(`/api/articles/feed?${params.toString()}`, {
      signal: ctrl.signal,
      headers: { Accept: 'application/json' },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Article feed returned ${res.status}`)
        const payload = await res.json()
        if (cancelled) return
        setArticles(Array.isArray(payload?.articles) ? payload.articles : [])
      })
      .catch((err) => {
        if (cancelled || err?.name === 'AbortError') return
        setFeedError('We could not refresh the article feed.')
        setArticles([])
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => { cancelled = true; ctrl.abort() }
  }, [role, region])

  const inline = variant === 'inline'
  const mode = inline
    ? 'inline'
    : isNarrow
      ? (hidden ? 'launcher' : 'drawer')
      : (hidden ? 'rail-min' : 'rail')

  // Lock background scroll while the drawer is open.
  React.useEffect(() => {
    if (typeof document === 'undefined') return
    if (mode !== 'drawer') return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [mode])

  // Escape key closes the drawer.
  React.useEffect(() => {
    if (mode !== 'drawer') return
    const onKey = (e) => { if (e.key === 'Escape') setHidden(true) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode])

  // ── Mode-only renders ────────────────────────────────────────────────────
  if (mode === 'launcher') {
    return <LauncherButton count={articles.length} onClick={() => setHidden(false)} />
  }
  if (mode === 'rail-min') {
    return <RailMinTab onClick={() => setHidden(false)} />
  }

  // ── Rail / drawer / inline render ────────────────────────────────────────
  const containerStyle = inline
    ? INLINE_CONTAINER
    : mode === 'drawer'
      ? DRAWER_CONTAINER
      : RAIL_CONTAINER

  return (
    <>
      {mode === 'drawer' && (
        <button
          type="button"
          aria-label="Close article feed"
          onClick={() => setHidden(true)}
          style={DRAWER_BACKDROP}
        />
      )}
      <aside style={containerStyle} className="yousafe-right-pane">
        <PaneToolbar
          mode={mode}
          onHide={() => setHidden(true)}
        />
        <PracticeStrip selected={region} onSelect={setRegion} />
        {cards.map((card, i) => (
          <PaneCard key={i} {...card} />
        ))}
        <ArticleFeedHeader region={region} />
        {isLoading ? (
          <FeedSkeleton />
        ) : feedError ? (
          <PaneCard
            accent="#3C3B6E"
            eyebrow="Article feed"
            title="Legal articles are temporarily unavailable."
            body="Open the legal library to browse the latest YouSafe guides while the dashboard feed refreshes."
            href={LEGAL_ARTICLES_URL}
            cta="Open legal library →"
          />
        ) : articles.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {articles.map((article) => (
              <ArticleCard
                key={article.url || article.path || article.title}
                article={article}
                hoverCapable={hoverCapable}
              />
            ))}
          </div>
        ) : (
          <PaneCard
            accent="#3C3B6E"
            eyebrow="Article feed"
            title="Browse the legal library."
            body="Guides, explainers, and checklists from the YouSafe legal article library."
            href={LEGAL_ARTICLES_URL}
            cta="View all articles →"
          />
        )}
        <Footnote feedError={feedError} />
      </aside>
    </>
  )
}

// ── Mode containers ─────────────────────────────────────────────────────────

const RAIL_CONTAINER = {
  width: '320px',
  flexShrink: 0,
  padding: '24px 22px 28px 0',
  display: 'flex',
  flexDirection: 'column',
  gap: '14px',
  position: 'sticky',
  top: 0,
  alignSelf: 'flex-start',
  maxHeight: '100vh',
  overflowY: 'auto',
  scrollbarGutter: 'stable both-edges',
  WebkitOverflowScrolling: 'touch',
}

const DRAWER_CONTAINER = {
  position: 'fixed',
  top: 0,
  right: 0,
  width: 'min(380px, 92vw)',
  height: '100dvh',
  zIndex: 70,
  background: C.bg,
  borderLeft: `1px solid ${C.border}`,
  boxShadow: '-12px 0 36px rgba(15,18,32,0.18)',
  padding: '18px 16px 24px',
  display: 'flex',
  flexDirection: 'column',
  gap: '14px',
  overflowY: 'auto',
  WebkitOverflowScrolling: 'touch',
}

const INLINE_CONTAINER = {
  width: '100%',
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '14px',
}

const DRAWER_BACKDROP = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15,18,32,0.4)',
  border: 'none',
  cursor: 'pointer',
  zIndex: 69,
  padding: 0,
}

// ── Toolbar ─────────────────────────────────────────────────────────────────

function PaneToolbar({ mode, onHide }) {
  if (mode === 'inline') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <div>
          <div style={eyebrowStyle}>Insights</div>
          <div style={{ fontFamily: C.serif, fontSize: '20px', color: C.text, lineHeight: 1.15, marginTop: '3px' }}>Article feed.</div>
        </div>
        <a href={LEGAL_ARTICLES_URL} target="_blank" rel="noreferrer" style={{ color: C.cyan, fontSize: '12px', fontWeight: 800, textDecoration: 'none', whiteSpace: 'nowrap' }}>
          Library →
        </a>
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', position: 'sticky', top: 0, zIndex: 1, background: 'inherit', paddingTop: '4px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '14px' }} aria-hidden>📰</span>
        <span style={{ fontFamily: C.serif, fontSize: '15px', color: C.text, lineHeight: 1.2 }}>Articles</span>
      </div>
      <button
        type="button"
        onClick={onHide}
        aria-label={mode === 'drawer' ? 'Close article feed' : 'Hide article feed'}
        style={{
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: '999px',
          padding: '4px 10px',
          fontSize: '11px',
          fontWeight: 800,
          color: C.textMuted,
          cursor: 'pointer',
          fontFamily: 'inherit',
          letterSpacing: '0.04em',
        }}
      >
        {mode === 'drawer' ? 'Close ✕' : 'Hide ▸'}
      </button>
    </div>
  )
}

// ── Launcher / re-open ──────────────────────────────────────────────────────

function LauncherButton({ count, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Open article feed"
      style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        zIndex: 70,
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: '999px',
        padding: '10px 14px',
        boxShadow: '0 8px 24px rgba(15,18,32,0.18)',
        cursor: 'pointer',
        fontFamily: 'inherit',
        fontSize: '12px',
        fontWeight: 800,
        color: C.text,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
      }}
    >
      <span aria-hidden>📰</span>
      <span>Articles</span>
      {count > 0 && (
        <span style={{ background: C.cyan, color: '#fff', fontSize: '10px', padding: '2px 7px', borderRadius: '999px', fontWeight: 800 }}>
          {count}
        </span>
      )}
    </button>
  )
}

function RailMinTab({ onClick }) {
  // A slim vertical "Show ▸" tab pinned to the right edge so the user can
  // bring the rail back. Sits inside the same flex slot the rail used so the
  // main column doesn't reflow.
  return (
    <aside
      style={{
        width: '32px',
        flexShrink: 0,
        padding: '24px 0 28px 0',
        position: 'sticky',
        top: 0,
        alignSelf: 'flex-start',
        height: '100vh',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
      }}
    >
      <button
        type="button"
        onClick={onClick}
        aria-label="Show article feed"
        style={{
          writingMode: 'vertical-rl',
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: '999px',
          padding: '12px 6px',
          fontSize: '11px',
          fontWeight: 800,
          color: C.textMuted,
          cursor: 'pointer',
          fontFamily: 'inherit',
          letterSpacing: '0.06em',
          boxShadow: '0 4px 14px rgba(15,18,32,0.08)',
        }}
      >
        Articles ◂
      </button>
    </aside>
  )
}

// ── Practice strip ──────────────────────────────────────────────────────────

function PracticeStrip({ selected, onSelect }) {
  return (
    <div
      style={{
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: '14px',
        padding: '16px 16px 14px',
      }}
    >
      <div style={eyebrowStyle}>Article jurisdiction</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px', alignItems: 'center', gap: '8px' }}>
        <Practice glyph={<EagleGlyph size={18} color="#1F2D5F" />} label="US" value="US" tint="#1F2D5F" selected={selected === 'US'} onSelect={onSelect} />
        <span style={{ width: '1px', height: '22px', background: C.border }} />
        <Practice glyph={<MapleGlyph size={18} color="#A4243B" />} label="CA" value="CA" tint="#A4243B" selected={selected === 'CA'} onSelect={onSelect} />
        <span style={{ width: '1px', height: '22px', background: C.border }} />
        <Practice glyph={<LionGlyph size={18} color="#5B3A2A" />} label="UK" value="UK" tint="#5B3A2A" selected={selected === 'UK'} onSelect={onSelect} />
      </div>
      <button
        type="button"
        onClick={() => onSelect('ALL')}
        style={{
          marginTop: '10px',
          border: `1px solid ${selected === 'ALL' ? C.cyan : C.border}`,
          background: selected === 'ALL' ? `${C.cyan}10` : C.surface2,
          color: selected === 'ALL' ? C.cyan : C.textMuted,
          borderRadius: '999px',
          padding: '6px 10px',
          width: '100%',
          cursor: 'pointer',
          fontSize: '11px',
          fontWeight: 800,
          letterSpacing: '0.08em',
          fontFamily: 'inherit',
        }}
      >
        ALL ARTICLES
      </button>
    </div>
  )
}

function Practice({ glyph, label, value, tint, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      aria-pressed={selected}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        color: tint,
        fontWeight: 700,
        fontSize: '12px',
        letterSpacing: '0.06em',
        border: `1px solid ${selected ? tint : 'transparent'}`,
        borderRadius: '999px',
        padding: '6px 8px',
        background: selected ? `${tint}10` : 'transparent',
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      {glyph}
      <span>{label}</span>
    </button>
  )
}

// ── Pane card ───────────────────────────────────────────────────────────────

function PaneCard({ accent, eyebrow, title, body, cta, href, onClick }) {
  const isLink = href || onClick
  const tint = accent || C.cyan
  const handleClick = (e) => {
    if (onClick) {
      e.preventDefault()
      onClick(e)
    }
  }
  return (
    <a
      href={href || '#'}
      onClick={handleClick}
      target={href?.startsWith('http') ? '_blank' : undefined}
      rel={href?.startsWith('http') ? 'noreferrer' : undefined}
      style={{
        display: 'block',
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: '14px',
        padding: '16px 18px',
        textDecoration: 'none',
        color: 'inherit',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '4px',
          height: '100%',
          background: tint,
        }}
      />
      <div style={{ ...eyebrowStyle, color: tint }}>{eyebrow}</div>
      <div style={{ fontFamily: C.serif, fontSize: '17px', fontWeight: 500, color: C.text, marginTop: '6px', lineHeight: 1.25, letterSpacing: '-0.005em' }}>
        {title}
      </div>
      <p style={{ color: C.textMuted, fontSize: '12.5px', lineHeight: 1.55, margin: '8px 0 0' }}>
        {body}
      </p>
      {isLink && (
        <div style={{ marginTop: '10px', color: tint, fontSize: '12px', fontWeight: 700 }}>
          {cta || 'Learn more →'}
        </div>
      )}
    </a>
  )
}

// ── Article feed header ─────────────────────────────────────────────────────

function ArticleFeedHeader({ region }) {
  const label = region === 'ALL' ? 'Latest articles' : `${REGION_LABELS[region] || region} articles`
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', padding: '4px 4px 0' }}>
      <div>
        <div style={eyebrowStyle}>Legal library</div>
        <div style={{ fontFamily: C.serif, fontSize: '18px', color: C.text, marginTop: '3px', lineHeight: 1.2 }}>
          {label}
        </div>
      </div>
      <a
        href={LEGAL_ARTICLES_URL}
        target="_blank"
        rel="noreferrer"
        style={{ color: C.cyan, fontSize: '12px', fontWeight: 800, textDecoration: 'none', whiteSpace: 'nowrap' }}
      >
        View all →
      </a>
    </div>
  )
}

// ── Article card ────────────────────────────────────────────────────────────

function ArticleCard({ article, hoverCapable }) {
  const [pinned, setPinned] = React.useState(false)
  const [hovered, setHovered] = React.useState(false)
  const open = pinned || (hoverCapable && hovered)

  const region = article?.region || 'COMPARE'
  const accent = REGION_ACCENTS[region] || C.cyan
  const regionLabel = REGION_LABELS[region] || 'Guide'
  const cluster = article?.cluster ? ` · ${article.cluster}` : ''
  const href = article?.url || LEGAL_ARTICLES_URL
  const updated = article?.updated_at
    ? `Updated ${new Date(article.updated_at).toLocaleDateString()}`
    : null
  const path = article?.path ? `Library path: ${article.path}` : null
  const description = article?.description || 'Read the latest guide from the YouSafe legal library.'

  // Hover handlers only matter when the device is hover-capable. On touch
  // devices we never set `hovered`, so the card stays in its pinned state.
  const onEnter = hoverCapable ? () => setHovered(true) : undefined
  const onLeave = hoverCapable ? () => setHovered(false) : undefined

  const toggle = (e) => {
    e?.preventDefault?.()
    e?.stopPropagation?.()
    setPinned((v) => !v)
  }

  // The description is truncated when collapsed and free-flowing when expanded.
  // We swap the entire style object rather than toggling individual properties
  // so -webkit-line-clamp doesn't linger.
  const descStyle = open
    ? { color: C.textMuted, fontSize: '12.5px', lineHeight: 1.55, margin: '8px 0 0' }
    : {
        color: C.textMuted,
        fontSize: '12.5px',
        lineHeight: 1.55,
        margin: '8px 0 0',
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
      }

  return (
    <article
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={{
        background: C.surface,
        border: `1px solid ${open ? accent : C.border}`,
        borderRadius: '14px',
        padding: open ? '16px 16px 14px' : '12px 14px',
        position: 'relative',
        overflow: 'hidden',
        transition: 'padding 160ms ease, border-color 160ms ease, box-shadow 160ms ease',
        boxShadow: open ? '0 14px 34px rgba(15,18,32,0.10)' : '0 1px 2px rgba(15,18,32,0.03)',
      }}
    >
      <span style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', background: accent }} />
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', justifyContent: 'space-between' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ ...eyebrowStyle, color: accent }}>{regionLabel}{cluster}</div>
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'block',
              color: 'inherit',
              textDecoration: 'none',
              fontFamily: C.serif,
              fontSize: open ? '18px' : '16px',
              fontWeight: 500,
              marginTop: '6px',
              lineHeight: 1.22,
              letterSpacing: '-0.004em',
            }}
          >
            {article?.title || 'Legal article'}
          </a>
        </div>
        <button
          type="button"
          onClick={toggle}
          aria-label={pinned ? 'Minimize article' : 'Expand article'}
          aria-expanded={pinned}
          style={{
            flexShrink: 0,
            width: '28px',
            height: '28px',
            borderRadius: '8px',
            border: `1px solid ${pinned ? accent : C.border}`,
            background: pinned ? `${accent}10` : C.surface2,
            color: pinned ? accent : C.textMuted,
            cursor: 'pointer',
            fontSize: '16px',
            lineHeight: 1,
            fontWeight: 800,
            fontFamily: 'inherit',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {pinned ? '−' : '+'}
        </button>
      </div>
      <p style={descStyle}>{description}</p>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '12px', color: C.textMuted, fontSize: '12px', lineHeight: 1.45 }}>
          {updated && <div>{updated}</div>}
          {path && <div style={{ wordBreak: 'break-all' }}>{path}</div>}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '4px', flexWrap: 'wrap' }}>
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              style={{ color: accent, fontWeight: 800, fontSize: '12px', textDecoration: 'none' }}
            >
              Open in new tab ↗
            </a>
            {pinned && (
              <button
                type="button"
                onClick={toggle}
                style={{ background: 'none', border: 'none', color: C.textMuted, fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
              >
                Minimize
              </button>
            )}
          </div>
        </div>
      )}
    </article>
  )
}

// ── Skeleton + footnote ─────────────────────────────────────────────────────

function FeedSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: '14px',
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <span style={{ width: '42%', height: '8px', borderRadius: '999px', background: 'rgba(43, 92, 230, 0.14)' }} />
          <span style={{ width: '88%', height: '14px', borderRadius: '999px', background: 'rgba(12, 18, 32, 0.1)' }} />
          <span style={{ width: '100%', height: '8px', borderRadius: '999px', background: 'rgba(12, 18, 32, 0.08)' }} />
          <span style={{ width: '74%', height: '8px', borderRadius: '999px', background: 'rgba(12, 18, 32, 0.08)' }} />
        </div>
      ))}
    </div>
  )
}

function Footnote({ feedError }) {
  return (
    <div style={{ color: C.textDim, fontSize: '11px', lineHeight: 1.5, padding: '8px 4px 0' }}>
      {feedError
        ? 'Article feed fallback shown from the YouSafe legal library.'
        : 'Articles update from the YouSafe legal library so dashboard readers can click through to full guides.'}
    </div>
  )
}

// ── Hooks ───────────────────────────────────────────────────────────────────

function useHoverCapable() {
  const [capable, setCapable] = React.useState(false)
  React.useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)')
    const apply = () => setCapable(mq.matches)
    apply()
    mq.addEventListener?.('change', apply)
    return () => mq.removeEventListener?.('change', apply)
  }, [])
  return capable
}

const eyebrowStyle = {
  color: C.textMuted,
  fontSize: '10px',
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  fontWeight: 700,
}

// ── Curated content ─────────────────────────────────────────────────────────

const LEGAL_ARTICLES_URL = 'https://legal.yousafeconsultancy.com/articles'

const REGION_LABELS = {
  US: 'United States',
  UK: 'United Kingdom',
  CA: 'Canada',
  COMPARE: 'Compare',
}

const REGION_ACCENTS = {
  US: '#1F2D5F',
  CA: '#A4243B',
  UK: '#5B3A2A',
  COMPARE: '#3C3B6E',
}

const ATTORNEY_CARDS = [
  {
    accent: '#1F2D5F',
    eyebrow: 'Conversion tip',
    title: 'A sharp tagline doubles click-through.',
    body: 'Profiles with a one-line headline (e.g. "F-1 reinstatements · 200+ approvals") get noticeably more profile opens than ones with no tagline.',
    cta: 'Edit your profile →',
    onClick: () => window.dispatchEvent(new CustomEvent('yousafe-navigate', { detail: { page: 'profile' } })),
  },
  {
    accent: '#A4243B',
    eyebrow: 'Engagement',
    title: 'Respond to inquiries within an hour.',
    body: 'The first attorney to reply on a queued inquiry wins the engagement 3x more often. Worth checking the queue between calls.',
    cta: 'Open the queue →',
    onClick: () => window.dispatchEvent(new CustomEvent('yousafe-navigate', { detail: { page: 'queue' } })),
  },
  {
    accent: '#5B3A2A',
    eyebrow: 'Fees & compliance',
    title: 'Your fee is paid in full to you.',
    body: 'Per ABA Rule 5.4, the platform fee is added on top — never split from your fee. Disclose the breakdown to clients up front.',
  },
]

const STUDENT_CARDS = [
  {
    accent: '#1F2D5F',
    eyebrow: 'Get help fast',
    title: 'A clear inquiry gets faster, better offers.',
    body: 'Attorneys can quote in minutes when your intake includes the country, case type, and a one-paragraph summary of facts and dates.',
    cta: 'Submit a new inquiry →',
    onClick: () => window.dispatchEvent(new CustomEvent('yousafe-navigate', { detail: { page: 'inquiries' } })),
  },
  {
    accent: '#A4243B',
    eyebrow: 'Choose well',
    title: 'Compare attorneys side by side.',
    body: 'Browse the panel by jurisdiction and specialty. You can engage multiple attorneys on one inquiry and pick the best offer.',
    cta: 'Find an attorney →',
    onClick: () => window.dispatchEvent(new CustomEvent('yousafe-navigate', { detail: { page: 'attorneys' } })),
  },
  {
    accent: '#5B3A2A',
    eyebrow: 'How payment works',
    title: 'Funds held in escrow until you approve.',
    body: 'You pay only when you accept a custom offer. Stripe holds the money until you approve the deliverable, with full refund protection if no work happens.',
  },
]

const CONSULTANT_CARDS = [
  {
    accent: '#1F2D5F',
    eyebrow: 'Throughput',
    title: 'Reply within an hour to win the order.',
    body: 'Students approve assignments faster when the first message lands within 60 minutes. Keep notifications on between calls.',
    cta: 'Open messages →',
    onClick: () => window.dispatchEvent(new CustomEvent('yousafe-navigate', { detail: { page: 'messages' } })),
  },
  {
    accent: '#A4243B',
    eyebrow: 'Earnings',
    title: 'Auto-transfer pays out as orders close.',
    body: 'Toggle on auto-transfer in Earnings to push every approved order straight to your connected bank — no manual claims.',
    cta: 'Open earnings →',
    onClick: () => window.dispatchEvent(new CustomEvent('yousafe-navigate', { detail: { page: 'earnings' } })),
  },
  {
    accent: '#5B3A2A',
    eyebrow: 'Profile tip',
    title: 'A clear headshot lifts conversion.',
    body: 'Profiles with a real photo and a one-line specialization get markedly more selections. Refresh yours from Settings if it’s outdated.',
  },
]

const ADMIN_CARDS = [
  {
    accent: '#1F2D5F',
    eyebrow: 'Operations',
    title: 'Pending approvals first.',
    body: 'Consultant + attorney applications gate access to paid features. Clearing the queue daily keeps the panel growing.',
  },
  {
    accent: '#A4243B',
    eyebrow: 'Compliance',
    title: 'Attorney fees never split.',
    body: 'ABA Rule 5.4 — the platform fee is added on top of the attorney fee, never deducted. Stripe destination charges enforce this.',
  },
  {
    accent: '#5B3A2A',
    eyebrow: 'Growth',
    title: 'Invite the right people.',
    body: 'Use the Invite User flow to onboard attorneys and consultants with the right role pre-assigned. Their profile lands in the right lane on first sign-in.',
  },
]
