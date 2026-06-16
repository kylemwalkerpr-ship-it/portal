'use client'
import React from 'react'
import { C, Card, Btn } from './shared'

// ─── Design tokens ────────────────────────────────────────────────────────────
const serif = "'Cormorant Garamond', 'Garamond', Georgia, serif"
const sans  = C.sans
const NAVY = 'var(--portal-ink)'
const GOLD = 'var(--portal-gold)'
const GREEN = '#1A6B45'
const AMBER = '#8B5E0A'
const RED   = '#8B1A1A'
const PURPLE= '#3D2B6B'

// Intent-aligned tabs. Replaces the previous vanity layout (Overview / Revenue /
// Users / Marketplace / Orders / Providers / Engagement) with 5 funnel-stage
// sections an operator can actually act on. Per-stage data comes from
// dedicated endpoints under /api/admin/analytics/*.
const TABS = [
  { id: 'acquisition',  label: 'Acquisition'  },
  { id: 'activation',   label: 'Activation'   },
  { id: 'engagement',   label: 'Engagement'   },
  { id: 'retention',    label: 'Retention'    },
  { id: 'marketplace',  label: 'Marketplace'  },
  { id: 'search',       label: 'Search & Traffic' },
]

// ─── Formatters ───────────────────────────────────────────────────────────────
const fmtNum = (n, compact = false) => {
  const v = Number(n) || 0
  if (compact && v >= 1e6) return `${(v/1e6).toFixed(1)}M`
  if (compact && v >= 1e3) return `${(v/1e3).toFixed(1)}K`
  return v.toLocaleString()
}
const fmtPct  = n => `${(Number(n) || 0).toFixed(1)}%`
const fmtDate = s => s ? new Date(s).toLocaleDateString('en-GB',{ day:'numeric', month:'short' }) : '—'
const fmtMonth = s => {
  if (!s) return '—'
  const [y, m] = s.split('-')
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString('default', { month: 'short', year: '2-digit' })
}
const fmtDays = n => `${(Number(n) || 0).toFixed(1)}d`

