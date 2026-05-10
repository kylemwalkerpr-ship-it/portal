'use client'
// @ts-nocheck
import React from 'react'
import { C } from './shared'

const SERIF = "'Cormorant Garamond', 'Garamond', Georgia, 'Times New Roman', serif"
const SANS = "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif"

const LANES = [
  {
    id: 'student',
    label: 'Student / Client',
    blurb: 'Place orders, talk to your consultant, manage documents and inquiries.',
    primary: 'Sign in',
    secondary: 'Create account',
  },
  {
    id: 'attorney',
    label: 'Attorney',
    blurb: 'Review intake inquiries, message clients, send custom offers and manage payouts.',
    primary: 'Sign in',
    secondary: 'Apply to join',
  },
  {
    id: 'consultant',
    label: 'Consultant',
    blurb: 'Manage assigned students, deliverables, escrow releases and your profile.',
    primary: 'Sign in',
    secondary: 'Apply as consultant',
  },
  {
    id: 'admin',
    label: 'Admin',
    blurb: 'Operate the platform — users, applications, services, escrow and settings.',
    primary: 'Sign in',
    secondary: null,
  },
]

const PRACTICES = [
  {
    eyebrow: 'Study abroad',
    title: 'Visa & university advisory',
    desc: 'Senior consultants guide students through admissions, SOPs, visa documentation and settlement, with funds in escrow until you approve the work.',
  },
  {
    eyebrow: 'Legal document prep',
    title: 'US, UK & Canada legal review',
    desc: 'Licensed attorneys claim your case from a vetted panel, message you directly, then send a custom offer. Their fee is paid in full to them; the platform fee is disclosed separately, per ABA Rule 5.4.',
  },
]

const STEPS = [
  { n: '01', title: 'Tell us what you need', desc: 'Describe your situation in a short intake — university shortlist, visa pathway, or legal matter. Anonymous OK; an email is enough to start.' },
  { n: '02', title: 'Get matched', desc: 'For consulting, we assign a senior consultant. For legal, your inquiry is visible to the attorney panel and qualified attorneys reach out.' },
  { n: '03', title: 'Review & accept an offer', desc: 'Compare scope, timeline and price. Pay once, in one secure transaction. Funds held in escrow until the work is complete.' },
  { n: '04', title: 'Work through to delivery', desc: 'Chat in-thread, share files securely, track progress. Release payment when you approve the deliverable.' },
]

const TESTIMONIALS = [
  { name: 'Aisha R.', country: 'Pakistan → UK', text: 'Got into Manchester with full scholarship. The team guided me through every step.' },
  { name: 'Carlos M.', country: 'Colombia → Canada', text: 'Visa approved in three weeks. My consultant was thorough; I always knew the next step.' },
  { name: 'Priya S.', country: 'India → Australia', text: 'The SOP review changed everything. I went from four rejections to three offers.' },
]

export default function LandingPage({ onLogin, onSignup }) {
  const goSignIn = (lane) => onLogin?.(lane)
  const goSignUp = (lane) => onSignup?.(lane)

  return (
    <div style={{ minHeight: '100vh', background: '#FBFAF7', color: C.text, fontFamily: SANS }}>
      <Nav onSignIn={() => goSignIn('student')} />

      <Hero onPrimary={() => goSignUp('student')} />

      <Section id="lanes" eyebrow="Members portal" title="Choose your lane.">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '20px',
            marginTop: '40px',
          }}
        >
          {LANES.map((lane) => (
            <LaneCard key={lane.id} lane={lane} onSignIn={() => goSignIn(lane.id)} onSignUp={() => goSignUp(lane.id)} />
          ))}
        </div>
      </Section>

      <Section id="practices" eyebrow="What we do" title="Two practices, one portal.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '28px', marginTop: '40px' }}>
          {PRACTICES.map((p) => (
            <PracticeCard key={p.title} practice={p} />
          ))}
        </div>
      </Section>

      <Section id="how" eyebrow="How it works" title="A clean line from inquiry to delivery.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '28px', marginTop: '40px' }}>
          {STEPS.map((s) => (
            <Step key={s.n} step={s} />
          ))}
        </div>
      </Section>

      <Section id="trust" eyebrow="Trusted by" title="Outcomes our members shipped.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginTop: '40px' }}>
          {TESTIMONIALS.map((t) => (
            <Testimonial key={t.name} t={t} />
          ))}
        </div>

        <div
          style={{
            marginTop: '56px',
            display: 'flex',
            justifyContent: 'center',
            gap: '32px',
            flexWrap: 'wrap',
            color: C.textMuted,
            fontSize: '12px',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}
        >
          <span>Stripe-secured payments</span>
          <span style={{ opacity: 0.4 }}>·</span>
          <span>Funds held in escrow</span>
          <span style={{ opacity: 0.4 }}>·</span>
          <span>ABA Rule 5.4 compliant</span>
          <span style={{ opacity: 0.4 }}>·</span>
          <span>Encrypted document storage</span>
        </div>
      </Section>

      <Footer />
    </div>
  )
}

