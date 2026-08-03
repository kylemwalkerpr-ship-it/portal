import React from 'react'

const C = {
  surface: '#FFFFFF', border: 'rgba(0,0,0,0.08)', text: '#1F2937', muted: '#6B7280',
  dim: '#9CA3AF', gold: '#9A7B3B', blue: '#2563EB', green: '#166534', red: '#DC2626',
  serif: "var(--portal-font-display, 'Cormorant Garamond', Georgia, serif)",
  mono: "var(--portal-font-mono, 'SF Mono', Menlo, monospace)",
}

type Scope = 'all' | 'caseworks' | 'yousafe-consultancy' | 'portal'
type Orphan = { repo: string; path: string; url: string; title: string; inboundLinks: number }
type Result = { scannedPages?: number; scannedFiles?: number; orphanCount?: number; orphanPages?: Orphan[]; repaired?: Array<{ repo: string; hubPath: string; links: number; sitemapPaths: string[] }>; pullRequests?: Array<{ repo: string; branch: string; files: string[]; prNumber: number; prUrl: string }> }

export default function AdminSiteHealthPanel({ setActionNotice }: { setActionNotice: (message: string) => void }) {
  const [scope, setScope] = React.useState<Scope>('all')
  const [result, setResult] = React.useState<Result | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [expanded, setExpanded] = React.useState(false)

  const run = async (action: 'audit' | 'repair') => {
    setBusy(true); setError(null)
    try {
      const response = await fetch('/api/content-studio/site-health', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, scope }),
      })
      const data = await response.json().catch(() => ({})) as { error?: string; result?: Result }
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`)
      setResult(data.result || null)
      if (action === 'repair') setActionNotice(`Site Health repaired ${data.result?.orphanCount || 0} orphan pages and synchronized the sitemap PRs.`)
      else setActionNotice(`Site Health scanned ${data.result?.scannedPages || 0} indexable pages.`)
    } catch (err) { setError(err instanceof Error ? err.message : 'Site health request failed') }
    finally { setBusy(false) }
  }

  const orphans = result?.orphanPages || []
  return (
    <section style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.gold }}>Site Health</div>
          <h3 style={{ margin: '4px 0 2px', fontFamily: C.serif, fontSize: 18, color: C.text }}>Orphan repair + sitemap sync</h3>
          <p style={{ margin: 0, fontSize: 11, color: C.muted, maxWidth: 680 }}>Find indexable pages with no inbound link, add them to a stable related-guides hub, and update the matching sitemap in the same reviewable PR.</p>
        </div>
        <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={scope} onChange={(e) => setScope(e.target.value as Scope)} disabled={busy} style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 9px', fontSize: 11, background: '#FFF', color: C.text }}>
            <option value="all">All connected sites</option><option value="caseworks">Caseworks</option><option value="yousafe-consultancy">Regional sites</option><option value="portal">Marketplace</option>
          </select>
          <button onClick={() => run('audit')} disabled={busy} style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 11px', background: '#FFF', color: C.text, cursor: 'pointer', fontSize: 11 }}>{busy ? 'Scanning…' : 'Scan orphans'}</button>
          <button onClick={() => run('repair')} disabled={busy || !result} style={{ border: 'none', borderRadius: 6, padding: '8px 11px', background: result ? C.gold : '#E5E7EB', color: result ? '#FFF' : C.dim, cursor: result ? 'pointer' : 'not-allowed', fontSize: 11, fontWeight: 700 }}>{busy ? 'Preparing PR…' : 'Repair + sync sitemap'}</button>
        </div>
      </div>
      {error && <div style={{ margin: 12, padding: 10, borderRadius: 6, background: '#FEE2E2', color: C.red, fontSize: 11 }}>{error}</div>}
      {result && <div style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontFamily: C.mono, fontSize: 10, color: C.muted }}>
          <span><b style={{ color: C.text }}>{result.scannedPages || 0}</b> pages scanned</span><span><b style={{ color: result.orphanCount ? C.red : C.green }}>{result.orphanCount || 0}</b> orphaned</span><span><b style={{ color: C.text }}>{result.scannedFiles || 0}</b> source files</span>
        </div>
        {!!result.repaired?.length && <div style={{ marginTop: 12, padding: 10, background: '#ECFDF5', border: '1px solid #BBF7D0', borderRadius: 6, color: C.green, fontSize: 11 }}>{result.repaired.map((item) => <div key={item.repo}><b>{item.repo}</b>: {item.links} links added in <code>{item.hubPath}</code>; sitemap synchronized ({item.sitemapPaths.length} route{item.sitemapPaths.length === 1 ? '' : 's'}).</div>)}</div>}
        {!!result.pullRequests?.length && <div style={{ marginTop: 8, fontSize: 11, color: C.blue }}>Review branches created: {result.pullRequests.map((pr) => <a key={pr.repo} href={pr.prUrl} target="_blank" rel="noreferrer" style={{ marginLeft: 7, fontFamily: C.mono, color: C.blue }}>{pr.repo} · PR #{pr.prNumber}</a>)}</div>}
        {!!orphans.length && <div style={{ marginTop: 12 }}>
          <button onClick={() => setExpanded(!expanded)} style={{ border: 0, background: 'none', padding: 0, color: C.blue, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>{expanded ? 'Hide' : 'Show'} orphan list ({orphans.length})</button>
          {expanded && <div style={{ marginTop: 8, maxHeight: 260, overflow: 'auto', border: `1px solid ${C.border}`, borderRadius: 6 }}>{orphans.map((orphan) => <div key={`${orphan.repo}:${orphan.path}`} style={{ padding: '8px 10px', borderBottom: `1px solid ${C.border}`, fontSize: 11 }}><div style={{ color: C.text, fontWeight: 600 }}>{orphan.title}</div><div style={{ color: C.muted, fontFamily: C.mono, fontSize: 9 }}>{orphan.repo} · {orphan.path}</div><a href={orphan.url} target="_blank" rel="noreferrer" style={{ color: C.blue, fontSize: 10 }}>{orphan.url}</a></div>)}</div>}
        </div>}
      </div>}
    </section>
  )
}
