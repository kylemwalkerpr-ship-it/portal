'use client'
import { useState, useCallback, useEffect, useRef } from 'react'

// ── Color system (matches existing C palette) ─────────────────────
const C = {
  surface: '#FFFFFF', surface2: '#F9FAFB', border: 'rgba(0,0,0,0.07)',
  red: '#DC2626', redBg: '#FEF2F2', green: '#166534', greenBg: '#F0FDF4',
  orange: '#D97706', orangeBg: '#FFFBEB', amber: '#92400E',
  text: '#1F2937', textMuted: '#6B7280', textDim: '#9CA3AF',
  purple: '#7C3AED', blue: '#2563EB', blueBg: '#EFF6FF',
  serif: "var(--portal-font-display, 'Cormorant Garamond', Garamond, Georgia, serif)",
  mono: "var(--portal-font-mono, 'SF Mono', Menlo, Monaco, monospace)",
}

const GRADE_COLORS: Record<string, { bg: string; fg: string; label: string }> = {
  A: { bg: C.greenBg, fg: C.green, label: 'Excellent' },
  B: { bg: '#ECFDF5', fg: '#065F46', label: 'Good' },
  C: { bg: C.orangeBg, fg: C.orange, label: 'Needs work' },
  D: { bg: '#FEF3C7', fg: C.amber, label: 'Poor' },
  F: { bg: C.redBg, fg: C.red, label: 'Critical' },
}

const REPO_COLORS: Record<string, string> = {
  caseworks: '#1D4ED8', 'yousafe-consultancy': '#047857', portal: '#7C3AED',
}

// ── Types ──────────────────────────────────────────────────────────
type Page = {
  repo: string; host: string; path: string; url: string; title: string
  inboundLinks: number; indexable: boolean
  noindex?: boolean; words?: number; sampleSources?: string[]; content?: string
}
type Score = { repo: string; score: number; pages: number; orphans: number; noindex: number; thinPages: number; healthy: number; grade: string }
type FixRecord = { id: string; timestamp: string; action: string; repo: string; path: string; url?: string; detail: string; prUrl?: string }
type RepairResult = { orphansFixed: number; noindexFixed: number; sitemapsUpdated: number; prUrls: string[]; errors: string[]; dryRun: boolean }
type SitemapDiff = { repo: string; liveReachable: boolean; liveUrlCount: number; expectedCount: number; missing: string[]; stale: string[]; status: 'ok'|'drift'|'error'; detail: string }

type Filter = 'all' | 'orphans' | 'noindex' | 'thin'

