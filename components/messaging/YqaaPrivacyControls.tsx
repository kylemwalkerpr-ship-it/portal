'use client'

import React from 'react'
import type { YqaaMemoryFact, YqaaMemoryState } from '@/lib/yqaaPrivacy'
import './yqaa-privacy.css'

/** Mounted with a conversation key: no response or draft can cross threads. */
export default function YqaaPrivacyControls({ conversationId }: { conversationId: string }) {
  const [state, setState] = React.useState<YqaaMemoryState | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  const [optIn, setOptIn] = React.useState(false)
  const [notice, setNotice] = React.useState('')
  const mounted = React.useRef(true)
  const inflight = React.useRef(false)
  const pageRef = React.useRef(0)
  const readSequence = React.useRef(0)
  const attempt = React.useRef<{ fingerprint: string; requestId: string } | null>(null)
  const base = `/api/messages/conversations/${encodeURIComponent(conversationId)}/privacy`

  const refresh = React.useCallback(async () => {
    const sequence = ++readSequence.current
    const response = await fetch(`${base}/facts?page=${pageRef.current}`, { credentials: 'same-origin', cache: 'no-store' })
    const payload = await response.json()
    if (!response.ok) throw new Error('Privacy controls are unavailable. YQAA cannot use memory without confirmed consent. You can still send messages to your provider.')
    if (mounted.current && sequence === readSequence.current) setState(payload)
  }, [base])

  React.useEffect(() => {
    mounted.current = true
    refresh().catch(e => { if (mounted.current) setError(e.message) })
    return () => { mounted.current = false }
  }, [refresh])

  async function mutate(action: string, fact?: YqaaMemoryFact, value?: string) {
    if (inflight.current || !state) return
    inflight.current = true
    setBusy(true); setError(''); setNotice('')
    const input = {
      action, expectedVersion: state.consent?.version || 0,
      ...(action === 'grant' ? { explicitOptIn: optIn } : {}),
      ...(fact ? { factId: fact.id, expectedFactVersion: fact.version } : {}),
      ...(action === 'correct' ? { value } : {}),
    }
    // Network uncertainty retries the exact same request; never invent success.
    const fingerprint = JSON.stringify(input)
    if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, requestId: crypto.randomUUID() }
    try {
      const response = await fetch(fact ? `${base}/facts` : base, {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...input, requestId: attempt.current.requestId }),
      })
      const payload = await response.json()
      if (!response.ok) {
        if (response.status === 409) { attempt.current = null; await refresh() }
        throw new Error(response.status === 409 ? 'Memory changed while you were editing. Review the refreshed facts and try again.' : 'The change was not confirmed. Refresh or retry before relying on it.')
      }
      if (!fact) pageRef.current = 0
      await refresh()
      if (mounted.current) {
        setOptIn(false)
        setNotice(action === 'withdraw' ? 'Consent withdrawn. Future YQAA generation is disabled for this conversation.' : action === 'grant' ? 'Consent granted for future messages in this conversation.' : 'Derived memory updated. Retained messages and transactions were not erased.')
      }
      attempt.current = null
    } catch (e: any) {
      if (mounted.current) setError(e?.message || 'The change was not confirmed. Please retry.')
    } finally {
      inflight.current = false
      if (mounted.current) setBusy(false)
    }
  }

  async function changePage(page: number) {
    if (inflight.current) return
    inflight.current = true; setBusy(true); setError('')
    const previous = pageRef.current
    pageRef.current = page
    try { await refresh() } catch (e: any) { pageRef.current = previous; if (mounted.current) setError(e.message) }
    finally { inflight.current = false; if (mounted.current) setBusy(false) }
  }

  const granted = state?.consent?.granted === true
  return <section className="yqaa-privacy" aria-label="YQAA privacy and memory" aria-busy={busy}>
    <p role="status">{state ? granted ? 'YQAA consent is on for this conversation.' : 'YQAA is off until you explicitly consent. Your provider can still receive your messages.' : 'Checking YQAA consent…'}</p>
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    <details>
      <summary>Privacy and remembered facts</summary>
      <p>Consent covers YQAA processing and derived memory only in this direct conversation with this provider. Granting consent starts with future messages; it does not import earlier history.</p>
      <p>Derived facts remain until you forget them, withdraw consent, or they are superseded. Corrections and forgetting remove derived text and stop earlier messages and assistant echoes from rebuilding it. Other active facts remain after a single-fact change. Messages, attachments, approvals, offers, transactions and audits are retained under their separate retention rules; this control does not erase them or set their legal retention period. An already-started external model request may finish, but an outdated reply cannot be committed.</p>
      <p>Facts record your statements, not verified conclusions. To replace a named fact deterministically, send “Remember goal: …”, “Remember destination: …”, “Remember budget: …”, “Remember deadline: …” or “Remember documents: …”. The newest named statement wins by message time and ID. Corrections here do not authorize prices or offers.</p>
      <p><strong>Cross-site account linking is unavailable.</strong> No anonymous, public-chat, support or other-site identity is linked by this consent. Those channels are outside these memory controls.</p>
      <p>Consent version: {state?.consent?.version || 0}. Scope: this conversation only.</p>
      {!granted && <label className="yqaa-privacy-optin"><input type="checkbox" checked={optIn} disabled={busy || !state} onChange={e => setOptIn(e.target.checked)} /> I explicitly consent to YQAA processing and remembering future messages in this conversation.</label>}
      <div className="yqaa-privacy-actions">
        {!granted && <button type="button" disabled={!state || busy || !optIn} onClick={() => mutate('grant')}>Grant consent</button>}
        {granted && <button type="button" disabled={busy} onClick={() => mutate('withdraw')}>Withdraw consent and forget memory</button>}
        <button type="button" disabled={!state || busy} onClick={() => mutate('forget')}>Forget all derived memory</button>
        <button type="button" disabled={busy} onClick={() => refresh().catch(e => setError(e.message))}>Refresh privacy state</button>
      </div>
      {granted && <>
        <h3>Remembered facts</h3>
        {!state?.facts.length && <p>No derived facts have been saved. Facts appear after the next eligible message.</p>}
        <p>Page {pageRef.current + 1}. Up to 200 facts per page; YQAA context uses at most 120 active facts, prioritizing named facts.</p>
        <div className="yqaa-privacy-actions">
          <button type="button" disabled={busy || pageRef.current === 0} onClick={() => changePage(pageRef.current - 1)}>Previous facts</button>
          <button type="button" disabled={busy || !state?.has_more} onClick={() => changePage(pageRef.current + 1)}>More facts</button>
        </div>
        <ul>{state?.facts.map(fact => <FactEditor key={fact.id} fact={fact} busy={busy} onChange={mutate} />)}</ul>
      </>}
    </details>
  </section>
}

function FactEditor({ fact, busy, onChange }: {
  fact: YqaaMemoryFact; busy: boolean; onChange: (action: string, fact: YqaaMemoryFact, value?: string) => Promise<void>
}) {
  const [value, setValue] = React.useState(fact.value || '')
  const labelId = React.useId()
  return <li>
    <label htmlFor={labelId}>{fact.fact_key.startsWith('statement:') ? 'Your statement' : fact.fact_key} · version {fact.version}{fact.corrected ? ' · corrected' : ''}</label>
    <textarea id={labelId} value={value} maxLength={1000} disabled={busy} onChange={e => setValue(e.target.value)} />
    <small>Source message: {fact.source_message_id}. Recorded {new Date(fact.source_created_at).toLocaleString()}.</small>
    <div className="yqaa-privacy-actions">
      <button type="button" disabled={busy || !value.trim() || value === fact.value} onClick={() => onChange('correct', fact, value)}>Save correction</button>
      <button type="button" disabled={busy} onClick={() => onChange('delete', fact)}>Forget this fact</button>
    </div>
  </li>
}