// ── Top nav ────────────────────────────────────────────────────────────────
function Nav({ onSignIn }) {
  return (
    <nav
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '20px 48px',
        borderBottom: '1px solid rgba(0,0,0,0.06)',
        background: 'rgba(251,250,247,0.85)',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        backdropFilter: 'saturate(160%) blur(10px)',
        WebkitBackdropFilter: 'saturate(160%) blur(10px)',
      }}
    >
      <a href="/" style={{ display: 'flex', alignItems: 'center', gap: '12px', textDecoration: 'none' }}>
        <span
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '6px',
            background: C.cyan,
            color: '#fff',
            fontFamily: SERIF,
            fontWeight: 600,
            fontSize: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          Y
        </span>
        <span style={{ fontFamily: SERIF, fontSize: '20px', color: C.text, letterSpacing: '0.01em' }}>
          YouSafe
        </span>
      </a>

      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <a href="#how" style={navLinkStyle}>How it works</a>
        <a href="#practices" style={navLinkStyle}>Practices</a>
        <a href="#lanes" style={navLinkStyle}>Sign in</a>
        <button
          type="button"
          onClick={onSignIn}
          style={{
            background: C.text,
            color: '#fff',
            border: 'none',
            borderRadius: '999px',
            padding: '9px 18px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: SANS,
            marginLeft: '8px',
          }}
        >
          Member sign in
        </button>
      </div>
    </nav>
  )
}

const navLinkStyle = {
  color: C.textMuted,
  textDecoration: 'none',
  fontSize: '13px',
  padding: '8px 14px',
  fontWeight: 500,
}

// ── Hero ───────────────────────────────────────────────────────────────────
function Hero({ onPrimary }) {
  return (
    <header
      style={{
        padding: '120px 48px 100px',
        maxWidth: '1080px',
        margin: '0 auto',
      }}
    >
      <div style={{ maxWidth: '780px' }}>
        <div
          style={{
            color: C.textMuted,
            fontSize: '12px',
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            fontWeight: 600,
            marginBottom: '24px',
          }}
        >
          The YouSafe Portal
        </div>
        <h1
          style={{
            fontFamily: SERIF,
            fontSize: 'clamp(44px, 6vw, 76px)',
            lineHeight: 1.05,
            letterSpacing: '-0.015em',
            color: C.text,
            margin: '0 0 28px',
            fontWeight: 500,
          }}
        >
          Your team for the<br />
          <em style={{ fontStyle: 'italic', color: C.cyan }}>moves that matter.</em>
        </h1>
        <p
          style={{
            color: C.textMuted,
            fontSize: '17px',
            lineHeight: 1.65,
            maxWidth: '600px',
            margin: '0 0 40px',
          }}
        >
          Study-abroad consulting and US, UK and Canadian legal document review — handled by
          vetted professionals, paid in escrow, and delivered through one secure portal.
        </p>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={onPrimary}
            style={{
              background: C.text,
              color: '#fff',
              border: 'none',
              borderRadius: '999px',
              padding: '14px 28px',
              fontSize: '15px',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: SANS,
            }}
          >
            Start an inquiry →
          </button>
          <a
            href="#how"
            style={{
              background: 'transparent',
              color: C.text,
              border: '1px solid rgba(0,0,0,0.15)',
              borderRadius: '999px',
              padding: '13px 28px',
              fontSize: '15px',
              fontWeight: 500,
              textDecoration: 'none',
              fontFamily: SANS,
            }}
          >
            How it works
          </a>
        </div>
      </div>
    </header>
  )
}

