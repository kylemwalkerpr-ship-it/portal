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

interface GscTotals {
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

type TabKey = 'query' | 'page' | 'device' | 'country' | 'indexing'

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

// ── Rankings table (sortable, with click + position bars) ──

function RankingTable({ rows, label }: { rows: GscRow[]; label: string }) {
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

  const maxClicks = Math.max(...rows.map(r => r.clicks), 1)
  const maxPos = Math.max(...rows.map(r => r.position), 1)

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: `2px solid ${C.border}` }}>
            <th style={thStyle(label === 'Queries' || label === 'Pages' ? 280 : 160)}>
              {label}
            </th>
            <th style={thStyle(100)} onClick={() => toggleSort('clicks')}>
              <span style={sortHeaderStyle}>Clicks{sortArrow('clicks')}</span>
            </th>
            <th style={thStyle(100)} onClick={() => toggleSort('impressions')}>
              <span style={sortHeaderStyle}>Impr.{sortArrow('impressions')}</span>
            </th>
            <th style={thStyle(70)} onClick={() => toggleSort('ctr')}>
              <span style={sortHeaderStyle}>CTR{sortArrow('ctr')}</span>
            </th>
            <th style={thStyle(80)} onClick={() => toggleSort('position')}>
              <span style={sortHeaderStyle}>Pos.{sortArrow('position')}</span>
            </th>
            <th style={{ ...thStyle(120) }}>Clicks Bar</th>
          </tr>
        </thead>
        <tbody>
          {sorted.slice(0, 50).map((row, i) => (
            <tr key={i} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? C.surface : C.surface2 }}>
              <td style={tdStyle}>
                <div style={{ fontWeight: 600, fontSize: 13, color: C.text, maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
                    width: `${Math.max(5, (row.clicks / maxClicks) * 100)}%`,
                    background: row.clicks / maxClicks > 0.6 ? C.green : row.clicks / maxClicks > 0.3 ? C.gold : C.textDim,
                    transition: 'width 0.3s ease',
                  }} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ fontSize: 11, color: C.textDim, padding: '8px 12px', fontFamily: C.mono }}>
        Position bar: max position {maxPos.toFixed(1)}
      </div>
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

// ── Summary cards (real totals when available) ──

function GscSummary({
  totals,
  totalsPrev,
  rows,
  onRefresh,
  loading,
  source,
}: {
  totals: GscTotals | null
  totalsPrev: { clicks: number; impressions: number } | null
  rows: GscRow[]
  onRefresh: () => void
  loading: boolean
  source: string
}) {
  const clicks = totals?.clicks ?? rows.reduce((s, r) => s + r.clicks, 0)
  const impressions = totals?.impressions ?? rows.reduce((s, r) => s + r.impressions, 0)
  const ctr = totals ? Math.round(totals.ctr * 100) / 100 : rows.length > 0 ? Math.round(rows.reduce((s, r) => s + r.ctr, 0) / rows.length * 100) / 100 : 0
  const position = totals ? Math.round(totals.position * 10) / 10 : rows.length > 0 ? Math.round(rows.reduce((s, r) => s + r.position, 0) / rows.length * 10) / 10 : 0
  const clicksDelta = totalsPrev ? Math.round(((clicks - totalsPrev.clicks) / Math.max(totalsPrev.clicks, 1)) * 100) : null

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
      {[
        { label: 'Total Clicks', value: clicks.toLocaleString(), color: C.blue, delta: clicksDelta !== null ? `${clicksDelta >= 0 ? '+' : ''}${clicksDelta}% vs prev` : null },
        { label: 'Impressions', value: impressions.toLocaleString(), color: C.purple },
        { label: 'CTR', value: `${ctr}%`, color: C.green },
        { label: 'Avg Position', value: position.toFixed(1), color: C.orange },
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
          {c.delta && (
            <div style={{ fontSize: 10, color: c.delta.startsWith('+') ? C.green : C.textDim, marginTop: 2, fontFamily: C.mono }}>
              {c.delta}
            </div>
          )}
        </div>
      ))}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexDirection: 'column' }}>
        <button onClick={onRefresh} disabled={loading} style={{
          padding: '8px 16px', borderRadius: 6, border: `1px solid ${C.border}`,
          background: C.surface, color: C.text, cursor: loading ? 'wait' : 'pointer',
          fontSize: 12, fontFamily: 'inherit',
        }}>
          {loading ? '⏳' : '🔄'} Refresh
        </button>
        <span style={{ fontSize: 10, color: C.textDim, fontFamily: C.mono }}>
          {source === 'live' ? '● live' : '◌ snapshot'}
        </span>
      </div>
    </div>
  )
}

