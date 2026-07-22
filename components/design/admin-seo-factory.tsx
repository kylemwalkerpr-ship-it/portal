'use client'
import React from 'react'

const C = {
  bg: '#F7F8FA', surface: '#FFFFFF', border: 'rgba(0,0,0,0.08)',
  cyan: '#3C3B6E', gold: '#9A7B3B', text: '#1F2937', textMuted: '#6B7280',
  textDim: '#9CA3AF', green: '#166534', red: '#DC2626', orange: '#D97706',
}

type ShipMode = 'none' | 'pr' | 'autodeploy' | 'auto'

export default function AdminSeoFactory({
  setActionNotice,
}: {
  setActionNotice: (msg: string) => void
}) {
  const [tab, setTab] = React.useState<'autopilot' | 'factory' | 'opportunities' | 'metrics'>('autopilot')
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
  const [autoLimit, setAutoLimit] = React.useState(3)
  const [autoMode, setAutoMode] = React.useState<'auto' | 'pr' | 'autodeploy'>('auto')
  const [autoResult, setAutoResult] = React.useState<any>(null)
  const [dryRun, setDryRun] = React.useState(false)

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
      if (data.suggestedKeyword && !primaryKeyword) setPrimaryKeyword(data.suggestedKeyword)
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
          shipMode: sm === 'auto' ? 'pr' : sm,
          indexable,
          title: t,
        }),
      })
      const data = await res.json()
      if (!res.ok && !data.content) throw new Error(data.error || 'Generate failed')
      setResult(data)
      setPlan({ plan: data.plan, gsc: data.gsc, shipRecommendation: null })
      setActionNotice(
        data.ship
          ? `Shipped via ${data.provider}: ${data.ship.status} ${data.ship.prUrl || data.ship.commitSha || ''}`
          : `Generated via ${data.provider} (audit ${data.audit?.score}).`,
      )
    } catch (e) {
      setActionNotice(e instanceof Error ? e.message : 'Generate failed')
    } finally {
      setBusy(false)
    }
  }

  const runAutoPilot = async () => {
    setBusy(true)
    setAutoResult(null)
    try {
      const res = await fetch('/api/seo-factory/auto-run', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          limit: autoLimit,
          shipMode: autoMode,
          dryRun,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Auto-run failed')
      setAutoResult(data)
      setActionNotice(data.message || `Auto-run: ${data.shipped}/${data.candidateCount} shipped`)
      // refresh metrics after run
      setMetrics(null)
    } catch (e) {
      setActionNotice(e instanceof Error ? e.message : 'Auto-run failed')
    } finally {
      setBusy(false)
    }
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
    if (tab === 'opportunities' && !opps) loadOpps()
    if (tab === 'metrics' && !metrics) loadMetrics()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  return (
    <div style={{ padding: 24, maxWidth: 1100 }}>
      <h1 style={{ margin: '0 0 8px', fontSize: 28, color: C.cyan, fontWeight: 700 }}>SEO Factory</h1>
      <p style={{ margin: '0 0 20px', color: C.textMuted, fontSize: 14 }}>
        Cloudflare Workers AI generates articles from GSC demand → audit gates → PR or autodeploy.
        Default path: one click, almost no form filling.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: `1px solid ${C.border}`, flexWrap: 'wrap' }}>
        {([
          ['autopilot', 'Auto-Pilot'],
          ['factory', 'Manual'],
          ['opportunities', 'Opportunities'],
          ['metrics', 'Metrics'],
        ] as const).map(([t, label]) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            style={{
              background: 'none',
              border: 'none',
              padding: '10px 14px',
              cursor: 'pointer',
              borderBottom: tab === t ? `2px solid ${C.gold}` : '2px solid transparent',
              fontWeight: tab === t ? 600 : 400,
              color: tab === t ? C.text : C.textDim,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'autopilot' && (
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            padding: 24,
            borderTop: `4px solid ${C.gold}`,
          }}>
            <div style={{ fontSize: 12, color: C.gold, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
              Cloudflare AI · Low input
            </div>
            <h2 style={{ margin: '0 0 8px', fontSize: 20, color: C.cyan }}>Publish from GSC demand</h2>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: C.textMuted, lineHeight: 1.55, maxWidth: 640 }}>
              Pulls top Search Console opportunities, drafts full articles with Workers AI
              (Llama 3.3 70B), audits SEO/ownership, then opens a PR — or commits to main when
              score and gates allow. You only choose how many and whether to dry-run.
            </p>

            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginBottom: 16 }}>
              <label style={{ fontSize: 13, color: C.textMuted }}>
                Articles this run
                <select
                  value={autoLimit}
                  onChange={(e) => setAutoLimit(Number(e.target.value))}
                  style={inputStyle}
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </label>
              <label style={{ fontSize: 13, color: C.textMuted }}>
                Ship mode
                <select
                  value={autoMode}
                  onChange={(e) => setAutoMode(e.target.value as typeof autoMode)}
                  style={inputStyle}
                >
                  <option value="auto">Auto (PR, or main if audit passes)</option>
                  <option value="pr">Always open PR</option>
                  <option value="autodeploy">Prefer autodeploy to main</option>
                </select>
              </label>
              <label style={{ fontSize: 13, color: C.textMuted, display: 'flex', alignItems: 'center', gap: 8, marginTop: 28 }}>
                <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
                Dry run (no GitHub write)
              </label>
            </div>

            <button
              type="button"
              disabled={busy}
              onClick={runAutoPilot}
              style={{
                ...btnPrimary,
                fontSize: 15,
                padding: '14px 22px',
                opacity: busy ? 0.7 : 1,
              }}
            >
              {busy ? 'Running Cloudflare AI…' : dryRun ? `Dry-run top ${autoLimit}` : `Generate & ship top ${autoLimit}`}
            </button>

            <p style={{ margin: '14px 0 0', fontSize: 12, color: C.textDim }}>
              Requires <code>CLOUDFLARE_ACCOUNT_ID</code> + <code>CLOUDFLARE_AI_TOKEN</code> (or{' '}
              <code>CLOUDFLARE_API_TOKEN</code> with Workers AI Read) and <code>GITHUB_TOKEN</code>.
              Falls back to xAI/OpenAI/DeepSeek if CF AI is unavailable.
            </p>
          </div>

          {autoResult && (
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
              <h3 style={{ margin: '0 0 8px', color: C.cyan }}>
                Run result · GSC {autoResult.source} · {autoResult.shipped}/{autoResult.candidateCount} shipped
              </h3>
              <p style={{ margin: '0 0 12px', fontSize: 13, color: C.textMuted }}>{autoResult.message}</p>
              <div style={{ display: 'grid', gap: 10 }}>
                {(autoResult.results || []).map((r: any, i: number) => (
                  <div
                    key={r.term + i}
                    style={{
                      border: `1px solid ${C.border}`,
                      borderRadius: 8,
                      padding: 12,
                      fontSize: 13,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                      <strong style={{ color: C.text }}>{r.term}</strong>
                      <span style={{ color: r.ok ? C.green : C.red }}>
                        {r.ok ? 'ok' : 'failed'}
                        {r.provider ? ` · ${r.provider}` : ''}
                        {r.audit?.score != null ? ` · audit ${r.audit.score}` : ''}
                      </span>
                    </div>
                    {r.plan && (
                      <div style={{ color: C.textMuted, marginTop: 4, fontSize: 12 }}>
                        {r.plan.host} → {r.plan.repo} · {r.shipMode}
                        {r.ship?.prUrl && (
                          <> · <a href={r.ship.prUrl} target="_blank" rel="noreferrer">PR</a></>
                        )}
                        {r.ship?.commitSha && <> · sha {String(r.ship.commitSha).slice(0, 8)}</>}
                      </div>
                    )}
                    {(r.error || r.shipError) && (
                      <div style={{ color: C.red, marginTop: 4, fontSize: 12 }}>{r.error || r.shipError}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'factory' && (
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
              <label style={{ gridColumn: '1 / -1', fontSize: 13, color: C.textMuted }}>
                Topic
                <input
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="UK dependent visa guide for international students"
                  style={inputStyle}
                />
              </label>
              <label style={{ fontSize: 13, color: C.textMuted }}>
                Primary keyword (GSC)
                <input
                  value={primaryKeyword}
                  onChange={(e) => setPrimaryKeyword(e.target.value)}
                  placeholder="uk dependent visa"
                  style={inputStyle}
                />
              </label>
              <label style={{ fontSize: 13, color: C.textMuted }}>
                Region
                <select value={region} onChange={(e) => setRegion(e.target.value)} style={inputStyle}>
                  {['US', 'UK', 'CA', 'AU', 'COMPARE'].map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </label>
              <label style={{ fontSize: 13, color: C.textMuted }}>
                Content type
                <select value={contentType} onChange={(e) => setContentType(e.target.value)} style={inputStyle}>
                  <option value="legal_guide">Legal guide (caseworks)</option>
                  <option value="blog_summary">Blog summary</option>
                  <option value="regional_page">Regional page</option>
                  <option value="marketplace_gig">Marketplace gig</option>
                </select>
              </label>
              <label style={{ fontSize: 13, color: C.textMuted }}>
                Ship mode
                <select value={shipMode} onChange={(e) => setShipMode(e.target.value as ShipMode)} style={inputStyle}>
                  <option value="auto">Auto → PR (use Auto-Pilot for smart main)</option>
                  <option value="pr">PR (review → merge → deploy)</option>
                  <option value="autodeploy">Autodeploy (commit to main)</option>
                  <option value="none">Generate only</option>
                </select>
              </label>
              <label style={{ fontSize: 13, color: C.textMuted, display: 'flex', alignItems: 'center', gap: 8, marginTop: 22 }}>
                <input type="checkbox" checked={indexable} onChange={(e) => setIndexable(e.target.checked)} />
                Indexable (allow search engines)
              </label>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
              <button type="button" disabled={busy} onClick={runPlan} style={btnSecondary}>
                1. Plan
              </button>
              <button type="button" disabled={busy || (!topic && !primaryKeyword)} onClick={() => runGenerate()} style={btnPrimary}>
                2. Generate {shipMode !== 'none' ? `& ship` : ''} (Cloudflare AI)
              </button>
            </div>
          </div>

          {plan && (
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
              <h3 style={{ margin: '0 0 12px', color: C.cyan }}>Ownership plan</h3>
              <div style={{ fontSize: 13, color: C.text, lineHeight: 1.6 }}>
                <div><strong>Host:</strong> {plan.plan?.host} → <strong>Repo:</strong> {plan.plan?.repo}</div>
                <div><strong>Path:</strong> <code>{plan.plan?.filePath}</code></div>
                <div><strong>Canonical:</strong> {plan.plan?.canonicalUrl}</div>
                <div><strong>Indexable:</strong> {String(plan.plan?.indexable)} · <strong>YMYL:</strong> {String(plan.plan?.ymy)}</div>
                {plan.shipRecommendation && (
                  <div style={{ marginTop: 8, color: C.orange }}>
                    Recommend ship: <strong>{plan.shipRecommendation.mode}</strong> — {plan.shipRecommendation.reason}
                  </div>
                )}
                {(plan.plan?.blockers || []).map((b: string) => (
                  <div key={b} style={{ color: C.red, marginTop: 4 }}>⛔ {b}</div>
                ))}
                {(plan.plan?.warnings || []).map((w: string) => (
                  <div key={w} style={{ color: C.orange, marginTop: 4 }}>⚠ {w}</div>
                ))}
                {plan.gsc?.primaryKeywords?.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <strong>GSC keywords:</strong>{' '}
                    {plan.gsc.primaryKeywords.map((k: any) => k.term).join(' · ')}
                  </div>
                )}
              </div>
            </div>
          )}

          {result && (
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
              <h3 style={{ margin: '0 0 12px', color: C.cyan }}>
                Result · Audit {result.audit?.score} ({result.audit?.grade}) · {result.provider}
                {result.model ? ` · ${result.model}` : ''}
              </h3>
              {result.ship && (
                <div style={{ marginBottom: 12, fontSize: 13 }}>
                  Ship: <strong>{result.ship.status}</strong>
                  {result.ship.prUrl && (
                    <> — <a href={result.ship.prUrl} target="_blank" rel="noreferrer">{result.ship.prUrl}</a></>
                  )}
                  {result.ship.commitSha && <> — sha {result.ship.commitSha.slice(0, 8)}</>}
                </div>
              )}
              {(result.audit?.blockers || []).map((b: any) => (
                <div key={b.code + b.message} style={{ color: C.red, fontSize: 12 }}>⛔ {b.message}</div>
              ))}
              {(result.audit?.warnings || []).slice(0, 6).map((w: any) => (
                <div key={w.code + w.message} style={{ color: C.orange, fontSize: 12 }}>⚠ {w.message}</div>
              ))}
              <pre style={{
                marginTop: 12, maxHeight: 320, overflow: 'auto', fontSize: 11,
                background: '#F4F2EE', padding: 12, borderRadius: 8, whiteSpace: 'pre-wrap',
              }}>
                {(result.content || '').slice(0, 4000)}
                {(result.content || '').length > 4000 ? '\n…' : ''}
              </pre>
            </div>
          )}
        </div>
      )}

      {tab === 'opportunities' && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontSize: 13, color: C.textMuted }}>
              Source: {opps?.source || '—'} · {opps?.count ?? 0} opportunities
            </div>
            <button type="button" onClick={loadOpps} disabled={busy} style={btnSecondary}>Refresh</button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: C.textDim }}>
                  <th style={th}>Query</th>
                  <th style={th}>Imp</th>
                  <th style={th}>Pos</th>
                  <th style={th}>CTR</th>
                  <th style={th}>Action</th>
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {(opps?.opportunities || []).slice(0, 40).map((o: any) => (
                  <tr key={o.term} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td style={td}>{o.term}</td>
                    <td style={td}>{o.impressions}</td>
                    <td style={td}>{Number(o.position).toFixed(1)}</td>
                    <td style={td}>{(o.ctr * 100).toFixed(2)}%</td>
                    <td style={td}>{o.action}</td>
                    <td style={td}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          type="button"
                          style={btnSmall}
                          disabled={busy}
                          onClick={() => {
                            setPrimaryKeyword(o.term)
                            setTopic(o.term)
                            if (o.region) setRegion(o.region)
                            if (o.suggestedContentType) setContentType(o.suggestedContentType)
                            setTab('factory')
                            setActionNotice(`Loaded opportunity: ${o.term}`)
                          }}
                        >
                          Plan
                        </button>
                        <button
                          type="button"
                          style={{ ...btnSmall, background: C.cyan, color: '#fff', border: 'none' }}
                          disabled={busy || o.action === 'ignore'}
                          onClick={() => {
                            setPrimaryKeyword(o.term)
                            setTopic(o.term)
                            if (o.region) setRegion(o.region)
                            runGenerate({
                              topic: o.term,
                              keyword: o.term,
                              region: o.region,
                              contentType: o.suggestedContentType || 'legal_guide',
                              shipMode: 'pr',
                            })
                          }}
                        >
                          Ship PR
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'metrics' && metrics && (
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))' }}>
          {[
            ['Jobs', metrics.factory?.jobsTotal],
            ['PRs', metrics.factory?.prCreated],
            ['Deployed/Merged', metrics.factory?.deployedOrMerged],
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
            Visibility source: {metrics.visibility?.source}
          </div>
        </div>
      )}
    </div>
  )
}

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