// ─── SVG primitives ───────────────────────────────────────────────────────────
function SparkLine({ values = [], color = NAVY, height = 30, width = 90 }) {
  if (!values.length || values.length < 2) {
    return <div style={{ width, height, background: '#FAFAF8', borderRadius: 3 }} />
  }
  const max = Math.max(...values, 1)
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * width},${height - (v / max) * (height - 2) - 1}`).join(' ')
  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width, height, display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

// HTML/CSS bar chart. (The prior SVG used preserveAspectRatio="none" with a
// width-100 viewBox stretched across the full pixel width — an ~11x
// horizontal scale that smeared the bars and rendered the date labels as
// unreadable distorted glyphs.) Plain flex bars + labels stay crisp.
function BarChart({ data = [], height = 110, color = NAVY }) {
  if (!data.length) return <EmptyChart height={height} />
  const max = Math.max(...data.map(d => d.value), 1)
  // Thin x-labels when crowded so they don't collide.
  const stride = data.length > 14 ? Math.ceil(data.length / 8) : 1
  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: data.length > 20 ? 2 : 4, height }}>
        {data.map((d, i) => {
          const bh = Math.max((d.value / max) * height, d.value > 0 ? 2 : 0)
          return (
            <div key={i} title={`${d.label}: ${fmtNum(d.value)}`}
              style={{ flex: 1, minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center' }}>
              <div style={{
                width: '100%', maxWidth: 28, height: bh,
                background: d.highlight ? GOLD : color, borderRadius: '2px 2px 0 0',
                opacity: 0.92, minHeight: d.value > 0 ? 2 : 0,
              }} />
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: data.length > 20 ? 2 : 4, marginTop: 6 }}>
        {data.map((d, i) => {
          const showLabel = i === 0 || i === data.length - 1 || i % stride === 0
          return (
            <div key={i} style={{ flex: 1, minWidth: 0, textAlign: 'center', fontSize: 9.5, color: '#9097A8', fontFamily: sans, whiteSpace: 'nowrap', overflow: 'hidden' }}>
              {showLabel ? (d.shortLabel || d.label) : ''}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function FunnelChart({ steps = [] }) {
  if (!steps.length) return null
  const max = steps[0].count || 1
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {steps.map((s, i) => {
        const pct = Math.min(100, (s.count / max) * 100)
        const stepConv = i > 0 && steps[i - 1].count > 0 ? (s.count / steps[i - 1].count * 100).toFixed(1) : null
        return (
          <div key={s.stage}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: NAVY }}>{s.stage}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {stepConv && <span style={{ fontSize: 11, color: GREEN, fontWeight: 600 }}>{stepConv}% step</span>}
                <span style={{ fontSize: 13, fontWeight: 800, color: NAVY, fontVariantNumeric: 'tabular-nums' }}>{fmtNum(s.count)}</span>
              </div>
            </div>
            <div style={{ height: 24, borderRadius: 4, background: 'var(--portal-rule-soft)', overflow: 'hidden', position: 'relative' }}>
              <div style={{
                height: '100%',
                width: `${pct}%`,
                background: `linear-gradient(90deg, ${NAVY}, color-mix(in srgb, ${NAVY} 80%, transparent))`,
                borderRadius: 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                padding: '0 8px',
                transition: 'width .4s ease',
              }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', opacity: pct > 18 ? 1 : 0 }}>{fmtPct(pct)}</span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function EmptyChart({ height = 80 }) {
  return (
    <div style={{
      height, display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'var(--portal-ink-soft)', fontSize: 13, background: '#FAFAF8', borderRadius: 6,
    }}>No data yet</div>
  )
}

// ─── KPI tile (with optional sparkline + ComingSoon badge) ────────────────────
function Kpi({ label, value, sub, delta, spark, sparkColor = NAVY, accent = NAVY, comingSoon }) {
  return (
    <div style={{
      background: '#fff',
      border: '1px solid var(--portal-rule)',
      borderTop: `3px solid ${comingSoon ? 'var(--portal-rule)' : accent}`,
      borderRadius: 8,
      padding: '16px 18px',
      boxShadow: '0 1px 3px rgba(27,45,79,0.05)',
      display: 'flex', flexDirection: 'column', gap: 5,
      minHeight: 110,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--portal-ink-soft)' }}>{label}</span>
        {comingSoon && <ComingSoonBadge />}
      </div>
      <div style={{ fontWeight: 800, fontSize: 24, color: comingSoon ? 'var(--portal-ink-soft)' : NAVY, letterSpacing: '-.02em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
        {comingSoon ? '—' : value}
      </div>
      {sub && <div style={{ fontSize: 12, color: 'var(--portal-ink-soft)', lineHeight: 1.4 }}>{sub}</div>}
      {delta !== undefined && delta !== null && (
        <div style={{ fontSize: 11, fontWeight: 700, color: delta >= 0 ? GREEN : RED }}>
          {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}% vs prior period
        </div>
      )}
      {spark && !comingSoon && (
        <div style={{ marginTop: 4 }}>
          <SparkLine values={spark} color={sparkColor} />
        </div>
      )}
    </div>
  )
}

function ComingSoonBadge() {
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em',
      padding: '2px 6px', borderRadius: 3, background: '#FEF5E4', color: AMBER, whiteSpace: 'nowrap',
    }}>Coming soon</span>
  )
}

// ─── Section wrapper ──────────────────────────────────────────────────────────
function Sec({ title, sub, right, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h3 style={{ fontFamily: serif, fontWeight: 600, fontSize: 20, color: NAVY, margin: 0, letterSpacing: '-.01em' }}>{title}</h3>
          {sub && <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--portal-ink-soft)', lineHeight: 1.5 }}>{sub}</p>}
        </div>
        {right}
      </div>
      {children}
    </div>
  )
}

// ─── Data table ───────────────────────────────────────────────────────────────
function DT({ cols, rows, empty = 'No data' }) {
  return (
    <div style={{ background: '#fff', border: '1px solid var(--portal-rule)', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: `${cols.length * 100}px` }}>
          <thead>
            <tr>
              {cols.map(c => (
                <th key={c.key} style={{
                  padding: '10px 13px', textAlign: c.r ? 'right' : 'left',
                  fontSize: 11, fontWeight: 700, letterSpacing: '.06em',
                  textTransform: 'uppercase', color: 'rgba(255,255,255,.70)',
                  background: NAVY, whiteSpace: 'nowrap',
                  borderBottom: '2px solid rgba(255,255,255,.08)',
                }}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={cols.length} style={{ padding: 32, textAlign: 'center', color: 'var(--portal-ink-soft)', fontSize: 13 }}>{empty}</td></tr>
            ) : rows.map((row, ri) => (
              <tr key={ri} style={{ background: ri % 2 === 0 ? '#fff' : '#FAFAF8', borderBottom: '1px solid #F2EFE9' }}>
                {cols.map(c => (
                  <td key={c.key} style={{
                    padding: '10px 13px', fontSize: 13, textAlign: c.r ? 'right' : 'left',
                    color: c.dim ? 'var(--portal-ink-soft)' : NAVY, fontWeight: c.bold ? 700 : 400,
                    whiteSpace: c.wrap ? 'normal' : 'nowrap', fontVariantNumeric: 'tabular-nums',
                  }}>{row[c.key] ?? '—'}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Skeletons ────────────────────────────────────────────────────────────────
function Skeleton({ h = 20, w = '100%', r = 4 }) {
  return <div style={{ height: h, width: w, background: 'var(--portal-rule-soft)', borderRadius: r, animation: 'pulse 1.5s ease-in-out infinite' }} />
}
function KpiSkeleton() {
  return (
    <div style={{ background: '#fff', border: '1px solid var(--portal-rule)', borderTop: '3px solid #F2EFE9', borderRadius: 8, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Skeleton h={11} w="55%" />
      <Skeleton h={28} w="40%" />
      <Skeleton h={12} w="70%" />
    </div>
  )
}

// ─── Hook: fetch analytics endpoint with self-healing error ───────────────────
function useAnalytics(endpoint) {
  const [data, setData] = React.useState(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const load = React.useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch(`/api/admin/analytics/${endpoint}`, { credentials: 'same-origin' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error?.message || json?.error || 'Failed')
      setData(json?.data ?? json)
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }, [endpoint])
  React.useEffect(() => { load() }, [load])
  return { data, loading, error, reload: load }
}

// ─── Export CSV ───────────────────────────────────────────────────────────────
function exportCSV(rows, filename) {
  if (!rows?.length) return
  const keys = Object.keys(rows[0])
  const csv = [keys.join(','), ...rows.map(r => keys.map(k => JSON.stringify(r[k] ?? '')).join(','))].join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  a.download = filename; a.click()
}

function ExportBtn({ rows, filename, label = '↓ CSV' }) {
  return (
    <Btn variant="ghost" size="sm" onClick={() => exportCSV(rows, filename)}>{label}</Btn>
  )
}

function DataWarnings({ items }) {
  if (!items?.length) return null
  return (
    <div style={{
      background: '#FEF5E4', border: '1px solid #F0E2C0', borderRadius: 6,
      padding: '8px 12px', fontSize: 12, color: AMBER, lineHeight: 1.45,
    }}>
      <strong style={{ marginRight: 4 }}>Partial data:</strong>
      {items.slice(0, 3).join(' · ')}
      {items.length > 3 ? ` · +${items.length - 3} more` : ''}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════════════
export default function AdminAnalyticsPro() {
  const initialTab = (() => {
    if (typeof window === 'undefined') return 'acquisition'
    const t = new URLSearchParams(window.location.search).get('tab')
    return TABS.some(x => x.id === t) ? t : 'acquisition'
  })()
  const [tab, setTab] = React.useState(initialTab)
  // Surface the OAuth round-trip result from the GSC connect flow.
  const gscResult = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('gsc')
    : null
  const [gscNotice, setGscNotice] = React.useState(gscResult)

  // Per-tab data hooks. Only the active tab actually triggers a re-fetch
  // because each hook fires on mount; we mount all to keep tab-switching
  // instant after first paint. Each route is cheap (single-pass aggregates).
  const acquisition       = useAnalytics('acquisition')
  const activation        = useAnalytics('activation')
  const engagement        = useAnalytics('engagement')
  const retention         = useAnalytics('retention')
  const marketplaceHealth = useAnalytics('marketplace-health')
  const searchConsole     = useAnalytics('search-console')

  return (
    <div style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 22, fontFamily: sans, minHeight: '100vh', background: 'var(--portal-bg)' }}>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.14em', color: 'var(--portal-ink-soft)', marginBottom: 4 }}>Intelligence</div>
          <h2 style={{ fontFamily: serif, fontWeight: 600, fontSize: 34, color: NAVY, margin: 0, letterSpacing: '-.015em', lineHeight: 1.1 }}>Site Analytics</h2>
          <p style={{ color: 'var(--portal-ink-soft)', fontSize: 13, margin: '5px 0 0', lineHeight: 1.5 }}>
            Funnel-stage view from signup to a returning client, plus live search &amp; traffic performance.
          </p>
        </div>
      </div>

      {/* GSC connect result banner */}
      {gscNotice && (
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
          padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
          background: gscNotice === 'connected' ? '#ECF7F1' : '#FEF5E4',
          border: `1px solid ${gscNotice === 'connected' ? '#BfE3CF' : '#F0E2C0'}`,
          color: gscNotice === 'connected' ? GREEN : AMBER,
        }}>
          <span>{gscNotice === 'connected' ? '✓ Search Console connected. Live data below.' : '⚠ Search Console connection failed. Check the redirect URI and try again.'}</span>
          <button onClick={() => setGscNotice(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 800, fontSize: 15 }}>×</button>
        </div>
      )}

      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--portal-rule)', gap: 0, overflowX: 'auto', background: '#fff', borderRadius: '8px 8px 0 0', boxShadow: '0 1px 3px rgba(27,45,79,0.05)' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, padding: '12px 18px',
            fontSize: 13, fontWeight: tab === t.id ? 600 : 400,
            color: tab === t.id ? NAVY : 'var(--portal-ink-soft)',
            background: 'none', border: 'none',
            borderBottom: tab === t.id ? `2px solid ${NAVY}` : '2px solid transparent',
            cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: sans, transition: 'color .12s',
          }}>{t.label}</button>
        ))}
      </div>

      {/* ── ACQUISITION ────────────────────────────────────────────────────── */}
      {tab === 'acquisition' && <AcquisitionTab q={acquisition} />}

      {/* ── ACTIVATION ─────────────────────────────────────────────────────── */}
      {tab === 'activation' && <ActivationTab q={activation} />}

      {/* ── ENGAGEMENT ─────────────────────────────────────────────────────── */}
      {tab === 'engagement' && <EngagementTab q={engagement} />}

      {/* ── RETENTION ──────────────────────────────────────────────────────── */}
      {tab === 'retention' && <RetentionTab q={retention} />}

      {/* ── MARKETPLACE HEALTH ─────────────────────────────────────────────── */}
      {tab === 'marketplace' && <MarketplaceTab q={marketplaceHealth} />}

      {/* ── SEARCH & TRAFFIC (Google Search Console) ───────────────────────── */}
      {tab === 'search' && <SearchTab q={searchConsole} />}
    </div>
  )
}

// ─── SEARCH & TRAFFIC ─────────────────────────────────────────────────────────
function SearchTab({ q }) {
  const d = q.data || {}
  const totals = d.totals || {}
  const prev = d.totalsPrev || null
  const clicksDelta = prev && prev.clicks ? ((totals.clicks - prev.clicks) / prev.clicks) * 100 : null
  const imprDelta = prev && prev.impressions ? ((totals.impressions - prev.impressions) / prev.impressions) * 100 : null
  const dailyClicks = (d.daily || []).map(x => x.clicks)
  const dailyImpr = (d.daily || []).map(x => x.impressions)

  const shortUrl = (u) => { try { const p = new URL(u); return (p.host.replace(/^www\./, '') + p.pathname).replace(/\/$/, '') || p.host } catch { return u } }
  const queryRows = (d.topQueries || []).map(r => ({
    query: r.key,
    clicks: fmtNum(r.clicks),
    impressions: fmtNum(r.impressions),
    ctr: fmtPct((r.ctr || 0) * 100),
    position: (r.position || 0).toFixed(1),
  }))
  const pageRows = (d.topPages || []).map(r => ({
    page: shortUrl(r.key),
    clicks: fmtNum(r.clicks),
    impressions: fmtNum(r.impressions),
    ctr: fmtPct((r.ctr || 0) * 100),
    position: (r.position || 0).toFixed(1),
  }))

  // Not-configured state — surfaced clearly so an operator knows it's a
  // credentials gap, not zero traffic.
  if (!q.loading && d.configured === false) {
    return (
      <div style={{ background: '#fff', border: '1px solid var(--portal-rule)', borderRadius: 10, padding: 28, textAlign: 'center' }}>
        <div style={{ fontFamily: serif, fontSize: 20, color: NAVY, marginBottom: 6 }}>Search Console not connected</div>
        <p style={{ color: 'var(--portal-ink-soft)', fontSize: 13, lineHeight: 1.6, maxWidth: 520, margin: '0 auto 16px' }}>
          Connect Google Search Console to surface live search clicks, impressions, CTR, and top
          queries across the estate. You'll authorize with the Google account that owns the property.
        </p>
        <a href="/api/admin/analytics/gsc/connect" style={{
          display: 'inline-block', padding: '10px 22px', borderRadius: 8, background: NAVY,
          color: '#fff', fontSize: 13, fontWeight: 600, textDecoration: 'none',
        }}>Connect Search Console</a>
        <div style={{ marginTop: 14 }}><DataWarnings items={d.warnings} /></div>
      </div>
    )
  }

  return (
    <>
      <DataWarnings items={d.warnings} />
      <p style={{ color: 'var(--portal-ink-soft)', fontSize: 12.5, margin: '-6px 0 0', lineHeight: 1.5 }}>
        Google Search Console · {d.range?.startDate} → {d.range?.endDate} ({d.range?.days || 28}-day window).
        Organic-search clicks are the dominant traffic channel for the consultancy estate.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(195px, 1fr))', gap: 12 }}>
        {q.loading ? [1, 2, 3, 4].map(i => <KpiSkeleton key={i} />) : (
          <>
            <Kpi label="Clicks" value={fmtNum(totals.clicks, true)} sub={prev ? `vs ${fmtNum(prev.clicks, true)} prior` : 'organic visits'} delta={clicksDelta} spark={dailyClicks} sparkColor={GREEN} accent={GREEN} />
            <Kpi label="Impressions" value={fmtNum(totals.impressions, true)} sub={prev ? `vs ${fmtNum(prev.impressions, true)} prior` : 'search appearances'} delta={imprDelta} spark={dailyImpr} sparkColor={NAVY} accent={NAVY} />
            <Kpi label="Avg CTR" value={fmtPct((totals.ctr || 0) * 100)} sub="clicks ÷ impressions" accent={PURPLE} />
            <Kpi label="Avg Position" value={(totals.position || 0).toFixed(1)} sub="lower is better" accent={GOLD} />
          </>
        )}
      </div>

      <Sec title="Clicks by Day" sub={`Daily organic clicks · ${d.range?.days || 28}-day window`}>
        <Card style={{ padding: 20 }}>
          {q.loading ? <Skeleton h={120} /> : (
            <BarChart data={(d.daily || []).map(x => ({ label: fmtDate(x.date), shortLabel: fmtDate(x.date).split(' ')[0], value: x.clicks }))} height={110} color={GREEN} />
          )}
        </Card>
      </Sec>

      <Sec title="Top Queries" sub="Highest-impression search terms" right={<ExportBtn rows={queryRows} filename="search-top-queries.csv" />}>
        <DT cols={[
          { key: 'query',       label: 'Query', wrap: true },
          { key: 'clicks',      label: 'Clicks', r: true, bold: true },
          { key: 'impressions', label: 'Impressions', r: true },
          { key: 'ctr',         label: 'CTR', r: true, dim: true },
          { key: 'position',    label: 'Pos.', r: true, dim: true },
        ]} rows={queryRows} empty="No query data in this window" />
      </Sec>

      <Sec title="Top Pages" sub="Most-surfaced URLs across the estate" right={<ExportBtn rows={pageRows} filename="search-top-pages.csv" />}>
        <DT cols={[
          { key: 'page',        label: 'Page', wrap: true },
          { key: 'clicks',      label: 'Clicks', r: true, bold: true },
          { key: 'impressions', label: 'Impressions', r: true },
          { key: 'ctr',         label: 'CTR', r: true, dim: true },
          { key: 'position',    label: 'Pos.', r: true, dim: true },
        ]} rows={pageRows} empty="No page data in this window" />
      </Sec>
    </>
  )
}

// ─── ACQUISITION ──────────────────────────────────────────────────────────────
function AcquisitionTab({ q }) {
  const d = q.data || {}
  const dailySpark = (d.signups_daily_series || []).map(x => x.count)
  const delta = d.signups_30d_prev
    ? ((d.signups_30d - d.signups_30d_prev) / d.signups_30d_prev) * 100
    : null
  const byRole = d.signups_by_role_30d || {}
  const bySource = d.signups_by_source_30d || {}

  // Build by-role drill rows
  const roleRows = Object.entries(byRole).map(([role, count]) => ({
    role: role.charAt(0).toUpperCase() + role.slice(1),
    count: fmtNum(count),
    share: d.signups_30d ? fmtPct((count / d.signups_30d) * 100) : '—',
  }))

  // Source rows — paid bucket renders as Coming soon
  const sourceRows = Object.entries(bySource).map(([source, count]) => ({
    source: source.charAt(0).toUpperCase() + source.slice(1),
    count: count === null ? 'Coming soon' : fmtNum(count),
    share: count === null || !d.signups_30d ? '—' : fmtPct((count / d.signups_30d) * 100),
  }))

  return (
    <>
      <DataWarnings items={d.data_warnings} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(195px, 1fr))', gap: 12 }}>
        {q.loading ? [1, 2, 3, 4, 5].map(i => <KpiSkeleton key={i} />) : (
          <>
            <Kpi label="Signups (30d)" value={fmtNum(d.signups_30d)} sub={`vs ${fmtNum(d.signups_30d_prev)} prior 30d`} delta={delta} spark={dailySpark} sparkColor={NAVY} accent={NAVY} />
            <Kpi label="Students" value={fmtNum(byRole.student)} sub={byRole.other ? `${fmtNum(byRole.other)} unset role` : 'of total signups'} accent={GREEN} />
            <Kpi label="Consultants + Attorneys" value={fmtNum((byRole.consultant || 0) + (byRole.attorney || 0))} sub="providers joined" accent={PURPLE} />
            <Kpi label="Invited" value={bySource.invited === null ? '' : fmtNum(bySource.invited)} sub={bySource.invited === null ? 'profiles has no invited_by column' : `${d.signups_30d ? fmtPct((bySource.invited / d.signups_30d) * 100) : '0%'} of signups`} accent={GOLD} comingSoon={bySource.invited === null} />
            <Kpi label="Signup → First Order" value={fmtPct(d.signup_to_first_order_pct)} sub={`Cohort of ${fmtNum(d.signup_to_first_order_cohort_size)} from prior 30d`} accent={GREEN} />
          </>
        )}
      </div>

      <Sec title="Signups by Day" sub="Last 30 days · daily count">
        <Card style={{ padding: 20 }}>
          {q.loading ? <Skeleton h={120} /> : (
            <BarChart data={(d.signups_daily_series || []).map(x => ({ label: fmtDate(x.date), shortLabel: fmtDate(x.date).split(' ')[0], value: x.count }))} height={110} />
          )}
        </Card>
      </Sec>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Sec title="Signups by Role (30d)" right={<ExportBtn rows={roleRows} filename="acquisition-by-role.csv" />}>
          <DT cols={[
            { key: 'role',  label: 'Role' },
            { key: 'count', label: 'Signups', r: true, bold: true },
            { key: 'share', label: 'Share', r: true, dim: true },
          ]} rows={roleRows} />
        </Sec>
        <Sec title="Signups by Source (30d)" right={<ExportBtn rows={sourceRows} filename="acquisition-by-source.csv" />}>
          <DT cols={[
            { key: 'source', label: 'Source' },
            { key: 'count',  label: 'Signups', r: true, bold: true },
            { key: 'share',  label: 'Share', r: true, dim: true },
          ]} rows={sourceRows} />
        </Sec>
      </div>

      <Sec title="Top Invite Referrers" sub="Profiles who attracted the most signups (rolling 365 days)"
        right={<ExportBtn rows={(d.top_invite_referrers || []).map(r => ({ name: r.name, invites: r.invites }))} filename="top-invite-referrers.csv" />}>
        <DT cols={[
          { key: 'rank',    label: '#', dim: true },
          { key: 'name',    label: 'Referrer' },
          { key: 'invites', label: 'Invited', r: true, bold: true },
        ]} rows={(d.top_invite_referrers || []).map((r, i) => ({
          rank: `#${i + 1}`,
          name: r.name || r.profile_id?.slice(0, 8) + '…',
          invites: fmtNum(r.invites),
        }))} empty={d.schema_notes?.invite_field_used ? 'No invite chain in window' : 'Invite tracking not yet wired up'} />
      </Sec>
    </>
  )
}

