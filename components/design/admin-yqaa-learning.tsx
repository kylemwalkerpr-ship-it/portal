'use client'

import React from 'react'

type LearningData = {
  outcomeSampleLimit: number
  metrics: { offerEvents: number; approvalEvents: number; offerAcceptanceRate: number | null; providerApprovalRate: number | null; offerStates: Record<string, number>; approvalStates: Record<string, number> }
  evaluation: { validLabelCount: number; invalidLabelCount: number; falseSafeCount: number; falseUnsafeCount: number; promotion: string }
  falseSafeDemotions: { recommendation: string | null; eligibleForHumanReview: boolean; count: number }
  reviews: { caseCount: number; criticalCasesPendingDualReview: number; dualReviewedCriticalCases: number; conflictingCriticalCases: number; qualificationVerifiedCases: number; note: string }
  recentCases: Array<{ decisionRecordId: string; channel: string; posture: string; negotiationAction: string | null; escalated: boolean; reasonCodes: string[]; rubricVersion: string; createdAt: string }>
}

const panel: React.CSSProperties = { background: 'var(--admin-surface, #fff)', border: '1px solid #e5e7eb', borderRadius: 14, padding: 20 }
const button: React.CSSProperties = { border: '1px solid #d1d5db', borderRadius: 8, background: '#fff', padding: '9px 12px', fontWeight: 650, cursor: 'pointer' }

function percent(value: number | null) { return value == null ? '—' : `${(value * 100).toFixed(1)}%` }

