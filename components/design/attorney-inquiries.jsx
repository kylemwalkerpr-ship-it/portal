'use client'
import React from 'react'
import { Card, Btn, Badge } from './shared'
import { CountryChip } from './country-glyphs'
// Reuse the rich response thread + answer preview already in attorney.jsx
import { InquiryThread, AnswersPreview } from './attorney'

/**
 * Attorney → Inquiry Queue / My Inquiries (Fiverr-grade).
 *
 * Server-side paginated, faceted, sortable. Per-row competitive density
 * (how many attorneys have already responded), urgency, age, and a
 * targeted-to-me indicator. The same component renders both lanes via
 * the `mode` prop:
 *   mode="queue" → open inquiries the attorney can claim
 *   mode="mine"  → inquiries this attorney has already engaged
 */

const NAVY='#0F172A', GOLD='#9A7B3B', GREEN='#1A6B45', RED='#8B1A1A', AMBER='#8B5E0A', CYAN='#0E7C8E', PURPLE='#3D2B6B'
const BG='#F7F5F0', SURFACE='#FFFFFF', SURFACE2='#FAFAF7', BORDER='#DDD8CE', BORDER2='#F2EFE9', TEXT='#1A1F2E', MUTED='#5C6070', DIM='#9097A8'
const SERIF=`'Cormorant Garamond', Georgia, serif`
const SANS=`-apple-system, BlinkMacSystemFont, 'Inter', sans-serif`
const MONO=`'SF Mono', Menlo, Consolas, monospace`
const PAGE_SIZE = 25