// ─── ACTIVATION ───────────────────────────────────────────────────────────────
function ActivationTab({ q }) {
  const d = q.data || {}
  const f = d.funnel || []
  const drop = d.dropoff_30d_cohort || []
  const med = d.median_days || {}

  return (
    <>
      <DataWarnings items={d.data_warnings} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(195px, 1fr))', gap: 12 }}>
        {q.loading ? [1, 2, 3, 4].map(i => <KpiSkeleton key={i} />) : (
          <>
            <Kpi label="90d Student Cohort" value={fmtNum(d.cohort_size)} sub="Students created in last 90 days" accent={NAVY} />
            <Kpi label="Median signup → view" value={fmtDays(med.to_view)} sub="Days to view a first service" accent={PURPLE} comingSoon={!d.schema_notes?.view_tracking_used} />
            <Kpi label="Median signup → inquiry" value={fmtDays(med.to_inquiry)} sub="Days to first inquiry" accent={GOLD} />
            <Kpi label="Median signup → order" value={fmtDays(med.to_order)} sub="Days to first paid order" accent={GREEN} />
          </>
        )}
      </div>

      <Sec title="Activation Funnel" sub="Full 90d cohort — every stage on the path to first order">
        <Card style={{ padding: 22 }}>
          {q.loading ? <Skeleton h={160} /> : <FunnelChart steps={f} />}
        </Card>
      </Sec>

      <Sec title="30-Day Mature Cohort Funnel" sub="Same funnel limited to profiles older than 30 days — fairer activation read">
        <Card style={{ padding: 22 }}>
          {q.loading ? <Skeleton h={160} /> : <FunnelChart steps={drop} />}
        </Card>
      </Sec>

      <Sec title="Funnel Drill-In" right={<ExportBtn rows={f.map(s => ({ stage: s.stage, count: s.count, pct_of_signups: s.pct_of_signups }))} filename="activation-funnel.csv" />}>
        <DT cols={[
          { key: 'stage', label: 'Stage' },
          { key: 'count', label: 'Reached', r: true, bold: true },
          { key: 'pct',   label: '% of Signups', r: true },
          { key: 'drop',  label: 'Drop-off', r: true, dim: true },
        ]} rows={f.map((s, i) => ({
          stage: s.stage,
          count: fmtNum(s.count),
          pct: fmtPct(s.pct_of_signups),
          drop: i === 0 ? '—' : f[i - 1].count ? fmtPct(((f[i - 1].count - s.count) / f[i - 1].count) * 100) : '—',
        }))} />
      </Sec>
    </>
  )
}

