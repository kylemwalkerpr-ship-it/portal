'use client'
/**
 * §19 SEO Intelligence beside the existing article editor.
 * Local coverage while typing; full Phase 1–9 APIs only on Analyze / Save.
 */

import * as React from 'react'
import {
  applyInternalLinkMarkdown,
  scoreClusterCoverage,
  type CoverageBreakdown,
  type InternalLinkSuggestion,
} from '@/lib/seoFactory/coverageLinks'
import { extractEntities } from '@/lib/seoFactory/topicGraph'

type Opp = {
  query?: string
  page?: string
  action?: string
  score?: number
  confidence?: number
  impressions?: number
  position?: number
  ctr?: number
  signals?: { topicalGap?: number }
}

type Props = {
  /** Draft body (empty when mounting in Briefing, before any draft exists). */
  content?: string
  title?: string
  topic?: string
  url?: string
  primaryKeyword?: string
  clusterKeywords?: string[]
  analyzeTick?: number
  disabled?: boolean
  /**
   * 'drafting' — live coverage-while-typing next to an article body.
   * 'briefing' — analyze + brief against seed/topic + first-party intel only
   *              (no draft markdown required). Emits the writer contract via
   *              `onBriefReady` instead of discarding it.
   */
  mode?: 'drafting' | 'briefing'
  /** Receives the structured `{ brief, writerContract }` so Brief Assembly can
   *  carry the single writer contract into the Generate/Draft handoff. */
  onBriefReady?: (payload: { brief: unknown; writerContract: string }) => void
  onInsert: (next: string) => void
  style?: React.CSSProperties
}

const C = {
  muted: '#6B7280', ink: '#1F2937', line: 'rgba(0,0,0,0.08)', gold: '#9A7B3B',
  navy: '#0F172A', red: '#B91C1C', green: '#166534',
  mono: 'ui-monospace, Menlo, monospace',
}