const fmtN = n => Number(n ?? 0).toLocaleString('en-US')
const fmtRelative = s => {
  if (!s) return ''
  const ms = Date.now() - new Date(s).getTime()
  if (ms < 60_000) return 'just now'
  if (ms < 3600_000) return `${Math.floor(ms / 60_000)}m ago`
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`
  if (ms < 30 * 86_400_000) return `${Math.floor(ms / 86_400_000)}d ago`
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const URGENCY_COLORS = { urgent: RED, high: AMBER, normal: NAVY, low: MUTED }

const QUEUE_TABS = [
  { id: 'all',           label: 'All open' },
  { id: 'targeted',      label: 'Targeted to me' },
  { id: 'fresh',         label: 'Fresh (24h)' },
  { id: 'urgent',        label: 'Urgent' },
  { id: 'low_density',   label: 'Low competition' },
]

const MINE_TABS = [
  { id: 'all',         label: 'All engaged' },
  { id: 'pending',     label: 'Offer pending' },
  { id: 'converted',   label: 'Converted' },
  { id: 'closed',      label: 'Closed' },
]

function StatTile({ label, value, accent = NAVY, sub, onClick }) {
  return (
    <button type="button" onClick={onClick}
      style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 3, textAlign: 'left', fontFamily: SANS, cursor: onClick ? 'pointer' : 'default' }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: DIM, fontFamily: MONO }}>{label}</div>
      <div style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 26, color: accent, letterSpacing: '-.02em', fontVariantNumeric: 'tabular-nums', lineHeight: 1.05 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: MUTED, fontFamily: MONO }}>{sub}</div>}
    </button>
  )
}

export default function AttorneyInquiries({ mode = 'queue' }) {
  const isMine = mode === 'mine'

  const [openId, setOpenId] = React.useState(null)
  const [tab, setTab] = React.useState(isMine ? 'all' : 'all')
  const [page, setPage] = React.useState(1)
  const [searchInput, setSearchInput] = React.useState('')
  const [debouncedQ, setDebouncedQ] = React.useState('')
  const [country, setCountry] = React.useState('')
  const [caseType, setCaseType] = React.useState('')
  const [urgencyFilter, setUrgencyFilter] = React.useState('')
  const [sort, setSort] = React.useState(isMine ? 'created_at' : 'targeted')
  const [excludeEngaged, setExcludeEngaged] = React.useState(false)

  const [inquiries, setInquiries] = React.useState([])
  const [total, setTotal] = React.useState(0)
  const [totalPages, setTotalPages] = React.useState(1)
  const [hasMore, setHasMore] = React.useState(false)
  const [facets, setFacets] = React.useState({ countries: [], case_types: [], urgencies: [], tiers: [] })
  const [stats, setStats] = React.useState(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [schemaPending, setSchemaPending] = React.useState(false)

  // Deep-link: ?open=<id> auto-opens inquiry and strips param
  React.useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const openId = params.get('open')
    if (openId) {
      setOpenId(openId)
      params.delete('open')
      const url = new URL(window.location.href)
      url.search = params.toString()
      window.history.replaceState({}, '', url.toString())
    }
  }, [])

  React.useEffect(() => {
    const t = setTimeout(() => { setDebouncedQ(searchInput); setPage(1) }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  // Reset on mode change
  React.useEffect(() => { setTab('all'); setPage(1) }, [mode])

  const load = React.useCallback(async () => {
    setLoading(true); setError('')
    try {
      const p = new URLSearchParams()
      // Map tab into view + filters
      let view = isMine ? 'mine' : 'queue'
      let extra = {}
      if (!isMine) {
        if (tab === 'targeted')      view = 'targeted'
        if (tab === 'fresh')         extra.age_max_hours = '24'
        if (tab === 'urgent')        extra.urgency = urgencyFilter || 'urgent'
        if (tab === 'low_density')   extra.max_density = '1'
      }
      p.set('view', view)
      if (debouncedQ) p.set('q', debouncedQ)
      if (country)    p.set('country', country)
      if (caseType)   p.set('case_type', caseType)
      if (urgencyFilter && !extra.urgency) p.set('urgency', urgencyFilter)
      if (excludeEngaged && !isMine) p.set('exclude_my_engaged', 'true')
      for (const [k, v] of Object.entries(extra)) p.set(k, v)
      p.set('sort', sort)
      p.set('page', String(page))
      p.set('page_size', String(PAGE_SIZE))
      const r = await fetch(`/api/attorney/inquiries/search?${p}`, { credentials: 'same-origin' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error || `Failed (${r.status})`)
      setInquiries(d.inquiries || [])
      setTotal(d.total || 0)
      setTotalPages(d.total_pages || 1)
      setHasMore(!!d.has_more)
      setFacets(d.facets || {})
      setSchemaPending(!!d.schema_pending)
    } catch (e) {
      setError(e.message || 'Failed to load inquiries.')
    } finally {
      setLoading(false)
    }
  }, [mode, isMine, tab, debouncedQ, country, caseType, urgencyFilter, excludeEngaged, sort, page])

  React.useEffect(() => { load() }, [load])

  React.useEffect(() => {
    fetch('/api/attorney/inquiries/stats', { credentials: 'same-origin' })
      .then(r => r.json().catch(() => ({})))
      .then(d => setStats(d?.stats || null))
      .catch(() => setStats(null))
  }, [tab])

  // Soft poll every 10s while visible
  React.useEffect(() => {
    const id = setInterval(() => { if (document.visibilityState === 'visible') load() }, 10_000)
    return () => clearInterval(id)
  }, [load])

  if (openId) {
    return <InquiryThread inquiryId={openId} onBack={() => { setOpenId(null); load() }} />
  }

  const tabs = isMine ? MINE_TABS : QUEUE_TABS

  return (
    <div style={{ padding: '24px 28px 60px', display: 'flex', flexDirection: 'column', gap: 18, fontFamily: SANS, background: BG, minHeight: '100vh' }}>
      {/* Header */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.16em', color: GOLD, textTransform: 'uppercase', fontFamily: MONO, marginBottom: 4 }}>
          {isMine ? 'Pipeline' : 'Inbound demand'}
        </div>
        <h1 style={{ fontFamily: SERIF, fontSize: 32, fontWeight: 500, color: TEXT, margin: 0, letterSpacing: '-.012em' }}>
          {isMine ? 'My inquiries.' : 'Inquiry queue.'}
        </h1>
        <div style={{ fontSize: 13, color: MUTED, marginTop: 4 }}>
          {isMine
            ? 'Inquiries you have responded to or sent offers on. Multiple attorneys can respond to each — clients pick the best fit.'
            : 'Inbound intakes from clients. Multiple attorneys can respond — fast, well-fit responses win the engagement.'}
        </div>
        {!isMine && (
          <div style={{ fontSize: 12, color: DIM, marginTop: 8, fontStyle: 'italic' }}>
            Auto-removed when an order is placed or the client archives.
          </div>
        )}
      </div>

      {schemaPending && (
        <Card style={{ padding: 14, background: `${AMBER}10`, border: `1px solid ${AMBER}33` }}>
          <div style={{ fontSize: 13, color: TEXT, fontWeight: 600 }}>Inquiries system is initialising — new intakes will appear here once submitted.</div>
        </Card>
      )}

      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 8, background: `${RED}10`, color: RED, fontSize: 13, fontWeight: 600 }}>{error}</div>
      )}

      {/* Stat tiles */}
      {!isMine && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
          <StatTile label="Open queue"        value={fmtN(stats?.open ?? 0)}              accent={CYAN}   sub="all active intakes" onClick={() => setTab('all')} />
          <StatTile label="Targeted to me"    value={fmtN(stats?.targeted_to_me ?? 0)}    accent={PURPLE} sub="addressed directly" onClick={() => setTab('targeted')} />
          <StatTile label="Urgent / high"     value={fmtN(stats?.urgent ?? 0)}            accent={RED}    sub="needs fast response" onClick={() => setTab('urgent')} />
          <StatTile label="Fresh (24h)"       value={fmtN(stats?.fresh_24h ?? 0)}         accent={GREEN}  sub="first to respond wins" onClick={() => setTab('fresh')} />
          <StatTile label="Engaged by you"    value={fmtN(stats?.my_engaged ?? 0)}        accent={NAVY}   sub="awaiting client" />
          <StatTile label="Your open offers"  value={fmtN(stats?.my_pending_offers ?? 0)} accent={AMBER}  sub="pending acceptance" />
        </div>
      )}

      {isMine && stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
          <StatTile label="Engaged inquiries" value={fmtN(stats.my_engaged ?? 0)}        accent={NAVY} />
          <StatTile label="Pending offers"    value={fmtN(stats.my_pending_offers ?? 0)} accent={AMBER} sub="awaiting client decision" />
        </div>
      )}

      {/* Toolbar */}
      <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px 16px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: DIM, fontSize: 14 }}>🔍</span>
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Search case, country, name…"
            style={{ width: '100%', padding: '8px 12px 8px 32px', fontSize: 13, border: `1px solid ${BORDER}`, borderRadius: 6, background: BG, color: TEXT, fontFamily: SANS, boxSizing: 'border-box' }}
          />
        </div>
        <select value={country} onChange={e => { setCountry(e.target.value); setPage(1) }} style={selectStyle}>
          <option value="">All countries</option>
          {facets.countries?.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={caseType} onChange={e => { setCaseType(e.target.value); setPage(1) }} style={selectStyle}>
          <option value="">All case types</option>
          {facets.case_types?.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={urgencyFilter} onChange={e => { setUrgencyFilter(e.target.value); setPage(1) }} style={selectStyle}>
          <option value="">All urgencies</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="normal">Normal</option>
          <option value="low">Low</option>
        </select>
        <select value={sort} onChange={e => { setSort(e.target.value); setPage(1) }} style={selectStyle}>
          {!isMine && <option value="targeted">Targeted first</option>}
          <option value="created_at">Newest first</option>
          <option value="urgency">By urgency</option>
          <option value="density">Lowest competition</option>
        </select>
        {!isMine && (
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: MUTED, fontFamily: SANS }}>
            <input type="checkbox" checked={excludeEngaged} onChange={e => { setExcludeEngaged(e.target.checked); setPage(1) }} />
            Hide already engaged
          </label>
        )}
      </div>

      {/* Tabs */}
      {!isMine && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', borderBottom: `1px solid ${BORDER}`, marginBottom: -2 }}>
          {tabs.map(t => {
            const active = tab === t.id
            return (
              <button key={t.id} onClick={() => { setTab(t.id); setPage(1) }} style={{
                padding: '9px 14px', fontSize: 13, fontFamily: SANS, fontWeight: active ? 700 : 500,
                border: 'none', background: 'transparent',
                borderBottom: `2px solid ${active ? CYAN : 'transparent'}`,
                color: active ? TEXT : MUTED, cursor: 'pointer',
              }}>{t.label}</button>
            )
          })}
        </div>
      )}

      {/* List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {loading && (
          <div style={{ padding: 24, color: MUTED, fontSize: 13, textAlign: 'center' }}>Loading…</div>
        )}
        {!loading && inquiries.length === 0 && !error && (
          <Card style={{ padding: 40, textAlign: 'center' }}>
            <div style={{ fontSize: 38, marginBottom: 10 }}>{isMine ? '📂' : '📥'}</div>
            <div style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 600, color: TEXT, marginBottom: 4 }}>
              {isMine ? "You haven't engaged any inquiries yet" : 'No inquiries match these filters'}
            </div>
            <div style={{ fontSize: 13, color: MUTED, maxWidth: 380, margin: '0 auto' }}>
              {isMine
                ? 'Respond to inquiries in the queue to start building your pipeline.'
                : 'Loosen the filters or wait — new intakes appear in real time.'}
            </div>
          </Card>
        )}
        {!loading && inquiries.map(q => (
          <InquiryRow key={q.id} inquiry={q} onOpen={() => setOpenId(q.id)} />
        ))}
      </div>

      {/* Pagination */}
      {!loading && totalPages > 1 && (
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
    </div>
  )
}

function InquiryRow({ inquiry, onOpen }) {
  const [hover, setHover] = React.useState(false)
  const urgColor = URGENCY_COLORS[inquiry.urgency] || MUTED
  const isFresh = (inquiry.age_hours ?? 0) < 24
  const isLowComp = (inquiry.attorneys_responding ?? 0) <= 1 && !inquiry.my_engaged

  return (
    <Card
      onClick={onOpen}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: '16px 20px', cursor: 'pointer',
        border: `1px solid ${hover ? '#C8C2B6' : BORDER}`,
        borderLeft: `4px solid ${inquiry.targeted_to_me ? PURPLE : inquiry.urgency === 'urgent' ? RED : isFresh ? GREEN : CYAN}`,
        boxShadow: hover ? '0 4px 14px rgba(27,45,79,0.10)' : '0 1px 3px rgba(27,45,79,0.05)',
        transition: 'box-shadow .15s, border-color .15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
            {inquiry.targeted_to_me && <Badge color="purple" style={{ fontSize: 10, fontWeight: 700 }}>🎯 Targeted to you</Badge>}
            {inquiry.urgency && (
              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: `${urgColor}15`, color: urgColor, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase' }}>
                {inquiry.urgency}
              </span>
            )}
            {inquiry.my_engaged && <Badge color="cyan" style={{ fontSize: 10 }}>You've engaged</Badge>}
            {isLowComp && <Badge color="green" style={{ fontSize: 10, fontWeight: 700 }}>⚡ Low competition</Badge>}
            {isFresh && <span style={{ fontSize: 10, color: GREEN, fontWeight: 700, fontFamily: MONO }}>● FRESH</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 600, color: TEXT, lineHeight: 1.2, letterSpacing: '-.006em' }}>
              {inquiry.case_type_label || inquiry.case_type || 'Inquiry'}
            </div>
            {inquiry.country && <CountryChip country={inquiry.country} />}
          </div>
          <div style={{ color: MUTED, fontSize: 12, fontFamily: MONO, marginTop: 4 }}>
            {inquiry.full_name} · {fmtRelative(inquiry.created_at)}
            {inquiry.attorneys_responding > 0 && <> · 👥 {inquiry.attorneys_responding} attorney{inquiry.attorneys_responding === 1 ? '' : 's'} responding</>}
            {inquiry.competing_offers > 0 && <> · ⚡ {inquiry.competing_offers} offer{inquiry.competing_offers === 1 ? '' : 's'} on the table</>}
          </div>
          {/* Answers preview (compact) */}
          {inquiry.answers && (
            <div style={{ marginTop: 8 }}>
              <AnswersPreview answers={inquiry.answers} />
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          {inquiry.recommended_tier && (
            <Badge color="gray" style={{ fontSize: 10 }}>{inquiry.recommended_tier}</Badge>
          )}
          <Btn variant="primary" size="sm">Open & respond</Btn>
        </div>
      </div>
    </Card>
  )
}

const selectStyle = {
  padding: '8px 10px', fontSize: 13, border: `1px solid ${BORDER}`, borderRadius: 6,
  background: BG, color: TEXT, fontFamily: SANS, cursor: 'pointer',
}
