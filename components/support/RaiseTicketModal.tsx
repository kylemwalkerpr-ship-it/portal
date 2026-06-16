'use client'
import { useEffect, useState } from 'react'

type Kind = 'void' | 'refund_partial' | 'release_hold' | 'other'

const KIND_OPTIONS: Array<{ id: Kind; label: string; desc: string }> = [
  { id: 'void',           label: 'Void order (full refund)',  desc: 'Cancel the order and refund 100% from escrow to the buyer.' },
  { id: 'refund_partial', label: 'Partial refund',            desc: 'Refund a portion of escrow — typically a single milestone.' },
  { id: 'release_hold',   label: 'Release escrow early',      desc: 'Release the full balance to the seller before the 7-day clock.' },
  { id: 'other',          label: 'Other admin action',        desc: "Anything that needs admin's eye but isn't a refund." },
]

export function RaiseTicketModal({
  order, conversationId, onClose, onCreated,
}: {
  order: { id: string }
  conversationId: string | null
  onClose: () => void
  onCreated: () => void
}) {
  const [kind, setKind] = useState<Kind>('void')
  const [reason, setReason] = useState('')
  const [detail, setDetail] = useState('')
  const [amountDollars, setAmountDollars] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onEsc)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onEsc); document.body.style.overflow = prev }
  }, [onClose])

  async function submit() {
    setSaving(true)
    setErr('')
    try {
      if (reason.trim().length < 8) throw new Error('Reason must be ≥ 8 characters.')
      const body: Record<string, unknown> = {
        order_id: order.id,
        conversation_id: conversationId,
        kind, reason: reason.trim(), detail: detail.trim() || null,
      }
      if (kind === 'refund_partial') {
        const n = Number(amountDollars)
        if (!Number.isFinite(n) || n <= 0) throw new Error('Refund amount in dollars is required.')
        body.amount_cents = Math.round(n * 100)
      }
      const r = await fetch('/api/support/tickets', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin', body: JSON.stringify(body),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j?.error || 'Could not create ticket.')
      onCreated()
    } catch (e: any) {
      setErr(e.message || 'Submit failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Raise support ticket" style={overlay}>
      <div style={backdrop} onClick={onClose} />
      <div style={panel}>
        <header style={head}>
          <div>
            <div style={eyebrow}>Order #{order.id.slice(0, 8)}</div>
            <h2 style={title}>Raise admin ticket</h2>
          </div>
          <button onClick={onClose} aria-label="Close" style={closeBtn}>×</button>
        </header>

        <div style={body}>
          {err && <div style={errBox}>{err}</div>}

          <label style={field}>
            <div style={fieldLabel}>What action does this need? <span style={req}>*</span></div>
            <div style={kindList}>
              {KIND_OPTIONS.map((k) => (
                <button key={k.id} type="button" onClick={() => setKind(k.id)} style={kindCard(kind === k.id)}>
                  <div style={kindCardTitle}>{k.label}</div>
                  <div style={kindCardDesc}>{k.desc}</div>
                </button>
              ))}
            </div>
          </label>

          {kind === 'refund_partial' && (
            <label style={field}>
              <div style={fieldLabel}>Refund amount (USD) <span style={req}>*</span></div>
              <input
                type="number" min="0.01" step="0.01"
                value={amountDollars}
                onChange={(e) => setAmountDollars(e.target.value)}
                placeholder="e.g. 120.00"
                style={input}
              />
            </label>
          )}

          <label style={field}>
            <div style={fieldLabel}>Reason <span style={req}>*</span></div>
            <p style={fieldHelp}>Visible to admin. Will land in the audit trail. ≥ 8 characters.</p>
            <textarea
              rows={4} value={reason} maxLength={400}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Seller never delivered, buyer asked for full refund, escrow held > 14 days."
              style={input}
            />
            <div style={charCount(reason.length >= 8)}>
              {reason.length} / 400 chars{reason.length < 8 ? ` · ${8 - reason.length} more needed` : ''}
            </div>
          </label>

          <label style={field}>
            <div style={fieldLabel}>Internal notes <span style={{ color: '#64748B', fontWeight: 400 }}>· optional, admin-only</span></div>
            <p style={fieldHelp}>Context for the admin reviewing this. Never shown to buyer or seller.</p>
            <textarea
              rows={3} value={detail} maxLength={4000}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="Payment reference, prior conversation excerpt, etc."
              style={input}
            />
          </label>
        </div>

        <footer style={foot}>
          <button onClick={onClose} style={ghostBtn} disabled={saving}>Cancel</button>
          <button onClick={submit} style={primaryBtn} disabled={saving || reason.trim().length < 8}>
            {saving ? 'Submitting…' : 'Submit to admin →'}
          </button>
        </footer>
      </div>
    </div>
  )
}

/* styles */
const overlay: React.CSSProperties = { position: 'fixed', inset: 0, zIndex: 300, fontFamily: "var(--font-inter), Inter, system-ui, sans-serif" }
const backdrop: React.CSSProperties = { position: 'absolute', inset: 0, background: 'rgba(15,19,30,0.5)', backdropFilter: 'blur(3px)' }
const panel: React.CSSProperties = {
  position: 'absolute', top: '6vh', left: '50%', transform: 'translateX(-50%)',
  width: 'min(640px, calc(100vw - 32px))', maxHeight: '88vh',
  background: '#F7F8FA', border: '1px solid #E2E8F0', borderRadius: 16,
  boxShadow: '0 30px 80px -30px rgba(29,36,51,0.5)',
  display: 'flex', flexDirection: 'column', minHeight: 0,
}
const head: React.CSSProperties = {
  display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
  padding: '18px 22px 12px', borderBottom: '1px solid #F1F5F9', gap: 12,
}
const eyebrow: React.CSSProperties = {
  fontFamily: "var(--font-plex-mono), monospace", fontSize: 10.5, letterSpacing: '0.14em',
  textTransform: 'uppercase', color: '#64748B',
}
const title: React.CSSProperties = {
  margin: '2px 0 0', fontFamily: "var(--font-lora), Lora, serif", fontSize: 22, fontWeight: 500, color: '#0F172A',
}
const closeBtn: React.CSSProperties = {
  width: 36, height: 36, borderRadius: '50%', border: '1px solid #E2E8F0',
  background: '#FFFFFF', color: '#0F172A', fontSize: 20,
}
const body: React.CSSProperties = { padding: 22, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 18, minHeight: 0 }
const field: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6 }
const fieldLabel: React.CSSProperties = { fontWeight: 600, fontSize: 13.5, color: '#0F172A' }
const fieldHelp: React.CSSProperties = { margin: 0, fontSize: 12, color: '#64748B', lineHeight: 1.5 }
const req: React.CSSProperties = { color: '#B22234' }
const input: React.CSSProperties = {
  width: '100%', padding: '10px 12px', border: '1px solid #E2E8F0', borderRadius: 8,
  background: '#FFFFFF', fontSize: 14, color: '#0F172A',
  fontFamily: 'inherit', boxSizing: 'border-box', resize: 'vertical',
}
const charCount = (ok: boolean): React.CSSProperties => ({
  fontFamily: "var(--font-plex-mono), monospace", fontSize: 11, color: ok ? '#1A6B3A' : '#B22234',
})
const kindList: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }
const kindCard = (on: boolean): React.CSSProperties => ({
  display: 'block', textAlign: 'left', padding: 12, borderRadius: 10,
  border: `1px solid ${on ? '#0F172A' : '#E2E8F0'}`,
  background: on ? '#0F172A' : '#FFFFFF',
  color: on ? '#fff' : '#0F172A', cursor: 'pointer',
})
const kindCardTitle: React.CSSProperties = { fontWeight: 700, fontSize: 13, marginBottom: 2 }
const kindCardDesc: React.CSSProperties = { fontSize: 11.5, lineHeight: 1.4, opacity: 0.85 }
const foot: React.CSSProperties = {
  display: 'flex', justifyContent: 'flex-end', gap: 10,
  padding: '14px 22px', borderTop: '1px solid #F1F5F9', background: '#FFFFFF',
}
const ghostBtn: React.CSSProperties = {
  background: '#FFFFFF', color: '#0F172A', border: '1px solid #E2E8F0',
  padding: '9px 16px', borderRadius: 999, fontSize: 13, fontWeight: 600,
}
const primaryBtn: React.CSSProperties = {
  background: '#0F172A', color: '#fff', border: 'none',
  padding: '10px 20px', borderRadius: 999, fontSize: 13.5, fontWeight: 600,
}
const errBox: React.CSSProperties = {
  background: 'rgba(178,34,52,0.08)', border: '1px solid rgba(178,34,52,0.3)',
  borderRadius: 8, padding: '10px 14px', color: '#8B1A1A', fontSize: 13,
}
