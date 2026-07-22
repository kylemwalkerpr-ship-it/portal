'use client'
import React from 'react'
const AdminSeoFactory = React.lazy(() => import('./admin-seo-factory'))

// ── Color tokens (match admin-templates.tsx) ──
const C = {
  bg: '#F7F8FA', surface: '#FFFFFF', surface2: '#F4F2EE', surface3: '#EBEDF0',
  border: 'rgba(0,0,0,0.08)', cyan: '#3C3B6E', red: '#DC2626', green: '#166534',
  orange: '#D97706', purple: '#7C3AED', text: '#1F2937', textMuted: '#6B7280',
  textDim: '#9CA3AF', gold: '#9A7B3B', navy: '#0F172A',
  serif: "var(--portal-font-display, 'Cormorant Garamond', 'Garamond', Georgia, 'Times New Roman', serif)",
  mono: "var(--portal-font-mono, 'SF Mono', 'Menlo', 'Monaco', 'Consolas', monospace)",
}

// ── Types ──
type ContentType = 'blog_post' | 'article' | 'regional_page' | 'marketplace_gig'
type Tone = 'professional' | 'educational' | 'persuasive' | 'authoritative' | 'casual'
type Region = 'US' | 'CA' | 'AU' | 'UK' | 'COMPARE'
type JobStatus = 'pending' | 'drafting' | 'publishing' | 'pr_created' | 'merged' | 'closed' | 'failed'

interface ContentJob {
  id: string
  title: string
  topic: string
  content_type: ContentType
  tone: Tone
  region: Region
  target_repo: string
  status: JobStatus
  slug: string | null
  content: string | null
  branch_name: string | null
  content_path: string | null
  pr_url: string | null
  pr_number: number | null
  merged_at: string | null
  closed_at: string | null
  error_message: string | null
  ai_provider: string | null
  word_count: number | null
  seo_score: number | null
  created_at: string
  updated_at: string
}

interface ContentStudioProps {
  services: any[]
  refreshAdminData: () => void
  setActionNotice: (msg: string) => void
}

type Tab = 'generate' | 'gsc' | 'factory'

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

const CONTENT_TYPE_OPTIONS: { value: ContentType; label: string; ext: string; repo: string }[] = [
  { value: 'blog_post', label: 'Blog Post', ext: '.md', repo: 'caseworks' },
  { value: 'article', label: 'Long-Form Article', ext: '.mdx', repo: 'caseworks' },
  { value: 'regional_page', label: 'Regional Landing Page', ext: '.mdx', repo: 'yousafe-consultancy' },
  { value: 'marketplace_gig', label: 'Marketplace Gig Description', ext: '.mdx', repo: 'portal' },
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
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '2px 10px', borderRadius: 999,
      fontSize: 11, fontWeight: 600,
      background: s.bg, color: s.fg,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: 999, background: s.dot }} />
      {s.label}
    </span>
  )
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch { return iso }
}

// ── Summary Cards ──