export default function EditorSeoIntelPanel({
  content, title, topic, url, primaryKeyword, clusterKeywords, analyzeTick, disabled, mode = 'drafting', onBriefReady, onInsert, style,
}: Props) {
  const withBody = mode === 'drafting'
  const deriveBody = String(content || '').trim()
  const seed = String(primaryKeyword || topic || title || '').trim()
  const kws = (clusterKeywords || []).filter(Boolean)
  const [localCoverage, setLocalCoverage] = React.useState<CoverageBreakdown | null>(null)
  const [full, setFull] = React.useState<{
    opp?: Opp
    coverage?: CoverageBreakdown
    links?: InternalLinkSuggestion[]
    cannibals?: Array<{ recommendedAction: string; pageA: string; pageB: string; reasons?: string[] }>
    gsc?: { impressions?: number; position?: number; ctr?: number } | null
    gscState?: 'none' | 'disconnected' | 'ok'
    missing?: string[]
    clusterLabel?: string
  } | null>(null)
  const [briefText, setBriefText] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [briefBusy, setBriefBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [note, setNote] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!withBody) {
      setLocalCoverage(null)
      return
    }
    const t = setTimeout(() => {
      if (countWords(deriveBody) < 20) {
        setLocalCoverage(null)
        return
      }
      setLocalCoverage(scoreClusterCoverage({
        title: title || topic || '',
        bodyText: deriveBody,
        clusterKeywords: kws.length ? kws : seed ? [seed] : [],
      }))
    }, 800)
    return () => clearTimeout(t)
  }, [deriveBody, title, topic, seed, kws.join('|'), withBody])

  const analyze = React.useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const cluster = kws.length ? kws : seed ? [seed] : []
      const covRes = await fetch('/api/content-studio/coverage/suggest', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: deriveBody, title: title || topic, url, clusterKeywords: cluster, limit: 6,
        }),
      })
      const cov = await covRes.json()
      const [oppJ, canJ] = await Promise.all([
        fetch('/api/content-studio/opportunities/score?days=90&limit=80', { credentials: 'same-origin' }).then((r) => r.json()).catch(() => ({})),
        fetch('/api/content-studio/cannibalization/detect?days=90', { credentials: 'same-origin' }).then((r) => r.json()).catch(() => ({})),
      ])
      const opps: Opp[] = Array.isArray(oppJ?.opportunities) ? oppJ.opportunities : []
      const needle = (url || seed).toLowerCase()
      const opp = opps.find((o) =>
        (url && o.page && o.page.replace(/\/+$/, '').toLowerCase() === url.replace(/\/+$/, '').toLowerCase()) ||
        (seed && String(o.query || '').toLowerCase().includes(seed.toLowerCase().slice(0, 40))),
      ) || opps[0]
      const hits = Array.isArray(canJ?.candidates) ? canJ.candidates : []
      const self = (url || '').replace(/\/+$/, '').toLowerCase()
      const cannibals = hits.filter((c: { pageA: string; pageB: string }) => {
        if (!self) return false
        return c.pageA.replace(/\/+$/, '').toLowerCase() === self || c.pageB.replace(/\/+$/, '').toLowerCase() === self
      })
      let gscState: 'none' | 'disconnected' | 'ok' = 'none'
      if (oppJ?.error && /GSC|credential|unconfigured/i.test(String(oppJ.error))) gscState = 'disconnected'
      else if (url && opp?.impressions) gscState = 'ok'
      else if (url) gscState = 'none'

      const bodyEnt = extractEntities(`${title || ''}\n${deriveBody}`).map((e) => e.toLowerCase())
      const required = cluster.map((k) => k.toLowerCase())
      const missing = required.filter((k) => k.length > 3 && !bodyEnt.some((e) => e.includes(k) || k.includes(e)) && !deriveBody.toLowerCase().includes(k))

      if (!covRes.ok && cov?.error) setError(String(cov.error))
      setFull({
        opp,
        coverage: cov?.coverage,
        links: Array.isArray(cov?.suggestions) ? cov.suggestions : [],
        cannibals,
        gsc: opp && gscState === 'ok' ? { impressions: opp.impressions, position: opp.position, ctr: opp.ctr } : null,
        gscState: url ? gscState : 'none',
        missing: missing.slice(0, 8),
        clusterLabel: seed || undefined,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'SEO analyze failed')
    } finally {
      setBusy(false)
    }
  }, [deriveBody, title, topic, url, seed, kws.join('|')])

  React.useEffect(() => {
    if (analyzeTick && analyzeTick > 0) void analyze()
  }, [analyzeTick])

  const generateBrief = async () => {
    setBriefBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/content-studio/briefs/from-intel', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seed: seed || title || topic, content: deriveBody, url, title }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Brief failed')
      setBriefText(data.writerContract || JSON.stringify(data.brief, null, 2))
      onBriefReady?.({ brief: data.brief, writerContract: String(data.writerContract || '') })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Brief failed')
    } finally {
      setBriefBusy(false)
    }
  }

  const insertLink = (s: InternalLinkSuggestion) => {
    const result = applyInternalLinkMarkdown(deriveBody, s, url)
    if (!result.applied) {
      setNote(result.reason === 'self-link' ? 'Skipped self-link' : result.reason === 'already-linked' ? 'Already linked' : 'Could not insert')
      return
    }
    onInsert(result.content)
    setNote(`Inserted “${s.suggestedAnchor}”`)
    setFull((prev) => prev ? { ...prev, links: (prev.links || []).filter((l) => l.targetUrl !== s.targetUrl) } : prev)
  }

  const cov = full?.coverage || localCoverage
  const unpublished = !url
  const noAnalysis = !full && !busy

  const metric = (label: string, value: string | number | undefined, hint?: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '4px 0', fontSize: 12 }}>
      <span style={{ color: C.muted }}>{label}</span>
      <span style={{ fontWeight: 700, color: C.ink }} title={hint}>{value ?? '—'}</span>
    </div>
  )

  return (
    <aside style={{ width: 280, flexShrink: 0, border: `1px solid ${C.line}`, background: '#FFFEFC', padding: 12, fontSize: 12, maxHeight: 720, overflow: 'auto', ...style }}>
      <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', color: C.gold, fontFamily: C.mono }}>SEO INTELLIGENCE{mode === 'briefing' ? ' · BRIEFING' : ''}</div>
      <div style={{ color: C.muted, fontSize: 10, margin: '4px 0 8px' }}>
        {mode === 'briefing'
          ? 'First-party demand intel to shape the writer brief before drafting'
          : unpublished ? 'Unpublished draft — no live GSC URL' : 'Existing URL — GSC when synced'}
      </div>
      {error && <div style={{ color: C.red, marginBottom: 8 }}>{error}</div>}
      {note && <div style={{ color: C.green, marginBottom: 8 }}>{note}</div>}
      {busy && <div style={{ color: C.muted, marginBottom: 8 }}>Analyzing…</div>}
      {withBody && noAnalysis && !localCoverage && countWords(deriveBody) < 20 && (
        <div style={{ color: C.muted, marginBottom: 8 }}>Not enough copy yet. Type, then Analyze.</div>
      )}
      {metric('Opportunity', full?.opp?.score != null ? String(full.opp.score) : '—', 'From Phase 6 score API')}
      {metric('Confidence', full?.opp?.confidence != null ? String(full.opp.confidence) : '—')}
      {metric('Action', full?.opp?.action || (unpublished ? 'CREATE?' : '—'))}
      {metric('Coverage', cov?.score != null ? String(cov.score) : '—', localCoverage && !full ? 'Local while typing' : 'Phase 5 API')}
      {metric('Topic fit', full?.clusterLabel ? seed.slice(0, 24) : (seed || '—'))}
      {metric('Internal links', full?.links ? String(full.links.length) : '—')}
      {full?.gscState === 'disconnected' && <div style={{ color: C.red, margin: '6px 0' }}>GSC disconnected or not configured</div>}
      {full?.gscState === 'none' && url && <div style={{ color: C.muted, margin: '6px 0' }}>No GSC row for this URL — sync or unpublished path</div>}
      {full?.gsc && (
        <div style={{ color: C.muted, fontSize: 11, margin: '6px 0' }}>
          GSC {full.gsc.impressions?.toLocaleString()} impr · pos {full.gsc.position} · CTR {full.gsc.ctr != null ? (full.gsc.ctr > 1 ? full.gsc.ctr : (full.gsc.ctr * 100)).toFixed(1) : '—'}%
        </div>
      )}
      {full?.cannibals && full.cannibals.length > 0 && (
        <div style={{ background: '#FEF2F2', padding: 8, margin: '8px 0', color: C.red }}>
          Cannibalization: {full.cannibals[0].recommendedAction} — {full.cannibals[0].reasons?.[0] || 'review overlapping URL'}
        </div>
      )}
      {(full?.missing || []).length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Missing topics / entities</div>
          <ul style={{ margin: 0, paddingLeft: 16 }}>{full!.missing!.map((m) => <li key={m}>{m}</li>)}</ul>
        </div>
      )}
      <div style={{ marginTop: 10 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Link opportunities</div>
        {!(full?.links || []).length && <div style={{ color: C.muted }}>None yet — Analyze to load corpus matches.</div>}
        {(full?.links || []).map((l) => (
          <div key={l.targetUrl} style={{ borderTop: `1px solid ${C.line}`, padding: '6px 0' }}>
            <div style={{ fontWeight: 600 }}>{l.targetTitle.slice(0, 48)}</div>
            <div style={{ color: C.muted, fontSize: 10 }}>{l.relevance}% · {l.suggestedAnchor}</div>
            <button type="button" disabled={disabled} onClick={() => insertLink(l)} style={{ marginTop: 4, fontSize: 10, fontWeight: 700, background: C.navy, color: '#fff', border: 'none', padding: '2px 8px', cursor: 'pointer' }}>Insert</button>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
        <button type="button" disabled={busy || disabled} onClick={() => void analyze()} style={{ padding: '6px 8px', fontSize: 11, fontWeight: 700, background: C.navy, color: '#fff', border: 'none', cursor: busy ? 'wait' : 'pointer' }}>
          {busy ? 'Analyzing…' : 'Analyze SEO'}
        </button>
        <button type="button" disabled={briefBusy || disabled || !seed} onClick={() => void generateBrief()} style={{ padding: '6px 8px', fontSize: 11, fontWeight: 700, background: '#fff', color: C.navy, border: `1px solid ${C.line}`, cursor: 'pointer' }}>
          {briefBusy ? 'Briefing…' : 'Generate SEO Brief'}
        </button>
      </div>
      {briefText && (
        <pre style={{ marginTop: 8, whiteSpace: 'pre-wrap', fontSize: 10, fontFamily: C.mono, maxHeight: 180, overflow: 'auto', background: '#F8FAFC', padding: 8 }}>{briefText}</pre>
      )}
    </aside>
  )
}

function countWords(md: string): number {
  return String(md || '').trim().split(/\s+/).filter(Boolean).length
}
