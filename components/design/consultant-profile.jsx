'use client'
import React from 'react'
import { Card, Btn, Badge } from './shared'
import ConsultantProfileEditor from './consultant-profile-editor'
import { renderBioMarkdown } from '@/lib/bioMarkdown'

/**
 * Consultant → My Profile (mirrors AttorneyProfile).
 *
 * Wraps the existing ConsultantProfileEditor with:
 *   • Profile-strength scorecard (score, tier, completeness checklist)
 *   • "View public profile" link to the student-facing version
 *   • Tabs: Editor | Live preview
 *   • Strength checklist sidebar that highlights remaining wins
 */

const NAVY='#0F172A', GOLD='#9A7B3B', GREEN='#1A6B45', RED='#8B1A1A', AMBER='#8B5E0A', CYAN='#0E7C8E', PURPLE='#3D2B6B'
const BG='#F7F5F0', SURFACE='#FFFFFF', SURFACE2='#FAFAF7', BORDER='#DDD8CE', BORDER2='#F2EFE9', TEXT='#1A1F2E', MUTED='#5C6070', DIM='#9097A8'
const SERIF=`'Cormorant Garamond', Georgia, serif`
const SANS=`-apple-system, BlinkMacSystemFont, 'Inter', sans-serif`
const MONO=`'SF Mono', Menlo, Consolas, monospace`

const TIER_CFG = {
  bronze:   { label: 'Bronze',   color: '#8B5E0A', sub: 'Just getting started' },
  silver:   { label: 'Silver',   color: '#6F7A8A', sub: 'Solid foundations'  },
  gold:     { label: 'Gold',     color: '#C4A45A', sub: 'Highly attractive' },
  platinum: { label: 'Platinum', color: '#0E7C8E', sub: 'Top-tier profile' },
}

const TABS = [
  { id: 'editor',  label: 'Editor',          icon: '✏️' },
  { id: 'preview', label: 'Public preview',  icon: '👁️' },
]

