'use client'
/**
 * UserDetailDrawer — the admin Users tab's full-visibility panel.
 *
 * Fetches /api/admin/users/[id]/details and renders EVERYTHING known about
 * the user: full profile row, the original signup application, the
 * role-specific provider record, wallet + spend, payment methods, gigs,
 * orders, and earnings. Field rendering is generic (key/value over whole
 * rows) so newly-added DB columns appear here automatically.
 */
import React from 'react'
import { C, Btn, Badge, Avatar } from './shared'
import { countryNameForCode } from '../../lib/countryList'

const SECTION_LABELS: Record<string, string> = {
  profile: 'Profile',
  application: 'Signup Application',
  provider_record: 'Provider Profile',
}

// Keys hidden from the generic grids (shown elsewhere or pure noise).
const HIDDEN_KEYS = new Set(['id', 'profile_id', 'full_name', 'email', 'role', 'status'])

const fmtMoney = (cents: any) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format((Number(cents) || 0) / 100)

const looksLikeDate = (k: string, v: any) =>
  typeof v === 'string' && /(_at|_date|_until)$/.test(k) && !isNaN(new Date(v).getTime())

function fmtValue(key: string, value: any): React.ReactNode {
  if (value === null || value === undefined || value === '') return <span style={{ color: C.textDim }}>—</span>
  if (typeof value === 'boolean') return value ? '✓ Yes' : '✗ No'
  if (/_cents$/.test(key)) return fmtMoney(value)
  if (looksLikeDate(key, value)) return new Date(value).toLocaleString()
  if (Array.isArray(value)) {
    if (value.length === 0) return <span style={{ color: C.textDim }}>—</span>
    return (
      <span style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
        {value.slice(0, 12).map((v, i) => (
          <span key={i} style={{ padding: '2px 8px', borderRadius: '4px', background: C.surface3, fontSize: '12px' }}>
            {typeof v === 'object' ? JSON.stringify(v) : String(v)}
          </span>
        ))}
        {value.length > 12 && <span style={{ color: C.textDim, fontSize: '12px' }}>+{value.length - 12} more</span>}
      </span>
    )
  }
  if (typeof value === 'object') {
    return (
      <pre style={{ margin: 0, fontSize: '11px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: '140px', overflowY: 'auto', background: C.surface3, padding: '8px', borderRadius: '6px' }}>
        {JSON.stringify(value, null, 1)}
      </pre>
    )
  }
  const str = String(value)
  if (/^https?:\/\//.test(str)) {
    return <a href={str} target="_blank" rel="noreferrer" style={{ color: C.cyan, wordBreak: 'break-all' }}>{str}</a>
  }
  return <span style={{ wordBreak: 'break-word' }}>{str}</span>
}

const labelize = (k: string) => k.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase())

function KVGrid({ row }: { row: Record<string, any> }) {
  const entries = Object.entries(row).filter(([k]) => !HIDDEN_KEYS.has(k))
  if (entries.length === 0) return <div style={{ color: C.textDim, fontSize: '13px' }}>No data.</div>
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '10px' }}>
      {entries.map(([k, v]) => (
        <div key={k} style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: '10px', padding: '10px 12px', minWidth: 0 }}>
          <div style={{ color: C.textMuted, fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>{labelize(k)}</div>
          <div style={{ color: C.text, fontSize: '13px', fontWeight: 600, lineHeight: 1.4 }}>{fmtValue(k, v)}</div>
        </div>
      ))}
    </div>
  )
}

function Section({ title, sub, children, defaultOpen = true }: any) {
  const [open, setOpen] = React.useState(defaultOpen)
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: '12px', overflow: 'hidden' }}>
      <button onClick={() => setOpen((o: boolean) => !o)}
        style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: C.surface2, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
        <span style={{ fontSize: '13px', fontWeight: 800, color: C.text, letterSpacing: '0.02em' }}>
          {title}
          {sub && <span style={{ fontWeight: 500, color: C.textMuted, marginLeft: '8px', fontSize: '12px' }}>{sub}</span>}
        </span>
        <span style={{ color: C.textMuted, fontSize: '12px' }}>{open ? '▾' : '▸'}</span>
      </button>
      {open && <div style={{ padding: '14px 16px' }}>{children}</div>}
    </div>
  )
}

