'use client'
import React from 'react'
const AdminSeoFactory = React.lazy(() => import('./admin-seo-factory'))

// ── Color tokens (match admin-templates.tsx) ──
const C = {
  bg: '#F7F8FA', surface: '#FFFFFF', surface2: '#F4F2EE', surface3: '#EBEDF0',
  border: 'rgba(0,0,0,0.08)', cyan: '#3C3B6E', red: '#DC2626', green: '#166534',
  orange: '#D97706', purple: '#7C3AED', text: '#1F2937', textMuted: '#6B7280',
  textDim: '#9CA3AF', gold: '#9A7B3B', navy: '#0F172A', blue: '#2563EB',
  serif: "var(--portal-font-display, 'Cormorant Garamond', 'Garamond', Georgia, 'Times New Roman', serif)",
  mono: "var(--portal-font-mono, 'SF Mono', 'Menlo', 'Monaco', 'Consolas', monospace)",
}

// ── Types ──
type ContentType = 'blog_post' | 'article' | 'regional_page' | 'marketplace_gig'
type Tone = 'professional' | 'educational' | 'persuasive' | 'authoritative' | 'casual'
type Region = 'US' | 'CA' | 'AU' | 'UK' | 'COMPARE'
type JobStatus = 'pending' | 'drafting' | 'publishing' | 'pr_created' | 'merged' | 'closed' | 'failed'

interface ContentJob {
  id: string; title: string; topic: string; content_type: ContentType
  tone: Tone; region: Region; target_repo: string; status: JobStatus
  slug: string | null; content: string | null; branch_name: string | null
  content_path: string | null; pr_url: string | null; pr_number: number | null
  merged_at: string | null; closed_at: string | null; error_message: string | null
  ai_provider: string | null; word_count: number | null; seo_score: number | null
  created_at: string; updated_at: string
}

interface ContentStudioProps {
  services: any[]; refreshAdminData: () => void; setActionNotice: (msg: string) => void
}

interface InterlinkSuggestion {
  label: string; url: string; site: string; kind: string; priority: number
  matchedOn: string[]; note?: string
}

interface GscMiniStats {
  clicks: number; impressions: number; ctr: number; position: number
  topQuery: string; topQueryClicks: number
}

// ── Helpers ──

const REGION_OPTIONS: { value: Region; label: string; flag: string }[] = [
  { value: 'US', label: 'United States', flag: '🇺🇸' },
  { value: 'CA', label: 'Canada', flag: '🇨🇦' },
  { value: 'AU', label: 'Australia', flag: '🇦🇺' },
  { value: 'UK', label: 'United Kingdom', flag: '🇬🇧' },
  { value: 'COMPARE', label: 'Cross-Country Comparison', flag: '🔀' },
]

const TONE_OPTIONS: { value: Tone; label: string }[] = [
  { value: 'professional', label: 'Professional' },
  { value: 'educational', label: 'Educational' },
  { value: 'persuasive', label: 'Persuasive' },
  { value: 'authoritative', label: 'Authoritative' },
  { value: 'casual', label: 'Casual' },
]

const CONTENT_TYPE_OPTIONS: { value: ContentType; label: string; ext: string; repo: string; icon: string }[] = [
  { value: 'blog_post', label: 'Blog Post', ext: '.md', repo: 'caseworks', icon: '📝' },
  { value: 'article', label: 'Long-Form Article', ext: '.mdx', repo: 'caseworks', icon: '📄' },
  { value: 'regional_page', label: 'Regional Page', ext: '.mdx', repo: 'yousafe-consultancy', icon: '🌐' },
  { value: 'marketplace_gig', label: 'Marketplace Gig', ext: '.mdx', repo: 'portal', icon: '🏪' },
]