export default function ConsultantProfile() {
  const [strength, setStrength] = React.useState(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [tab, setTab] = React.useState('editor')
  const [refreshKey, setRefreshKey] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    setLoading(true); setError('')
    ;(async () => {
      try {
        const res = await fetch('/api/consultant/profile/strength', { credentials: 'same-origin' })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) {
          if (res.status === 401 && refreshKey > 0) return
          throw new Error(body?.error || `Request failed (${res.status})`)
        }
        if (!cancelled) setStrength(body)
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Failed')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [refreshKey])

  React.useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible') setRefreshKey(k => k + 1) }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  return (
    <div style={{ padding: '24px 28px 60px', display: 'flex', flexDirection: 'column', gap: 18, fontFamily: SANS, background: BG, minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.16em', color: GOLD, textTransform: 'uppercase', fontFamily: MONO, marginBottom: 4 }}>Your public profile</div>
          <h1 style={{ fontFamily: SERIF, fontSize: 32, fontWeight: 500, color: TEXT, margin: 0, letterSpacing: '-.012em' }}>My profile.</h1>
          <div style={{ fontSize: 13, color: MUTED, marginTop: 4 }}>
            Treat this like a Fiverr seller profile. A sharper profile wins more students — aim for Gold or Platinum.
          </div>
        </div>
        <Btn variant="ghost" size="sm" onClick={() => setRefreshKey(k => k + 1)}>↻ Refresh score</Btn>
      </div>

      {/* Strength card */}
      <StrengthCard strength={strength} loading={loading} error={error} />

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${BORDER}`, marginBottom: -2 }}>
        {TABS.map(t => {
          const active = tab === t.id
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: '9px 16px', fontSize: 13, fontFamily: SANS, fontWeight: active ? 700 : 500,
              border: 'none', background: 'transparent',
              borderBottom: `2px solid ${active ? CYAN : 'transparent'}`,
              color: active ? TEXT : MUTED, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}><span>{t.icon}</span>{t.label}</button>
          )
        })}
      </div>

      {/* Body */}
      {tab === 'editor' && (
        <div className="yousafe-mobile-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 18, alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0 }}>
            <ConsultantProfileEditor />
          </div>
          <ChecklistSidebar strength={strength} onJumpToTab={() => setTab('editor')} />
        </div>
      )}

      {tab === 'preview' && <PreviewTab strength={strength} />}
    </div>
  )
}

function StrengthCard({ strength, loading, error }) {
  if (loading) return <Card style={{ padding: 20, color: MUTED, fontSize: 13 }}>Calculating profile strength…</Card>
  if (error) return <Card style={{ padding: 16, background: `${RED}10`, color: RED, fontSize: 13 }}>{error}</Card>
  if (!strength) return null

  const tier = TIER_CFG[strength.tier] || TIER_CFG.bronze
  const score = Number(strength.score || 0)
  const done = Number(strength.completed || 0)
  const total = Number(strength.total || 0)

  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 22, padding: '20px 24px', alignItems: 'center', flexWrap: 'wrap', borderBottom: `1px solid ${BORDER2}` }}>
        {/* Circular score */}
        <div style={{ position: 'relative', width: 92, height: 92, flexShrink: 0 }}>
          <svg width={92} height={92} viewBox="0 0 92 92" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="46" cy="46" r="40" stroke={BORDER} strokeWidth="6" fill="none" />
            <circle cx="46" cy="46" r="40" stroke={tier.color} strokeWidth="6" fill="none"
              strokeDasharray={2 * Math.PI * 40}
              strokeDashoffset={2 * Math.PI * 40 * (1 - score / 100)}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset .4s ease' }} />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
            <span style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 600, color: TEXT, lineHeight: 1 }}>{score}</span>
            <span style={{ fontSize: 9, color: DIM, fontFamily: MONO, letterSpacing: '.06em', textTransform: 'uppercase' }}>score</span>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 4, background: `${tier.color}15`, color: tier.color, letterSpacing: '.08em', textTransform: 'uppercase', fontFamily: MONO }}>
              {tier.label} tier
            </span>
            {strength.available
              ? <Badge color="green" style={{ fontSize: 10 }}>Available</Badge>
              : <Badge color="gray"  style={{ fontSize: 10 }}>Paused</Badge>}
          </div>
          <div style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 600, color: TEXT, marginBottom: 2 }}>{tier.sub}</div>
          <div style={{ fontSize: 12, color: MUTED, fontFamily: MONO }}>
            {done} of {total} profile signals complete · Consultant
          </div>
        </div>
      </div>
      {/* Progress bar */}
      <div style={{ height: 6, background: BORDER2 }}>
        <div style={{ height: '100%', width: `${score}%`, background: tier.color, transition: 'width .4s ease' }} />
      </div>
    </Card>
  )
}

function ChecklistSidebar({ strength, onJumpToTab }) {
  if (!strength) return null
  const remaining = (strength.checks || []).filter(c => !c.done)
  const completed = (strength.checks || []).filter(c => c.done)

  return (
    <aside style={{ position: 'sticky', top: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: `1px solid ${BORDER2}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontFamily: SERIF, fontSize: 16, fontWeight: 600, color: TEXT }}>Boost your profile</div>
          {remaining.length > 0 && (
            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: `${AMBER}15`, color: AMBER }}>
              {remaining.length} to go
            </span>
          )}
        </div>
        <div style={{ padding: '6px 16px 14px' }}>
          {remaining.length === 0 ? (
            <div style={{ padding: '12px 0', fontSize: 13, color: GREEN, fontWeight: 600 }}>
              ✓ All profile signals complete. Nice work.
            </div>
          ) : (
            remaining.slice(0, 6).map(c => (
              <div key={c.id} style={{ padding: '10px 0', borderBottom: `1px solid ${BORDER2}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{c.label}</div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: AMBER, fontFamily: MONO, flexShrink: 0 }}>+{c.weight}</span>
                </div>
                {c.hint && <div style={{ fontSize: 11, color: MUTED, marginTop: 4, lineHeight: 1.5 }}>{c.hint}</div>}
              </div>
            ))
          )}
        </div>
      </Card>
      {completed.length > 0 && (
        <Card style={{ padding: '14px 16px' }}>
          <div style={{ fontFamily: SERIF, fontSize: 14, fontWeight: 600, color: TEXT, marginBottom: 8 }}>Completed</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {completed.map(c => (
              <span key={c.id} style={{ fontSize: 11, padding: '3px 9px', borderRadius: 999, background: `${GREEN}10`, color: GREEN, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                ✓ {c.label}
              </span>
            ))}
          </div>
        </Card>
      )}
    </aside>
  )
}

function PreviewTab({ strength }) {
  const [data, setData] = React.useState(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    let cancelled = false
    setLoading(true); setError('')
    ;(async () => {
      try {
        const res = await fetch('/api/consultant/profile', { credentials: 'same-origin' })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`)
        if (!cancelled) setData(body || {})
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Could not load your profile.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  if (loading) return <Card style={{ padding: 20, color: MUTED, fontSize: 13 }}>Loading preview…</Card>
  if (error) return (
    <Card style={{ padding: 16, background: `${RED}10`, color: RED, fontSize: 13, lineHeight: 1.5 }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>Couldn't load preview</div>
      <div>{error}</div>
      <div style={{ marginTop: 8, fontSize: 12, color: MUTED }}>
        If you're newly approved, save any field in the Editor first to seed your profile, then come back.
      </div>
    </Card>
  )
  if (!data) return (
    <Card style={{ padding: 20, color: MUTED, fontSize: 13 }}>
      Your profile preview will appear here once you save a tagline, intro, or headshot in the Editor.
    </Card>
  )

  const c = data.consultant || {}
  const profile = data.profile || {}
  const hasAnyContent = !!(c.avatarUrl || c.headshot_url || c.tagline || c.intro || c.bio || (Array.isArray(c.specialties) && c.specialties.length) || (Array.isArray(c.languages) && c.languages.length))
  if (!hasAnyContent) {
    return (
      <Card style={{ padding: 24, lineHeight: 1.6 }}>
        <div style={{ fontFamily: SERIF, fontSize: 20, color: TEXT, marginBottom: 6 }}>
          Your public profile is empty.
        </div>
        <div style={{ color: MUTED, fontSize: 13 }}>
          Add a headshot, tagline, and intro in the <strong>Editor</strong> tab. Once saved, this preview
          shows exactly what students see on your marketplace card.
        </div>
      </Card>
    )
  }

  const initial = (profile.full_name || profile.email || '?').trim().charAt(0).toUpperCase()
  const tags = Array.isArray(c.specialties) ? c.specialties : []
  const langs = Array.isArray(c.languages) ? c.languages : []
  const avatarUrl = c.avatarUrl || c.headshot_url || ''

  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 40px' }}>
      <div style={{ width: '100%', maxWidth: 720, background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 16, overflow: 'hidden', boxShadow: '0 4px 24px rgba(27,45,79,0.08)' }}>
        <div style={{ height: 80, background: `linear-gradient(135deg, ${NAVY}, #0d2060)` }} />
        <div style={{ padding: '0 28px 28px', marginTop: -44 }}>
          <div style={{ display: 'flex', gap: 18, alignItems: 'flex-end' }}>
            {avatarUrl
              ? <img src={avatarUrl} alt={profile.full_name || ''} style={{ width: 88, height: 88, borderRadius: '50%', objectFit: 'cover', border: `4px solid ${SURFACE}` }} />
              : <div style={{ width: 88, height: 88, borderRadius: '50%', background: `${NAVY}10`, color: NAVY, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 32, fontFamily: SERIF, border: `4px solid ${SURFACE}` }}>{initial}</div>}
            <div style={{ flex: 1, paddingBottom: 8 }}>
              <div style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 600, color: TEXT, lineHeight: 1.1 }}>
                {profile.full_name || profile.email}
              </div>
              <div style={{ color: MUTED, fontSize: 13, marginTop: 4 }}>
                Consultant{c.years_experience ? ` · ${c.years_experience} yrs experience` : ''}{c.timezone ? ` · ${c.timezone}` : ''}
              </div>
            </div>
          </div>

          {c.tagline && <div style={{ fontSize: 16, color: TEXT, fontWeight: 600, marginTop: 18, lineHeight: 1.5 }}>{c.tagline}</div>}
          {c.intro && <div style={{ fontSize: 14, color: TEXT, lineHeight: 1.7, marginTop: 12, whiteSpace: 'pre-wrap' }}>{c.intro}</div>}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
            {c.offers_free_consult && <Badge color="green" style={{ fontSize: 10 }}>Free consult</Badge>}
            {Number(c.starting_price || 0) > 0 && <Badge color="cyan" style={{ fontSize: 10 }}>From ${Number(c.starting_price / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}</Badge>}
          </div>

          {tags.length > 0 && (
            <PreviewSection label="Specialties">
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {tags.map(t => <span key={t} style={{ fontSize: 12, padding: '4px 10px', background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: 999, color: TEXT }}>{t}</span>)}
              </div>
            </PreviewSection>
          )}
          {langs.length > 0 && (
            <PreviewSection label="Languages">{langs.join(' · ')}</PreviewSection>
          )}
          {c.bio && (
            <PreviewSection label="About">
              <div style={{ lineHeight: 1.7 }}>{renderBioMarkdown(c.bio)}</div>
            </PreviewSection>
          )}
          {c.education && (
            <PreviewSection label="Education">
              <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{c.education}</div>
            </PreviewSection>
          )}
          {c.video_intro_url && (
            <PreviewSection label="Video introduction">
              <a href={c.video_intro_url} target="_blank" rel="noreferrer" style={{ color: CYAN, fontSize: 13 }}>▶ {c.video_intro_url}</a>
            </PreviewSection>
          )}
        </div>
      </div>
    </div>
  )
}

function PreviewSection({ label, children }) {
  return (
    <div style={{ marginTop: 22 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: DIM, fontFamily: MONO, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 14, color: TEXT, lineHeight: 1.6 }}>{children}</div>
    </div>
  )
}
