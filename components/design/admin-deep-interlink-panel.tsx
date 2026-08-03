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
type Report = { scannedPages: number; enrichedPages: number; totalSuggestedLinks: number; pages: EnrichedPage[] }
type Repair = { repo: string; branch: string; filesModified: number; linksAdded: number; prNumber: number; prUrl: string }

export default function AdminDeepInterlinkPanel({ setActionNotice }: { setActionNotice: (msg: string) => void }) {
  const [scope, setScope] = React.useState<Scope>('all')
  const [report, setReport] = React.useState<Report | null>(null)
  const [repairs, setRepairs] = React.useState<Repair[] | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [expanded, setExpanded] = React.useState(false)
  const [selectedPage, setSelectedPage] = React.useState<EnrichedPage | null>(null)

  const run = async (action: 'audit' | 'repair') => {
    setBusy(true); setError(null); setRepairs(null)
    try {
      const res = await fetch('/api/content-studio/deep-interlink', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, scope }),
      })
      const data = await res.json().catch(() => ({})) as { error?: string; report?: Report; repairs?: Repair[] }
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      if (data.report) setReport(data.report)
      if (data.repairs) setRepairs(data.repairs)
      if (action === 'repair') {
        setActionNotice(`Deep interlink enriched ${data.repairs?.reduce((s, r) => s + r.linksAdded, 0) || 0} cross-domain links across ${data.repairs?.length || 0} repos.`)
        setSelectedPage(null)
      } else {
        setActionNotice(`Scored ${data.report?.scannedPages || 0} pages — ${data.report?.enrichedPages || 0} can be enriched with ${data.report?.totalSuggestedLinks || 0} links.`)
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'Deep interlink request failed') }
    finally { setBusy(false) }
  }

  const pages = report?.pages || []
  const enrichedPages = pages.filter((p) => p.suggestedLinks.length)

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
      {report && <div style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontFamily: C.mono, fontSize: 10, color: C.muted, marginBottom: 10 }}>
          <span><b style={{ color: C.text }}>{report.scannedPages}</b> pages scored</span>
          <span><b style={{ color: report.enrichedPages ? C.navy : C.dim }}>{report.enrichedPages}</b> enriched</span>
          <span><b style={{ color: report.totalSuggestedLinks ? C.green : C.dim }}>{report.totalSuggestedLinks}</b> links</span>
        </div>
        {!!repairs?.length && <div style={{ padding: 10, background: '#ECFDF5', border: '1px solid #BBF7D0', borderRadius: 6, color: C.green, fontSize: 11, marginBottom: 10 }}>
          {repairs.map((r) => <div key={r.repo}><b>{r.repo}</b>: {r.linksAdded} links in {r.filesModified} files → <a href={r.prUrl} target="_blank" rel="noreferrer" style={{ color: C.blue, fontFamily: C.mono }}>PR #{r.prNumber}</a></div>)}
        </div>}
        {!!enrichedPages.length && <div>
          <button onClick={() => setExpanded(!expanded)} style={{ border: 0, background: 'none', padding: 0, color: C.blue, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
            {expanded ? 'Collapse' : 'Show'} all enriched pages ({enrichedPages.length})
          </button>
          {expanded && <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
            {enrichedPages.slice(0, 50).map((page) => (
              <div key={`${page.repo}:${page.path}`} style={{ border: `1px solid ${C.border}`, borderRadius: 6, overflow: 'hidden' }}>
                <div onClick={() => setSelectedPage(selectedPage === page ? null : page)} style={{ padding: '8px 10px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: selectedPage === page ? '#F0F8FF' : C.surface }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: C.text }}>{page.title}</div>
                    <div style={{ fontSize: 9, color: C.muted, fontFamily: C.mono }}>{page.repo} · {page.url}</div>
                  </div>
                  <span style={{ fontSize: 10, fontFamily: C.mono, color: C.gold }}>+{page.suggestedLinks.length} links</span>
                </div>
                {selectedPage === page && <div style={{ padding: '6px 10px 10px', borderTop: `1px solid ${C.border}`, fontSize: 10 }}>
                  <div style={{ color: C.muted, marginBottom: 4 }}>Suggested links (sorted by relevance):</div>
                  {page.suggestedLinks.map((link, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, padding: '4px 6px', borderRadius: 4, background: C.surface, marginBottom: 2, borderLeft: `2px solid ${link.host !== page.host ? C.orange : C.navy}` }}>
                      <span style={{ fontFamily: C.mono, color: C.dim, minWidth: 36 }}>{link.score >= 0.15 ? '★' : '·'} {(link.score * 100).toFixed(0)}%</span>
                      <a href={link.url} target="_blank" rel="noreferrer" style={{ color: C.blue, textDecoration: 'none', flex: 1 }}>{link.anchorText}</a>
                      <span style={{ color: C.muted, fontSize: 9, fontFamily: C.mono }}>{link.host}</span>
                    </div>
                  ))}
                </div>}
              </div>
            ))}
          </div>}
        </div>}
      </div>}
    </section>
  )
}
