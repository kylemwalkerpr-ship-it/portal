'use client'
import { useEffect, useState } from 'react'

type Ticket = {
  id: string
  order_id: string
  conversation_id: string | null
  raised_by: string
  kind: 'void' | 'refund_partial' | 'release_hold' | 'other'
  amount_cents: number | null
  reason: string
  detail: string | null
  status: 'pending' | 'approved' | 'denied' | 'cancelled'
  decided_by: string | null
  decided_at: string | null
  decision_notes: string | null
  created_at: string
}

const STATUS_TONE: Record<Ticket['status'], { bg: string; fg: string }> = {
  pending:   { bg: 'rgba(60,59,110,0.08)', fg: '#3C3B6E' },
  approved:  { bg: 'rgba(26,107,58,0.08)', fg: '#1A6B3A' },
  denied:    { bg: 'rgba(178,34,52,0.08)', fg: '#B22234' },
  cancelled: { bg: '#F4F0E6',              fg: '#7B7B72' },
}

const KIND_LABEL: Record<Ticket['kind'], string> = {
  void: 'Void · full refund',
  refund_partial: 'Partial refund',
  release_hold: 'Release escrow early',
  other: 'Other action',
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) } catch { return iso }
}
function fmtMoney(cents: number | null) {
  if (cents == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}

export function AdminTicketsShell() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [filter, setFilter] = useState<Ticket['status'] | 'all'>('pending')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [decisionNotes, setDecisionNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  async function refresh() {
    setLoading(true)
    setError('')
    try {
      const r = await fetch('/api/support/tickets', { credentials: 'same-origin' })
      if (!r.ok) throw new Error('Could not load tickets.')
      const j = await r.json()
      setTickets(j.tickets ?? [])
    } catch (e: any) {
      setError(e.message || 'Load failed')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  async function decide(decision: 'approved' | 'denied' | 'cancelled') {
    if (!selectedId) return
    if (decision !== 'cancelled' && decisionNotes.trim().length === 0 && decision === 'denied') {
      if (!confirm('Deny without notes? Buyer/seller will only see "Order is unchanged."')) return
    }
    setBusy(true)
    setError('')
    try {
      const r = await fetch(`/api/admin/tickets/${selectedId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ status: decision, decision_notes: decisionNotes.trim() || null }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j?.error || `Could not ${decision} ticket.`)
      setDecisionNotes('')
      await refresh()
    } catch (e: any) {
      setError(e.message || 'Action failed')
    } finally {
      setBusy(false)
    }
  }

  const filtered = tickets.filter((t) => filter === 'all' ? true : t.status === filter)
  const selected = tickets.find((t) => t.id === selectedId) ?? null
  const counts = {
    pending:   tickets.filter((t) => t.status === 'pending').length,
    approved:  tickets.filter((t) => t.status === 'approved').length,
    denied:    tickets.filter((t) => t.status === 'denied').length,
    cancelled: tickets.filter((t) => t.status === 'cancelled').length,
  }

  return (
    <main style={wrap}>
      <style>{`button { font: inherit; cursor: pointer; } textarea { font: inherit; }`}</style>

      <aside style={leftRail}>
        <header style={railHead}>
          <div>
            <div style={eyebrow}>Admin · Tickets</div>
            <h1 style={railTitle}>Decision queue</h1>
          </div>
          <button onClick={refresh} disabled={loading} style={ghostBtn}>{loading ? '…' : '↻'}</button>
        </header>
        <nav style={filterRow}>
          {(['pending', 'approved', 'denied', 'cancelled', 'all'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} style={filterChip(filter === f)}>
              {f}
              {f !== 'all' && counts[f as Ticket['status']] > 0 && (
                <span style={chipBadge(f)}>{counts[f as Ticket['status']]}</span>
              )}
            </button>
          ))}
        </nav>
        {error && <div style={errBox}>{error}</div>}
        <ul style={list}>
          {filtered.map((t) => (
            <li key={t.id}>
              <button onClick={() => { setSelectedId(t.id); setDecisionNotes('') }} style={ticketCard(selectedId === t.id)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 2 }}>
                  <span style={kindLabel}>{KIND_LABEL[t.kind]}</span>
                  <span style={{ ...statusPill, background: STATUS_TONE[t.status].bg, color: STATUS_TONE[t.status].fg }}>{t.status}</span>
                </div>
                <div style={orderRef}>Order #{t.order_id.slice(0, 8)}{t.amount_cents != null && <> · {fmtMoney(t.amount_cents)}</>}</div>
                <div style={ticketPreview}>{t.reason}</div>
                <div style={ticketDate}>{fmtDate(t.created_at)}</div>
              </button>
            </li>
          ))}
          {!loading && filtered.length === 0 && <li style={emptyRail}>No tickets in this state.</li>}
        </ul>
      </aside>

      <section style={centerPane}>
        {!selected && (
          <div style={emptyCenter}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🧾</div>
            <h2 style={emptyTitle}>Pick a ticket to review</h2>
            <p style={emptySub}>Approving fires the escrow RPC and drops a [Admin] system message into the buyer-seller conversation. Denying leaves the order untouched.</p>
          </div>
        )}
        {selected && (
          <>
            <header style={detailHead}>
              <div style={{ minWidth: 0 }}>
                <div style={eyebrow}>
                  Order #{selected.order_id.slice(0, 8)} · raised {fmtDate(selected.created_at)}
                </div>
                <h2 style={detailTitle}>{KIND_LABEL[selected.kind]}</h2>
                {selected.amount_cents != null && (
                  <div style={{ ...detailMeta, fontFamily: "var(--font-lora), serif", fontSize: 18 }}>
                    {fmtMoney(selected.amount_cents)} from escrow
                  </div>
                )}
              </div>
              <span style={{ ...statusPillLarge, background: STATUS_TONE[selected.status].bg, color: STATUS_TONE[selected.status].fg }}>
                {selected.status}
              </span>
            </header>

            <div style={detailBody}>
              <section>
                <h3 style={sectionLabel}>Reason from support</h3>
                <p style={readonlyBlock}>{selected.reason}</p>
              </section>

              {selected.detail && (
                <section>
                  <h3 style={sectionLabel}>Internal notes</h3>
                  <p style={readonlyBlock}>{selected.detail}</p>
                </section>
              )}

              {selected.status === 'pending' ? (
                <section>
                  <h3 style={sectionLabel}>Decision notes <span style={{ fontWeight: 400, color: '#7B7B72' }}>· optional</span></h3>
                  <p style={fieldHelp}>Recorded on the ticket. The summary line shown to buyer/seller comes from the approve/deny action — your notes here are admin-private context.</p>
                  <textarea
                    rows={3} value={decisionNotes} maxLength={4000}
                    onChange={(e) => setDecisionNotes(e.target.value)}
                    placeholder="What tipped the call. Reference policy section, evidence file, etc."
                    style={input}
                  />

                  <div style={actionsRow}>
                    <button onClick={() => decide('denied')} disabled={busy} style={denyBtn}>Deny</button>
                    <button onClick={() => decide('cancelled')} disabled={busy} style={ghostBtn}>Cancel ticket</button>
                    <button onClick={() => decide('approved')} disabled={busy} style={approveBtn}>
                      {busy ? 'Working…' : 'Approve →'}
                    </button>
                  </div>
                  <p style={tinyHint}>
                    Approving void → 100% refund. refund_partial → {selected.amount_cents != null ? fmtMoney(selected.amount_cents) : '$0'} refund. release_hold → balance to seller now. Other → no escrow change, just the system message.
                  </p>
                </section>
              ) : (
                <section>
                  <h3 style={sectionLabel}>Decision</h3>
                  <p style={readonlyBlock}>
                    <b>{selected.status}</b> by admin on {fmtDate(selected.decided_at)}.
                    {selected.decision_notes && <> Notes: <i>{selected.decision_notes}</i></>}
                  </p>
                </section>
              )}
            </div>
          </>
        )}
      </section>
    </main>
  )
}

/* styles — mirrors SupportShell */
const wrap: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: '380px 1fr',
  minHeight: '100vh', background: '#FBFAF7',
  fontFamily: "var(--font-inter), Inter, system-ui, sans-serif", color: '#1D2433',
}
const leftRail: React.CSSProperties = { borderRight: '1px solid #D9D1BD', background: '#FFFEF9', overflowY: 'auto', minHeight: 0 }
const railHead: React.CSSProperties = {
  display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
  padding: '18px 18px 12px', borderBottom: '1px solid #E7E0CD', gap: 12,
}
const eyebrow: React.CSSProperties = {
  fontFamily: "var(--font-plex-mono), monospace", fontSize: 10.5, letterSpacing: '0.14em',
  textTransform: 'uppercase', color: '#7B7B72',
}
const railTitle: React.CSSProperties = {
  margin: '2px 0 0', fontFamily: "var(--font-lora), Lora, Georgia, serif",
  fontSize: 22, fontWeight: 500, color: '#1D2433',
}
const ghostBtn: React.CSSProperties = {
  width: 32, height: 32, borderRadius: '50%', border: '1px solid #D9D1BD',
  background: '#FBFAF7', color: '#1D2433', fontSize: 14,
}
const filterRow: React.CSSProperties = {
  display: 'flex', gap: 6, padding: '10px 18px', borderBottom: '1px solid #E7E0CD', flexWrap: 'wrap',
}
const filterChip = (on: boolean): React.CSSProperties => ({
  padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, textTransform: 'capitalize',
  border: `1px solid ${on ? '#1D2433' : '#D9D1BD'}`,
  background: on ? '#1D2433' : '#FFFEF9', color: on ? '#fff' : '#4A4F5B',
})
const chipBadge = (f: string): React.CSSProperties => ({
  marginLeft: 6, padding: '0 6px',
  background: f === 'pending' ? '#B22234' : f === 'approved' ? '#1A6B3A' : '#7B7B72',
  color: '#fff', borderRadius: 999, fontSize: 10,
})
const list: React.CSSProperties = { listStyle: 'none', margin: 0, padding: 8 }
const ticketCard = (on: boolean): React.CSSProperties => ({
  width: '100%', textAlign: 'left',
  background: on ? '#F4F0E6' : 'transparent',
  border: '1px solid transparent', borderRadius: 10, padding: '10px 12px',
  display: 'flex', flexDirection: 'column', gap: 2,
  borderLeft: on ? '3px solid #1D2433' : '3px solid transparent',
})
const kindLabel: React.CSSProperties = { fontWeight: 700, fontSize: 13, color: '#1D2433' }
const orderRef: React.CSSProperties = {
  fontFamily: "var(--font-plex-mono), monospace", fontSize: 11, color: '#7B7B72', letterSpacing: '0.04em',
}
const statusPill: React.CSSProperties = {
  fontFamily: "var(--font-plex-mono), monospace", fontSize: 10, letterSpacing: '0.08em',
  textTransform: 'uppercase', padding: '1px 7px', borderRadius: 999,
}
const ticketPreview: React.CSSProperties = {
  fontSize: 12.5, color: '#4A4F5B', lineHeight: 1.4,
  overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
}
const ticketDate: React.CSSProperties = {
  fontFamily: "var(--font-plex-mono), monospace", fontSize: 10.5, color: '#7B7B72', marginTop: 4,
}
const emptyRail: React.CSSProperties = { padding: 20, color: '#7B7B72', fontSize: 13, textAlign: 'center' }
const errBox: React.CSSProperties = {
  margin: '8px 18px', padding: 8, background: 'rgba(178,34,52,0.08)',
  border: '1px solid rgba(178,34,52,0.3)', borderRadius: 8, fontSize: 12, color: '#8B1A1A',
}

const centerPane: React.CSSProperties = { display: 'flex', flexDirection: 'column', minHeight: 0 }
const emptyCenter: React.CSSProperties = {
  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  padding: 40, textAlign: 'center', color: '#7B7B72',
}
const emptyTitle: React.CSSProperties = {
  margin: 0, fontFamily: "var(--font-lora), serif", fontSize: 22, fontWeight: 500, color: '#1D2433',
}
const emptySub: React.CSSProperties = { margin: '6px 0 0', fontSize: 13.5, maxWidth: '46ch', lineHeight: 1.5 }

const detailHead: React.CSSProperties = {
  display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16,
  padding: '20px 26px', borderBottom: '1px solid #E7E0CD', background: '#FFFEF9',
}
const detailTitle: React.CSSProperties = {
  margin: '4px 0', fontFamily: "var(--font-lora), serif", fontSize: 24, fontWeight: 500, color: '#1D2433',
}
const detailMeta: React.CSSProperties = { color: '#1D2433' }
const statusPillLarge: React.CSSProperties = {
  fontFamily: "var(--font-plex-mono), monospace", fontSize: 11, letterSpacing: '0.14em',
  textTransform: 'uppercase', padding: '4px 12px', borderRadius: 999, fontWeight: 600, flexShrink: 0,
}
const detailBody: React.CSSProperties = {
  flex: 1, overflowY: 'auto', padding: '20px 26px',
  display: 'flex', flexDirection: 'column', gap: 22, minHeight: 0,
}
const sectionLabel: React.CSSProperties = {
  margin: '0 0 8px', fontFamily: "var(--font-plex-mono), monospace",
  fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#7B7B72', fontWeight: 600,
}
const readonlyBlock: React.CSSProperties = {
  margin: 0, padding: '12px 14px',
  background: '#FFFEF9', border: '1px solid #E7E0CD', borderRadius: 10,
  fontSize: 14, lineHeight: 1.55, color: '#1D2433', whiteSpace: 'pre-wrap',
}
const fieldHelp: React.CSSProperties = { margin: '0 0 8px', fontSize: 12, color: '#7B7B72', lineHeight: 1.5 }
const input: React.CSSProperties = {
  width: '100%', padding: '10px 12px', border: '1px solid #D9D1BD', borderRadius: 8,
  background: '#FFFEF9', fontSize: 14, color: '#1D2433',
  fontFamily: 'inherit', boxSizing: 'border-box', resize: 'vertical',
}
const actionsRow: React.CSSProperties = { display: 'flex', gap: 10, marginTop: 14, justifyContent: 'flex-end' }
const approveBtn: React.CSSProperties = {
  background: '#1A6B3A', color: '#fff', border: 'none',
  padding: '10px 22px', borderRadius: 999, fontSize: 13.5, fontWeight: 600,
}
const denyBtn: React.CSSProperties = {
  background: '#FFFEF9', color: '#B22234', border: '1px solid #B22234',
  padding: '9px 18px', borderRadius: 999, fontSize: 13, fontWeight: 600,
}
const tinyHint: React.CSSProperties = {
  margin: '12px 0 0', fontFamily: "var(--font-plex-mono), monospace",
  fontSize: 10.5, letterSpacing: '0.04em', color: '#7B7B72', lineHeight: 1.55,
}
