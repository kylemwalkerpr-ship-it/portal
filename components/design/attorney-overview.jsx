'use client'
import React from 'react'
import { Card, Btn, Badge, StatusBadge, Avatar } from './shared'
import DashboardGuide from './DashboardGuide'

/**
 * Attorney → Overview (Fiverr-grade dashboard home).
 *
 * Composes signals from earnings, orders, inquiries, messages, and gigs.
 * Single composite endpoint plus visibility-aware auto-refresh.
 */

const NAVY='#0F172A', GOLD='#9A7B3B', GREEN='#1A6B45', RED='#8B1A1A', AMBER='#8B5E0A', CYAN='#0E7C8E', PURPLE='#3D2B6B'
const BG='#F7F5F0', SURFACE='#FFFFFF', SURFACE2='#FAFAF7', BORDER='#DDD8CE', BORDER2='#F2EFE9', TEXT='#1A1F2E', MUTED='#5C6070', DIM='#9097A8'
const SERIF=`'Cormorant Garamond', Georgia, serif`
const SANS=`-apple-system, BlinkMacSystemFont, 'Inter', sans-serif`
const MONO=`'SF Mono', Menlo, Consolas, monospace`

const fmtN = n => Number(n ?? 0).toLocaleString('en-US')
const fmtMoney = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
const fmtDateShort = s => s ? new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'
const fmtRelative = s => {
  if (!s) return ''
  const d = Math.floor((Date.now() - new Date(s).getTime()) / 86400000)
  if (d === 0) return 'today'
  if (d === 1) return 'yesterday'
  if (d < 30) return `${d}d ago`
  return `${Math.floor(d/30)}mo ago`
}

// Compact stat cell used in the premium My Office hero strip. Smaller
// than StatTile and not interactive — just a glanceable "what's the
// number" cell inside the gradient header.
function HeroStat({ label, value, accent = NAVY }) {
  return (
    <div style={{ padding: '14px 12px', borderRight: `1px solid ${BORDER}` }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: MUTED,
        letterSpacing: '.12em', textTransform: 'uppercase', fontFamily: MONO,
      }}>{label}</div>
      <div style={{
        fontSize: 20, fontWeight: 600, color: accent,
        marginTop: 2, fontFamily: SERIF, letterSpacing: '-.012em',
      }}>{value}</div>
    </div>
  )
}

