import React from 'react'

const C = {
  surface: '#FFFFFF', border: 'rgba(0,0,0,0.08)', text: '#1F2937', muted: '#6B7280',
  dim: '#9CA3AF', gold: '#9A7B3B', blue: '#2563EB', green: '#166534', red: '#DC2626',
  navy: '#1E3A5F', orange: '#C2410C',
  serif: "var(--portal-font-display, 'Cormorant Garamond', Georgia, serif)",
  mono: "var(--portal-font-mono, 'SF Mono', Menlo, monospace)",
}

type Scope = 'all' | 'caseworks' | 'yousafe-consultancy' | 'portal'

type SuggestedLink = { url: string; host: string; title: string; anchorText: string; score: number; bestH2: string | null }
type EnrichedPage = { repo: string; host: string; path: string; url: string; title: string; suggestedLinks: SuggestedLink[]; existingLinkUrls: string[] }
type Report = {
  scannedPages: number
  enrichedPages: number
  totalSuggestedLinks: number
  linkConfidence: { high: number; medium: number; low: number }
  crossDomainLinks: number
  topLinks: Array<{
    sourceUrl: string
    sourceTitle: string
    sourceRepo: string
    url: string
    host: string
    title: string
    anchorText: string
    score: number
    bestH2: string | null
  }>
  pages: EnrichedPage[]
  generatedAt: string
}
type Repair = { repo: string; branch: string; filesModified: number; linksAdded: number; prNumber: number; prUrl: string; createdAt: string }
type ShippedRepair = { repo: string; prNumber: number; prUrl: string; title: string; createdAt: string; shipped: boolean }

type RunHistoryEntry = { id: string; ts: number; action: 'audit' | 'repair'; scope: Scope; ok: boolean; message: string }

// Single source of truth for link-confidence banding — tune HIGH/MEDIUM cutoffs
// here so every UI surface changes in lockstep.
const HIGH_SCORE = 0.25
const MEDIUM_SCORE = 0.15
const MAX_PAGE_LIST = 50

function confidenceTier(score: number): 'high' | 'medium' | 'low' {
  if (score >= HIGH_SCORE) return 'high'
  if (score >= MEDIUM_SCORE) return 'medium'
  return 'low'
}
const TIER_META: Record<'high' | 'medium' | 'low', { label: string; bg: string; fg: string }> = {
  high:   { label: '★ HIGH',    bg: '#DCFCE7', fg: '#166534' },
  medium: { label: '· MEDIUM', bg: '#FEF9C3', fg: '#92400E' },
  low:    { label: '· LOW',    bg: '#FEE2E2', fg: '#991B1B' },
}

function fmtRelative(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  } catch { return iso }
}

function fmtScore(score: number) {
  return `${(score * 100).toFixed(0)}%`
}

const SCOPE_LABELS: Record<Scope, string> = {
  all: 'All sites',
  caseworks: 'Caseworks',
  'yousafe-consultancy': 'Regional',
  portal: 'Marketplace',
}