// ─── ENGAGEMENT ───────────────────────────────────────────────────────────────
function EngagementTab({ q }) {
  const d = q.data || {}
  const c = d.dau_wau_mau || {}
  const byRole = d.active_by_role || {}

  const roleRows = ['student', 'consultant', 'attorney'].map(role => {
    const r = byRole[role] || {}
    return {
      role: role.charAt(0).toUpperCase() + role.slice(1),
      dau: fmtNum(r.dau || 0),
      wau: fmtNum(r.wau || 0),
      mau: fmtNum(r.mau || 0),
      stickiness: r.mau ? fmtPct((r.dau / r.mau) * 100) : '—',
    }
  })

  const topEngaged = d.top_engaged_students || []

  return (
    <>
      <DataWarnings items={d.data_warnings} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(195px, 1fr))', gap: 12 }}>
        {q.loading ? [1, 2, 3, 4, 5].map(i => <KpiSkeleton key={i} />) : (
          <>
            <Kpi label="DAU" value={fmtNum(c.dau)} sub="Users active last 24h" accent={GREEN} />
            <Kpi label="WAU" value={fmtNum(c.wau)} sub="Users active last 7d" accent={PURPLE} />
            <Kpi label="MAU" value={fmtNum(c.mau)} sub="Users active last 30d" accent={NAVY} />
            <Kpi label="Stickiness (DAU/MAU)" value={c.mau ? fmtPct((c.dau / c.mau) * 100) : '—'} sub={`WAU/MAU ${fmtPct(c.wau_mau_ratio_pct)}`} accent={GOLD} />
            <Kpi label="Repeat-Order Rate" value={fmtPct(d.repeat_order_rate_pct)} sub="Clients with 2+ orders (90d)" accent={GREEN} />
          </>
        )}
      </div>

      <Sec title="Active Users by Role" sub="Orders + inquiry activity proxy"
        right={<ExportBtn rows={roleRows} filename="engagement-by-role.csv" />}>
        <DT cols={[
          { key: 'role',       label: 'Role' },
          { key: 'dau',        label: 'DAU', r: true },
          { key: 'wau',        label: 'WAU', r: true },
          { key: 'mau',        label: 'MAU', r: true, bold: true },
          { key: 'stickiness', label: 'DAU/MAU', r: true, dim: true },
        ]} rows={roleRows} />
      </Sec>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Sec title="Messaging Intensity">
          <Card style={{ padding: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--portal-ink-soft)', marginBottom: 6 }}>Avg messages per order</div>
            <div style={{ fontWeight: 800, fontSize: 36, color: NAVY, letterSpacing: '-.02em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
              {d.messages_per_order === null ? '—' : (Number(d.messages_per_order) || 0).toFixed(1)}
            </div>
            <p style={{ fontSize: 12, color: 'var(--portal-ink-soft)', marginTop: 8 }}>
              Mean across conversations linked to an order in the last 30 days. Higher numbers can mean
              healthy engagement or trouble — drill into orders if it spikes.
            </p>
          </Card>
        </Sec>
        <Sec title="Repeat-Order Health">
          <Card style={{ padding: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--portal-ink-soft)', marginBottom: 6 }}>Repeat-order rate (90d)</div>
            <div style={{ fontWeight: 800, fontSize: 36, color: NAVY, letterSpacing: '-.02em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
              {fmtPct(d.repeat_order_rate_pct)}
            </div>
            <p style={{ fontSize: 12, color: 'var(--portal-ink-soft)', marginTop: 8 }}>
              Share of clients with at least one order in 90 days who placed more than one. Loyalty signal.
            </p>
          </Card>
        </Sec>
      </div>

      <Sec title="Top Engaged Students" sub="Most orders + inquiries in last 90 days"
        right={<ExportBtn rows={topEngaged.map(r => ({ name: r.name, orders: r.orders, inquiries: r.inquiries, total: r.total }))} filename="top-engaged-students.csv" />}>
        <DT cols={[
          { key: 'rank',      label: '#', dim: true },
          { key: 'name',      label: 'Student' },
          { key: 'orders',    label: 'Orders', r: true },
          { key: 'inquiries', label: 'Inquiries', r: true },
          { key: 'total',     label: 'Touchpoints', r: true, bold: true },
        ]} rows={topEngaged.map((r, i) => ({
          rank: `#${i + 1}`,
          name: r.name || r.profile_id?.slice(0, 8) + '…',
          orders: fmtNum(r.orders),
          inquiries: fmtNum(r.inquiries),
          total: fmtNum(r.total),
        }))} empty="No engaged students in last 90 days" />
      </Sec>
    </>
  )
}

// ─── RETENTION ────────────────────────────────────────────────────────────────
function RetentionTab({ q }) {
  const d = q.data || {}
  const cohorts = d.cohorts || []

  const tableRows = cohorts.map(c => ({
    month: fmtMonth(c.month),
    size: fmtNum(c.size),
    d30: c.mature_30 ? fmtPct(c.pct_30) : 'too new',
    d60: c.mature_60 ? fmtPct(c.pct_60) : 'too new',
    d90: c.mature_90 ? fmtPct(c.pct_90) : 'too new',
    n30: c.mature_30 ? fmtNum(c.active_30) : '—',
    n60: c.mature_60 ? fmtNum(c.active_60) : '—',
    n90: c.mature_90 ? fmtNum(c.active_90) : '—',
  }))

  // Headline KPIs — average mature retention
  const mature30 = cohorts.filter(c => c.mature_30 && c.size > 0)
  const mature60 = cohorts.filter(c => c.mature_60 && c.size > 0)
  const mature90 = cohorts.filter(c => c.mature_90 && c.size > 0)
  const avg = arr => arr.length ? arr.reduce((s, c) => s + c[c._k], 0) / arr.length : 0
  const m30 = mature30.length ? mature30.reduce((s, c) => s + c.pct_30, 0) / mature30.length : 0
  const m60 = mature60.length ? mature60.reduce((s, c) => s + c.pct_60, 0) / mature60.length : 0
  const m90 = mature90.length ? mature90.reduce((s, c) => s + c.pct_90, 0) / mature90.length : 0

  return (
    <>
      <DataWarnings items={d.data_warnings} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(195px, 1fr))', gap: 12 }}>
        {q.loading ? [1, 2, 3].map(i => <KpiSkeleton key={i} />) : (
          <>
            <Kpi label="Avg 30d Retention" value={fmtPct(m30)} sub={`${mature30.length} mature cohorts`} accent={GREEN} />
            <Kpi label="Avg 60d Retention" value={fmtPct(m60)} sub={`${mature60.length} mature cohorts`} accent={PURPLE} />
            <Kpi label="Avg 90d Retention" value={fmtPct(m90)} sub={`${mature90.length} mature cohorts`} accent={NAVY} />
          </>
        )}
      </div>

      <Sec title="Monthly Signup Cohorts" sub="% of each month's student signups who placed an order or sent an inquiry by day 30/60/90"
        right={<ExportBtn rows={cohorts.map(c => ({
          month: c.month,
          size: c.size,
          active_30: c.active_30, pct_30: c.pct_30.toFixed(1),
          active_60: c.active_60, pct_60: c.pct_60.toFixed(1),
          active_90: c.active_90, pct_90: c.pct_90.toFixed(1),
        }))} filename="retention-cohorts.csv" />}>
        <DT cols={[
          { key: 'month', label: 'Cohort' },
          { key: 'size',  label: 'Size', r: true, bold: true },
          { key: 'n30',   label: 'Active d30', r: true },
          { key: 'd30',   label: '%', r: true, dim: true },
          { key: 'n60',   label: 'Active d60', r: true },
          { key: 'd60',   label: '%', r: true, dim: true },
          { key: 'n90',   label: 'Active d90', r: true },
          { key: 'd90',   label: '%', r: true, dim: true },
        ]} rows={tableRows} empty="No cohort data in window" />
      </Sec>

      <Sec title="Why this matters">
        <Card style={{ padding: 20 }}>
          <p style={{ fontSize: 13, color: 'var(--portal-ink-mid)', lineHeight: 1.6, margin: 0 }}>
            Retention is the single best predictor of long-term platform value. A cohort that hits 30% by
            day 30 and stays there to day 90 indicates product-market fit; a cohort that drops to 5% by
            day 60 is a leak. Compare month-over-month to spot whether changes to onboarding,
            messaging, or pricing are moving the needle.
          </p>
        </Card>
      </Sec>
    </>
  )
}

// ─── MARKETPLACE ──────────────────────────────────────────────────────────────
function MarketplaceTab({ q }) {
  const d = q.data || {}
  const topGigs = d.top_gigs_by_orders || []

  return (
    <>
      <DataWarnings items={d.data_warnings} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(195px, 1fr))', gap: 12 }}>
        {q.loading ? [1, 2, 3, 4, 5].map(i => <KpiSkeleton key={i} />) : (
          <>
            <Kpi label="Active Gigs" value={fmtNum(d.active_gigs)} sub={`${fmtNum(d.total_providers)} providers`} accent={NAVY} />
            <Kpi label="Gigs / Provider" value={(Number(d.gigs_per_provider) || 0).toFixed(1)} sub="Mean across active providers" accent={GOLD} />
            <Kpi label="Time-to-Fill" value={`${(Number(d.median_time_to_fill_hours) || 0).toFixed(1)}h`} sub="Median inquiry → claim" accent={GREEN} />
            <Kpi label="Inquiry Fill Rate" value={fmtPct(d.inquiry_fill_rate_pct)} sub="Claimed within 90d" accent={PURPLE} />
            <Kpi label="Search → Order" value="" sub="No search session table yet" accent={AMBER} comingSoon />
          </>
        )}
      </div>

      <Sec title="Top Gigs by Orders" sub="Last 90 days — what's driving real revenue, not just impressions"
        right={<ExportBtn rows={topGigs.map(g => ({ title: g.title, orders: g.orders, gross: g.gross }))} filename="top-gigs-by-orders.csv" />}>
        <DT cols={[
          { key: 'rank',   label: '#', dim: true },
          { key: 'title',  label: 'Service', wrap: true },
          { key: 'orders', label: 'Orders', r: true, bold: true },
          { key: 'gross',  label: 'Gross', r: true },
        ]} rows={topGigs.map((g, i) => ({
          rank: `#${i + 1}`,
          title: g.title || g.gig_id?.slice(0, 8) + '…',
          orders: fmtNum(g.orders),
          gross: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(g.gross || 0),
        }))} empty="No orders in last 90 days" />
      </Sec>

      <Sec title="Health Check">
        <Card style={{ padding: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--portal-ink-soft)', marginBottom: 4 }}>Active gigs with 0 views (30d)</div>
              <div style={{ fontWeight: 800, fontSize: 28, color: d.gigs_zero_views_30d > 0 ? AMBER : GREEN, fontVariantNumeric: 'tabular-nums' }}>{fmtNum(d.gigs_zero_views_30d)}</div>
              <p style={{ fontSize: 12, color: 'var(--portal-ink-soft)', marginTop: 4 }}>Listings that exist but nobody is finding. Candidates for SEO push or removal.</p>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--portal-ink-soft)', marginBottom: 4 }}>Median time-to-fill</div>
              <div style={{ fontWeight: 800, fontSize: 28, color: NAVY, fontVariantNumeric: 'tabular-nums' }}>{(Number(d.median_time_to_fill_hours) || 0).toFixed(1)}h</div>
              <p style={{ fontSize: 12, color: 'var(--portal-ink-soft)', marginTop: 4 }}>From an inquiry being created to an attorney claiming it. Under 4h is great; over 24h is a leak.</p>
            </div>
          </div>
        </Card>
      </Sec>
    </>
  )
}