function StatTile({ icon, label, value, accent = NAVY, sub, onClick }) {
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

export default function AttorneyOverview({ onJump, displayName }) {
  const [home, setHome] = React.useState(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [refreshKey, setRefreshKey] = React.useState(0)

  React.useEffect(() => {
    setLoading(true); setError('')
    fetch('/api/attorney/home', { credentials: 'same-origin' })
      .then(r => r.json().catch(() => ({})).then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => { if (!ok) throw new Error(d?.error || 'Failed'); setHome(d) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [refreshKey])

  // Visibility-aware refresh
  React.useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible') setRefreshKey(k => k + 1) }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  const greeting = (displayName || '').trim().split(/\s+/).find(t => !/^(Mr\.|Mrs\.|Ms\.|Mx\.|Dr\.|Prof\.)$/i.test(t)) || ''
  const stats = home?.orderStats || {}
  const inq = home?.inquiryStats || {}
  const unread = home?.unreadConversations || 0
  const upcoming = home?.upcoming || []
  const inMotion = home?.inMotion || []
  const connect = home?.connect || {}
  const noActivity = !loading && (stats.total ?? 0) === 0 && inq.open === 0

  return (
    <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: 22, fontFamily: SANS, background: BG, minHeight: '100vh' }}>
      {/* Premium "My Office" header — gradient panel with eyebrow,
          serif headline, contextual status sub-line, and a 4-cell
          stat strip showing the most relevant pipeline counters.
          Mirrors the gig manager workbench surface to feel like one
          coherent attorney portal. */}
      <div style={{
        background: `linear-gradient(135deg, ${SURFACE} 0%, ${SURFACE2} 100%)`,
        border: `1px solid ${BORDER}`,
        borderRadius: 16,
        padding: '24px 24px 0',
        boxShadow: '0 10px 30px -22px rgba(60,59,110,0.35)',
        overflow: 'hidden',
      }}>
        <div style={{ paddingBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.14em', color: GOLD, textTransform: 'uppercase', fontFamily: MONO, marginBottom: 4 }}>
            My Office · Today
          </div>
          <h1 style={{ fontFamily: SERIF, fontSize: 'clamp(26px, 3.4vw, 36px)', fontWeight: 500, color: TEXT, margin: 0, letterSpacing: '-.012em' }}>
            Welcome back{greeting ? `, ${greeting}` : ''}.
          </h1>
          <div style={{ fontSize: 14, color: MUTED, marginTop: 6 }}>
            {loading
              ? 'Pulling your pipeline…'
              : noActivity
                ? 'Open the queue to respond to your first inquiry, or finish setting up payouts.'
                : stats.review > 0
                  ? <>You have <strong style={{ color: AMBER }}>{stats.review}</strong> order{stats.review === 1 ? '' : 's'} awaiting client approval — escrow releases on approval.</>
                  : stats.overdue > 0
                    ? <><strong style={{ color: RED }}>{stats.overdue}</strong> order{stats.overdue === 1 ? '' : 's'} past deadline. Reach out to your client to keep the engagement healthy.</>
                    : inq.targeted_to_me > 0
                      ? <><strong style={{ color: PURPLE }}>{inq.targeted_to_me}</strong> inquir{inq.targeted_to_me === 1 ? 'y' : 'ies'} targeted directly to you. Respond first to win.</>
                      : stats.active > 0
                        ? <>{stats.active} order{stats.active === 1 ? '' : 's'} in progress · {unread > 0 ? `${unread} unread message${unread === 1 ? '' : 's'}` : 'inbox clear'}.</>
                        : 'No active orders right now. Check the queue or revise your profile to win more inquiries.'}
          </div>
        </div>
        {!loading && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
            borderTop: `1px solid ${BORDER}`,
            background: SURFACE,
            margin: '0 -24px',
            padding: '0 24px',
          }}>
            <HeroStat label="Open queue" value={fmtN(inq.open ?? 0)} accent={CYAN} />
            <HeroStat label="Active orders" value={fmtN(stats.active ?? 0)} accent={CYAN} />
            <HeroStat label="Overdue" value={fmtN(stats.overdue ?? 0)} accent={stats.overdue > 0 ? RED : MUTED} />
            <HeroStat label="30-day earnings" value={fmtMoney(stats.transferred30d ?? 0)} accent={GREEN} />
          </div>
        )}
      </div>

      {error && (
        <Card style={{ padding: 14, background: `${RED}10`, border: `1px solid ${RED}33`, color: RED, fontSize: 13 }}>{error}</Card>
      )}

      {/* Payout-setup banner removed: payouts are processed automatically in the
          weekly Tuesday batch — no provider onboarding/connect step required. */}

      {/* Stat tiles */}
      {!loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
          <StatTile icon="📥"  label="Open queue"            value={fmtN(inq.open ?? 0)}            accent={CYAN}   sub={`${fmtN(inq.fresh_24h ?? 0)} fresh today`} onClick={() => onJump('queue')} />
          <StatTile icon="🎯"  label="Targeted to me"        value={fmtN(inq.targeted_to_me ?? 0)}  accent={PURPLE} sub="addressed to you" onClick={() => onJump('queue')} />
          <StatTile icon="📦"  label="Active orders"         value={fmtN(stats.active ?? 0)}        accent={CYAN}   sub={`${fmtN(stats.review ?? 0)} awaiting approval`} onClick={() => onJump('orders')} />
          <StatTile icon="⚠️"  label="Overdue"                value={fmtN(stats.overdue ?? 0)}       accent={stats.overdue > 0 ? RED : MUTED} sub="past deadline" onClick={() => onJump('orders')} />
          <StatTile icon="💬"  label="Unread chats"          value={fmtN(unread)}                   accent={PURPLE} sub="client messages" onClick={() => onJump('messages')} />
          <StatTile icon="⚡"  label="Open offers"           value={fmtN(inq.my_pending_offers ?? 0)} accent={AMBER}  sub="awaiting client decision" onClick={() => onJump('mine')} />
          <StatTile icon="💸"  label="30-day earnings"       value={fmtMoney(stats.transferred30d ?? 0)} accent={GREEN} sub={`${fmtMoney(stats.transferredLifetime ?? 0)} lifetime`} onClick={() => onJump('earnings')} />
          <StatTile icon="⏳"  label="Pending payout"        value={fmtMoney(stats.pendingPayoutFee ?? 0)} accent={AMBER} sub="awaiting release" onClick={() => onJump('earnings')} />
        </div>
      )}

      {/* Role guide */}
      <DashboardGuide role="attorney" />

      <div className="yousafe-mobile-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20 }}>
        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* In motion */}
          {inMotion.length > 0 && (
            <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <SectionHeader eyebrow="Active" title="Orders in motion" action="View all →" onActionClick={() => onJump('orders')} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {inMotion.map(o => (
                  <Card key={o.id} hover style={{
                    padding: '14px 18px', cursor: 'pointer',
                    borderLeft: `4px solid ${o.overdue ? RED : o.status === 'review' ? AMBER : o.status === 'active' ? CYAN : MUTED}`,
                  }} onClick={() => onJump('orders')}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      <Avatar name={o.clientName} src={o.clientAvatar || undefined} size={36} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2, flexWrap: 'wrap' }}>
                          <StatusBadge status={o.status} />
                          {o.status === 'review' && <Badge color="orange" style={{ fontSize: 10 }}>⚠ Awaiting approval</Badge>}
                          {o.overdue && <Badge color="red" style={{ fontSize: 10, fontWeight: 700 }}>⚠ Overdue</Badge>}
                        </div>
                        <div style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 16, color: TEXT, lineHeight: 1.2, letterSpacing: '-.005em' }}>{o.title}</div>
                        <div style={{ fontSize: 11, color: MUTED, fontFamily: MONO, marginTop: 2 }}>with {o.clientName}{o.deadlineAt && <> · due {fmtDateShort(o.deadlineAt)}</>}</div>
                        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ flex: 1, height: 5, background: BORDER2, borderRadius: 999, overflow: 'hidden', maxWidth: 220 }}>
                            <div style={{ width: `${o.progress}%`, height: '100%', background: CYAN }} />
                          </div>
                          <span style={{ fontSize: 11, color: MUTED, fontFamily: MONO }}>{o.progress}%</span>
                        </div>
                      </div>
                      <span style={{ fontFamily: SERIF, fontSize: 18, color: GREEN, fontWeight: 600, flexShrink: 0 }}>{fmtMoney(o.attorneyFee)}</span>
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          )}

          {/* Empty state */}
          {noActivity && (
            <Card style={{ padding: '40px 32px', textAlign: 'center' }}>
              <div style={{ fontSize: 38, marginBottom: 10 }}>🚀</div>
              <div style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 600, color: TEXT, marginBottom: 4 }}>Build your pipeline</div>
              <div style={{ fontSize: 13, color: MUTED, maxWidth: 380, margin: '0 auto 14px' }}>
                Respond to inquiries in the queue to win your first engagement. A sharper profile boosts your conversion when clients compare offers.
              </div>
              <div style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                <Btn variant="primary" size="sm" onClick={() => onJump('queue')}>Open the queue</Btn>
                <Btn variant="secondary" size="sm" onClick={() => onJump('profile')}>Polish profile</Btn>
              </div>
            </Card>
          )}

          {/* Quick actions */}
          <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <SectionHeader eyebrow="Shortcuts" title="Quick actions" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
              <QuickActionTile icon="📥"  label="Inquiry queue"   sub={inq.open ? `${inq.open} open` : 'Inbound demand'} onClick={() => onJump('queue')} accent={CYAN} />
              <QuickActionTile icon="📦"  label="Orders"          sub={stats.active ? `${stats.active} active` : 'Engagements'} onClick={() => onJump('orders')} accent={NAVY} />
              <QuickActionTile icon="💬"  label="Messages"        sub={unread > 0 ? `${unread} unread` : 'All caught up'} onClick={() => onJump('messages')} accent={PURPLE} />
              <QuickActionTile icon="💼"  label="My Office"            sub="Manage your service slots" onClick={() => { if (typeof window !== 'undefined') window.location.href = '/dashboard/gigs' }} accent={AMBER} />
              <QuickActionTile icon="💸"  label="Earnings"        sub={fmtMoney(stats.transferredLifetime ?? 0) + ' lifetime'} onClick={() => onJump('earnings')} accent={GREEN} />
              <QuickActionTile icon="👤"  label="My Profile"      sub="Polish to win more inquiries" onClick={() => onJump('profile')} accent={NAVY} />
            </div>
          </section>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Profile snapshot */}
          {home?.rating && (
            <Card style={{ padding: '14px 18px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: DIM, fontFamily: MONO, marginBottom: 6 }}>Your rating</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontFamily: SERIF, fontSize: 28, fontWeight: 600, color: TEXT }}>★ {home.rating.avg}</span>
                <span style={{ fontSize: 12, color: MUTED }}>{home.rating.count} review{home.rating.count === 1 ? '' : 's'}</span>
              </div>
              <Btn variant="ghost" size="sm" style={{ marginTop: 8 }} onClick={() => onJump('profile')}>Open profile →</Btn>
            </Card>
          )}

          {/* Upcoming deadlines */}
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: `1px solid ${BORDER2}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontFamily: SERIF, fontSize: 16, fontWeight: 600, color: TEXT }}>Upcoming deadlines</div>
              {upcoming.length > 0 && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: `${AMBER}15`, color: AMBER, textTransform: 'uppercase' }}>{upcoming.length}</span>}
            </div>
            <div style={{ padding: '10px 18px 14px' }}>
              {upcoming.length === 0
                ? <div style={{ fontSize: 12, color: MUTED, padding: '8px 0' }}>No upcoming deadlines.</div>
                : upcoming.map(d => {
                    const overdue = d.daysAway < 0
                    const soon = d.daysAway <= 2 && d.daysAway >= 0
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

          {/* Earnings snapshot */}
          {stats.transferredLifetime > 0 && (
            <Card style={{ padding: '14px 18px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: DIM, fontFamily: MONO, marginBottom: 4 }}>Lifetime earnings</div>
              <div style={{ fontFamily: SERIF, fontSize: 24, fontWeight: 600, color: TEXT, lineHeight: 1 }}>{fmtMoney(stats.transferredLifetime)}</div>
              <div style={{ fontSize: 11, color: MUTED, fontFamily: MONO, marginTop: 4 }}>across {fmtN(stats.completed ?? 0)} completed order{stats.completed === 1 ? '' : 's'}</div>
              <Btn variant="ghost" size="sm" style={{ marginTop: 8 }} onClick={() => onJump('earnings')}>Open earnings →</Btn>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