function statusBadge(status: JobStatus) {
  const map: Record<JobStatus, { label: string; bg: string; fg: string; dot: string }> = {
    pending:    { label: 'Queued',     bg: '#F3F4F6', fg: '#6B7280', dot: '#9CA3AF' },
    drafting:   { label: 'Drafting',   bg: '#FEF3C7', fg: '#D97706', dot: '#F59E0B' },
    publishing: { label: 'Opening PR', bg: '#DBEAFE', fg: '#3B82F6', dot: '#60A5FA' },
    pr_created: { label: 'PR Ready',   bg: '#DBEAFE', fg: '#2563EB', dot: '#3B82F6' },
    merged:     { label: 'Merged',     bg: '#D1FAE5', fg: '#166534', dot: '#10B981' },
    closed:     { label: 'Closed',     bg: '#F3F4F6', fg: '#6B7280', dot: '#9CA3AF' },
    failed:     { label: 'Failed',     bg: '#FEE2E2', fg: '#DC2626', dot: '#EF4444' },
  }
  const s = map[status]
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 600, background: s.bg, color: s.fg }}>
    <span style={{ width: 5, height: 5, borderRadius: 999, background: s.dot }} />{s.label}
  </span>
}

function statusStepper(status: JobStatus) {
  const steps: { key: JobStatus; label: string }[] = [
    { key: 'pending', label: 'Queued' },
    { key: 'drafting', label: 'Drafting' },
    { key: 'publishing', label: 'PR' },
    { key: 'pr_created', label: 'PR Ready' },
    { key: 'merged', label: 'Merged' },
  ]
  const currentIdx = steps.findIndex(s => s.key === status)
  const isFailed = status === 'failed'
  const isClosed = status === 'closed'
  if (isFailed) return <span style={{ fontSize: 10, color: C.red, fontWeight: 600, fontFamily: C.mono }}>⚠ Failed</span>
  if (isClosed) return <span style={{ fontSize: 10, color: C.textDim, fontWeight: 600, fontFamily: C.mono }}>✕ Closed</span>
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
      {steps.map((s, i) => {
        const done = i < currentIdx
        const active = i === currentIdx
        const future = i > currentIdx
        const color = done ? C.green : active ? C.gold : C.textDim
        const bg = done ? C.green : active ? C.gold : 'transparent'
        return (
          <React.Fragment key={s.key}>
            {i > 0 && <span style={{ width: 12, height: 1, background: done ? C.green : C.border, flexShrink: 0 }} />}
            <span title={s.label} style={{
              width: 8, height: 8, borderRadius: 999, flexShrink: 0,
              background: active ? bg : 'transparent',
              border: `2px solid ${color}`,
            }} />
          </React.Fragment>
        )
      })}
    </div>
  )
}

function formatDate(iso: string) {
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
  catch { return iso }
}

function timeAgo(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  } catch { return '' }
}

// ── Summary Cards ──

