'use client'
import React from 'react'

const C = {
  bg: '#F7F8FA', surface: '#FFFFFF', surface2: '#F4F2EE', surface3: '#EBEDF0',
  border: 'rgba(0,0,0,0.08)', cyan: '#3C3B6E', red: '#DC2626', green: '#166534',
  orange: '#D97706', purple: '#7C3AED', text: '#1F2937', textMuted: '#6B7280',
  textDim: '#9CA3AF', gold: '#9A7B3B', navy: '#0F172A', blue: '#2563EB',
  serif: "var(--portal-font-display, 'Cormorant Garamond', 'Garamond', Georgia, 'Times New Roman', serif)",
  mono: "var(--portal-font-mono, 'SF Mono', 'Menlo', 'Monaco', 'Consolas', monospace)",
}

interface GscRow {
  keys: string[]
  clicks: number
  impressions: number
  ctr: number
  position: number
}

interface GscDashboardProps {
  siteUrl: string
  onConnect: () => void
  onDisconnect: () => void
}

// ── Connect state ──

function GscConnect({
  siteUrl,
  onConnect,
  oauthClientConfigured,
  saConfigured,
  saEmail,
  setupHint,
}: {
  siteUrl: string
  onConnect: () => void
  oauthClientConfigured?: boolean
  saConfigured?: boolean
  saEmail?: string | null
  setupHint?: string[]
}) {
  const [loading, setLoading] = React.useState(false)
  const [err, setErr] = React.useState<string | null>(null)

  const handleConnect = async () => {
    setLoading(true)
    setErr(null)
    try {
      const res = await fetch('/api/content-studio/gsc/auth', { credentials: 'same-origin' })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      if (!data.authUrl) throw new Error('No authUrl returned')
      window.location.href = data.authUrl
    } catch (e) {
      console.error('GSC auth error:', e)
      setErr(e instanceof Error ? e.message : 'Connect failed')
      setLoading(false)
    }
  }

  return (
    <div style={{
      background: C.surface, border: `2px dashed ${C.border}`, borderRadius: 12,
      padding: 40, textAlign: 'center',
    }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
      <h3 style={{ fontFamily: C.serif, fontSize: 20, color: C.text, margin: '0 0 8px' }}>
        Connect Google Search Console
      </h3>
      <p style={{ color: C.textMuted, fontSize: 13, maxWidth: 480, margin: '0 auto 20px' }}>
        Live demand for <strong>{siteUrl || 'your estate'}</strong>. Prefer the{' '}
        <strong>service account</strong> (automation) — OAuth is optional for interactive login.
      </p>

      {saConfigured && (
        <div style={{
          background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 8,
          padding: '10px 14px', fontSize: 12, color: '#92400E', marginBottom: 16, textAlign: 'left',
        }}>
          Service account JSON is on the Worker{saEmail ? ` (${saEmail})` : ''}.
          If live API returns 403, add that email as a <strong>Full</strong> user on each GSC property.
          Content Studio still uses the CSV snapshot until live access works.
        </div>
      )}

      <button
        onClick={handleConnect}
        disabled={loading || oauthClientConfigured === false}
        style={{
          padding: '10px 28px', borderRadius: 8, border: 'none',
          cursor: loading ? 'wait' : oauthClientConfigured === false ? 'not-allowed' : 'pointer',
          background: oauthClientConfigured === false ? '#94A3B8' : '#1a73e8',
          color: '#fff', fontSize: 14, fontWeight: 600, fontFamily: 'inherit',
          opacity: oauthClientConfigured === false ? 0.85 : 1,
        }}
      >
        {loading
          ? 'Redirecting to Google...'
          : oauthClientConfigured === false
            ? 'OAuth client not configured'
            : 'Connect Google Search Console (OAuth)'}
      </button>

      {err && (
        <p style={{ fontSize: 12, color: C.red, marginTop: 12, maxWidth: 520, marginLeft: 'auto', marginRight: 'auto' }}>
          {err}
        </p>
      )}

      <p style={{ fontSize: 11, color: C.textDim, marginTop: 12, maxWidth: 520, margin: '12px auto 0' }}>
        {saConfigured
          ? 'Service account is on the Worker — factory already uses live GSC without this button. OAuth is only for personal-login analytics in this panel.'
          : oauthClientConfigured
            ? 'OAuth client is configured. Click Connect to authorize read-only GSC access.'
            : 'Missing GSC credentials on the Worker. Preferred: GSC_SERVICE_ACCOUNT_JSON + GSC_SITE_URL. Optional OAuth: GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET.'}
      </p>
      {setupHint && setupHint.length > 0 && (
        <ul style={{ fontSize: 11, color: C.textMuted, textAlign: 'left', maxWidth: 480, margin: '12px auto 0' }}>
          {setupHint.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Keyword Rankings Table ──

function KeywordTable({ rows, dimension }: { rows: GscRow[]; dimension: string }) {
  const [sortBy, setSortBy] = React.useState<'clicks' | 'impressions' | 'ctr' | 'position'>('clicks')
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('desc')

  const sorted = [...rows].sort((a, b) => {
    const va = a[sortBy], vb = b[sortBy]
    return sortDir === 'desc' ? vb - va : va - vb
  })

  const toggleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortBy(col); setSortDir('desc') }
  }

  const sortArrow = (col: typeof sortBy) =>
    sortBy === col ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''

  // Sparkline bar for position (inverted: lower = better = longer bar)
  const maxPos = Math.max(...rows.map(r => r.position), 1)

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: `2px solid ${C.border}` }}>
            <th style={thStyle(dimension === 'query' ? 280 : 200)}
              onClick={() => toggleSort('clicks')}>
              <span style={sortHeaderStyle}>Clicks{sortArrow('clicks')}</span>
            </th>
            <th style={thStyle(100)}
              onClick={() => toggleSort('impressions')}>
              <span style={sortHeaderStyle}>Impr.{sortArrow('impressions')}</span>
            </th>
            <th style={thStyle(70)}
              onClick={() => toggleSort('ctr')}>
              <span style={sortHeaderStyle}>CTR{sortArrow('ctr')}</span>
            </th>
            <th style={thStyle(80)}
              onClick={() => toggleSort('position')}>
              <span style={sortHeaderStyle}>Pos.{sortArrow('position')}</span>
            </th>
            <th style={{ ...thStyle(120) }}>Position Bar</th>
          </tr>
        </thead>
        <tbody>
          {sorted.slice(0, 50).map((row, i) => (
            <tr key={i} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? C.surface : C.surface2 }}>
              <td style={tdStyle}>
                <div style={{ fontWeight: 600, fontSize: 13, color: C.text }}>
                  {row.keys[0]}
                </div>
              </td>
              <td style={{ ...tdStyle, textAlign: 'center', fontFamily: C.mono, fontWeight: 600, color: C.blue }}>
                {row.clicks.toLocaleString()}
              </td>
              <td style={{ ...tdStyle, textAlign: 'center', fontFamily: C.mono, color: C.textMuted }}>
                {row.impressions.toLocaleString()}
              </td>
              <td style={{ ...tdStyle, textAlign: 'center', fontFamily: C.mono, color: row.ctr > 5 ? C.green : C.textMuted }}>
                {row.ctr}%
              </td>
              <td style={{ ...tdStyle, textAlign: 'center', fontFamily: C.mono, color: row.position < 5 ? C.green : row.position < 10 ? C.orange : C.textMuted }}>
                {row.position}
              </td>
              <td style={{ ...tdStyle }}>
                <div style={{ position: 'relative', height: 6, background: C.surface3, borderRadius: 3 }}>
                  <div style={{
                    position: 'absolute', left: 0, top: 0, height: 6, borderRadius: 3,
                    width: `${Math.max(5, ((maxPos - row.position + 1) / maxPos) * 100)}%`,
                    background: row.position <= 3 ? C.green : row.position <= 10 ? C.orange : C.textDim,
                    transition: 'width 0.3s ease',
                  }} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const thStyle = (w: number): React.CSSProperties => ({
  padding: '10px 12px', textAlign: 'left', fontSize: 10, fontWeight: 600,
  color: C.textDim, textTransform: 'uppercase', fontFamily: C.mono,
  letterSpacing: '0.06em', minWidth: w, cursor: 'pointer',
})

const sortHeaderStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 2, userSelect: 'none',
}

const tdStyle: React.CSSProperties = {
  padding: '10px 12px', fontSize: 12, color: C.text, verticalAlign: 'middle',
}

// ── Summary cards ──

function GscSummary({ rows, onRefresh, loading }: { rows: GscRow[]; onRefresh: () => void; loading: boolean }) {
  const totalClicks = rows.reduce((s, r) => s + r.clicks, 0)
  const totalImpressions = rows.reduce((s, r) => s + r.impressions, 0)
  const avgCtr = rows.length > 0 ? Math.round(rows.reduce((s, r) => s + r.ctr, 0) / rows.length * 100) / 100 : 0
  const avgPosition = rows.length > 0 ? Math.round(rows.reduce((s, r) => s + r.position, 0) / rows.length * 10) / 10 : 0
  const topKeywords = rows.filter(r => r.position <= 3).length

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
      {[
        { label: 'Total Clicks', value: totalClicks.toLocaleString(), color: C.blue },
        { label: 'Impressions', value: totalImpressions.toLocaleString(), color: C.purple },
        { label: 'Avg CTR', value: `${avgCtr}%`, color: C.green },
        { label: 'Avg Position', value: avgPosition.toFixed(1), color: C.orange },
        { label: 'Top 3 Keywords', value: topKeywords, color: C.gold },
      ].map(c => (
        <div key={c.label} style={{
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
          padding: '14px 16px', borderTop: `3px solid ${c.color}`,
        }}>
          <div style={{ fontSize: 10, color: C.textMuted, textTransform: 'uppercase', fontFamily: C.mono, letterSpacing: '0.06em' }}>
            {c.label}
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: C.text, marginTop: 4, fontFamily: C.serif }}>
            {c.value}
          </div>
        </div>
      ))}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <button onClick={onRefresh} disabled={loading} style={{
          padding: '8px 16px', borderRadius: 6, border: `1px solid ${C.border}`,
          background: C.surface, color: C.text, cursor: loading ? 'wait' : 'pointer',
          fontSize: 12, fontFamily: 'inherit',
        }}>
          {loading ? '⏳' : '🔄'} Refresh
        </button>
      </div>
    </div>
  )
}

