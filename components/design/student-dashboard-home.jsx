'use client'
import React from 'react'
import { Card, Btn, Badge, StatusBadge, ProgressBar, Avatar } from './shared'
import DashboardGuide from './DashboardGuide'

/**
 * Student → Dashboard home (Fiverr-grade).
 *
 * Composes signals from every other section: orders, inquiries, messages,
 * documents, wallet, upcoming deadlines. Single composite endpoint plus a
 * separate live wallet balance call.
 */

const NAVY='var(--portal-ink)', GOLD='var(--portal-gold)', GREEN='#1A6B45', RED='#8B1A1A', AMBER='#8B5E0A', CYAN='var(--portal-accent)', PURPLE='#3D2B6B'
const BG='var(--portal-bg)', SURFACE='var(--portal-surface)', SURFACE2='var(--portal-surface-2)', BORDER='var(--portal-rule)', BORDER2='var(--portal-rule-soft)', TEXT='var(--portal-ink)', MUTED='var(--portal-ink-mid)', DIM='var(--portal-ink-soft)'
const SERIF=`var(--portal-font-display, 'Cormorant Garamond', Georgia, serif)`
const SANS=`var(--portal-font-body, -apple-system, BlinkMacSystemFont, 'Inter', sans-serif)`
const MONO=`'SF Mono', Menlo, Consolas, monospace`

const fmtN = n => Number(n ?? 0).toLocaleString('en-US')
const fmtMoney = (dollars, code = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: String(code || 'USD').toUpperCase(), minimumFractionDigits: 0, maximumFractionDigits: 0 })
    .format(Number(dollars || 0))
const fmtDateShort = s => s ? new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'
const fmtRelative = s => {
  if (!s) return ''
  const d = Math.floor((Date.now() - new Date(s).getTime()) / 86400000)
  if (d === 0) return 'today'
  if (d === 1) return 'yesterday'
  if (d < 30) return `${d}d ago`
  return `${Math.floor(d/30)}mo ago`
}
const firstName = full => {
  if (!full) return ''
  const t = String(full).trim().split(/\s+/)
  return t.find(x => !/^(Mr\.|Mrs\.|Ms\.|Mx\.|Dr\.|Prof\.)$/i.test(x)) || ''
}

function StatTile({ label, value, accent = NAVY, sub, onClick, icon }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10,
        padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 3,
        textAlign: 'left', fontFamily: SANS,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'box-shadow .15s, border-color .15s',
        boxShadow: 'none',
      }}
      onMouseEnter={e => { if (onClick) { e.currentTarget.style.boxShadow = '0 4px 12px rgba(27,45,79,0.08)'; e.currentTarget.style.borderColor = '#C8C2B6' } }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = BORDER }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {icon && <span style={{ fontSize: 14 }}>{icon}</span>}
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: DIM, fontFamily: MONO }}>{label}</span>
      </div>
      <div style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 28, color: accent, letterSpacing: '-.02em', fontVariantNumeric: 'tabular-nums', lineHeight: 1.05 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: MUTED, fontFamily: MONO }}>{sub}</div>}
    </button>
  )
}

function SectionHeader({ eyebrow, title, action, onActionClick }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 8 }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.14em', color: GOLD, textTransform: 'uppercase', fontFamily: MONO, marginBottom: 4 }}>{eyebrow}</div>
        <h2 style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 600, color: TEXT, margin: 0, letterSpacing: '-.01em' }}>{title}</h2>
      </div>
      {action && <Btn variant="ghost" size="sm" onClick={onActionClick}>{action}</Btn>}
    </div>
  )
}

