'use client'
/**
 * OrphanWatch — Stage I · Discover signal card.
 *
 * Surfaces orphaned pages (no inbound internal links) and sitemap drift in the
 * Discover stage, with a one-click fix that injects interlinks and syncs the
 * sitemap — going live via PRs. Reuses the existing Site Health orchestrator
 * (`/api/content-studio/site-health/full`), so this is a signal + action, not a
 * new scan engine.
 */
import React from 'react'
import { studioTokens as E } from './studio-tokens'

const C = E

interface SitemapDiff {
  repo: string
  status: 'ok' | 'drift' | 'error'
  missing: string[]
  stale: string[]
  detail: string
}

interface OrphanPage {
  url: string
  title?: string
  path?: string
}

interface Report {
  totalOrphans: number
  totalNoindex: number
  orphans: OrphanPage[]
  sitemapDiffs: SitemapDiff[]
  repairs?: {
    orphansFixed: number
    sitemapsUpdated: number
    prUrls: string[]
    errors: string[]
    dryRun: boolean
  }
}

export default function OrphanWatch({ setActionNotice }: { setActionNotice: (msg: string) => void }) {
  const [scanning, setScanning] = React.useState(false)
  const [fixing, setFixing] = React.useState(false)
  const [report, setReport] = React.useState<Report | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const scan = React.useCallback(async () => {
    setScanning(true)
    setError(null)
    try {
      const res = await fetch('/api/content-studio/site-health/full', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ dryRun: true, batchSize: 25 }),
      })
      const data = (await res.json().catch(() => ({}))) as Report & { error?: string }
      if (!res.ok) throw new Error(data.error || `scan failed (${res.status})`)
      setReport(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'scan failed')
    } finally {
      setScanning(false)
    }
  }, [])

  const fix = React.useCallback(async () => {
    setFixing(true)
    setError(null)
    try {
      const res = await fetch('/api/content-studio/site-health/full', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ dryRun: false, fixOrphans: true, fixSitemaps: true, fixNoindex: false, batchSize: 25 }),
      })
      const data = (await res.json().catch(() => ({}))) as Report & { error?: string }
      if (!res.ok) throw new Error(data.error || `fix failed (${res.status})`)
      setReport(data)
      const r = data.repairs
      const prs = r?.prUrls?.length ?? 0
      setActionNotice(
        `🕸️ Orphan/sitemap fix: ${r?.orphansFixed ?? 0} orphan(s) interlinked · ${r?.sitemapsUpdated ?? 0} sitemap(s) synced${prs ? ` · ${prs} PR(s) → live on merge` : ''}`,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'fix failed')
    } finally {
      setFixing(false)
    }
  }, [setActionNotice])

  React.useEffect(() => {
    void scan()
  }, [scan])

  const orphans = report?.totalOrphans ?? 0
  const sitemapDrift = report?.sitemapDiffs?.some((d) => d.status !== 'ok') ?? false
  const lastRepairs = report?.repairs

  return (
    <div style={{ padding: 14, background: E.paper, border: `1px solid ${E.hairline}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <div style={{ fontSize: 10, color: E.gold, fontFamily: C.mono, letterSpacing: '0.14em', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13 }}>🕸️</span>ORPHANS &amp; SITEMAP
        </div>
        <button
          type="button"
          onClick={scan}
          disabled={scanning || fixing}
          style={{
            padding: '4px 10px', borderRadius: 0, border: `1px solid ${E.hairline}`, background: 'transparent',
            color: E.inkMuted, fontSize: 9, fontWeight: 700, fontFamily: C.mono, cursor: scanning || fixing ? 'wait' : 'pointer',
          }}
        >
          {scanning ? 'Scanning…' : '↻ Scan'}
        </button>
      </div>

      {error && <div style={{ fontSize: 10, color: E.red, fontFamily: C.mono, marginBottom: 8 }}>⚠ {error}</div>}

      {report ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Stat label="Orphans" value={orphans} tone={orphans > 0 ? 'bad' : 'good'} />
            <Stat label="Noindex" value={report.totalNoindex} tone={report.totalNoindex > 0 ? 'warn' : 'good'} />
            <Stat label="Sitemap" value={sitemapDrift ? 'drift' : 'ok'} tone={sitemapDrift ? 'warn' : 'good'} />
          </div>

          {orphans > 0 && (
            <div style={{ maxHeight: 120, overflow: 'auto', borderTop: `1px solid ${E.hairlineSoft}`, paddingTop: 6 }}>
              {report.orphans.slice(0, 12).map((o) => (
                <div key={o.url} style={{ fontSize: 9, color: E.inkDim, fontFamily: C.mono, lineHeight: 1.6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  • {o.title || o.path || o.url}
                </div>
              ))}
              {report.orphans.length > 12 && (
                <div style={{ fontSize: 9, color: E.inkDim, fontFamily: C.mono }}>…and {report.orphans.length - 12} more</div>
              )}
            </div>
          )}

          {sitemapDrift && report.sitemapDiffs?.filter((d) => d.status !== 'ok').map((d) => (
            <div key={d.repo} style={{ fontSize: 9, color: E.inkMuted, fontFamily: C.mono }}>
              {d.repo}: {d.detail}
            </div>
          ))}

          {lastRepairs && !lastRepairs.dryRun && (
            <div style={{ fontSize: 9, color: E.green, fontFamily: C.mono }}>
              ✓ {lastRepairs.orphansFixed} interlinked · {lastRepairs.sitemapsUpdated} sitemap synced{lastRepairs.prUrls?.length ? ` · ${lastRepairs.prUrls.length} PR(s) open` : ''}
            </div>
          )}

          <button
            type="button"
            onClick={fix}
            disabled={fixing || scanning || (orphans === 0 && !sitemapDrift)}
            style={{
              padding: '8px 12px', borderRadius: 0, border: `1px solid ${E.gold}`, background: fixing ? E.goldSoft : E.gold,
              color: fixing ? E.gold : E.ivory, fontSize: 10, fontWeight: 700, fontFamily: C.mono, cursor: fixing || scanning ? 'wait' : (orphans === 0 && !sitemapDrift) ? 'not-allowed' : 'pointer',
              opacity: fixing || (orphans === 0 && !sitemapDrift) ? 0.6 : 1,
            }}
          >
            {fixing ? 'Fixing & shipping…' : orphans === 0 && !sitemapDrift ? '✓ All clear' : 'Fix orphans & sitemap → ship'}
          </button>
        </div>
      ) : (
        <div style={{ fontSize: 10, color: E.inkMuted, fontFamily: C.serif, fontStyle: 'italic' }}>
          {scanning ? 'Scanning the estate for orphaned pages and sitemap drift…' : 'No scan yet.'}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone: 'good' | 'warn' | 'bad' }) {
  const color = tone === 'good' ? E.green : tone === 'warn' ? E.orange : E.red
  return (
    <div style={{ padding: '6px 10px', border: `1px solid ${E.hairlineSoft}`, borderRadius: 0, minWidth: 72 }}>
      <div style={{ fontSize: 8, color: E.inkDim, fontFamily: C.mono, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 800, color, fontFamily: C.mono }}>{value}</div>
    </div>
  )
}
