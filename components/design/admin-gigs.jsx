// @ts-nocheck
'use client'
import React from 'react'
import { C, Card, Badge, Btn, Avatar } from './shared'

// ─── Design tokens ────────────────────────────────────────────────────────────
const serif = "'Cormorant Garamond', 'Garamond', Georgia, serif"
const sans  = C.sans

const STATUS_CFG = {
  active:    { bg: '#EAF5EE', text: '#1A6B45', border: 'rgba(26,107,69,0.22)',  dot: '#22C55E', label: 'Active'    },
  draft:     { bg: '#F5EDD6', text: '#7A6030', border: 'rgba(154,123,59,0.28)', dot: '#EAB308', label: 'Draft'     },
  suspended: { bg: '#FEF5E4', text: '#7A4D08', border: 'rgba(139,94,10,0.25)',  dot: '#F59E0B', label: 'Suspended' },
  archived:  { bg: '#EDEAF7', text: '#3D2B6B', border: 'rgba(61,43,107,0.22)',  dot: '#8B5CF6', label: 'Archived'  },
  deleted:   { bg: '#FAEAEA', text: '#7A1A1A', border: 'rgba(139,26,26,0.22)',  dot: '#EF4444', label: 'Deleted'   },
  paused:    { bg: '#FEF5E4', text: '#7A4D08', border: 'rgba(139,94,10,0.25)',  dot: '#F59E0B', label: 'Paused'    },
}

const PROVIDER_COLORS = { attorney: '#1B2D4F', consultant: '#7C3AED' }

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = v => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(Number(v) || 0)
const ago = dateStr => {
  if (!dateStr) return '—'
  const diff = Date.now() - new Date(dateStr).getTime()
  const d = Math.floor(diff / 86400000)
  if (d === 0) return 'Today'
  if (d === 1) return 'Yesterday'
  if (d < 30)  return `${d}d ago`
  if (d < 365) return `${Math.floor(d / 30)}mo ago`
  return `${Math.floor(d / 365)}y ago`
}

const StatusPill = ({ status }) => {
  const cfg = STATUS_CFG[status] || STATUS_CFG.draft
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '3px 9px 3px 7px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.border}` }}>
      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: cfg.dot, display: 'inline-block', flexShrink: 0 }} />
      {cfg.label}
    </span>
  )
}