export default function AdminDeepInterlinkPanel({ setActionNotice }: { setActionNotice: (msg: string) => void }) {
  const [scope, setScope] = React.useState<Scope>('all')
  const [report, setReport] = React.useState<Report | null>(null)
  const [repairs, setRepairs] = React.useState<Repair[] | null>(null)
  const [shippedRepairs, setShippedRepairs] = React.useState<ShippedRepair[]>([])
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [expanded, setExpanded] = React.useState(false)
  const [history, setHistory] = React.useState<RunHistoryEntry[]>([])
  const [hydrating, setHydrating] = React.useState(true)
  const [lastReportAt, setLastReportAt] = React.useState<string | null>(null)
  const [selectedPageKey, setSelectedPageKey] = React.useState<string | null>(null)

  // ── Hydrate shipped-PR archive on mount + whenever scope changes ───────
  React.useEffect(() => {
    let cancelled = false
    setHydrating(true)
    setShippedRepairs([])
    fetch(`/api/content-studio/deep-interlink?scope=${encodeURIComponent(scope)}`, { credentials: 'same-origin' })
      .then((res) => res.json().catch(() => ({})))
      .then((data: { ok?: boolean; shippedRepairs?: ShippedRepair[]; error?: string }) => {
        if (cancelled) return
        if (data?.ok && Array.isArray(data.shippedRepairs)) {
          setShippedRepairs(data.shippedRepairs.slice(0, 10))
        }
      })
      .catch(() => { /* non-fatal */ })
      .finally(() => { if (!cancelled) setHydrating(false) })
    return () => { cancelled = true }
  }, [scope])

  const log = React.useCallback((entry: Omit<RunHistoryEntry, 'id' | 'ts'>) => {
    setHistory((h) => [{ id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, ts: Date.now(), ...entry }, ...h].slice(0, 12))
  }, [])

  const run = async (action: 'audit' | 'repair') => {
    setBusy(true); setError(null)
    if (action === 'repair') setRepairs(null)
    try {
      const res = await fetch('/api/content-studio/deep-interlink', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, scope }),
      })
      const data = await res.json().catch(() => ({})) as { error?: string; report?: Report; repairs?: Repair[] }
      if (!res.ok) {
        const message = data.error || `HTTP ${res.status}`
        setError(message)
        log({ action, scope, ok: false, message })
        return
      }
      if (data.report) { setReport(data.report); setLastReportAt(new Date().toISOString()) }
      if (data.repairs) {
        setRepairs(data.repairs)
        const totalLinks = data.repairs.reduce((s, r) => s + r.linksAdded, 0)
        const totalRepos = data.repairs.length
        log({ action, scope, ok: true, message: `Created ${totalRepos} PR${totalRepos === 1 ? '' : 's'} adding ${totalLinks} cross-domain link${totalLinks === 1 ? '' : 's'}` })
        setActionNotice(`Deep interlink enriched ${totalLinks} cross-domain links across ${totalRepos} repos.`)
        setSelectedPageKey(null)
        // The shipped archive is refreshed unconditionally at the end of run() so
        // the new PRs always appear at the top.
      } else {
        log({ action, scope, ok: true, message: `Scored ${data.report?.scannedPages || 0} pages — ${data.report?.enrichedPages || 0} enriched (${data.report?.totalSuggestedLinks || 0} links)` })
        setActionNotice(`Scored ${data.report?.scannedPages || 0} pages — ${data.report?.enrichedPages || 0} can be enriched with ${data.report?.totalSuggestedLinks || 0} links.`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Deep interlink request failed'
      setError(message)
      log({ action, scope, ok: false, message })
    } finally { setBusy(false) }
    // Always refresh the shipped-PR archive so the gallery reflects the
    // most recent state regardless of repair success or failure.
    void refreshArchive()
  }

  const refreshArchive = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/content-studio/deep-interlink?scope=${encodeURIComponent(scope)}`, { credentials: 'same-origin' })
      const data = await res.json().catch(() => ({})) as { shippedRepairs?: ShippedRepair[] }
      if (Array.isArray(data.shippedRepairs)) setShippedRepairs(data.shippedRepairs.slice(0, 10))
    } catch { /* non-fatal */ }
  }, [scope])

  const pages = report?.pages || []
  const enrichedPages = pages.filter((p) => p.suggestedLinks.length)
  const confidence = report?.linkConfidence || { high: 0, medium: 0, low: 0 }
  const crossDomain = report?.crossDomainLinks ?? 0
  const topLinks = report?.topLinks || []
  const selectedPage = selectedPageKey
    ? enrichedPages.find((p) => `${p.repo}:${p.path}` === selectedPageKey) || null
    : null
  const pageListCapped = enrichedPages.length > MAX_PAGE_LIST

  return (
    <section style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.gold }}>Deep Interlink</div>
          <h3 style={{ margin: '4px 0 2px', fontFamily: C.serif, fontSize: 18, color: C.text }}>Cross-domain enrichment engine</h3>
          <p style={{ margin: 0, fontSize: 11, color: C.muted, maxWidth: 720 }}>
            Scans every indexable page across caseworks / regional / marketplace, scores relevance using keyword similarity and heading overlap, then inserts contextual related-page links with descriptive anchor text. Cross-domain bonus ensures the estate is deeply woven together.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={scope} onChange={(e) => setScope(e.target.value as Scope)} disabled={busy} style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 9px', fontSize: 11, background: '#FFF', color: C.text }}>
            <option value="all">All sites</option>
            <option value="caseworks">Caseworks</option>
            <option value="yousafe-consultancy">Regional</option>
            <option value="portal">Marketplace</option>
          </select>
          <button onClick={() => run('audit')} disabled={busy} style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 11px', background: '#FFF', color: C.text, cursor: 'pointer', fontSize: 11 }}>
            {busy ? 'Scoring…' : 'Audit enrichment'}
          </button>
          <button onClick={() => run('repair')} disabled={busy || !report || !enrichedPages.length} style={{ border: 'none', borderRadius: 6, padding: '8px 11px', background: report && enrichedPages.length ? C.gold : '#E5E7EB', color: report && enrichedPages.length ? '#FFF' : C.dim, cursor: report && enrichedPages.length ? 'pointer' : 'not-allowed', fontSize: 11, fontWeight: 700 }}>
            {busy ? 'Applying…' : 'Enrich & create PRs'}
          </button>
        </div>
      </div>
      {error && <div style={{ margin: 12, padding: 10, borderRadius: 6, background: '#FEE2E2', color: C.red, fontSize: 11 }}>{error}</div>}

      {/* ── Live status strip ───────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, padding: '10px 16px', borderBottom: `1px solid ${C.border}`, fontFamily: C.mono, fontSize: 10, color: C.muted, alignItems: 'center' }}>
        <span><b style={{ color: C.text }}>{report?.scannedPages ?? '—'}</b> pages scored</span>
        <span><b style={{ color: report?.enrichedPages ? C.navy : C.dim }}>{report?.enrichedPages ?? '—'}</b> enriched</span>
        <span><b style={{ color: report?.totalSuggestedLinks ? C.green : C.dim }}>{report?.totalSuggestedLinks ?? '—'}</b> links</span>
        <span style={{ color: C.border, margin: '0 2px' }}>|</span>
        <span title="Cross-domain links — destination host differs from source host">
          <b style={{ color: crossDomain ? C.orange : C.dim }}>{crossDomain}</b> cross-domain
        </span>
        <span title="HIGH: ≥25% relevance. MEDIUM: ≥15%. LOW: below 15%.">
          <span style={{ padding: '1px 6px', borderRadius: 4, background: TIER_META.high.bg, color: TIER_META.high.fg, marginRight: 4 }}>★ {confidence.high}</span>
          <span style={{ padding: '1px 6px', borderRadius: 4, background: TIER_META.medium.bg, color: TIER_META.medium.fg, marginRight: 4 }}>· med {confidence.medium}</span>
          <span style={{ padding: '1px 6px', borderRadius: 4, background: TIER_META.low.bg, color: TIER_META.low.fg }}>· low {confidence.low}</span>
        </span>
        {lastReportAt && (
          <span style={{ color: C.muted, marginLeft: 'auto' }}>last audit {fmtRelative(lastReportAt)}</span>
        )}
      </div>

      {/* ── Shipped-PR archive (visible on first paint so admins see prior runs) ── */}
      <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, background: shippedRepairs.length ? '#F8FAFC' : 'transparent' }}>
        <div style={{ fontFamily: C.mono, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted, marginBottom: 6 }}>
          Previously shipped enrichment PRs {hydrating && '· loading…'}
        </div>
        {shippedRepairs.length === 0 && !hydrating ? (
          <div style={{ fontSize: 11, color: C.muted }}>
            No enrichment PRs found for <b>{SCOPE_LABELS[scope]}</b>. Run an audit, then <b>Enrich & create PRs</b> to produce one.
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {shippedRepairs.map((pr) => (
              <a
                key={`${pr.repo}:${pr.prNumber}`}
                href={pr.prUrl}
                target="_blank"
                rel="noreferrer"
                title={`${pr.title} · ${pr.shipped ? 'merged' : 'not merged'} ${fmtRelative(pr.createdAt)}`}
                style={{
                  padding: '6px 10px', borderRadius: 6, border: `1px solid ${pr.shipped ? '#A7F3D0' : C.border}`,
                  background: pr.shipped ? '#ECFDF5' : '#FFF',
                  fontFamily: C.mono, fontSize: 10, color: pr.shipped ? C.green : C.blue,
                  textDecoration: 'none', display: 'inline-flex', gap: 6, alignItems: 'center',
                }}
              >
                <span style={{ fontWeight: 700 }}>{pr.repo}</span>
                <span style={{ color: C.text }}>PR #{pr.prNumber}</span>
                <span style={{ color: pr.shipped ? C.green : C.muted }}>{pr.shipped ? `${fmtRelative(pr.createdAt)}` : `closed · ${fmtRelative(pr.createdAt)}`}</span>
              </a>
            ))}
          </div>
        )}
      </div>

      {/* ── New repairs (latent), if any ----------------------------------- */}
      {!!repairs?.length && <div style={{ padding: 10, background: '#ECFDF5', border: '1px solid #BBF7D0', borderRadius: 6, color: C.green, fontSize: 11, margin: '12px 16px 0' }} role="status">
        {repairs.map((r) => (
          <div key={`${r.repo}:${r.prNumber}`}>
            <b>{r.repo}</b>: {r.linksAdded} links in {r.filesModified} files →{' '}
            <a href={r.prUrl} target="_blank" rel="noreferrer" style={{ color: C.blue, fontFamily: C.mono }}>PR #{r.prNumber}</a>
            <span style={{ color: C.muted, fontFamily: C.mono, fontSize: 10 }}> · {fmtRelative(r.createdAt)}</span>
          </div>
        ))}
      </div>}

      {/* ── Top suggestions sample (visible the moment the report lands) ─── */}
      {!!topLinks.length && <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.gold, fontWeight: 700 }}>
            Top {topLinks.length} ranked suggestions
          </div>
          <span style={{ fontSize: 10, color: C.muted }}>click ↗ to open the live target</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 8 }}>
          {topLinks.map((link, idx) => {
            const tier = confidenceTier(link.score)
            const m = TIER_META[tier]
            const isCross = link.host !== link.sourceRepo
            return (
              <div key={`${link.sourceUrl}:${link.url}:${idx}`} style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 10px', background: '#FFF' }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 3, flexWrap: 'wrap' }}>
                  <span title={tier} style={{ padding: '1px 6px', borderRadius: 4, fontFamily: C.mono, fontSize: 9, fontWeight: 700, background: m.bg, color: m.fg }}>{m.label}</span>
                  <span style={{ fontFamily: C.mono, fontSize: 10, color: isCross ? C.orange : C.navy }}>
                    {fmtScore(link.score)}
                  </span>
                  <span style={{ fontFamily: C.mono, fontSize: 9, color: C.muted }}>· from {link.sourceRepo}</span>
                </div>
                <div style={{ fontSize: 11, lineHeight: 1.35, marginBottom: 3 }}>
                  <span style={{ color: C.muted }}>Anchor: </span>
                  <span style={{ color: C.text, fontWeight: 600 }}>“{link.anchorText}”</span>
                </div>
                <div style={{ fontSize: 10, color: C.muted, marginBottom: 2 }}>Source: {link.sourceTitle}</div>
                <a href={link.url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: C.blue, fontWeight: 700, textDecoration: 'none' }}>↗ {link.title}</a>
                <a href={link.sourceUrl} target="_blank" rel="noreferrer" style={{ display: 'block', fontSize: 9, color: C.muted, textDecoration: 'none', overflowWrap: 'anywhere', marginTop: 2 }}>source page ↗</a>
                {link.bestH2 && (
                  <div style={{ fontFamily: C.mono, fontSize: 9, color: C.dim, marginTop: 2 }}>matches H2: {link.bestH2}</div>
                )}
              </div>
            )
          })}
        </div>
      </div>}

      {/* ── Per-page expanded list ---------------------------------------- */}
      {!!enrichedPages.length && (
        <div style={{ padding: '10px 16px 16px' }}>
          <button onClick={() => setExpanded(!expanded)} style={{ border: 0, background: 'none', padding: 0, color: C.blue, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
            {expanded ? 'Collapse' : 'Show'} all enriched pages ({enrichedPages.length})
          </button>
          {expanded && (
            <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
              {pageListCapped && (
                <div style={{ fontFamily: C.mono, fontSize: 9, color: C.muted, padding: '0 4px 4px' }}>
                  showing {MAX_PAGE_LIST} of {enrichedPages.length} enriched pages (re-run with a narrower scope to see the rest)
                </div>
              )}
              {enrichedPages.slice(0, MAX_PAGE_LIST).map((page) => {
                const key = `${page.repo}:${page.path}`
                const isOpen = selectedPageKey === key
                return (
                  <div key={key} style={{ border: `1px solid ${C.border}`, borderRadius: 6, overflow: 'hidden' }}>
                    <div onClick={() => setSelectedPageKey(isOpen ? null : key)} style={{ padding: '8px 10px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: isOpen ? '#F0F8FF' : C.surface }}>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: C.text }}>{page.title}</div>
                        <div style={{ fontSize: 9, color: C.muted, fontFamily: C.mono }}>{page.repo} · {page.url}</div>
                      </div>
                      <span style={{ fontSize: 10, fontFamily: C.mono, color: C.gold }}>+{page.suggestedLinks.length} links</span>
                    </div>
                    {isOpen && (
                      <div style={{ padding: '6px 10px 10px', borderTop: `1px solid ${C.border}`, fontSize: 10 }}>
                        <div style={{ color: C.muted, marginBottom: 4 }}>Suggested links (sorted by relevance):</div>
                        {page.suggestedLinks.map((link, i) => {
                          const tier = confidenceTier(link.score)
                          const m = TIER_META[tier]
                          return (
                            <div key={i} style={{ display: 'flex', gap: 8, padding: '4px 6px', borderRadius: 4, background: C.surface, marginBottom: 2, borderLeft: `2px solid ${link.host !== page.host ? C.orange : C.navy}`, alignItems: 'center' }}>
                              <span style={{ padding: '1px 5px', borderRadius: 4, fontFamily: C.mono, fontSize: 8, fontWeight: 700, background: m.bg, color: m.fg }}>{m.label}</span>
                              <span style={{ fontFamily: C.mono, color: C.dim, minWidth: 36 }}>{fmtScore(link.score)}</span>
                              <a href={link.url} target="_blank" rel="noreferrer" style={{ color: C.blue, textDecoration: 'none', flex: 1 }}>{link.anchorText}</a>
                              <span style={{ color: C.muted, fontSize: 9, fontFamily: C.mono }}>{link.host}</span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Run history (so the admin can see what worked & what failed) ──── */}
      {!!history.length && (
        <div style={{ padding: '10px 16px', borderTop: `1px solid ${C.border}`, background: '#FAFAFB' }}>
          <div style={{ fontFamily: C.mono, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted, marginBottom: 6 }}>
            Run history ({history.length})
          </div>
          <div style={{ display: 'grid', gap: 4 }}>
            {history.map((h) => (
              <div key={h.id} style={{ display: 'flex', gap: 8, fontSize: 10.5, alignItems: 'center' }}>
                <span
                  title={h.ok ? 'Succeeded' : 'Failed'}
                  style={{ width: 7, height: 7, borderRadius: '50%', background: h.ok ? C.green : C.red, flexShrink: 0 }}
                />
                <span style={{ fontFamily: C.mono, color: C.text, minWidth: 70 }}>{h.action.toUpperCase()}</span>
                <span style={{ color: C.muted, fontFamily: C.mono, minWidth: 90 }}>{SCOPE_LABELS[h.scope]}</span>
                <span style={{ color: C.text, flex: 1 }}>{h.message}</span>
                <span style={{ fontFamily: C.mono, color: C.muted }}>{fmtRelative(new Date(h.ts).toISOString())}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
