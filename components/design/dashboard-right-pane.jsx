// @ts-nocheck
'use client'
import React from 'react'
import { C } from './shared'
import { EagleGlyph, MapleGlyph, LionGlyph } from './country-glyphs'

// Right rail: role CTAs plus a live article feed from the legal library.
// Responsive: collapses to a slim launcher on narrow viewports; can be embedded
// inline on the consultant dashboard via `variant="inline"`.
export default function DashboardRightPane({ role = 'student', variant = 'rail' }) {
  const cards = role === 'attorney' ? ATTORNEY_CARDS
    : role === 'admin' ? ADMIN_CARDS
    : role === 'consultant' ? CONSULTANT_CARDS
    : STUDENT_CARDS
  const [articles, setArticles] = React.useState([])
  const [region, setRegion] = React.useState('ALL')
  const [isLoading, setIsLoading] = React.useState(true)
  const [feedError, setFeedError] = React.useState(null)
  const [collapsed, setCollapsed] = React.useState(false)
  const [isNarrow, setIsNarrow] = React.useState(false)

  React.useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(max-width: 1100px)')
    const apply = () => setIsNarrow(mq.matches)
    apply()
    mq.addEventListener?.('change', apply)
    return () => mq.removeEventListener?.('change', apply)
  }, [])

  React.useEffect(() => {
    let isMounted = true
    const controller = new AbortController()

    async function loadFeed() {
      setIsLoading(true)
      setFeedError(null)

      try {
        const params = new URLSearchParams({ role, limit: '18' })
        if (region !== 'ALL') params.set('region', region)
        const response = await fetch(`/api/articles/feed?${params.toString()}`, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        })
        if (!response.ok) throw new Error(`Article feed returned ${response.status}`)
        const payload = await response.json()
        if (!isMounted) return
        setArticles(Array.isArray(payload?.articles) ? payload.articles : [])
      } catch (error) {
        if (!isMounted || error?.name === 'AbortError') return
        setFeedError('We could not refresh the article feed.')
        setArticles([])
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    loadFeed()

    return () => {
      isMounted = false
      controller.abort()
    }
  }, [role, region])

  const inline = variant === 'inline'
  const stickyOpen = !inline && !isNarrow && !collapsed
  const drawerOpen = isNarrow && !collapsed

  // Narrow + collapsed → render only a floating launcher button.
  if (isNarrow && collapsed && !inline) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        aria-label="Open article feed"
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          zIndex: 70,
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: '999px',
          padding: '10px 16px',
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
        📰 <span>Articles</span>
        {articles.length > 0 && (
          <span style={{ background: C.cyan, color: '#fff', fontSize: '10px', padding: '2px 6px', borderRadius: '999px' }}>
            {articles.length}
          </span>
        )}
      </button>
    )
  }

  const containerStyle = inline ? {
    width: '100%',
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  } : drawerOpen ? {
    position: 'fixed',
    top: 0,
    right: 0,
    width: 'min(360px, 92vw)',
    height: '100vh',
    zIndex: 70,
    background: C.bg,
    borderLeft: `1px solid ${C.border}`,
    boxShadow: '-12px 0 36px rgba(15,18,32,0.18)',
    padding: '20px 18px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    overflowY: 'auto',
  } : {
    width: '320px',
    flexShrink: 0,
    padding: '28px 22px 28px 0',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    position: 'sticky',
    top: 0,
    alignSelf: 'flex-start',
    maxHeight: '100vh',
    overflowY: 'auto',
  }

  return (
    <>
      {drawerOpen && (
        <button
          type="button"
          aria-label="Close article feed"
          onClick={() => setCollapsed(true)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,18,32,0.34)', border: 'none', cursor: 'pointer', zIndex: 69 }}
        />
      )}
      <aside style={containerStyle} className="yousafe-right-pane">
        <PaneToolbar
          collapsed={false}
          onToggle={() => setCollapsed(true)}
          showClose={!inline && (drawerOpen || stickyOpen)}
          embedded={inline}
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
          <div style={{ display: 'grid', gap: '10px', maxHeight: inline ? '720px' : '60vh', overflowY: 'auto', paddingRight: '4px', WebkitOverflowScrolling: 'touch' }}>
            {articles.map((article) => (
              <ArticleCard key={article.url || article.path || article.title} article={article} />
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

function PaneToolbar({ onToggle, showClose, embedded }) {
  if (embedded) {
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
  if (!showClose) return null
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <button
        type="button"
        onClick={onToggle}
        aria-label="Hide article feed"
        style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '999px', padding: '4px 10px', fontSize: '11px', fontWeight: 800, color: C.textMuted, cursor: 'pointer', fontFamily: 'inherit' }}
      >
        Hide ▸
      </button>
    </div>
  )
}

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

function PaneCard({ accent, eyebrow, title, body, cta, href, onClick }) {
  const isLink = href || onClick
  const tint = accent || C.cyan
  return (
    <a
      href={href}
      onClick={onClick}
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

function ArticleCard({ article }) {
  const [pinned, setPinned] = React.useState(false)
  const [hovered, setHovered] = React.useState(false)
  const open = pinned || hovered
  const region = article?.region || 'COMPARE'
  const accent = REGION_ACCENTS[region] || C.cyan
  const regionLabel = REGION_LABELS[region] || 'Guide'
  const cluster = article?.cluster ? ` · ${article.cluster}` : ''
  const href = article?.url || LEGAL_ARTICLES_URL
  const details = [
    article?.description,
    article?.updated_at ? `Updated ${new Date(article.updated_at).toLocaleDateString()}` : null,
    article?.path ? `Library path: ${article.path}` : null,
  ].filter(Boolean)

  const toggle = (e) => {
    e?.preventDefault?.()
    e?.stopPropagation?.()
    setPinned((v) => !v)
  }

  return (
    <article
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
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
            style={{ display: 'block', color: 'inherit', textDecoration: 'none', fontFamily: C.serif, fontSize: open ? '18px' : '16px', fontWeight: 500, marginTop: '6px', lineHeight: 1.22 }}
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
            fontSize: '14px',
            lineHeight: 1,
            fontWeight: 800,
            fontFamily: 'inherit',
          }}
        >
          {pinned ? '−' : '+'}
        </button>
      </div>
      <p style={{ color: C.textMuted, fontSize: '12.5px', lineHeight: 1.55, margin: '8px 0 0', display: '-webkit-box', WebkitLineClamp: open ? 'unset' : 2, WebkitBoxOrient: 'vertical', overflow: open ? 'visible' : 'hidden' }}>
        {article?.description || 'Read the latest guide from the YouSafe legal library.'}
      </p>
      {open && (
        <div style={{ display: 'grid', gap: '7px', marginTop: '12px', color: C.textMuted, fontSize: '12px', lineHeight: 1.45 }}>
          {details.slice(1).map(item => <div key={item}>{item}</div>)}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '4px', flexWrap: 'wrap' }}>
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              style={{ color: accent, fontWeight: 800, fontSize: '12px', textDecoration: 'none' }}
            >
              Open in new tab ↗
            </a>
            <button
              type="button"
              onClick={toggle}
              style={{ background: 'none', border: 'none', color: C.textMuted, fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
            >
              Minimize
            </button>
          </div>
        </div>
      )}
    </article>
  )
}

function FeedSkeleton() {
  return (
    <>
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          style={{
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: '14px',
            padding: '16px 18px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <span style={{ width: '42%', height: '8px', borderRadius: '999px', background: 'rgba(43, 92, 230, 0.14)' }} />
          <span style={{ width: '88%', height: '14px', borderRadius: '999px', background: 'rgba(12, 18, 32, 0.1)' }} />
          <span style={{ width: '100%', height: '8px', borderRadius: '999px', background: 'rgba(12, 18, 32, 0.08)' }} />
          <span style={{ width: '74%', height: '8px', borderRadius: '999px', background: 'rgba(12, 18, 32, 0.08)' }} />
        </div>
      ))}
    </>
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