// ── Main component ──

type GscStatus = {
  connected: boolean
  email?: string
  mode?: string | null
  oauthClientConfigured?: boolean
  saConfigured?: boolean
  serviceAccountEmail?: string | null
  setup?: { envRequired?: string[] }
}

export default function AdminGscDashboard({ siteUrl, onConnect, onDisconnect }: GscDashboardProps) {
  const [status, setStatus] = React.useState<GscStatus | null>(null)
  const [rows, setRows] = React.useState<GscRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [dimension, setDimension] = React.useState<'query' | 'page'>('query')
  const [dateRange, setDateRange] = React.useState({ start: '30daysAgo', end: 'today' })
  const [error, setError] = React.useState<string | null>(null)

  // Check GSC connection status
  React.useEffect(() => {
    fetch('/api/content-studio/gsc/status', { credentials: 'same-origin' })
      .then(async (r) => {
        const s = await r.json()
        if (!r.ok) throw new Error(s.error || 'Status failed')
        setStatus(s)
      })
      .catch(() => setStatus({ connected: false, oauthClientConfigured: false, saConfigured: false }))
  }, [])

  // Pull GSC data when connected
  const fetchData = React.useCallback(async () => {
    if (!status?.connected) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/content-studio/gsc/data', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteUrl,
          startDate: dateRange.start,
          endDate: dateRange.end,
          dimensions: [dimension],
          rowLimit: 100,
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setRows(data.rows ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load GSC data')
    } finally {
      setLoading(false)
    }
  }, [status?.connected, siteUrl, dimension, dateRange])

  React.useEffect(() => { fetchData() }, [fetchData])

  if (!status) return <div style={{ padding: 20, color: C.textDim, textAlign: 'center' }}>Checking GSC status...</div>

  if (!status.connected) {
    return (
      <GscConnect
        siteUrl={siteUrl}
        onConnect={onConnect}
        oauthClientConfigured={status.oauthClientConfigured}
        saConfigured={status.saConfigured}
        saEmail={status.serviceAccountEmail}
        setupHint={status.setup?.envRequired}
      />
    )
  }

  return (
    <div>
      {/* Connected badge */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 16, padding: '10px 16px', background: '#F0FDF4',
        border: '1px solid #BBF7D0', borderRadius: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: C.green, fontWeight: 600, fontSize: 12 }}>● Connected</span>
          <span style={{ fontSize: 12, color: C.textMuted, fontFamily: C.mono }}>{status.email}</span>
        </div>
        <button onClick={onDisconnect} style={{
          background: 'none', border: 'none', color: C.textDim, cursor: 'pointer', fontSize: 11,
          textDecoration: 'underline',
        }}>
          Disconnect
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 6, padding: '8px 14px', fontSize: 12, color: C.red, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <select value={dimension} onChange={e => setDimension(e.target.value as any)} style={selStyle}>
          <option value="query">By Search Query</option>
          <option value="page">By Page URL</option>
        </select>
        <select value={`${dateRange.start}|${dateRange.end}`} onChange={(ev) => {
          const [s, end] = ev.target.value.split('|')
          setDateRange({ start: s, end })
        }} style={selStyle}>
          <option value="7daysAgo|today">Last 7 days</option>
          <option value="30daysAgo|today">Last 30 days</option>
          <option value="90daysAgo|today">Last 3 months</option>
        </select>
      </div>

      {/* Summary */}
      <GscSummary rows={rows} onRefresh={fetchData} loading={loading} />

      {/* Table */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.textDim }}>Loading GSC data...</div>
      ) : rows.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.textDim }}>
          No data for this date range.
        </div>
      ) : (
        <KeywordTable rows={rows} dimension={dimension} />
      )}
    </div>
  )
}

const selStyle: React.CSSProperties = {
  padding: '6px 10px', borderRadius: 6, border: `1px solid rgba(0,0,0,0.12)`,
  background: '#fff', fontSize: 12, fontFamily: 'inherit',
}
