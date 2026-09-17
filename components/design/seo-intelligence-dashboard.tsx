'use client'
/**
 * $0 SEO Intelligence dashboard — lives inside Content Studio Discover.
 * No Volume / KD / CPC columns. No paid SEO APIs required.
 *
 * Standalone: original chrome (header + Sync/Refresh).
 * Evidence: compact tab surface that feeds the Master Engine work plan.
 */

import * as React from 'react'
import { studioTokens as E } from './studio-tokens'
import { isJunkQuery } from '@/lib/seoFactory/queryNoise'
// Type-only import of the server contract (pure lib, no runtime import) so the
// UI cannot drift from the /api/content-studio/gsc/performance payload shape.
import type {
  GscVisibilityBucket,
  GscVisibilityScope,
  GscVisibilitySummary,
} from '@/lib/seoFactory/gscVisibility'

export const SEO_INTEL_NAV = [
  'overview',
  'opportunities',
  'topics',
  'content',
  'links',
  'keywords',
  'gsc',
] as const

export type SeoIntelNav = (typeof SEO_INTEL_NAV)[number]

export const OPPORTUNITY_TABLE_COLUMNS = [
  'Opportunity',
  'Action',
  'Score',
  'Confidence',
  'Impressions',
  'Position',
  'CTR',
  'Coverage',
] as const

export const FORBIDDEN_SEO_COLUMNS = ['Volume', 'KD', 'CPC', 'Keyword Difficulty'] as const

const C = {
  ink: E.inkBlack,
  muted: E.inkMuted,
  dim: E.inkDim,
  gold: E.gold,
  line: E.border,
  paper: E.paper,
  tile: E.surface2,
  mono: E.mono,
  serif: E.serif,
}

export type OppRow = {
  query?: string
  page?: string
  action?: string
  score?: number
  confidence?: number
  impressions?: number
  clicks?: number
  position?: number
  ctr?: number
  actionReasons?: string[]
  signals?: { topicalGap?: number }
}

export type SeoIntelCluster = {
  id: string
  label: string
  size: number
  keywords: Array<{ keyword: string; source: string; sources: string[] }>
}

export type SeoIntelStats = {
  high: number
  refresh: number
  cannibals: number
  linkCandidates: number
  thinClusters: number
  clicks: number
  impressions: number
  rowCount: number
  promoted: number
}

export type SeoIntelHandle = {
  load: () => Promise<void>
  syncGsc: () => Promise<void>
}

export type SeoIntelDashboardProps = {
  variant?: 'standalone' | 'evidence'
  onOpps?: (opps: OppRow[]) => void
  onStats?: (stats: SeoIntelStats) => void
  onBusy?: (busy: boolean) => void
  onPromote?: (row: OppRow) => void
  onPromoteCluster?: (cluster: SeoIntelCluster) => void
}

/* ── P1 qualified visibility — full-window summary from the performance route ── */

export const VISIBILITY_METRIC_LABELS = [
  'Raw visibility',
  'Qualified visibility',
  'Off-mission visibility',
] as const

export type VisibilityMetricLabel = (typeof VISIBILITY_METRIC_LABELS)[number]

/**
 * `response.visibility` from /api/content-studio/gsc/performance: computed
 * server-side over the whole scanned persisted window (never over the `rows`
 * display slice), so the metrics below cannot be a function of the limit.
 *
 * Members are `Partial` of the server contract: a missing/absent field is
 * UNKNOWN and must render as an em dash — never coerced to a fabricated 0.
 */
export type SeoIntelVisibilityBucket = Partial<GscVisibilityBucket>

export type SeoIntelVisibilitySummary = {
  measurement?: GscVisibilitySummary['measurement']
  windowDays?: number
  rowCount?: number
  totals?: Partial<GscVisibilitySummary['totals']> | null
  qualified?: SeoIntelVisibilityBucket | null
  offMission?: SeoIntelVisibilityBucket | null
  junk?: SeoIntelVisibilityBucket | null
  deepTail?: SeoIntelVisibilityBucket | null
  scope?: Partial<GscVisibilityScope> | null
}

