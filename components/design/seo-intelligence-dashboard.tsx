'use client'
/**
 * $0 SEO Intelligence dashboard — lives inside Content Studio Discover.
 * No Volume / KD / CPC columns. No paid SEO APIs required.
 */

import * as React from 'react'

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
  ink: '#1A1A1A',
  muted: '#5C5C5C',
  gold: '#B8952C',
  line: 'rgba(0,0,0,0.08)',
  paper: '#FFFEFC',
  mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  serif: 'Georgia, "Times New Roman", serif',
}

type OppRow = {
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

export default function SeoIntelligenceDashboard() {
  const [nav, setNav] = React.useState<SeoIntelNav>('overview')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [opps, setOpps] = React.useState<OppRow[]>([])
  const [gsc, setGsc] = React.useState<{ rows?: Array<Record<string, unknown>>; range?: { startDate: string; endDate: string } } | null>(null)
  const [cannibals, setCannibals] = React.useState<Array<{ pageA: string; pageB: string; overlapScore: number; recommendedAction: string; reasons: string[] }>>([])
  const [topics, setTopics] = React.useState<{ query?: { strongTopics?: Array<{ label: string; pages: number }>; thinClusters?: Array<{ label: string; pages: number }>; linkCandidates?: Array<{ from: string; to: string; via: string }> }; pages?: number } | null>(null)
  const [seed, setSeed] = React.useState('canada study permit')
  const [keywords, setKeywords] = React.useState<Array<{ keyword: string; source: string; sources: string[] }>>([])

  const load = React.useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const [o, p, c, t] = await Promise.all([
        fetch('/api/content-studio/opportunities/score?days=90&limit=40', { credentials: 'same-origin' }).then((r) => r.json()),
        fetch('/api/content-studio/gsc/performance?days=90&limit=40', { credentials: 'same-origin' }).then((r) => r.json()),
        fetch('/api/content-studio/cannibalization/detect?days=90', { credentials: 'same-origin' }).then((r) => r.json()),
        fetch('/api/content-studio/topics/analyze', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then((r) => r.json()),
      ])
      if (o?.error) setError(String(o.error))
      setOpps(Array.isArray(o?.opportunities) ? o.opportunities : [])
      setGsc(p?.ok ? p : null)
      setCannibals(Array.isArray(c?.candidates) ? c.candidates : [])
      setTopics(t?.ok ? t : null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'SEO intelligence failed to load')
    } finally {
      setBusy(false)
    }
  }, [])

  React.useEffect(() => { void load() }, [load])

  const explore = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/content-studio/keywords/discover', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seed }),
      })
      const data = await res.json()
      setKeywords(Array.isArray(data.candidates) ? data.candidates : [])
    } finally {
      setBusy(false)
    }
  }

  const refresh = opps.filter((o) => o.action === 'REFRESH')
  const high = opps.filter((o) => (o.score || 0) >= 60)
  const gscTotals = (gsc?.rows || []).reduce(
    (a: { clicks: number; impressions: number }, r) => ({
      clicks: a.clicks + Number(r.clicks || 0),
      impressions: a.impressions + Number(r.impressions || 0),
    }),
    { clicks: 0, impressions: 0 },
  )

  const card = (label: string, value: string, sub: string) => (
    <div style={{ padding: '12px 14px', background: C.paper, border: `1px solid ${C.line}` }}>
      <div style={{ fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.muted, fontFamily: C.mono }}>{label}</div>
      <div style={{ fontFamily: C.serif, fontSize: 22, color: C.ink, marginTop: 4 }}>{value}</div>
      <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{sub}</div>
    </div>
  )

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
              <td style={{ padding: '7px 8px', maxWidth: 240 }}>{o.query}</td>
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
      {!opps.length && <div style={{ padding: 12, color: C.muted, fontSize: 12 }}>No scored opportunities yet — sync GSC (90-day) first.</div>}
    </div>
  )

  return (
    <div style={{ background: C.paper, border: `1px solid ${C.line}`, marginBottom: 14 }}>
      <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.line}`, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 9, fontFamily: C.mono, letterSpacing: '0.14em', color: C.gold, fontWeight: 800 }}>SEO INTELLIGENCE · $0 FIRST-PARTY</div>
          <div style={{ fontFamily: C.serif, fontSize: 20, color: C.ink, marginTop: 4 }}>Opportunities, topics, links, GSC</div>
        </div>
        <button type="button" onClick={() => void load()} disabled={busy} style={{ padding: '6px 12px', fontSize: 11, fontWeight: 700, border: `1px solid ${C.line}`, background: C.ink, color: '#fff', cursor: busy ? 'wait' : 'pointer' }}>
          {busy ? 'Loading…' : 'Refresh intel'}
        </button>
      </div>
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
          <button key={k} type="button" onClick={() => setNav(k)} style={{ padding: '8px 12px', border: 'none', borderBottom: nav === k ? `2px solid ${C.gold}` : '2px solid transparent', background: 'transparent', fontSize: 11, fontWeight: 700, color: nav === k ? C.ink : C.muted, cursor: 'pointer' }}>{label}</button>
        ))}
      </div>
      {error && <div style={{ padding: '8px 14px', color: '#B91C1C', fontSize: 12 }}>{error}</div>}
      <div style={{ padding: 14 }}>
        {nav === 'overview' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
            {card('High-priority opportunities', String(high.length), 'score ≥ 60')}
            {card('Articles to refresh', String(refresh.length), 'REFRESH action')}
            {card('Cannibalization candidates', String(cannibals.length), 'recommend only')}
            {card('Internal-link opportunities', String(topics?.query?.linkCandidates?.length || 0), 'shared entities')}
            {card('Uncovered topic clusters', String(topics?.query?.thinClusters?.length || 0), '≤1 page')}
            {card('GSC clicks / impressions', `${gscTotals.clicks.toLocaleString()} / ${gscTotals.impressions.toLocaleString()}`, gsc?.range ? `${gsc.range.startDate} → ${gsc.range.endDate}` : 'sync GSC')}
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
              <input value={seed} onChange={(e) => setSeed(e.target.value)} style={{ flex: 1, padding: '6px 8px', fontSize: 13, border: `1px solid ${C.line}` }} />
              <button type="button" onClick={() => void explore()} style={{ padding: '6px 12px', fontSize: 11, fontWeight: 700, background: C.ink, color: '#fff', border: 'none', cursor: 'pointer' }}>Explore</button>
            </div>
            {keywords.map((k) => (
              <div key={k.keyword} style={{ fontSize: 12, padding: '3px 0' }}>{k.keyword} <span style={{ color: C.muted }}>({k.sources?.join(', ') || k.source})</span></div>
            ))}
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
                {(gsc?.rows || []).map((r, i) => (
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
            {!(gsc?.rows || []).length && <div style={{ color: C.muted, fontSize: 12, padding: 8 }}>No persisted GSC rows — run POST /api/content-studio/gsc/sync.</div>}
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
}
