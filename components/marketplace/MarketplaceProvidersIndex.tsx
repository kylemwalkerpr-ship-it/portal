// @ts-nocheck
'use client'
import React from 'react'
import Link from 'next/link'
import { Btn, Card, Badge } from '../design/shared'
import { T, F } from './tokens'
import { renderBioMarkdown } from '@/lib/bioMarkdown'

/**
 * /marketplace/providers — paginated, faceted provider directory.
 * Re-uses the /api/attorneys/search endpoint already built for the
 * student "Find an Attorney" page.
 */

const PAGE_SIZE = 24

const fmtN = n => Number(n ?? 0).toLocaleString('en-US')
// starting_price is stored in cents; divide for display.
const fmtPrice = n => n ? `$${Number(n / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '—'
const initials = name => String(name || '').split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase() || '').join('')

function Stars({ value, size = 13 }) {
  const v = Number(value || 0)
  const full = Math.floor(v)
  const half = v - full >= 0.5
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: size, color: T.star, lineHeight: 1 }}>
      {'★'.repeat(full)}{half ? '☆' : ''}{'☆'.repeat(Math.max(0, 5 - full - (half ? 1 : 0)))}
    </span>
  )
}

const chipStyle = (active) => ({
  padding: '5px 11px', borderRadius: 999, fontSize: 12, fontFamily: F.ui, fontWeight: 600,
  border: `1px solid ${active ? T.indigo : T.rule}`,
  background: active ? `${T.indigo}15` : T.vellum,
  color: active ? T.indigo : T.inkMid, cursor: 'pointer',
})

const selectStyle = {
  padding: '8px 10px', fontSize: 13, border: `1px solid ${T.rule}`, borderRadius: 6,
  background: T.paper, color: T.ink, fontFamily: F.ui, cursor: 'pointer',
}

const checkboxLabel = {
  display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0',
  fontSize: 13, color: T.ink, fontFamily: F.ui, cursor: 'pointer',
}

export function MarketplaceProvidersIndex() {
  const [searchInput, setSearchInput] = React.useState('')
  const [debouncedQ, setDebouncedQ] = React.useState('')
  const [jurisdiction, setJurisdiction] = React.useState('')
  const [practiceArea, setPracticeArea] = React.useState('')
  const [language, setLanguage] = React.useState('')
  const [credential, setCredential] = React.useState('')
  const [availableOnly, setAvailableOnly] = React.useState(true)
  const [freeOnly, setFreeOnly] = React.useState(false)
  const [minRating, setMinRating] = React.useState(0)
  const [sort, setSort] = React.useState('rating')
  const [page, setPage] = React.useState(1)
  const [showFilters, setShowFilters] = React.useState(true)

  const [attorneys, setAttorneys] = React.useState([])
  const [total, setTotal] = React.useState(0)
  const [totalPages, setTotalPages] = React.useState(1)
  const [hasMore, setHasMore] = React.useState(false)
  const [facets, setFacets] = React.useState({ jurisdictions: [], practice_areas: [], languages: [], credentials: [] })
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')

  // Right-side preview pane state
  const [selected, setSelected] = React.useState(null)

  // Lock body scroll while pane is open + close on Escape
  React.useEffect(() => {
    if (!selected) return
    const onEsc = (e) => e.key === 'Escape' && setSelected(null)
    document.addEventListener('keydown', onEsc)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onEsc)
      document.body.style.overflow = prev
    }
  }, [selected])

  React.useEffect(() => {
    const t = setTimeout(() => { setDebouncedQ(searchInput); setPage(1) }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const load = React.useCallback(async () => {
    setLoading(true); setError('')
    try {
      const p = new URLSearchParams()
      if (debouncedQ) p.set('q', debouncedQ)
      if (jurisdiction) p.set('jurisdiction', jurisdiction)
      if (practiceArea) p.set('practice_area', practiceArea)
      if (language) p.set('language', language)
      if (credential) p.set('credential', credential)
      if (availableOnly) p.set('available_only', 'true')
      if (freeOnly) p.set('free_consult_only', 'true')
      if (minRating > 0) p.set('min_rating', String(minRating))
      p.set('sort', sort)
      p.set('page', String(page))
      p.set('page_size', String(PAGE_SIZE))
      const r = await fetch(`/api/attorneys/search?${p}`, { credentials: 'same-origin' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error || `Failed (${r.status})`)
      setAttorneys(d.attorneys || [])
      setTotal(d.total || 0)
      setTotalPages(d.total_pages || 1)
      setHasMore(!!d.has_more)
      setFacets(d.facets || { jurisdictions: [], practice_areas: [], languages: [], credentials: [] })
    } catch (e) {
      setError(e.message || 'Failed to load providers.')
    } finally {
      setLoading(false)
    }
  }, [debouncedQ, jurisdiction, practiceArea, language, credential, availableOnly, freeOnly, minRating, sort, page])

  React.useEffect(() => { load() }, [load])

  const reset = () => {
    setSearchInput(''); setJurisdiction(''); setPracticeArea(''); setLanguage('')
    setCredential(''); setAvailableOnly(true); setFreeOnly(false); setMinRating(0); setSort('rating'); setPage(1)
  }

  const activeFilters = [
    debouncedQ && { k: 'Search', v: debouncedQ, clear: () => setSearchInput('') },
    jurisdiction && { k: 'Jurisdiction', v: jurisdiction, clear: () => setJurisdiction('') },
    practiceArea && { k: 'Practice', v: practiceArea, clear: () => setPracticeArea('') },
    language && { k: 'Language', v: language, clear: () => setLanguage('') },
    credential && { k: 'Credential', v: credential, clear: () => setCredential('') },
    !availableOnly && { k: 'Including unavailable', v: 'yes', clear: () => setAvailableOnly(true) },
    freeOnly && { k: 'Free consult', v: 'yes', clear: () => setFreeOnly(false) },
    minRating > 0 && { k: 'Min rating', v: `${minRating}★`, clear: () => setMinRating(0) },
  ].filter(Boolean)

  return (
    <div style={{ minHeight: '100vh', background: T.paper, fontFamily: F.ui, color: T.ink }}>
      <div style={{ width: 'min(1280px, calc(100vw - 32px))', margin: '0 auto', padding: '32px 0 64px' }}>
        {/* Breadcrumb */}
        <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: T.inkMid, fontFamily: F.mono }}>
          <Link href="/" style={{ color: T.indigo, textDecoration: 'none' }}>Marketplace</Link>
          <span>›</span>
          <span>Providers</span>
        </div>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12, marginBottom: 22 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.16em', color: T.gold, textTransform: 'uppercase', fontFamily: F.mono, marginBottom: 4 }}>Verified panel</div>
            <h1 style={{ fontFamily: F.display, fontSize: 36, fontWeight: 500, color: T.ink, margin: 0, letterSpacing: '-.012em' }}>All providers.</h1>
            <div style={{ fontSize: 14, color: T.inkMid, marginTop: 6 }}>
              {loading ? 'Searching the panel…' : <>{fmtN(total)} {total === 1 ? 'provider matches' : 'providers match'} your filters.</>}
            </div>
          </div>
          <Btn variant="secondary" size="sm" onClick={() => setShowFilters(v => !v)}>
            {showFilters ? 'Hide' : 'Show'} filters
          </Btn>
        </div>

        <div className="yousafe-mobile-stack" style={{ display: 'grid', gridTemplateColumns: showFilters ? '280px 1fr' : '1fr', gap: 18 }}>
          {/* Filter sidebar */}
          {showFilters && (
            <aside style={{ background: T.vellum, border: `1px solid ${T.rule}`, borderRadius: 10, padding: 16, display: 'flex', flexDirection: 'column', gap: 16, alignSelf: 'flex-start', position: 'sticky', top: 18 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: T.inkSoft, fontFamily: F.mono, marginBottom: 6 }}>Search</div>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: T.inkSoft, fontSize: 13 }}>🔍</span>
                  <input
                    value={searchInput}
                    onChange={e => setSearchInput(e.target.value)}
                    placeholder="Name, expertise, bio…"
                    style={{ width: '100%', padding: '8px 12px 8px 32px', fontSize: 13, border: `1px solid ${T.rule}`, borderRadius: 6, background: T.paper, color: T.ink, fontFamily: F.ui, boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: T.inkSoft, fontFamily: F.mono, marginBottom: 6 }}>Sort</div>
                <select value={sort} onChange={e => { setSort(e.target.value); setPage(1) }} style={{ ...selectStyle, width: '100%' }}>
                  <option value="rating">Top rated</option>
                  <option value="experience">Most experienced</option>
                  <option value="newest">Newest</option>
                  <option value="price_low">Price ↑</option>
                  <option value="price_high">Price ↓</option>
                  <option value="name">A → Z</option>
                </select>
              </div>

              <div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: T.inkSoft, fontFamily: F.mono, marginBottom: 6 }}>Availability</div>
                <label style={checkboxLabel}>
                  <input type="checkbox" checked={availableOnly} onChange={e => { setAvailableOnly(e.target.checked); setPage(1) }} /> Available now
                </label>
                <label style={checkboxLabel}>
                  <input type="checkbox" checked={freeOnly} onChange={e => { setFreeOnly(e.target.checked); setPage(1) }} /> Free consultation
                </label>
              </div>

              <div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: T.inkSoft, fontFamily: F.mono, marginBottom: 6 }}>Minimum rating</div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {[0, 3, 4, 4.5].map(r => (
                    <button key={r} onClick={() => { setMinRating(r); setPage(1) }} style={chipStyle(minRating === r)}>
                      {r === 0 ? 'Any' : `${r}★`}
                    </button>
                  ))}
                </div>
              </div>

              {facets.credentials.length > 0 && (
                <FacetChips label="Credential" options={facets.credentials} value={credential} onChange={v => { setCredential(v); setPage(1) }} />
              )}
              {facets.jurisdictions.length > 0 && (
                <FacetChips label="Jurisdiction" options={facets.jurisdictions} value={jurisdiction} onChange={v => { setJurisdiction(v); setPage(1) }} />
              )}
              {facets.practice_areas.length > 0 && (
                <FacetChips label="Practice area" options={facets.practice_areas} value={practiceArea} onChange={v => { setPracticeArea(v); setPage(1) }} />
              )}
              {facets.languages.length > 0 && (
                <FacetChips label="Language" options={facets.languages} value={language} onChange={v => { setLanguage(v); setPage(1) }} />
              )}

              {activeFilters.length > 0 && (
                <button onClick={reset} style={{ background: 'none', border: `1px solid ${T.rule}`, borderRadius: 6, color: T.inkMid, padding: '6px 12px', fontSize: 12, fontWeight: 600, fontFamily: F.ui, cursor: 'pointer' }}>
                  ↺ Reset filters
                </button>
              )}
            </aside>
          )}

          {/* Results */}
          <main style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {activeFilters.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {activeFilters.map((f, i) => (
                  <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: `${T.indigo}15`, color: T.indigo, fontSize: 11, fontWeight: 700, borderRadius: 999, border: `1px solid ${T.indigo}33` }}>
                    {f.k}: {f.v}
                    <button onClick={f.clear} style={{ background: 'none', border: 'none', color: T.indigo, cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
                  </span>
                ))}
              </div>
            )}

            {error && (
              <div style={{ background: `${T.brick}10`, border: `1px solid ${T.brick}33`, borderRadius: 10, padding: 14, display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: T.brick, fontSize: 13 }}>{error}</span>
                <Btn variant="secondary" size="sm" onClick={load}>Retry</Btn>
              </div>
            )}

            {loading && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
                {[1, 2, 3, 4].map(i => (
                  <Card key={i} style={{ padding: 18, minHeight: 220, opacity: 0.6 }}>
                    <div style={{ width: 56, height: 56, borderRadius: '50%', background: T.paper2, marginBottom: 12, animation: 'pulse 1.5s ease-in-out infinite' }} />
                    <div style={{ height: 16, background: T.paper2, borderRadius: 4, marginBottom: 8, width: '70%' }} />
                    <div style={{ height: 12, background: T.paper, borderRadius: 4, marginBottom: 6, width: '90%' }} />
                    <div style={{ height: 12, background: T.paper, borderRadius: 4, width: '60%' }} />
                  </Card>
                ))}
              </div>
            )}

            {!loading && !error && attorneys.length === 0 && (
              <Card style={{ padding: 40, textAlign: 'center' }}>
                <div style={{ fontSize: 38, marginBottom: 10 }}>⚖️</div>
                <div style={{ fontFamily: F.display, fontSize: 22, fontWeight: 600, color: T.ink, marginBottom: 4 }}>No providers match these filters</div>
                <div style={{ fontSize: 13, color: T.inkMid, marginBottom: 14 }}>Try removing a filter or broadening your search.</div>
                {activeFilters.length > 0 && <Btn variant="secondary" size="sm" onClick={reset}>Reset filters</Btn>}
              </Card>
            )}

            {!loading && !error && attorneys.length > 0 && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
                  {attorneys.map(a => <ProviderCard key={a.id} a={a} onSelect={() => setSelected(a)} />)}
                </div>
                {totalPages > 1 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderTop: `1px solid ${T.rule}` }}>
                    <span style={{ fontSize: 12, color: T.inkMid, fontFamily: F.mono }}>
                      {fmtN((page - 1) * PAGE_SIZE + 1)}–{fmtN(Math.min(page * PAGE_SIZE, total))} of {fmtN(total)}
                    </span>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <Btn variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>← Prev</Btn>
                      <span style={{ fontFamily: F.mono, fontSize: 12, color: T.ink, padding: '4px 10px' }}>Page {page} / {totalPages}</span>
                      <Btn variant="ghost" size="sm" disabled={!hasMore} onClick={() => setPage(p => p + 1)}>Next →</Btn>
                    </div>
                  </div>
                )}
              </>
            )}
          </main>
        </div>
      </div>
      <ProviderSidePane a={selected} onClose={() => setSelected(null)} />
    </div>
  )
}

function FacetChips({ label, options, value, onChange }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: T.inkSoft, fontFamily: F.mono, marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button onClick={() => onChange('')} style={chipStyle(value === '')}>Any</button>
        {options.map(o => (
          <button key={o} onClick={() => onChange(o)} style={chipStyle(value === o)}>{o}</button>
        ))}
      </div>
    </div>
  )
}

function ProviderCard({ a, onSelect }) {
  const [hover, setHover] = React.useState(false)
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{ all: 'unset', display: 'block', cursor: 'pointer', width: '100%' }}
      aria-label={`Open ${a.full_name} preview`}
    >
      <Card
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          padding: 18, cursor: 'pointer', position: 'relative',
          boxShadow: hover ? '0 4px 16px rgba(29,36,51,0.10)' : '0 1px 3px rgba(29,36,51,0.05)',
          borderColor: hover ? T.ruleSoft : T.rule,
          transition: 'box-shadow .15s, border-color .15s',
          minHeight: 240, display: 'flex', flexDirection: 'column', gap: 10,
        }}>
        {!a.available && (
          <div style={{ position: 'absolute', top: 12, right: 12 }}>
            <Badge color="gray" style={{ fontSize: 10 }}>Unavailable</Badge>
          </div>
        )}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {a.headshot_url
            ? <img src={a.headshot_url} alt={a.full_name || ''} style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', border: `1px solid ${T.rule}` }} />
            : <div style={{ width: 56, height: 56, borderRadius: '50%', background: `${T.indigo}10`, color: T.indigo, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 18, fontFamily: F.display }}>{initials(a.full_name)}</div>}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: F.display, fontWeight: 600, fontSize: 18, color: T.ink, lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.full_name}</div>
            {a.rating_avg !== null
              ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                  <Stars value={a.rating_avg} />
                  <span style={{ fontSize: 12, color: T.ink, fontWeight: 700, fontFamily: F.mono }}>{a.rating_avg}</span>
                  <span style={{ fontSize: 11, color: T.inkSoft, fontFamily: F.mono }}>({a.rating_count})</span>
                </div>
              )
              : <div style={{ fontSize: 11, color: T.inkSoft, fontFamily: F.mono, marginTop: 2 }}>No reviews yet</div>}
          </div>
        </div>

        {a.tagline && (
          <div style={{ fontSize: 13, color: T.ink, lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {a.tagline}
          </div>
        )}

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {a.credential_type && <Badge color="purple" style={{ fontSize: 10 }}>{a.credential_type}</Badge>}
          {a.jurisdictions && <Badge color="gray" style={{ fontSize: 10 }}>{a.jurisdictions.split(/[,;|]/)[0]?.trim()}</Badge>}
          {a.offers_free_consult && <Badge color="green" style={{ fontSize: 10 }}>Free consult</Badge>}
          {a.years_experience > 0 && <Badge color="cyan" style={{ fontSize: 10 }}>{a.years_experience}y exp</Badge>}
        </div>

        <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div>
            {a.starting_price > 0 && (
              <>
                <div style={{ fontSize: 10, color: T.inkSoft, fontFamily: F.mono, textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>From</div>
                <div style={{ fontFamily: F.display, fontSize: 18, fontWeight: 600, color: T.ink, lineHeight: 1 }}>{fmtPrice(a.starting_price)}</div>
              </>
            )}
          </div>
          <Btn variant="primary" size="sm">View profile →</Btn>
        </div>
      </Card>
    </button>
  )
}

function ProviderSidePane({ a, onClose }) {
  if (!a) return null
  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(15, 19, 30, 0.45)', backdropFilter: 'blur(2px)',
        }}
      />
      <aside
        role="dialog"
        aria-label={`${a.full_name} profile`}
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 201,
          width: 'min(520px, 100vw)', background: T.vellum,
          boxShadow: '-24px 0 60px -20px rgba(29,36,51,0.35)',
          display: 'flex', flexDirection: 'column',
          animation: 'cw-pane-in .2s ease-out',
          fontFamily: F.ui,
        }}
      >
        <style>{`@keyframes cw-pane-in { from { transform: translateX(40px); opacity: 0.5; } to { transform: translateX(0); opacity: 1; } }`}</style>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, padding: '18px 22px 14px', borderBottom: `1px solid ${T.rule}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
            {a.headshot_url
              ? <img src={a.headshot_url} alt={a.full_name || ''} style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', border: `1px solid ${T.rule}` }} />
              : <div style={{ width: 64, height: 64, borderRadius: '50%', background: `${T.indigo}10`, color: T.indigo, display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 22, fontFamily: F.display }}>{initials(a.full_name)}</div>}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: F.display, fontWeight: 600, fontSize: 22, color: T.ink, lineHeight: 1.15 }}>{a.full_name}</div>
              <div style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.inkSoft, marginTop: 4 }}>
                {a.credential_type || 'Licensed provider'}{a.jurisdictions ? ` · ${a.jurisdictions}` : ''}
              </div>
              {a.bar_number && (
                <div style={{ fontFamily: F.mono, fontSize: 11, color: T.inkMid, marginTop: 2 }}>
                  Bar / Reg #: <b style={{ color: T.ink }}>{a.bar_number}</b>
                </div>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ width: 36, height: 36, borderRadius: '50%', border: `1px solid ${T.rule}`, background: T.paper, color: T.ink, fontSize: 20, cursor: 'pointer', flexShrink: 0 }}
          >×</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '18px 22px 22px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {a.rating_avg !== null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: T.paper, border: `1px solid ${T.paper2}`, borderRadius: 10 }}>
              <Stars value={a.rating_avg} size={16} />
              <span style={{ fontFamily: F.mono, fontWeight: 700, fontSize: 14, color: T.ink }}>{a.rating_avg}</span>
              <span style={{ fontFamily: F.mono, fontSize: 12, color: T.inkSoft }}>({a.rating_count} {a.rating_count === 1 ? 'review' : 'reviews'})</span>
            </div>
          )}

          {a.tagline && (
            <p style={{ margin: 0, fontFamily: F.display, fontStyle: 'italic', fontSize: 17, lineHeight: 1.5, color: T.ink }}>
              "{a.tagline}"
            </p>
          )}

          {(a.practice_areas?.length > 0 || a.specialties?.length > 0) && (
            <div>
              <div style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: T.inkSoft, marginBottom: 8 }}>Specialties</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(a.practice_areas || []).map(p => <Badge key={`p-${p}`} color="purple" style={{ fontSize: 11 }}>{p}</Badge>)}
                {(a.specialties || []).slice(0, 8).map(s => <Badge key={`s-${s}`} color="gray" style={{ fontSize: 11 }}>{s}</Badge>)}
              </div>
            </div>
          )}

          {a.languages?.length > 0 && (
            <div>
              <div style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: T.inkSoft, marginBottom: 8 }}>Languages</div>
              <div style={{ fontSize: 13.5, color: T.ink }}>{a.languages.join(' · ')}</div>
            </div>
          )}

          {a.bio && (
            <div>
              <div style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: T.inkSoft, marginBottom: 8 }}>About</div>
              <div style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: T.ink }}>{renderBioMarkdown(a.bio)}</div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '14px 0', borderTop: `1px solid ${T.paper2}`, borderBottom: `1px solid ${T.paper2}` }}>
            {a.starting_price > 0 && (
              <div>
                <div style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: T.inkSoft, marginBottom: 4 }}>From</div>
                <div style={{ fontFamily: F.display, fontSize: 22, fontWeight: 600, color: T.ink, lineHeight: 1 }}>{fmtPrice(a.starting_price)}</div>
              </div>
            )}
            {a.years_experience > 0 && (
              <div>
                <div style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: T.inkSoft, marginBottom: 4 }}>Experience</div>
                <div style={{ fontFamily: F.display, fontSize: 22, fontWeight: 600, color: T.ink, lineHeight: 1 }}>{a.years_experience} yrs</div>
              </div>
            )}
          </div>
        </div>

        {/* Footer CTAs — prefer the SEO-friendly username slug when present */}
        <div style={{ padding: '14px 22px 18px', borderTop: `1px solid ${T.rule}`, display: 'flex', gap: 10, background: T.paper }}>
          <Link
            href={`/marketplace/providers/${a.username || a.profile_id || a.id}`}
            style={{ flex: 1, textDecoration: 'none' }}
          >
            <Btn variant="primary" size="md" style={{ width: '100%' }}>View full profile →</Btn>
          </Link>
          <Link
            href={`/marketplace/providers/${a.username || a.profile_id || a.id}`}
            style={{ textDecoration: 'none' }}
          >
            <Btn variant="secondary" size="md">All gigs</Btn>
          </Link>
        </div>
      </aside>
    </>
  )
}