function SummaryCards({ jobs }: { jobs: ContentJob[] }) {
  const total = jobs.length
  const merged = jobs.filter(j => j.status === 'merged').length
  const inProgress = jobs.filter(j => !['merged', 'closed', 'failed'].includes(j.status)).length
  const failed = jobs.filter(j => j.status === 'failed').length
  const avgSeo = jobs.length > 0
    ? Math.round(jobs.reduce((s, j) => s + (j.seo_score ?? 0), 0) / jobs.length)
    : 0

  const cards = [
    { label: 'Total Jobs', value: total, color: C.cyan },
    { label: 'Merged', value: merged, color: C.green },
    { label: 'In Progress', value: inProgress, color: C.orange },
    { label: 'Failed', value: failed, color: C.red },
    { label: 'Avg SEO Score', value: avgSeo + '%', color: C.purple },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 24 }}>
      {cards.map(c => (
        <div key={c.label} style={{
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
          padding: '16px 18px', borderTop: `3px solid ${c.color}`,
        }}>
          <div style={{ fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: C.mono }}>
            {c.label}
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: C.text, marginTop: 4, fontFamily: C.serif }}>
            {c.value}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Generate Form ──

function GenerateForm({ onGenerate, generating }: {
  onGenerate: (data: any) => void
  generating: boolean
}) {
  const [contentType, setContentType] = React.useState<ContentType>('blog_post')
  const [region, setRegion] = React.useState<Region>('US')
  const [tone, setTone] = React.useState<Tone>('educational')
  const [title, setTitle] = React.useState('')
  const [topic, setTopic] = React.useState('')
  const [audience, setAudience] = React.useState('')
  const [keywords, setKeywords] = React.useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!topic.trim()) return
    onGenerate({ content_type: contentType, region, tone, title: title.trim(), topic: topic.trim(), audience: audience.trim(), keywords: keywords.split(',').map(s => s.trim()).filter(Boolean) })
  }

  const sel = CONTENT_TYPE_OPTIONS.find(o => o.value === contentType)!

  return (
    <form onSubmit={handleSubmit} style={{ marginBottom: 24 }}>
      <div style={{
        background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
        padding: 20, borderTop: `3px solid ${C.gold}`,
      }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, fontFamily: C.serif, color: C.text }}>
          Generate New Content
        </h2>
        <p style={{ margin: '4px 0 16px', fontSize: 12, color: C.textMuted }}>
          AI drafts → GitHub PR. Lands in <strong>{sel.repo}</strong> as <code style={{ fontFamily: C.mono, background: C.surface3, padding: '1px 5px', borderRadius: 3 }}>{sel.ext}</code>.
        </p>

        {/* Content type */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: 'uppercase', marginBottom: 6, fontFamily: C.mono }}>
            Content Type
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 6 }}>
            {CONTENT_TYPE_OPTIONS.map(opt => (
              <button key={opt.value} type="button" onClick={() => setContentType(opt.value)} style={{
                textAlign: 'left', padding: '10px 12px', borderRadius: 6,
                border: contentType === opt.value ? `2px solid ${C.gold}` : `1px solid ${C.border}`,
                background: contentType === opt.value ? C.surface2 : C.surface,
                cursor: 'pointer', fontSize: 12, color: C.text, fontFamily: 'inherit',
              }}>
                <div style={{ fontWeight: 600 }}>{opt.label}</div>
                <div style={{ fontSize: 10, color: C.textDim, marginTop: 2 }}>{opt.ext} · → {opt.repo}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Region + Tone */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: 'uppercase', marginBottom: 6, fontFamily: C.mono }}>
              Target Region
            </label>
            <select value={region} onChange={e => setRegion(e.target.value as Region)} style={{
              width: '100%', padding: '8px 10px', borderRadius: 6, border: `1px solid ${C.border}`,
              background: C.surface, color: C.text, fontSize: 13, fontFamily: 'inherit',
            }}>
              {REGION_OPTIONS.map(r => (
                <option key={r.value} value={r.value}>{r.flag} {r.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: 'uppercase', marginBottom: 6, fontFamily: C.mono }}>
              Tone
            </label>
            <select value={tone} onChange={e => setTone(e.target.value as Tone)} style={{
              width: '100%', padding: '8px 10px', borderRadius: 6, border: `1px solid ${C.border}`,
              background: C.surface, color: C.text, fontSize: 13, fontFamily: 'inherit',
            }}>
              {TONE_OPTIONS.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Title */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: 'uppercase', marginBottom: 6, fontFamily: C.mono }}>
            Title <span style={{ color: C.textDim }}>(optional — AI derives if blank)</span>
          </label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. F-1 OPT Application: Complete 2026 Timeline" maxLength={120}
            style={{
              width: '100%', padding: '8px 10px', borderRadius: 6, border: `1px solid ${C.border}`,
              background: C.surface, color: C.text, fontSize: 13, fontFamily: 'inherit',
            }} />
        </div>

        {/* Topic */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: 'uppercase', marginBottom: 6, fontFamily: C.mono }}>
            Topic <span style={{ color: C.red }}>*</span>
          </label>
          <textarea value={topic} onChange={e => setTopic(e.target.value)} rows={4} required
            placeholder="Describe what the piece should cover. Be specific — mention visa types, forms, timelines, comparison angles, compliance requirements..."
            style={{
              width: '100%', padding: '8px 10px', borderRadius: 6, border: `1px solid ${C.border}`,
              background: C.surface, color: C.text, fontSize: 13, fontFamily: 'inherit', resize: 'vertical',
            }} />
        </div>

        {/* Audience + Keywords */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: 'uppercase', marginBottom: 6, fontFamily: C.mono }}>
              Target Audience
            </label>
            <input value={audience} onChange={e => setAudience(e.target.value)} placeholder="international students, H-1B holders..."
              style={{
                width: '100%', padding: '8px 10px', borderRadius: 6, border: `1px solid ${C.border}`,
                background: C.surface, color: C.text, fontSize: 13, fontFamily: 'inherit',
              }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: 'uppercase', marginBottom: 6, fontFamily: C.mono }}>
              SEO Keywords (comma-separated)
            </label>
            <input value={keywords} onChange={e => setKeywords(e.target.value)} placeholder="F-1 visa, OPT timeline, I-765, STEM extension..."
              style={{
                width: '100%', padding: '8px 10px', borderRadius: 6, border: `1px solid ${C.border}`,
                background: C.surface, color: C.text, fontSize: 13, fontFamily: 'inherit',
              }} />
          </div>
        </div>

        <button type="submit" disabled={generating || !topic.trim()} style={{
          padding: '10px 24px', borderRadius: 6, border: 'none', cursor: generating ? 'not-allowed' : 'pointer',
          background: generating ? C.textDim : C.navy, color: '#FFFFFF',
          fontSize: 13, fontWeight: 600, fontFamily: 'inherit', opacity: generating ? 0.6 : 1,
        }}>
          {generating ? '⏳ Generating...' : '⚡ Generate & Open PR'}
        </button>
      </div>
    </form>
  )
}