// ── Indexing (why pages aren't indexed + fix) ──

type IndexIssueRow = {
  url: string
  reasonCode: string
  reason: string
  fixAction: string
  fixLabel: string
  autoFix: boolean
  indexed: boolean
  repo?: string | null
  path?: string | null
  title?: string | null
  words?: number | null
  coverageState?: string | null
  verdict?: string | null
}

type FixSummary = {
  fixed: number
  delegated: number
  recommended: number
  skipped: number
  failed: number
  requested: number
}

const REASON_COLOR: Record<string, string> = {
  NOINDEX_TAG: C.red,
  NOINDEX_HTTP_HEADER: C.red,
  BLOCKED_ROBOTS_TXT: C.orange,
  DUPLICATE_NO_CANONICAL: C.orange,
  DUPLICATE_CHOSEN_CANONICAL: C.orange,
  SOFT_404: C.orange,
  NOT_FOUND_404: C.red,
  SERVER_ERROR_5XX: C.red,
  REDIRECT_ERROR: C.orange,
  PAGE_WITH_REDIRECT: C.orange,
  ACCESS_DENIED_401: C.red,
  ACCESS_FORBIDDEN_403: C.red,
  BLOCKED_4XX: C.red,
  DISCOVERED_NOT_INDEXED: C.purple,
  CRAWLED_NOT_INDEXED: C.purple,
  SUBMITTED_NOT_INDEXED: C.purple,
  UNKNOWN_TO_GOOGLE: C.purple,
  UNKNOWN: C.textDim,
  INDEXED_BLOCKED_ROBOTS: C.gold,
}

