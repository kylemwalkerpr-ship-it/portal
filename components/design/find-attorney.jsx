// @ts-nocheck
'use client'
import React from 'react'
import { C, Card, Badge, Btn } from './shared'
import IntakeForm from './inquiry-intake-form'
import ChatSidePane from '../marketplace/ChatSidePane'
import { renderBioMarkdown } from '@/lib/bioMarkdown'

// Browse list + full-screen detail (Fiverr-style seller profile).
// As of 2026-06-03 this surface unifies attorneys + consultants under a
// single "Find a consultant or attorney" page powered by /api/providers.
// Students can toggle between roles or browse all. The endpoint filters
// to onboarded profiles only (headshot + tagline + bio set), so empty-
// profile cards never ship.
export default function FindAttorney() {
  const [providers, setProviders] = React.useState([])
  const [counts, setCounts] = React.useState({ total: 0, attorneys: 0, consultants: 0 })
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [query, setQuery] = React.useState('')
  // Default tab: 'consultant' (most students browse non-legal services first;
  // legal matters tend to be sought out explicitly). Two tabs only — no "All".
  const [roleFilter, setRoleFilter] = React.useState('consultant') // 'consultant' | 'attorney'
  const [openProvider, setOpenProvider] = React.useState(null) // { id, role }
  const [intakeFor, setIntakeFor] = React.useState(null) // { id, name, role } when student opens intake

  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/providers?role=${roleFilter}`, { credentials: 'same-origin' })
      .then(async (r) => {
        const payload = await r.json().catch(() => null)
        if (cancelled) return
        if (!r.ok) {
          setError(payload?.error || 'Could not load providers.')
          return
        }
        setProviders(Array.isArray(payload?.providers) ? payload.providers : [])
        setCounts(payload?.counts || { total: 0, attorneys: 0, consultants: 0 })
        setError('')
      })
      .catch((e) => {
        if (cancelled) return
        setError(e.message || 'Could not load providers.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [roleFilter])

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return providers
    return providers.filter((p) =>
      [p.full_name, p.tagline, p.jurisdictions, p.practice_areas, p.bio, (p.specialties || []).join(' '), (p.languages || []).join(' ')]
        .filter(Boolean)
        .some((s) => String(s).toLowerCase().includes(q)),
    )
  }, [providers, query])

  if (intakeFor) {
    return (
      <IntakeForm
        targetAttorney={intakeFor}
        onCancel={() => setIntakeFor(null)}
        onSubmitted={() => {
          setIntakeFor(null)
          setOpenProvider(null)
          // Tell the student dashboard to switch to the My Inquiries tab.
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('yousafe-navigate', { detail: { page: 'inquiries' } }))
          }
        }}
      />
    )
  }

  if (openProvider) {
    return (
      <AttorneyDetail
        attorneyId={openProvider.id}
        providerRole={openProvider.role}
        onBack={() => setOpenProvider(null)}
        onStartInquiry={(att) => setIntakeFor(att)}
      />
    )
  }

  return (
    <div style={{ padding: '24px 28px' }}>
      {/* Legibility box: when rendered inside MarketplaceShell this intro
          sits on dark walnut paper + pattern, so the text must live on a
          light surface. Falls back to portal ink tokens outside the market. */}
      <div
        style={{
          marginBottom: '20px',
          background: 'var(--ys-vellum, #FFF9F2)',
          border: '1px solid var(--ys-rule, rgba(28,20,16,0.14))',
          borderRadius: '12px',
          padding: '18px 22px',
          color: 'var(--ys-ink, var(--portal-ink, #1C1410))',
        }}
      >
        <div style={{ ...eyebrow, color: 'var(--ys-inkMid, var(--portal-ink-mid, #4A3C34))' }}>Verified panel</div>
        <h2 style={{ fontFamily: C.serif, fontSize: '28px', fontWeight: 500, color: 'var(--ys-ink, var(--portal-ink, #1C1410))', margin: '4px 0', letterSpacing: '-0.012em' }}>
          Find Your Specialist.
        </h2>
        <p style={{ color: 'var(--ys-inkMid, var(--portal-ink-mid, #4A3C34))', fontSize: '14px', margin: 0, maxWidth: '640px' }}>
          Verified panel of consultants and licensed attorneys. Pick the tab that matches your need —
          consultants for academic, career, business, and settlement guidance; attorneys for legal
          and immigration matters.
        </p>
      </div>

      {/* Role tabs — two-tab segmented control. No "All" option per
          product spec: students should explicitly choose whether they
          need legal counsel (attorney) vs non-legal advisory
          (consultant). Conflating the two on the same screen blurred
          the licensure boundary. */}
      <div
        role="tablist"
        aria-label="Choose specialist type"
        style={{
          display: 'inline-flex',
          padding: '4px',
          background: C.surface2,
          border: `1px solid ${C.border2}`,
          borderRadius: '999px',
          marginBottom: '16px',
          gap: '2px',
        }}
      >
        {[
          { key: 'consultant', label: 'Consultants', count: counts.consultants },
          { key: 'attorney', label: 'Attorneys', count: counts.attorneys },
        ].map((opt) => {
          const active = roleFilter === opt.key
          return (
            <button
              key={opt.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setRoleFilter(opt.key)}
              style={{
                padding: '7px 14px',
                borderRadius: '999px',
                border: 'none',
                background: active ? C.surface : 'transparent',
                color: active ? C.text : C.textMuted,
                fontSize: '13px',
                fontWeight: active ? 600 : 500,
                fontFamily: 'inherit',
                cursor: 'pointer',
                transition: 'background 0.12s, color 0.12s',
                boxShadow: active ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
              }}
            >
              {opt.label}
              {opt.count > 0 && (
                <span style={{ marginLeft: '6px', fontSize: '11px', color: active ? C.textMuted : C.textDim, fontWeight: 500 }}>
                  {opt.count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <input
        type="text"
        placeholder="Search by name, jurisdiction, subject, specialty, or language..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{
          width: '100%',
          maxWidth: '460px',
          background: C.surface,
          border: `1px solid ${C.border2}`,
          borderRadius: '999px',
          padding: '11px 16px',
          color: C.text,
          fontSize: '14px',
          fontFamily: 'inherit',
          marginBottom: '24px',
          marginLeft: '12px',
          outline: 'none',
        }}
      />

      {loading && <div style={{ color: C.textMuted, fontSize: '14px' }}>Loading providers...</div>}

      {error && (
        <div
          style={{
            background: 'rgba(220,38,38,0.10)',
            border: '1px solid rgba(220,38,38,0.25)',
            color: C.red,
            padding: '12px 14px',
            borderRadius: '10px',
            fontSize: '13px',
            marginBottom: '16px',
          }}
        >
          {error}
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <Card>
          <div style={{ padding: '24px', textAlign: 'center', color: C.textMuted, fontSize: '14px' }}>
            {providers.length === 0
              ? roleFilter === 'attorney'
                ? 'No attorneys are available yet. Check back soon.'
                : roleFilter === 'consultant'
                  ? 'No consultants are available yet. Check back soon.'
                  : 'No providers are available yet. Check back soon.'
              : 'No providers match your search.'}
          </div>
        </Card>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
        {filtered.map((p) => (
          <AttorneyCard key={`${p.role}:${p.id}`} attorney={p} onSelect={() => setOpenProvider({ id: p.id, role: p.role })} />
        ))}
      </div>
    </div>
  )
}

// ── Card ──────────────────────────────────────────────────────────────────
function AttorneyCard({ attorney, onSelect }) {
  const initial = (attorney.full_name || '?').trim().charAt(0).toUpperCase()
  return (
    <Card>
      <div style={{ padding: '20px 20px 18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
          {attorney.headshot_url ? (
            <img
              src={attorney.headshot_url}
              alt={attorney.full_name}
              style={{ width: '64px', height: '64px', borderRadius: '50%', objectFit: 'cover', border: `2px solid ${C.surface}`, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
            />
          ) : (
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: C.surface2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: C.serif,
                fontSize: '26px',
                color: C.cyan,
              }}
            >
              {initial}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <div style={{ fontFamily: C.serif, fontSize: '18px', color: C.text, lineHeight: 1.2, fontWeight: 500 }}>
                {attorney.full_name}
              </div>
              {/* Role badge — surfaces whether a card belongs to an
                  attorney or consultant. The credential_type below is
                  the role's professional class (e.g. "Lawyer" for an
                  attorney, "consultant" for a consultant); this badge
                  is the higher-level role discriminator the unified
                  /api/providers endpoint emits. */}
              {attorney.role === 'attorney' && <Badge color="cyan">Attorney</Badge>}
              {attorney.role === 'consultant' && <Badge color="green">Consultant</Badge>}
            </div>
            {attorney.credential_type && attorney.credential_type !== 'consultant' && (
              <div style={{ fontSize: '12px', color: C.textMuted, marginTop: '2px' }}>{attorney.credential_type}</div>
            )}
            <RatingDisplay count={attorney.rating_count} avg={attorney.rating_avg} compact />
          </div>
          {!attorney.available && <Badge color="orange">Limited</Badge>}
        </div>

        {attorney.tagline && (
          <p style={{ color: C.text, fontSize: '13px', lineHeight: 1.5, margin: 0, fontStyle: 'italic' }}>
            “{attorney.tagline}”
          </p>
        )}

        {(attorney.specialties?.length || attorney.practice_areas) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {(attorney.specialties || []).slice(0, 4).map((s) => (
              <Tag key={s}>{s}</Tag>
            ))}
            {!attorney.specialties?.length && attorney.practice_areas && (
              <Tag>{attorney.practice_areas.split(',')[0]?.trim()}</Tag>
            )}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: `1px solid ${C.border}`, paddingTop: '12px' }}>
          <div>
            {Number(attorney.starting_price) > 0 ? (
              <div>
                <div style={{ fontSize: '11px', color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.05em' }}>From</div>
                <div style={{ fontFamily: C.serif, fontSize: '18px', color: C.text, fontWeight: 500 }}>${Number(attorney.starting_price / 100).toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: Number(attorney.starting_price) % 100 === 0 ? 0 : 2 })}</div>
              </div>
            ) : (
              <div style={{ fontSize: '12px', color: C.textMuted }}>Custom quote</div>
            )}
            {attorney.offers_free_consult && (
              attorney.consult_booking_url ? (
                <a
                  href={attorney.consult_booking_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  style={{ fontSize: '11px', color: C.green, fontWeight: 700, marginTop: '4px', textDecoration: 'underline', display: 'inline-block' }}
                >
                  📅 Book free 15-min consult →
                </a>
              ) : (
                <div style={{ fontSize: '11px', color: C.green, fontWeight: 600, marginTop: '2px' }}>Free 15-min consult</div>
              )
            )}
          </div>
          <Btn variant="primary" size="sm" onClick={onSelect}>
            View profile
          </Btn>
        </div>
      </div>
    </Card>
  )
}

function Tag({ children }) {
  return (
    <span
      style={{
        background: C.surface2,
        border: `1px solid ${C.border}`,
        borderRadius: '999px',
        padding: '3px 9px',
        fontSize: '11px',
        color: C.text,
        fontWeight: 500,
      }}
    >
      {children}
    </span>
  )
}

function RatingDisplay({ count, avg, compact }) {
  if (!count || !avg) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: compact ? '4px' : '8px' }}>
        <Badge color="cyan">New</Badge>
        <span style={{ color: C.textDim, fontSize: '11px' }}>No reviews yet</span>
      </div>
    )
  }
  const filled = Math.round(avg)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: compact ? '4px' : '8px' }}>
      <span style={{ color: '#f5b400', fontSize: compact ? '12px' : '14px', letterSpacing: '1px' }}>
        {'★'.repeat(filled)}
        <span style={{ color: '#d6cfc1' }}>{'★'.repeat(5 - filled)}</span>
      </span>
      <span style={{ color: C.text, fontSize: '12px', fontWeight: 600 }}>{avg.toFixed(1)}</span>
      <span style={{ color: C.textDim, fontSize: '11px' }}>({count})</span>
    </div>
  )
}

// ── Detail (full profile) ─────────────────────────────────────────────────
function AttorneyDetail({ attorneyId, providerRole, onBack, onStartInquiry }) {
  const [data, setData] = React.useState(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [chatOpen, setChatOpen] = React.useState(false)

  React.useEffect(() => {
    // Route the detail fetch to the role-appropriate endpoint. The
    // unified /api/providers directory hands us a role discriminator
    // per card; we use it here so consultant cards open consultant
    // detail and attorney cards open attorney detail.
    const endpoint = providerRole === 'consultant'
      ? `/api/consultants/${attorneyId}`
      : `/api/attorneys/${attorneyId}`
    fetch(endpoint, { credentials: 'same-origin' })
      .then(async (r) => {
        const payload = await r.json().catch(() => null)
        if (!r.ok) {
          setError(payload?.error || 'Could not load profile.')
          return
        }
        setData(payload)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [attorneyId, providerRole])

  if (loading) return <div style={{ padding: '24px 28px', color: C.textMuted, fontSize: '14px' }}>Loading profile...</div>
  if (error || !data) {
    return (
      <div style={{ padding: '24px 28px' }}>
        <button onClick={onBack} type="button" style={backBtn}>← Back</button>
        <div style={errorBox}>{error || 'No data.'}</div>
      </div>
    )
  }

  // Endpoints disagree on key: /api/attorneys/[id] returns { attorney },
  // /api/consultants/[id] returns { consultant }. Accept either shape.
  const a = data.attorney || data.consultant
  if (!a) {
    return (
      <div style={{ padding: '24px 28px' }}>
        <button onClick={onBack} type="button" style={backBtn}>← Back</button>
        <div style={errorBox}>Profile payload was empty.</div>
      </div>
    )
  }
  const ratings = data.ratings || []
  const gigs = data.gigs || []
  const initial = (a.full_name || '?').trim().charAt(0).toUpperCase()

  return (
    <div className="ys-attorney-detail" style={{ padding: '24px 28px', maxWidth: '1080px' }}>
      <button onClick={onBack} type="button" style={backBtn}>← Back to attorneys</button>

      {/* Hero */}
      <Card>
        <div className="ys-attorney-hero-grid" style={{ padding: '32px', display: 'grid', gridTemplateColumns: '160px 1fr auto', gap: '28px', alignItems: 'center' }}>
          <div className="ys-attorney-hero-avatar-wrap">
            {a.headshot_url ? (
              <img
                src={a.headshot_url}
                alt={a.full_name}
                className="ys-attorney-hero-avatar"
                style={{ width: '160px', height: '160px', borderRadius: '50%', objectFit: 'cover', border: `4px solid ${C.surface}`, boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}
              />
            ) : (
              <div className="ys-attorney-hero-avatar" style={{ width: '160px', height: '160px', borderRadius: '50%', background: C.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: C.serif, fontSize: '64px', color: C.cyan }}>
                {initial}
              </div>
            )}
          </div>
          <div>
            <h1 className="ys-attorney-hero-name" style={{ fontFamily: C.serif, fontSize: '40px', fontWeight: 500, color: C.text, margin: '0 0 4px', letterSpacing: '-0.012em' }}>
              {a.full_name}
            </h1>
            {a.credential_type && (
              <div style={{ color: C.textMuted, fontSize: '14px', marginBottom: '10px' }}>
                {a.credential_type}
                {a.years_experience ? ` · ${a.years_experience} yrs experience` : ''}
                {a.timezone ? ` · ${a.timezone}` : ''}
              </div>
            )}
            {a.tagline && (
              <p style={{ color: C.text, fontSize: '17px', lineHeight: 1.4, margin: '0 0 14px', fontFamily: C.serif, fontStyle: 'italic' }}>
                “{a.tagline}”
              </p>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '18px', flexWrap: 'wrap' }}>
              <RatingDisplay count={a.rating_count} avg={a.rating_avg} />
              {a.completed_engagements > 0 && (
                <span style={{ color: C.textMuted, fontSize: '13px' }}>
                  <strong style={{ color: C.text }}>{a.completed_engagements}</strong> completed engagement{a.completed_engagements === 1 ? '' : 's'}
                </span>
              )}
              {a.member_since && (
                <span style={{ color: C.textDim, fontSize: '12px' }}>Member since {new Date(a.member_since).toLocaleDateString(undefined, { year: 'numeric', month: 'short' })}</span>
              )}
            </div>
          </div>
          <div className="ys-attorney-hero-right" style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
            {/* Render the seller's actual starting price (cents → dollars)
                whenever it's set to anything > $0. Show "Custom-quoted
                per matter" only when no price is on file at all. */}
            {Number(a.starting_price) > 0 ? (
              <>
                <div style={{ fontSize: '11px', color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Starting at</div>
                <div className="ys-attorney-hero-price" style={{ fontFamily: C.serif, fontSize: '32px', color: C.text, fontWeight: 500 }}>${Number(a.starting_price / 100).toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: Number(a.starting_price) % 100 === 0 ? 0 : 2 })}</div>
              </>
            ) : (
              <div style={{ color: C.textMuted, fontSize: '13px' }}>Custom-quoted per matter</div>
            )}
            {/* Free consult badge — clickable when the attorney has
                pasted a Calendly / Cal.com / equivalent booking link
                in their profile editor. Without a URL the badge stays
                informational. target="_blank" + rel="noopener" so we
                never share session via Referer to the third-party
                scheduler. */}
            {a.offers_free_consult && (
              a.consult_booking_url ? (
                <a
                  href={a.consult_booking_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    background: C.green,
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '999px',
                    padding: '6px 14px',
                    fontSize: '12px',
                    fontWeight: 700,
                    textAlign: 'center',
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    boxShadow: '0 1px 3px rgba(5,150,105,0.30)',
                  }}
                  title="Book a free 15-minute consult"
                >
                  📅 Book free 15-min consult
                </a>
              ) : (
                <div style={{ background: 'rgba(5,150,105,0.10)', color: C.green, border: '1px solid rgba(5,150,105,0.25)', borderRadius: '999px', padding: '4px 10px', fontSize: '11px', fontWeight: 700, textAlign: 'center' }}>
                  Free 15-min consult
                </div>
              )
            )}
            {!a.available && <Badge color="orange">Limited availability</Badge>}
          </div>
        </div>
      </Card>

      {/* Trust badges */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '14px' }}>
        <TrustBadge>✓ Verified credentials</TrustBadge>
        <TrustBadge>✓ NMI-secured payments</TrustBadge>
        <TrustBadge>✓ Funds held in escrow</TrustBadge>
        <TrustBadge>✓ ABA Rule 5.4 compliant</TrustBadge>
      </div>

      {/* Two-column body */}
      <div className="yousafe-mobile-stack" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px', marginTop: '20px', alignItems: 'flex-start' }}>
        <div style={{ display: 'grid', gap: '16px' }}>
          {a.intro && (
            <Section title="Introduction">
              <p style={proseStyle}>{a.intro}</p>
            </Section>
          )}

          {a.bio && (
            <Section title="About">
              <div style={proseStyle}>{renderBioMarkdown(a.bio)}</div>
            </Section>
          )}

          {a.specialties?.length > 0 && (
            <Section title="Specialties">
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {a.specialties.map((s) => (
                  <Tag key={s}>{s}</Tag>
                ))}
              </div>
            </Section>
          )}

          {gigs.length > 0 && (
            <Section title="Gigs">
              <div style={{ display: 'grid', gap: '12px' }}>
                {gigs.map(gig => <GigPreview key={gig.id} gig={gig} />)}
              </div>
            </Section>
          )}

          {a.education && (
            <Section title="Education">
              <div style={{ ...proseStyle, whiteSpace: 'pre-wrap', fontSize: '14px' }}>{a.education}</div>
            </Section>
          )}

          {a.video_intro_url && (
            <Section title="Intro video">
              <a href={a.video_intro_url} target="_blank" rel="noreferrer" style={{ color: C.cyan, fontSize: '14px' }}>
                Watch on {hostname(a.video_intro_url)} →
              </a>
            </Section>
          )}

          <Section title="Testimonials">
            {ratings.length === 0 ? (
              <div style={{ color: C.textMuted, fontSize: '13px', lineHeight: 1.6 }}>
                Testimonials will appear here after completed engagements. For now, look for what sets this profile apart: clear jurisdictions, focused specialties, response style, and whether the attorney offers a free consult.
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '14px' }}>
                {ratings.map((r) => (
                  <Review key={r.id} review={r} />
                ))}
              </div>
            )}
          </Section>
        </div>

        {/* Sticky sidebar — un-sticky on mobile so the engage CTA doesn't
            pin below the long bio scroll. */}
        <aside className="ys-attorney-detail-aside" style={{ position: 'sticky', top: '20px' }}>
          <Card>
            <div style={{ padding: '20px' }}>
              <SectionHeading>Engage this attorney</SectionHeading>
              <p style={{ color: C.textMuted, fontSize: '13px', lineHeight: 1.6, margin: '0 0 14px' }}>
                Submit an inquiry describing your matter. {a.full_name?.split(' ')[0] || 'They'}
                {' '}will see it in their queue and can send you a custom offer.
              </p>
              <Btn
                variant="primary"
                size="md"
                fullWidth
                onClick={() => onStartInquiry?.({ id: a.id, name: a.full_name })}
              >
                Submit an inquiry →
              </Btn>
              <DividerLite />
              <Btn variant="brand" size="md" fullWidth onClick={() => setChatOpen(true)}>
                💬 Chat with {a.full_name?.split(' ')[0] || 'attorney'}
              </Btn>
              <p style={{ color: C.textDim, fontSize: '12px', textAlign: 'center', margin: '8px 0 0', lineHeight: 1.5 }}>
                Opens a chat side-pane — ask a quick question without leaving this profile.
              </p>
              {a.offers_free_consult && (
                <p style={{ color: C.green, fontSize: '12px', textAlign: 'center', margin: '10px 0 0' }}>
                  Free 15-minute consult included
                </p>
              )}
            </div>
          </Card>

          <div style={{ marginTop: '12px' }}>
            <Card>
              <div style={{ padding: '18px 20px' }}>
                <SectionHeading>At a glance</SectionHeading>
                {a.jurisdictions && <Stat label="Admitted in" value={a.jurisdictions} />}
                {a.practice_areas && <Stat label="Practice areas" value={a.practice_areas} />}
                {a.languages?.length > 0 && <Stat label="Languages" value={a.languages.join(', ')} />}
                {a.capacity && <Stat label="Capacity" value={a.capacity} />}
                {a.profile_url && (
                  <Stat
                    label="External profile"
                    value={
                      <a href={a.profile_url} target="_blank" rel="noreferrer" style={{ color: C.cyan, fontSize: '13px' }}>
                        {hostname(a.profile_url)} →
                      </a>
                    }
                  />
                )}
              </div>
            </Card>
          </div>
        </aside>
      </div>

      {/* Slide-in chat — opens from "Chat with …" CTA above.
          Consultants have no attorney-chat queue: route them through the
          unified messages path via counterpartProfileId. Passing a
          consultant id as attorneyId 404s every attorney endpoint
          ("Attorney not found"). */}
      <ChatSidePane
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        attorneyId={providerRole === 'consultant' ? null : a.id}
        counterpartProfileId={providerRole === 'consultant' ? (a.profile_id || a.id) : null}
        attorneyName={a.full_name}
        attorneyAvatar={a.headshot_url}
      />
    </div>
  )
}

function DividerLite() {
  return <div style={{ height: '1px', background: C.border, margin: '16px 0' }} />
}

function Section({ title, children }) {
  return (
    <Card>
      <div style={{ padding: '20px 22px' }}>
        <SectionHeading>{title}</SectionHeading>
        {children}
      </div>
    </Card>
  )
}

function SectionHeading({ children }) {
  return (
    <div
      style={{
        color: C.textMuted,
        fontSize: '11px',
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        fontWeight: 700,
        marginBottom: '12px',
      }}
    >
      {children}
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '8px 0', borderBottom: `1px solid ${C.border}` }}>
      <span style={{ color: C.textDim, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      <span style={{ color: C.text, fontSize: '13px' }}>{value}</span>
    </div>
  )
}

function TrustBadge({ children }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        background: C.surface,
        border: `1px solid ${C.border}`,
        color: C.textMuted,
        borderRadius: '999px',
        padding: '6px 12px',
        fontSize: '11px',
        letterSpacing: '0.04em',
        fontWeight: 600,
      }}
    >
      {children}
    </span>
  )
}

function Review({ review }) {
  const filled = Math.round(review.stars)
  return (
    <div style={{ paddingBottom: '14px', borderBottom: `1px solid ${C.border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px', flexWrap: 'wrap', gap: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: '#f5b400', letterSpacing: '1px' }}>
            {'★'.repeat(filled)}<span style={{ color: '#d6cfc1' }}>{'★'.repeat(5 - filled)}</span>
          </span>
          <strong style={{ color: C.text, fontSize: '13px' }}>{review.rater_name}</strong>
        </div>
        <span style={{ color: C.textDim, fontSize: '11px' }}>{new Date(review.created_at).toLocaleDateString()}</span>
      </div>
      {review.comment && <p style={{ color: C.text, fontSize: '13px', lineHeight: 1.55, margin: 0 }}>{review.comment}</p>}
    </div>
  )
}