function SummaryCards({ jobs }: { jobs: ContentJob[] }) {
  const total = jobs.length
  const merged = jobs.filter(j => j.status === 'merged').length
  const inProgress = jobs.filter(j => !['merged', 'closed', 'failed'].includes(j.status)).length
  const prReady = jobs.filter(j => j.status === 'pr_created').length
  const failed = jobs.filter(j => j.status === 'failed').length
  const cards = [
    { label: 'Total Jobs', value: total, color: C.cyan, icon: '📋' },
    { label: 'In Progress', value: inProgress, color: C.orange, icon: '⚙️' },
    { label: 'PR Ready', value: prReady, color: C.blue, icon: '🔀' },
    { label: 'Merged', value: merged, color: C.green, icon: '✅' },
    { label: 'Failed', value: failed, color: C.red, icon: '⚠️' },
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 16 }}>
      {cards.map(c => (
        <div key={c.label} style={{
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
          padding: '14px 16px', borderTop: `3px solid ${c.color}`,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 22 }}>{c.icon}</span>
          <div>
            <div style={{ fontSize: 10, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: C.mono }}>{c.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: C.text, fontFamily: C.serif }}>{c.value}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Quick Create Panel (collapsible) ──

function QuickCreate({
  expanded, onToggle, generating, onGenerate,
  topic, keywords, onTopicChange, onKeywordsChange,
}: {
  expanded: boolean; onToggle: () => void; generating: boolean
  onGenerate: (data: any) => void
  topic: string; keywords: string; onTopicChange: (v: string) => void; onKeywordsChange: (v: string) => void
}) {
  const [contentType, setContentType] = React.useState<ContentType>('blog_post')
  const [region, setRegion] = React.useState<Region>('US')
  const [tone, setTone] = React.useState<Tone>('educational')
  const [title, setTitle] = React.useState('')
  const [audience, setAudience] = React.useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!topic.trim()) return
    onGenerate({
      content_type: contentType, region, tone,
      title: title.trim(), topic: topic.trim(),
      audience: audience.trim(),
      keywords: keywords.split(',').map(s => s.trim()).filter(Boolean),
    })
  }

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
      <button onClick={onToggle} style={{
        width: '100%', padding: '14px 18px', border: 'none', background: 'none',
        cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        fontFamily: 'inherit',
      }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: C.text, fontFamily: C.serif, textAlign: 'left' }}>
            ✨ Quick Create
          </h3>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: C.textMuted, textAlign: 'left' }}>
            AI drafts → GitHub PR. Lands in caseworks, consultancy, or portal.
          </p>
        </div>
        <span style={{ fontSize: 18, color: C.textDim, transition: 'transform 0.2s', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
      </button>
      {expanded && (
        <form onSubmit={handleSubmit} style={{ padding: '0 18px 18px', borderTop: `1px solid ${C.border}` }}>
          {/* Content type */}
          <div style={{ marginTop: 14, marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: C.textMuted, textTransform: 'uppercase', marginBottom: 6, fontFamily: C.mono }}>
              Content Type
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 6 }}>
              {CONTENT_TYPE_OPTIONS.map(opt => (
                <button key={opt.value} type="button" onClick={() => setContentType(opt.value)} style={{
                  textAlign: 'left', padding: '8px 10px', borderRadius: 6,
                  border: contentType === opt.value ? `2px solid ${C.gold}` : `1px solid ${C.border}`,
                  background: contentType === opt.value ? C.surface2 : C.surface,
                  cursor: 'pointer', fontSize: 11, color: C.text, fontFamily: 'inherit',
                }}>
                  <span style={{ marginRight: 4 }}>{opt.icon}</span>
                  <span style={{ fontWeight: 600 }}>{opt.label}</span>
                  <span style={{ display: 'block', fontSize: 9, color: C.textDim, marginTop: 1 }}>{opt.ext} → {opt.repo}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Region + Tone */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>Region</label>
              <select value={region} onChange={e => setRegion(e.target.value as Region)} style={inputStyle}>
                {REGION_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.flag} {r.label}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Tone</label>
              <select value={tone} onChange={e => setTone(e.target.value as Tone)} style={inputStyle}>
                {TONE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>

          {/* Title */}
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Title <span style={{ color: C.textDim, fontWeight: 400 }}>(optional)</span></label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. F-1 OPT Application: Complete 2026 Timeline" maxLength={120} style={inputStyle} />
          </div>

          {/* Topic */}
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Topic <span style={{ color: C.red }}>*</span></label>
            <textarea value={topic} onChange={e => onTopicChange(e.target.value)} rows={3} required style={{ ...inputStyle, resize: 'vertical' }}
              placeholder="Describe what to write — visa types, forms, timelines, comparison angles..." />
          </div>

          {/* Audience + Keywords */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>Audience</label>
              <input value={audience} onChange={e => setAudience(e.target.value)} placeholder="international students, H-1B holders..." style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Keywords (comma-separated)</label>
              <input value={keywords} onChange={e => onKeywordsChange(e.target.value)} placeholder="F-1 visa, OPT timeline, I-765..." style={inputStyle} />
            </div>
          </div>

          <button type="submit" disabled={generating || !topic.trim()} style={{
            width: '100%', padding: '10px 0', borderRadius: 6, border: 'none',
            cursor: generating ? 'not-allowed' : 'pointer',
            background: generating ? C.textDim : C.navy, color: '#FFFFFF',
            fontSize: 13, fontWeight: 600, fontFamily: 'inherit', opacity: generating ? 0.6 : 1,
          }}>
            {generating ? '⚡ Generating…' : '⚡ Generate & Open PR'}
          </button>
        </form>
      )}
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 10, fontWeight: 600, color: C.textMuted,
  textTransform: 'uppercase', marginBottom: 5, fontFamily: C.mono,
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px', borderRadius: 6, border: `1px solid ${C.border}`,
  background: C.surface, color: C.text, fontSize: 12, fontFamily: 'inherit',
  boxSizing: 'border-box',
}

// ── Interlinks Mini Panel ──

function InterlinksMini({ topic, keywords }: { topic: string; keywords: string }) {
  const [suggestions, setSuggestions] = React.useState<InterlinkSuggestion[]>([])
  const [loading, setLoading] = React.useState(false)
  const [fetched, setFetched] = React.useState(false)
  const kwArr = keywords.split(',').map(s => s.trim()).filter(Boolean)

  const fetchLinks = React.useCallback(async () => {
    if (!topic.trim() && kwArr.length === 0) return
    setLoading(true)
    setFetched(true)
    try {
      const res = await fetch('/api/content-studio/interlinks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topic.trim(), keywords: kwArr, maxResults: 4 }),
      })
      const data = await res.json()
      if (res.ok) setSuggestions(data.suggestions ?? [])
    } catch {} finally { setLoading(false) }
  }, [topic, keywords])

  const siteIcon = (s: string) => s === 'marketplace' ? '🏪' : s === 'caseworks' ? '📚' : '🌐'
  const siteColor = (s: string) => s === 'marketplace' ? C.green : s === 'caseworks' ? C.navy : C.orange

  if (!fetched && !topic.trim() && kwArr.length === 0) return null

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: suggestions.length > 0 ? `1px solid ${C.border}` : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h4 style={{ margin: 0, fontSize: 12, fontWeight: 700, color: C.text, fontFamily: C.serif }}>🔗 Interlink Suggestions</h4>
          <p style={{ margin: '1px 0 0', fontSize: 10, color: C.textDim }}>caseworks → regional → marketplace funnel</p>
        </div>
        <button onClick={fetchLinks} disabled={loading} style={{
          padding: '4px 12px', borderRadius: 4, border: 'none', cursor: 'pointer',
          background: C.navy, color: '#FFF', fontSize: 10, fontWeight: 600, fontFamily: 'inherit',
        }}>
          {loading ? 'Searching…' : fetched ? 'Refresh' : 'Find'}
        </button>
      </div>
      {suggestions.length > 0 && (
        <div style={{ padding: '6px 12px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {suggestions.map((s, i) => (
            <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 4,
              background: C.surface2, textDecoration: 'none', color: C.text, fontSize: 11,
              borderLeft: `2px solid ${siteColor(s.site)}`,
            }}>
              <span style={{ fontSize: 12 }}>{siteIcon(s.site)}</span>
              <span style={{ flex: 1, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</span>
              <span style={{ fontSize: 9, color: C.textDim, fontFamily: C.mono }}>{s.site}</span>
            </a>
          ))}
        </div>
      )}
      {fetched && suggestions.length === 0 && (
        <div style={{ padding: '12px 16px', fontSize: 11, color: C.textDim, textAlign: 'center' }}>
          No matches — try broader keywords
        </div>
      )}
    </div>
  )
}

// ── GSC Mini Stats Card ──

function GscMini() {
  const [stats, setStats] = React.useState<GscMiniStats | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const fetchGsc = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/content-studio/gsc/data', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: 28 }),
      })
      const data = await res.json()
      if (res.ok && data.totals) {
        const top = data.rows?.[0]
        setStats({
          clicks: data.totals.clicks ?? 0,
          impressions: data.totals.impressions ?? 0,
          ctr: data.totals.ctr ?? 0,
          position: data.totals.position ?? 0,
          topQuery: top?.keys?.[0] ?? '—',
          topQueryClicks: top?.clicks ?? 0,
        })
      } else if (data.source === 'snapshot') {
        setStats({
          clicks: data.totals?.clicks ?? 0,
          impressions: data.totals?.impressions ?? 0,
          ctr: 0, position: 0,
          topQuery: data.rows?.[0]?.keys?.[0] ?? '—',
          topQueryClicks: data.rows?.[0]?.clicks ?? 0,
        })
      } else { setError(data.error || 'No data') }
    } catch { setError('Failed to load') } finally { setLoading(false) }
  }

  React.useEffect(() => { fetchGsc() }, [])

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: stats ? `1px solid ${C.border}` : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h4 style={{ margin: 0, fontSize: 12, fontWeight: 700, color: C.text, fontFamily: C.serif }}>📊 GSC Overview (28d)</h4>
        <button onClick={fetchGsc} disabled={loading} style={{
          padding: '4px 10px', borderRadius: 4, border: 'none', cursor: 'pointer',
          background: C.surface3, color: C.textMuted, fontSize: 10, fontWeight: 600, fontFamily: 'inherit',
        }}>{loading ? '…' : '↻'}</button>
      </div>
      {stats && (
        <div style={{ padding: '8px 16px 12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 10 }}>
            {[
              { label: 'Clicks', value: stats.clicks.toLocaleString(), color: C.green },
              { label: 'Impressions', value: stats.impressions.toLocaleString(), color: C.blue },
              { label: 'CTR', value: `${stats.ctr.toFixed(1)}%`, color: C.purple },
              { label: 'Avg Pos', value: stats.position.toFixed(1), color: C.orange },
            ].map(m => (
              <div key={m.label} style={{ background: C.surface2, borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: C.textDim, textTransform: 'uppercase', fontFamily: C.mono }}>{m.label}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: m.color, fontFamily: C.serif, marginTop: 2 }}>{m.value}</div>
              </div>
            ))}
          </div>
          {stats.topQuery !== '—' && (
            <div style={{ fontSize: 10, color: C.textMuted, fontFamily: C.mono }}>
              #1 query: <strong style={{ color: C.text }}>{stats.topQuery}</strong> ({stats.topQueryClicks.toLocaleString()} clicks)
            </div>
          )}
        </div>
      )}
      {error && <div style={{ padding: '10px 16px', fontSize: 10, color: C.textDim }}>{error}</div>}
    </div>
  )
}