export type VisibilityMetric = { label: VisibilityMetricLabel; value: string; sub: string }

/**
 * M7 — absent/non-finite is UNKNOWN, not 0. A fabricated 0 would read as "we
 * measured no off-mission impressions", which is exactly the lie P1 forbids.
 */
const metricNumberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/** Unknown marker for a summary field that is absent or non-finite. */
export const UNKNOWN_METRIC = '—'

/** Counts a summary field, or an em dash when it is absent/non-finite (0 stays 0). */
export function formatMetricCount(value: unknown): string {
  const n = metricNumberOrNull(value)
  return n == null ? UNKNOWN_METRIC : n.toLocaleString()
}

const metricShare = (part: number | null, raw: number | null, share: unknown): string => {
  const explicit = metricNumberOrNull(share)
  const ratio = explicit ?? (part != null && raw != null && raw > 0 ? part / raw : null)
  if (ratio == null) return UNKNOWN_METRIC
  return `${(ratio * 100).toFixed(1)}%`
}

const metricClicks = (value: unknown): string => {
  const n = metricNumberOrNull(value)
  return n == null ? 'clicks unknown' : `${n.toLocaleString()} clicks`
}

/** The three metrics, read from the summary only — the limited `rows` slice never feeds them. */
export function visibilityMetrics(
  visibility: SeoIntelVisibilitySummary | null | undefined,
): VisibilityMetric[] {
  const raw = metricNumberOrNull(visibility?.totals?.impressions)
  const qualified = metricNumberOrNull(visibility?.qualified?.impressions)
  const offMission = metricNumberOrNull(visibility?.offMission?.impressions)
  return [
    {
      label: 'Raw visibility',
      value: formatMetricCount(raw),
      sub: 'impressions persisted in the window · junk + off-mission included',
    },
    {
      label: 'Qualified visibility',
      value: formatMetricCount(qualified),
      sub: `${metricShare(qualified, raw, visibility?.qualified?.share)} of raw impressions · ${metricClicks(visibility?.qualified?.clicks)}`,
    },
    {
      label: 'Off-mission visibility',
      value: formatMetricCount(offMission),
      sub: `${metricShare(offMission, raw, visibility?.offMission?.share)} of raw impressions · real demand, not actionable`,
    },
  ]
}

/**
 * Incomplete/truncated disclosure. `null` only when the summary explicitly
 * reports `scope.complete === true`; a bounded or unknown-count scan can never
 * be presented as a complete measurement, and the server caveat is shown
 * verbatim when present.
 */
export function visibilityMeasurementNote(
  visibility: SeoIntelVisibilitySummary | null | undefined,
): string | null {
  if (!visibility) return null
  const scope = visibility.scope
  if (scope?.complete === true) return null
  const caveat = typeof scope?.caveat === 'string' ? scope.caveat.trim() : ''
  if (caveat) return caveat
  if (scope?.truncated === true) {
    return 'Partial measurement: truncated scan — the mix covers only the scanned slice of the persisted window, so it is incomplete.'
  }
  return 'Partial measurement: the exact persisted window row count is unavailable, so the mix is incomplete and may not cover the whole window.'
}