function GigPreview({ gig }) {
  const tiers = (gig.tiers || []).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: '10px', padding: '14px', background: C.surface2 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: '14px', color: C.text }}>{gig.title}</div>
          <div style={{ color: C.textMuted, fontSize: '13px', lineHeight: 1.5, marginTop: '4px' }}>{gig.summary}</div>
        </div>
        {tiers[0] && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '11px', color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.05em' }}>From</div>
            <div style={{ fontFamily: C.serif, fontSize: '22px', color: C.text }}>${Number(tiers[0].price || 0).toFixed(0)}</div>
          </div>
        )}
      </div>
      {tiers.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(tiers.length, 3)}, minmax(0, 1fr))`, gap: '8px', marginTop: '12px' }}>
          {tiers.map(t => (
            <div key={t.id} style={{ border: `1px solid ${C.border}`, borderRadius: '8px', padding: '10px', background: C.surface }}>
              <div style={{ color: C.text, fontWeight: 800, fontSize: '12px', textTransform: 'capitalize' }}>{t.tier_name}</div>
              <div style={{ color: C.textMuted, fontSize: '12px', marginTop: '3px' }}>{t.delivery_days} days · {t.revision_count} rev.</div>
              <div style={{ color: C.cyan, fontWeight: 800, fontSize: '14px', marginTop: '6px' }}>${Number(t.price || 0).toFixed(2)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function hostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'link'
  }
}

const eyebrow = {
  color: C.textMuted,
  fontSize: '11px',
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  fontWeight: 700,
}

const proseStyle = {
  color: C.text,
  fontSize: '15px',
  lineHeight: 1.65,
  margin: 0,
}

const backBtn = {
  background: 'none',
  border: 'none',
  color: C.textMuted,
  cursor: 'pointer',
  fontSize: '13px',
  marginBottom: '14px',
  fontFamily: 'inherit',
  padding: 0,
}

const errorBox = {
  padding: '12px 14px',
  background: 'rgba(220,38,38,0.08)',
  border: '1px solid rgba(220,38,38,0.20)',
  color: C.red,
  borderRadius: '8px',
  fontSize: '13px',
}