export default function AdminYqaaLearning() {
  const [data, setData] = React.useState<LearningData | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [selected, setSelected] = React.useState('')
  const [humanSafe, setHumanSafe] = React.useState('')
  const [qualification, setQualification] = React.useState('')
  const [provenance, setProvenance] = React.useState('')
  const [notice, setNotice] = React.useState('')

  const refresh = React.useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/admin/yqaa-learning', { credentials: 'same-origin' })
      const payload = await response.json()
      if (!response.ok || payload.error) throw new Error(payload.error?.message || 'Calibration data unavailable.')
      setData(payload.data)
      setSelected((current) => current || payload.data.recentCases?.[0]?.decisionRecordId || '')
    } catch (err) { setError(err instanceof Error ? err.message : 'Calibration data unavailable.') }
    finally { setLoading(false) }
  }, [])

  React.useEffect(() => { void refresh() }, [refresh])

  async function exportReview() {
    try {
      const response = await fetch('/api/admin/yqaa-learning?export=review', { credentials: 'same-origin' })
      const payload = await response.json()
      if (!response.ok || payload.error) throw new Error(payload.error?.message || 'Export failed.')
      const blob = new Blob([JSON.stringify(payload.data.reviewExport, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url; anchor.download = 'yqaa-review-intake.json'; anchor.click()
      URL.revokeObjectURL(url)
    } catch (err) { setError(err instanceof Error ? err.message : 'Export failed.') }
  }

  async function submitReview(event: React.FormEvent) {
    event.preventDefault()
    setNotice(''); setError('')
    try {
      const response = await fetch('/api/admin/yqaa-learning', {
        method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decisionRecordId: selected, humanSafe: humanSafe === 'true', reviewerQualificationClaim: qualification, provenanceRef: provenance }),
      })
      const payload = await response.json()
      if (!response.ok || payload.error) throw new Error(payload.error?.message || 'Review could not be saved.')
      setNotice(payload.data.message)
      setHumanSafe(''); setQualification(''); setProvenance('')
      await refresh()
    } catch (err) { setError(err instanceof Error ? err.message : 'Review could not be saved.') }
  }

  const card = (label: string, value: React.ReactNode, detail?: string) => <div key={label} style={{ ...panel, minWidth: 150, flex: '1 1 150px' }}><div style={{ color: '#64748b', fontSize: 12, marginBottom: 8 }}>{label}</div><strong style={{ fontSize: 24, color: '#172554' }}>{value}</strong>{detail && <div style={{ color: '#64748b', fontSize: 12, marginTop: 6 }}>{detail}</div>}</div>

  return <main style={{ padding: '28px clamp(16px, 3vw, 36px)', maxWidth: 1320, margin: '0 auto', display: 'grid', gap: 18 }}>
    <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
      <div><div style={{ color: '#64748b', fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', fontWeight: 750 }}>YQAA · Phase 3</div><h1 style={{ margin: '6px 0', fontSize: 30, color: '#172554' }}>Learning calibration</h1><p style={{ margin: 0, color: '#64748b', maxWidth: 760 }}>Aggregate offer and provider approval outcomes, review shadow holds, and collect structured human review evidence. This console cannot change runtime policy.</p></div>
      <div style={{ display: 'flex', gap: 8 }}><button style={button} onClick={() => void refresh()}>Refresh</button><button style={button} onClick={() => void exportReview()}>Export review intake</button></div>
    </header>
    {error && <div role="alert" style={{ ...panel, color: '#991b1b', borderColor: '#fecaca' }}>{error}</div>}
    {notice && <div role="status" style={{ ...panel, color: '#166534', borderColor: '#bbf7d0' }}>{notice}</div>}
    {loading && <div style={{ color: '#64748b' }}>Loading aggregate learning data…</div>}
    {data && <>
      <section aria-label="Negotiation outcome metrics" style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {card('Offer state events', data.metrics.offerEvents, `Accepted / paid: ${percent(data.metrics.offerAcceptanceRate)}`)}
        {card('Provider approval events', data.metrics.approvalEvents, `Approved: ${percent(data.metrics.providerApprovalRate)}`)}
        {card('Decision records', data.recentCases.length, 'Latest 500 available for review export')}
        {card('Qualified gold labels', data.evaluation.validLabelCount, `${data.evaluation.invalidLabelCount} invalid or unqualified`)}
      </section>
      <section style={{ ...panel, display: 'grid', gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 18, color: '#172554' }}>Shadow evaluation</h2>
        <div><strong>State: {data.evaluation.promotion}</strong> · false-safe {data.evaluation.falseSafeCount} · false-unsafe {data.evaluation.falseUnsafeCount}</div>
        <div>False-safe recommendation: <strong>{data.falseSafeDemotions.recommendation || 'NONE'}</strong> · {data.falseSafeDemotions.count} case(s). Demotion is a human-reviewed suggestion; no policy is rewritten.</div>
        <div>Review intake: {data.reviews.caseCount} cases · critical awaiting second review {data.reviews.criticalCasesPendingDualReview} · dual-reviewed critical {data.reviews.dualReviewedCriticalCases} · conflicting critical {data.reviews.conflictingCriticalCases}.</div>
        <small style={{ color: '#64748b' }}>{data.reviews.note} Critical labels require two separate admin submissions and agreement; a disagreement stays held.</small>
      </section>
      <section style={{ ...panel, display: 'grid', gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 18, color: '#172554' }}>Human review intake</h2>
        <p style={{ margin: 0, color: '#64748b' }}>Cases contain decision metadata only. Do not add visitor prose, contact details, or transcript links. Qualification is recorded as a claim and is not verified here.</p>
        {data.recentCases.length === 0 ? <div>No decision records are available yet.</div> : <form onSubmit={submitReview} style={{ display: 'grid', gap: 10, maxWidth: 760 }}>
          <label>Case<select required value={selected} onChange={(event) => setSelected(event.target.value)} style={{ display: 'block', width: '100%', marginTop: 4, padding: 9 }}>
            {data.recentCases.map((item) => <option key={item.decisionRecordId} value={item.decisionRecordId}>{item.channel} · {item.posture} · {item.decisionRecordId.slice(0, 8)} · {new Date(item.createdAt).toLocaleString()}</option>)}
          </select></label>
          <label>Human safety label<select required value={humanSafe} onChange={(event) => setHumanSafe(event.target.value)} style={{ display: 'block', width: '100%', marginTop: 4, padding: 9 }}><option value="">Choose a label</option><option value="true">Safe</option><option value="false">Unsafe</option></select></label>
          <label>Reviewer qualification claim<input required minLength={3} maxLength={240} pattern="[A-Za-z ,()./-]{3,240}" value={qualification} onChange={(event) => setQualification(event.target.value)} style={{ display: 'block', width: '100%', marginTop: 4, padding: 9 }} placeholder="e.g. Licensed attorney, US immigration law" /></label>
          <label>Opaque provenance reference<input required minLength={3} maxLength={120} pattern="[A-Za-z0-9][A-Za-z0-9._:-]{2,119}" value={provenance} onChange={(event) => setProvenance(event.target.value)} style={{ display: 'block', width: '100%', marginTop: 4, padding: 9 }} placeholder="e.g. counsel-batch-2026-10-case-014" /></label>
          <div><button style={{ ...button, background: '#172554', color: 'white' }} type="submit">Save review claim</button></div>
        </form>}
      </section>
      <details style={panel}><summary style={{ cursor: 'pointer', fontWeight: 700 }}>Outcome state counts</summary><p style={{ color: '#64748b' }}>Metrics use the latest {data.outcomeSampleLimit} status events.</p><pre style={{ whiteSpace: 'pre-wrap', color: '#334155' }}>{JSON.stringify({ offers: data.metrics.offerStates, providerApprovals: data.metrics.approvalStates }, null, 2)}</pre></details>
    </>}
  </main>
}
