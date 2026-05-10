// @ts-nocheck
'use client'
import React from 'react'
import { C } from './shared'
import { EagleGlyph, MapleGlyph, LionGlyph } from './country-glyphs'

// Right rail: tips, articles, and CTAs that boost CTR. Editorial-style cards
// curated per role. Hidden under 1280px so the main column always has room.
export default function DashboardRightPane({ role = 'student' }) {
  const cards = role === 'attorney' ? ATTORNEY_CARDS : role === 'admin' ? ADMIN_CARDS : STUDENT_CARDS
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
      <Footnote />
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

function Footnote() {
  return (
    <div style={{ color: C.textDim, fontSize: '11px', lineHeight: 1.5, padding: '8px 4px 0' }}>
      Tips and articles curated by the YouSafe editorial team. Fully removable —
      tell us if you'd rather have a focus mode without distractions.
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
  {
    accent: '#3C3B6E',
    eyebrow: 'From the blog',
    title: 'How clients pick between competing offers.',
    body: 'A summary of what we see drive offer acceptance: clarity of scope, delivery date, attorney response time, and visible reviews.',
    href: 'https://yousafeconsultancy.com/blog',
    cta: 'Read on YouSafe →',
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
  {
    accent: '#3C3B6E',
    eyebrow: 'From the blog',
    title: 'Reading the fine print on F-1, OPT, and PR pathways.',
    body: 'Long-form articles from YouSafe consultants and attorneys covering common immigration and student-visa scenarios.',
    href: 'https://yousafeconsultancy.com/blog',
    cta: 'Read on YouSafe →',
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