function OrdersMini({ orders }: { orders: any[] }) {
  if (!orders?.length) return <div style={{ color: C.textDim, fontSize: '13px' }}>None.</div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {orders.map((o) => (
        <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '13px', padding: '8px 10px', background: C.surface2, borderRadius: '8px' }}>
          <span style={{ fontFamily: 'monospace', color: C.textMuted }}>{String(o.id).slice(0, 8)}</span>
          <span style={{ fontWeight: 700, textTransform: 'capitalize' }}>{o.status}</span>
          <span>{fmtMoney(Math.round(Number(o.total_amount || 0) * 100))}</span>
          <span style={{ color: C.textDim }}>{o.created_at ? new Date(o.created_at).toLocaleDateString() : '—'}</span>
        </div>
      ))}
    </div>
  )
}

export default function UserDetailDrawer({ user, onClose, isCurrentAdmin, approveUser, updateUser, deleteUser, onViewOrders }: any) {
  const [details, setDetails] = React.useState<any>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true); setError('')
      try {
        const res = await fetch(`/api/admin/users/${user.id}/details`, { credentials: 'same-origin' })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json?.error?.message || 'Could not load user details.')
        if (!cancelled) setDetails(json?.data ?? null)
      } catch (e: any) {
        if (!cancelled) setError(e.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [user.id])

  const d = details
  const roleColor = user.role === 'consultant' ? C.purple : user.role === 'support' ? C.orange : user.role === 'admin' ? C.red : C.cyan

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 220, display: 'flex', justifyContent: 'flex-end' }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: '760px', height: '100vh', overflowY: 'auto', background: C.surface, borderLeft: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ position: 'sticky', top: 0, zIndex: 2, background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', minWidth: 0 }}>
            <Avatar name={user.name} src={undefined} size={44} color={roleColor} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '17px', fontWeight: 800, color: C.text, display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                {user.name}
                <Badge color={user.status === 'active' ? 'green' : user.status === 'pending' ? 'orange' : 'red'}>{user.status}</Badge>
                <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: roleColor }}>{user.role}</span>
              </div>
              <div style={{ color: C.textMuted, fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.email}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: '20px', flexShrink: 0 }}>✕</button>
        </div>

        {/* Actions bar */}
        <div style={{ padding: '12px 24px', borderBottom: `1px solid ${C.border}`, display: 'flex', gap: '8px', flexWrap: 'wrap', background: C.surface2 }}>
          <Btn variant="primary" size="sm" onClick={onViewOrders}>View orders</Btn>
          {['consultant', 'support'].includes(user.role) && user.status === 'pending' && (
            <Btn variant="success" size="sm" onClick={() => approveUser(user)}>Approve access</Btn>
          )}
          {isCurrentAdmin(user) ? (
            <Badge color="red">Current admin account</Badge>
          ) : (
            <>
              <Btn variant={user.status === 'active' ? 'danger' : 'success'} size="sm"
                onClick={() => updateUser(user, { status: user.status === 'active' ? 'suspended' : 'active' })}>
                {user.status === 'active' ? 'Suspend user' : 'Activate user'}
              </Btn>
              <Btn variant="danger" size="sm" onClick={() => deleteUser(user)}>Delete user</Btn>
            </>
          )}
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {loading && <div style={{ padding: '40px', textAlign: 'center', color: C.textMuted }}>Loading full record…</div>}
          {error && <div style={{ padding: '14px', borderRadius: '10px', background: 'rgba(178,34,52,0.08)', color: C.red, fontSize: '13px' }}>{error}</div>}

          {d && (
            <>
              {/* At-a-glance strip */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
                {[
                  ['Joined', d.profile?.created_at ? new Date(d.profile.created_at).toLocaleDateString() : '—'],
                  ['Country', d.profile?.country_code
                    ? `${d.profile.country_code}${countryNameForCode(d.profile.country_code) ? ' · ' + countryNameForCode(d.profile.country_code) : ''}`
                    : (d.profile?.country || '—')],
                  ['Wallet', d.wallet ? fmtMoney(d.wallet.balance_cents) : '—'],
                  ['Lifetime spend', d.wallet ? fmtMoney(d.wallet.lifetime_spend_cents) : '—'],
                  ...(d.earnings ? [['Earned (total)', fmtMoney(d.earnings.total_cents)], ['Owed', fmtMoney(d.earnings.owed_cents)]] : []),
                  ['Orders (client)', d.activity?.orders_as_client ?? 0],
                  ...(['attorney', 'consultant'].includes(user.role)
                    ? [['Orders (provider)', d.activity?.orders_as_provider ?? 0], ['Gigs', d.activity?.gig_count ?? 0]]
                    : []),
                ].map(([label, value]) => (
                  <div key={String(label)} style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: '10px', padding: '10px 12px' }}>
                    <div style={{ color: C.textMuted, fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
                    <div style={{ color: C.text, fontSize: '15px', fontWeight: 800, marginTop: '2px' }}>{value as any}</div>
                  </div>
                ))}
              </div>

              {/* Signup application — everything the user filled at sign-up */}
              {d.application && (
                <Section title={SECTION_LABELS.application} sub="As submitted by the user at sign-up">
                  <KVGrid row={d.application} />
                </Section>
              )}

              {/* Role-specific provider profile */}
              {d.provider_record && (
                <Section title={SECTION_LABELS.provider_record} sub="Public-facing provider details">
                  <KVGrid row={d.provider_record} />
                </Section>
              )}

              {/* Full profile row */}
              {d.profile && (
                <Section title={SECTION_LABELS.profile} sub={d.clerk_user_id_hint ? `Auth: ${d.clerk_user_id_hint}` : undefined}>
                  <KVGrid row={d.profile} />
                </Section>
              )}

              {/* Finance */}
              <Section title="Finance" sub={d.payment_methods?.length ? `${d.payment_methods.length} saved card(s)` : 'No saved cards'} defaultOpen={false}>
                {d.wallet ? (
                  <div style={{ marginBottom: '12px' }}>
                    <KVGrid row={d.wallet} />
                  </div>
                ) : <div style={{ color: C.textDim, fontSize: '13px', marginBottom: '12px' }}>No wallet.</div>}
                {(d.payment_methods ?? []).map((m: any, i: number) => (
                  <div key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 12px', borderRadius: '8px', background: C.surface2, border: `1px solid ${C.border}`, marginRight: '8px', marginBottom: '6px', fontSize: '13px' }}>
                    <span style={{ fontWeight: 800, textTransform: 'capitalize' }}>{m.brand}</span>
                    <span style={{ fontFamily: 'monospace' }}>•••• {m.last4}</span>
                    {m.gateway && <span style={{ color: C.textDim, fontSize: '11px' }}>{m.gateway}</span>}
                  </div>
                ))}
              </Section>

              {/* Activity */}
              <Section title="Recent Activity" defaultOpen={false}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '14px' }}>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', marginBottom: '6px' }}>As client · {d.activity?.orders_as_client ?? 0} orders</div>
                    <OrdersMini orders={d.activity?.recent_client_orders} />
                  </div>
                  {['attorney', 'consultant'].includes(user.role) && (
                    <>
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', marginBottom: '6px' }}>As provider · {d.activity?.orders_as_provider ?? 0} orders</div>
                        <OrdersMini orders={d.activity?.recent_provider_orders} />
                      </div>
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', marginBottom: '6px' }}>Gigs · {d.activity?.gig_count ?? 0}</div>
                        {(d.activity?.gigs ?? []).length === 0
                          ? <div style={{ color: C.textDim, fontSize: '13px' }}>None.</div>
                          : (d.activity.gigs as any[]).map((g) => (
                            <div key={g.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '13px', padding: '8px 10px', background: C.surface2, borderRadius: '8px', marginBottom: '6px' }}>
                              <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.title}</span>
                              <span style={{ textTransform: 'capitalize', color: C.textMuted }}>{g.status}</span>
                              <span style={{ color: C.textDim }}>{g.order_count ?? 0} orders</span>
                            </div>
                          ))}
                      </div>
                    </>
                  )}
                </div>
              </Section>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
