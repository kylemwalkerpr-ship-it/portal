'use client'
import React from 'react'
import { Card, Btn, Badge, Avatar } from './shared'
import IntakeForm from './inquiry-intake-form'
import ChatSidePane from '../marketplace/ChatSidePane'

/**
 * Student → Find an Attorney (Fiverr-grade).
 *
 * Server-side paginated, FTS-searchable, multi-filtered directory. Replaces
 * the prior load-everything-then-client-filter pattern so the directory
 * scales to hundreds of attorneys without UI lag.
 */

const NAVY='#0F172A', GOLD='#9A7B3B', GREEN='#1A6B45', RED='#8B1A1A', AMBER='#8B5E0A', CYAN='#0E7C8E', PURPLE='#3D2B6B'
const BG='#F7F5F0', SURFACE='#FFFFFF', SURFACE2='#FAFAF7', BORDER='#DDD8CE', BORDER2='#F2EFE9', TEXT='#1A1F2E', MUTED='#5C6070', DIM='#9097A8'
const SERIF=`'Cormorant Garamond', Georgia, serif`
const SANS=`-apple-system, BlinkMacSystemFont, 'Inter', sans-serif`
const MONO=`'SF Mono', Menlo, Consolas, monospace`
const PAGE_SIZE = 24

const fmtN = n => Number(n ?? 0).toLocaleString('en-US')
// starting_price is stored in cents (DB contract — see AttorneyIntakeWizard
// where dollars × 100 is persisted). Divide back to dollars before display.
const fmtPrice = n => n ? `$${Number(n / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '—'
const initials = name => String(name || '').split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase() || '').join('')

function Stars({ value, size = 13 }) {
  const v = Number(value || 0)
  const full = Math.floor(v)
  const half = v - full >= 0.5
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: size, color: AMBER, lineHeight: 1 }}>
      {'★'.repeat(full)}{half ? '☆' : ''}{'☆'.repeat(Math.max(0, 5 - full - (half ? 1 : 0)))}
    </span>
  )
}

function ChipRow({ label, options, value, onChange }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: DIM, fontFamily: MONO, marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button onClick={() => onChange('')} style={chipStyle(value === '')}>Any</button>
        {options.map(o => (
          <button key={o} onClick={() => onChange(o)} style={chipStyle(value === o)}>{o}</button>
        ))}
      </div>
    </div>
  )
}

const chipStyle = (active) => ({
  padding: '5px 11px', borderRadius: 999, fontSize: 12, fontFamily: SANS, fontWeight: 600,
  border: `1px solid ${active ? CYAN : BORDER}`,
  background: active ? `${CYAN}15` : SURFACE,
  color: active ? CYAN : MUTED, cursor: 'pointer',
})

export default function StudentFindAttorney() {
  const [intakeFor, setIntakeFor] = React.useState(null) // {id, name}
  const [openId, setOpenId] = React.useState(null)
  const [chatFor, setChatFor] = React.useState(null) // {id, name, avatar}

  // Filters
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

  // State
  const [attorneys, setAttorneys] = React.useState([])
  const [total, setTotal] = React.useState(0)
  const [totalPages, setTotalPages] = React.useState(1)
  const [hasMore, setHasMore] = React.useState(false)
  const [facets, setFacets] = React.useState({ jurisdictions: [], practice_areas: [], languages: [], credentials: [] })
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')

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
      setError(e.message || 'Failed to load attorneys.')
    } finally {
      setLoading(false)
    }
  }, [debouncedQ, jurisdiction, practiceArea, language, credential, availableOnly, freeOnly, minRating, sort, page])

  React.useEffect(() => { load() }, [load])

  if (intakeFor) {
    return (
      <IntakeForm
        targetAttorney={intakeFor}
        onCancel={() => setIntakeFor(null)}
        onSubmitted={() => {
          setIntakeFor(null); setOpenId(null)
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('yousafe-navigate', { detail: { page: 'inquiries' } }))
          }
        }}
      />
    )
  }

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
    <div style={{ padding: '24px 28px 60px', display: 'flex', flexDirection: 'column', gap: 18, fontFamily: SANS, background: BG, minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.16em', color: GOLD, textTransform: 'uppercase', fontFamily: MONO, marginBottom: 4 }}>Attorney panel</div>
          <h1 style={{ fontFamily: SERIF, fontSize: 32, fontWeight: 500, color: TEXT, margin: 0, letterSpacing: '-.012em' }}>Find an attorney.</h1>
          <div style={{ fontSize: 13, color: MUTED, marginTop: 4 }}>
            {loading ? 'Searching…' : <>{fmtN(total)} {total === 1 ? 'attorney matches' : 'attorneys match'} your filters.</>}
          </div>
        </div>
        <Btn variant="secondary" size="sm" onClick={() => setShowFilters(v => !v)}>
          {showFilters ? 'Hide' : 'Show'} filters
        </Btn>
      </div>

      <div className="yousafe-mobile-stack" style={{ display: 'grid', gridTemplateColumns: showFilters ? '280px 1fr' : '1fr', gap: 18 }}>
        {/* Filter sidebar */}
        {showFilters && (
          <aside style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 16, display: 'flex', flexDirection: 'column', gap: 16, alignSelf: 'flex-start', position: 'sticky', top: 18 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: DIM, fontFamily: MONO, marginBottom: 6 }}>Search</div>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: DIM, fontSize: 13 }}>🔍</span>
                <input
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                  placeholder="Name, expertise, bio…"
                  style={{ width: '100%', padding: '8px 12px 8px 32px', fontSize: 13, border: `1px solid ${BORDER}`, borderRadius: 6, background: BG, color: TEXT, fontFamily: SANS, boxSizing: 'border-box' }}
                />
              </div>
            </div>

            <ChipRow label="Sort" options={[
              { v: 'rating', l: 'Top rated' }, { v: 'experience', l: 'Most experienced' },
              { v: 'newest', l: 'Newest' }, { v: 'price_low', l: 'Price ↑' }, { v: 'price_high', l: 'Price ↓' }, { v: 'name', l: 'A → Z' },
            ].map(s => s.v)} value={sort} onChange={v => { setSort(v || 'rating'); setPage(1) }} />

            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: DIM, fontFamily: MONO, marginBottom: 6 }}>Availability</div>
              <label style={checkboxLabel}>
                <input type="checkbox" checked={availableOnly} onChange={e => { setAvailableOnly(e.target.checked); setPage(1) }} /> Available now
              </label>
              <label style={checkboxLabel}>
                <input type="checkbox" checked={freeOnly} onChange={e => { setFreeOnly(e.target.checked); setPage(1) }} /> Free consultation
              </label>
            </div>

            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: DIM, fontFamily: MONO, marginBottom: 6 }}>Minimum rating</div>
              <div style={{ display: 'flex', gap: 4 }}>
                {[0, 3, 4, 4.5].map(r => (
                  <button key={r} onClick={() => { setMinRating(r); setPage(1) }} style={chipStyle(minRating === r)}>
                    {r === 0 ? 'Any' : `${r}★`}
                  </button>
                ))}
              </div>
            </div>

            {facets.credentials.length > 0 && (
              <ChipRow label="Credential" options={facets.credentials} value={credential} onChange={v => { setCredential(v); setPage(1) }} />
            )}
            {facets.jurisdictions.length > 0 && (
              <ChipRow label="Jurisdiction" options={facets.jurisdictions} value={jurisdiction} onChange={v => { setJurisdiction(v); setPage(1) }} />
            )}
            {facets.practice_areas.length > 0 && (
              <ChipRow label="Practice area" options={facets.practice_areas} value={practiceArea} onChange={v => { setPracticeArea(v); setPage(1) }} />
            )}
            {facets.languages.length > 0 && (
              <ChipRow label="Language" options={facets.languages} value={language} onChange={v => { setLanguage(v); setPage(1) }} />
            )}

            {activeFilters.length > 0 && (
              <button onClick={reset} style={{ background: 'none', border: `1px solid ${BORDER}`, borderRadius: 6, color: MUTED, padding: '6px 12px', fontSize: 12, fontWeight: 600, fontFamily: SANS, cursor: 'pointer' }}>
                ↺ Reset filters
              </button>
            )}
          </aside>
        )}

        {/* Results */}
        <main style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Active filter chips */}
          {activeFilters.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {activeFilters.map((f, i) => (
                <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: `${CYAN}15`, color: CYAN, fontSize: 11, fontWeight: 700, borderRadius: 999, border: `1px solid ${CYAN}33` }}>
                  {f.k}: {f.v}
                  <button onClick={f.clear} style={{ background: 'none', border: 'none', color: CYAN, cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
                </span>
              ))}
            </div>
          )}

          {error && (
            <div style={{ background: `${RED}10`, border: `1px solid ${RED}33`, borderRadius: 10, padding: 14, display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: RED, fontSize: 13 }}>{error}</span>
              <Btn variant="secondary" size="sm" onClick={load}>Retry</Btn>
            </div>
          )}

          {loading && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
              {[1, 2, 3, 4].map(i => (
                <Card key={i} style={{ padding: 18, minHeight: 220, opacity: 0.6 }}>
                  <div style={{ width: 56, height: 56, borderRadius: '50%', background: BORDER2, marginBottom: 12, animation: 'pulse 1.5s ease-in-out infinite' }} />
                  <div style={{ height: 16, background: BORDER2, borderRadius: 4, marginBottom: 8, width: '70%' }} />
                  <div style={{ height: 12, background: '#F7F5F0', borderRadius: 4, marginBottom: 6, width: '90%' }} />
                  <div style={{ height: 12, background: '#F7F5F0', borderRadius: 4, width: '60%' }} />
                </Card>
              ))}
            </div>
          )}

          {!loading && !error && attorneys.length === 0 && (
            <Card style={{ padding: 40, textAlign: 'center' }}>
              <div style={{ fontSize: 38, marginBottom: 10 }}>⚖️</div>
              <div style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 600, color: TEXT, marginBottom: 4 }}>No attorneys match these filters</div>
              <div style={{ fontSize: 13, color: MUTED, marginBottom: 14 }}>Try removing a filter or broadening your search.</div>
              {activeFilters.length > 0 && <Btn variant="secondary" size="sm" onClick={reset}>Reset filters</Btn>}
            </Card>
          )}

          {!loading && !error && attorneys.length > 0 && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
                {attorneys.map(a => (
                  <AttorneyCard key={a.id} attorney={a} onOpen={() => setOpenId(a.id)} onContact={() => setChatFor({ id: a.id, name: a.full_name, avatar: a.headshot_url })} />
                ))}
              </div>

              {totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderTop: `1px solid ${BORDER}` }}>
                  <span style={{ fontSize: 12, color: MUTED, fontFamily: MONO }}>
                    {fmtN((page - 1) * PAGE_SIZE + 1)}–{fmtN(Math.min(page * PAGE_SIZE, total))} of {fmtN(total)}
                  </span>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <Btn variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>← Prev</Btn>
                    <span style={{ fontFamily: MONO, fontSize: 12, color: TEXT, padding: '4px 10px' }}>Page {page} / {totalPages}</span>
                    <Btn variant="ghost" size="sm" disabled={!hasMore} onClick={() => setPage(p => p + 1)}>Next →</Btn>
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* Detail drawer */}
      {openId && (
        <AttorneyDrawer
          attorneyId={openId}
          attorneyFallback={attorneys.find(a => a.id === openId) || null}
          onClose={() => setOpenId(null)}
          onContact={att => { setIntakeFor({ id: att.id, name: att.full_name }) }}
          onChat={att => { setChatFor({ id: att.id, name: att.full_name, avatar: att.headshot_url }) }}
        />
      )}

      <ChatSidePane
        open={!!chatFor}
        onClose={() => setChatFor(null)}
        attorneyId={chatFor?.id}
        attorneyName={chatFor?.name}
        attorneyAvatar={chatFor?.avatar}
      />
    </div>
  )
}

function AttorneyCard({ attorney, onOpen, onContact }) {
  const [hover, setHover] = React.useState(false)
  return (
    <Card
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onOpen}
      style={{
        padding: 18, cursor: 'pointer', position: 'relative',
        boxShadow: hover ? '0 4px 16px rgba(27,45,79,0.10)' : '0 1px 3px rgba(27,45,79,0.05)',
        borderColor: hover ? '#C8C2B6' : BORDER,
        transition: 'box-shadow .15s, border-color .15s',
        minHeight: 240, display: 'flex', flexDirection: 'column', gap: 10,
      }}>
      {!attorney.available && (
        <div style={{ position: 'absolute', top: 12, right: 12 }}>
          <Badge color="gray" style={{ fontSize: 10 }}>Unavailable</Badge>
        </div>
      )}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        {attorney.headshot_url
          ? <img src={attorney.headshot_url} alt={attorney.full_name || ''} style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', border: `1px solid ${BORDER}` }} />
          : <div style={{ width: 56, height: 56, borderRadius: '50%', background: `${NAVY}10`, color: NAVY, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 18, fontFamily: SERIF }}>{initials(attorney.full_name)}</div>}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 18, color: TEXT, lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{attorney.full_name}</div>
          {attorney.rating_avg !== null
            ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <Stars value={attorney.rating_avg} />
                <span style={{ fontSize: 12, color: TEXT, fontWeight: 700, fontFamily: MONO }}>{attorney.rating_avg}</span>
                <span style={{ fontSize: 11, color: DIM, fontFamily: MONO }}>({attorney.rating_count})</span>
              </div>
            )
            : <div style={{ fontSize: 11, color: DIM, fontFamily: MONO, marginTop: 2 }}>No reviews yet</div>}
        </div>
      </div>

      {attorney.tagline && (
        <div style={{ fontSize: 13, color: TEXT, lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
          {attorney.tagline}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {attorney.credential_type && <Badge color="purple" style={{ fontSize: 10 }}>{attorney.credential_type}</Badge>}
        {attorney.jurisdictions && <Badge color="gray" style={{ fontSize: 10 }}>{attorney.jurisdictions.split(/[,;|]/)[0]?.trim()}</Badge>}
        {attorney.offers_free_consult && <Badge color="green" style={{ fontSize: 10 }}>Free consult</Badge>}
        {attorney.years_experience > 0 && <Badge color="cyan" style={{ fontSize: 10 }}>{attorney.years_experience}y exp</Badge>}
      </div>

      <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div>
          {attorney.starting_price > 0 && (
            <>
              <div style={{ fontSize: 10, color: DIM, fontFamily: MONO, textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>From</div>
              <div style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 600, color: TEXT, lineHeight: 1 }}>{fmtPrice(attorney.starting_price)}</div>
            </>
          )}
        </div>
        <Btn variant="primary" size="sm" onClick={e => { e.stopPropagation(); onContact() }}>Contact</Btn>
      </div>
    </Card>
  )
}

function AttorneyDrawer({ attorneyId, attorneyFallback, onClose, onContact, onChat }) {
  const [att, setAtt] = React.useState(attorneyFallback)
  const [loading, setLoading] = React.useState(!attorneyFallback)
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    if (!attorneyId) return
    setLoading(true); setError('')
    fetch(`/api/attorneys/${attorneyId}`, { credentials: 'same-origin' })
      .then(async r => {
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(d?.error || 'Could not load attorney')
        setAtt(d.attorney || attorneyFallback || null)
      })
      .catch(e => setError(e.message || 'Could not load attorney'))
      .finally(() => setLoading(false))
  }, [attorneyId, attorneyFallback])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', justifyContent: 'flex-end' }}>
      <button onClick={onClose} aria-label="Close" style={{ flex: 1, background: 'rgba(15,18,32,0.45)', border: 'none', cursor: 'pointer' }} />
      <aside style={{ width: 'min(560px, 100vw)', height: '100vh', background: BG, display: 'flex', flexDirection: 'column', borderLeft: `1px solid ${BORDER}`, boxShadow: '-24px 0 60px rgba(15,18,32,0.18)' }}>
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${BORDER}`, background: SURFACE, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1 }}>
            {att?.full_name && <h2 style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 600, color: TEXT, margin: 0, letterSpacing: '-.012em' }}>{att.full_name}</h2>}
            {att?.tagline && <div style={{ fontSize: 13, color: MUTED, marginTop: 4 }}>{att.tagline}</div>}
          </div>
          <button onClick={onClose} style={{ border: `1px solid ${BORDER}`, background: SURFACE, color: MUTED, borderRadius: 999, width: 32, height: 32, cursor: 'pointer', fontSize: 16 }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 120px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {loading && <div style={{ color: MUTED, fontSize: 13 }}>Loading…</div>}
          {error && <div style={{ color: RED, fontSize: 13 }}>{error}</div>}
          {att && (
            <>
              {/* Top stats */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {att.headshot_url
                  ? <img src={att.headshot_url} alt={att.full_name || ''} style={{ width: 84, height: 84, borderRadius: '50%', objectFit: 'cover', border: `1px solid ${BORDER}` }} />
                  : <div style={{ width: 84, height: 84, borderRadius: '50%', background: `${NAVY}10`, color: NAVY, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 26, fontFamily: SERIF }}>{initials(att.full_name)}</div>}
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {att.rating_avg !== null && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Stars value={att.rating_avg} size={16} />
                      <span style={{ fontWeight: 700, color: TEXT }}>{att.rating_avg}</span>
                      <span style={{ fontSize: 12, color: DIM }}>({att.rating_count} reviews)</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {att.credential_type && <Badge color="purple" style={{ fontSize: 10 }}>{att.credential_type}</Badge>}
                    {att.offers_free_consult && <Badge color="green" style={{ fontSize: 10 }}>Free consult</Badge>}
                    {!att.available && <Badge color="gray" style={{ fontSize: 10 }}>Unavailable</Badge>}
                    {att.years_experience > 0 && <Badge color="cyan" style={{ fontSize: 10 }}>{att.years_experience} years</Badge>}
                  </div>
                  {att.starting_price > 0 && (
                    <div style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 600, color: TEXT, lineHeight: 1 }}>From {fmtPrice(att.starting_price)}</div>
                  )}
                </div>
              </div>

              {att.intro && (
                <Field label="Introduction" body={att.intro} multiline />
              )}
              {att.bio && (
                <Field label="About" body={att.bio} multiline />
              )}
              <Field label="Jurisdictions"  body={att.jurisdictions} />
              <Field label="Practice areas" body={att.practice_areas} />
              {Array.isArray(att.specialties) && att.specialties.length > 0 && (
                <Field label="Specialties" body={att.specialties.join(' · ')} />
              )}
              {Array.isArray(att.languages) && att.languages.length > 0 && (
                <Field label="Languages" body={att.languages.join(' · ')} />
              )}
              {att.education && <Field label="Education" body={att.education} multiline />}
              {att.timezone && <Field label="Timezone" body={att.timezone} />}
            </>
          )}
        </div>

        {att && (
          <div style={{ padding: '14px 24px', borderTop: `1px solid ${BORDER}`, background: SURFACE, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Btn variant="primary" size="md" onClick={() => onContact(att)}>Start an inquiry</Btn>
            <Btn variant="secondary" size="md" onClick={() => onChat?.(att)}>💬 Chat now</Btn>
            {att.profile_url && <Btn variant="ghost" size="md" onClick={() => window.open(att.profile_url, '_blank', 'noopener,noreferrer')}>Profile ↗</Btn>}
          </div>
        )}
      </aside>
    </div>
  )
}

function Field({ label, body, multiline }) {
  if (!body) return null
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.10em', textTransform: 'uppercase', color: DIM, marginBottom: 4, fontFamily: MONO }}>{label}</div>
      <div style={{ fontSize: 13, color: TEXT, lineHeight: 1.6, whiteSpace: multiline ? 'pre-wrap' : 'normal' }}>{body}</div>
    </div>
  )
}

const checkboxLabel = {
  display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0',
  fontSize: 13, color: TEXT, fontFamily: SANS, cursor: 'pointer',
}
