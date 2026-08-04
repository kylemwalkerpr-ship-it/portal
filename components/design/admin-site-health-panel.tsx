'use client'
import { useState } from 'react'

const C = {
  surface: '#FFFFFF', border: 'rgba(0,0,0,0.08)', red: '#DC2626', green: '#166534',
  orange: '#D97706', text: '#1F2937', textMuted: '#6B7280', textDim: '#9CA3AF',
  purple: '#7C3AED',
  serif: "var(--portal-font-display, 'Cormorant Garamond', Garamond, Georgia, serif)",
  mono: "var(--portal-font-mono, 'SF Mono', Menlo, Monaco, monospace)",
}

type Orphan = { url: string; path: string; title: string; host: string; inboundLinks: number }
type Repaired = { repo: string; hubPath: string; links: number; sitemapPaths: string[] }
type Result = {
  scannedPages?: number; scannedFiles?: number; orphanCount?: number
  orphanPages?: Orphan[]; repaired?: Repaired[]; prUrl?: string | null
  pages?: any[]; filesScanned?: number; totalFiles?: number; nextBatch?: number | null
  orphansFixed?: number; totalOrphans?: number
}

export default function AdminSiteHealthPanel() {
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState('')
  const [actionNotice, setActionNotice] = useState('')

  const runChunked = async (action: 'audit_chunked' | 'repair_chunked') => {
    setBusy(true); setError(''); setActionNotice(''); setResult(null)
    const batchSize = action === 'audit_chunked' ? 20 : 10
    let batchStart = 0
    let accumulated: any = action === 'audit_chunked'
      ? { pages: [], filesScanned: 0, totalFiles: 0 }
      : { repaired: [], orphansFixed: 0, totalOrphans: 0 }

    try {
      while (true) {
        setProgress(`Batch ${Math.floor(batchStart / batchSize) + 1}...`)
        const response = await fetch('/api/content-studio/site-health', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, batchStart, batchSize }),
        })
        const data = await response.json()
        if (!data.ok) throw new Error(data.error || 'Chunked operation failed')

        if (action === 'audit_chunked') {
          accumulated.pages.push(...(data.pages || []))
          accumulated.filesScanned += data.filesScanned || 0
          accumulated.totalFiles = data.totalFiles || 0
        } else {
          accumulated.repaired.push(...(data.repaired || []))
          accumulated.orphansFixed += data.orphansFixed || 0
          accumulated.totalOrphans = data.totalOrphans || 0
          accumulated.prUrl = data.prUrl
        }

        if (data.nextBatch == null) break
        batchStart = data.nextBatch
      }

      setProgress('')
      if (action === 'audit_chunked') {
        setResult({
          scannedPages: accumulated.pages.length,
          scannedFiles: accumulated.filesScanned,
          orphanCount: accumulated.pages.filter((p: any) => (p.inboundLinks || 0) === 0).length,
          orphanPages: accumulated.pages.filter((p: any) => (p.inboundLinks || 0) === 0),
        })
        setActionNotice(`Scan complete: ${accumulated.pages.length} pages, ${accumulated.filesScanned} files`)
      } else {
        setResult({
          repaired: accumulated.repaired,
          orphanCount: accumulated.orphansFixed,
          prUrl: accumulated.prUrl,
        })
        setActionNotice(`Repaired ${accumulated.orphansFixed} of ${accumulated.totalOrphans} orphan pages`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Operation failed')
      setProgress('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: 14 }}>
      <h4 style={{ margin: 0, fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Site Health</h4>
      <h3 style={{ margin: '4px 0 2px', fontFamily: C.serif, fontSize: 18, color: C.text }}>Orphan repair + sitemap sync</h3>
      <p style={{ margin: '4px 0 8px', fontSize: 11, color: C.textMuted, lineHeight: 1.5 }}>
        Find indexable pages with no inbound link, add them to a stable related-guides hub, and update the matching sitemap in the same reviewable PR.
        Scans in chunks of 20 pages to stay under the Cloudflare Workers 50-subrequest limit.
      </p>
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={() => runChunked('audit_chunked')} disabled={busy}
          style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 11px',
            background: busy ? '#F3F4F6' : '#FFF', color: busy ? C.textDim : C.text,
            cursor: busy ? 'not-allowed' : 'pointer', fontSize: 11, fontWeight: 700 }}>
          Scan orphans
        </button>
        <button onClick={() => runChunked('repair_chunked')} disabled={busy || !result}
          style={{ border: 'none', borderRadius: 6, padding: '8px 11px',
            background: result && !busy ? C.purple : '#E5E7EB', 
            color: result && !busy ? '#FFF' : C.textDim,
            cursor: result && !busy ? 'pointer' : 'not-allowed', fontSize: 11, fontWeight: 700 }}>
          Repair + sync sitemap
        </button>
      </div>

      {progress && (
        <div style={{ marginTop: 10, fontSize: 11, color: C.textMuted, fontFamily: C.mono }}>
          {progress}
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

      {!!result?.repaired?.length && (
        <div style={{ marginTop: 12, padding: 10, background: '#ECFDF5', border: '1px solid #BBF7D0', borderRadius: 6, color: C.text, fontSize: 11 }}>
          {result.repaired.map((r, i) => (
            <div key={i}>
              <strong>{r.repo}</strong>: {r.links} links in {r.hubPath} · sitemaps: {r.sitemapPaths.join(', ')}
            </div>
          ))}
          {result.prUrl && <div style={{ marginTop: 6 }}>PR: <a href={result.prUrl} target="_blank" rel="noopener" style={{ color: C.purple }}>{result.prUrl}</a></div>}
        </div>
      )}
    </div>
  )
}
