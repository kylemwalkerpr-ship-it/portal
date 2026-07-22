'use client'
import React from 'react'

const C = {
  bg: '#F7F8FA', surface: '#FFFFFF', border: 'rgba(0,0,0,0.08)',
  cyan: '#3C3B6E', gold: '#9A7B3B', text: '#1F2937', textMuted: '#6B7280',
  textDim: '#9CA3AF', green: '#166534', red: '#DC2626', orange: '#D97706',
  blue: '#2563EB', surface2: '#F4F2EE',
}

type ShipMode = 'none' | 'pr' | 'autodeploy' | 'auto'
type Tab = 'autopilot' | 'factory' | 'opportunities' | 'queue' | 'metrics' | 'health' | 'strategies'

export default function AdminSeoFactory({
  setActionNotice,
}: {
  setActionNotice: (msg: string) => void
}) {
  const [tab, setTab] = React.useState<Tab>('autopilot')
  const [topic, setTopic] = React.useState('')
  const [primaryKeyword, setPrimaryKeyword] = React.useState('')
  const [region, setRegion] = React.useState('US')
  const [contentType, setContentType] = React.useState('legal_guide')
  const [shipMode, setShipMode] = React.useState<ShipMode>('auto')
  const [indexable, setIndexable] = React.useState(true)
  const [busy, setBusy] = React.useState(false)
  const [plan, setPlan] = React.useState<any>(null)
  const [result, setResult] = React.useState<any>(null)
  const [opps, setOpps] = React.useState<any>(null)
  const [metrics, setMetrics] = React.useState<any>(null)
  const [health, setHealth] = React.useState<any>(null)
  const [jobs, setJobs] = React.useState<any[]>([])
  const [jobQ, setJobQ] = React.useState('')
  const [selectedOpp, setSelectedOpp] = React.useState<Set<string>>(new Set())
  const [autoLimit, setAutoLimit] = React.useState(3)
  const [autoMode, setAutoMode] = React.useState<'auto' | 'pr' | 'autodeploy' | 'none'>('auto')
  const [autoResult, setAutoResult] = React.useState<any>(null)
  const [dryRun, setDryRun] = React.useState(false)
  const [minAudit, setMinAudit] = React.useState(55)
  const [maxRefine, setMaxRefine] = React.useState(2)
  const [skipRecent, setSkipRecent] = React.useState(true)
  const [regionFilter, setRegionFilter] = React.useState('')
  const [preview, setPreview] = React.useState<string | null>(null)
  const [strategies, setStrategies] = React.useState<any>(null)
  const [strategyDoc, setStrategyDoc] = React.useState<{ title: string; content: string } | null>(null)

  const loadHealth = async () => {
    try {
      const res = await fetch('/api/seo-factory/health', { credentials: 'same-origin' })
      const data = await res.json()
      if (res.ok) setHealth(data)
    } catch { /* ignore */ }
  }

  const loadJobs = async () => {
    try {
      const qs = jobQ ? `?q=${encodeURIComponent(jobQ)}&limit=40` : '?limit=40'
      const res = await fetch(`/api/content-studio/jobs${qs}`, { credentials: 'same-origin' })
      const data = await res.json()
      if (res.ok) setJobs(data.jobs || [])
    } catch { /* ignore */ }
  }

  const loadOpps = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/seo-factory/opportunities', { credentials: 'same-origin' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setOpps(data)
    } catch (e) {
      setActionNotice(e instanceof Error ? e.message : 'Opportunities failed')
    } finally {
      setBusy(false)
    }
  }

  const loadMetrics = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/seo-factory/metrics', { credentials: 'same-origin' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setMetrics(data)
    } catch (e) {
      setActionNotice(e instanceof Error ? e.message : 'Metrics failed')
    } finally {
      setBusy(false)
    }
  }

  React.useEffect(() => {
    loadHealth()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  React.useEffect(() => {
    if (tab === 'opportunities' && !opps) loadOpps()
    if (tab === 'metrics' && !metrics) loadMetrics()
    if (tab === 'queue') loadJobs()
    if (tab === 'health') loadHealth()
    if (tab === 'strategies' && !strategies) {
      fetch('/api/seo-factory/strategies?pack=index', { credentials: 'same-origin' })
        .then((r) => r.json())
        .then((d) => { if (d.ok) setStrategies(d.index) })
        .catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  const runPlan = async () => {
    setBusy(true)
    setResult(null)
    try {
      const res = await fetch('/api/seo-factory/plan', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: topic || primaryKeyword,
          primaryKeyword: primaryKeyword || topic,
          region,
          contentType,
          indexable,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Plan failed')
      setPlan(data)
      setActionNotice(`Plan ready → ${data.plan.host} / ${data.plan.repo}`)
    } catch (e) {
      setActionNotice(e instanceof Error ? e.message : 'Plan failed')
    } finally {
      setBusy(false)
    }
  }

  const runGenerate = async (override?: {
    topic?: string
    keyword?: string
    region?: string
    contentType?: string
    shipMode?: ShipMode
  }) => {
    setBusy(true)
    try {
      const t = override?.topic || topic || primaryKeyword
      const k = override?.keyword || primaryKeyword || topic
      const sm = override?.shipMode || shipMode
      const res = await fetch('/api/seo-factory/generate', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: t,
          primaryKeyword: k,
          region: override?.region || region,
          contentType: override?.contentType || contentType,
          shipMode: sm === 'auto' ? 'auto' : sm,
          indexable,
          title: t,
          minAuditScore: minAudit,
          maxRefine,
          dryRun,
        }),
      })
      const data = await res.json()
      if (!res.ok && !data.content) throw new Error(data.error || 'Generate failed')
      setResult(data)
      setPlan({ plan: data.plan, gsc: data.gsc, shipRecommendation: null })
      if (data.content) setPreview(data.content)
      setActionNotice(
        data.ship
          ? `Shipped via ${data.provider} (audit ${data.audit?.score}, ${data.attempts || 1} attempt/s): ${data.ship.status}`
          : data.shipError
            ? `Generated (audit ${data.audit?.score}) but ship failed: ${data.shipError}`
            : `Generated via ${data.provider} (audit ${data.audit?.score}, ${data.attempts || 1} attempt/s)`,
      )
      loadJobs()
    } catch (e) {
      setActionNotice(e instanceof Error ? e.message : 'Generate failed')
    } finally {
      setBusy(false)
    }
  }

  const runAutoPilot = async (terms?: string[]) => {
    setBusy(true)
    setAutoResult(null)
    try {
      const res = await fetch('/api/seo-factory/auto-run', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          limit: terms?.length || autoLimit,
          shipMode: autoMode,
          dryRun,
          minAuditScore: minAudit,
          maxRefine,
          skipRecent,
          regionFilter: regionFilter || undefined,
          terms: terms?.length ? terms : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Auto-run failed')
      setAutoResult(data)
      setActionNotice(data.message || `Auto-run: ${data.shipped}/${data.candidateCount}`)
      setMetrics(null)
      loadJobs()
    } catch (e) {
      setActionNotice(e instanceof Error ? e.message : 'Auto-run failed')
    } finally {
      setBusy(false)
    }
  }

  const jobAction = async (id: string, action: 'reship' | 'regenerate' | 'abandon') => {
    setBusy(true)
    try {
      const res = await fetch('/api/content-studio/jobs', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          action,
          shipMode: autoMode === 'none' ? 'pr' : autoMode,
          minAuditScore: minAudit,
          maxRefine,
          dryRun: action === 'reship' ? dryRun : false,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Action failed')
      setActionNotice(
        action === 'abandon'
          ? 'Job closed'
          : action === 'reship'
            ? `Reship: ${data.ship?.status || 'ok'}`
            : `Regenerated → ${data.result?.jobId || 'new job'}`,
      )
      loadJobs()
    } catch (e) {
      setActionNotice(e instanceof Error ? e.message : 'Job action failed')
    } finally {
      setBusy(false)
    }
  }

  const toggleOpp = (term: string) => {
    setSelectedOpp((prev) => {
      const n = new Set(prev)
      if (n.has(term)) n.delete(term)
      else n.add(term)
      return n
    })
  }

  const healthReady = health?.ready
  const tabs: [Tab, string][] = [
    ['autopilot', 'Auto-Pilot'],
    ['factory', 'Manual'],
    ['opportunities', 'Opportunities'],
    ['queue', 'Job queue'],
    ['strategies', 'Strategies'],
    ['metrics', 'Metrics'],
    ['health', 'System'],
  ]

  const openStrategyDoc = async (path: string, title: string) => {
    try {
      const res = await fetch(
        `/api/seo-factory/strategies?pack=doc&path=${encodeURIComponent(path)}`,
        { credentials: 'same-origin' },
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load doc')
      setStrategyDoc({ title, content: data.content || '' })
    } catch (e) {
      setActionNotice(e instanceof Error ? e.message : 'Failed to load strategy doc')
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 1140 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: '0 0 8px', fontSize: 28, color: C.cyan, fontWeight: 700 }}>SEO Factory</h1>
          <p style={{ margin: '0 0 12px', color: C.textMuted, fontSize: 14, maxWidth: 640 }}>
            Cloudflare Workers AI · GSC demand · quality refine loop · ownership audit · PR / autodeploy.
            Advanced pipeline with dedupe, reship, and system health.
          </p>
        </div>
        {health && (
          <div style={{
            padding: '10px 14px', borderRadius: 10, border: `1px solid ${C.border}`,
            background: healthReady ? '#ECFDF5' : '#FEF3C7', fontSize: 12, minWidth: 160,
          }}>
            <div style={{ fontWeight: 700, color: healthReady ? C.green : C.orange }}>
              {healthReady ? 'System ready' : 'Setup incomplete'}
            </div>
            <div style={{ color: C.textMuted, marginTop: 4 }}>
              {(health.checks || []).filter((c: any) => !c.ok).length} issues · click System
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: `1px solid ${C.border}`, flexWrap: 'wrap' }}>
        {tabs.map(([t, label]) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            style={{
              background: 'none', border: 'none', padding: '10px 12px', cursor: 'pointer',
              borderBottom: tab === t ? `2px solid ${C.gold}` : '2px solid transparent',
              fontWeight: tab === t ? 600 : 400, color: tab === t ? C.text : C.textDim, fontSize: 13,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Auto-Pilot ── */}
      {tab === 'autopilot' && (
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{
            background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12,
            padding: 24, borderTop: `4px solid ${C.gold}`,
          }}>
            <div style={{ fontSize: 11, color: C.gold, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Cloudflare AI · Quality refine · Dedupe
            </div>
            <h2 style={{ margin: '8px 0', fontSize: 20, color: C.cyan }}>Publish from GSC demand</h2>
            <p style={{ margin: '0 0 18px', fontSize: 13, color: C.textMuted, lineHeight: 1.55, maxWidth: 680 }}>
              Pulls ranked Search Console opportunities, drafts with Workers AI, auto-refines until audit threshold,
              skips keywords already covered recently, then opens a PR — or commits to main when gates pass.
            </p>

            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', marginBottom: 14 }}>
              <label style={labelStyle}>
                Articles
                <select value={autoLimit} onChange={(e) => setAutoLimit(Number(e.target.value))} style={inputStyle}>
                  {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <label style={labelStyle}>
                Ship mode
                <select value={autoMode} onChange={(e) => setAutoMode(e.target.value as any)} style={inputStyle}>
                  <option value="auto">Auto (PR or main if audit OK)</option>
                  <option value="pr">Always PR</option>
                  <option value="autodeploy">Prefer autodeploy</option>
                  <option value="none">Generate only</option>
                </select>
              </label>
              <label style={labelStyle}>
                Min audit score
                <select value={minAudit} onChange={(e) => setMinAudit(Number(e.target.value))} style={inputStyle}>
                  {[45, 55, 65, 70, 80].map((n) => <option key={n} value={n}>{n}+</option>)}
                </select>
              </label>
              <label style={labelStyle}>
                Refine passes
                <select value={maxRefine} onChange={(e) => setMaxRefine(Number(e.target.value))} style={inputStyle}>
                  {[0, 1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <label style={labelStyle}>
                Region filter
                <select value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)} style={inputStyle}>
                  <option value="">All regions</option>
                  {['US', 'UK', 'CA', 'AU'].map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>
            </div>

            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16, fontSize: 13, color: C.textMuted }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
                Dry run (no GitHub write)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={skipRecent} onChange={(e) => setSkipRecent(e.target.checked)} />
                Skip recently covered keywords
              </label>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" disabled={busy} onClick={() => runAutoPilot()} style={{ ...btnPrimary, opacity: busy ? 0.7 : 1, fontSize: 14, padding: '12px 18px' }}>
                {busy ? 'Running pipeline…' : dryRun ? `Dry-run top ${autoLimit}` : `Generate & ship top ${autoLimit}`}
              </button>
              <button type="button" disabled={busy || selectedOpp.size === 0} onClick={() => runAutoPilot([...selectedOpp])} style={btnSecondary}>
                Run selected ({selectedOpp.size})
              </button>
              <button type="button" disabled={busy} onClick={() => { setTab('opportunities'); if (!opps) loadOpps() }} style={btnSecondary}>
                Pick opportunities
              </button>
            </div>
          </div>

          {autoResult && (
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
              <h3 style={{ margin: '0 0 8px', color: C.cyan }}>
                Run result · GSC {autoResult.source} · {autoResult.shipped}/{autoResult.candidateCount} shipped
                {autoResult.avgAuditScore != null ? ` · avg audit ${autoResult.avgAuditScore}` : ''}
              </h3>
              <p style={{ margin: '0 0 12px', fontSize: 13, color: C.textMuted }}>{autoResult.message}</p>
              <div style={{ display: 'grid', gap: 10 }}>
                {(autoResult.results || []).map((r: any, i: number) => (
                  <div key={r.term + i} style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, fontSize: 13 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                      <strong>{r.term}</strong>
                      <span style={{ color: r.ok ? C.green : C.red }}>
                        {r.ok ? 'ok' : 'failed'}
                        {r.provider ? ` · ${r.provider}` : ''}
                        {r.audit?.score != null ? ` · audit ${r.audit.score}` : ''}
                        {r.attempts ? ` · ${r.attempts} attempt/s` : ''}
                      </span>
                    </div>
                    {r.plan && (
                      <div style={{ color: C.textMuted, marginTop: 4, fontSize: 12 }}>
                        {r.plan.host} → {r.plan.repo} · {r.shipMode}
                        {r.audit?.wordCount != null ? ` · ${r.audit.wordCount} words` : ''}
                        {r.ship?.prUrl && <> · <a href={r.ship.prUrl} target="_blank" rel="noreferrer">PR</a></>}
                        {r.ship?.commitSha && <> · sha {String(r.ship.commitSha).slice(0, 8)}</>}
                      </div>
                    )}
                    {(r.error || r.shipError) && (
                      <div style={{ color: C.red, marginTop: 4, fontSize: 12 }}>{r.error || r.shipError}</div>
                    )}
                    {r.contentPreview && (
                      <button type="button" style={{ ...btnSmall, marginTop: 8 }} onClick={() => setPreview(r.contentPreview)}>
                        Preview
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Manual ── */}
      {tab === 'factory' && (
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
              <label style={{ ...labelStyle, gridColumn: '1 / -1' }}>
                Topic
                <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="UK dependent visa guide…" style={inputStyle} />
              </label>
              <label style={labelStyle}>
                Primary keyword
                <input value={primaryKeyword} onChange={(e) => setPrimaryKeyword(e.target.value)} style={inputStyle} />
              </label>
              <label style={labelStyle}>
                Region
                <select value={region} onChange={(e) => setRegion(e.target.value)} style={inputStyle}>
                  {['US', 'UK', 'CA', 'AU', 'COMPARE'].map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>
              <label style={labelStyle}>
                Content type
                <select value={contentType} onChange={(e) => setContentType(e.target.value)} style={inputStyle}>
                  <option value="legal_guide">Legal guide</option>
                  <option value="blog_summary">Blog summary</option>
                  <option value="regional_page">Regional page</option>
                  <option value="marketplace_gig">Marketplace gig</option>
                </select>
              </label>
              <label style={labelStyle}>
                Ship mode
                <select value={shipMode} onChange={(e) => setShipMode(e.target.value as ShipMode)} style={inputStyle}>
                  <option value="auto">Auto</option>
                  <option value="pr">PR</option>
                  <option value="autodeploy">Autodeploy</option>
                  <option value="none">Generate only</option>
                </select>
              </label>
              <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 8, marginTop: 22 }}>
                <input type="checkbox" checked={indexable} onChange={(e) => setIndexable(e.target.checked)} />
                Indexable
              </label>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
              <button type="button" disabled={busy} onClick={runPlan} style={btnSecondary}>1. Plan</button>
              <button type="button" disabled={busy || (!topic && !primaryKeyword)} onClick={() => runGenerate()} style={btnPrimary}>
                2. Generate & ship (with refine)
              </button>
            </div>
          </div>

          {plan?.plan && (
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, fontSize: 13 }}>
              <h3 style={{ margin: '0 0 10px', color: C.cyan }}>Ownership plan</h3>
              <div><strong>Host:</strong> {plan.plan.host} → <strong>Repo:</strong> {plan.plan.repo}</div>
              <div><strong>Path:</strong> <code>{plan.plan.filePath}</code></div>
              <div><strong>Canonical:</strong> {plan.plan.canonicalUrl}</div>
              {(plan.plan.blockers || []).map((b: string) => (
                <div key={b} style={{ color: C.red, marginTop: 4 }}>⛔ {b}</div>
              ))}
            </div>
          )}

          {result && (
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
              <h3 style={{ margin: '0 0 10px', color: C.cyan }}>
                Result · Audit {result.audit?.score} ({result.audit?.grade}) · {result.provider}
                {result.attempts ? ` · ${result.attempts} attempt/s` : ''}
              </h3>
              {result.ship && (
                <div style={{ fontSize: 13, marginBottom: 8 }}>
                  Ship: <strong>{result.ship.status}</strong>
                  {result.ship.prUrl && <> — <a href={result.ship.prUrl} target="_blank" rel="noreferrer">{result.ship.prUrl}</a></>}
                </div>
              )}
              {result.shipError && <div style={{ color: C.red, fontSize: 12 }}>{result.shipError}</div>}
              <button type="button" style={btnSmall} onClick={() => setPreview(result.content)}>Full preview</button>
              <pre style={preStyle}>{(result.content || '').slice(0, 3500)}{(result.content || '').length > 3500 ? '\n…' : ''}</pre>
            </div>
          )}
        </div>
      )}

      {/* ── Opportunities ── */}
      {tab === 'opportunities' && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontSize: 13, color: C.textMuted }}>
              Source: {opps?.source || '—'} · {opps?.count ?? 0} opportunities · selected {selectedOpp.size}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={loadOpps} disabled={busy} style={btnSecondary}>Refresh</button>
              <button
                type="button"
                disabled={busy || selectedOpp.size === 0}
                onClick={() => runAutoPilot([...selectedOpp])}
                style={btnPrimary}
              >
                Ship selected
              </button>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: C.textDim }}>
                  <th style={th}></th>
                  <th style={th}>Query</th>
                  <th style={th}>Imp</th>
                  <th style={th}>Pos</th>
                  <th style={th}>CTR</th>
                  <th style={th}>Action</th>
                  <th style={th}>Owner</th>
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {(opps?.opportunities || []).slice(0, 50).map((o: any) => (
                  <tr key={o.term} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td style={td}>
                      <input
                        type="checkbox"
                        checked={selectedOpp.has(o.term)}
                        disabled={o.action === 'ignore'}
                        onChange={() => toggleOpp(o.term)}
                      />
                    </td>
                    <td style={td}>{o.term}</td>
                    <td style={td}>{o.impressions}</td>
                    <td style={td}>{Number(o.position).toFixed(1)}</td>
                    <td style={td}>{(o.ctr * 100).toFixed(2)}%</td>
                    <td style={td}>{o.action}</td>
                    <td style={td}>{o.ownerHint?.host || o.region || '—'}</td>
                    <td style={td}>
                      <button
                        type="button"
                        style={btnSmall}
                        disabled={busy || o.action === 'ignore'}
                        onClick={() => runGenerate({
                          topic: o.term, keyword: o.term, region: o.region,
                          contentType: o.suggestedContentType || 'legal_guide', shipMode: 'pr',
                        })}
                      >
                        Ship PR
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Queue ── */}
      {tab === 'queue' && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            <input
              value={jobQ}
              onChange={(e) => setJobQ(e.target.value)}
              placeholder="Search topic / keyword…"
              style={{ ...inputStyle, marginTop: 0, maxWidth: 280 }}
            />
            <button type="button" onClick={loadJobs} style={btnSecondary}>Search / refresh</button>
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            {jobs.length === 0 && <div style={{ color: C.textMuted, fontSize: 13 }}>No jobs yet.</div>}
            {jobs.map((j) => (
              <div key={j.id} style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <strong>{j.title || j.topic}</strong>
                  <span style={{ color: C.textDim }}>{j.status} · SEO {j.seo_score ?? '—'} · {j.ai_provider || '—'}</span>
                </div>
                <div style={{ color: C.textMuted, fontSize: 12, marginTop: 4 }}>
                  {j.primary_keyword || j.topic} · {j.region} · {j.target_repo}
                  {j.pr_url && <> · <a href={j.pr_url} target="_blank" rel="noreferrer">PR</a></>}
                  {j.error_message && <span style={{ color: C.red }}> · {j.error_message}</span>}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  {j.content && (
                    <button type="button" style={btnSmall} onClick={() => setPreview(j.content)}>Preview</button>
                  )}
                  {j.content && j.status !== 'merged' && (
                    <button type="button" style={btnSmall} disabled={busy} onClick={() => jobAction(j.id, 'reship')}>Reship</button>
                  )}
                  <button type="button" style={btnSmall} disabled={busy} onClick={() => jobAction(j.id, 'regenerate')}>Regenerate</button>
                  {j.status !== 'closed' && j.status !== 'merged' && (
                    <button type="button" style={btnSmall} disabled={busy} onClick={() => jobAction(j.id, 'abandon')}>Abandon</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Metrics ── */}
      {tab === 'metrics' && metrics && (
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))' }}>
          {[
            ['Jobs', metrics.factory?.jobsTotal],
            ['PRs', metrics.factory?.prCreated],
            ['Deployed/Merged', metrics.factory?.deployedOrMerged],
            ['Failed', metrics.factory?.failed],
            ['Avg SEO', metrics.factory?.avgSeoScore],
            ['Clicks 28d', metrics.visibility?.clicks28d],
            ['Impressions 28d', metrics.visibility?.impressions28d],
          ].map(([label, value]) => (
            <div key={String(label)} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 11, color: C.textDim, textTransform: 'uppercase' }}>{label}</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: C.cyan, marginTop: 6 }}>{value ?? '—'}</div>
            </div>
          ))}
          <div style={{ gridColumn: '1 / -1', fontSize: 12, color: C.textMuted }}>
            Visibility: {metrics.visibility?.source}
          </div>
        </div>
      )}

      {/* ── Strategies corpus ── */}
      {tab === 'strategies' && (
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
            <h3 style={{ margin: '0 0 8px', color: C.cyan }}>SEO strategies corpus</h3>
            <p style={{ margin: 0, fontSize: 13, color: C.textMuted, lineHeight: 1.5 }}>
              Synced from <code>Documents/GitHub/SEO strategies</code> into <code>public/seo-data</code>.
              Ownership registry, standing rules, GSC expansion, dual-graph university map, and full plan docs
              feed Auto-Pilot prompts and host→repo routing. Re-sync: <code>npm run sync:seo-strategies</code>
              (also runs on <code>prebuild</code> when the source folder is present).
            </p>
            {strategies && (
              <div style={{ display: 'flex', gap: 16, marginTop: 14, flexWrap: 'wrap', fontSize: 13 }}>
                <span><strong>{strategies.ownershipRows ?? '—'}</strong> ownership rows</span>
                <span><strong>{strategies.universityRows ?? '—'}</strong> university map rows</span>
                <span><strong>{strategies.documents?.length ?? 0}</strong> documents</span>
                <span style={{ color: C.textDim }}>synced {strategies.updatedAt || '—'}</span>
              </div>
            )}
          </div>

          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
            <h4 style={{ margin: '0 0 10px', color: C.cyan }}>Runtime packs</h4>
            <div style={{ display: 'grid', gap: 8 }}>
              {(strategies?.packs || []).map((p: any) => (
                <div key={p.id} style={{ fontSize: 13, display: 'flex', justifyContent: 'space-between', gap: 8, borderBottom: `1px solid ${C.border}`, paddingBottom: 8 }}>
                  <strong>{p.id}</strong>
                  <code style={{ fontSize: 11, color: C.textMuted }}>{p.path}</code>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
            <h4 style={{ margin: '0 0 10px', color: C.cyan }}>Strategy documents</h4>
            <div style={{ display: 'grid', gap: 8 }}>
              {(strategies?.documents || []).map((d: any) => (
                <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', fontSize: 13, flexWrap: 'wrap' }}>
                  <div>
                    <strong>{d.title}</strong>
                    <div style={{ fontSize: 11, color: C.textDim }}>
                      {Math.round((d.bytes || 0) / 1024)} KB · {d.sectionCount || 0} sections · {d.category || 'core'}
                    </div>
                  </div>
                  <button type="button" style={btnSmall} onClick={() => openStrategyDoc(d.path, d.title)}>
                    View
                  </button>
                </div>
              ))}
              {!strategies && <div style={{ color: C.textMuted, fontSize: 13 }}>Loading strategies index…</div>}
            </div>
          </div>

          {strategyDoc && (
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <strong style={{ color: C.cyan }}>{strategyDoc.title}</strong>
                <button type="button" style={btnSmall} onClick={() => setStrategyDoc(null)}>Close</button>
              </div>
              <pre style={{ ...preStyle, maxHeight: 480 }}>{strategyDoc.content.slice(0, 30000)}</pre>
            </div>
          )}
        </div>
      )}

      {/* ── Health ── */}
      {tab === 'health' && (
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, color: C.cyan }}>System health</h3>
            <button type="button" onClick={loadHealth} style={btnSecondary}>Re-check</button>
          </div>
          {(health?.checks || []).map((c: any) => (
            <div key={c.id} style={{
              background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14,
              borderLeft: `4px solid ${c.ok ? C.green : C.red}`,
            }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{c.label}</div>
              <div style={{ fontSize: 12, color: C.textMuted, marginTop: 4 }}>{c.detail}</div>
            </div>
          ))}
          {!health && <div style={{ color: C.textMuted }}>Loading health…</div>}
        </div>
      )}

      {/* Preview modal */}
      {preview && (
        <div
          role="dialog"
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 80,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }}
          onClick={() => setPreview(null)}
        >
          <div
            style={{
              background: '#fff', borderRadius: 12, maxWidth: 800, width: '100%', maxHeight: '85vh',
              overflow: 'auto', padding: 20,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <strong style={{ color: C.cyan }}>Content preview</strong>
              <button type="button" onClick={() => setPreview(null)} style={btnSmall}>Close</button>
            </div>
            <pre style={{ ...preStyle, maxHeight: 'none' }}>{preview}</pre>
          </div>
        </div>
      )}
    </div>
  )
}

const labelStyle: React.CSSProperties = { fontSize: 13, color: C.textMuted }
const inputStyle: React.CSSProperties = {
  display: 'block', width: '100%', marginTop: 6, padding: '10px 12px',
  borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 14, boxSizing: 'border-box',
}
const btnPrimary: React.CSSProperties = {
  background: C.cyan, color: '#fff', border: 'none', borderRadius: 8,
  padding: '10px 16px', fontWeight: 600, cursor: 'pointer', fontSize: 13,
}
const btnSecondary: React.CSSProperties = {
  background: C.surface, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8,
  padding: '10px 16px', fontWeight: 600, cursor: 'pointer', fontSize: 13,
}
const btnSmall: React.CSSProperties = {
  ...btnSecondary, padding: '4px 10px', fontSize: 11,
}
const th: React.CSSProperties = { padding: '8px 6px', fontWeight: 600 }
const td: React.CSSProperties = { padding: '8px 6px', verticalAlign: 'top' }
const preStyle: React.CSSProperties = {
  marginTop: 12, maxHeight: 320, overflow: 'auto', fontSize: 11,
  background: C.surface2, padding: 12, borderRadius: 8, whiteSpace: 'pre-wrap',
}
