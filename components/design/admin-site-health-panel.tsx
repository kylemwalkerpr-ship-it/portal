'use client'
import { useState } from 'react'

const C = {
  surface: '#FFFFFF', border: 'rgba(0,0,0,0.08)', red: '#DC2626', green: '#166534',
  orange: '#D97706', text: '#1F2937', textMuted: '#6B7280', textDim: '#9CA3AF',
  purple: '#7C3AED', blue: '#2563EB', amber: '#92400E', amberBg: '#FFFBEB',
  serif: "var(--portal-font-display, 'Cormorant Garamond', Garamond, Georgia, serif)",
  mono: "var(--portal-font-mono, 'SF Mono', Menlo, Monaco, monospace)",
}

type Page = {
  repo: string; path: string; url: string; title: string
  inboundLinks: number; indexable: boolean
  noindex?: boolean; words?: number; sampleSources?: string[]
}
type FixRecord = {
  id: string; timestamp: string; action: string; repo: string; path: string
  url?: string; detail: string; prUrl?: string
}

const REPO_COLORS: Record<string, string> = {
  caseworks: '#1D4ED8', 'yousafe-consultancy': '#047857', portal: '#7C3AED',
}

function fmtTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function ActionBadge({ action }: { action: string }) {
  const map: Record<string, { label: string; bg: string; fg: string }> = {
    noindex: { label: 'noindex removed', bg: '#EDE9FE', fg: '#6D28D9' },
    interlink: { label: 'interlinked', bg: '#DBEAFE', fg: '#1D4ED8' },
    orphan: { label: 'orphan', bg: '#FEF3C7', fg: '#92400E' },
    sitemap: { label: 'sitemap', bg: '#D1FAE5', fg: '#047857' },
  }
  const m = map[action] || { label: action, bg: '#F3F4F6', fg: '#4B5563' }
  return (
    <span style={{ background: m.bg, color: m.fg, borderRadius: 4, padding: '1px 6px', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
      {m.label}
    </span>
  )
}

export default function AdminSiteHealthPanel() {
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [actionNotice, setActionNotice] = useState('')

  // Scan results
  const [pages, setPages] = useState<Page[]>([])
  const [scannedFiles, setScannedFiles] = useState(0)
  const [hasScanned, setHasScanned] = useState(false)

  // Noindex fix results
  const [noIndexCandidates, setNoIndexCandidates] = useState<Page[]>([])
  const [noIndexFixed, setNoIndexFixed] = useState<Page[]>([])
  const [noIndexSkipped, setNoIndexSkipped] = useState<{ repo: string; path: string; words: number }[]>([])
  const [fixPrUrl, setFixPrUrl] = useState<string | null>(null)

  // Repair results
  const [repaired, setRepaired] = useState<any[]>([])
  const [repairPrUrl, setRepairPrUrl] = useState<string | null>(null)

  // History
  const [history, setHistory] = useState<FixRecord[] | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)

  const apiCall = async (body: Record<string, unknown>) => {
    const response = await fetch('/api/content-studio/site-health', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await response.json()
    if (!data.ok) throw new Error(data.error || 'Site health operation failed')
    return data
  }

  // ── 1. Scan: accumulate chunked audit ──────────────────────────
  const scanOrphans = async () => {
    setBusy(true); setError(''); setActionNotice('')
    setPages([]); setScannedFiles(0); setHasScanned(false)
    setNoIndexCandidates([]); setNoIndexFixed([]); setNoIndexSkipped([]); setFixPrUrl(null)
    setRepaired([]); setRepairPrUrl(null)
    const accumulated: Page[] = []
    let totalFiles = 0
    let batchStart = 0
    try {
      while (true) {
        setProgress(`Scanning pages… batch ${Math.floor(batchStart / 20) + 1}`)
        const data = await apiCall({ action: 'audit_chunked', batchStart, batchSize: 20 })
        accumulated.push(...(data.pages || []))
        totalFiles = data.totalFiles || 0
        if (data.nextBatch == null) break
        batchStart = data.nextBatch
      }
      const sorted = accumulated.sort((a, b) => (a.inboundLinks || 0) - (b.inboundLinks || 0))
      setPages(sorted)
      setScannedFiles(totalFiles)
      setHasScanned(true)
      const orphans = sorted.filter((p) => (p.inboundLinks || 0) === 0)
      setActionNotice(`Scan complete: ${sorted.length} pages scanned · ${orphans.length} orphan(s) found`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed')
    } finally {
      setProgress(''); setBusy(false)
    }
  }

  // ── 2. Repair orphans + sync sitemap ───────────────────────────
  const repairOrphans = async () => {
    if (!hasScanned) return
    setBusy(true); setError(''); setActionNotice('')
    setRepaired([]); setRepairPrUrl(null)
    const orphans = pages.filter((p) => (p.inboundLinks || 0) === 0)
    if (!orphans.length) {
      setActionNotice('No orphans to repair — every scanned page has at least one inbound link.')
      setBusy(false); return
    }
    const accumulated: any[] = []
    let prUrl: string | null = null
    let totalOrphans = orphans.length
    let batchStart = 0
    try {
      while (true) {
        setProgress(`Repairing orphan links… batch ${Math.floor(batchStart / 10) + 1}`)
        const data = await apiCall({ action: 'repair_chunked', batchStart, batchSize: 10 })
        accumulated.push(...(data.repaired || []))
        totalOrphans = data.totalOrphans ?? totalOrphans
        prUrl = data.prUrl || prUrl
        if (data.nextBatch == null) break
        batchStart = data.nextBatch
      }
      setRepaired(accumulated)
      setRepairPrUrl(prUrl)
      setActionNotice(`Repair complete: ${orphans.length} orphan(s) processed · PR created`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Repair failed')
    } finally {
      setProgress(''); setBusy(false)
    }
  }

  // ── 3. Remove noindex from fully-expanded pages ────────────────
  const enableIndexing = async () => {
    if (!hasScanned) return
    setBusy(true); setError(''); setActionNotice('')
    setNoIndexFixed([]); setNoIndexSkipped([]); setFixPrUrl(null)
    // Candidates: pages with noindex flag AND ≥ 400 words (fully expanded)
    const candidates = pages
      .filter((p) => p.noindex && (p.words ?? 0) >= 400)
      .map((p) => ({ repo: p.repo, path: p.path, url: p.url, title: p.title, words: p.words ?? 0 }))
    if (!candidates.length) {
      setActionNotice('No fully-expanded noindex pages found. Pages with fewer than 400 words are kept out of the index intentionally.')
      setBusy(false); return
    }
    const fixed: Page[] = []
    const skipped: { repo: string; path: string; words: number }[] = []
    let prUrl: string | null = null
    let batchStart = 0
    try {
      while (true) {
        setProgress(`Enabling indexing… ${fixed.length + skipped.length}/${candidates.length}`)
        const data = await apiCall({
          action: 'fix_noindex_chunked', batchStart, batchSize: 10,
          candidates: candidates.slice(batchStart, batchStart + 10),
        })
        fixed.push(...(data.fixed || []))
        skipped.push(...(data.skipped || []))
        prUrl = data.prUrl || prUrl
        if (data.nextBatch == null) break
        batchStart = data.nextBatch
      }
      setNoIndexFixed(fixed)
      setNoIndexSkipped(skipped)
      setFixPrUrl(prUrl)
      setActionNotice(`Indexing enabled on ${fixed.length} page(s)${prUrl ? ' · PR created' : ''}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enable indexing failed')
    } finally {
      setProgress(''); setBusy(false)
    }
  }

  // ── 4. View persisted fix history ──────────────────────────────
  const loadHistory = async () => {
    setHistoryLoading(true); setError('')
    try {
      const data = await apiCall({ action: 'history' })
      setHistory(data.fixes || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load fix history')
    } finally {
      setHistoryLoading(false)
    }
  }

  const orphans = pages.filter((p) => (p.inboundLinks || 0) === 0)
  const fullyExpandedNoindex = pages.filter((p) => p.noindex && (p.words ?? 0) >= 400)
  const thinNoindex = pages.filter((p) => p.noindex && (p.words ?? 0) < 400)

  const statChip = (label: string, value: string | number, color: string) => (
    <div style={{ flex: 1, minWidth: 90, padding: '8px 10px', borderRadius: 8, background: C.surface, border: `1px solid ${C.border}` }}>
      <div style={{ fontSize: 9, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color, marginTop: 2 }}>{value}</div>
    </div>
  )

  const btn = (label: string, onClick: () => void, disabled: boolean, variant: 'primary' | 'outline' | 'danger' = 'outline') => ({
    onClick, disabled,
    style: {
      border: variant === 'outline' ? `1px solid ${C.border}` : 'none',
      borderRadius: 6, padding: '8px 12px', fontSize: 11, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer',
      background: disabled ? '#F3F4F6' : variant === 'primary' ? C.purple : variant === 'danger' ? C.red : '#FFF',
      color: disabled ? C.textDim : variant === 'outline' ? C.text : '#FFF',
    },
  })

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 16, background: '#FCFBF9' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <h4 style={{ margin: 0, fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Site Health</h4>
          <h3 style={{ margin: '4px 0 2px', fontFamily: C.serif, fontSize: 20, color: C.text }}>Orphan repair · indexing · sitemap sync</h3>
        </div>
        <button {...btn('Fix history', loadHistory, busy || historyLoading, 'outline')}
          style={{ ...btn('Fix history', loadHistory, busy || historyLoading).style, borderColor: C.purple, color: C.purple }}>
          {historyLoading ? 'Loading…' : `Fix history${history ? ` (${history.length})` : ''}`}
        </button>
      </div>
      <p style={{ margin: '6px 0 12px', fontSize: 11, color: C.textMuted, lineHeight: 1.5 }}>
        Scan every repo for orphan pages, add them to a stable related-guides hub, sync sitemaps in one reviewable PR,
        and flip fully-expanded noindex pages back into the index. All fixes are recorded to a persisted history you can re-open at any time.
      </p>

      {/* Action bar */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button {...btn(hasScanned ? 'Re-scan' : 'Scan orphans', scanOrphans, busy, 'primary')}>
          {busy && progress.startsWith('Scanning') ? 'Scanning…' : hasScanned ? 'Re-scan' : 'Scan orphans'}
        </button>
        <button {...btn('Repair orphans + sync sitemap', repairOrphans, busy || !hasScanned)}>Repair + sync sitemap</button>
        <button {...btn('Enable indexing (fully expanded)', enableIndexing, busy || !hasScanned)}
          style={{ ...btn('Enable indexing', enableIndexing, busy || !hasScanned).style, borderColor: C.green, color: C.green }}>
          Enable indexing{fullyExpandedNoindex.length ? ` (${fullyExpandedNoindex.length})` : ''}
        </button>
      </div>

      {/* Stats */}
      {hasScanned && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          {statChip('Pages scanned', pages.length, C.text)}
          {statChip('Files', scannedFiles, C.textDim)}
          {statChip('Orphans', orphans.length, C.orange)}
          {statChip('noindex pages', pages.filter((p) => p.noindex).length, C.red)}
          {statChip('Ready to index', fullyExpandedNoindex.length, C.green)}
        </div>
      )}

      {progress && (
        <div style={{ marginTop: 10, fontSize: 11, color: C.textMuted, fontFamily: C.mono, background: '#121722', color: '#9DE0AD', padding: '8px 12px', borderRadius: 6 }}>
          › {progress}
        </div>
      )}

      {error && (
        <div style={{ marginTop: 10, padding: '8px 12px', background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 6, color: C.red, fontSize: 11 }}>
          {error}
        </div>
      )}
      {actionNotice && (
        <div style={{ marginTop: 10, padding: '8px 12px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 6, color: C.green, fontSize: 11 }}>
          {actionNotice}
        </div>
      )}

      {/* Repair results */}
      {!!repaired.length && (
        <div style={{ marginTop: 12, padding: 10, background: '#ECFDF5', border: '1px solid #BBF7D0', borderRadius: 6, fontSize: 11 }}>
          <strong style={{ color: C.green }}>Repair summary</strong>
          {repaired.map((r, i) => (
            <div key={i} style={{ marginTop: 4, color: C.text }}>
              <span style={{ color: REPO_COLORS[r.repo] || C.purple, fontWeight: 700 }}>{r.repo}</span> — {r.links} link(s) in {r.hubPath} · sitemap: {r.sitemapPaths.join(', ')}
            </div>
          ))}
          {repairPrUrl && (
            <div style={{ marginTop: 6 }}>
              PR: <a href={repairPrUrl} target="_blank" rel="noopener" style={{ color: C.purple }}>{repairPrUrl}</a>
            </div>
          )}
        </div>
      )}

      {/* Noindex fix results */}
      {(!!noIndexFixed.length || !!noIndexSkipped.length) && (
        <div style={{ marginTop: 12, padding: 10, background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 6, fontSize: 11 }}>
          <strong style={{ color: C.purple }}>Indexing fixes</strong>
          {!!noIndexFixed.length && (
            <div style={{ marginTop: 4 }}>
              <div style={{ color: C.green, fontWeight: 600, marginBottom: 2 }}>✅ Indexing enabled on {noIndexFixed.length} page(s):</div>
              {noIndexFixed.slice(0, 25).map((p, i) => (
                <div key={i} style={{ marginTop: 1, color: C.text }}>
                  <span style={{ color: REPO_COLORS[p.repo] || C.purple, fontWeight: 600 }}>{p.repo}</span> · <a href={p.url} target="_blank" rel="noopener" style={{ color: C.blue }}>{p.title}</a>
                  <span style={{ color: C.textDim }}> — {p.path}</span>
                </div>
              ))}
              {noIndexFixed.length > 25 && <div style={{ color: C.textDim, marginTop: 2 }}>…and {noIndexFixed.length - 25} more</div>}
            </div>
          )}
          {!!noIndexSkipped.length && (
            <div style={{ marginTop: 6 }}>
              <div style={{ color: C.amber, fontWeight: 600, marginBottom: 2 }}>⏸ Kept out of index ({noIndexSkipped.length} page(s) under 400 words):</div>
              {noIndexSkipped.slice(0, 8).map((p, i) => (
                <div key={i} style={{ color: C.textDim }}>· {p.repo}/{p.path} — {p.words} words</div>
              ))}
            </div>
          )}
          {fixPrUrl && (
            <div style={{ marginTop: 6 }}>
              PR: <a href={fixPrUrl} target="_blank" rel="noopener" style={{ color: C.purple }}>{fixPrUrl}</a>
            </div>
          )}
        </div>
      )}

      {/* Fix history */}
      {history !== null && (
        <div style={{ marginTop: 12, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ padding: '8px 12px', background: '#F9FAFB', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: 11, color: C.text }}>Fix history — all recorded fixes</strong>
            <button onClick={() => setHistory(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 11, color: C.textDim }}>✕ close</button>
          </div>
          {!history.length ? (
            <div style={{ padding: 14, fontSize: 11, color: C.textDim }}>No fixes recorded yet. Run a repair or enable indexing to build history.</div>
          ) : (
            <div style={{ maxHeight: 320, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ background: '#F9FAFB', color: C.textMuted, textAlign: 'left' }}>
                    <th style={{ padding: '6px 10px', borderBottom: `1px solid ${C.border}`, fontWeight: 700 }}>When</th>
                    <th style={{ padding: '6px 10px', borderBottom: `1px solid ${C.border}`, fontWeight: 700 }}>Fix</th>
                    <th style={{ padding: '6px 10px', borderBottom: `1px solid ${C.border}`, fontWeight: 700 }}>Repo</th>
                    <th style={{ padding: '6px 10px', borderBottom: `1px solid ${C.border}`, fontWeight: 700 }}>Path</th>
                    <th style={{ padding: '6px 10px', borderBottom: `1px solid ${C.border}`, fontWeight: 700 }}>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {[...history].reverse().map((h) => (
                    <tr key={h.id} style={{ borderBottom: `1px solid ${C.border}`, verticalAlign: 'top' }}>
                      <td style={{ padding: '6px 10px', color: C.textDim, whiteSpace: 'nowrap' }}>{fmtTime(h.timestamp)}</td>
                      <td style={{ padding: '6px 10px' }}><ActionBadge action={h.action} /></td>
                      <td style={{ padding: '6px 10px', color: REPO_COLORS[h.repo] || C.text, fontWeight: 600 }}>{h.repo}</td>
                      <td style={{ padding: '6px 10px', fontFamily: C.mono, fontSize: 10, color: C.textMuted, wordBreak: 'break-all' }}>
                        {h.prUrl ? <a href={h.prUrl} target="_blank" rel="noopener" style={{ color: C.purple }}>{h.path}</a> : h.path}
                      </td>
                      <td style={{ padding: '6px 10px', color: C.text }}>{h.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Orphan list */}
      {hasScanned && !!orphans.length && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.text, marginBottom: 6 }}>
            Orphan pages ({orphans.length}) — no inbound links yet
          </div>
          <div style={{ maxHeight: 260, overflowY: 'auto', border: `1px solid ${C.border}`, borderRadius: 8 }}>
            {orphans.slice(0, 100).map((p, i) => (
              <div key={i} style={{ padding: '7px 10px', borderBottom: `1px solid ${C.border}`, display: 'flex', gap: 8, alignItems: 'center', fontSize: 11 }}>
                <span style={{ background: REPO_COLORS[p.repo] || C.purple, color: '#FFF', borderRadius: 4, padding: '1px 6px', fontSize: 9, fontWeight: 700 }}>{p.repo}</span>
                <a href={p.url} target="_blank" rel="noopener" style={{ color: C.blue, fontWeight: 600 }}>{p.title}</a>
                <span style={{ color: C.textDim, fontFamily: C.mono, fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.path}</span>
              </div>
            ))}
            {orphans.length > 100 && <div style={{ padding: 8, fontSize: 10, color: C.textDim }}>…and {orphans.length - 100} more</div>}
          </div>
        </div>
      )}

      {/* Noindex inventory */}
      {hasScanned && (!!fullyExpandedNoindex.length || !!thinNoindex.length) && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.text, marginBottom: 6 }}>
            noindex inventory ({pages.filter((p) => p.noindex).length} pages)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: 8 }}>
              <div style={{ fontSize: 10, color: C.green, fontWeight: 700, marginBottom: 4 }}>
                Ready to index — ≥ 400 words ({fullyExpandedNoindex.length})
              </div>
              {fullyExpandedNoindex.slice(0, 12).map((p, i) => (
                <div key={i} style={{ fontSize: 10, color: C.text, padding: '2px 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <span style={{ color: REPO_COLORS[p.repo] || C.purple }}>{p.repo}</span> · {p.path} · <span style={{ color: C.textDim }}>{p.words}w</span>
                </div>
              ))}
            </div>
            <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: 8 }}>
              <div style={{ fontSize: 10, color: C.amber, fontWeight: 700, marginBottom: 4 }}>
                Thin — kept out of index ({thinNoindex.length})
              </div>
              {thinNoindex.slice(0, 12).map((p, i) => (
                <div key={i} style={{ fontSize: 10, color: C.text, padding: '2px 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <span style={{ color: REPO_COLORS[p.repo] || C.purple }}>{p.repo}</span> · {p.path} · <span style={{ color: C.textDim }}>{p.words}w</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