// ── Component ─────────────────────────────────────────────────────
export default function AdminSiteHealthPanel() {
  // State
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [progressPct, setProgressPct] = useState(0)
  const [error, setError] = useState('')
  const [actionNotice, setActionNotice] = useState('')
  const [pages, setPages] = useState<Page[]>([])
  const [scannedFiles, setScannedFiles] = useState(0)
  const [hasScanned, setHasScanned] = useState(false)
  const [lastScanned, setLastScanned] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [scores, setScores] = useState<Score[]>([])
  const [repairs, setRepairs] = useState<RepairResult | null>(null)
  const [history, setHistory] = useState<FixRecord[] | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [sitemapDiffs, setSitemapDiffs] = useState<SitemapDiff[]>([])
  const [noIndexFixing, setNoIndexFixing] = useState<Record<string, 'fixing' | 'fixed' | 'error'>>({})
  const [pagePreviews, setPagePreviews] = useState<Record<string, string>>({}) // before/after content
  const scrolledRef = useRef(false)

  // ── Helpers ────────────────────────────────────────────────
  const filtered = pages
    .filter((p) => {
      if (filter === 'orphans') return (p.inboundLinks || 0) === 0 && !p.url.endsWith('/')
      if (filter === 'noindex') return p.noindex === true
      if (filter === 'thin') return (p.words ?? 0) > 0 && (p.words ?? 0) < 400
      return true
    })
    .filter((p) => {
      if (!search.trim()) return true
      const q = search.toLowerCase()
      return (p.title || p.path).toLowerCase().includes(q) || p.url.toLowerCase().includes(q)
    })

  const orphans = pages.filter((p) => (p.inboundLinks || 0) === 0 && !p.url.endsWith('/'))
  const noindex = pages.filter((p) => p.noindex === true)
  const thin = pages.filter((p) => (p.words ?? 0) > 0 && (p.words ?? 0) < 400)

  const toggleExpand = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  // ── API calls ────────────────────────────────────────────────────
  const doPost = async (path: string, body: Record<string, unknown> = {}) => {
    const res = await fetch(`/api/content-studio${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const e = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
      throw new Error(e.error || `HTTP ${res.status}`)
    }
    return res.json()
  }

  // ── 1. Scan / Audit ─────────────────────────────────────────
  const runScan = useCallback(async () => {
    setBusy(true); setError(''); setActionNotice(''); setProgress('Fetching file trees…'); setProgressPct(5)
    setHasScanned(false); setScores([]); setRepairs(null); setSitemapDiffs([])
    try {
      const data = await doPost('/site-health/full', { dryRun: true, verifyLive: true })
      setPages(data.pages || [])
      setScannedFiles(data.totalPages || 0)
      setHasScanned(true)
      setLastScanned(new Date().toISOString())
      setScores(data.scores || [])
      setSitemapDiffs(data.sitemapDiffs || [])
      setActionNotice(`${data.totalPages} pages scanned · ${data.totalOrphans} orphan(s) · ${data.totalNoindex} noindex · ${data.totalThinPages} thin`)
      setProgressPct(100)
    } catch (err: any) {
      setError(err.message || 'Scan failed')
    } finally {
      setBusy(false); setProgress('')
    }
  }, [])

  // ── 2. Fix all ─────────────────────────────────────────────
  const runFixAll = useCallback(async () => {
    if (!hasScanned) { setError('Run a scan first to find issues'); return }
    setBusy(true); setError(''); setActionNotice(''); setProgress('Repairing…'); setProgressPct(10)
    setRepairs(null)
    try {
      const data = await doPost('/site-health/full', {
        dryRun: false, fixOrphans: true, fixNoindex: true, fixSitemaps: true,
        verifyLive: true,
      })
      if (data.repairs) {
        setRepairs(data.repairs)
        setActionNotice(`Fixed: ${data.repairs.orphansFixed} orphans · ${data.repairs.noindexFixed} noindex · ${data.repairs.sitemapsUpdated} sitemaps${data.repairs.prUrls.length ? ' · PRs created' : ''}`)
        if (data.repairs.errors?.length) setError(data.repairs.errors.join('; '))
      }
      // Refresh after repair
      await runScan()
    } catch (err: any) {
      setError(err.message || 'Repair failed')
    } finally {
      setBusy(false); setProgress('')
    }
  }, [hasScanned])

  // ── 3. Single-page inline fix ──────────────────────────────
  const fixSinglePage = useCallback(async (repo: string, path: string, pageKey: string) => {
    setNoIndexFixing((prev) => ({ ...prev, [pageKey]: 'fixing' }))
    try {
      await doPost('/site-health/repair-single', { repo, path, action: 'remove-noindex' })
      setNoIndexFixing((prev) => ({ ...prev, [pageKey]: 'fixed' }))
      // Optimistic: mark as noindex:false in pages
      setPages((prev) => prev.map((p) => (p.path === path && p.repo === repo ? { ...p, noindex: false, indexable: true } : p)))
    } catch (err: any) {
      setNoIndexFixing((prev) => ({ ...prev, [pageKey]: 'error' }))
      setError(err.message || 'Single-page fix failed')
    }
  }, [])

  // ── 4. Load history ────────────────────────────────────────
  const loadHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const data = await doPost('/site-health/history')
      setHistory(data.history || [])
    } catch (err: any) {
      setError(err.message || 'History load failed')
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  // ── 5. Export ──────────────────────────────────────────────
  const doExport = useCallback((format: 'json' | 'csv') => {
    if (!hasScanned) return
    let content: string
    if (format === 'csv') {
      content = 'repo,path,url,title,indexable,noindex,words,inboundLinks\n' +
        pages.map((p) => [p.repo, p.path, p.url, `"${(p.title||'').replace(/"/g,'""')}"`, p.indexable, p.noindex??'', p.words??'', p.inboundLinks??0].join(',')).join('\n')
    } else {
      content = JSON.stringify({ scannedAt: lastScanned, scores, sitemapDiffs, totalPages: pages.length, totalOrphans: orphans.length, totalNoindex: noindex.length, totalThinPages: thin.length }, null, 2)
    }
    const blob = new Blob([content], { type: format === 'csv' ? 'text/csv' : 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `site-health-${new Date().toISOString().slice(0,10)}.${format}`; a.click()
    URL.revokeObjectURL(url)
  }, [hasScanned, pages, scores, sitemapDiffs, orphans, noindex, thin, lastScanned])

  // ── 6. Preview noindex removal ─────────────────────────────
  const previewStrip = useCallback((page: Page) => {
    if (!page.content) return 'Content not loaded — re-scan'
    // Simple visual preview: highlight the robots line that will be changed
    const lines = page.content.split('\n')
    const idx = lines.findIndex((l) => /robots\s*[:=]/.test(l) && /noindex/i.test(l))
    if (idx < 0) return 'No noindex directive found in preview'
    const before = lines.slice(Math.max(0, idx - 2), idx + 3).join('\n')
    const after = before.replace(/index\s*:\s*false/i, 'index: true').replace(/['"]noindex(?:,\s*nofollow)?['"]/gi, '"index, follow"')
    return `--- before ---\n${before}\n\n--- after ---\n${after}`
  }, [])

  // ── Button helper ──────────────────────────────────────────
  const btn = (label: string, onClick: () => void, disabled: boolean, variant: 'primary' | 'outline' | 'danger' = 'outline', small = false) => ({
    onClick, disabled,
    style: {
      padding: small ? '4px 12px' : '8px 18px', fontSize: small ? 12 : 13,
      fontWeight: 600, borderRadius: 8, cursor: disabled ? 'not-allowed' : 'pointer',
      border: variant === 'outline' ? `1px solid ${C.border}` : 'none',
      background: variant === 'primary' ? C.purple : variant === 'danger' ? C.red : C.surface,
      color: variant === 'primary' ? '#fff' : variant === 'danger' ? '#fff' : C.text,
      opacity: disabled ? 0.5 : 1, transition: 'all 150ms',
      whiteSpace: 'nowrap' as const,
    },
  })

  const tab = (label: string, count: number, f: Filter) => ({
    style: {
      padding: '6px 14px', fontSize: 12, fontWeight: 600, borderRadius: 20,
      cursor: 'pointer', border: filter === f ? `2px solid ${C.purple}` : `1px solid ${C.border}`,
      background: filter === f ? '#F5F3FF' : C.surface, color: filter === f ? C.purple : C.textMuted,
      transition: 'all 150ms',
    },
    onClick: () => setFilter(f),
  })

  // ── Render ──────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @keyframes siteHealthSlideIn {
          from { opacity: 0; transform: translateY(-6px); max-height: 0; }
          to { opacity: 1; transform: translateY(0); max-height: 400px; }
        }
      `}</style>
      <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', color: C.text }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <h3 style={{ margin: '4px 0 2px', fontFamily: C.serif, fontSize: 22, color: C.text }}>Site Health · Command Center</h3>
          <p style={{ margin: 0, fontSize: 12, color: C.textDim }}>
            Orphan repair · indexing · sitemap sync · live verification
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button {...btn('🔍 Scan all', runScan, busy)} />
          <button {...btn('🛠 Fix all', runFixAll, busy || !hasScanned, 'primary')} />
          <button {...btn('📋 History', loadHistory, historyLoading)} />
          <button {...btn('⬇ JSON', () => doExport('json'), !hasScanned, 'outline', true)} />
          <button {...btn('⬇ CSV', () => doExport('csv'), !hasScanned, 'outline', true)} />
        </div>
      </div>

      {/* Progress bar */}
      {busy && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: C.textMuted, marginBottom: 4 }}>
            <span>{progress || 'Working…'}</span>
            <span>{progressPct}%</span>
          </div>
          <div style={{ height: 4, background: C.border, borderRadius: 2, overflow: 'hidden' }}>
            <div
              style={{ height: '100%', background: C.purple, borderRadius: 2, width: `${progressPct}%`, transition: 'width 0.4s ease' }}
            />
          </div>
        </div>
      )}

      {/* Error / notice */}
      {error && (
        <div style={{ padding: '8px 14px', background: C.redBg, border: `1px solid ${C.red}20`, borderRadius: 8, fontSize: 12, color: C.red, marginBottom: 10 }}>
          ⚠️ {error}
        </div>
      )}
      {actionNotice && !error && (
        <div style={{ padding: '8px 14px', background: C.blueBg, border: `1px solid ${C.blue}20`, borderRadius: 8, fontSize: 12, color: C.blue, marginBottom: 10 }}>
          {actionNotice}
          {lastScanned && <span style={{ color: C.textDim, marginLeft: 12 }}>· last scan: {new Date(lastScanned).toLocaleTimeString()}</span>}
        </div>
      )}

      {/* Score cards */}
      {scores.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))', gap: 10, marginBottom: 14 }}>
          {scores.map((s) => {
            const g = GRADE_COLORS[s.grade] || GRADE_COLORS.F
            return (
              <div key={s.repo} style={{ padding: '12px 16px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: REPO_COLORS[s.repo] || C.text }}>{s.repo}</span>
                  <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700, background: g.bg, color: g.fg }}>
                    {s.grade} · {s.score}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8, fontSize: 11, color: C.textMuted, flexWrap: 'wrap' }}>
                  <span>📄 {s.pages}</span>
                  <span style={{ color: s.orphans ? C.red : C.textDim }}>🔗 {s.orphans}</span>
                  <span style={{ color: s.noindex ? C.orange : C.textDim }}>🚫 {s.noindex}</span>
                  <span style={{ color: s.thinPages ? C.amber : C.textDim }}>📏 {s.thinPages}</span>
                  <span style={{ color: C.green }}>✓ {s.healthy}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Sitemap diffs */}
      {sitemapDiffs.length > 0 && (
        <div style={{ marginBottom: 14, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {sitemapDiffs.map((sd) => (
            <div key={sd.repo} style={{
              padding: '6px 12px', borderRadius: 8, border: `1px solid ${C.border}`,
              background: sd.status === 'ok' ? C.greenBg : sd.status === 'drift' ? C.orangeBg : C.redBg,
              fontSize: 11, color: sd.status === 'ok' ? C.green : sd.status === 'drift' ? C.orange : C.red,
            }}>
              🗺 {sd.repo}: {sd.detail} {sd.liveReachable ? `(${sd.liveUrlCount} live / ${sd.expectedCount} expected)` : '(unreachable)'}
            </div>
          ))}
        </div>
      )}

      {/* Repair result */}
      {repairs && (
        <div style={{ padding: '10px 14px', background: repairs.errors.length ? C.orangeBg : C.greenBg, border: '1px solid rgba(0,0,0,0.06)', borderRadius: 10, marginBottom: 10, fontSize: 12 }}>
          <strong>{repairs.dryRun ? 'Preview — no changes made' : 'Repairs complete'}</strong>
          <span style={{ color: C.textMuted, marginLeft: 8 }}>
            {repairs.orphansFixed} orphans · {repairs.noindexFixed} noindex · {repairs.sitemapsUpdated} sitemaps
            {repairs.prUrls.length > 0 && repairs.prUrls.map((u, i) => (
              <a key={i} href={u} target="_blank" rel="noreferrer" style={{ color: C.blue, marginLeft: 6 }}>PR #{i + 1}</a>
            ))}
          </span>
          {repairs.errors.length > 0 && <div style={{ color: C.red, marginTop: 4 }}>{repairs.errors.join(' · ')}</div>}
        </div>
      )}

      {/* No results state */}
      {!hasScanned && !busy && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: C.textDim }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>No scan data yet</div>
          <div style={{ fontSize: 13 }}>Click <strong>Scan all</strong> to audit every page across all repos — orphans, noindex flags, word counts, and sitemap diffs.</div>
        </div>
      )}

      {/* Results: filters + table */}
      {hasScanned && (
        <>
          {/* Tabs + search */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
            <button {...tab('All', pages.length, 'all')}>All ({pages.length})</button>
            <button {...tab('Orphans', orphans.length, 'orphans')}>🔗 Orphans ({orphans.length})</button>
            <button {...tab('Noindex', noindex.length, 'noindex')}>🚫 Noindex ({noindex.length})</button>
            <button {...tab('Thin', thin.length, 'thin')}>📏 Thin &lt;400w ({thin.length})</button>
            <div style={{ flex: 1 }} />
            <input
              placeholder="Search pages…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                padding: '6px 12px', fontSize: 12, border: `1px solid ${C.border}`,
                borderRadius: 8, width: 180, outline: 'none', color: C.text,
              }}
            />
          </div>

          {/* Page list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 500, overflowY: 'auto', scrollBehavior: 'smooth' }}
            ref={(el) => { if (el && !scrolledRef.current) { scrolledRef.current = true } }}>
            {filtered.slice(0, 100).map((page) => {
              const key = `${page.repo}:${page.path}`
              const isExpanded = expanded.has(key)
              const nifix = noIndexFixing[key]
              const isOrphan = (page.inboundLinks || 0) === 0 && !page.url.endsWith('/')
              return (
                <div
                  key={key}
                  style={{
                    padding: '8px 12px', background: isOrphan ? '#FFF7ED' : page.noindex ? '#FEF2F2' : C.surface,
                    border: `1px solid ${isOrphan ? C.orange + '30' : page.noindex ? C.red + '20' : C.border}`,
                    borderRadius: 8, cursor: 'pointer',
                  }}
                  onClick={() => toggleExpand(key)}
                >
                  {/* Row header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                    <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: (REPO_COLORS[page.repo] || C.textMuted) + '18', color: REPO_COLORS[page.repo] || C.textMuted }}>
                      {page.repo}
                    </span>
                    <span style={{ fontWeight: 600, color: C.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {page.title || page.path.split('/').pop()?.replace(/\.(tsx?|mdx?)$/, '') || page.path}
                    </span>
                    {isOrphan && <span style={{ color: C.orange, fontSize: 10, fontWeight: 600 }}>🔗 orphan</span>}
                    {page.noindex && <span style={{ color: C.red, fontSize: 10, fontWeight: 600 }}>🚫 noindex</span>}
                    {(page.words ?? 0) > 0 && (page.words ?? 0) < 400 && <span style={{ color: C.amber, fontSize: 10, fontWeight: 600 }}>📏 {page.words}w</span>}
                    {page.indexable && !page.noindex && <span style={{ fontSize: 10, color: C.green }}>✓ indexed</span>}
                    <span style={{ fontSize: 10, color: C.textDim }}>⚓ {page.inboundLinks}</span>
                    <span style={{ fontSize: 10, color: C.textDim, fontFamily: C.mono }}>
                      {page.url.replace(/^https?:\/\//, '').slice(0, 30)}
                    </span>
                  </div>

                  {/* Expanded detail */}
                    {isExpanded && (
                      <div
                        style={{ overflow: 'hidden', animation: 'siteHealthSlideIn 0.2s ease' }}
                      >
                        <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.border}`, fontSize: 11, color: C.textMuted }}>
                          <div style={{ marginBottom: 6 }}>
                            <strong>Full path:</strong> <code style={{ fontFamily: C.mono, fontSize: 11 }}>{page.path}</code>
                            <span style={{ marginLeft: 8 }}>|</span>
                            <span style={{ marginLeft: 8 }}><strong>Words:</strong> {page.words ?? '—'}</span>
                            <span style={{ marginLeft: 8 }}>|</span>
                            <span style={{ marginLeft: 8 }}><strong>Inbound:</strong> {page.inboundLinks}</span>
                          </div>
                          {page.sampleSources && page.sampleSources.length > 0 && (
                            <div style={{ marginBottom: 6 }}>
                              <strong>Linked from:</strong> {page.sampleSources.slice(0, 5).join(', ')}
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: 6 }}>
                            {page.noindex && (page.words ?? 0) >= 400 && (
                              <button {...btn(
                                nifix === 'fixing' ? '⏳ Fixing…' : nifix === 'fixed' ? '✅ Indexed' : nifix === 'error' ? '❌ Failed' : '🔓 Enable indexing',
                                () => { if (nifix !== 'fixing') fixSinglePage(page.repo, page.path, key) },
                                nifix === 'fixing',
                                nifix === 'fixed' ? 'outline' : 'primary', true
                              )} />
                            )}
                            <a href={page.url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: C.blue, textDecoration: 'none', padding: '4px 10px', border: `1px solid ${C.blue}30`, borderRadius: 6 }}>
                              ↗ Visit
                            </a>
                            {page.content && page.noindex && (
                              <button {...btn('👁 Preview fix', () => setPagePreviews((p) => ({ ...p, [key]: previewStrip(page) })), false, 'outline', true)} />
                            )}
                          </div>
                          {pagePreviews[key] && (
                            <pre style={{ marginTop: 8, padding: 8, background: '#1e1e1e', color: '#d4d4d4', borderRadius: 6, fontSize: 10, fontFamily: C.mono, overflowX: 'auto', maxHeight: 160 }}>
                              {pagePreviews[key]}
                            </pre>
                          )}
                        </div>
                      </div>
                    )}
                </div>
              )
            })}
          </div>
          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: 20, color: C.textDim, fontSize: 13 }}>
              No pages match the current filter.
            </div>
          )}
          {filtered.length > 100 && (
            <div style={{ fontSize: 11, color: C.textDim, textAlign: 'center', marginTop: 6 }}>
              Showing first 100 of {filtered.length} pages — use search to narrow results.
            </div>
          )}
        </>
      )}

      {/* Fix history panel */}
      {history && (
        <div style={{ marginTop: 20, padding: '12px 16px', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 12 }}>
          <h4 style={{ margin: '0 0 8px', fontFamily: C.serif, fontSize: 16, color: C.text }}>Fix history</h4>
          <div style={{ maxHeight: 200, overflowY: 'auto' }}>
            {history.length === 0 ? (
              <div style={{ fontSize: 12, color: C.textDim }}>No fixes recorded yet.</div>
            ) : (
              history.map((r, i) => (
                <div key={r.id || i} style={{ padding: '4px 0', borderBottom: `1px solid ${C.border}`, fontSize: 11, color: C.textMuted, display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: C.surface, color: C.textDim }}>
                    {r.action}
                  </span>
                  <span style={{ color: C.text, flex: 1 }}>{r.detail.slice(0, 100)}</span>
                  <span style={{ color: C.textDim, fontFamily: C.mono, fontSize: 10 }}>
                    {r.timestamp ? new Date(r.timestamp).toLocaleDateString() : ''}
                  </span>
                  {r.prUrl && <a href={r.prUrl} target="_blank" rel="noreferrer" style={{ color: C.blue, fontSize: 10 }}>PR</a>}
                </div>
              ))
            )}
          </div>
        </div>
      )}
      </div>
    </>
  )
}
