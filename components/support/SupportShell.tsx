'use client'
import { useEffect, useState } from 'react'
import { RaiseTicketModal } from './RaiseTicketModal'

type Order = {
  id: string
  status: string
  escrow_status: string | null
  created_at: string
  client: { id: string; name: string } | null
  seller: { id: string; role: string; name: string } | null
}

type Message = {
  id: string
  sender_id: string | null
  type: string
  body: string
  created_at: string
  attachment_url?: string | null
  attachment_name?: string | null
}

type OrderDetail = {
  order: {
    id: string; status: string; escrow_status: string | null; created_at: string
    buyer: { id: string; name?: string } | null
    seller: { id: string; role: string; name?: string } | null
  }
  conversation_id: string | null
  messages: Message[]
}

type Ticket = {
  id: string; order_id: string; kind: string; status: string; reason: string; amount_cents: number | null; created_at: string
}

const STATUS_TONE: Record<string, string> = {
  active: '#1A6B3A', delivered: '#3C3B6E', completed: '#1A6B3A',
  cancelled: '#8B1A1A', refunded: '#8B1A1A', disputed: '#B22234', paused: '#7B7B72',
}

function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) } catch { return iso }
}

export function SupportShell() {
  const [orders, setOrders] = useState<Order[]>([])
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [filter, setFilter] = useState<'all' | 'active' | 'disputed' | 'tickets'>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<OrderDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState('')
  const [ticketOpen, setTicketOpen] = useState(false)

  async function refresh() {
    setLoading(true)
    setError('')
    try {
      const [oRes, tRes] = await Promise.all([
        fetch('/api/support/orders', { credentials: 'same-origin' }),
        fetch('/api/support/tickets', { credentials: 'same-origin' }),
      ])
      if (!oRes.ok) throw new Error('Could not load orders.')
      const o = await oRes.json()
      setOrders(o.orders ?? [])
      if (tRes.ok) {
        const t = await tRes.json()
        setTickets(t.tickets ?? [])
      }
    } catch (e: any) {
      setError(e.message || 'Load failed')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  useEffect(() => {
    if (!selectedId) { setDetail(null); return }
    setDetailLoading(true)
    fetch(`/api/support/orders/${selectedId}`, { credentials: 'same-origin' })
      .then((r) => r.ok ? r.json() : Promise.reject(r.statusText))
      .then((d) => setDetail(d))
      .catch((e) => setError(typeof e === 'string' ? e : 'Could not load order.'))
      .finally(() => setDetailLoading(false))
  }, [selectedId])

  const ticketsByOrder = new Map<string, Ticket[]>()
  for (const t of tickets) {
    const arr = ticketsByOrder.get(t.order_id) ?? []
    arr.push(t)
    ticketsByOrder.set(t.order_id, arr)
  }

  const filtered = orders.filter((o) => {
    if (filter === 'all') return true
    if (filter === 'active') return ['active', 'delivered', 'paused'].includes(o.status)
    if (filter === 'disputed') return ['disputed', 'refunded', 'cancelled'].includes(o.status)
    if (filter === 'tickets') return ticketsByOrder.has(o.id)
    return true
  })

  return (
    <main style={wrap}>
      <style>{`
        button { font: inherit; cursor: pointer; }
        input, textarea, select { font: inherit; }
        .ys-sup-card { transition: background .12s; }
        .ys-sup-card:hover { background: #F4F0E6; }
      `}</style>

      <aside style={leftRail}>
        <header style={railHead}>
          <div>
            <div style={eyebrow}>Support · Orders</div>
            <h1 style={railTitle}>Triage queue</h1>
          </div>
          <button onClick={refresh} disabled={loading} style={ghostBtn}>{loading ? '…' : '↻'}</button>
        </header>
        <nav style={filterRow}>
          {(['all', 'active', 'disputed', 'tickets'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} style={filterChip(filter === f)}>
              {f}
              {f === 'tickets' && tickets.length > 0 && <span style={chipBadge}>{tickets.length}</span>}
            </button>
          ))}
        </nav>
        {error && <div style={errBox}>{error}</div>}
        <ul style={list}>
          {filtered.map((o) => {
            const ts = ticketsByOrder.get(o.id)
            const pending = ts?.filter((t) => t.status === 'pending').length ?? 0
            return (
              <li key={o.id}>
                <button onClick={() => setSelectedId(o.id)} className="ys-sup-card" style={orderCard(selectedId === o.id)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={orderId}>#{o.id.slice(0, 8)}</span>
                    <span style={{ ...statusPill, color: STATUS_TONE[o.status] || '#4A4F5B', borderColor: STATUS_TONE[o.status] || '#D9D1BD' }}>{o.status}</span>
                  </div>
                  <div style={partyLine}>
                    {o.client?.name ?? '—'} <span style={{ color: '#7B7B72' }}>↔</span> {o.seller?.name ?? '—'}
                  </div>
                  <div style={metaLine}>
                    {fmtDate(o.created_at)}
                    {pending > 0 && <span style={openTicketBadge}>{pending} open ticket{pending === 1 ? '' : 's'}</span>}
                  </div>
                </button>
              </li>
            )
          })}
          {!loading && filtered.length === 0 && <li style={emptyRail}>No orders match this filter.</li>}
        </ul>
      </aside>

      <section style={centerPane}>
        {!detail && !detailLoading && (
          <div style={emptyCenter}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
            <h2 style={emptyTitle}>Pick an order on the left</h2>
            <p style={emptySub}>Open it to read the conversation read-only, then raise a ticket if the order needs an admin's eye.</p>
          </div>
        )}
        {detailLoading && <div style={emptyCenter}>Loading order…</div>}
        {detail && (
          <>
            <header style={detailHead}>
              <div style={{ minWidth: 0 }}>
                <div style={eyebrow}>Order #{detail.order.id.slice(0, 8)}</div>
                <h2 style={detailTitle}>
                  {detail.order.buyer?.name ?? '—'} <span style={{ color: '#7B7B72' }}>↔</span> {detail.order.seller?.name ?? '—'}
                </h2>
                <div style={metaLine}>
                  Status: <b>{detail.order.status}</b>
                  {detail.order.escrow_status && <> · Escrow: <b>{detail.order.escrow_status}</b></>}
                  {' · '} Opened: {fmtDate(detail.order.created_at)}
                </div>
              </div>
              <button onClick={() => setTicketOpen(true)} style={primaryBtn}>Raise ticket →</button>
            </header>

            <div style={messages}>
              {detail.messages.length === 0
                ? <div style={emptyMsgs}>No messages yet on this order.</div>
                : detail.messages.map((m) => {
                  const isSystem = m.type === 'system' || m.sender_id == null
                  return (
                    <div key={m.id} style={isSystem ? sysMsg : userMsg}>
                      {!isSystem && (
                        <div style={msgMeta}>
                          {m.sender_id === detail.order.buyer?.id ? detail.order.buyer?.name : detail.order.seller?.name ?? 'User'} · {fmtDate(m.created_at)}
                        </div>
                      )}
                      <div style={isSystem ? sysBody : msgBody}>{m.body}</div>
                      {m.attachment_url && (
                        <a href={m.attachment_url} target="_blank" rel="noopener" style={attachLink}>
                          📎 {m.attachment_name || 'attachment'}
                        </a>
                      )}
                    </div>
                  )
                })}
            </div>

            {ticketsByOrder.get(detail.order.id)?.length ? (
              <div style={ticketsBlock}>
                <div style={ticketsHead}>Tickets on this order</div>
                {ticketsByOrder.get(detail.order.id)!.map((t) => (
                  <div key={t.id} style={ticketRow}>
                    <span style={ticketKind}>{t.kind}</span>
                    <span style={{ ...statusPill, fontSize: 11 }}>{t.status}</span>
                    <span style={ticketReason}>{t.reason}</span>
                    {t.amount_cents != null && <span style={ticketAmount}>${(t.amount_cents / 100).toFixed(2)}</span>}
                    <span style={ticketDate}>{fmtDate(t.created_at)}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </>
        )}
      </section>

      {ticketOpen && detail && (
        <RaiseTicketModal
          order={{ id: detail.order.id }}
          conversationId={detail.conversation_id}
          onClose={() => setTicketOpen(false)}
          onCreated={() => { setTicketOpen(false); refresh() }}
        />
      )}
    </main>
  )
}

/* ─────────────────────────── styles ───────────────────────────── */

const wrap: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: '380px 1fr',
  minHeight: '100vh', background: '#FBFAF7',
  fontFamily: "var(--font-inter), Inter, system-ui, sans-serif", color: '#1D2433',
}
const leftRail: React.CSSProperties = {
  borderRight: '1px solid #D9D1BD', background: '#FFFEF9', overflowY: 'auto', minHeight: 0,
}
const railHead: React.CSSProperties = {
  display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
  padding: '18px 18px 12px', borderBottom: '1px solid #E7E0CD', gap: 12,
}
const eyebrow: React.CSSProperties = {
  fontFamily: "var(--font-plex-mono), 'IBM Plex Mono', monospace",
  fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#7B7B72',
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
  display: 'flex', gap: 6, padding: '10px 18px', borderBottom: '1px solid #E7E0CD',
}
const filterChip = (on: boolean): React.CSSProperties => ({
  padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, textTransform: 'capitalize',
  border: `1px solid ${on ? '#1D2433' : '#D9D1BD'}`,
  background: on ? '#1D2433' : '#FFFEF9', color: on ? '#fff' : '#4A4F5B',
})
const chipBadge: React.CSSProperties = {
  marginLeft: 6, padding: '0 6px', background: '#B22234', color: '#fff', borderRadius: 999, fontSize: 10,
}
const list: React.CSSProperties = { listStyle: 'none', margin: 0, padding: 8 }
const orderCard = (on: boolean): React.CSSProperties => ({
  width: '100%', textAlign: 'left', background: on ? '#F4F0E6' : 'transparent',
  border: '1px solid transparent', borderRadius: 10, padding: '10px 12px',
  display: 'flex', flexDirection: 'column', gap: 4,
  borderLeft: on ? '3px solid #1D2433' : '3px solid transparent',
})
const orderId: React.CSSProperties = {
  fontFamily: "var(--font-plex-mono), monospace", fontSize: 11, color: '#7B7B72', letterSpacing: '0.06em',
}
const statusPill: React.CSSProperties = {
  fontFamily: "var(--font-plex-mono), monospace", fontSize: 10, letterSpacing: '0.08em',
  textTransform: 'uppercase', border: '1px solid #D9D1BD', padding: '1px 7px', borderRadius: 999,
}
const partyLine: React.CSSProperties = {
  fontSize: 13.5, fontWeight: 500, color: '#1D2433',
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
}
const metaLine: React.CSSProperties = {
  fontSize: 11.5, color: '#7B7B72', display: 'flex', alignItems: 'center', gap: 8,
}
const openTicketBadge: React.CSSProperties = {
  padding: '1px 7px', background: 'rgba(178,34,52,0.1)', color: '#B22234',
  borderRadius: 999, fontWeight: 600, fontSize: 10.5,
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
const emptySub: React.CSSProperties = { margin: '6px 0 0', fontSize: 13.5, maxWidth: '40ch' }
const detailHead: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
  padding: '18px 24px 14px', borderBottom: '1px solid #E7E0CD', background: '#FFFEF9',
}
const detailTitle: React.CSSProperties = {
  margin: '2px 0 4px', fontFamily: "var(--font-lora), serif",
  fontSize: 20, fontWeight: 500, color: '#1D2433',
}
const primaryBtn: React.CSSProperties = {
  background: '#1D2433', color: '#fff', border: 'none',
  padding: '9px 18px', borderRadius: 999, fontSize: 13.5, fontWeight: 600,
}
const messages: React.CSSProperties = {
  flex: 1, overflowY: 'auto', padding: '16px 24px',
  display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0,
}
const userMsg: React.CSSProperties = {
  background: '#FFFEF9', border: '1px solid #E7E0CD', borderRadius: 10, padding: '8px 12px',
  maxWidth: '78ch',
}
const sysMsg: React.CSSProperties = {
  background: 'rgba(60,59,110,0.06)', border: '1px dashed rgba(60,59,110,0.3)',
  borderRadius: 8, padding: '6px 12px', maxWidth: '78ch',
  fontFamily: "var(--font-plex-mono), monospace", fontSize: 11.5, color: '#3C3B6E',
  alignSelf: 'center',
}
const msgMeta: React.CSSProperties = {
  fontFamily: "var(--font-plex-mono), monospace", fontSize: 10.5,
  color: '#7B7B72', letterSpacing: '0.04em', marginBottom: 4,
}
const msgBody: React.CSSProperties = { fontSize: 14, lineHeight: 1.45, whiteSpace: 'pre-wrap', color: '#1D2433' }
const sysBody: React.CSSProperties = { fontSize: 12, lineHeight: 1.45, whiteSpace: 'pre-wrap', color: '#3C3B6E' }
const attachLink: React.CSSProperties = {
  display: 'inline-block', marginTop: 6, fontSize: 12.5, color: '#3C3B6E',
}
const emptyMsgs: React.CSSProperties = { color: '#7B7B72', fontStyle: 'italic', textAlign: 'center', padding: 30 }

const ticketsBlock: React.CSSProperties = {
  borderTop: '1px solid #E7E0CD', padding: '12px 24px', background: '#FFFEF9',
}
const ticketsHead: React.CSSProperties = {
  fontFamily: "var(--font-plex-mono), monospace", fontSize: 10.5,
  letterSpacing: '0.14em', textTransform: 'uppercase', color: '#7B7B72', marginBottom: 8,
}
const ticketRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10,
  padding: '6px 0', fontSize: 12.5, color: '#4A4F5B', flexWrap: 'wrap',
}
const ticketKind: React.CSSProperties = { fontWeight: 700, color: '#1D2433', textTransform: 'capitalize' }
const ticketReason: React.CSSProperties = { flex: 1, color: '#4A4F5B', minWidth: 0 }
const ticketAmount: React.CSSProperties = {
  fontFamily: "var(--font-lora), serif", fontWeight: 600, color: '#1D2433',
}
const ticketDate: React.CSSProperties = {
  fontFamily: "var(--font-plex-mono), monospace", fontSize: 10.5, color: '#7B7B72',
}
