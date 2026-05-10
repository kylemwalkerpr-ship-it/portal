// @ts-nocheck
'use client'
import React from 'react'
import { C } from './shared'
import { EagleGlyph, MapleGlyph, LionGlyph } from './country-glyphs'

// Right rail: role CTAs plus a live article feed from the legal library.
// Hidden under 1280px so the main column always has room.
export default function DashboardRightPane({ role = 'student' }) {
  const cards = role === 'attorney' ? ATTORNEY_CARDS : role === 'admin' ? ADMIN_CARDS : STUDENT_CARDS
  const [articles, setArticles] = React.useState([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [feedError, setFeedError] = React.useState(null)

  React.useEffect(() => {
    let isMounted = true
    const controller = new AbortController()

    async function loadFeed() {
      setIsLoading(true)
      setFeedError(null)

      try {
        const response = await fetch(`/api/articles/feed?role=${encodeURIComponent(role)}&limit=6`, {
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
  }, [role])

  return (
    <aside
      style={{
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
      }}
      className="yousafe-right-pane"
    >
      <PracticeStrip />
      {cards.map((card, i) => (
        <PaneCard key={i} {...card} />
      ))}
      <ArticleFeedHeader />
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
        articles.map((article) => (
          <ArticleCard key={article.url || article.path || article.title} article={article} />
        ))
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
  )
}

function PracticeStrip() {
  return (
    <div
      style={{
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: '14px',
        padding: '16px 16px 14px',
      }}
    >
      <div style={eyebrowStyle}>Three jurisdictions</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px', alignItems: 'center', gap: '8px' }}>
        <Practice glyph={<EagleGlyph size={18} color="#1F2D5F" />} label="US" tint="#1F2D5F" />
        <span style={{ width: '1px', height: '22px', background: C.border }} />
        <Practice glyph={<MapleGlyph size={18} color="#A4243B" />} label="CA" tint="#A4243B" />
        <span style={{ width: '1px', height: '22px', background: C.border }} />
        <Practice glyph={<LionGlyph size={18} color="#5B3A2A" />} label="UK" tint="#5B3A2A" />
      </div>
    </div>
  )
}

function Practice({ glyph, label, tint }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: tint, fontWeight: 700, fontSize: '12px', letterSpacing: '0.06em' }}>
      {glyph}
      <span>{label}</span>
    </div>
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

function ArticleFeedHeader() {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', padding: '4px 4px 0' }}>
      <div>
        <div style={eyebrowStyle}>Legal library</div>
        <div style={{ fontFamily: C.serif, fontSize: '18px', color: C.text, marginTop: '3px', lineHeight: 1.2 }}>
          Latest articles
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
  const region = article?.region || 'COMPARE'
  const accent = REGION_ACCENTS[region] || C.cyan
  const regionLabel = REGION_LABELS[region] || 'Guide'
  const cluster = article?.cluster ? ` · ${article.cluster}` : ''

  return (
    <PaneCard
      accent={accent}
      eyebrow={`${regionLabel}${cluster}`}
      title={article?.title || 'Legal article'}
      body={article?.description || 'Read the latest guide from the YouSafe legal library.'}
      href={article?.url || LEGAL_ARTICLES_URL}
      cta="Read article →"
    />
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