// ── Job History Table ──

function JobRow({ job, onSelect }: { job: ContentJob; onSelect: (j: ContentJob) => void }) {
  return (
    <tr onClick={() => onSelect(job)} style={{
      cursor: 'pointer', borderBottom: `1px solid ${C.border}`,
    }}>
      <td style={tdStyle}>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{job.title || '(untitled)'}</div>
        <div style={{ fontSize: 11, color: C.textDim, marginTop: 2, fontFamily: C.mono }}>{job.topic?.slice(0, 60)}{(job.topic?.length ?? 0) > 60 ? '…' : ''}</div>
      </td>
      <td style={tdStyle}>{job.region}</td>
      <td style={tdStyle}><span style={{ fontSize: 11, fontFamily: C.mono, color: C.textMuted }}>{job.content_type?.replace('_', ' ')}</span></td>
      <td style={tdStyle}>{statusBadge(job.status)}</td>
      <td style={{ ...tdStyle, fontFamily: C.mono, color: C.textDim }}>{job.ai_provider ?? '—'}</td>
      <td style={{ ...tdStyle, fontFamily: C.mono, color: C.textDim }}>
        {job.seo_score != null ? `${job.seo_score}%` : '—'}
      </td>
      <td style={tdStyle}>
        {job.pr_url ? (
          <a href={job.pr_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
            style={{ color: C.cyan, textDecoration: 'none', fontSize: 12, fontWeight: 500 }}>
            PR #{job.pr_number} ↗
          </a>
        ) : <span style={{ color: C.textDim, fontSize: 11 }}>—</span>}
      </td>
      <td style={{ ...tdStyle, fontSize: 11, color: C.textDim }}>{formatDate(job.created_at)}</td>
    </tr>
  )
}

const tdStyle: React.CSSProperties = {
  padding: '10px 12px', fontSize: 12, color: C.text, verticalAlign: 'top',
}

function JobDetail({ job, onClose }: { job: ContentJob; onClose: () => void }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`,
        maxWidth: 720, width: '90vw', maxHeight: '85vh', overflow: 'auto',
        padding: 28, boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <h3 style={{ margin: 0, fontFamily: C.serif, fontSize: 20, color: C.text }}>{job.title || '(untitled)'}</h3>
            <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {statusBadge(job.status)}
              <span style={{ fontSize: 11, color: C.textMuted, fontFamily: C.mono }}>{job.region} · {job.content_type?.replace('_', ' ')}</span>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: C.textDim }}>×</button>
        </div>

        {/* Metrics */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 10, marginBottom: 20 }}>
          {[
            { label: 'Word Count', value: job.word_count ?? '—' },
            { label: 'SEO Score', value: job.seo_score != null ? `${job.seo_score}%` : '—' },
            { label: 'AI Provider', value: job.ai_provider ?? '—' },
            { label: 'Target Repo', value: job.target_repo ?? '—' },
          ].map(m => (
            <div key={m.label} style={{ background: C.surface2, borderRadius: 6, padding: '10px 12px' }}>
              <div style={{ fontSize: 10, color: C.textDim, textTransform: 'uppercase', fontFamily: C.mono }}>{m.label}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginTop: 2 }}>{m.value}</div>
            </div>
          ))}
        </div>

        {/* GitHub details */}
        {(job.branch_name || job.content_path) && (
          <div style={{ marginBottom: 16, fontFamily: C.mono, fontSize: 11, color: C.textMuted, lineHeight: 1.8 }}>
            {job.branch_name && <div>branch: <span style={{ color: C.text }}>{job.branch_name}</span></div>}
            {job.content_path && <div>file: <span style={{ color: C.text }}>{job.content_path}</span></div>}
          </div>
        )}

        {/* Error */}
        {job.error_message && (
          <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 6, padding: '10px 14px', fontSize: 12, color: C.red, marginBottom: 16, fontFamily: C.mono }}>
            {job.error_message}
          </div>
        )}

        {/* Content preview */}
        {job.content && (
          <details open>
            <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 600, color: C.textMuted, fontFamily: C.mono, marginBottom: 8 }}>
              Generated Content Preview
            </summary>
            <pre style={{
              maxHeight: 320, overflow: 'auto', background: C.surface3, borderRadius: 6,
              padding: 14, fontSize: 11, fontFamily: C.mono, lineHeight: 1.6,
              color: C.text, whiteSpace: 'pre-wrap', border: `1px solid ${C.border}`,
            }}>
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
  const [activeTab, setActiveTab] = React.useState<Tab>('factory')
  const [GscDashboard, setGscDashboard] = React.useState<any>(null)
  const [gscSiteUrl, setGscSiteUrl] = React.useState('https://caseworks.com/')

  // Lazy-load GSC dashboard when user switches to GSC tab
  React.useEffect(() => {
    if (activeTab === 'gsc' && !GscDashboard) {
      import('./admin-gsc-dashboard').then(m => setGscDashboard(() => m.default))
    }
  }, [activeTab, GscDashboard])

  // Fetch jobs on mount
  const fetchJobs = React.useCallback(async () => {
    try {
      const res = await fetch('/api/content-studio/jobs', { credentials: 'same-origin' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setJobs(data.jobs ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load jobs')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { fetchJobs() }, [fetchJobs])

  // Poll for in-progress jobs
  React.useEffect(() => {
    const hasActive = jobs.some(j => !['merged', 'closed', 'failed'].includes(j.status))
    if (!hasActive) return
    const interval = setInterval(fetchJobs, 4000)
    return () => clearInterval(interval)
  }, [jobs, fetchJobs])

  const handleGenerate = async (formData: any) => {
    setGenerating(true)
    setError(null)
    try {
      const res = await fetch('/api/content-studio/generate', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error ?? `HTTP ${res.status}`)
      }
      setActionNotice('Content generation started — PR opening shortly.')
      await fetchJobs()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed')
      setActionNotice('Content generation failed. Check error details.')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Error banner */}
      {error && (
        <div style={{
          background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 8,
          padding: '12px 16px', fontSize: 13, color: C.red, marginBottom: 20,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span>{error}</span>
          <button onClick={() => setError(null)} style={{
            background: 'none', border: 'none', cursor: 'pointer', color: C.red,
            fontSize: 18, lineHeight: 1,
          }}>×</button>
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontFamily: C.serif, fontSize: 26, fontWeight: 700, color: C.text }}>
          Content Studio
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: C.textMuted, fontFamily: C.mono }}>
          AI-drafted SEO content → GitHub PRs → caseworks / consultancy / portal — all from the admin dashboard.
        </p>
      </div>

      {/* Tab navigation */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 24, borderBottom: `2px solid ${C.border}` }}>
        {([
          { key: 'factory' as Tab, label: '🏭 SEO Factory', desc: 'Plan · generate · ship' },
          { key: 'generate' as Tab, label: '⚡ Generate', desc: 'AI content + PRs' },
          { key: 'gsc' as Tab, label: '🔍 GSC Analytics', desc: 'Search Console data' },
        ]).map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
            padding: '10px 20px', border: 'none', background: 'none',
            borderBottom: activeTab === tab.key ? `2px solid ${C.gold}` : '2px solid transparent',
            color: activeTab === tab.key ? C.text : C.textDim,
            fontWeight: activeTab === tab.key ? 600 : 400,
            cursor: 'pointer', fontSize: 13, fontFamily: 'inherit',
            transition: 'all 0.15s ease',
          }}>
            <div>{tab.label}</div>
            <div style={{ fontSize: 10, color: C.textDim, marginTop: 1 }}>{tab.desc}</div>
          </button>
        ))}
      </div>

      {/* ── Generate Tab ── */}
      {activeTab === 'generate' && <>
      {/* Summary cards */}
      {!loading && jobs.length > 0 && <SummaryCards jobs={jobs} />}

      {/* Generate form */}
      <GenerateForm onGenerate={handleGenerate} generating={generating} />

      {/* Job history */}
      <div style={{
        background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
        borderTop: `3px solid ${C.gold}`, overflow: 'hidden',
      }}>
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: C.text, fontFamily: C.serif }}>
            Job History
          </h3>
          <span style={{ fontSize: 11, color: C.textMuted, fontFamily: C.mono }}>
            {loading ? 'Loading...' : `${jobs.length} job${jobs.length !== 1 ? 's' : ''}`}
          </span>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: C.textDim, fontFamily: C.mono }}>Loading jobs...</div>
        ) : jobs.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: C.textDim }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>📝</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>No content generated yet</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Fill out the form above and hit Generate.</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: C.surface2, borderBottom: `2px solid ${C.border}` }}>
                  <th style={{ ...thStyle, textAlign: 'left' }}>Title / Topic</th>
                  <th style={thStyle}>Region</th>
                  <th style={thStyle}>Type</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>AI</th>
                  <th style={thStyle}>SEO</th>
                  <th style={thStyle}>PR</th>
                  <th style={thStyle}>Date</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map(job => (
                  <JobRow key={job.id} job={job} onSelect={setSelectedJob} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail modal */}
      {selectedJob && <JobDetail job={selectedJob} onClose={() => setSelectedJob(null)} />}

      </>}
      {/* ── SEO Factory Tab ── */}
      {activeTab === 'factory' && (
        <React.Suspense fallback={<div style={{ padding: 24 }}>Loading factory…</div>}>
          <AdminSeoFactory setActionNotice={setActionNotice} />
        </React.Suspense>
      )}

      {/* ── GSC Analytics Tab ── */}
      {activeTab === 'gsc' && (
        <div>
          <div style={{
            background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
            padding: 16, marginBottom: 20,
          }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: 'uppercase', fontFamily: C.mono, display: 'block', marginBottom: 6 }}>
              Site URL (Search Console property)
            </label>
            <input value={gscSiteUrl} onChange={e => setGscSiteUrl(e.target.value)}
              placeholder="https://caseworks.com/"
              style={{
                width: '100%', maxWidth: 400, padding: '8px 10px', borderRadius: 6,
                border: `1px solid ${C.border}`, background: C.surface, color: C.text,
                fontSize: 13, fontFamily: 'inherit',
              }} />
          </div>
          {React.createElement(GscDashboard || 'div', {
            siteUrl: gscSiteUrl,
            onConnect: async () => {
              try {
                const res = await fetch('/api/content-studio/gsc/auth', { credentials: 'same-origin' })
                const { authUrl } = await res.json()
                if (authUrl) window.location.href = authUrl
              } catch (err) {
                setActionNotice('GSC auth failed')
              }
            },
            onDisconnect: async () => {
              setActionNotice('To disconnect GSC, remove the token from Supabase gsc_tokens table')
            },
          })}
        </div>
      )}
    </div>
  )
}

const thStyle: React.CSSProperties = {
  padding: '10px 12px', fontSize: 10, fontWeight: 600,
  color: C.textDim, textTransform: 'uppercase', fontFamily: C.mono,
  letterSpacing: '0.06em',
}