function GscIndexingPanel() {
  const [rows, setRows] = React.useState<IndexIssueRow[] | null>(null)
  const [scanning, setScanning] = React.useState(false)
  const [fixing, setFixing] = React.useState<string | 'all' | null>(null)
  const [summary, setSummary] = React.useState<FixSummary | null>(null)
  const [prUrls, setPrUrls] = React.useState<string[]>([])
  const [note, setNote] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const loadCached = React.useCallback(async () => {
    setError(null)
    try {
      const res = await fetch('/api/content-studio/gsc/index-coverage', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list' }),
      })
      const d = await res.json()
      if (d.error) throw new Error(d.error)
      setRows((d.issues ?? []) as IndexIssueRow[])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load cached coverage')
    }
  }, [])

  React.useEffect(() => { loadCached() }, [loadCached])

  const scan = async () => {
    setScanning(true)
    setError(null)
    setNote(null)
    try {
      const res = await fetch('/api/content-studio/gsc/index-coverage', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'fetch', maxUrls: 250 }),
      })
      const d = await res.json()
      if (d.error) throw new Error(d.error)
      if (!d.configured) throw new Error('GSC not configured — connect a property first')
      setRows((d.issues ?? []) as IndexIssueRow[])
      setNote(`Scanned ${d.inspected} URLs · ${d.issues?.length ?? 0} not indexed · ${d.errors?.length ?? 0} inspect errors`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Index coverage scan failed')
    } finally {
      setScanning(false)
    }
  }

  const fix = async (target: string | 'all') => {
    setFixing(target)
    setError(null)
    setNote(null)
    setSummary(null)
    setPrUrls([])
    try {
      const body = target === 'all' ? { fixAll: true, requestIndexing: true } : { urls: [target], requestIndexing: true }
      const res = await fetch('/api/content-studio/gsc/index-coverage/fix', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await res.json()
      if (d.error) throw new Error(d.error)
      setSummary(d.summary ?? null)
      setPrUrls(d.prUrls ?? [])
      setNote((d.warnings?.length ? d.warnings.join(' · ') + ' — ' : '') + `Fixed ${d.summary?.fixed ?? 0} · requested indexing on ${d.summary?.requested ?? 0}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fix failed')
    } finally {
      setFixing(null)
      loadCached()
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12, color: C.textMuted }}>
          Google's own verdict on why each estate page is (not) indexed — noindex tags, robots.txt blocks, canonical dupes, soft 404s, 4xx/5xx, and "discovered/crawled, not indexed".
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={scan} disabled={scanning} style={{
            padding: '7px 14px', borderRadius: 6, border: `1px solid ${C.border}`,
            background: C.surface, color: C.text, cursor: scanning ? 'wait' : 'pointer', fontSize: 12, fontFamily: 'inherit',
          }}>
            {scanning ? 'Scanning…' : '🔍 Scan index coverage'}
          </button>
          {rows && rows.length > 0 && (
            <button onClick={() => fix('all')} disabled={fixing !== null} style={{
              padding: '7px 14px', borderRadius: 6, border: 'none', background: C.green, color: '#fff',
              cursor: fixing !== null ? 'wait' : 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
            }}>
              {fixing === 'all' ? 'Fixing…' : '⚡ Fix all'}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 6, padding: '8px 14px', fontSize: 12, color: C.red, marginBottom: 12 }}>
          {error}
        </div>
      )}
      {note && (
        <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 6, padding: '8px 14px', fontSize: 12, color: '#1D4ED8', marginBottom: 12 }}>
          {note}
        </div>
      )}
      {summary && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12, fontFamily: C.mono, fontSize: 11 }}>
          <span style={{ color: C.green }}>✔ {summary.fixed} fixed</span>
          <span style={{ color: C.orange }}>→ {summary.recommended} recommended</span>
          <span style={{ color: C.purple }}>↻ {summary.requested} re-index requested</span>
          {summary.failed > 0 && <span style={{ color: C.red }}>✖ {summary.failed} failed</span>}
        </div>
      )}
      {prUrls.length > 0 && (
        <div style={{ marginBottom: 12, fontSize: 12 }}>
          {prUrls.map((u) => (
            <a key={u} href={u} target="_blank" rel="noreferrer" style={{ color: C.blue, display: 'inline-block', marginRight: 12 }}>PR ↗</a>
          ))}
        </div>
      )}

      {rows === null ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.textDim }}>Loading cached coverage…</div>
      ) : rows.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.textDim }}>
          No cached issues. Run <strong>Scan index coverage</strong> to inspect the estate against GSC.
        </div>
      ) : (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${C.border}` }}>
                <th style={{ ...thStyle(220) }}>Page</th>
                <th style={{ ...thStyle(300) }}>Why not indexed</th>
                <th style={{ ...thStyle(70), cursor: 'default' }}>Words</th>
                <th style={{ ...thStyle(150), cursor: 'default' }}>Fix</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 100).map((r) => (
                <tr key={r.url} style={{ borderBottom: `1px solid ${C.border}`, background: C.surface }}>
                  <td style={{ ...tdStyle, verticalAlign: 'top' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{r.title || r.url.split('/').filter(Boolean).pop() || r.url}</div>
                    <a href={r.url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: C.textDim, fontFamily: C.mono, textDecoration: 'none' }}>{r.url}</a>
                    {r.path && <div style={{ fontSize: 10, color: C.textDim, fontFamily: C.mono }}>{r.repo}:{r.path}</div>}
                  </td>
                  <td style={{ ...tdStyle, verticalAlign: 'top' }}>
                    <span style={{
                      display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700,
                      background: `${REASON_COLOR[r.reasonCode] || C.textDim}18`, color: REASON_COLOR[r.reasonCode] || C.textDim,
                      border: `1px solid ${REASON_COLOR[r.reasonCode] || C.textDim}44`,
                    }}>{r.reasonCode}</span>
                    <div style={{ fontSize: 12, color: C.textMuted, marginTop: 4 }}>{r.reason}</div>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'center', fontFamily: C.mono, fontSize: 12, color: C.textMuted }}>
                    {r.words ?? '—'}
                  </td>
                  <td style={{ ...tdStyle, verticalAlign: 'top' }}>
                    <button onClick={() => fix(r.url)} disabled={fixing !== null} style={{
                      padding: '5px 12px', borderRadius: 6, border: `1px solid ${C.border}`,
                      background: r.autoFix ? C.surface : C.surface3, color: r.autoFix ? C.blue : C.textDim,
                      cursor: fixing !== null ? 'wait' : 'pointer', fontSize: 11, fontFamily: 'inherit', whiteSpace: 'nowrap',
                    }}>
                      {fixing === r.url ? '…' : r.autoFix ? `Fix ${r.fixLabel}` : `⟳ ${r.fixLabel}`}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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

const TABS: { key: TabKey; label: string }[] = [
  { key: 'query', label: 'Queries' },
  { key: 'page', label: 'Pages' },
  { key: 'device', label: 'Devices' },
  { key: 'country', label: 'Countries' },
  { key: 'indexing', label: 'Indexing' },
]

export default function AdminGscDashboard({ siteUrl, onConnect, onDisconnect }: GscDashboardProps) {
  const [status, setStatus] = React.useState<GscStatus | null>(null)
  const [rows, setRows] = React.useState<GscRow[]>([])
  const [pages, setPages] = React.useState<GscRow[]>([])
  const [devices, setDevices] = React.useState<GscRow[]>([])
  const [countries, setCountries] = React.useState<GscRow[]>([])
  const [totals, setTotals] = React.useState<GscTotals | null>(null)
  const [totalsPrev, setTotalsPrev] = React.useState<{ clicks: number; impressions: number } | null>(null)
  const [source, setSource] = React.useState('snapshot')
  const [loading, setLoading] = React.useState(true)
  const [tab, setTab] = React.useState<TabKey>('query')
  const [days, setDays] = React.useState(90)
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
          days,
          rowLimit: 100,
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setRows(data.rows ?? [])
      setPages(data.pages ?? [])
      setDevices(data.devices ?? [])
      setCountries(data.countries ?? [])
      setTotals(data.totals ?? null)
      setTotalsPrev(data.totalsPrev ?? null)
      setSource(data.source ?? 'snapshot')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load GSC data')
    } finally {
      setLoading(false)
    }
  }, [status?.connected, siteUrl, days])

  React.useEffect(() => { fetchData() }, [fetchData])

  const activeRows =
    tab === 'page' ? pages
    : tab === 'device' ? devices
    : tab === 'country' ? countries
    : rows

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ color: C.green, fontWeight: 600, fontSize: 12 }}>● Connected</span>
          <span style={{ fontSize: 12, color: C.textMuted, fontFamily: C.mono }}>{status.email}</span>
          {status.mode && (
            <span style={{ fontSize: 11, color: C.textDim, fontFamily: C.mono, background: C.surface3, padding: '2px 8px', borderRadius: 10 }}>
              {status.mode === 'service_account' ? 'service account' : status.mode}
            </span>
          )}
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

      {/* Range */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: C.textMuted, textTransform: 'uppercase', fontFamily: C.mono, letterSpacing: '0.06em' }}>
          Range
        </span>
        {[7, 28, 90].map(d => (
          <button key={d} onClick={() => setDays(d)} style={{
            padding: '6px 14px', borderRadius: 6, border: `1px solid ${days === d ? C.gold : 'rgba(0,0,0,0.12)'}`,
            background: days === d ? '#FFF9EB' : '#fff', color: days === d ? C.gold : C.text,
            fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', fontWeight: days === d ? 700 : 400,
          }}>
            {d}d
          </button>
        ))}
      </div>

      {/* Summary */}
      <GscSummary totals={totals} totalsPrev={totalsPrev} rows={rows} onRefresh={fetchData} loading={loading} source={source} />

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: `2px solid ${C.border}` }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '9px 18px', border: 'none', background: 'none',
            borderBottom: tab === t.key ? `2px solid ${C.gold}` : '2px solid transparent',
            color: tab === t.key ? C.text : C.textDim,
            fontWeight: tab === t.key ? 600 : 400,
            cursor: 'pointer', fontSize: 13, fontFamily: 'inherit',
            transition: 'all 0.15s ease',
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Table / Indexing panel */}
      {tab === 'indexing' ? (
        <GscIndexingPanel />
      ) : loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.textDim }}>Loading GSC data...</div>
      ) : activeRows.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.textDim }}>
          {source === 'snapshot' && tab !== 'query' && tab !== 'page'
            ? 'Device / country breakdown requires live GSC data (service account or OAuth).'
            : 'No data for this date range.'}
        </div>
      ) : (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
          <RankingTable rows={activeRows} label={TABS.find(t => t.key === tab)?.label ?? 'Items'} />
        </div>
      )}
    </div>
  )
}