function QuickActionTile({ icon, label, sub, onClick, accent = NAVY }) {
  return (
    <button onClick={onClick} style={{
      background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10,
      padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12,
      cursor: 'pointer', fontFamily: SANS, color: TEXT, textAlign: 'left', width: '100%',
      transition: 'border-color .15s, box-shadow .15s',
    }}
    onMouseEnter={e => { e.currentTarget.style.borderColor = accent; e.currentTarget.style.boxShadow = '0 4px 14px rgba(27,45,79,0.08)' }}
    onMouseLeave={e => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.boxShadow = 'none' }}
    >
      <div style={{ width: 36, height: 36, borderRadius: 8, background: `${accent}10`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>{icon}</div>
      <div>
        <div style={{ fontWeight: 700, fontSize: 13, color: TEXT, marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 11, color: MUTED }}>{sub}</div>
      </div>
    </button>
  )
}

export default function StudentDashboardHome({ userName, onNavigate, onOpenOrder, marketplaceWidgets }) {
  const [home, setHome] = React.useState(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [walletBal, setWalletBal] = React.useState(null)
  const [refreshKey, setRefreshKey] = React.useState(0)

  React.useEffect(() => {
    setLoading(true); setError('')
    fetch('/api/student/home', { credentials: 'same-origin' })
      .then(r => r.json().catch(() => ({})).then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => { if (!ok) throw new Error(d?.error || 'Failed'); setHome(d) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [refreshKey])

  React.useEffect(() => {
    fetch('/api/wallet/balance', { credentials: 'same-origin' })
      .then(r => r.json().catch(() => ({})))
      .then(d => setWalletBal(Number(d.available ?? 0)))
      .catch(() => setWalletBal(0))
  }, [refreshKey])

  // Visibility-aware refresh
  React.useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible') setRefreshKey(k => k + 1) }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  const name = home?.profile?.full_name || userName || ''
  const greeting = firstName(name)
  const stats = home?.orderStats || {}
  const inq = home?.inquiryStats || {}
  const docs = home?.docStats || {}
  const upcoming = home?.upcoming || []
  const inMotion = home?.inMotion || []
  const unread = home?.unreadConversations || 0

  const noActivity = !loading && (stats.total ?? 0) === 0 && inq.open === 0 && inq.engaged === 0

  return (
    <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: 22, fontFamily: SANS, background: BG, minHeight: '100vh' }}>
      {/* Header */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.14em', color: GOLD, textTransform: 'uppercase', fontFamily: MONO, marginBottom: 4 }}>Today</div>
        <h1 style={{ fontFamily: SERIF, fontSize: 34, fontWeight: 500, color: TEXT, margin: 0, letterSpacing: '-.012em' }}>
          Welcome back{greeting ? `, ${greeting}` : ''}.
        </h1>
        <div style={{ fontSize: 14, color: MUTED, marginTop: 6 }}>
          {loading
            ? 'Pulling your portfolio…'
            : noActivity
              ? 'Browse services or templates and place your first order to get started.'
              : stats.awaitingApproval > 0
                ? <>You have <strong style={{ color: AMBER }}>{stats.awaitingApproval}</strong> order{stats.awaitingApproval === 1 ? '' : 's'} awaiting your approval.</>
                : stats.active > 0
                  ? <>{stats.active} order{stats.active === 1 ? '' : 's'} in progress · {unread > 0 ? `${unread} unread conversation${unread === 1 ? '' : 's'}` : 'all caught up'}.</>
                  : 'No active engagements. Browse the catalogue or contact an attorney.'}
        </div>
      </div>

      {error && (
        <Card style={{ padding: 14, background: `${RED}10`, border: `1px solid ${RED}33`, color: RED, fontSize: 13 }}>{error}</Card>
      )}

      {/* Stat tiles */}
      {!loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
          <StatTile icon="⏳" label="Awaiting approval" value={fmtN(stats.awaitingApproval ?? 0)} accent={AMBER} sub="needs your action" onClick={() => onNavigate?.('orders')} />
          <StatTile icon="📦" label="Active orders"     value={fmtN(stats.active ?? 0)}            accent={CYAN}  sub={`${fmtN(stats.pending ?? 0)} pending`} onClick={() => onNavigate?.('orders')} />
          <StatTile icon="💬" label="Unread chats"      value={fmtN(unread)}                       accent={PURPLE} sub="across all consultants" onClick={() => onNavigate?.('messages')} />
          <StatTile icon="⚡" label="Pending offers"    value={fmtN(inq.pendingOffers ?? 0)}       accent={GREEN} sub={`${fmtN(inq.open ?? 0)} inquiries open`} onClick={() => onNavigate?.('inquiries')} />
          <StatTile icon="🔒" label="Escrow held"       value={fmtMoney(stats.escrowHeld ?? 0)}    accent={AMBER} sub="held for active orders" onClick={() => onNavigate?.('billing')} />
          <StatTile icon="💳" label="Wallet"            value={walletBal === null ? '—' : fmtMoney(walletBal)} accent={NAVY} sub="available" onClick={() => onNavigate?.('billing')} />
        </div>
      )}

      {/* Role guide (preserved from existing dashboard) */}
      <DashboardGuide role="client" />

      <div className="yousafe-mobile-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20 }}>
        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* In motion */}
          {inMotion.length > 0 && (
            <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <SectionHeader eyebrow="Active" title="Orders in motion" action="View all →" onActionClick={() => onNavigate?.('orders')} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {inMotion.map(o => (
                  <Card key={o.id} onClick={() => onOpenOrder?.(o)} hover style={{
                    padding: '14px 18px', cursor: 'pointer',
                    borderLeft: `4px solid ${o.status === 'review' ? AMBER : o.status === 'active' ? CYAN : MUTED}`,
                  }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      <Avatar name={o.consultant} src={o.consultantAvatar || undefined} size={36} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2, flexWrap: 'wrap' }}>
                          <StatusBadge status={o.status} />
                          {o.status === 'review' && <Badge color="orange" style={{ fontSize: 10 }}>⚠ Approve delivery</Badge>}
                        </div>
                        <div style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 16, color: TEXT, lineHeight: 1.2, letterSpacing: '-.005em' }}>{o.title}</div>
                        <div style={{ fontSize: 11, color: MUTED, fontFamily: MONO, marginTop: 2 }}>with {o.consultant}{o.deadlineAt && <> · due {fmtDateShort(o.deadlineAt)}</>}</div>
                        <ProgressBar value={o.progress} style={{ marginTop: 8 }} />
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          )}

          {/* Empty state */}
          {noActivity && (
            <Card style={{ padding: '40px 32px', textAlign: 'center' }}>
              <div style={{ fontSize: 38, marginBottom: 10 }}>🎯</div>
              <div style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 600, color: TEXT, marginBottom: 4 }}>Start your first engagement</div>
              <div style={{ fontSize: 13, color: MUTED, maxWidth: 380, margin: '0 auto 14px' }}>
                Browse the catalogue, contact an attorney, or submit an inquiry to describe your case.
              </div>
              <div style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                <Btn variant="primary" size="sm" onClick={() => onNavigate?.('services')}>Browse services</Btn>
                <Btn variant="secondary" size="sm" onClick={() => onNavigate?.('attorneys')}>Find Your Specialist</Btn>
              </div>
            </Card>
          )}

          {/* Quick actions */}
          <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <SectionHeader eyebrow="Shortcuts" title="Quick actions" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
              <QuickActionTile icon="🎯"  label="Find Your Specialist" sub="Consultants + attorneys" onClick={() => onNavigate?.('attorneys')} accent={PURPLE} />
              <QuickActionTile icon="🛒"  label="Services"          sub="Catalogue and templates"   onClick={() => onNavigate?.('services')}  accent={CYAN} />
              <QuickActionTile icon="📥"  label="New inquiry"       sub="Describe your case"        onClick={() => onNavigate?.('inquiries')} accent={AMBER} />
              <QuickActionTile icon="📋"  label="Documents"         sub="Files shared with consultants" onClick={() => onNavigate?.('documents')} accent={NAVY} />
              <QuickActionTile icon="💬"  label="Messages"          sub={unread > 0 ? `${unread} unread` : 'All caught up'} onClick={() => onNavigate?.('messages')} accent={PURPLE} />
              <QuickActionTile icon="💳"  label="Billing"           sub="Wallet and receipts"       onClick={() => onNavigate?.('billing')}   accent={GREEN} />
            </div>
          </section>

          {/* Marketplace widgets — passed through */}
          {marketplaceWidgets && (
            <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <SectionHeader eyebrow="Marketplace" title="Your activity" />
              {marketplaceWidgets}
            </section>
          )}
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Upcoming deadlines */}
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: `1px solid ${BORDER2}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontFamily: SERIF, fontSize: 16, fontWeight: 600, color: TEXT }}>Upcoming deadlines</div>
              {upcoming.length > 0 && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: `${AMBER}15`, color: AMBER, textTransform: 'uppercase' }}>{upcoming.length}</span>}
            </div>
            <div style={{ padding: '10px 18px 14px' }}>
              {upcoming.length === 0
                ? <div style={{ fontSize: 12, color: MUTED, padding: '8px 0' }}>No upcoming deadlines.</div>
                : upcoming.map(d => {
                    const overdue = d.daysAway < 0
                    const soon = d.daysAway <= 3 && d.daysAway >= 0
                    const color = overdue ? RED : soon ? AMBER : NAVY
                    return (
                      <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${BORDER2}`, gap: 10 }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</div>
                          <div style={{ fontSize: 11, color: MUTED, fontFamily: MONO }}>{fmtDateShort(d.deadlineAt)}</div>
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: `${color}15`, color, textTransform: 'uppercase', flexShrink: 0 }}>
                          {overdue ? `${-d.daysAway}d overdue` : d.daysAway === 0 ? 'Today' : d.daysAway === 1 ? 'Tomorrow' : `${d.daysAway}d`}
                        </span>
                      </div>
                    )
                  })}
            </div>
          </Card>

          {/* Recent files */}
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: `1px solid ${BORDER2}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontFamily: SERIF, fontSize: 16, fontWeight: 600, color: TEXT }}>Documents</div>
              <Btn variant="ghost" size="sm" onClick={() => onNavigate?.('documents')}>Open →</Btn>
            </div>
            <div style={{ padding: '12px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontFamily: SERIF, fontSize: 24, fontWeight: 600, color: TEXT, fontVariantNumeric: 'tabular-nums' }}>{fmtN(docs.total ?? 0)}</div>
                  <div style={{ fontSize: 11, color: MUTED, fontFamily: MONO }}>files stored</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: SERIF, fontSize: 24, fontWeight: 600, color: docs.last7d > 0 ? CYAN : MUTED, fontVariantNumeric: 'tabular-nums' }}>{fmtN(docs.last7d ?? 0)}</div>
                  <div style={{ fontSize: 11, color: MUTED, fontFamily: MONO }}>this week</div>
                </div>
              </div>
            </div>
          </Card>

          {/* Lifetime spend mini-tile */}
          {stats.lifetimeSpend > 0 && (
            <Card style={{ padding: '14px 18px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: DIM, fontFamily: MONO, marginBottom: 4 }}>Lifetime spend</div>
              <div style={{ fontFamily: SERIF, fontSize: 24, fontWeight: 600, color: TEXT, lineHeight: 1 }}>{fmtMoney(stats.lifetimeSpend)}</div>
              <div style={{ fontSize: 11, color: MUTED, fontFamily: MONO, marginTop: 4 }}>across {fmtN(stats.total ?? 0)} order{stats.total === 1 ? '' : 's'}</div>
              <Btn variant="ghost" size="sm" style={{ marginTop: 8 }} onClick={() => onNavigate?.('billing')}>Open billing →</Btn>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