/** Raw / qualified / off-mission metrics over the full persisted window. */
export const SeoIntelVisibilityStrip = ({
  visibility,
}: {
  visibility: SeoIntelVisibilitySummary | null | undefined
}) => {
  if (!visibility) return null
  const scope = visibility.scope
  const complete = scope?.complete === true
  const note = visibilityMeasurementNote(visibility)
  return (
    <div
      data-testid="seo-visibility-mix"
      data-complete={complete ? 'true' : 'false'}
      style={{ padding: '8px 16px', borderBottom: `1px solid ${C.line}`, background: E.ivory }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
        <span style={{ fontFamily: C.mono, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.dim }}>
          Visibility mix · full persisted window{typeof visibility.windowDays === 'number' ? ` · ${visibility.windowDays}d` : ''}
        </span>
        <span
          data-testid="seo-visibility-scope-status"
          style={{ fontFamily: C.mono, fontSize: 9, fontWeight: 700, color: complete ? C.muted : E.goldDeep, border: `1px solid ${complete ? C.line : E.gold}`, borderRadius: 999, padding: '1px 7px' }}
        >
          {complete ? 'Complete measurement' : 'Incomplete measurement'}
        </span>
        {typeof scope?.scannedRows === 'number' && (
          <span style={{ fontFamily: C.mono, fontSize: 9, color: C.dim }}>
            {scope.scannedRows.toLocaleString()} scanned{typeof scope.windowRowCount === 'number' ? ` of ${scope.windowRowCount.toLocaleString()}` : ''} persisted rows
            {scope.truncated ? ` · truncated at cap ${formatMetricCount(scope.cap)}` : ''}
          </span>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
        {visibilityMetrics(visibility).map((m) => (
          <React.Fragment key={m.label}>{card(m.label, m.value, m.sub, { upper: false })}</React.Fragment>
        ))}
      </div>
      {note && (
        <div data-testid="seo-visibility-scope-caveat" style={{ marginTop: 8, fontFamily: C.mono, fontSize: 10.5, color: C.ink }}>
          {note}
        </div>
      )}
    </div>
  )
}

const card = (label: string, value: string, sub: string, opts?: { upper?: boolean }) => (
  <div style={{ padding: '12px 14px', background: C.tile, border: `1px solid ${E.hairlineSoft}`, boxShadow: '0 1px 0 rgba(17,21,28,0.04)' }}>
    <div style={{ fontSize: 9, letterSpacing: '0.08em', textTransform: opts?.upper === false ? 'none' : 'uppercase', color: C.dim, fontFamily: C.mono }}>{label}</div>
    <div style={{ fontFamily: C.serif, fontSize: 22, color: C.ink, marginTop: 4 }}>{value}</div>
    <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{sub}</div>
  </div>
)

/**
 * M4 — window-level stats for the old slice-derived surface.
 *
 * `rows` is the LIMITED, junk-free diagnostic list the GSC tab renders (at most
 * `scope.displayLimit` rows). It is NOT the persisted window. When the route
 * returns the full-window `visibility` summary it is the only source for
 * window-level numbers: `visibility.totals` for clicks/impressions and
 * `visibility.scope.windowRowCount` (else the scanned count) for persisted
 * rows. The display slice keeps naming only itself — `diagnosticRowCount` —
 * and is used for the window totals only when no summary exists at all.
 */
export type SeoIntelGscWindowStats = {
  clicks: number | null
  impressions: number | null
  /** Exact persisted rows in the resolved window when the server knows them. */
  windowRowCount: number | null
  /** Rows the server actually read for the measurement. */
  scannedRowCount: number | null
  /** Rows the GSC table renders: limited, junk-free diagnostics — not the window. */
  diagnosticRowCount: number
  /** Window-level row count when known, else scanned rows, else the diagnostics. */
  statRowCount: number
  source: 'visibility' | 'display'
}

export function gscWindowStats(input: {
  visibility?: SeoIntelVisibilitySummary | null
  rows?: Array<Record<string, unknown>> | null
  rowCount?: number | null
}): SeoIntelGscWindowStats {
  const rows = input.rows || []
  const diagnosticRowCount = typeof input.rowCount === 'number' ? input.rowCount : rows.length
  const visibility = input.visibility
  if (!visibility) {
    const totals = rows.reduce<{ clicks: number; impressions: number }>(
      (a, r) => ({
        clicks: a.clicks + (metricNumberOrNull(r?.clicks) ?? 0),
        impressions: a.impressions + (metricNumberOrNull(r?.impressions) ?? 0),
      }),
      { clicks: 0, impressions: 0 },
    )
    return {
      clicks: totals.clicks,
      impressions: totals.impressions,
      windowRowCount: null,
      scannedRowCount: null,
      diagnosticRowCount,
      statRowCount: diagnosticRowCount,
      source: 'display',
    }
  }
  const windowRowCount = metricNumberOrNull(visibility.scope?.windowRowCount)
  const scannedRowCount = metricNumberOrNull(visibility.scope?.scannedRows)
  return {
    clicks: metricNumberOrNull(visibility.totals?.clicks),
    impressions: metricNumberOrNull(visibility.totals?.impressions),
    windowRowCount,
    scannedRowCount,
    diagnosticRowCount,
    statRowCount: windowRowCount ?? scannedRowCount ?? diagnosticRowCount,
    source: 'visibility',
  }
}

const firstError = (responses: unknown[]): string | null => {
  for (const v of responses) {
    if (v && typeof v === 'object' && 'error' in v && String((v as { error: unknown }).error)) return String((v as { error: unknown }).error)
  }
  return null
}

const SeoIntelligenceDashboard = React.forwardRef<SeoIntelHandle, SeoIntelDashboardProps>(function SeoIntelligenceDashboard(
  { variant = 'standalone', onOpps, onStats, onBusy, onPromote, onPromoteCluster },
  ref,
) {
  const evidence = variant === 'evidence'
  const [nav, setNav] = React.useState<SeoIntelNav>(evidence ? 'opportunities' : 'overview')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [syncResult, setSyncResult] = React.useState<{
    rows: number
    range?: { startDate: string; endDate: string }
    source?: string
    warnings?: string[]
  } | null>(null)
  const [opps, setOpps] = React.useState<OppRow[]>([])
  const [gsc, setGsc] = React.useState<{ rows?: Array<Record<string, unknown>>; range?: { startDate: string; endDate: string }; rowCount?: number; visibility?: SeoIntelVisibilitySummary | null } | null>(null)
  const [cannibals, setCannibals] = React.useState<Array<{ pageA: string; pageB: string; overlapScore: number; recommendedAction: string; reasons: string[] }>>([])
  const [topics, setTopics] = React.useState<{ query?: { strongTopics?: Array<{ label: string; pages: number }>; thinClusters?: Array<{ label: string; pages: number }>; linkCandidates?: Array<{ from: string; to: string; via: string }> }; pages?: number } | null>(null)
  const [seed, setSeed] = React.useState('canada study permit')
  const [keywords, setKeywords] = React.useState<Array<{ keyword: string; source: string; sources: string[] }>>([])
  const [clusters, setClusters] = React.useState<SeoIntelCluster[]>([])

  const setBusyBoth = React.useCallback((next: boolean) => {
    setBusy(next)
    onBusy?.(next)
  }, [onBusy])

  const load = React.useCallback(async () => {
    setBusyBoth(true)
    setError(null)
    try {
      const [o, p, c, t] = await Promise.all([
        fetch('/api/content-studio/opportunities/score?days=90&limit=40', { credentials: 'same-origin' }).then((r) => r.json()),
        fetch('/api/content-studio/gsc/performance?days=90&limit=40', { credentials: 'same-origin' }).then((r) => r.json()),
        fetch('/api/content-studio/cannibalization/detect?days=90', { credentials: 'same-origin' }).then((r) => r.json()),
        fetch('/api/content-studio/topics/analyze', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then((r) => r.json()),
      ])
      const first = firstError([o, p, c, t])
      if (first) setError(first)
      const nextOpps = (Array.isArray(o?.opportunities) ? o.opportunities : []).filter((row: OppRow) => !isJunkQuery(String(row.query || '')))
      setOpps(nextOpps)
      setGsc(p?.ok ? p : null)
      setCannibals(Array.isArray(c?.candidates) ? c.candidates : [])
      setTopics(t?.ok ? t : null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'SEO intelligence failed to load')
    } finally {
      setBusyBoth(false)
    }
  }, [setBusyBoth])

  const syncGsc = React.useCallback(async () => {
    setBusyBoth(true)
    setError(null)
    setSyncResult(null)
    try {
      const res = await fetch('/api/content-studio/gsc/sync', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: 90 }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || (data as { error?: unknown }).error) {
        setError(String((data as { error?: unknown }).error || `GSC sync failed (${res.status})`))
        return
      }
      const d = data as { rowsProcessed?: number; range?: { startDate: string; endDate: string }; source?: string; warnings?: string[] }
      setSyncResult({ rows: Number(d.rowsProcessed ?? 0), range: d.range, source: d.source, warnings: d.warnings })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'GSC sync failed')
    } finally {
      setBusyBoth(false)
    }
  }, [load, setBusyBoth])

  React.useImperativeHandle(ref, () => ({ load, syncGsc }), [load, syncGsc])

  React.useEffect(() => { void load() }, [load])

  const explore = async () => {
    setBusyBoth(true)
    setError(null)
    try {
      const res = await fetch('/api/content-studio/keywords/discover', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seed }),
      })
      const data = await res.json()
      if (!res.ok || (data as { error?: unknown }).error) {
        setError(String((data as { error?: unknown }).error || `Keyword discover failed (${res.status})`))
        setKeywords([])
        setClusters([])
        return
      }
      const candidates = (Array.isArray(data.candidates) ? (data.candidates as Array<{ keyword: string; source: string; sources: string[] }>) : [])
        .filter((k) => !isJunkQuery(k.keyword))
      setKeywords(candidates)
      const clusterRes = await fetch('/api/content-studio/keywords/cluster', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(candidates.length ? { candidates } : { seed }),
      })
      const clusterData = await clusterRes.json().catch(() => ({}))
      if (!clusterRes.ok || (clusterData as { error?: unknown }).error) {
        setError(String((clusterData as { error?: unknown }).error || `Cluster failed (${clusterRes.status})`))
      }
      const nextClusters = (Array.isArray(clusterData.clusters) ? clusterData.clusters : []) as SeoIntelCluster[]
      setClusters(nextClusters.filter((cl) => !isJunkQuery(cl.label)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Keyword explorer failed')
    } finally {
      setBusyBoth(false)
    }
  }

  const refresh = opps.filter((o) => o.action === 'REFRESH')
  const high = opps.filter((o) => (o.score || 0) >= 60)
  // M4: window-level numbers come from the full-window visibility summary when
  // the route provides it; the limited `gsc.rows` slice is diagnostics only.
  const gscStats = gscWindowStats({ visibility: gsc?.visibility, rows: gsc?.rows, rowCount: gsc?.rowCount })
  const promoted = opps.filter((o) => (o.score || 0) >= 22 && String(o.action || '').toUpperCase() !== 'WATCH').length

  React.useEffect(() => { onOpps?.(opps) }, [opps, onOpps])
  React.useEffect(() => {
    onStats?.({
      high: high.length,
      refresh: refresh.length,
      cannibals: cannibals.length,
      linkCandidates: topics?.query?.linkCandidates?.length || 0,
      thinClusters: topics?.query?.thinClusters?.length || 0,
      clicks: gscStats.clicks ?? 0,
      impressions: gscStats.impressions ?? 0,
      // Window-level row count, never the limited diagnostic slice.
      rowCount: gscStats.statRowCount,
      promoted,
    })
  }, [high.length, refresh.length, cannibals.length, topics, gscStats.clicks, gscStats.impressions, gscStats.statRowCount, promoted, onStats])

  const table = (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr>
            {OPPORTUNITY_TABLE_COLUMNS.map((col) => (
              <th key={col} style={{ textAlign: 'left', padding: '6px 8px', borderBottom: `1px solid ${C.line}`, fontFamily: C.mono, fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.muted }}>{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {opps.slice(0, 40).map((o, i) => (
            <tr key={i}>
              <td style={{ padding: '7px 8px', maxWidth: 280 }}>
                <div>{o.query}</div>
                {onPromote && (
                  <button
                    type="button"
                    onClick={() => onPromote(o)}
                    style={{ marginTop: 4, padding: '2px 7px', border: `1px solid ${E.gold}`, background: 'transparent', color: E.goldDeep, cursor: 'pointer', fontFamily: C.mono, fontSize: 8.5, fontWeight: 700, whiteSpace: 'nowrap' }}
                  >
                    Build brief →
                  </button>
                )}
              </td>
              <td style={{ padding: '7px 8px', fontFamily: C.mono, fontSize: 10 }}>{o.action || '—'}</td>
              <td style={{ padding: '7px 8px' }}>{o.score ?? '—'}</td>
              <td style={{ padding: '7px 8px' }}>{o.confidence ?? '—'}</td>
              <td style={{ padding: '7px 8px' }}>{o.impressions ?? '—'}</td>
              <td style={{ padding: '7px 8px' }}>{o.position ?? '—'}</td>
              <td style={{ padding: '7px 8px' }}>{o.ctr != null ? (o.ctr > 1 ? o.ctr : o.ctr * 100).toFixed(1) + '%' : '—'}</td>
              <td style={{ padding: '7px 8px' }}>{o.signals?.topicalGap != null ? `${Math.max(0, 100 - o.signals.topicalGap)}` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!opps.length && <div style={{ padding: 12, color: C.muted, fontSize: 12 }}>No scored opportunities yet — click Sync GSC (90d) first.</div>}
    </div>
  )

  return (
    <div
      data-testid={evidence ? 'studio-discover-evidence' : 'seo-intelligence-dashboard'}
      style={{ background: C.paper, border: evidence ? 'none' : `1px solid ${E.hairline}`, boxShadow: evidence ? 'none' : E.paperShadow, marginBottom: evidence ? 0 : 14, position: 'relative' }}
    >
      {!evidence && (
        <>
          <div
            aria-hidden="true"
            style={{ position: 'absolute', top: 0, left: 18, right: 18, height: 2, borderRadius: 999, background: E.goldRule, opacity: 0.85 }}
          />
          <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.line}`, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ ...E.kicker, fontSize: 9 }}>SEO INTELLIGENCE · $0 FIRST-PARTY</div>
              <div style={{ fontFamily: C.serif, fontSize: 20, color: C.ink, marginTop: 4 }}>Opportunities, topics, links, GSC</div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button type="button" onClick={() => void syncGsc()} disabled={busy} style={{ padding: '6px 12px', fontSize: 11, fontWeight: 700, border: `1px solid ${C.line}`, background: C.paper, color: C.ink, cursor: busy ? 'wait' : 'pointer', fontFamily: C.mono, borderRadius: E.radiusXs }}>
                {busy ? 'Syncing…' : 'Sync GSC (90d)'}
              </button>
              <button type="button" onClick={() => void load()} disabled={busy} style={{ padding: '6px 12px', fontSize: 11, fontWeight: 700, border: `1px solid ${E.inkBlack}`, background: E.inkBlack, color: E.ivory, cursor: busy ? 'wait' : 'pointer', fontFamily: C.mono, borderRadius: E.radiusXs }}>
                {busy ? 'Loading…' : 'Refresh intel'}
              </button>
            </div>
          </div>
        </>
      )}
      <div style={{ padding: '6px 16px', borderBottom: `1px solid ${C.line}`, fontSize: 11, color: C.ink, fontFamily: C.mono, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <span>
          seo_gsc_rows: {formatMetricCount(gscStats.windowRowCount)} persisted (window)
          {gsc?.range ? ` · window ${gsc.range.startDate} → ${gsc.range.endDate}` : ''}
          {(gsc?.rows || []).length
            ? ` · showing top ${(gsc?.rows || []).length} diagnostic row${(gsc?.rows || []).length === 1 ? '' : 's'}`
            : ''}
          {evidence ? ` · ${promoted} act-on rows merged into the work plan` : ''}
        </span>
        {gscStats.diagnosticRowCount === 0 && gscStats.statRowCount === 0 && (
          <span style={{ color: C.muted }}>· empty — click Sync GSC (90d) to pull Search Analytics into from-intel / score</span>
        )}
      </div>
      {gsc?.visibility && <SeoIntelVisibilityStrip visibility={gsc.visibility} />}
      {syncResult && (
        <div style={{ padding: '6px 16px', borderBottom: `1px solid ${C.line}`, fontSize: 11, color: syncResult.rows > 0 ? C.ink : C.muted, fontFamily: C.mono }}>
          Last sync: {syncResult.rows.toLocaleString()} rows upserted · {syncResult.range?.startDate} → {syncResult.range?.endDate} · source {syncResult.source || '—'}
          {syncResult.rows === 0 && ' · Google returned no rows — check GSC credentials / property traffic.'}
          {syncResult.warnings?.length ? ` · ${syncResult.warnings.join('; ')}` : ''}
        </div>
      )}
      <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${C.line}`, flexWrap: 'wrap' }}>
        {([
          ['overview', 'Overview'],
          ['opportunities', 'Opportunities'],
          ['topics', 'Topic Map'],
          ['content', 'Existing Content'],
          ['links', 'Internal Links'],
          ['keywords', 'Keyword Explorer'],
          ['gsc', 'GSC Performance'],
        ] as Array<[SeoIntelNav, string]>).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setNav(k)} style={{ padding: '8px 12px', border: 'none', borderBottom: nav === k ? `2px solid ${C.gold}` : '2px solid transparent', background: 'transparent', fontSize: 11, fontWeight: 700, color: nav === k ? C.ink : C.muted, cursor: 'pointer', fontFamily: C.mono, letterSpacing: '0.04em', transition: 'color 0.15s ease' }}>{label}</button>
        ))}
      </div>
      {error && <div style={{ padding: '8px 14px', color: E.red, fontSize: 12, fontFamily: C.mono, background: E.redSoft, borderBottom: `1px solid ${C.line}` }}>{error}</div>}
      <div style={{ padding: 14 }}>
        {nav === 'overview' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
            {card('High-priority opportunities', String(high.length), 'score ≥ 60')}
            {card('Articles to refresh', String(refresh.length), 'REFRESH action')}
            {card('Cannibalization candidates', String(cannibals.length), 'recommend only')}
            {card('Internal-link opportunities', String(topics?.query?.linkCandidates?.length || 0), 'shared entities')}
            {card('Uncovered topic clusters', String(topics?.query?.thinClusters?.length || 0), '≤1 page')}
            {card(
              'GSC clicks / impressions',
              `${formatMetricCount(gscStats.clicks)} / ${formatMetricCount(gscStats.impressions)}`,
              gscStats.source === 'visibility'
                ? `${formatMetricCount(gscStats.windowRowCount)} rows persisted in the window · ${gscStats.diagnosticRowCount.toLocaleString()} diagnostic row${gscStats.diagnosticRowCount === 1 ? '' : 's'} shown`
                : (gsc?.range ? `${gsc.range.startDate} → ${gsc.range.endDate} · diagnostic rows only (no window measurement)` : 'sync GSC'),
            )}
          </div>
        )}
        {nav === 'opportunities' && table}
        {nav === 'topics' && (
          <div style={{ fontSize: 13, color: C.ink }}>
            <div style={{ marginBottom: 8, color: C.muted }}>{topics?.pages ?? 0} pages analyzed</div>
            {(topics?.query?.strongTopics || []).slice(0, 12).map((t) => (
              <div key={t.label} style={{ padding: '4px 0' }}>{t.label} · {t.pages} pages</div>
            ))}
            {!(topics?.query?.strongTopics || []).length && <div style={{ color: C.muted }}>No topic graph yet.</div>}
          </div>
        )}
        {nav === 'content' && (
          <div style={{ fontSize: 12, color: C.muted }}>
            Existing URLs appear as GSC landing pages and topic-graph page nodes. Thin clusters: {(topics?.query?.thinClusters || []).map((t) => t.label).join(', ') || 'none flagged'}.
          </div>
        )}
        {nav === 'links' && (
          <div>
            {(topics?.query?.linkCandidates || []).slice(0, 20).map((l, i) => (
              <div key={i} style={{ fontSize: 12, padding: '4px 0', borderBottom: `1px solid ${C.line}` }}>{l.from} → {l.to} via {l.via}</div>
            ))}
            {!(topics?.query?.linkCandidates || []).length && <div style={{ color: C.muted, fontSize: 12 }}>No link candidates — analyze topics after jobs have canonical URLs.</div>}
          </div>
        )}
        {nav === 'keywords' && (
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <input value={seed} onChange={(e) => setSeed(e.target.value)} style={{ flex: 1, padding: '6px 8px', fontSize: 13, border: `1px solid ${C.line}`, borderRadius: E.radiusXs, background: E.ivory, color: C.ink, fontFamily: 'inherit' }} />
              <button type="button" onClick={() => void explore()} style={{ padding: '6px 12px', fontSize: 11, fontWeight: 700, background: E.inkBlack, color: '#fff', border: 'none', borderRadius: E.radiusXs, cursor: 'pointer', fontFamily: C.mono }}>Explore</button>
            </div>
            {keywords.map((k) => (
              <div key={k.keyword} style={{ fontSize: 12, padding: '3px 0' }}>{k.keyword} <span style={{ color: C.muted }}>({k.sources?.join(', ') || k.source})</span></div>
            ))}
            {!keywords.length && <div style={{ color: C.muted, fontSize: 12 }}>No candidates yet — enter a seed and click Explore.</div>}
            {clusters.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 9, fontFamily: C.mono, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.muted, marginBottom: 8 }}>Jaccard clusters ({clusters.length})</div>
                {clusters.map((cl) => (
                  <div key={cl.id} style={{ border: `1px solid ${C.line}`, padding: '8px 10px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.ink }}>{cl.label} <span style={{ color: C.muted, fontWeight: 400 }}>· {cl.size}</span></div>
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{cl.keywords.map((k) => k.keyword).join(' · ')}</div>
                    </div>
                    {onPromoteCluster && (
                      <button
                        type="button"
                        onClick={() => onPromoteCluster(cl)}
                        style={{ padding: '4px 8px', border: `1px solid ${E.inkBlack}`, background: E.inkBlack, color: E.ivory, cursor: 'pointer', fontFamily: C.mono, fontSize: 8.5, fontWeight: 700, whiteSpace: 'nowrap' }}
                      >
                        Queue cluster
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {nav === 'gsc' && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  {['Query', 'Page', 'Clicks', 'Impressions', 'CTR', 'Position'].map((h) => (
                    <th key={h} style={{ textAlign: 'left', padding: '6px 8px', borderBottom: `1px solid ${C.line}`, fontSize: 9, fontFamily: C.mono, color: C.muted }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(gsc?.rows || []).filter((r) => !isJunkQuery(String(r.query || ''))).map((r, i) => (
                  <tr key={i}>
                    <td style={{ padding: '6px 8px' }}>{String(r.query || '')}</td>
                    <td style={{ padding: '6px 8px', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>{String(r.page || '')}</td>
                    <td style={{ padding: '6px 8px' }}>{String(r.clicks ?? '')}</td>
                    <td style={{ padding: '6px 8px' }}>{String(r.impressions ?? '')}</td>
                    <td style={{ padding: '6px 8px' }}>{String(r.ctr ?? '')}</td>
                    <td style={{ padding: '6px 8px' }}>{String(r.position ?? '')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!(gsc?.rows || []).length && <div style={{ color: C.muted, fontSize: 12, padding: 8 }}>No persisted GSC rows for this window (rows persisted={formatMetricCount(gscStats.windowRowCount)}) — click Sync GSC (90d) in the header.</div>}
          </div>
        )}
        {nav === 'opportunities' && cannibals.length > 0 && (
          <div style={{ marginTop: 16, fontSize: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Cannibalization (recommend only)</div>
            {cannibals.slice(0, 8).map((c, i) => (
              <div key={i} style={{ padding: '4px 0', borderBottom: `1px solid ${C.line}` }}>{c.recommendedAction}: {c.pageA} ↔ {c.pageB} ({c.overlapScore})</div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
})

export default SeoIntelligenceDashboard