// ── Live Pipeline ──

function LivePipeline({ jobs, onSelect }: { jobs: ContentJob[]; onSelect: (j: ContentJob) => void }) {
  const active = jobs.filter(j => !['merged', 'closed', 'failed'].includes(j.status)).slice(0, 6)
  if (active.length === 0) return (
    <div style={{ padding: '20px 16px', textAlign: 'center', fontSize: 12, color: C.textDim }}>
      No active jobs — create one to see the pipeline
    </div>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {active.map(j => (
        <div key={j.id} onClick={() => onSelect(j)} style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6,
          cursor: 'pointer',
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {j.title || '(untitled)'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
              <span style={{ fontSize: 10, color: C.textDim, fontFamily: C.mono }}>{j.content_type?.replace('_', ' ')}</span>
              <span style={{ fontSize: 10, color: C.textDim }}>·</span>
              <span style={{ fontSize: 10, color: C.textDim }}>{j.region}</span>
              <span style={{ fontSize: 10, color: C.textDim }}>·</span>
              <span style={{ fontSize: 10, color: C.textDim }}>{timeAgo(j.created_at)}</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {statusStepper(j.status)}
            {j.pr_url && (
              <a href={j.pr_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                style={{ color: C.blue, textDecoration: 'none', fontSize: 10, fontWeight: 600, fontFamily: C.mono, whiteSpace: 'nowrap' }}>
                PR #{j.pr_number} ↗
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Job History Table ──

function JobHistory({ jobs, expanded, onToggle, onSelect, loading }: {
  jobs: ContentJob[]; expanded: boolean; onToggle: () => void; onSelect: (j: ContentJob) => void; loading: boolean
}) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
      <button onClick={onToggle} style={{
        width: '100%', padding: '11px 16px', border: 'none', background: 'none',
        cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        fontFamily: 'inherit', borderBottom: expanded ? `1px solid ${C.border}` : 'none',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.text, fontFamily: C.serif }}>📋 Job History</span>
          <span style={{ fontSize: 10, color: C.textDim, fontFamily: C.mono }}>{loading ? '...' : jobs.length}</span>
        </div>
        <span style={{ fontSize: 14, color: C.textDim, transition: 'transform 0.2s', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
      </button>
      {expanded && (
        loading ? (
          <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: C.textDim }}>Loading…</div>
        ) : jobs.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 4 }}>📝</div>
            <div style={{ fontSize: 12, color: C.textMuted }}>No jobs yet. Create your first piece above.</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ background: C.surface2 }}>
                  <th style={thStyle}>Title / Topic</th>
                  <th style={thStyle}>Type</th>
                  <th style={thStyle}>Region</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>SEO</th>
                  <th style={thStyle}>PR</th>
                  <th style={thStyle}>Date</th>
                </tr>
              </thead>
              <tbody>
                {jobs.slice(0, expanded ? 50 : 10).map(j => (
                  <tr key={j.id} onClick={() => onSelect(j)} style={{ cursor: 'pointer', borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ ...tdStyle, maxWidth: 220 }}>
                      <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.title || '(untitled)'}</div>
                      <div style={{ fontSize: 10, color: C.textDim, fontFamily: C.mono, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.topic?.slice(0, 60)}</div>
                    </td>
                    <td style={tdStyle}><span style={{ fontSize: 10, color: C.textMuted }}>{j.content_type?.replace('_', ' ')}</span></td>
                    <td style={tdStyle}>{j.region}</td>
                    <td style={tdStyle}>{statusBadge(j.status)}</td>
                    <td style={tdStyle}>{j.seo_score != null ? `${j.seo_score}%` : '—'}</td>
                    <td style={tdStyle}>
                      {j.pr_url ? <a href={j.pr_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ color: C.blue, textDecoration: 'none', fontWeight: 500 }}>PR #{j.pr_number} ↗</a> : '—'}
                    </td>
                    <td style={tdStyle}>{formatDate(j.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  )
}

const thStyle: React.CSSProperties = {
  padding: '8px 10px', fontSize: 9, fontWeight: 600, color: C.textDim,
  textTransform: 'uppercase', fontFamily: C.mono, letterSpacing: '0.06em',
  textAlign: 'left', whiteSpace: 'nowrap',
}

const tdStyle: React.CSSProperties = {
  padding: '8px 10px', fontSize: 11, color: C.text, verticalAlign: 'top',
}

// ── Job Detail Modal ──

function JobDetail({ job, onClose }: { job: ContentJob; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`,
        maxWidth: 720, width: '90vw', maxHeight: '85vh', overflow: 'auto',
        padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: 0, fontFamily: C.serif, fontSize: 18, color: C.text }}>{job.title || '(untitled)'}</h3>
            <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {statusBadge(job.status)}
              {statusStepper(job.status)}
              <span style={{ fontSize: 10, color: C.textMuted, fontFamily: C.mono }}>{job.region} · {job.content_type?.replace('_', ' ')}</span>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: C.textDim }}>×</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: 8, marginBottom: 14 }}>
          {[
            { label: 'Word Count', value: job.word_count ?? '—' },
            { label: 'SEO Score', value: job.seo_score != null ? `${job.seo_score}%` : '—' },
            { label: 'AI Provider', value: job.ai_provider ?? '—' },
            { label: 'Target Repo', value: job.target_repo ?? '—' },
          ].map(m => (
            <div key={m.label} style={{ background: C.surface2, borderRadius: 6, padding: '8px 10px' }}>
              <div style={{ fontSize: 9, color: C.textDim, textTransform: 'uppercase', fontFamily: C.mono }}>{m.label}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginTop: 2 }}>{m.value}</div>
            </div>
          ))}
        </div>

        {(job.branch_name || job.content_path) && (
          <div style={{ marginBottom: 12, fontFamily: C.mono, fontSize: 10, color: C.textMuted, lineHeight: 1.8 }}>
            {job.branch_name && <div>branch: <span style={{ color: C.text }}>{job.branch_name}</span></div>}
            {job.content_path && <div>file: <span style={{ color: C.text }}>{job.content_path}</span></div>}
          </div>
        )}

        {job.error_message && (
          <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 6, padding: '10px 14px', fontSize: 11, color: C.red, marginBottom: 14, fontFamily: C.mono }}>
            {job.error_message}
          </div>
        )}

        {job.content && (
          <details open>
            <summary style={{ cursor: 'pointer', fontSize: 11, fontWeight: 600, color: C.textMuted, fontFamily: C.mono, marginBottom: 6 }}>
              Generated Content
            </summary>
            <pre style={{ maxHeight: 280, overflow: 'auto', background: C.surface3, borderRadius: 6, padding: 12, fontSize: 10, fontFamily: C.mono, lineHeight: 1.6, color: C.text, whiteSpace: 'pre-wrap', border: `1px solid ${C.border}` }}>
              {job.content}
            </pre>
          </details>
        )}
      </div>
    </div>
  )
}

// ── Main Component ──

export default function AdminContentStudio({ services: _services, refreshAdminData: _refreshAdminData, setActionNotice }: ContentStudioProps) {
  const [jobs, setJobs] = React.useState<ContentJob[]>([])
  const [loading, setLoading] = React.useState(true)
  const [generating, setGenerating] = React.useState(false)
  const [selectedJob, setSelectedJob] = React.useState<ContentJob | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [showFactory, setShowFactory] = React.useState(false)
  const [createExpanded, setCreateExpanded] = React.useState(true)
  const [historyExpanded, setHistoryExpanded] = React.useState(false)
  const [topic, setTopic] = React.useState('')
  const [keywords, setKeywords] = React.useState('')

  // Fetch jobs
  const fetchJobs = React.useCallback(async () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    try {
      const res = await fetch('/api/content-studio/jobs?limit=40', { credentials: 'same-origin' })
      if (res.status === 503) { setError('Server busy (503). Waiting before next refresh…'); return }
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string }).error || `HTTP ${res.status}`)
      setJobs((data as { jobs?: ContentJob[] }).jobs ?? [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load jobs')
    } finally { setLoading(false) }
  }, [])

  React.useEffect(() => { fetchJobs() }, [fetchJobs])

  // Poll active jobs
  React.useEffect(() => {
    const hasActive = jobs.some(j => ['pending', 'publishing'].includes(j.status))
    if (!hasActive) return
    const interval = setInterval(fetchJobs, 12_000)
    return () => clearInterval(interval)
  }, [jobs, fetchJobs])

  const handleGenerate = async (formData: any) => {
    setGenerating(true)
    setError(null)
    try {
      const contentTypeMap: Record<string, string> = {
        blog_post: 'blog_summary', article: 'legal_guide',
        regional_page: 'regional_page', marketplace_gig: 'marketplace_gig',
      }
      const ct = contentTypeMap[formData.content_type] || formData.content_type || 'legal_guide'
      const res = await fetch('/api/seo-factory/generate', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: formData.topic, title: formData.title || formData.topic,
          primaryKeyword: (formData.keywords && formData.keywords[0]) || formData.topic,
          region: formData.region || 'US', contentType: ct,
          tone: formData.tone || 'educational', audience: formData.audience,
          keywords: formData.keywords, shipMode: 'pr', indexable: true,
          minAuditScore: 55, maxRefine: 2,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok && !data.content) throw new Error(data.error ?? `HTTP ${res.status}`)
      const notice = data.ship?.prUrl
        ? `Generated · PR opened · audit ${data.audit?.score ?? '—'}`
        : data.shipError
          ? `Generated (audit ${data.audit?.score}) but ship failed: ${data.shipError}`
          : `Generated via ${data.provider || 'AI'} · audit ${data.audit?.score ?? '—'}`
      setActionNotice(notice)
      // Collapse create panel, show factory
      setCreateExpanded(false)
      setShowFactory(true)
      await fetchJobs()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed')
      setActionNotice('Content generation failed.')
    } finally { setGenerating(false) }
  }

  return (
    <div style={{ padding: '16px 20px 24px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontFamily: C.serif, fontSize: 26, fontWeight: 700, color: C.text }}>
            Content Studio
          </h1>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: C.textMuted }}>
            AI-drafted SEO content → GitHub PRs → caseworks / consultancy / portal
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => { setShowFactory(!showFactory); if (!showFactory) setCreateExpanded(false) }} style={{
            padding: '9px 18px', borderRadius: 6, border: `2px solid ${C.gold}`,
            background: showFactory ? C.gold : 'transparent', color: showFactory ? '#FFF' : C.gold,
            cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
          }}>
            {showFactory ? '✕ Close Command Center' : '🏭 Command Center'}
          </button>
          <button onClick={fetchJobs} disabled={loading} style={{
            padding: '9px 14px', borderRadius: 6, border: `1px solid ${C.border}`,
            background: C.surface, color: C.textMuted, cursor: 'pointer',
            fontSize: 12, fontFamily: 'inherit',
          }}>↻ Refresh</button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 16px', fontSize: 12, color: C.red, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{error}</span>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.red, fontSize: 18 }}>×</button>
        </div>
      )}

      {/* Stats */}
      {!loading && jobs.length > 0 && <SummaryCards jobs={jobs} />}

      {/* Command Center (full-width, conditional) */}
      {showFactory && (
        <div style={{ marginBottom: 16 }}>
          <React.Suspense fallback={<div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: C.textDim }}>Loading Command Center…</div>}>
            <AdminSeoFactory setActionNotice={setActionNotice} />
          </React.Suspense>
        </div>
      )}

      {/* Main two-column grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 420px) 1fr', gap: 16, alignItems: 'start' }}>
        {/* ── LEFT COLUMN ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <QuickCreate
            expanded={createExpanded}
            onToggle={() => setCreateExpanded(!createExpanded)}
            generating={generating} onGenerate={handleGenerate}
            topic={topic} keywords={keywords}
            onTopicChange={setTopic} onKeywordsChange={setKeywords}
          />
          <InterlinksMini topic={topic} keywords={keywords} />
          <GscMini />
        </div>

        {/* ── RIGHT COLUMN ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Live Pipeline */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}` }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: C.text, fontFamily: C.serif }}>
                🔄 Live Pipeline
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: 11, color: C.textMuted }}>
                Active jobs with status tracking — auto-refreshes for in-progress jobs
              </p>
            </div>
            <LivePipeline jobs={jobs} onSelect={setSelectedJob} />
          </div>

          {/* Job History */}
          <JobHistory
            jobs={jobs} expanded={historyExpanded}
            onToggle={() => setHistoryExpanded(!historyExpanded)}
            onSelect={setSelectedJob} loading={loading}
          />
        </div>
      </div>

      {/* Detail modal */}
      {selectedJob && <JobDetail job={selectedJob} onClose={() => setSelectedJob(null)} />}
    </div>
  )
}