// ── Section wrapper ────────────────────────────────────────────────────────
function Section({ id, eyebrow, title, children }) {
  return (
    <section
      id={id}
      style={{
        padding: '88px 48px',
        borderTop: '1px solid rgba(0,0,0,0.06)',
      }}
    >
      <div style={{ maxWidth: '1080px', margin: '0 auto' }}>
        <div
          style={{
            color: C.textMuted,
            fontSize: '12px',
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            fontWeight: 600,
            marginBottom: '14px',
          }}
        >
          {eyebrow}
        </div>
        <h2
          style={{
            fontFamily: SERIF,
            fontSize: 'clamp(30px, 3.6vw, 44px)',
            lineHeight: 1.15,
            letterSpacing: '-0.012em',
            color: C.text,
            margin: 0,
            fontWeight: 500,
            maxWidth: '720px',
          }}
        >
          {title}
        </h2>
        {children}
      </div>
    </section>
  )
}

// ── Lane card ──────────────────────────────────────────────────────────────
function LaneCard({ lane, onSignIn, onSignUp }) {
  const [hover, setHover] = React.useState(false)
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: '#fff',
        border: `1px solid ${hover ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.08)'}`,
        borderRadius: '14px',
        padding: '28px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        transition: 'border-color 160ms, transform 160ms, box-shadow 160ms',
        transform: hover ? 'translateY(-2px)' : 'none',
        boxShadow: hover ? '0 12px 28px rgba(0,0,0,0.06)' : '0 1px 2px rgba(0,0,0,0.03)',
      }}
    >
      <div
        style={{
          fontFamily: SERIF,
          fontSize: '22px',
          fontWeight: 500,
          color: C.text,
          letterSpacing: '-0.005em',
        }}
      >
        {lane.label}
      </div>
      <p style={{ color: C.textMuted, fontSize: '13px', lineHeight: 1.6, margin: 0, minHeight: '60px' }}>
        {lane.blurb}
      </p>
      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <button
          type="button"
          onClick={onSignIn}
          style={{
            background: C.text,
            color: '#fff',
            border: 'none',
            borderRadius: '999px',
            padding: '10px 18px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: SANS,
          }}
        >
          {lane.primary}
        </button>
        {lane.secondary && (
          <button
            type="button"
            onClick={onSignUp}
            style={{
              background: 'transparent',
              color: C.text,
              border: '1px solid rgba(0,0,0,0.12)',
              borderRadius: '999px',
              padding: '9px 18px',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: SANS,
            }}
          >
            {lane.secondary}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Practice card ──────────────────────────────────────────────────────────
function PracticeCard({ practice }) {
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid rgba(0,0,0,0.08)',
        borderRadius: '14px',
        padding: '36px 32px',
      }}
    >
      <div
        style={{
          color: C.cyan,
          fontSize: '11px',
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          fontWeight: 700,
          marginBottom: '14px',
        }}
      >
        {practice.eyebrow}
      </div>
      <h3
        style={{
          fontFamily: SERIF,
          fontSize: '26px',
          fontWeight: 500,
          color: C.text,
          margin: '0 0 14px',
          lineHeight: 1.2,
          letterSpacing: '-0.01em',
        }}
      >
        {practice.title}
      </h3>
      <p style={{ color: C.textMuted, fontSize: '14px', lineHeight: 1.7, margin: 0 }}>
        {practice.desc}
      </p>
    </div>
  )
}

// ── How-it-works step ──────────────────────────────────────────────────────
function Step({ step }) {
  return (
    <div>
      <div
        style={{
          fontFamily: SERIF,
          fontSize: '20px',
          color: C.cyan,
          fontWeight: 500,
          marginBottom: '12px',
          letterSpacing: '0.04em',
        }}
      >
        {step.n}
      </div>
      <div style={{ height: '1px', background: 'rgba(0,0,0,0.1)', marginBottom: '14px' }} />
      <h3
        style={{
          fontFamily: SERIF,
          fontSize: '20px',
          fontWeight: 500,
          color: C.text,
          margin: '0 0 10px',
          lineHeight: 1.25,
        }}
      >
        {step.title}
      </h3>
      <p style={{ color: C.textMuted, fontSize: '13px', lineHeight: 1.65, margin: 0 }}>
        {step.desc}
      </p>
    </div>
  )
}