const MetricChip = ({ icon, value, label }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 8px', background: '#F7F5F0', borderRadius: '4px', border: '1px solid #DDD8CE' }}>
    <span style={{ fontSize: '12px' }}>{icon}</span>
    <span style={{ fontWeight: 700, fontSize: '12px', color: '#1B2D4F', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    <span style={{ fontSize: '11px', color: '#9097A8' }}>{label}</span>
  </div>
)

// ─── Suspend modal ────────────────────────────────────────────────────────────
function SuspendModal({ gig, onConfirm, onClose }) {
  const [reason, setReason] = React.useState('')
  const [busy, setBusy]     = React.useState(false)
  if (!gig) return null
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.60)', zIndex: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '10px', padding: '28px', width: '100%', maxWidth: '460px', boxShadow: '0 20px 60px rgba(0,0,0,0.22)', fontFamily: sans }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
          <h3 style={{ fontFamily: serif, fontWeight: 600, fontSize: '20px', color: '#1B2D4F', margin: 0 }}>Suspend Service</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#9097A8', lineHeight: 1 }}>×</button>
        </div>
        <p style={{ fontSize: '13px', color: '#5C6070', lineHeight: 1.6, margin: '0 0 16px', background: '#FEF5E4', border: '1px solid rgba(139,94,10,0.20)', borderRadius: '6px', padding: '10px 14px' }}>
          <strong style={{ color: '#7A4D08' }}>"{gig.title}"</strong> by {gig.provider?.name || 'Unknown'} will be hidden from the marketplace immediately.
        </p>
        <label style={{ display: 'block', marginBottom: '14px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#5C6070', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Suspension Reason <span style={{ color: '#8B1A1A' }}>*</span></div>
          <textarea
            rows={3}
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Explain why this service is being suspended (visible to the provider)…"
            style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #DDD8CE', borderRadius: '7px', padding: '10px 12px', fontSize: '13px', fontFamily: sans, resize: 'vertical', outline: 'none', lineHeight: 1.55 }}
          />
        </label>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: '6px', border: '1px solid #DDD8CE', background: '#fff', color: '#5C6070', cursor: 'pointer', fontSize: '13px', fontWeight: 600, fontFamily: sans }}>Cancel</button>
          <button
            disabled={!reason.trim() || busy}
            onClick={async () => { setBusy(true); await onConfirm(gig.id, reason.trim()); setBusy(false) }}
            style={{ padding: '8px 18px', borderRadius: '6px', border: 'none', background: !reason.trim() ? '#9097A8' : '#8B1A1A', color: '#fff', cursor: !reason.trim() ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: 700, fontFamily: sans }}>
            {busy ? 'Suspending…' : 'Suspend Service'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Feature / Boost modal ────────────────────────────────────────────────────
function PromoteModal({ gig, onConfirm, onClose }) {
  const [days, setDays]   = React.useState(7)
  const [type, setType]   = React.useState('boost')
  const [busy, setBusy]   = React.useState(false)
  if (!gig) return null
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.60)', zIndex: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '10px', padding: '28px', width: '100%', maxWidth: '420px', boxShadow: '0 20px 60px rgba(0,0,0,0.22)', fontFamily: sans }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
          <h3 style={{ fontFamily: serif, fontWeight: 600, fontSize: '20px', color: '#1B2D4F', margin: 0 }}>Admin Promote Service</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#9097A8' }}>×</button>
        </div>
        <p style={{ fontSize: '13px', color: '#5C6070', margin: '0 0 18px' }}>Manually boost or feature <strong>"{gig.title}"</strong> for a set number of days.</p>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
          {[{ v: 'boost', l: '🚀 Boost' }, { v: 'featured', l: '⭐ Feature' }].map(o => (
            <button key={o.v} onClick={() => setType(o.v)} style={{ flex: 1, padding: '8px', borderRadius: '6px', border: `1px solid ${type === o.v ? '#1B2D4F' : '#DDD8CE'}`, background: type === o.v ? '#1B2D4F' : '#fff', color: type === o.v ? '#fff' : '#5C6070', cursor: 'pointer', fontSize: '13px', fontWeight: 600, fontFamily: sans }}>{o.l}</button>
          ))}
        </div>
        <label style={{ display: 'block', marginBottom: '18px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#5C6070', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Duration (days)</div>
          <select value={days} onChange={e => setDays(Number(e.target.value))} style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid #DDD8CE', fontSize: '13px', fontFamily: sans, background: '#fff', cursor: 'pointer' }}>
            {[1, 3, 7, 14, 30].map(d => <option key={d} value={d}>{d} day{d !== 1 ? 's' : ''}</option>)}
          </select>
        </label>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: '6px', border: '1px solid #DDD8CE', background: '#fff', color: '#5C6070', cursor: 'pointer', fontSize: '13px', fontWeight: 600, fontFamily: sans }}>Cancel</button>
          <button onClick={async () => { setBusy(true); await onConfirm(gig.id, type, days); setBusy(false) }} style={{ padding: '8px 18px', borderRadius: '6px', border: 'none', background: '#9A7B3B', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: 700, fontFamily: sans }}>
            {busy ? 'Applying…' : `Apply ${days}d ${type}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Detail drawer ────────────────────────────────────────────────────────────
function GigDrawer({ gig, onClose, onAction, formatPrimary }) {
  const [activeSection, setActiveSection] = React.useState('overview')
  if (!gig) return null

  const SECTIONS = ['overview', 'content', 'pricing', 'metrics', 'moderation', 'audit']

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', justifyContent: 'flex-end' }}>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.40)' }} />

      {/* Drawer */}
      <div style={{ position: 'relative', width: 'min(600px, 100vw)', height: '100vh', background: '#fff', boxShadow: '-4px 0 40px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column', fontFamily: sans }}>

        {/* Drawer header */}
        <div style={{ background: '#1B2D4F', padding: '20px 24px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '12px' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.50)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '4px' }}>
                {gig.provider_type === 'attorney' ? '⚖️ Attorney Service' : '👤 Consultant Service'}
              </div>
              <h2 style={{ fontFamily: serif, fontWeight: 600, fontSize: '20px', color: '#fff', margin: 0, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                {gig.title || 'Untitled'}
              </h2>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', marginTop: '4px' }}>{gig.slug}</div>
            </div>
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', color: '#fff', cursor: 'pointer', fontSize: '16px', padding: '6px 10px', flexShrink: 0 }}>✕</button>
          </div>

          {/* Status + quick chips */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <StatusPill status={gig.status} />
            <MetricChip icon="👁" value={gig.impressions} label="views" />
            <MetricChip icon="🖱" value={gig.clicks} label="clicks" />
            <MetricChip icon="♡" value={gig.saves} label="saves" />
            {gig.featured_until && new Date(gig.featured_until) > new Date() && (
              <span style={{ background: 'rgba(196,164,90,0.20)', color: '#C4A45A', border: '1px solid rgba(196,164,90,0.35)', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>⭐ Featured</span>
            )}
            {gig.boost_until && new Date(gig.boost_until) > new Date() && (
              <span style={{ background: 'rgba(196,164,90,0.20)', color: '#C4A45A', border: '1px solid rgba(196,164,90,0.35)', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>🚀 Boosted</span>
            )}
          </div>

          {/* Section tabs */}
          <div style={{ display: 'flex', gap: 0, marginTop: '14px', borderBottom: '1px solid rgba(255,255,255,0.08)', overflowX: 'auto' }}>
            {SECTIONS.map(s => (
              <button key={s} onClick={() => setActiveSection(s)} style={{ padding: '7px 14px', fontSize: '12px', fontWeight: activeSection === s ? 600 : 400, color: activeSection === s ? '#fff' : 'rgba(255,255,255,0.45)', background: 'none', border: 'none', borderBottom: activeSection === s ? '2px solid #C4A45A' : '2px solid transparent', cursor: 'pointer', whiteSpace: 'nowrap', textTransform: 'capitalize', fontFamily: sans }}>
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Drawer body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

          {/* OVERVIEW */}
          {activeSection === 'overview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Provider card */}
              <div style={{ background: '#F7F5F0', border: '1px solid #DDD8CE', borderRadius: '8px', padding: '14px 16px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#9097A8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>Provider</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '38px', height: '38px', borderRadius: '8px', background: PROVIDER_COLORS[gig.provider_type] || '#1B2D4F', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                    {(gig.provider?.name || '?')[0].toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '14px', color: '#1B2D4F' }}>{gig.provider?.name || 'Unknown'}</div>
                    <div style={{ fontSize: '12px', color: '#9097A8' }}>{gig.provider?.email}</div>
                  </div>
                  <span style={{ marginLeft: 'auto', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', background: gig.provider_type === 'attorney' ? '#EAF0F7' : '#F5F3FF', color: PROVIDER_COLORS[gig.provider_type] || '#1B2D4F' }}>
                    {gig.provider_type}
                  </span>
                </div>
              </div>

              {/* Key details grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                {[
                  ['Category', gig.category || '—'],
                  ['Subcategory', gig.subcategory || '—'],
                  ['Content Score', gig.content_score != null ? `${gig.content_score}/100` : '—'],
                  ['CTR', `${gig.ctr}%`],
                  ['Created', ago(gig.created_at)],
                  ['Last Updated', ago(gig.updated_at)],
                  ['Featured Until', gig.featured_until ? new Date(gig.featured_until).toLocaleDateString('en-GB') : 'Not featured'],
                  ['Boost Until', gig.boost_until ? new Date(gig.boost_until).toLocaleDateString('en-GB') : 'Not boosted'],
                ].map(([l, v]) => (
                  <div key={l} style={{ background: '#F7F5F0', border: '1px solid #DDD8CE', borderRadius: '7px', padding: '10px 12px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: '#9097A8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{l}</div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#1B2D4F', marginTop: '3px' }}>{v}</div>
                  </div>
                ))}
              </div>

              {/* Tags */}
              {gig.tags?.length > 0 && (
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#9097A8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Tags</div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {gig.tags.map(t => <span key={t} style={{ padding: '3px 8px', borderRadius: '4px', background: '#F2EFE9', border: '1px solid #DDD8CE', fontSize: '12px', color: '#5C6070' }}>{t}</span>)}
                  </div>
                </div>
              )}

              {/* Gallery preview */}
              {gig.gallery_images?.length > 0 && (
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#9097A8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Gallery ({gig.gallery_images.length} image{gig.gallery_images.length !== 1 ? 's' : ''})</div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {gig.gallery_images.slice(0, 4).map((img, i) => {
                      const url = typeof img === 'string' ? img : img?.url
                      return url ? <img key={i} src={url} alt="" style={{ width: '72px', height: '72px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #DDD8CE' }} /> : null
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* CONTENT */}
          {activeSection === 'content' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {gig.pitch && (
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#9097A8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Pitch / Tagline</div>
                  <p style={{ margin: 0, fontSize: '14px', color: '#1B2D4F', lineHeight: 1.6, fontStyle: 'italic', background: '#F7F5F0', border: '1px solid #DDD8CE', borderRadius: '7px', padding: '12px 14px' }}>{gig.pitch}</p>
                </div>
              )}
              {gig.description && (
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#9097A8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Description ({gig.description.length} chars)</div>
                  <p style={{ margin: 0, fontSize: '13px', color: '#5C6070', lineHeight: 1.7, maxHeight: '240px', overflowY: 'auto', background: '#F7F5F0', border: '1px solid #DDD8CE', borderRadius: '7px', padding: '12px 14px', whiteSpace: 'pre-wrap' }}>{gig.description}</p>
                </div>
              )}
              {gig.requirements && (
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#9097A8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Requirements</div>
                  <p style={{ margin: 0, fontSize: '13px', color: '#5C6070', lineHeight: 1.6, background: '#F7F5F0', border: '1px solid #DDD8CE', borderRadius: '7px', padding: '12px 14px', whiteSpace: 'pre-wrap' }}>{gig.requirements}</p>
                </div>
              )}
              {gig.faq?.length > 0 && (
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#9097A8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>FAQ ({gig.faq.length} items)</div>
                  {gig.faq.map((f, i) => (
                    <div key={i} style={{ marginBottom: '8px', background: '#F7F5F0', border: '1px solid #DDD8CE', borderRadius: '7px', padding: '10px 14px' }}>
                      <div style={{ fontWeight: 600, fontSize: '13px', color: '#1B2D4F', marginBottom: '3px' }}>{f.q || f.question}</div>
                      <div style={{ fontSize: '12px', color: '#5C6070', lineHeight: 1.55 }}>{f.a || f.answer}</div>
                    </div>
                  ))}
                </div>
              )}
              {gig.seo_title && (
                <div style={{ background: '#F7F5F0', border: '1px solid #DDD8CE', borderRadius: '7px', padding: '12px 14px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: '#9097A8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>SEO</div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#1B2D4F', marginBottom: '3px' }}>{gig.seo_title}</div>
                  <div style={{ fontSize: '12px', color: '#5C6070' }}>{gig.seo_description}</div>
                </div>
              )}
            </div>
          )}

          {/* PRICING */}
          {activeSection === 'pricing' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {gig.tiers?.length === 0 ? (
                <p style={{ color: '#9097A8', fontSize: '13px' }}>No pricing tiers set.</p>
              ) : gig.tiers?.map(t => (
                <div key={t.id} style={{ background: '#F7F5F0', border: `1px solid ${t.is_active ? '#DDD8CE' : 'rgba(0,0,0,0.06)'}`, borderRadius: '8px', padding: '14px 16px', opacity: t.is_active ? 1 : 0.5 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                    <div>
                      <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9097A8' }}>{t.tier}</span>
                      <div style={{ fontWeight: 700, fontSize: '15px', color: '#1B2D4F' }}>{t.title}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 800, fontSize: '18px', color: '#1B2D4F' }}>{fmt(t.price)}</div>
                      {!t.is_active && <span style={{ fontSize: '11px', color: '#9097A8' }}>Inactive</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: '#5C6070' }}>
                    <span>🕐 {t.delivery_days}d delivery</span>
                    <span>🔄 {t.revisions === 0 ? 'Unlimited revisions' : `${t.revisions} revision${t.revisions !== 1 ? 's' : ''}`}</span>
                  </div>
                </div>
              ))}
              <div style={{ borderTop: '1px solid #DDD8CE', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#5C6070' }}>
                <span>Price range</span>
                <span style={{ fontWeight: 700, color: '#1B2D4F' }}>{gig.min_price === gig.max_price ? fmt(gig.min_price) : `${fmt(gig.min_price)} – ${fmt(gig.max_price)}`}</span>
              </div>
            </div>
          )}

          {/* METRICS */}
          {activeSection === 'metrics' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                {[
                  { label: 'Impressions', value: gig.impressions, icon: '👁', color: '#1B2D4F' },
                  { label: 'Clicks', value: gig.clicks, icon: '🖱', color: '#1B2D4F' },
                  { label: 'Saves / Favourites', value: gig.saves, icon: '♡', color: '#9A7B3B' },
                  { label: 'Click-Through Rate', value: `${gig.ctr}%`, icon: '📊', color: '#1A6B45' },
                  { label: 'Content Score', value: gig.content_score != null ? `${gig.content_score}/100` : '—', icon: '📋', color: gig.content_score >= 80 ? '#1A6B45' : gig.content_score >= 50 ? '#8B5E0A' : '#8B1A1A' },
                  { label: 'Active Tiers', value: gig.tiers?.filter(t => t.is_active).length || 0, icon: '🏷', color: '#1B2D4F' },
                ].map(m => (
                  <div key={m.label} style={{ background: '#F7F5F0', border: '1px solid #DDD8CE', borderRadius: '8px', padding: '14px 16px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#9097A8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>{m.icon} {m.label}</div>
                    <div style={{ fontWeight: 800, fontSize: '22px', color: m.color, fontVariantNumeric: 'tabular-nums' }}>{m.value ?? '—'}</div>
                  </div>
                ))}
              </div>
              {/* Content score bar */}
              {gig.content_score != null && (
                <div style={{ background: '#F7F5F0', border: '1px solid #DDD8CE', borderRadius: '8px', padding: '14px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#5C6070' }}>Profile Completeness</span>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#1B2D4F' }}>{gig.content_score}%</span>
                  </div>
                  <div style={{ height: '8px', borderRadius: '4px', background: '#E8E4DC', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${gig.content_score}%`, background: gig.content_score >= 75 ? '#1A6B45' : gig.content_score >= 50 ? '#8B5E0A' : '#8B1A1A', borderRadius: '4px', transition: 'width 0.4s' }} />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* MODERATION */}
          {activeSection === 'moderation' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {gig.status === 'suspended' && (
                <div style={{ background: '#FEF5E4', border: '1px solid rgba(139,94,10,0.25)', borderRadius: '8px', padding: '14px 16px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#7A4D08', marginBottom: '4px' }}>Suspension Details</div>
                  <div style={{ fontSize: '13px', color: '#5C6070', lineHeight: 1.55, marginBottom: '6px' }}>{gig.gig_status_reason || 'No reason recorded.'}</div>
                  {gig.suspended_at && <div style={{ fontSize: '11px', color: '#9097A8' }}>Suspended {ago(gig.suspended_at)}{gig.suspended_by_name ? ` by ${gig.suspended_by_name}` : ''}</div>}
                </div>
              )}

              <div style={{ background: '#F7F5F0', border: '1px solid #DDD8CE', borderRadius: '8px', padding: '14px 16px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#9097A8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>Moderation Actions</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {gig.status !== 'suspended' && gig.status !== 'deleted' && (
                    <button onClick={() => onAction('suspend', gig)} style={{ padding: '9px 14px', borderRadius: '6px', border: '1px solid rgba(139,94,10,0.30)', background: '#FEF5E4', color: '#7A4D08', cursor: 'pointer', fontSize: '13px', fontWeight: 600, textAlign: 'left', fontFamily: sans }}>
                      ⚠ Suspend Service — hide from marketplace
                    </button>
                  )}
                  {gig.status === 'suspended' && (
                    <button onClick={() => onAction('unsuspend', gig)} style={{ padding: '9px 14px', borderRadius: '6px', border: '1px solid rgba(26,107,69,0.30)', background: '#EAF5EE', color: '#1A6B45', cursor: 'pointer', fontSize: '13px', fontWeight: 600, textAlign: 'left', fontFamily: sans }}>
                      ✓ Unsuspend — restore to marketplace
                    </button>
                  )}
                  {gig.status !== 'archived' && gig.status !== 'deleted' && (
                    <button onClick={() => onAction('archive', gig)} style={{ padding: '9px 14px', borderRadius: '6px', border: '1px solid rgba(61,43,107,0.25)', background: '#EDEAF7', color: '#3D2B6B', cursor: 'pointer', fontSize: '13px', fontWeight: 600, textAlign: 'left', fontFamily: sans }}>
                      📦 Archive — remove but keep data
                    </button>
                  )}
                  {gig.status === 'deleted' && (
                    <button onClick={() => onAction('restore', gig)} style={{ padding: '9px 14px', borderRadius: '6px', border: '1px solid rgba(26,107,69,0.30)', background: '#EAF5EE', color: '#1A6B45', cursor: 'pointer', fontSize: '13px', fontWeight: 600, textAlign: 'left', fontFamily: sans }}>
                      ↩ Restore Deleted Gig
                    </button>
                  )}
                  <button onClick={() => onAction('promote', gig)} style={{ padding: '9px 14px', borderRadius: '6px', border: '1px solid rgba(154,123,59,0.30)', background: '#F5EDD6', color: '#7A6030', cursor: 'pointer', fontSize: '13px', fontWeight: 600, textAlign: 'left', fontFamily: sans }}>
                    ⭐ Boost / Feature (admin override)
                  </button>
                </div>
              </div>

              {/* Public gig link */}
              <a href={`/marketplace/gigs/${gig.slug}`} target="_blank" rel="noreferrer"
                style={{ display: 'block', padding: '9px 14px', borderRadius: '6px', border: '1px solid #DDD8CE', background: '#fff', color: '#1B2D4F', cursor: 'pointer', fontSize: '13px', fontWeight: 600, textDecoration: 'none', textAlign: 'left' }}>
                ↗ Preview public gig page
              </a>
            </div>
          )}

          {/* AUDIT LOG */}
          {activeSection === 'audit' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontSize: '12px', color: '#9097A8', marginBottom: '4px' }}>Last 5 admin actions on this service.</div>
              {!gig.audit_log?.length ? (
                <p style={{ color: '#9097A8', fontSize: '13px', padding: '16px', textAlign: 'center', background: '#F7F5F0', borderRadius: '8px' }}>No moderation history.</p>
              ) : gig.audit_log.map((entry, i) => (
                <div key={i} style={{ background: '#F7F5F0', border: '1px solid #DDD8CE', borderRadius: '7px', padding: '12px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 700, fontSize: '13px', color: '#1B2D4F', textTransform: 'capitalize' }}>{entry.action_type?.replace(/_/g, ' ')}</span>
                    <span style={{ fontSize: '11px', color: '#9097A8', flexShrink: 0 }}>{ago(entry.created_at)}</span>
                  </div>
                  {entry.reason && <div style={{ fontSize: '12px', color: '#5C6070', lineHeight: 1.5, fontStyle: 'italic' }}>"{entry.reason}"</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function AdminGigsManager({ formatPrimary }) {
  const [gigs, setGigs]             = React.useState([])
  const [loading, setLoading]       = React.useState(true)
  const [error, setError]           = React.useState('')
  const [notice, setNotice]         = React.useState({ type: '', msg: '' })
  const [selectedGig, setSelectedGig]     = React.useState(null)
  const [suspendTarget, setSuspendTarget] = React.useState(null)
  const [promoteTarget, setPromoteTarget] = React.useState(null)
  const [selectedRows, setSelectedRows]   = React.useState(new Set())
  const [sortCol, setSortCol]       = React.useState('created_at')
  const [sortDir, setSortDir]       = React.useState('desc')
  const [searchQ, setSearchQ]       = React.useState('')
  const [statusFilter, setStatusFilter]     = React.useState('all')
  const [typeFilter, setTypeFilter]         = React.useState('all')
  const [categoryFilter, setCategoryFilter] = React.useState('all')
  const [includeDeleted, setIncludeDeleted] = React.useState(false)
  const [localPage, setLocalPage]   = React.useState(1)
  const PER_PAGE = 20

  const flash = (type, msg) => { setNotice({ type, msg }); setTimeout(() => setNotice({ type: '', msg: '' }), 4000) }

  const load = React.useCallback(async () => {
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams()
      if (includeDeleted) params.set('include_deleted', 'true')
      const res  = await fetch(`/api/admin/gigs?${params}`, { credentials: 'same-origin' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error?.message || data?.error || 'Failed to load gigs')
      setGigs((data?.data?.gigs ?? data?.gigs) ?? [])
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [includeDeleted])

  React.useEffect(() => { load() }, [load])

  // Derived + filtered
  const allGigs = gigs

  const afterFilters = React.useMemo(() => {
    let out = [...allGigs]
    if (statusFilter !== 'all')   out = out.filter(g => g.status === statusFilter)
    if (typeFilter !== 'all')     out = out.filter(g => g.provider_type === typeFilter)
    if (categoryFilter !== 'all') out = out.filter(g => g.category === categoryFilter)
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase()
      out = out.filter(g =>
        g.title?.toLowerCase().includes(q) ||
        g.slug?.toLowerCase().includes(q) ||
        g.provider?.name?.toLowerCase().includes(q) ||
        g.provider?.email?.toLowerCase().includes(q) ||
        g.category?.toLowerCase().includes(q)
      )
    }
    out.sort((a, b) => {
      let av = a[sortCol] ?? '', bv = b[sortCol] ?? ''
      if (sortCol === 'min_price' || sortCol === 'impressions' || sortCol === 'clicks') { av = Number(av); bv = Number(bv) }
      if (typeof av === 'string') av = av.toLowerCase()
      if (typeof bv === 'string') bv = bv.toLowerCase()
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return out
  }, [allGigs, statusFilter, typeFilter, categoryFilter, searchQ, sortCol, sortDir])

  const totalPages  = Math.max(1, Math.ceil(afterFilters.length / PER_PAGE))
  const pagedGigs   = afterFilters.slice((localPage - 1) * PER_PAGE, localPage * PER_PAGE)
  const categories  = [...new Set(allGigs.map(g => g.category).filter(Boolean))].sort()

  const byStatus = React.useMemo(() => {
    const m = {}
    allGigs.forEach(g => { m[g.status] = (m[g.status] || 0) + 1 })
    return m
  }, [allGigs])

  const handleSort = col => { if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortCol(col); setSortDir('asc') }; setLocalPage(1) }
  const toggleRow = id => setSelectedRows(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleAll = () => setSelectedRows(prev => prev.size === pagedGigs.length ? new Set() : new Set(pagedGigs.map(g => g.id)))

  // Actions
  const moderate = async (gigId, action, reason = '') => {
    try {
      const res = await fetch(`/api/admin/gigs/${gigId}/moderate`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ action, reason }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error?.message || data?.error || 'Action failed')
      flash('ok', `Service ${action}d successfully.`)
      await load()
      setSelectedGig(g => g?.id === gigId ? { ...g, status: data?.data?.gig?.status ?? g.status } : g)
    } catch (e) { flash('err', e.message) }
  }

  const promote = async (gigId, type, days) => {
    try {
      const res = await fetch(`/api/admin/gigs/${gigId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ [type === 'boost' ? 'boost_days' : 'feature_days']: days, action_type: 'admin_promote' }) })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d?.error?.message || 'Promote failed') }
      flash('ok', `Service ${type}ed for ${days} days.`)
      await load()
    } catch (e) { flash('err', e.message) }
  }

  const bulkAction = async action => {
    if (!selectedRows.size) return
    await Promise.all([...selectedRows].map(id => moderate(id, action, action === 'suspend' ? 'Bulk admin action' : '')))
    setSelectedRows(new Set())
    flash('ok', `Bulk ${action} applied to ${selectedRows.size} service(s).`)
  }

  const handleDrawerAction = (action, gig) => {
    if (action === 'suspend')  { setSuspendTarget(gig); return }
    if (action === 'promote')  { setPromoteTarget(gig); return }
    moderate(gig.id, action)
  }

  const thStyle = col => ({ padding: '11px 13px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: sortCol === col ? '#C4A45A' : 'rgba(255,255,255,0.68)', background: '#1B2D4F', whiteSpace: 'nowrap', cursor: 'pointer', letterSpacing: '0.06em', textTransform: 'uppercase', borderBottom: '2px solid rgba(255,255,255,0.08)', userSelect: 'none', transition: 'color 0.12s' })
  const SortArrow = ({ col }) => sortCol !== col ? <span style={{ opacity: 0.25, marginLeft: '4px', fontSize: '10px' }}>⇅</span> : <span style={{ color: '#C4A45A', marginLeft: '4px', fontSize: '10px' }}>{sortDir === 'asc' ? '▲' : '▼'}</span>

  return (
    <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '22px', fontFamily: sans }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#9097A8', marginBottom: '4px' }}>Marketplace</div>
          <h2 style={{ fontFamily: serif, fontWeight: 600, fontSize: '32px', color: '#1B2D4F', margin: 0, letterSpacing: '-0.015em', lineHeight: 1.1 }}>Service Management</h2>
          <p style={{ color: '#9097A8', fontSize: '13px', margin: '5px 0 0' }}>Full admin control over all provider services on the marketplace.</p>
        </div>
        <button onClick={load} style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #DDD8CE', background: '#fff', color: '#1B2D4F', cursor: 'pointer', fontSize: '13px', fontWeight: 600, fontFamily: sans }}>↻ Refresh</button>
      </div>

      {/* Status summary bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px' }}>
        {[
          { key: 'all',       label: 'Total',     color: '#1B2D4F', count: allGigs.length },
          { key: 'active',    label: 'Active',    color: '#1A6B45', count: byStatus.active    || 0 },
          { key: 'draft',     label: 'Draft',     color: '#9A7B3B', count: byStatus.draft     || 0 },
          { key: 'suspended', label: 'Suspended', color: '#8B5E0A', count: byStatus.suspended || 0 },
          { key: 'archived',  label: 'Archived',  color: '#3D2B6B', count: byStatus.archived  || 0 },
        ].map(s => (
          <button key={s.key} onClick={() => { setStatusFilter(s.key); setLocalPage(1) }} style={{ padding: '12px 14px', borderRadius: '8px', border: `1px solid ${statusFilter === s.key ? s.color : '#DDD8CE'}`, background: statusFilter === s.key ? `${s.color}12` : '#fff', cursor: 'pointer', textAlign: 'left', fontFamily: sans, boxShadow: '0 1px 3px rgba(27,45,79,0.05)' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9097A8', marginBottom: '4px' }}>{s.label}</div>
            <div style={{ fontWeight: 800, fontSize: '22px', color: s.color, fontVariantNumeric: 'tabular-nums' }}>{loading ? '—' : s.count}</div>
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={searchQ} onChange={e => { setSearchQ(e.target.value); setLocalPage(1) }}
          placeholder="Search title, provider, category…"
          style={{ flex: '1 1 220px', maxWidth: '340px', padding: '8px 12px', borderRadius: '7px', border: '1px solid #DDD8CE', fontSize: '13px', fontFamily: sans, outline: 'none' }} />

        <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setLocalPage(1) }}
          style={{ padding: '8px 12px', borderRadius: '7px', border: '1px solid #DDD8CE', fontSize: '13px', fontFamily: sans, background: '#fff', cursor: 'pointer' }}>
          <option value="all">All types</option>
          <option value="attorney">Attorneys</option>
          <option value="consultant">Consultants</option>
        </select>

        <select value={categoryFilter} onChange={e => { setCategoryFilter(e.target.value); setLocalPage(1) }}
          style={{ padding: '8px 12px', borderRadius: '7px', border: '1px solid #DDD8CE', fontSize: '13px', fontFamily: sans, background: '#fff', cursor: 'pointer' }}>
          <option value="all">All categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#5C6070', cursor: 'pointer' }}>
          <input type="checkbox" checked={includeDeleted} onChange={e => setIncludeDeleted(e.target.checked)} style={{ accentColor: '#1B2D4F' }} />
          Show deleted
        </label>

        <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#9097A8' }}>
          {afterFilters.length} result{afterFilters.length !== 1 ? 's' : ''}
          {selectedRows.size > 0 && <span style={{ marginLeft: '8px', color: '#1B2D4F', fontWeight: 700 }}>· {selectedRows.size} selected</span>}
        </span>
      </div>

      {/* Bulk actions */}
      {selectedRows.size > 0 && (
        <div style={{ background: '#1B2D4F', borderRadius: '8px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>{selectedRows.size} selected</span>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button onClick={() => bulkAction('suspend')} style={{ padding: '6px 14px', borderRadius: '5px', border: '1px solid rgba(255,255,255,0.20)', background: 'rgba(255,255,255,0.08)', color: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: 600, fontFamily: sans }}>⚠ Bulk Suspend</button>
            <button onClick={() => bulkAction('archive')} style={{ padding: '6px 14px', borderRadius: '5px', border: '1px solid rgba(255,255,255,0.20)', background: 'rgba(255,255,255,0.08)', color: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: 600, fontFamily: sans }}>📦 Bulk Archive</button>
            <button onClick={() => setSelectedRows(new Set())} style={{ padding: '6px 14px', borderRadius: '5px', border: '1px solid rgba(255,255,255,0.20)', background: 'transparent', color: 'rgba(255,255,255,0.55)', cursor: 'pointer', fontSize: '12px', fontFamily: sans }}>Clear</button>
          </div>
        </div>
      )}

      {/* Notice */}
      {notice.msg && (
        <div style={{ padding: '10px 16px', borderRadius: '7px', fontSize: '13px', fontWeight: 600, background: notice.type === 'ok' ? '#EAF5EE' : '#FAEAEA', color: notice.type === 'ok' ? '#1A6B45' : '#8B1A1A', border: `1px solid ${notice.type === 'ok' ? 'rgba(26,107,69,0.20)' : 'rgba(139,26,26,0.20)'}`, display: 'flex', alignItems: 'center', gap: '8px' }}>
          {notice.type === 'ok' ? '✓' : '!'} {notice.msg}
        </div>
      )}

      {/* Table */}
      {error ? (
        <div style={{ background: '#FAEAEA', border: '1px solid rgba(139,26,26,0.20)', borderRadius: '8px', padding: '20px', fontSize: '14px', color: '#8B1A1A' }}>
          {error} — <button onClick={load} style={{ background: 'none', border: 'none', color: '#8B1A1A', cursor: 'pointer', textDecoration: 'underline', fontSize: '13px' }}>Retry</button>
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #DDD8CE', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(27,45,79,0.06)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle(''), width: '40px', cursor: 'default', padding: '11px 10px 11px 16px' }}>
                    <input type="checkbox" checked={pagedGigs.length > 0 && selectedRows.size === pagedGigs.length} onChange={toggleAll} style={{ width: '14px', height: '14px', cursor: 'pointer', accentColor: '#C4A45A' }} />
                  </th>
                  {[
                    { col: 'title',         label: 'Service' },
                    { col: 'provider_type', label: 'Type' },
                    { col: 'status',        label: 'Status' },
                    { col: 'category',      label: 'Category', muted: true },
                    { col: 'min_price',     label: 'From' },
                    { col: 'tier_count',    label: 'Tiers' },
                    { col: 'impressions',   label: 'Views' },
                    { col: 'clicks',        label: 'Clicks' },
                    { col: 'content_score', label: 'Score' },
                    { col: 'created_at',    label: 'Created' },
                  ].map(({ col, label }) => (
                    <th key={col} style={thStyle(col)} onClick={() => handleSort(col)}>
                      {label}<SortArrow col={col} />
                    </th>
                  ))}
                  <th style={{ ...thStyle(''), cursor: 'default' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [1,2,3,4,5].map(i => (
                    <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#FAFAF8' }}>
                      {Array.from({ length: 12 }).map((_, j) => (
                        <td key={j} style={{ padding: '14px 13px' }}>
                          <div style={{ height: '14px', background: '#F2EFE9', borderRadius: '3px', width: j === 0 ? '100%' : '60%' }} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : pagedGigs.length === 0 ? (
                  <tr><td colSpan={12} style={{ padding: '48px', textAlign: 'center', color: '#9097A8', fontSize: '14px' }}>No services match the current filters.</td></tr>
                ) : pagedGigs.map((g, i) => {
                  const isSelected = selectedRows.has(g.id)
                  const rowBg = isSelected ? 'rgba(196,164,90,0.07)' : i % 2 === 0 ? '#fff' : '#FAFAF8'
                  return (
                    <tr key={g.id} style={{ background: rowBg, transition: 'background 80ms', cursor: 'default', borderBottom: '1px solid #F2EFE9' }}>
                      <td style={{ padding: '12px 10px 12px 16px' }}>
                        <input type="checkbox" checked={isSelected} onChange={() => toggleRow(g.id)} style={{ width: '14px', height: '14px', cursor: 'pointer', accentColor: '#C4A45A' }} />
                      </td>
                      <td style={{ padding: '12px 13px' }}>
                        <div style={{ fontWeight: 600, fontSize: '13px', color: '#1B2D4F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '220px' }} title={g.title}>{g.title || 'Untitled'}</div>
                        <div style={{ fontSize: '11px', color: '#9097A8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '220px' }}>{g.provider?.name || '—'}</div>
                      </td>
                      <td style={{ padding: '12px 13px' }}>
                        <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', background: g.provider_type === 'attorney' ? '#EAF0F7' : '#F5F3FF', color: PROVIDER_COLORS[g.provider_type] || '#1B2D4F' }}>
                          {g.provider_type === 'attorney' ? '⚖' : '👤'} {g.provider_type}
                        </span>
                      </td>
                      <td style={{ padding: '12px 13px' }}><StatusPill status={g.status} /></td>
                      <td style={{ padding: '12px 13px', fontSize: '12px', color: '#9097A8' }}>{g.category || '—'}</td>
                      <td style={{ padding: '12px 13px', fontWeight: 700, fontSize: '13px', color: '#1B2D4F', fontVariantNumeric: 'tabular-nums' }}>{g.min_price ? fmt(g.min_price) : '—'}</td>
                      <td style={{ padding: '12px 13px', fontSize: '13px', color: '#5C6070', textAlign: 'center' }}>{g.tier_count}</td>
                      <td style={{ padding: '12px 13px', fontSize: '13px', color: '#5C6070', fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>{g.impressions}</td>
                      <td style={{ padding: '12px 13px', fontSize: '13px', color: '#5C6070', fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>{g.clicks}</td>
                      <td style={{ padding: '12px 13px' }}>
                        {g.content_score != null ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div style={{ width: '40px', height: '5px', background: '#F2EFE9', borderRadius: '2px', overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${g.content_score}%`, background: g.content_score >= 75 ? '#1A6B45' : g.content_score >= 50 ? '#8B5E0A' : '#8B1A1A', borderRadius: '2px' }} />
                            </div>
                            <span style={{ fontSize: '12px', color: '#5C6070' }}>{g.content_score}%</span>
                          </div>
                        ) : <span style={{ color: '#9097A8', fontSize: '12px' }}>—</span>}
                      </td>
                      <td style={{ padding: '12px 13px', fontSize: '12px', color: '#9097A8', whiteSpace: 'nowrap' }}>{ago(g.created_at)}</td>
                      <td style={{ padding: '12px 13px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: '5px' }}>
                          <button onClick={() => setSelectedGig(g)} style={{ padding: '5px 10px', borderRadius: '5px', border: '1px solid #DDD8CE', background: '#F7F5F0', color: '#1B2D4F', cursor: 'pointer', fontSize: '12px', fontWeight: 600, fontFamily: sans }}>View</button>
                          {g.status !== 'suspended' && g.status !== 'deleted' && (
                            <button onClick={() => setSuspendTarget(g)} style={{ padding: '5px 10px', borderRadius: '5px', border: '1px solid rgba(139,94,10,0.30)', background: '#FEF5E4', color: '#7A4D08', cursor: 'pointer', fontSize: '12px', fontWeight: 600, fontFamily: sans }}>Suspend</button>
                          )}
                          {g.status === 'suspended' && (
                            <button onClick={() => moderate(g.id, 'unsuspend')} style={{ padding: '5px 10px', borderRadius: '5px', border: '1px solid rgba(26,107,69,0.30)', background: '#EAF5EE', color: '#1A6B45', cursor: 'pointer', fontSize: '12px', fontWeight: 600, fontFamily: sans }}>Restore</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              {pagedGigs.length > 0 && !loading && (
                <tfoot>
                  <tr style={{ background: '#F8F7F4', borderTop: '2px solid #DDD8CE' }}>
                    <td colSpan={5} style={{ padding: '9px 13px', fontSize: '12px', color: '#9097A8', fontWeight: 600 }}>
                      {(localPage - 1) * PER_PAGE + 1}–{Math.min(localPage * PER_PAGE, afterFilters.length)} of {afterFilters.length} services
                    </td>
                    <td colSpan={4} style={{ padding: '9px 13px', fontSize: '12px', color: '#1A6B45', fontWeight: 700 }}>
                      {afterFilters.filter(g => g.status === 'active').length} active
                    </td>
                    <td colSpan={3} style={{ padding: '9px 13px', fontSize: '12px', color: '#8B5E0A', fontWeight: 700 }}>
                      {afterFilters.filter(g => g.status === 'suspended').length} suspended
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid #F2EFE9', background: '#FAFAF8' }}>
              <button onClick={() => setLocalPage(p => Math.max(1, p - 1))} disabled={localPage === 1} style={{ padding: '6px 14px', borderRadius: '6px', border: '1px solid #DDD8CE', background: localPage === 1 ? '#F7F5F0' : '#fff', color: localPage === 1 ? '#9097A8' : '#1B2D4F', cursor: localPage === 1 ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: 600, fontFamily: sans }}>← Prev</button>
              <div style={{ display: 'flex', gap: '4px' }}>
                {Array.from({ length: totalPages }, (_, i) => i + 1).filter(p => p === 1 || p === totalPages || Math.abs(p - localPage) <= 1).reduce((acc, p, idx, arr) => { if (idx > 0 && p - arr[idx - 1] > 1) acc.push('…'); acc.push(p); return acc }, []).map((p, i) =>
                  p === '…' ? <span key={`e${i}`} style={{ padding: '6px 4px', color: '#9097A8', fontSize: '13px' }}>…</span>
                  : <button key={p} onClick={() => setLocalPage(p)} style={{ width: '32px', height: '32px', borderRadius: '6px', border: `1px solid ${p === localPage ? '#1B2D4F' : '#DDD8CE'}`, background: p === localPage ? '#1B2D4F' : '#fff', color: p === localPage ? '#fff' : '#1B2D4F', cursor: 'pointer', fontSize: '13px', fontWeight: p === localPage ? 700 : 400, fontFamily: sans }}>{p}</button>
                )}
              </div>
              <button onClick={() => setLocalPage(p => Math.min(totalPages, p + 1))} disabled={localPage === totalPages} style={{ padding: '6px 14px', borderRadius: '6px', border: '1px solid #DDD8CE', background: localPage === totalPages ? '#F7F5F0' : '#fff', color: localPage === totalPages ? '#9097A8' : '#1B2D4F', cursor: localPage === totalPages ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: 600, fontFamily: sans }}>Next →</button>
            </div>
          )}
        </div>
      )}

      {/* Modals + drawer */}
      {selectedGig && <GigDrawer gig={selectedGig} onClose={() => setSelectedGig(null)} onAction={handleDrawerAction} formatPrimary={formatPrimary} />}
      {suspendTarget && <SuspendModal gig={suspendTarget} onClose={() => setSuspendTarget(null)} onConfirm={async (id, reason) => { await moderate(id, 'suspend', reason); setSuspendTarget(null) }} />}
      {promoteTarget && <PromoteModal gig={promoteTarget} onClose={() => setPromoteTarget(null)} onConfirm={async (id, type, days) => { await promote(id, type, days); setPromoteTarget(null) }} />}
    </div>
  )
}
