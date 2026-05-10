// @ts-nocheck
'use client'
import React from 'react'
import { C, Card, Badge, Btn } from './shared'

// Browse list + full-screen detail (Fiverr-style seller profile).
export default function FindAttorney() {
  const [attorneys, setAttorneys] = React.useState([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [query, setQuery] = React.useState('')
  const [openId, setOpenId] = React.useState(null)

  React.useEffect(() => {
    let cancelled = false
    fetch('/api/attorneys', { credentials: 'same-origin' })
      .then(async (r) => {
        const payload = await r.json().catch(() => null)
        if (cancelled) return
        if (!r.ok) {
          setError(payload?.error || 'Could not load attorneys.')
          return
        }
        setAttorneys(Array.isArray(payload?.attorneys) ? payload.attorneys : [])
      })
      .catch((e) => {
        if (cancelled) return
        setError(e.message || 'Could not load attorneys.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return attorneys
    return attorneys.filter((a) =>
      [a.full_name, a.tagline, a.jurisdictions, a.practice_areas, a.bio, (a.specialties || []).join(' '), (a.languages || []).join(' ')]
        .filter(Boolean)
        .some((s) => String(s).toLowerCase().includes(q)),
    )
  }, [attorneys, query])

  if (openId) {
    return <AttorneyDetail attorneyId={openId} onBack={() => setOpenId(null)} />
  }

  return (
    <div style={{ padding: '24px 28px' }}>
      <div style={{ marginBottom: '20px' }}>
        <div style={eyebrow}>Attorney panel</div>
        <h2 style={{ fontFamily: C.serif, fontSize: '28px', fontWeight: 500, color: C.text, margin: '4px 0', letterSpacing: '-0.012em' }}>
          Find an attorney.
        </h2>
        <p style={{ color: C.textMuted, fontSize: '14px', margin: 0, maxWidth: '600px' }}>
          Verified panel of attorneys, solicitors, and Canadian lawyers. Pick someone whose
          jurisdiction and specialty match your matter.
        </p>
      </div>

      <input
        type="text"
        placeholder="Search by name, jurisdiction, specialty, or language..."
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
          outline: 'none',
        }}
      />

      {loading && <div style={{ color: C.textMuted, fontSize: '14px' }}>Loading attorneys...</div>}

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
            {attorneys.length === 0 ? 'No attorneys are available yet. Check back soon.' : 'No attorneys match your search.'}
          </div>
        </Card>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
        {filtered.map((a) => (
          <AttorneyCard key={a.id} attorney={a} onSelect={() => setOpenId(a.id)} />
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
            <div style={{ fontFamily: C.serif, fontSize: '18px', color: C.text, lineHeight: 1.2, fontWeight: 500 }}>
              {attorney.full_name}
            </div>
            {attorney.credential_type && (
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
            {attorney.starting_price ? (
              <div>
                <div style={{ fontSize: '11px', color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.05em' }}>From</div>
                <div style={{ fontFamily: C.serif, fontSize: '18px', color: C.text, fontWeight: 500 }}>${Number(attorney.starting_price).toFixed(0)}</div>
              </div>
            ) : (
              <div style={{ fontSize: '12px', color: C.textMuted }}>Custom quote</div>
            )}
            {attorney.offers_free_consult && (
              <div style={{ fontSize: '11px', color: C.green, fontWeight: 600, marginTop: '2px' }}>Free 15-min consult</div>
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
function AttorneyDetail({ attorneyId, onBack }) {
  const [data, setData] = React.useState(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    fetch(`/api/attorneys/${attorneyId}`, { credentials: 'same-origin' })
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
  }, [attorneyId])

  if (loading) return <div style={{ padding: '24px 28px', color: C.textMuted, fontSize: '14px' }}>Loading profile...</div>
  if (error || !data) {
    return (
      <div style={{ padding: '24px 28px' }}>
        <button onClick={onBack} type="button" style={backBtn}>← Back</button>
        <div style={errorBox}>{error || 'No data.'}</div>
      </div>
    )
  }

  const a = data.attorney
  const ratings = data.ratings || []
  const initial = (a.full_name || '?').trim().charAt(0).toUpperCase()

  return (
    <div style={{ padding: '24px 28px', maxWidth: '1080px' }}>
      <button onClick={onBack} type="button" style={backBtn}>← Back to attorneys</button>

      {/* Hero */}
      <Card>
        <div style={{ padding: '32px', display: 'grid', gridTemplateColumns: '160px 1fr auto', gap: '28px', alignItems: 'center' }}>
          <div>
            {a.headshot_url ? (
              <img
                src={a.headshot_url}
                alt={a.full_name}
                style={{ width: '160px', height: '160px', borderRadius: '50%', objectFit: 'cover', border: `4px solid ${C.surface}`, boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}
              />
            ) : (
              <div style={{ width: '160px', height: '160px', borderRadius: '50%', background: C.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: C.serif, fontSize: '64px', color: C.cyan }}>
                {initial}
              </div>
            )}
          </div>
          <div>
            <h1 style={{ fontFamily: C.serif, fontSize: '40px', fontWeight: 500, color: C.text, margin: '0 0 4px', letterSpacing: '-0.012em' }}>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
            {a.starting_price ? (
              <>
                <div style={{ fontSize: '11px', color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Starting at</div>
                <div style={{ fontFamily: C.serif, fontSize: '32px', color: C.text, fontWeight: 500 }}>${Number(a.starting_price).toFixed(0)}</div>
              </>
            ) : (
              <div style={{ color: C.textMuted, fontSize: '13px' }}>Custom-quoted per matter</div>
            )}
            {a.offers_free_consult && (
              <div style={{ background: 'rgba(5,150,105,0.10)', color: C.green, border: '1px solid rgba(5,150,105,0.25)', borderRadius: '999px', padding: '4px 10px', fontSize: '11px', fontWeight: 700, textAlign: 'center' }}>
                Free 15-min consult
              </div>
            )}
            {!a.available && <Badge color="orange">Limited availability</Badge>}
          </div>
        </div>
      </Card>

      {/* Trust badges */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '14px' }}>
        <TrustBadge>✓ Verified credentials</TrustBadge>
        <TrustBadge>✓ Stripe-secured payments</TrustBadge>
        <TrustBadge>✓ Funds held in escrow</TrustBadge>
        <TrustBadge>✓ ABA Rule 5.4 compliant</TrustBadge>
      </div>

      {/* Two-column body */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px', marginTop: '20px', alignItems: 'flex-start' }}>
        <div style={{ display: 'grid', gap: '16px' }}>
          {a.intro && (
            <Section title="Introduction">
              <p style={proseStyle}>{a.intro}</p>
            </Section>
          )}

          {a.bio && (
            <Section title="About">
              <div style={{ ...proseStyle, whiteSpace: 'pre-wrap' }}>{a.bio}</div>
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

          <Section title="Reviews">
            {ratings.length === 0 ? (
              <div style={{ color: C.textMuted, fontSize: '13px' }}>No reviews yet. Be the first.</div>
            ) : (
              <div style={{ display: 'grid', gap: '14px' }}>
                {ratings.map((r) => (
                  <Review key={r.id} review={r} />
                ))}
              </div>
            )}
          </Section>
        </div>

        {/* Sticky sidebar */}
        <aside style={{ position: 'sticky', top: '20px' }}>
          <Card>
            <div style={{ padding: '20px' }}>
              <SectionHeading>Engage this attorney</SectionHeading>
              <p style={{ color: C.textMuted, fontSize: '13px', lineHeight: 1.6, margin: '0 0 14px' }}>
                Submit an inquiry describing your matter. {a.full_name?.split(' ')[0] || 'They'}
                {' '}will see it in their queue and can send you a custom offer.
              </p>
              <Btn variant="primary" size="md" fullWidth onClick={() => { window.location.assign('/dashboard?lane=student#inquiries') }}>
                Submit an inquiry →
              </Btn>
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
    </div>
  )
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