// ── Testimonial ────────────────────────────────────────────────────────────
function Testimonial({ t }) {
  return (
    <figure
      style={{
        background: '#fff',
        border: '1px solid rgba(0,0,0,0.08)',
        borderRadius: '14px',
        padding: '28px 24px',
        margin: 0,
      }}
    >
      <div style={{ color: '#f5b400', fontSize: '14px', letterSpacing: '2px', marginBottom: '14px' }}>★★★★★</div>
      <blockquote
        style={{
          fontFamily: SERIF,
          fontSize: '17px',
          lineHeight: 1.5,
          color: C.text,
          margin: '0 0 16px',
          fontStyle: 'italic',
          letterSpacing: '-0.005em',
        }}
      >
        “{t.text}”
      </blockquote>
      <figcaption style={{ fontSize: '12px', color: C.textMuted }}>
        <strong style={{ color: C.text, fontWeight: 600 }}>{t.name}</strong> · {t.country}
      </figcaption>
    </figure>
  )
}

// ── Footer ─────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer
      style={{
        padding: '64px 48px 48px',
        borderTop: '1px solid rgba(0,0,0,0.08)',
        background: '#F4F2EE',
      }}
    >
      <div
        style={{
          maxWidth: '1080px',
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '32px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
            <span
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '6px',
                background: C.cyan,
                color: '#fff',
                fontFamily: SERIF,
                fontWeight: 600,
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              Y
            </span>
            <span style={{ fontFamily: SERIF, fontSize: '17px', color: C.text }}>YouSafe</span>
          </div>
          <p style={{ color: C.textMuted, fontSize: '12px', lineHeight: 1.6, margin: 0 }}>
            One portal for study-abroad and legal-document services. Operated by YouSafe Consultancy.
          </p>
        </div>

        <FooterColumn label="Members">
          <FooterLink href="/sign-in/student">Student / Client</FooterLink>
          <FooterLink href="/sign-in/attorney">Attorney</FooterLink>
          <FooterLink href="/sign-in/consultant">Consultant</FooterLink>
          <FooterLink href="/sign-in/admin">Admin</FooterLink>
        </FooterColumn>

        <FooterColumn label="Practices">
          <FooterLink href="https://yousafeconsultancy.com">Study-abroad consulting</FooterLink>
          <FooterLink href="https://legal.yousafeconsultancy.com">Legal document prep</FooterLink>
        </FooterColumn>

        <FooterColumn label="Company">
          <FooterLink href="https://yousafeconsultancy.com/about">About</FooterLink>
          <FooterLink href="mailto:support@yousafeconsultancy.com">Support</FooterLink>
          <FooterLink href="https://yousafeconsultancy.com/terms">Terms</FooterLink>
          <FooterLink href="https://yousafeconsultancy.com/privacy">Privacy</FooterLink>
        </FooterColumn>
      </div>

      <div
        style={{
          maxWidth: '1080px',
          margin: '40px auto 0',
          paddingTop: '24px',
          borderTop: '1px solid rgba(0,0,0,0.06)',
          color: C.textMuted,
          fontSize: '11px',
          textAlign: 'center',
        }}
      >
        © {new Date().getFullYear()} YouSafe Consultancy. All rights reserved.
      </div>
    </footer>
  )
}

function FooterColumn({ label, children }) {
  return (
    <div>
      <div
        style={{
          color: C.textMuted,
          fontSize: '11px',
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          fontWeight: 700,
          marginBottom: '14px',
        }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>{children}</div>
    </div>
  )
}

function FooterLink({ href, children }) {
  return (
    <a
      href={href}
      style={{
        color: C.text,
        textDecoration: 'none',
        fontSize: '13px',
      }}
    >
      {children}
    </a>
  )
}
